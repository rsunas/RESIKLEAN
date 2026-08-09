require('dotenv').config();
const http      = require('http');
const app       = require('./app');
const connectDB = require('./config/db');
const socket    = require('./services/socket.service');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  const httpServer = http.createServer(app);
  socket.init(httpServer);

  httpServer.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  );
});
