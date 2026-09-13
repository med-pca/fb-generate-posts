import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportJsonDto } from './dto/import-json.dto';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async importJson(dto: ImportJsonDto) {
    const groupIds = [...new Set(dto.groupIds)];
    const groupCount = await this.prisma.group.count({
      where: {
        id: { in: groupIds },
        profiles: {
          some: { profileId: dto.profileId, status: 'ACTIVE' },
        },
      },
    });
    if (groupCount !== groupIds.length) {
      throw new BadRequestException(
        'Tous les groupes doivent appartenir au profil demandé',
      );
    }

    let imported = 0;
    let duplicates = 0;
    for (const sourcePost of dto.posts) {
      try {
        await this.prisma.post.create({
          data: {
            profileId: dto.profileId,
            title: sourcePost.title,
            description: sourcePost.description,
            url: sourcePost.url,
            imageUrl: sourcePost.imageUrl,
            delay: sourcePost.delay,
            sourceType: 'JSON',
            externalId: sourcePost.externalId,
            rawData: sourcePost as unknown as Prisma.InputJsonValue,
            targets: { create: groupIds.map((groupId) => ({ groupId })) },
          },
        });
        imported += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          duplicates += 1;
          continue;
        }
        throw error;
      }
    }
    return { received: dto.posts.length, imported, duplicates };
  }
}
