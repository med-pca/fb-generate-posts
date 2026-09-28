import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { PairDto } from './dto/pair.dto';
import { RunnersService } from './runners.service';

/** L'appairage d'un navigateur : la seule route du pilotage **sans clé d'API**.
 *
 * Elle est dans son propre contrôleur pour que cela se voie. Un navigateur qui
 * s'appaire n'a pas encore de clé -- le code est justement ce qui la lui donne
 * -- donc aucune garde ne peut s'appliquer ici. Ce qui la protège est ailleurs :
 * le code est court de vie, à usage unique, et les tentatives sont comptées par
 * adresse (voir RunnersService.pair).
 *
 * La mettre dans le contrôleur voisin aurait demandé une exception dans la
 * garde d'automatisation, c'est-à-dire un trou dans la pièce la plus sensible,
 * visible seulement en lisant une métadonnée.
 */
@ApiTags('control')
@Controller('control')
export class PairController {
  constructor(private readonly runners: RunnersService) {}

  @Post('pair')
  @ApiOperation({
    summary: 'Échanger un code d’appairage contre les réglages du navigateur',
    description:
      'Rend l’adresse de l’API, une clé d’automatisation et l’identifiant du ' +
      'profil. Le code porte l’identité du profil : l’opérateur n’a donc rien ' +
      'à choisir, il colle le code de la ligne qu’il veut.',
  })
  pair(@Body() dto: PairDto, @Req() request: FastifyRequest) {
    return this.runners.pair(dto.code, publicApiBaseUrl(request), request.ip);
  }
}

/** L'adresse publique de cette API, telle que le navigateur devra l'appeler.
 *
 * Lue sur la requête plutôt que configurée : c'est par cette adresse que le
 * navigateur vient d'arriver, donc c'est celle qui marche depuis chez lui.
 * Derrière un proxy, ce sont les en-têtes `x-forwarded-*` qui la portent.
 * `PUBLIC_API_BASE_URL` reste là pour les cas où l'adresse vue du serveur n'est
 * pas celle que le navigateur doit appeler.
 */
function publicApiBaseUrl(request: FastifyRequest) {
  const configured = process.env.PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const first = (value: unknown, fallback: string) =>
    String((Array.isArray(value) ? value[0] : value) || fallback)
      .split(',')[0]
      .trim();
  const host = first(
    request.headers['x-forwarded-host'] ?? request.headers.host,
    'localhost:3000',
  );
  const protocol = first(
    request.headers['x-forwarded-proto'] ?? request.protocol,
    'http',
  );
  return `${protocol}://${host}/api`;
}
