import { create } from 'zustand';
import type { 
  DuelStatus, 
  SanitizedQuestion, 
  QuestionResult, 
  DuelResult 
} from '@tg-duel/shared';

interface Player {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
}

interface DuelState {
  // Duel info
  duelId: string | null;
  topic: string | null;
  questionsCount: number;
  status: DuelStatus | null;
  isRanked: boolean;
  
  // Players
  creator: Player | null;
  opponent: Player | null;
  myPlayerId: string | null;
  
  // Current question
  currentQuestion: SanitizedQuestion | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  
  // Timers
  timeRemaining: number;
  isLocked: boolean;
  lockTimeRemaining: number | null;
  
  // My answer for current question
  myAnswer: number | null;
  hasAnswered: boolean;
  opponentAnswered: boolean;
  
  // Results
  questionResults: QuestionResult[];
  finalResult: DuelResult | null;
  
  // Connection
  isConnected: boolean;
  error: string | null;
  
  // Actions
  setDuelInfo: (info: {
    duelId: string;
    topic: string;
    questionsCount: number;
    status: DuelStatus;
    isRanked?: boolean;
  }) => void;
  setPlayers: (creator: Player, opponent: Player | null, myPlayerId: string) => void;
  setCurrentQuestion: (question: SanitizedQuestion, totalQuestions: number) => void;
  setTimeRemaining: (time: number) => void;
  setLocked: (isLocked: boolean, lockTime: number | null) => void;
  setMyAnswer: (answerIndex: number) => void;
  setOpponentAnswered: (answered: boolean) => void;
  addQuestionResult: (result: QuestionResult) => void;
  setFinalResult: (result: DuelResult) => void;
  setIsRanked: (isRanked: boolean) => void;
  setStatus: (status: DuelStatus) => void;
  updatePlayerScore: (playerId: string, score: number) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  resetQuestion: () => void;
  reset: () => void;
}

const initialState = {
  duelId: null,
  topic: null,
  questionsCount: 10,
  status: null,
  isRanked: false,
  creator: null,
  opponent: null,
  myPlayerId: null,
  currentQuestion: null,
  currentQuestionIndex: 0,
  totalQuestions: 0,
  timeRemaining: 60,
  isLocked: false,
  lockTimeRemaining: null,
  myAnswer: null,
  hasAnswered: false,
  opponentAnswered: false,
  questionResults: [],
  finalResult: null,
  isConnected: false,
  error: null,
};

export const useDuelStore = create<DuelState>((set) => ({
  ...initialState,

  setDuelInfo: (info) =>
    set({
      duelId: info.duelId,
      topic: info.topic,
      questionsCount: info.questionsCount,
      status: info.status,
      isRanked: info.isRanked ?? false,
    }),

  setPlayers: (creator, opponent, myPlayerId) =>
    set({ creator, opponent, myPlayerId }),

  setCurrentQuestion: (question, totalQuestions) =>
    set({
      currentQuestion: question,
      currentQuestionIndex: question.index,
      totalQuestions,
      myAnswer: null,
      hasAnswered: false,
      opponentAnswered: false,
      isLocked: false,
      lockTimeRemaining: null,
      timeRemaining: 60,
    }),

  setTimeRemaining: (time) => set({ timeRemaining: time }),

  setLocked: (isLocked, lockTime) =>
    set({ isLocked, lockTimeRemaining: lockTime }),

  setMyAnswer: (answerIndex) =>
    set({ myAnswer: answerIndex, hasAnswered: true }),

  setOpponentAnswered: (answered) => set({ opponentAnswered: answered }),

  addQuestionResult: (result) =>
    set((state) => ({
      questionResults: [...state.questionResults, result],
    })),

  setFinalResult: (result) => set({ 
    finalResult: result, 
    status: 'finished',
    isRanked: result.isRanked ?? false,
  }),
  
  setIsRanked: (isRanked) => set({ isRanked }),

  setStatus: (status) => set({ status }),

  updatePlayerScore: (role, score) =>
    set((state) => {
      if (role === 'creator' && state.creator) {
        return { creator: { ...state.creator, score } };
      }
      if (role === 'opponent' && state.opponent) {
        return { opponent: { ...state.opponent, score } };
      }
      return {};
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  setError: (error) => set({ error }),

  resetQuestion: () =>
    set({
      myAnswer: null,
      hasAnswered: false,
      opponentAnswered: false,
    }),

  reset: () => set(initialState),
}));
