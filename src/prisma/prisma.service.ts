import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { countSql } from '../perf/perf-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // Rubrique Performance : chaque requête (modèles, SQL brut,
    // transactions) est comptée pour l'appel de l'API en cours. Le client
    // étendu garde toutes les méthodes de ce service.
    return this.$extends({
      query: {
        async $allOperations({ args, query }) {
          const started = performance.now();
          try {
            return await query(args);
          } finally {
            countSql(performance.now() - started);
          }
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
