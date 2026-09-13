import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  }
}
