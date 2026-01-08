import type { 
  DuelGameState, 
  SanitizedQuestion, 
  QuestionResult, 
  DuelResult,
  Language 
} from './types.js';

// ============ Client -> Server Events ============
export interface ClientToServerEvents {
  // Join a duel room
  'duel:join': (data: { duelId: string; token: string }) => void;
  
  // Creator starts the duel (when both players ready)
  'duel:start': (data: { duelId: string }) => void;
  
  // Player submits answer
  'duel:answer': (data: { 
    duelId: string; 
    questionIndex: number; 
    answerIndex: number; 
  }) => void;
  
  // Player requests current state (reconnection)
  'duel:sync': (data: { duelId: string }) => void;
}

// ============ Server -> Client Events ============
export interface ServerToClientEvents {
  // Error occurred
  'error': (data: { code: string; message: string }) => void;
  
  // Successfully joined duel
  'duel:joined': (data: { 
    duelId: string;
    state: DuelGameState;
  }) => void;
  
  // Another player joined
  'duel:playerJoined': (data: {
    playerId: string;
    playerName: string;
    state: DuelGameState;
  }) => void;
  
  // Duel is starting (countdown)
  'duel:starting': (data: {
    startsIn: number; // seconds
  }) => void;
  
  // New question revealed
  'duel:question': (data: {
    question: SanitizedQuestion;
    timeLimit: number; // 60 seconds
    questionNumber: number; // 1-based for display
    totalQuestions: number;
  }) => void;
  
  // Timer tick (every second)
  'duel:tick': (data: {
    timeRemaining: number;
    isLocked: boolean;
    lockTimeRemaining: number | null;
  }) => void;
  
  // First player answered, 10s countdown starts
  'duel:locked': (data: {
    firstPlayerId: string;
    lockTimeRemaining: number; // 10 seconds
  }) => void;
  
  // Opponent answered (but not revealing which answer)
  'duel:opponentAnswered': (data: {
    playerId: string;
  }) => void;
  
  // Question time ended, reveal result
  'duel:questionResult': (data: QuestionResult) => void;
  
  // Duel finished, reveal all answers and winner
  'duel:finished': (data: DuelResult) => void;
  
  // State sync (for reconnection)
  'duel:state': (data: DuelGameState) => void;
  
  // Player disconnected
  'duel:playerDisconnected': (data: {
    playerId: string;
    playerName: string;
  }) => void;
  
  // Player reconnected
  'duel:playerReconnected': (data: {
    playerId: string;
    playerName: string;
  }) => void;
}

// ============ Inter-Server Events (reserved) ============
export interface InterServerEvents {
  ping: () => void;
}

// ============ Socket Data ============
export interface SocketData {
  userId: string;
  username: string;
  language: Language;
}
