import * as fastify from "fastify";
import * as http from "http";

export interface req extends fastify.FastifyRequest { }

export interface res extends fastify.FastifyReply<http.ServerResponse> { }

