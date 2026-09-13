import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLogDto) {
    return this.prisma.activityLog.create({
      data: { ...dto, metadata: dto.metadata as Prisma.InputJsonValue },
    });
  }

  findAll(profileId?: string) {
    return this.prisma.activityLog.findMany({
      where: profileId ? { profileId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
