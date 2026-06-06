require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { query } = require('./db/index');
const { runMigrations } = require('./db/migrations');
const liveEvents = require('./websocket/liveEvents');
const scanner = require('./engine/scanner');
const priceTracker = require('./engine/priceTracker');
const jobs = require('./scheduler/jobs');
const logger = require('./utils/logger');

const tokensRouter = require('./routes/tokens');
const tradesRouter = require('./routes/trades');
const analyticsRouter = require('./routes/analytics');
const settingsRouter = require('./routes/settings');

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function loadSettings() {
  const result = await query('SELECT key, value FROM settings');
  const settings = {};
  for (const row of result.rows) settings[row.key] = row.value;
  return settings;
}

async function bootstrap() {
  // ── Step 1: Run PostgreSQL migrations (creates DB file + tables)
  logger.info('Initializing PostgreSQL database...');
  await runMigrations();
  logger.info('Database ready ✓');

  // ── Step 2: Load settings from DB
  logger.info('Loading settings from DB...');
  const settings = await loadSettings();
  logger.info('Settings loaded ✓', { count: Object.keys(settings).length });

  // ── Step 3: Set settings in engine modules
  scanner.setSettings(settings);
  priceTracker.setSettings(settings);

  // ── Step 4: Load seen token addresses into memory
  logger.info('Loading seen token addresses...');
  await scanner.initSeenAddresses();

  // ── Step 5: Create Express app
  const app = express();
  const httpServer = http.createServer(app);

  // ── Step 6: Start WebSocket server
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  liveEvents.init(io);

  io.on('connection', (socket) => {
    logger.info('Client connected', { id: socket.id });
    socket.emit('scanner_status', scanner.getStatus());

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { id: socket.id });
    });
  });

  // ── Middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', db: 'postgres', timestamp: new Date().toISOString() }));

  // ── API routes
  app.use('/api/tokens', tokensRouter);
  app.use('/api/trades', tradesRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/settings', settingsRouter);

  // ── Step 7: Start scheduled jobs (price tracker 60s, scanner 30s, cron)
  jobs.startJobs(settings);

  // ── Step 8: Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info('══════════════════════════════════════════════');
    logger.info('  SolSniper Backend Running  (PostgreSQL mode)');
    logger.info(`  API:       http://localhost:${PORT}`);
    logger.info(`  WebSocket: ws://localhost:${PORT}`);
    logger.info('  Scanner:   running. Watching Solana pairs.');
    logger.info('══════════════════════════════════════════════');
  });

  // ── Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    jobs.stopJobs();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(err => {
  logger.error('Bootstrap failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
