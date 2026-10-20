import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  KeyVault,
  NonceCache,
  generateSiteKey,
  parseSiteKey,
  signedHeaders,
} from './site-key';

/** Les clés de site : génération, chiffrement au repos, et en-têtes des
 * appels de la plateforme vers les plugins. */
@Injectable()
export class SiteKeysService implements OnModuleInit {
  private readonly logger = new Logger(SiteKeysService.name);
  /** Les nonces déjà acceptés (sens WordPress → plateforme). */
  readonly nonces = new NonceCache();
  private cachedVault: KeyVault | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private get vault() {
    if (!this.cachedVault) {
      this.cachedVault = new KeyVault(
        this.config.get<string>('SITE_KEY_SECRET') ||
          this.config.get<string>('AUTH_SECRET') ||
          '',
      );
    }
    return this.cachedVault;
  }

  /** La clé globale des plugins 1.x. */
  globalKey() {
    return this.config.get<string>('WORDPRESS_API_KEY') || '';
  }

  /** Transition : les plugins 1.x (clé en clair, clé globale) sont encore
   * acceptés tant que WORDPRESS_LEGACY_KEYS ne vaut pas `false`. */
  legacyAllowed() {
    return this.config.get<string>('WORDPRESS_LEGACY_KEYS') !== 'false';
  }

  open(stored: string | null | undefined) {
    // Une clé non chiffrée se lit sans le secret maître.
    return KeyVault.isSealed(stored)
      ? this.vault.open(stored)
      : (stored ?? null);
  }

  /** La clé v2 d'un site, ou `null` s'il n'en a pas (encore). */
  parsed(stored: string | null | undefined) {
    return parseSiteKey(this.open(stored));
  }

  /** Les en-têtes d'authentification d'un appel vers le plugin du site.
   * Clé v2 : requête signée, la clé ne part pas. Sinon (plugin 1.x) : la clé
   * du site ou la clé globale en clair, si la transition l'autorise encore.
   * `null` : aucun moyen de s'authentifier. */
  headersFor(
    stored: string | null | undefined,
    method: string,
    body = '',
  ): Record<string, string> | null {
    const own = this.open(stored);
    const v2 = parseSiteKey(own);
    if (v2) return signedHeaders(v2, method, body);
    if (!this.legacyAllowed()) return null;
    const key = own || this.globalKey();
    return key ? { 'x-api-key': key } : null;
  }

  /** Une nouvelle clé pour ce site. L'ancienne cesse aussitôt de valoir. La
   * clé en clair n'est rendue qu'ici, une fois. */
  async rotate(siteId: string) {
    const key = generateSiteKey(siteId);
    await this.prisma!.contentSource.update({
      where: { id: siteId },
      data: { depositKey: this.vault.seal(key) },
    });
    return key;
  }

  /** Les clés saisies en clair avant la v2 sont chiffrées au démarrage. */
  async onModuleInit() {
    if (!this.prisma) return;
    try {
      const plain = await this.prisma.contentSource.findMany({
        where: {
          depositKey: { not: null },
          NOT: { depositKey: { startsWith: 'enc:v1:' } },
        },
        select: { id: true, depositKey: true },
      });
      for (const site of plain) {
        await this.prisma.contentSource.update({
          where: { id: site.id },
          data: { depositKey: this.vault.seal(site.depositKey!) },
        });
      }
      if (plain.length)
        this.logger.log(`${plain.length} clé(s) de site chiffrée(s)`);
    } catch (error) {
      this.logger.warn(
        `Chiffrement des clés de site impossible : ${(error as Error).message}`,
      );
    }
  }
}

@Global()
@Module({
  providers: [SiteKeysService],
  exports: [SiteKeysService],
})
export class SiteKeysModule {}
