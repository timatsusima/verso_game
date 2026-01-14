import type { Server, Socket } from 'socket.io';
import type { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  InterServerEvents, 
  SocketData,
  QuestionWithAnswer,
  DuelGameState,
  QuestionResult,
  DuelResult,
  DuelStatus,
} from '@tg-duel/shared';
import { 
  QUESTION_TIME_LIMIT, 
  LOCK_TIME_LIMIT, 
  COUNTDOWN_BEFORE_START,
  QUESTION_RESULT_DISPLAY_TIME,
} from '@tg-duel/shared';
import { prisma } from './prisma.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface PlayerState {
  odId: string;
  odName: string;
  odSocket: string | null;
  score: number;
  answers: Map<number, { answerIndex: number; timestamp: number }>;
}

interface DuelState {
  duelId: string;
  status: DuelStatus;
  topic: string;
  language: 'ru' | 'en';
  questionsCount: number;
  questions: QuestionWithAnswer[];
  seed: string;
  commitHash: string;
  
  creator: PlayerState;
  opponent: PlayerState | null;
  
  currentQuestionIndex: number;
  questionStartTime: number;
  timerInterval: NodeJS.Timeout | null;
  
  isLocked: boolean;
  lockTime: number | null;
  firstAnswerPlayerId: string | null;
}

export class DuelManager {
  private io: TypedServer;
  private duels: Map<string, DuelState> = new Map();
  private playerToDuel: Map<string, string> = new Map();

  constructor(io: TypedServer) {
    this.io = io;
  }

  /**
   * Get room name for a duel
   */
  private getRoomName(duelId: string): string {
    return `duel:${duelId}`;
  }

  /**
   * Load duel data from database
   */
  private async loadDuelFromDb(duelId: string): Promise<DuelState | null> {
    const duel = await prisma.duel.findUnique({
      where: { id: duelId },
      include: {
        pack: true,
        creator: true,
        opponent: true,
      },
    });

    if (!duel || !duel.pack) return null;

    const questions: QuestionWithAnswer[] = JSON.parse(duel.pack.questions);

    return {
      duelId: duel.id,
      status: duel.status as DuelStatus,
      topic: duel.topic,
      language: duel.language as 'ru' | 'en',
      questionsCount: duel.questionsCount,
      questions,
      seed: duel.pack.seed,
      commitHash: duel.pack.commitHash,
      
      creator: {
        odId: duel.creatorId,
        odName: duel.creator.firstName,
        odSocket: null,
        score: 0,
        answers: new Map(),
      },
      opponent: duel.opponent ? {
        odId: duel.opponentId!,
        odName: duel.opponent.firstName,
        odSocket: null,
        score: 0,
        answers: new Map(),
      } : null,
      
      currentQuestionIndex: 0,
      questionStartTime: 0,
      timerInterval: null,
      
      isLocked: false,
      lockTime: null,
      firstAnswerPlayerId: null,
    };
  }

  /**
   * Get or create duel state
   */
  private async getDuelState(duelId: string): Promise<DuelState | null> {
    let state = this.duels.get(duelId) ?? null;
    
    if (!state) {
      state = await this.loadDuelFromDb(duelId);
      if (state) {
        this.duels.set(duelId, state);
      }
    }
    
    return state ?? null;
  }

  /**
   * Build game state for client
   */
  private buildGameState(state: DuelState): DuelGameState {
    const timeElapsed = state.questionStartTime 
      ? Math.floor((Date.now() - state.questionStartTime) / 1000)
      : 0;
    const timeRemaining = Math.max(0, QUESTION_TIME_LIMIT - timeElapsed);
    
    let lockTimeRemaining: number | null = null;
    if (state.isLocked && state.lockTime) {
      const lockElapsed = Math.floor((Date.now() - state.lockTime) / 1000);
      lockTimeRemaining = Math.max(0, LOCK_TIME_LIMIT - lockElapsed);
    }

    return {
      duelId: state.duelId,
      status: state.status,
      topic: state.topic,
      language: state.language,
      questionsCount: state.questionsCount,
      currentQuestionIndex: state.currentQuestionIndex,
      players: {
        creator: {
          odId: state.creator.odId,
          odName: state.creator.odName,
          score: state.creator.score,
          currentAnswer: null,
          hasAnswered: state.creator.answers.has(state.currentQuestionIndex),
        },
        opponent: state.opponent ? {
          odId: state.opponent.odId,
          odName: state.opponent.odName,
          score: state.opponent.score,
          currentAnswer: null,
          hasAnswered: state.opponent.answers.has(state.currentQuestionIndex),
        } : null,
      },
      timeRemaining,
      isLocked: state.isLocked,
      lockTimeRemaining,
    };
  }

  /**
   * Join a duel
   */
  async joinDuel(socket: TypedSocket, duelId: string, userId: string, userName: string) {
    const state = await this.getDuelState(duelId);
    
    if (!state) {
      socket.emit('error', { code: 'DUEL_NOT_FOUND', message: 'Duel not found' });
      return;
    }

    // Check if user is part of this duel
    const isCreator = state.creator.odId === userId;
    const isOpponent = state.opponent?.odId === userId;

    if (!isCreator && !isOpponent) {
      socket.emit('error', { code: 'NOT_IN_DUEL', message: 'You are not part of this duel' });
      return;
    }

    // Update socket reference
    if (isCreator) {
      state.creator.odSocket = socket.id;
    } else if (isOpponent && state.opponent) {
      state.opponent.odSocket = socket.id;
    }

    // Track player -> duel mapping
    this.playerToDuel.set(userId, duelId);

    // Join socket room
    socket.join(this.getRoomName(duelId));

    // Send joined event
    socket.emit('duel:joined', {
      duelId,
      state: this.buildGameState(state),
    });

    // Notify others if this is a reconnection during game
    if (state.status === 'in_progress') {
      socket.to(this.getRoomName(duelId)).emit('duel:playerReconnected', {
        playerId: userId,
        playerName: userName,
      });
    }

    console.log(`Player ${userName} (${userId}) joined duel ${duelId}`);
  }

  /**
   * Start a duel
   */
  async startDuel(duelId: string, userId: string) {
    const state = await this.getDuelState(duelId);
    
    if (!state) return;

    // Only creator can start
    if (state.creator.odId !== userId) {
      return;
    }

    // Must be in ready state with opponent
    if (state.status !== 'ready' || !state.opponent) {
      return;
    }

    // Update status
    state.status = 'in_progress';
    
    // Update in database
    await prisma.duel.update({
      where: { id: duelId },
      data: { status: 'in_progress', startedAt: new Date() },
    });

    // Notify players
    this.io.to(this.getRoomName(duelId)).emit('duel:starting', {
      startsIn: COUNTDOWN_BEFORE_START,
    });

    // Start first question after countdown
    setTimeout(() => {
      this.sendQuestion(state);
    }, COUNTDOWN_BEFORE_START * 1000);
  }

  /**
   * Send current question to players
   */
  private sendQuestion(state: DuelState) {
    const question = state.questions[state.currentQuestionIndex];
    if (!question) return;

    // Reset question state
    state.isLocked = false;
    state.lockTime = null;
    state.firstAnswerPlayerId = null;
    state.questionStartTime = Date.now();

    // Send sanitized question (without correct answer)
    this.io.to(this.getRoomName(state.duelId)).emit('duel:question', {
      question: {
        id: question.id,
        index: state.currentQuestionIndex,
        text: question.text,
        options: question.options,
        imageSearchQuery: question.imageSearchQuery,
        imageUrl: question.imageUrl,
      },
      timeLimit: QUESTION_TIME_LIMIT,
      questionNumber: state.currentQuestionIndex + 1,
      totalQuestions: state.questionsCount,
    });

    // Start timer
    this.startQuestionTimer(state);
  }

  /**
   * Start question timer
   */
  private startQuestionTimer(state: DuelState) {
    // Clear existing timer
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    state.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.questionStartTime) / 1000);
      const timeRemaining = Math.max(0, QUESTION_TIME_LIMIT - elapsed);
      
      let lockTimeRemaining: number | null = null;
      if (state.isLocked && state.lockTime) {
        const lockElapsed = Math.floor((Date.now() - state.lockTime) / 1000);
        lockTimeRemaining = Math.max(0, LOCK_TIME_LIMIT - lockElapsed);
        
        // Check if lock time expired
        if (lockTimeRemaining <= 0) {
          this.endQuestion(state);
          return;
        }
      }

      // Send tick
      this.io.to(this.getRoomName(state.duelId)).emit('duel:tick', {
        timeRemaining,
        isLocked: state.isLocked,
        lockTimeRemaining,
      });

      // Check if main timer expired
      if (timeRemaining <= 0 && !state.isLocked) {
        this.endQuestion(state);
      }
    }, 1000);
  }

  /**
   * Submit an answer
   */
  async submitAnswer(duelId: string, odId: string, questionIndex: number, answerIndex: number) {
    const state = await this.getDuelState(duelId);
    if (!state || state.status !== 'in_progress') return;

    // Validate question index
    if (questionIndex !== state.currentQuestionIndex) return;

    // Get player
    const isCreator = state.creator.odId === odId;
    const player = isCreator ? state.creator : state.opponent;
    if (!player) return;

    // Check if already answered
    if (player.answers.has(questionIndex)) return;

    // Record answer
    player.answers.set(questionIndex, {
      answerIndex,
      timestamp: Date.now(),
    });

    // Notify opponent that this player answered
    const opponentSocket = isCreator ? state.opponent?.odSocket : state.creator.odSocket;
    if (opponentSocket) {
      this.io.to(opponentSocket).emit('duel:opponentAnswered', { playerId: odId });
    }

    // Check if this is first answer (start lock timer)
    if (!state.isLocked) {
      state.isLocked = true;
      state.lockTime = Date.now();
      state.firstAnswerPlayerId = odId;

      this.io.to(this.getRoomName(duelId)).emit('duel:locked', {
        firstPlayerId: odId,
        lockTimeRemaining: LOCK_TIME_LIMIT,
      });
    }

    // Check if both answered
    const creatorAnswered = state.creator.answers.has(questionIndex);
    const opponentAnswered = state.opponent?.answers.has(questionIndex) ?? false;

    if (creatorAnswered && opponentAnswered) {
      this.endQuestion(state);
    }
  }

  /**
   * End current question and show results
   */
  private async endQuestion(state: DuelState) {
    // Clear timer
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    const question = state.questions[state.currentQuestionIndex];
    const correctIndex = question.correctIndex;

    // Get answers
    const creatorAnswer = state.creator.answers.get(state.currentQuestionIndex);
    const opponentAnswer = state.opponent?.answers.get(state.currentQuestionIndex);

    // Calculate correctness
    const creatorCorrect = creatorAnswer?.answerIndex === correctIndex;
    const opponentCorrect = opponentAnswer?.answerIndex === correctIndex;

    // Update scores
    if (creatorCorrect) state.creator.score++;
    if (opponentCorrect && state.opponent) state.opponent.score++;

    // Save answers to database
    const answerPromises: Promise<any>[] = [];
    
    if (creatorAnswer) {
      answerPromises.push(
        prisma.duelAnswer.create({
          data: {
            duelId: state.duelId,
            playerId: state.creator.odId,
            questionIndex: state.currentQuestionIndex,
            answerIndex: creatorAnswer.answerIndex,
            isCorrect: creatorCorrect,
            responseTimeMs: creatorAnswer.timestamp - state.questionStartTime,
          },
        })
      );
    }

    if (opponentAnswer && state.opponent) {
      answerPromises.push(
        prisma.duelAnswer.create({
          data: {
            duelId: state.duelId,
            playerId: state.opponent.odId,
            questionIndex: state.currentQuestionIndex,
            answerIndex: opponentAnswer.answerIndex,
            isCorrect: opponentCorrect,
            responseTimeMs: opponentAnswer.timestamp - state.questionStartTime,
          },
        })
      );
    }

    await Promise.all(answerPromises);

    // Build result
    const result: QuestionResult = {
      questionIndex: state.currentQuestionIndex,
      correctIndex,
      creatorAnswer: creatorAnswer?.answerIndex ?? null,
      opponentAnswer: opponentAnswer?.answerIndex ?? null,
      creatorCorrect,
      opponentCorrect,
      creatorScore: state.creator.score,
      opponentScore: state.opponent?.score ?? 0,
    };

    // Send result
    this.io.to(this.getRoomName(state.duelId)).emit('duel:questionResult', result);

    // Check if duel is finished
    if (state.currentQuestionIndex >= state.questionsCount - 1) {
      setTimeout(() => {
        this.finishDuel(state);
      }, QUESTION_RESULT_DISPLAY_TIME * 1000);
    } else {
      // Next question after delay
      state.currentQuestionIndex++;
      setTimeout(() => {
        this.sendQuestion(state);
      }, QUESTION_RESULT_DISPLAY_TIME * 1000);
    }
  }

  /**
   * Finish the duel
   */
  private async finishDuel(state: DuelState) {
    state.status = 'finished';

    // Determine winner
    let winnerId: string | null = null;
    if (state.creator.score > (state.opponent?.score ?? 0)) {
      winnerId = state.creator.odId;
    } else if ((state.opponent?.score ?? 0) > state.creator.score) {
      winnerId = state.opponent!.odId;
    }
    // null = draw

    // Update database
    await prisma.duel.update({
      where: { id: state.duelId },
      data: {
        status: 'finished',
        winnerId,
        finishedAt: new Date(),
      },
    });

    // Build full results
    const results: QuestionResult[] = [];
    let runningCreatorScore = 0;
    let runningOpponentScore = 0;
    
    for (let i = 0; i < state.questionsCount; i++) {
      const question = state.questions[i];
      const creatorAnswer = state.creator.answers.get(i);
      const opponentAnswer = state.opponent?.answers.get(i);
      
      const creatorCorrect = creatorAnswer?.answerIndex === question.correctIndex;
      const opponentCorrect = opponentAnswer?.answerIndex === question.correctIndex;
      
      if (creatorCorrect) runningCreatorScore++;
      if (opponentCorrect) runningOpponentScore++;

      results.push({
        questionIndex: i,
        correctIndex: question.correctIndex,
        creatorAnswer: creatorAnswer?.answerIndex ?? null,
        opponentAnswer: opponentAnswer?.answerIndex ?? null,
        creatorCorrect,
        opponentCorrect,
        creatorScore: runningCreatorScore,
        opponentScore: runningOpponentScore,
      });
    }

    const finalResult: DuelResult = {
      duelId: state.duelId,
      creatorScore: state.creator.score,
      opponentScore: state.opponent?.score ?? 0,
      winnerId,
      seed: state.seed,
      results,
    };

    // Send final result
    this.io.to(this.getRoomName(state.duelId)).emit('duel:finished', finalResult);

    // Cleanup
    this.cleanup(state.duelId);
  }

  /**
   * Sync state for reconnecting player
   */
  async syncState(socket: TypedSocket, duelId: string) {
    const state = await this.getDuelState(duelId);
    if (!state) return;

    socket.emit('duel:state', this.buildGameState(state));
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(odId: string) {
    const duelId = this.playerToDuel.get(odId);
    if (!duelId) return;

    const state = this.duels.get(duelId);
    if (!state) return;

    // Get player name
    let playerName = 'Unknown';
    if (state.creator.odId === odId) {
      playerName = state.creator.odName;
      state.creator.odSocket = null;
    } else if (state.opponent?.odId === odId) {
      playerName = state.opponent.odName;
      state.opponent.odSocket = null;
    }

    // Notify others
    this.io.to(this.getRoomName(duelId)).emit('duel:playerDisconnected', {
      playerId: odId,
      playerName,
    });
  }

  /**
   * Cleanup duel state
   */
  private cleanup(duelId: string) {
    const state = this.duels.get(duelId);
    if (state?.timerInterval) {
      clearInterval(state.timerInterval);
    }

    // Remove player mappings
    if (state) {
      this.playerToDuel.delete(state.creator.odId);
      if (state.opponent) {
        this.playerToDuel.delete(state.opponent.odId);
      }
    }

    this.duels.delete(duelId);
  }
}
