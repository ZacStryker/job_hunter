export async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
}
