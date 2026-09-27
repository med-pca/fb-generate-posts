import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RecordStatus, Role } from '@prisma/client';
import { FastifyRequest } from 'fastify';

/** Qui agit. Attaché à la requête par les gardes, lu par les services pour
 * borner ce qu'ils rendent.
 *
 * `null` pour un appel porté par la clé globale d'automatisation : elle
 * n'appartient à personne et voit tout, comme avant les comptes. */
export type CurrentUser = {
  id: string;
  username: string;
  role: Role;
  status: RecordStatus;
};

export type RequestWithUser = FastifyRequest & { user?: CurrentUser | null };

export const ActingUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithUser>().user ?? null,
);
