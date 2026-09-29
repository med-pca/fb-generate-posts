import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportJsonDto } from './dto/import-json.dto';
import type { CurrentUser } from '../auth/current-user';
import { postGroupIds } from '../posts/post-groups';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Les posts importés ne visent que des groupes : le profil qui publie
   * dans l'un d'eux viendra les y chercher. */
  async importJson(dto: ImportJsonDto, acting: CurrentUser | null = null) {
    const groupIds = await postGroupIds(this.prisma, dto.groupIds, acting);

    let imported = 0;
    let duplicates = 0;
    for (const sourcePost of dto.posts) {
      try {
        await this.prisma.post.create({
          data: {
            ownerId: acting?.id ?? null,
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
