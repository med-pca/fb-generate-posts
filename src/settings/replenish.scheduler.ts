import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

const DEFAULT_INTERVAL_MINUTES = 15;
/** Laisser l'application finir de démarrer avant le premier passage. */
const STARTUP_DELAY_MS = 30_000;

/** Sans ce minuteur, le stock ne se refait que si un automate réserve ou si
 * un administrateur clique : un profil au repos descend sous son seuil et y
 * reste. Le passage périodique couvre cette période creuse. */
@Injectable()
export class ReplenishScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReplenishScheduler.name);
  private timer?: NodeJS.Timeout;
  private startup?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const minutes = this.intervalMinutes();
    if (minutes <= 0) {
      this.logger.log(
        'Alimentation périodique désactivée (REPLENISH_INTERVAL_MINUTES=0)',
      );
      return;
    }
    this.logger.log(`Alimentation périodique toutes les ${minutes} minute(s)`);
    this.startup = setTimeout(() => void this.run(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.run(), minutes * 60_000);
    // Ne pas retenir la boucle d'événements à l'arrêt du processus.
    this.timer.unref?.();
    this.startup.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startup) clearTimeout(this.startup);
  }

  /** 0 ou valeur invalide désactive le minuteur. */
  intervalMinutes() {
    const raw = this.config.get<string | number>('REPLENISH_INTERVAL_MINUTES');
    if (raw === undefined || raw === null || raw === '') {
      return DEFAULT_INTERVAL_MINUTES;
    }
    const minutes = Number(raw);
    return Number.isFinite(minutes) && minutes >= 0
      ? Math.floor(minutes)
      : DEFAULT_INTERVAL_MINUTES;
  }

  /** Un passage ne doit jamais chevaucher le précédent : sur beaucoup de
   * profils, l'alimentation peut durer plus longtemps que l'intervalle. Et
   * une erreur ne doit jamais tuer le minuteur. */
  async run() {
    if (this.running) {
      this.logger.warn('Passage précédent encore en cours, tour sauté');
      return { skipped: 'already_running' as const };
    }
    this.running = true;
    try {
      const results = await this.settings.replenishAll();
      const generated = results.reduce((total, r) => total + r.generated, 0);
      const reused = results.reduce((total, r) => total + r.reused, 0);
      if (generated || reused) {
        await this.prisma.activityLog.create({
          data: {
            eventType: 'REPLENISH_SCHEDULED',
            message: `${generated} post(s) créé(s) et ${reused} rattaché(s) sur ${results.length} profil(s)`,
            metadata: { generated, reused, profiles: results.length },
          },
        });
      }
      this.logger.log(
        `Alimentation : ${generated} créé(s), ${reused} rattaché(s), ${results.length} profil(s)`,
      );
      return { profiles: results.length, generated, reused };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur inconnue';
      this.logger.error(`Alimentation périodique en échec : ${message}`);
      // Tracé en base : un minuteur muet qui échoue en silence laisserait les
      // profils se vider sans que rien ne le signale.
      await this.prisma.activityLog
        .create({
          data: {
            eventType: 'REPLENISH_FAILED',
            level: 'ERROR',
            message,
          },
        })
        .catch(() => undefined);
      return { error: message };
    } finally {
      this.running = false;
    }
  }
}
