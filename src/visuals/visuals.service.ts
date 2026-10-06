import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TargetStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { groupWhere, scopeOf } from '../auth/scope';
import { RewriterService } from '../ingest/rewriter.service';
import { ImageTranslatorService, languageName } from '../ingest/image-translator.service';

export type ImageInput = { data: string; mimeType: string };
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 10_000_000;

export type BuildOptions = {
  image: ImageInput;
  language?: string | null;
  /** Traduire le texte présent dans l'image (IA d'image). */
  translate: boolean;
  /** Description écrite à la main ; vide = écrite par l'IA (DeepSeek). */
  caption?: string | null;
  title?: string | null;
  fbCaption?: string | null;
  categoryId?: string | null;
  /** Groupes choisis ; sinon ceux de la langue (et de la catégorie). */
  groupIds?: string[];
  createPosts: boolean;
  origin: 'capture' | 'upload';
  ingestId?: string | null;
  ownerId?: string | null;
};

/** Les visuels : une image seule, publiée avec sa description dans les
 * groupes — sans article, sans lien, sans commentaire. Capturés (extension
 * Capture, mode « engagement ») ou importés dans la plateforme. Le même
 * parcours pour les deux :
 *   1. le texte de l'image, lu et traduit si demandé (modèle qui voit l'image) ;
 *   2. une nouvelle image au texte traduit (IA d'image choisie), sinon l'image
 *      telle quelle ;
 *   3. la description : celle donnée, ou écrite par l'IA (DeepSeek d'abord) ;
 *   4. le visuel, et ses posts vers les groupes visés. */
@Injectable()
export class VisualsService {
  private readonly logger = new Logger(VisualsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rewriter: RewriterService,
    private readonly images: ImageTranslatorService,
  ) {}

  /** Les groupes visés : choisis, ou actifs de la langue et de la catégorie. */
  async audience(opts: { groupIds?: string[]; language?: string | null; categoryId?: string | null }, acting: CurrentUser | null = null) {
    const where: Prisma.GroupWhereInput = opts.groupIds?.length
      ? { id: { in: opts.groupIds }, status: 'ACTIVE', ...groupWhere(scopeOf(acting)) }
      : {
          status: 'ACTIVE',
          ...(opts.language ? { language: opts.language } : {}),
          ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
          ...groupWhere(scopeOf(acting)),
        };
    return this.prisma.group.findMany({ where, select: { id: true } });
  }

  async create(opts: BuildOptions, acting: CurrentUser | null = null) {
    if (!IMAGE_TYPES.has(opts.image.mimeType)) throw new BadRequestException(`Type d’image non accepté : ${opts.image.mimeType}`);
    if (Buffer.byteLength(opts.image.data, 'base64') > MAX_BYTES) throw new BadRequestException('Image trop lourde (10 Mo au plus)');
    if (opts.translate && !opts.language) throw new BadRequestException('Choisissez la langue de traduction');
    // Les groupes d'abord : rien ne se paie si personne ne recevra le visuel.
    const groups = opts.createPosts ? await this.audience(opts, acting) : [];
    if (opts.createPosts && !groups.length) {
      throw new BadRequestException(
        `Aucun groupe actif${opts.language ? ` en ${languageName(opts.language)}` : ''}${opts.categoryId ? ' dans cette catégorie' : ''} : réglez la langue des groupes (Pilotage → Règles & priorités) ou choisissez des groupes`,
      );
    }
    let image = opts.image;
    let read: { hasText: boolean; texts: Array<{ original: string; translated: string }>; scene: string } = { hasText: false, texts: [], scene: '' };
    let provider = '';
    if (opts.translate || !opts.caption?.trim()) {
      try {
        read = await this.rewriter.readImageText({ image, language: opts.language || 'en' });
      } catch (error) {
        this.logger.warn(`Lecture de l’image impossible : ${(error as Error).message}`);
        // Sans lecture, on traduit quand même si c'est demandé : l'IA d'image sait lire.
        if (opts.translate) read = { hasText: true, texts: [], scene: '' };
      }
    }
    if (opts.translate && read.hasText) {
      const settings = await this.prisma.automationSetting.findUnique({ where: { id: 'global' }, select: { imageProvider: true } });
      const translated = await this.images.translate(image, opts.language!, read.texts.map((t) => `"${t.original}" → "${t.translated}"`), settings?.imageProvider ?? 'auto');
      image = { data: translated.data, mimeType: translated.mimeType };
      provider = translated.provider;
    }
    let caption = opts.caption?.trim() || '';
    let title = opts.title?.trim() || '';
    let hashtags: string[] = [];
    let captionBy = 'à la main';
    if (!caption) {
      const written = await this.rewriter.engagementCaption({
        language: opts.language || 'en',
        scene: read.scene,
        texts: read.texts.map((t) => (opts.translate ? t.translated : t.original)),
        fbCaption: opts.fbCaption,
      });
      caption = written.caption;
      hashtags = written.hashtags;
      title = title || written.title;
      captionBy = written.provider;
    }
    title = title || caption.slice(0, 60);
    const imageUrl = await this.store(image, opts.ingestId ?? null);
    const visual = await this.prisma.visual.create({
      data: {
        title,
        imageUrl,
        caption,
        hashtags,
        language: opts.language ?? null,
        categoryId: opts.categoryId ?? null,
        origin: opts.origin,
        ingestId: opts.ingestId ?? null,
        ownerId: opts.ownerId ?? acting?.id ?? null,
        details: { texts: read.texts, scene: read.scene, imageProvider: provider || null, translated: Boolean(provider), captionBy } as Prisma.InputJsonValue,
      },
    });
    const post = groups.length ? await this.postFor(visual, groups.map((g) => g.id)) : null;
    await this.prisma.activityLog.create({
      data: {
        eventType: 'VISUAL_CREATED',
        message:
          `Visuel « ${title} »${opts.language ? ` (${languageName(opts.language)})` : ''} : ` +
          `${provider ? `image traduite par ${provider}` : 'image d’origine'}, description ${captionBy}` +
          (post ? `, post pour ${groups.length} groupe(s)` : ', sans post'),
        metadata: { visualId: visual.id, postId: post?.id ?? null, origin: opts.origin, by: acting?.username ?? null },
      },
    });
    return { visual, postId: post?.id ?? null, groups: groups.length };
  }

  /** Le post d'un visuel : image et description, sans lien ni commentaire. */
  private postFor(visual: { id: string; title: string; caption: string; hashtags: string[]; imageUrl: string; ownerId: string | null }, groupIds: string[]) {
    return this.prisma.post.create({
      data: {
        title: visual.title,
        description: [visual.caption, visual.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n'),
        url: null,
        imageUrl: visual.imageUrl,
        noComment: true,
        visualId: visual.id,
        delay: 10 + Math.floor(Math.random() * 51),
        sourceType: 'FACEBOOK',
        ownerId: visual.ownerId,
        targets: { create: groupIds.map((groupId) => ({ groupId })) },
      },
      select: { id: true },
    });
  }

  /** Créer (ou compléter) les posts d'un visuel existant : les groupes visés
   * qui ne l'ont pas déjà. */
  async createPosts(id: string, opts: { groupIds?: string[] }, acting: CurrentUser | null) {
    const visual = await this.reachable(id, acting);
    const groups = await this.audience({ groupIds: opts.groupIds, language: visual.language, categoryId: visual.categoryId }, acting);
    const already = new Set(
      (await this.prisma.postTarget.findMany({ where: { post: { visualId: id } }, select: { groupId: true } })).map((t) => t.groupId),
    );
    const fresh = groups.map((g) => g.id).filter((g) => !already.has(g));
    if (!fresh.length) throw new BadRequestException('Tous les groupes visés ont déjà ce visuel');
    const post = await this.postFor(visual, fresh);
    return { postId: post.id, groups: fresh.length };
  }

  async list(q: { page?: number; limit?: number; language?: string; search?: string }, acting: CurrentUser | null) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(q.limit) || 24));
    const where = this.where(acting, q);
    const [rows, total] = await Promise.all([
      this.prisma.visual.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { category: { select: { id: true, name: true } }, posts: { select: { id: true, targets: { select: { status: true } } } } },
      }),
      this.prisma.visual.count({ where }),
    ]);
    return {
      data: rows.map(({ posts, ...v }) => {
        const targets = posts.flatMap((p) => p.targets);
        return {
          ...v,
          posts: posts.length,
          groups: targets.length,
          published: targets.filter((t) => t.status === TargetStatus.PUBLISHED).length,
          waiting: targets.filter((t) => t.status === TargetStatus.AVAILABLE).length,
        };
      }),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async update(id: string, dto: { title?: string; caption?: string; status?: 'ACTIVE' | 'INACTIVE'; language?: string | null }, acting: CurrentUser | null) {
    await this.reachable(id, acting);
    const visual = await this.prisma.visual.update({ where: { id }, data: dto });
    // Les posts pas encore partis prennent la nouvelle description.
    if (dto.caption !== undefined || dto.title !== undefined) {
      await this.prisma.post.updateMany({
        where: { visualId: id, targets: { none: { status: { in: [TargetStatus.CLAIMED, TargetStatus.CONSUMED] } } } },
        data: { title: visual.title, description: [visual.caption, visual.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n') },
      });
    }
    return visual;
  }

  /** Supprimer un visuel et ses posts pas encore publiés. */
  async remove(id: string, acting: CurrentUser | null) {
    await this.reachable(id, acting);
    const { count } = await this.prisma.post.deleteMany({
      where: { visualId: id, targets: { none: { status: { in: [TargetStatus.PUBLISHED, TargetStatus.CLAIMED, TargetStatus.CONSUMED] } } } },
    });
    await this.prisma.visual.delete({ where: { id } });
    return { deleted: true, postsDeleted: count };
  }

  private where(acting: CurrentUser | null, q: { language?: string; search?: string } = {}): Prisma.VisualWhereInput {
    const scope = scopeOf(acting);
    return {
      ...(scope ? { ownerId: scope.ownerId } : {}),
      ...(q.language ? { language: q.language } : {}),
      ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { caption: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
  }

  private async reachable(id: string, acting: CurrentUser | null) {
    const visual = await this.prisma.visual.findFirst({ where: { id, ...this.where(acting) } });
    if (!visual) throw new NotFoundException('Visuel introuvable');
    return visual;
  }

  /** L'image, servie publiquement sous un jeton imprévisible. */
  private async store(image: ImageInput, ingestId: string | null) {
    const token = randomBytes(18).toString('base64url');
    await this.prisma.generatedImage.create({ data: { token, mimeType: image.mimeType, data: Buffer.from(image.data, 'base64'), ingestId } });
    const base = (this.config.get<string>('PUBLIC_URL') || 'https://post.pulserecipe.com').replace(/\/+$/, '');
    const ext = image.mimeType.includes('jpeg') ? 'jpg' : image.mimeType.split('/')[1] || 'png';
    return `${base}/media/g/${token}.${ext}`;
  }
}
