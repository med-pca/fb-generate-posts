import { RecordStatus, Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';
export type CurrentUser = {
    id: string;
    username: string;
    role: Role;
    status: RecordStatus;
};
export type RequestWithUser = FastifyRequest & {
    user?: CurrentUser | null;
};
export declare const ActingUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
