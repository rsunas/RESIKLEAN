// Socket.io Service
// Emits real-time events to admin dashboard and collector app
// Authenticated via JWT on connection handshake

const jwt = require('jsonwebtoken');
const User = require('../models/User');

let _io = null;

/**
 * Initialize Socket.io with the HTTP server.
 * Call this once in server.js after creating the http server.
 */
const init = (httpServer) => {
  const { Server } = require('socket.io');
  _io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  // ── Authentication middleware ───────────────────────────────────────────
  // Clients must send their JWT via: socket.handshake.auth.token
  // or via the Authorization header (Bearer <token>).
  _io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: no token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('Authentication error: user not found'));
      }

      // Attach user to the socket for downstream use
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: invalid token'));
    }
  });

  _io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (${socket.user.name})`);
    socket.on('disconnect', () => console.log(`🔌 Socket disconnected: ${socket.id}`));
  });

  return _io;
};

/** Emit an event from anywhere in the app */
const emit = (event, data) => {
  if (_io) _io.emit(event, data);
};

module.exports = { init, emit };
