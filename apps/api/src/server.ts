import { createApp } from './app.js';
import { prisma } from '@email-scheduler/db';
import { getSharedRedisConnection } from '@email-scheduler/queue';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : process.env.API_PORT
    ? parseInt(process.env.API_PORT, 10)
    : 10000;

const app = createApp();

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`API service started on port ${PORT} on 0.0.0.0`);
});

// Graceful shutdown handling
const handleShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down API server gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      await prisma.$disconnect();
      logger.info('Database disconnected.');
    } catch (err) {
      logger.error('Error disconnecting database', { error: String(err) });
    }

    try {
      const redis = getSharedRedisConnection();
      await redis.quit();
      logger.info('Redis connection closed.');
    } catch (err) {
      logger.error('Error closing Redis connection', { error: String(err) });
    }

    process.exit(0);
  });

  // Force exit after 10 seconds if shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
