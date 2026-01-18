'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { useDuelStore } from '@/stores/duel-store';
import type { 
  DuelGameState, 
  SanitizedQuestion, 
  QuestionResult, 
  DuelResult 
} from '@tg-duel/shared';

export function useSocket(duelId: string | null) {
  const token = useAuthStore((state) => state.token);
  const userId = useAuthStore((state) => state.userId);
  const firstName = useAuthStore((state) => state.firstName);
  
  const {
    creator,
    opponent,
    setDuelInfo,
    setPlayers,
    setCurrentQuestion,
    setTimeRemaining,
    setLocked,
    setOpponentAnswered,
    addQuestionResult,
    setFinalResult,
    setStatus,
    setConnected,
    setError,
    updatePlayerScore,
  } = useDuelStore();

  const hasJoined = useRef(false);

  // Handle state update from server
  const handleStateUpdate = useCallback((state: DuelGameState) => {
    setDuelInfo({
      duelId: state.duelId,
      topic: state.topic,
      questionsCount: state.questionsCount,
      status: state.status,
    });

    const creatorName = state.players.creator.displayName || state.players.creator.odName || 'Player 1';
    const opponentName = state.players.opponent 
      ? (state.players.opponent.displayName || state.players.opponent.odName || 'Player 2')
      : null;

    console.log('[useSocket] Updating players:', {
      creator: { id: state.players.creator.odId, name: creatorName, displayName: state.players.creator.displayName, odName: state.players.creator.odName },
      opponent: state.players.opponent ? { id: state.players.opponent.odId, name: opponentName, displayName: state.players.opponent.displayName, odName: state.players.opponent.odName } : null,
    });

    const creator = {
      id: state.players.creator.odId,
      name: creatorName,
      score: state.players.creator.score,
      hasAnswered: state.players.creator.hasAnswered,
    };

    const opponent = state.players.opponent ? {
      id: state.players.opponent.odId,
      name: opponentName!,
      score: state.players.opponent.score,
      hasAnswered: state.players.opponent.hasAnswered,
    } : null;

    setPlayers(creator, opponent, userId || '');
    setTimeRemaining(state.timeRemaining);
    setLocked(state.isLocked, state.lockTimeRemaining);
  }, [setDuelInfo, setPlayers, setTimeRemaining, setLocked, userId]);

  useEffect(() => {
    if (!duelId || !token) return;

    const socket = connectSocket();

    // Connection events
    socket.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
      setError(null);
      
      // Join duel room
      if (!hasJoined.current) {
        socket.emit('duel:join', { duelId, token });
        hasJoined.current = true;
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setError('Connection failed');
      setConnected(false);
    });

    // Game events
    socket.on('error', (data) => {
      console.error('Server error:', data);
      setError(data.message);
    });

    socket.on('duel:joined', (data) => {
      console.log('Joined duel:', data);
      console.log('Duel status:', data.state.status);
      console.log('Is ranked:', data.isRanked);
      handleStateUpdate(data.state);
      // For pending status (matchmaking), we're connected but waiting for questions
      if (data.state.status === 'pending') {
        setConnected(true);
        setStatus('pending');
      }
      // Set isRanked if provided
      if (data.isRanked !== undefined) {
        setDuelInfo({
          duelId: data.duelId,
          topic: data.state.topic,
          questionsCount: data.state.questionsCount,
          status: data.state.status,
          isRanked: data.isRanked,
        });
      }
    });

    socket.on('duel:playerJoined', (data) => {
      console.log('Player joined:', data);
      handleStateUpdate(data.state);
    });

    socket.on('duel:starting', (data) => {
      console.log('Duel starting in:', data.startsIn);
      setStatus('in_progress');
      setConnected(true); // Ensure connected when duel starts
    });

    socket.on('duel:question', (data) => {
      console.log('New question received:', data);
      setCurrentQuestion(data.question, data.totalQuestions);
      setStatus('in_progress'); // Ensure status is in_progress when question arrives
      setConnected(true); // Ensure connected when question arrives
      // Note: player names should already be set from duel:joined, but state will be updated via duel:state if needed
    });

    socket.on('duel:tick', (data) => {
      setTimeRemaining(data.timeRemaining);
      setLocked(data.isLocked, data.lockTimeRemaining);
    });

    socket.on('duel:locked', (data) => {
      console.log('Question locked by:', data.firstPlayerId);
      setLocked(true, data.lockTimeRemaining);
    });

    socket.on('duel:opponentAnswered', (data) => {
      console.log('Opponent answered:', data.playerId);
      setOpponentAnswered(true);
    });

    socket.on('duel:questionResult', (result: QuestionResult) => {
      console.log('Question result:', result);
      addQuestionResult(result);
      // Update scores from result
      if (result.creatorScore !== undefined) {
        updatePlayerScore('creator', result.creatorScore);
      }
      if (result.opponentScore !== undefined) {
        updatePlayerScore('opponent', result.opponentScore);
      }
    });

    socket.on('duel:finished', (result: DuelResult) => {
      console.log('Duel finished:', result);
      console.log('Duel finished - creatorName:', result.creatorName, 'opponentName:', result.opponentName);
      
      setFinalResult(result);
      
      // Update player names from result if provided (preserve existing player data)
      if (result.creatorName || result.opponentName) {
        // Get current players from store to preserve IDs
        const currentCreator = creator;
        const currentOpponent = opponent;
        
        const updatedCreator = {
          id: currentCreator?.id || '',
          name: result.creatorName || currentCreator?.name || 'Player 1',
          score: result.creatorScore,
          hasAnswered: currentCreator?.hasAnswered || false,
        };
        
        const updatedOpponent = result.opponentName ? {
          id: currentOpponent?.id || '',
          name: result.opponentName,
          score: result.opponentScore,
          hasAnswered: currentOpponent?.hasAnswered || false,
        } : null;
        
        setPlayers(updatedCreator, updatedOpponent, userId || '');
      }
      
      // Update isRanked from result
      if (result.isRanked !== undefined) {
        setDuelInfo({
          duelId: result.duelId,
          topic: '', // Will be updated from state
          questionsCount: 10,
          status: 'finished',
          isRanked: result.isRanked,
        });
      }
    });

    socket.on('duel:state', (state: DuelGameState) => {
      handleStateUpdate(state);
    });

    socket.on('duel:playerDisconnected', (data) => {
      console.log('Player disconnected:', data);
    });

    socket.on('duel:playerReconnected', (data) => {
      console.log('Player reconnected:', data);
    });

    socket.on('duel:rematchRequest', (data: { duelId: string; fromPlayerId: string; fromPlayerName: string }) => {
      console.log('Rematch request received:', data);
      // This will be handled in the component
    });

    socket.on('duel:rematchAccepted', (data: { oldDuelId: string; newDuelId: string }) => {
      console.log('Rematch accepted:', data);
      // This will be handled in the component
    });

    socket.on('duel:rematchDeclined', (data: { duelId: string; fromPlayerId: string }) => {
      console.log('Rematch declined:', data);
      // This will be handled in the component
    });

    return () => {
      hasJoined.current = false;
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('error');
      socket.off('duel:joined');
      socket.off('duel:playerJoined');
      socket.off('duel:starting');
      socket.off('duel:question');
      socket.off('duel:tick');
      socket.off('duel:locked');
      socket.off('duel:opponentAnswered');
      socket.off('duel:questionResult');
      socket.off('duel:finished');
      socket.off('duel:state');
      socket.off('duel:playerDisconnected');
      socket.off('duel:playerReconnected');
      disconnectSocket();
    };
  }, [duelId, token, handleStateUpdate, setConnected, setError, setCurrentQuestion, setOpponentAnswered, addQuestionResult, setFinalResult, setStatus, setLocked, setTimeRemaining, updatePlayerScore]);

  const submitAnswer = useCallback((questionIndex: number, answerIndex: number) => {
    const socket = getSocket();
    if (socket.connected && duelId) {
      socket.emit('duel:answer', { duelId, questionIndex, answerIndex });
    }
  }, [duelId]);

  const startDuel = useCallback(() => {
    const socket = getSocket();
    if (socket.connected && duelId) {
      socket.emit('duel:start', { duelId });
    }
  }, [duelId]);

  const requestRematch = useCallback(() => {
    const socket = getSocket();
    if (socket.connected && duelId) {
      socket.emit('duel:rematch', { duelId });
    }
  }, [duelId]);

  const acceptRematch = useCallback(() => {
    const socket = getSocket();
    if (socket.connected && duelId) {
      socket.emit('duel:rematchAccept', { duelId });
    }
  }, [duelId]);

  const declineRematch = useCallback(() => {
    const socket = getSocket();
    if (socket.connected && duelId) {
      socket.emit('duel:rematchDecline', { duelId });
    }
  }, [duelId]);

  const syncState = useCallback(() => {
    const socket = getSocket();
    if (socket.connected && duelId) {
      socket.emit('duel:sync', { duelId });
    }
  }, [duelId]);

  // Get current socket for direct event listening
  const socket = duelId && token ? getSocket() : null;

  return {
    socket,
    submitAnswer,
    startDuel,
    syncState,
    requestRematch,
    acceptRematch,
    declineRematch,
  };
}
