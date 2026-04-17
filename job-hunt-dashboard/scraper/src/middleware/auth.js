export function authMiddleware(secret) {
  return async (request, reply) => {
    const token = request.headers['authorization']?.replace('Bearer ', '');
    if (token !== secret) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  };
}
