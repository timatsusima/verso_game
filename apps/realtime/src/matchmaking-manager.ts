import type { Server, Socket } from 'socket.io';
import type { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  InterServerEvents, 
  SocketData,
} from '@tg-duel/shared';
import { prisma } from './prisma.js';
import type { DuelManager } from './duel-manager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface QueuedPlayer {
  socketId: string;
  userId: string;
  userName: string;
  sr: number;
  language: 'ru' | 'en';
  joinedAt: number; // timestamp
}

interface MatchmakingRange {
  min: number;
  max: number;
  expandedAt: number; // timestamp when range was expanded
}

// Matchmaking configuration
const INITIAL_SR_RANGE = 200; // ±200 SR initially
const EXPANDED_RANGE_1 = 400; // ±400 after 12s
const EXPANDED_RANGE_2 = 600; // ±600 after 24s
const EXPAND_INTERVAL = 12000; // 12 seconds
const MATCHMAKING_TIMEOUT = 60000; // 60 seconds

export class MatchmakingManager {
  private io: TypedServer;
  private duelManager: DuelManager | null = null;
  private queues: Map<'ru' | 'en', Map<string, QueuedPlayer>> = new Map();
  private ranges: Map<string, MatchmakingRange> = new Map();

  constructor(io: TypedServer) {
    this.io = io;
    this.queues.set('ru', new Map());
    this.queues.set('en', new Map());

    // Start matchmaking loop
    setInterval(() => this.processMatchmaking(), 2000); // Check every 2 seconds
  }

  /**
   * Set duel manager reference (called after initialization)
   */
  setDuelManager(duelManager: DuelManager): void {
    this.duelManager = duelManager;
  }

  /**
   * Get or create user rating
   */
  private async getUserRating(userId: string): Promise<number> {
    const rating = await prisma.userRating.findUnique({
      where: { userId },
      select: { sr: true },
    });

    return rating?.sr ?? 1000; // Default SR
  }

  /**
   * Join matchmaking queue
   */
  async joinQueue(
    socket: TypedSocket,
    userId: string,
    userName: string,
    language: 'ru' | 'en'
  ): Promise<void> {
    // Prevent duplicate joins
    if (this.isInQueue(userId)) {
      socket.emit('mm:status', {
        state: 'error',
        message: 'Already in queue',
      });
      return;
    }

    const sr = await this.getUserRating(userId);
    const queue = this.queues.get(language)!;

    const player: QueuedPlayer = {
      socketId: socket.id,
      userId,
      userName,
      sr,
      language,
      joinedAt: Date.now(),
    };

    queue.set(userId, player);

    // Initialize SR range
    this.ranges.set(userId, {
      min: Math.max(0, sr - INITIAL_SR_RANGE),
      max: Math.min(30000, sr + INITIAL_SR_RANGE),
      expandedAt: Date.now(),
    });

    console.log(`[Matchmaking] ${userName} (${userId}) joined ${language} queue, SR: ${sr}`);

    // Send initial status
    socket.emit('mm:status', {
      state: 'searching',
      range: {
        min: this.ranges.get(userId)!.min,
        max: this.ranges.get(userId)!.max,
      },
    });

    console.log(`[Matchmaking] Initial range for ${userName}: ${this.ranges.get(userId)!.min}-${this.ranges.get(userId)!.max}`);
  }

  /**
   * Check if player is already in queue
   */
  private isInQueue(userId: string): boolean {
    for (const queue of this.queues.values()) {
      if (queue.has(userId)) return true;
    }
    return false;
  }

  /**
   * Check and expand SR range if needed (called periodically)
   */
  private checkAndExpandRange(userId: string, sr: number, language: 'ru' | 'en'): void {
    const range = this.ranges.get(userId);
    if (!range) return;

    const elapsed = Date.now() - range.expandedAt;
    let expanded = false;

    // Expand to ±400 after 12s
    if (elapsed >= EXPAND_INTERVAL && range.max - range.min < EXPANDED_RANGE_1 * 2) {
      range.min = Math.max(0, sr - EXPANDED_RANGE_1);
      range.max = Math.min(30000, sr + EXPANDED_RANGE_1);
      range.expandedAt = Date.now();
      expanded = true;
      console.log(`[Matchmaking] Expanded range for ${userId} to ±400: ${range.min}-${range.max}`);
    }

    // Expand to ±600 after 24s
    if (elapsed >= EXPAND_INTERVAL * 2 && range.max - range.min < EXPANDED_RANGE_2 * 2) {
      range.min = Math.max(0, sr - EXPANDED_RANGE_2);
      range.max = Math.min(30000, sr + EXPANDED_RANGE_2);
      range.expandedAt = Date.now();
      expanded = true;
      console.log(`[Matchmaking] Expanded range for ${userId} to ±600: ${range.min}-${range.max}`);
    }

    // Notify player if range expanded
    if (expanded) {
      const player = this.queues.get(language)?.get(userId);
      if (player) {
        const socket = this.io.sockets.sockets.get(player.socketId);
        if (socket) {
          socket.emit('mm:status', {
            state: 'searching',
            range: { min: range.min, max: range.max },
          });
        }
      }
    }
  }

  /**
   * Process matchmaking - find pairs
   */
  private async processMatchmaking(): Promise<void> {
    for (const [language, queue] of this.queues.entries()) {
      if (queue.size < 2) {
        if (queue.size > 0) {
          console.log(`[Matchmaking] ${language} queue: ${queue.size} player(s) waiting`);
        }
        continue;
      }

      const players = Array.from(queue.values());
      
      // Check and expand ranges for all players
      for (const player of players) {
        this.checkAndExpandRange(player.userId, player.sr, language);
      }

      // Try to find matches
      for (let i = 0; i < players.length; i++) {
        const player1 = players[i];
        const range1 = this.ranges.get(player1.userId);
        if (!range1) {
          console.log(`[Matchmaking] No range for player ${player1.userId}`);
          continue;
        }

        // Check timeout
        if (Date.now() - player1.joinedAt > MATCHMAKING_TIMEOUT) {
          console.log(`[Matchmaking] Player ${player1.userId} timed out`);
          this.removeFromQueue(player1.userId, language, 'timeout');
          continue;
        }

        // Find compatible opponent
        for (let j = i + 1; j < players.length; j++) {
          const player2 = players[j];
          const range2 = this.ranges.get(player2.userId);
          if (!range2) {
            console.log(`[Matchmaking] No range for player ${player2.userId}`);
            continue;
          }

          // Check if SR ranges overlap
          const rangesOverlap = 
            (player1.sr >= range2.min && player1.sr <= range2.max) ||
            (player2.sr >= range1.min && player2.sr <= range1.max);

          if (rangesOverlap) {
            // Found a match!
            console.log(`[Matchmaking] ✅ Match found: ${player1.userName} (SR: ${player1.sr}, range: ${range1.min}-${range1.max}) vs ${player2.userName} (SR: ${player2.sr}, range: ${range2.min}-${range2.max})`);
            await this.createMatch(player1, player2, language);
            return; // Process one match at a time
          }
        }
      }
    }
  }

  /**
   * Create a ranked duel match
   */
  private async createMatch(
    player1: QueuedPlayer,
    player2: QueuedPlayer,
    language: 'ru' | 'en'
  ): Promise<void> {
    console.log(`[Matchmaking] Match found: ${player1.userName} vs ${player2.userName}`);

    // Remove from queues
    this.queues.get(language)!.delete(player1.userId);
    this.queues.get(language)!.delete(player2.userId);
    this.ranges.delete(player1.userId);
    this.ranges.delete(player2.userId);

    // Create duel in database
    // Use default topic for ranked matches (can be improved later)
    const defaultTopic = language === 'ru' ? 'Общая эрудиция' : 'General Knowledge';
    
    try {
      const duel = await prisma.duel.create({
        data: {
          topic: defaultTopic,
          questionsCount: 10, // Default for ranked
          language,
          difficulty: 'medium', // Default for ranked
          status: 'ready',
          isRanked: true,
          creatorId: player1.userId,
          opponentId: player2.userId,
        },
      });

      // Generate questions (will be done via API call or directly)
      // For now, we'll let the frontend handle question generation
      // when duel starts

      // Notify both players
      const socket1 = this.io.sockets.sockets.get(player1.socketId);
      const socket2 = this.io.sockets.sockets.get(player2.socketId);

      if (socket1) {
        socket1.emit('mm:found', {
          duelId: duel.id,
          opponent: {
            id: player2.userId,
            name: player2.userName,
            sr: player2.sr,
          },
          isRanked: true,
        });
      }

      if (socket2) {
        socket2.emit('mm:found', {
          duelId: duel.id,
          opponent: {
            id: player1.userId,
            name: player1.userName,
            sr: player1.sr,
          },
          isRanked: true,
        });
      }

      console.log(`[Matchmaking] Duel created: ${duel.id}`);
    } catch (error) {
      console.error('[Matchmaking] Failed to create duel:', error);
      
      // Re-add players to queue on error
      this.queues.get(language)!.set(player1.userId, player1);
      this.queues.get(language)!.set(player2.userId, player2);
    }
  }

  /**
   * Remove player from queue
   */
  removeFromQueue(userId: string, language?: 'ru' | 'en', reason?: string): void {
    if (language) {
      this.queues.get(language)?.delete(userId);
    } else {
      // Remove from all queues
      for (const queue of this.queues.values()) {
        queue.delete(userId);
      }
    }
    
    this.ranges.delete(userId);
    
    if (reason) {
      console.log(`[Matchmaking] Removed ${userId} from queue: ${reason}`);
    }
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(socketId: string): void {
    // Find and remove player
    for (const [language, queue] of this.queues.entries()) {
      for (const [userId, player] of queue.entries()) {
        if (player.socketId === socketId) {
          this.removeFromQueue(userId, language, 'disconnect');
          return;
        }
      }
    }
  }

  /**
   * Get queue stats (for debugging)
   */
  getQueueStats(): { ru: number; en: number } {
    return {
      ru: this.queues.get('ru')?.size ?? 0,
      en: this.queues.get('en')?.size ?? 0,
    };
  }
}
