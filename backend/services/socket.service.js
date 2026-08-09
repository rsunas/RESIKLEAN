// Socket.io Service
// Emits real-time events to admin dashboard and collector app
// TODO: implement in real-time sprint

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

  _io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`🔌 Socket disconnected: ${socket.id}`));
  });

  return _io;
};

/** Emit an event from anywhere in the app */
const emit = (event, data) => {
  if (_io) _io.emit(event, data);
};

module.exports = { init, emit };
