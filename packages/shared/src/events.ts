import type { 
  DuelGameState, 
  SanitizedQuestion, 
  QuestionResult, 
  DuelResult,
  Language 
} from './types.js';

// ============ Duel Player Answer Info ============
export interface PlayerAnswerInfo {
  playerId: string;
  playerName: string;
  picked: number | null; // 0-3 or null if timeout
  isCorrect: boolean;
  timeMs: number | null; // Response time in ms, null if no answer
}

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
    startedAt: number; // ms epoch
    deadlineAt: number; // startedAt + 60s
  }) => void;
  
  // Timer tick (every second)
  'duel:tick': (data: {
    timeRemaining: number;
    isLocked: boolean;
    lockTimeRemaining: number | null;
  }) => void;
  
  // Player answered (sent to both players)
  'duel:playerAnswered': (data: {
    playerId: string;
    playerName: string;
    answeredAt: number; // ms epoch
    isFirst: boolean;
  }) => void;
  
  // First player answered, 10s countdown starts for second player
  'duel:secondTimerStarted': (data: {
    firstPlayerId: string;
    firstPlayerName: string;
    secondPlayerId: string;
    secondPlayerName: string;
    secondDeadlineAt: number; // ms epoch
  }) => void;
  
  // Legacy event - kept for compatibility
  'duel:locked': (data: {
    firstPlayerId: string;
    lockTimeRemaining: number; // 10 seconds
  }) => void;
  
  // Opponent answered (but not revealing which answer) - legacy
  'duel:opponentAnswered': (data: {
    playerId: string;
  }) => void;
  
  // Question time ended, reveal result with timing info
  'duel:questionResult': (data: QuestionResult & {
    perPlayer: PlayerAnswerInfo[];
  }) => void;
  
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
