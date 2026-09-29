import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratePostsDto } from './dto/generate-posts.dto';
import type { CurrentUser } from '../auth/current-user';
import { postGroupIds } from '../posts/post-groups';

type GeneratedPayload = {
  posts: Array<{ title: string; description: string }>;
};

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generate(dto: GeneratePostsDto, acting: CurrentUser | null = null) {
    if (dto.delayMin > dto.delayMax) {
      throw new BadRequestException(
        'delayMin doit être inférieur ou égal à delayMax',
      );
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_MODEL');
    if (!apiKey || !model) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY et OPENAI_MODEL doivent être configurés',
      );
    }

    // Des groupes seulement, jamais un profil : voir `postGroupIds`.
    const uniqueGroupIds = await postGroupIds(
      this.prisma,
      dto.groupIds,
      acting,
    );

    const openai = new OpenAI({ apiKey });
    const response = await openai.responses.create({
      model,
      instructions:
        'Rédige des publications naturelles et distinctes. Retourne uniquement le contenu demandé, sans URL ni image.',
      input: `Crée ${dto.count} publications en ${dto.language} sur le thème suivant : ${dto.topic}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'generated_posts',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              posts: {
                type: 'array',
                minItems: dto.count,
                maxItems: dto.count,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['title', 'description'],
                },
              },
            },
            required: ['posts'],
          },
        },
      },
    });

    let payload: GeneratedPayload;
    try {
      payload = JSON.parse(response.output_text) as GeneratedPayload;
    } catch {
      throw new ServiceUnavailableException(
        'La réponse OpenAI ne contient pas un JSON exploitable',
      );
    }

    return this.prisma.$transaction(
      payload.posts.map((generated) =>
        this.prisma.post.create({
          data: {
            ownerId: acting?.id ?? null,
            title: generated.title,
            description: generated.description,
            url: dto.url,
            imageUrl: dto.imageUrl,
            delay: this.randomInt(dto.delayMin, dto.delayMax),
            sourceType: 'OPENAI',
            targets: {
              create: uniqueGroupIds.map((groupId) => ({ groupId })),
            },
          },
          include: { targets: true },
        }),
      ),
    );
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
