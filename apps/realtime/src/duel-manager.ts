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
  PlayerAnswerInfo,
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
   * Get display name for a user
   * Priority: firstName || username || "Player N"
   */
  private getDisplayName(user: { firstName: string; username: string | null }, index: number = 1): string {
    return user.firstName || user.username || `Player ${index}`;
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
        creator: {
          select: {
            id: true,
            firstName: true,
            username: true,
          },
        },
        opponent: {
          select: {
            id: true,
            firstName: true,
            username: true,
          },
        },
      },
    });

    if (!duel) return null;

    // For pending duels (matchmaking), pack might not exist yet
    // But we still need to create state so players can join
    const questions: QuestionWithAnswer[] = duel.pack 
      ? JSON.parse(duel.pack.questions)
      : [];

    return {
      duelId: duel.id,
      status: duel.status as DuelStatus,
      topic: duel.topic,
      language: duel.language as 'ru' | 'en',
      questionsCount: duel.questionsCount,
      questions,
      seed: duel.pack?.seed || '',
      commitHash: duel.pack?.commitHash || '',
      
      creator: {
        odId: duel.creatorId,
        odName: this.getDisplayName(duel.creator, 1),
        odSocket: null,
        score: 0,
        answers: new Map(),
      },
      opponent: duel.opponent ? {
        odId: duel.opponentId!,
        odName: this.getDisplayName(duel.opponent, 2),
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
      console.log(`[DuelManager] Loading duel ${duelId} from DB (not in cache)`);
      state = await this.loadDuelFromDb(duelId);
      if (state) {
        this.duels.set(duelId, state);
        console.log(`[DuelManager] Duel ${duelId} loaded and cached`);
      }
    } else {
      console.log(`[DuelManager] Duel ${duelId} found in cache (creator socket: ${state.creator.odSocket}, opponent socket: ${state.opponent?.odSocket})`);
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
          displayName: state.creator.odName, // odName already contains displayName
          score: state.creator.score,
          currentAnswer: null,
          hasAnswered: state.creator.answers.has(state.currentQuestionIndex),
        },
        opponent: state.opponent ? {
          odId: state.opponent.odId,
          odName: state.opponent.odName,
          displayName: state.opponent.odName, // odName already contains displayName
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
    console.log(`[DuelManager] duel:join received from ${userName} (${userId}) for duel ${duelId}, socket: ${socket.id}`);
    
    // Get state from cache (don't reload from DB if already cached)
    // CRITICAL: Check cache first to avoid race condition when both players join simultaneously
    let state = this.duels.get(duelId);
    
    if (!state) {
      console.log(`[DuelManager] Duel ${duelId} not in cache, loading from DB...`);
      const loadedState = await this.loadDuelFromDb(duelId);
      if (!loadedState) {
        console.log(`[DuelManager] Duel ${duelId} not found in DB`);
        socket.emit('error', { code: 'DUEL_NOT_FOUND', message: 'Duel not found' });
        return;
      }
      
      // CRITICAL: Check cache again after loading (another player might have loaded it)
      // Use existing cached state if available, otherwise use newly loaded state
      const existingState = this.duels.get(duelId);
      if (existingState) {
        console.log(`[DuelManager] Duel ${duelId} was cached by another player while loading, using cached state`);
        state = existingState;
      } else {
        this.duels.set(duelId, loadedState);
        state = loadedState;
        console.log(`[DuelManager] Duel ${duelId} loaded and cached`);
      }
    } else {
      console.log(`[DuelManager] Duel ${duelId} found in cache (creator socket: ${state.creator.odSocket}, opponent socket: ${state.opponent?.odSocket})`);
    }

    // Check if user is part of this duel
    const isCreator = state.creator.odId === userId;
    const isOpponent = state.opponent?.odId === userId;

    if (!isCreator && !isOpponent) {
      console.log(`[DuelManager] User ${userId} is not part of duel ${duelId}`);
      socket.emit('error', { code: 'NOT_IN_DUEL', message: 'You are not part of this duel' });
      return;
    }

    // Update socket reference - CRITICAL: use the state from cache directly
    if (isCreator) {
      state.creator.odSocket = socket.id;
      console.log(`[DuelManager] Creator ${userName} joined duel ${duelId}, socket: ${socket.id}`);
      console.log(`[DuelManager] State after creator join - creator socket: ${state.creator.odSocket}, opponent socket: ${state.opponent?.odSocket}`);
    } else if (isOpponent && state.opponent) {
      state.opponent.odSocket = socket.id;
      console.log(`[DuelManager] Opponent ${userName} joined duel ${duelId}, socket: ${socket.id}`);
      console.log(`[DuelManager] State after opponent join - creator socket: ${state.creator.odSocket}, opponent socket: ${state.opponent.odSocket}`);
    }

    // Track player -> duel mapping
    this.playerToDuel.set(userId, duelId);

    // Join socket room
    const roomName = this.getRoomName(duelId);
    socket.join(roomName);
    console.log(`[DuelManager] ${userName} (socket: ${socket.id}) joined room ${roomName}`);

    // Check if both players are joined
    // IMPORTANT: Get state again from cache to ensure we have latest socket references
    const currentState = this.duels.get(duelId);
    if (!currentState) {
      console.error(`[DuelManager] State lost for duel ${duelId}!`);
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Duel state lost' });
      return;
    }

    const bothJoined = currentState.creator.odSocket !== null && 
                       currentState.opponent !== null && 
                       currentState.opponent.odSocket !== null;

    console.log(`[DuelManager] Both players joined: ${bothJoined} (creator socket: ${currentState.creator.odSocket}, opponent socket: ${currentState.opponent?.odSocket})`);

    // Get isRanked from DB for matchmaking duels
    const duelInfo = await prisma.duel.findUnique({
      where: { id: duelId },
      select: { isRanked: true, joinMethod: true },
    });
    const isRanked = duelInfo?.isRanked ?? false;

    // Send joined event (use currentState to ensure latest socket refs)
    const gameState = this.buildGameState(currentState);
    console.log(`[DuelManager] Sending duel:joined to ${userName} (socket: ${socket.id}), status: ${gameState.status}, isRanked: ${isRanked}`);
    socket.emit('duel:joined', {
      duelId,
      state: gameState,
      isRanked,
    });
    console.log(`[DuelManager] ✅ duel:joined sent to ${userName}`);

    // Notify others if this is a reconnection during game
    if (currentState.status === 'in_progress') {
      socket.to(this.getRoomName(duelId)).emit('duel:playerReconnected', {
        playerId: userId,
        playerName: userName,
      });
    }

    // For matchmaking duels: if both joined and no pack exists, generate questions and start
    if (bothJoined && currentState.status === 'pending' && currentState.questions.length === 0) {
      console.log(`[DuelManager] Both players joined matchmaking duel ${duelId}, generating questions...`);
      await this.generateQuestionsAndStart(duelId, currentState);
    }
  }

  /**
   * Generate questions for a matchmaking duel and start it
   */
  private async generateQuestionsAndStart(duelId: string, state: DuelState): Promise<void> {
    try {
      // Generate questions via API
      const apiUrl = process.env.RATING_API_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
      console.log(`[DuelManager] Generating questions for duel ${duelId} via ${apiUrl}/api/duel/${duelId}/generate-questions`);
      
      const response = await fetch(`${apiUrl}/api/duel/${duelId}/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate questions: ${response.status} ${errorText}`);
      }

      console.log(`[DuelManager] Questions generated for duel ${duelId}, reloading state...`);

      // Reload state from DB to get questions
      const updatedState = await this.loadDuelFromDb(duelId);
      if (!updatedState || !updatedState.questions.length) {
        throw new Error('Failed to load generated questions');
      }

      // CRITICAL: Get state from cache (not the parameter) to ensure we update the cached version
      const cachedState = this.duels.get(duelId);
      if (!cachedState) {
        throw new Error('Duel state lost from cache');
      }

      // Update cached state with questions
      cachedState.questions = updatedState.questions;
      cachedState.seed = updatedState.seed;
      cachedState.commitHash = updatedState.commitHash;

      // Update status to ready
      cachedState.status = 'ready';
      await prisma.duel.update({
        where: { id: duelId },
        data: { status: 'ready' },
      });

      console.log(`[DuelManager] ✅ Questions loaded, starting duel ${duelId}...`);

      // Start the duel automatically
      cachedState.status = 'in_progress';
      await prisma.duel.update({
        where: { id: duelId },
        data: { status: 'in_progress', startedAt: new Date() },
      });

      // Notify players in room
      const roomName = this.getRoomName(duelId);
      console.log(`[DuelManager] Emitting duel:starting to room ${roomName}`);
      this.io.to(roomName).emit('duel:starting', {
        startsIn: COUNTDOWN_BEFORE_START,
      });

      console.log(`[DuelManager] ✅ Emitted duel:starting for duel ${duelId}, countdown: ${COUNTDOWN_BEFORE_START}s`);

      // Start first question after countdown
      setTimeout(() => {
        console.log(`[DuelManager] Starting first question for duel ${duelId}`);
        // Use cached state, not parameter
        this.sendQuestion(cachedState);
      }, COUNTDOWN_BEFORE_START * 1000);
    } catch (error) {
      console.error(`[DuelManager] Failed to generate questions and start duel ${duelId}:`, error);
      this.io.to(this.getRoomName(duelId)).emit('error', {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate questions. Please try again.',
      });
    }
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
    
    // If no more questions (OpenAI returned fewer than requested), finish the duel
    if (!question) {
      console.log(`No question at index ${state.currentQuestionIndex}, finishing duel early`);
      this.finishDuel(state);
      return;
    }

    // Reset question state
    state.isLocked = false;
    state.lockTime = null;
    state.firstAnswerPlayerId = null;
    state.questionStartTime = Date.now();

    const deadlineAt = state.questionStartTime + QUESTION_TIME_LIMIT * 1000;

    // Send sanitized question (without correct answer)
    const roomName = this.getRoomName(state.duelId);
    console.log(`[DuelManager] Emitting duel:question to room ${roomName} for question ${state.currentQuestionIndex + 1}`);
    this.io.to(roomName).emit('duel:question', {
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
      startedAt: state.questionStartTime,
      deadlineAt,
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

    const answeredAt = Date.now();
    const isFirst = !state.isLocked;

    // Record answer
    player.answers.set(questionIndex, {
      answerIndex,
      timestamp: answeredAt,
    });

    // Emit playerAnswered event to ALL players in the room
    this.io.to(this.getRoomName(duelId)).emit('duel:playerAnswered', {
      playerId: odId,
      playerName: player.odName,
      answeredAt,
      isFirst,
    });

    // Also emit legacy event for compatibility
    const opponentSocket = isCreator ? state.opponent?.odSocket : state.creator.odSocket;
    if (opponentSocket) {
      this.io.to(opponentSocket).emit('duel:opponentAnswered', { playerId: odId });
    }

    // Check if this is first answer (start lock timer)
    if (!state.isLocked) {
      state.isLocked = true;
      state.lockTime = answeredAt;
      state.firstAnswerPlayerId = odId;

      // Determine who is the second player
      const secondPlayer = isCreator ? state.opponent : state.creator;
      const secondDeadlineAt = answeredAt + LOCK_TIME_LIMIT * 1000;

      // Emit new second timer event
      if (secondPlayer) {
        this.io.to(this.getRoomName(duelId)).emit('duel:secondTimerStarted', {
          firstPlayerId: odId,
          firstPlayerName: player.odName,
          secondPlayerId: secondPlayer.odId,
          secondPlayerName: secondPlayer.odName,
          secondDeadlineAt,
        });
      }

      // Also emit legacy locked event
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
    
    // Safety check: if no question exists, finish the duel
    if (!question) {
      console.log(`No question at index ${state.currentQuestionIndex} in endQuestion, finishing duel`);
      this.finishDuel(state);
      return;
    }
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
    const answerPromises: Promise<unknown>[] = [];
    
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

    // Build perPlayer info for enhanced result
    const perPlayer: PlayerAnswerInfo[] = [
      {
        playerId: state.creator.odId,
        playerName: state.creator.odName,
        picked: creatorAnswer?.answerIndex ?? null,
        isCorrect: creatorCorrect,
        timeMs: creatorAnswer ? creatorAnswer.timestamp - state.questionStartTime : null,
      },
    ];

    if (state.opponent) {
      perPlayer.push({
        playerId: state.opponent.odId,
        playerName: state.opponent.odName,
        picked: opponentAnswer?.answerIndex ?? null,
        isCorrect: opponentCorrect,
        timeMs: opponentAnswer ? opponentAnswer.timestamp - state.questionStartTime : null,
      });
    }

    // Build result
    const result: QuestionResult & { perPlayer: PlayerAnswerInfo[] } = {
      questionIndex: state.currentQuestionIndex,
      correctIndex,
      creatorAnswer: creatorAnswer?.answerIndex ?? null,
      opponentAnswer: opponentAnswer?.answerIndex ?? null,
      creatorCorrect,
      opponentCorrect,
      creatorScore: state.creator.score,
      opponentScore: state.opponent?.score ?? 0,
      perPlayer,
    };

    // Send result
    this.io.to(this.getRoomName(state.duelId)).emit('duel:questionResult', result);

    // Check if duel is finished (use actual questions count)
    const actualQuestionsCount = Math.min(state.questionsCount, state.questions.length);
    const isLastQuestion = state.currentQuestionIndex >= actualQuestionsCount - 1;
    
    if (isLastQuestion) {
      console.log(`Last question (${state.currentQuestionIndex + 1}/${actualQuestionsCount}), finishing duel`);
      setTimeout(() => {
        this.finishDuel(state);
      }, QUESTION_RESULT_DISPLAY_TIME * 1000);
    } else {
      // Next question after delay
      state.currentQuestionIndex++;
      console.log(`Moving to question ${state.currentQuestionIndex + 1}/${actualQuestionsCount}`);
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

    // Get duel from DB to check isRanked
    const duel = await prisma.duel.findUnique({
      where: { id: state.duelId },
      select: { isRanked: true },
    });

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

    // Build full results (use actual questions count, not requested count)
    const results: QuestionResult[] = [];
    let runningCreatorScore = 0;
    let runningOpponentScore = 0;
    const actualQuestionsCount = Math.min(state.questionsCount, state.questions.length);
    
    for (let i = 0; i < actualQuestionsCount; i++) {
      const question = state.questions[i];
      if (!question) break;
      
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
      isRanked: duel?.isRanked ?? false,
    };

    // Send final result
    this.io.to(this.getRoomName(state.duelId)).emit('duel:finished', finalResult);

    // Process rating asynchronously (don't block)
    this.processRating(state, results).catch(err => {
      console.error('Rating processing error:', err);
    });

    // Cleanup
    this.cleanup(state.duelId);
  }

  /**
   * Process rating after duel finishes
   */
  private async processRating(
    state: DuelState,
    questionResults: QuestionResult[]
  ) {
    if (!state.opponent) return;

    // Call rating API endpoint (it will fetch data from DB)
    const apiUrl = process.env.RATING_API_URL || process.env.CORS_ORIGIN || 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl}/api/duel/${state.duelId}/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Rating processed:', data);
        
        // Emit rating update to players
        if (data.rating) {
          this.io.to(this.getRoomName(state.duelId)).emit('duel:ratingUpdated', {
            creator: data.rating.creator,
            opponent: data.rating.opponent,
          });
        }
      }
    } catch (error) {
      console.error('Failed to process rating:', error);
    }
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
