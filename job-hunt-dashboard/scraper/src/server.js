import 'dotenv/config';
import Fastify from 'fastify';
import { initPool, destroyPool } from './browser/pool.js';
import { authMiddleware } from './middleware/auth.js';
import { healthRoutes } from './routes/health.js';
import { scrapeRoutes } from './routes/scrape.js';

const fastify = Fastify({ logger: { level: process.env.LOG_LEVEL } });

fastify.addHook('onRequest', authMiddleware(process.env.SCRAPER_SECRET));

await fastify.register(healthRoutes);
await fastify.register(scrapeRoutes);

await initPool();

const shutdown = async () => {
  await fastify.close();
  await destroyPool();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await fastify.listen({ port: process.env.PORT || 3001, host: '127.0.0.1' });
