declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => void;
  }

  interface FastifyRequest {
    userId: string;
  }
}

export {};
