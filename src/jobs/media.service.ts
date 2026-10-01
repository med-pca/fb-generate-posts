import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertSafeRemoteUrl } from '../common/safe-fetch';

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

/** L'image d'un post, téléchargée par l'API pour l'extension.
 *
 * L'extension télécharge l'image elle-même, mais un site peut la lui
 * refuser (permission du navigateur, protection anti-hotlink). L'API, elle,
 * est toujours joignable par l'extension : elle sert de relais.
 *
 * Ce n'est pas un proxy ouvert : seule une image réellement utilisée par un
 * post ou un profil est servie, depuis une adresse publique en HTTPS —
 * vérifiée à chaque redirection, pour qu'un site ne puisse pas renvoyer vers
 * le réseau interne. */
@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchPostImage(rawUrl: string) {
    const url = String(rawUrl || '').trim();
    const used =
      url &&
      ((await this.prisma.post.count({ where: { imageUrl: url } })) ||
        (await this.prisma.profile.count({ where: { defaultImageUrl: url } })));
    if (!used) {
      throw new ForbiddenException('Cette image n’est utilisée par aucun post');
    }

    let target = url;
    let response: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertSafeRemoteUrl(target);
      try {
        response = await fetch(target, {
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { Accept: 'image/*' },
        });
      } catch (error) {
        throw new BadGatewayException(
          `Image injoignable : ${error instanceof Error ? error.message : error}`,
        );
      }
      const next = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && next) {
        target = new URL(next, target).toString();
        continue;
      }
      break;
    }
    if (!response || (response.status >= 300 && response.status < 400)) {
      throw new BadGatewayException('Trop de redirections pour cette image');
    }
    if (!response.ok) {
      throw new BadGatewayException(`L’image a répondu HTTP ${response.status}`);
    }
    const type = (response.headers.get('content-type') || '').split(';')[0].trim();
    if (!type.startsWith('image/')) {
      throw new BadGatewayException(`Ce n’est pas une image (${type || 'type inconnu'})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new BadGatewayException('L’image est vide');
    if (buffer.length > MAX_BYTES) {
      throw new BadGatewayException('L’image dépasse 25 Mo');
    }
    return { buffer, type };
  }
}
