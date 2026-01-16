import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type { 
  ClientToServerEvents, 
  ServerToClientEvents, 
  InterServerEvents, 
  SocketData 
} from '@tg-duel/shared';
import { DuelManager } from './duel-manager.js';
import { MatchmakingManager } from './matchmaking-manager.js';
import { verifyToken } from './auth.js';

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Create HTTP server
const httpServer = createServer((req, res) => {
  // Simple health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  res.writeHead(404);
  res.end();
});

// Create Socket.IO server
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: CORS_ORIGIN.split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Initialize managers
const duelManager = new DuelManager(io);
const matchmakingManager = new MatchmakingManager(io);
matchmakingManager.setDuelManager(duelManager);

// Socket.IO connection handler
io.on('connection', async (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle duel join
  socket.on('duel:join', async ({ duelId, token }) => {
    try {
      // Verify token
      const payload = await verifyToken(token);
      if (!payload) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid token' });
        return;
      }

      // Store user data in socket
      socket.data.userId = payload.userId;
      socket.data.username = payload.firstName;
      socket.data.language = payload.language;

      // Join the duel
      await duelManager.joinDuel(socket, duelId, payload.userId, payload.firstName);
    } catch (error) {
      console.error('Join error:', error);
      socket.emit('error', { 
        code: 'INTERNAL_ERROR', 
        message: 'Failed to join duel' 
      });
    }
  });

  // Handle duel start
  socket.on('duel:start', async ({ duelId }) => {
    try {
      if (!socket.data.userId) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
        return;
      }

      await duelManager.startDuel(duelId, socket.data.userId);
    } catch (error) {
      console.error('Start error:', error);
      socket.emit('error', { 
        code: 'INTERNAL_ERROR', 
        message: 'Failed to start duel' 
      });
    }
  });

  // Handle answer submission
  socket.on('duel:answer', async ({ duelId, questionIndex, answerIndex }) => {
    try {
      if (!socket.data.userId) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
        return;
      }

      await duelManager.submitAnswer(
        duelId, 
        socket.data.userId, 
        questionIndex, 
        answerIndex
      );
    } catch (error) {
      console.error('Answer error:', error);
      socket.emit('error', { 
        code: 'INTERNAL_ERROR', 
        message: 'Failed to submit answer' 
      });
    }
  });

  // Handle state sync request
  socket.on('duel:sync', async ({ duelId }) => {
    try {
      if (!socket.data.userId) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
        return;
      }

      await duelManager.syncState(socket, duelId);
    } catch (error) {
      console.error('Sync error:', error);
    }
  });

  // Handle matchmaking join
  socket.on('mm:join', async ({ language, token }) => {
    try {
      // Verify token if provided
      if (token) {
        const payload = await verifyToken(token);
        if (!payload) {
          socket.emit('error', { code: 'UNAUTHORIZED', message: 'Invalid token' });
          return;
        }

        // Store user data in socket
        socket.data.userId = payload.userId;
        socket.data.username = payload.firstName;
        socket.data.language = payload.language;
      }

      if (!socket.data.userId || !socket.data.username) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
        return;
      }

      console.log(`[Matchmaking] User ${socket.data.username} (${socket.data.userId}) joining ${language} queue`);

      await matchmakingManager.joinQueue(
        socket,
        socket.data.userId,
        socket.data.username,
        language
      );
    } catch (error) {
      console.error('Matchmaking join error:', error);
      socket.emit('mm:status', {
        state: 'error',
        message: 'Failed to join matchmaking',
      });
    }
  });

  // Handle matchmaking cancel
  socket.on('mm:cancel', () => {
    if (socket.data.userId) {
      matchmakingManager.removeFromQueue(socket.data.userId, undefined, 'cancelled');
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (socket.data.userId) {
      duelManager.handleDisconnect(socket.data.userId);
      matchmakingManager.handleDisconnect(socket.id);
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Realtime server running on port ${PORT}`);
  console.log(`   CORS origin: ${CORS_ORIGIN}`);
});
