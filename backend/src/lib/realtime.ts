import type { Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import { verifyAccessToken } from './jwt.js';
import { logger } from './logger.js';

/**
 * In-process realtime layer for push-to-client notifications. Socket.IO is
 * the one new dependency this adds — chosen because it's the standard,
 * actively-maintained way to get authenticated, room-targeted WebSocket
 * delivery on Node without hand-rolling the `ws` protocol + reconnection
 * logic ourselves.
 *
 * Single Node process, no Redis adapter: per CLAUDE.md, this app is one
 * Node service / one Postgres / one Redis at this phase, and Socket.IO's
 * default in-memory adapter is correct for that. If the service ever scales
 * horizontally, `@socket.io/redis-adapter` is the documented upgrade path —
 * not needed until then.
 *
 * Auth: the client connects with `{ auth: { token } }` where `token` is the
 * same JWT access token used for `requireAuth` on HTTP routes. On success we
 * join the socket to a room named `user:${userId}` so `emitToUser` can
 * target a single user regardless of how many devices/tabs they have open.
 */

let io: SocketIoServer | null = null;

export function initRealtime(httpServer: HttpServer): SocketIoServer {
  io = new SocketIoServer(httpServer, {
    cors: {
      // Mirrors app.ts's CORS posture: native/mobile clients send no
      // Origin and are unaffected; browser clients are still subject to
      // the transport-level check performed here.
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
    logger.debug({ userId, socketId: socket.id }, 'realtime: client connected');

    socket.on('disconnect', () => {
      logger.debug({ userId, socketId: socket.id }, 'realtime: client disconnected');
    });
  });

  logger.info('realtime layer initialized');
  return io;
}

/**
 * Emit an event to every connected socket for a user. No-ops (with a warn
 * log) if the realtime layer hasn't been initialized yet — e.g. under test,
 * or if a caller runs before server.ts wires this up. Notification
 * persistence must never depend on this succeeding.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) {
    logger.warn({ userId, event }, 'realtime: emitToUser called before initRealtime');
    return;
  }
  io.to(`user:${userId}`).emit(event, payload);
}
