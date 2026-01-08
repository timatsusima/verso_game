// ============ Game Constants ============
export const QUESTION_TIME_LIMIT = 60; // seconds per question
export const LOCK_TIME_LIMIT = 10; // seconds for second player after first answers
export const COUNTDOWN_BEFORE_START = 3; // seconds countdown before first question
export const QUESTION_RESULT_DISPLAY_TIME = 3; // seconds to show result before next question

// ============ Validation Constants ============
export const MIN_TOPIC_LENGTH = 1;
export const MAX_TOPIC_LENGTH = 200;

// ============ Questions Count Options ============
export const QUESTIONS_COUNT_OPTIONS = [10, 20, 30] as const;

// ============ Error Codes ============
export const ERROR_CODES = {
  // Auth errors
  INVALID_INIT_DATA: 'INVALID_INIT_DATA',
  EXPIRED_INIT_DATA: 'EXPIRED_INIT_DATA',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // Duel errors
  DUEL_NOT_FOUND: 'DUEL_NOT_FOUND',
  DUEL_ALREADY_STARTED: 'DUEL_ALREADY_STARTED',
  DUEL_FULL: 'DUEL_FULL',
  NOT_IN_DUEL: 'NOT_IN_DUEL',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INVALID_ANSWER: 'INVALID_ANSWER',
  QUESTION_TIMEOUT: 'QUESTION_TIMEOUT',
  
  // Generation errors
  INVALID_TOPIC: 'INVALID_TOPIC',
  GENERATION_FAILED: 'GENERATION_FAILED',
  
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

// ============ UI Translations ============
export const TRANSLATIONS = {
  ru: {
    selectLanguage: 'Выберите язык',
    createDuel: 'Создать дуэль',
    topic: 'Тема',
    topicPlaceholder: 'Например: История России, Футбол, Marvel',
    questionsCount: 'Количество вопросов',
    start: 'Начать',
    inviteFriend: 'Пригласить друга',
    copyLink: 'Копировать ссылку',
    linkCopied: 'Ссылка скопирована!',
    waitingForOpponent: 'Ожидание соперника...',
    startDuel: 'Начать дуэль',
    question: 'Вопрос',
    of: 'из',
    timeLeft: 'Осталось времени',
    seconds: 'сек',
    youAnswered: 'Вы ответили',
    opponentAnswered: 'Соперник ответил',
    waiting: 'Ожидание...',
    hurryUp: 'Поторопитесь!',
    correct: 'Правильно!',
    incorrect: 'Неправильно',
    timeout: 'Время вышло',
    results: 'Результаты',
    you: 'Вы',
    opponent: 'Соперник',
    winner: 'Победитель',
    draw: 'Ничья!',
    playAgain: 'Играть снова',
    backToMenu: 'В меню',
    loading: 'Загрузка...',
    error: 'Ошибка',
    tryAgain: 'Попробовать снова',
    share: 'Поделиться',
    victory: 'Победа!',
    defeat: 'Поражение',
  },
  en: {
    selectLanguage: 'Select language',
    createDuel: 'Create Duel',
    topic: 'Topic',
    topicPlaceholder: 'E.g.: World History, Football, Marvel',
    questionsCount: 'Number of questions',
    start: 'Start',
    inviteFriend: 'Invite Friend',
    copyLink: 'Copy Link',
    linkCopied: 'Link copied!',
    waitingForOpponent: 'Waiting for opponent...',
    startDuel: 'Start Duel',
    question: 'Question',
    of: 'of',
    timeLeft: 'Time left',
    seconds: 'sec',
    youAnswered: 'You answered',
    opponentAnswered: 'Opponent answered',
    waiting: 'Waiting...',
    hurryUp: 'Hurry up!',
    correct: 'Correct!',
    incorrect: 'Incorrect',
    timeout: 'Time\'s up',
    results: 'Results',
    you: 'You',
    opponent: 'Opponent',
    winner: 'Winner',
    draw: 'It\'s a draw!',
    playAgain: 'Play Again',
    backToMenu: 'Back to Menu',
    loading: 'Loading...',
    error: 'Error',
    tryAgain: 'Try Again',
    share: 'Share',
    victory: 'Victory!',
    defeat: 'Defeat',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.ru;
