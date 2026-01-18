// ============ User ============
export interface User {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  language: Language;
  createdAt: Date;
  updatedAt: Date;
}

export type Language = 'ru' | 'en';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

// ============ Question ============
export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string]; // A, B, C, D
  imageSearchQuery: string | null; // For future image search integration
  imageUrl: string | null; // Resolved URL (null in MVP)
}

// Full question with answer (server-side only)
export interface QuestionWithAnswer extends Question {
  correctIndex: 0 | 1 | 2 | 3; // Index of correct option
}

// Sanitized question for client (no correct answer)
export interface SanitizedQuestion extends Question {
  index: number; // Position in quiz (0-based)
}

// ============ Duel ============
export type DuelStatus = 
  | 'waiting'      // Waiting for second player
  | 'pending'      // Matchmaking: duel created, waiting for both players to join
  | 'ready'        // Both players joined, waiting to start
  | 'in_progress'  // Quiz is running
  | 'finished';    // Quiz completed

export interface Duel {
  id: string;
  topic: string;
  questionsCount: 10 | 20 | 30;
  language: Language;
  status: DuelStatus;
  creatorId: string;
  opponentId: string | null;
  winnerId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface DuelPack {
  id: string;
  duelId: string;
  questions: QuestionWithAnswer[];
  seed: string; // For commit-reveal verification
  commitHash: string; // Hash of seed + answers
}

export interface DuelAnswer {
  id: string;
  duelId: string;
  playerId: string;
  questionIndex: number;
  answerIndex: number | null; // null = timeout
  isCorrect: boolean;
  answeredAt: Date;
  responseTimeMs: number;
}

// ============ Game State ============
export interface PlayerScore {
  odId: string;
  odName: string;
  displayName: string; // Guaranteed display name: firstName || username || "Player N"
  score: number;
  currentAnswer: number | null; // Current question answer
  hasAnswered: boolean;
}

export interface DuelGameState {
  duelId: string;
  status: DuelStatus;
  topic: string;
  language: Language;
  questionsCount: number;
  currentQuestionIndex: number;
  players: {
    creator: PlayerScore;
    opponent: PlayerScore | null;
  };
  timeRemaining: number; // Seconds remaining for current question
  isLocked: boolean; // True when first player answered, 10s countdown started
  lockTimeRemaining: number | null; // 10s countdown after first answer
}

// ============ API Types ============
export interface CreateDuelRequest {
  topic: string;
  questionsCount: 10 | 20 | 30;
  language: Language;
  difficulty: DifficultyLevel;
}

export interface CreateDuelResponse {
  duelId: string;
  inviteLink: string;
}

export interface DuelStateResponse {
  duel: {
    id: string;
    topic: string;
    questionsCount: number;
    language: Language;
    status: DuelStatus;
    creatorId: string;
    opponentId: string | null;
  };
  questions: SanitizedQuestion[];
  packCommit: string; // For verification after game ends
}

export interface AuthTelegramRequest {
  initData: string;
}

export interface AuthTelegramResponse {
  token: string;
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string;
    language: Language;
  };
}

// ============ Results ============
export interface QuestionResult {
  questionIndex: number;
  correctIndex: number;
  creatorAnswer: number | null;
  opponentAnswer: number | null;
  creatorCorrect: boolean;
  opponentCorrect: boolean;
  creatorScore: number;
  opponentScore: number;
}

export interface DuelResult {
  duelId: string;
  creatorScore: number;
  opponentScore: number;
  winnerId: string | null; // null = draw
  seed: string;
  results: QuestionResult[];
  isRanked?: boolean; // Whether this duel affects rating
}
