import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import { EXTENSIONS } from './catalog';
import type { ExtensionDef, PresetContext } from './catalog';
import { buildZip } from './zip';
import { readZip } from './unzip';

type StoredFile = { path: string; b64: string };

/** Nos extensions Chrome, téléchargeables depuis la plateforme, avec
 * l'historique de toutes leurs versions (la sauvegarde : on peut toujours
 * reprendre une ancienne version si la nouvelle pose problème).
 *
 * Au démarrage, chaque extension du dossier `extension/` est relue : une
 * version nouvelle (ou un contenu changé sans changer de numéro) est
 * enregistrée. Rien n'est jamais effacé. */
@Injectable()
export class ExtensionsService implements OnModuleInit {
  private readonly logger = new Logger(ExtensionsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Ne bloque jamais le démarrage du serveur.
    this.syncAll().catch((err) => this.logger.warn(`Extensions non enregistrées : ${(err as Error).message}`));
  }

  /** Les fichiers d'une extension, triés, tels qu'ils seront zippés. */
  async snapshot(def: ExtensionDef, root = process.cwd()) {
    const base = join(root, def.dir);
    const out: StoredFile[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const rel = relative(base, full).split('\\').join('/');
        if (def.exclude.test(rel)) continue;
        if (def.include && !def.include.some((p) => rel === p || rel.startsWith(`${p}/`) || p.startsWith(`${rel}/`))) continue;
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) out.push({ path: rel, b64: (await readFile(full)).toString('base64') });
      }
    };
    await walk(base);
    out.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = out.find((f) => f.path === 'manifest.json');
    if (!manifest) throw new Error(`${def.dir} : manifest.json introuvable`);
    const version = String(JSON.parse(Buffer.from(manifest.b64, 'base64').toString('utf8')).version || '0.0.0');
    const hash = createHash('sha256');
    for (const f of out) hash.update(f.path).update('\0').update(f.b64);
    const size = out.reduce((n, f) => n + Buffer.from(f.b64, 'base64').length, 0);
    return { version, files: out, sha256: hash.digest('hex'), size };
  }

  /** Les anciennes versions retrouvées (extension/archive/index.json, rempli
   * par scripts/collect-extension-history.mjs) : importées une fois, avec
   * leur date d'origine. */
  async importArchive(root = process.cwd()) {
    const created: string[] = [];
    let index: Array<{ key: string; version: string; date: string; notes?: string; source?: string; file: string }> = [];
    try {
      index = JSON.parse(await readFile(join(root, 'extension', 'archive', 'index.json'), 'utf8'));
    } catch {
      return created;
    }
    for (const entry of index) {
      const def = EXTENSIONS.find((e) => e.key === entry.key);
      if (!def) continue;
      const entries = readZip(await readFile(join(root, 'extension', 'archive', entry.file)))
        .filter((f) => !def.exclude.test(f.path))
        .sort((a, b) => a.path.localeCompare(b.path));
      const files: StoredFile[] = entries.map((f) => ({ path: f.path, b64: f.data.toString('base64') }));
      const hash = createHash('sha256');
      for (const f of files) hash.update(f.path).update('\0').update(f.b64);
      const sha256 = hash.digest('hex');
      if (await this.prisma.extensionRelease.findFirst({ where: { key: def.key, sha256 }, select: { id: true } })) continue;
      const taken = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key: def.key, version: entry.version } }, select: { id: true } });
      const version = taken ? `${entry.version}+${sha256.slice(0, 7)}` : entry.version;
      await this.prisma.extensionRelease.create({
        data: {
          key: def.key,
          version,
          sha256,
          size: entries.reduce((n, f) => n + f.data.length, 0),
          fileCount: files.length,
          files: files as unknown as Prisma.InputJsonValue,
          notes: [entry.notes, entry.source && `source : ${entry.source}`].filter(Boolean).join(' — ') || 'version archivée',
          createdAt: new Date(entry.date),
        },
      });
      created.push(`${def.name} ${version} (archive)`);
    }
    return created;
  }

  /** Enregistrer ce qui a changé. */
  async syncAll(root = process.cwd()) {
    // Les archives d'abord : la version du dossier, plus récente, reste la
    // courante.
    const created: string[] = await this.importArchive(root);
    for (const def of EXTENSIONS) {
      try {
        await stat(join(root, def.dir));
      } catch {
        continue;
      }
      const snap = await this.snapshot(def, root);
      const same = await this.prisma.extensionRelease.findFirst({ where: { key: def.key, sha256: snap.sha256 }, select: { id: true } });
      if (same) continue;
      // Même numéro, contenu différent : on garde les deux, distingués.
      const taken = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key: def.key, version: snap.version } }, select: { id: true } });
      const version = taken ? `${snap.version}+${snap.sha256.slice(0, 7)}` : snap.version;
      await this.prisma.extensionRelease.create({
        data: {
          key: def.key,
          version,
          sha256: snap.sha256,
          size: snap.size,
          fileCount: snap.files.length,
          files: snap.files as unknown as Prisma.InputJsonValue,
          notes: taken ? 'contenu modifié sans changer le numéro de version' : null,
        },
      });
      created.push(`${def.name} ${version}`);
    }
    if (created.length) {
      this.logger.log(`Extensions enregistrées : ${created.join(', ')}`);
      await this.prisma.activityLog.create({
        data: { eventType: 'EXTENSION_RELEASED', message: `Nouvelle(s) version(s) d’extension : ${created.join(', ')}` },
      });
    }
    return created;
  }

  /** Le catalogue : chaque extension, sa version courante et son historique. */
  async list() {
    const releases = await this.prisma.extensionRelease.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, key: true, version: true, sha256: true, size: true, fileCount: true, notes: true, pinned: true, createdAt: true },
    });
    return EXTENSIONS.map((def) => {
      const mine = releases.filter((r) => r.key === def.key);
      const current = mine.find((r) => r.pinned) ?? mine[0] ?? null;
      return {
        key: def.key,
        name: def.name,
        letter: def.letter,
        color: def.color,
        role: def.role,
        installOn: def.installOn,
        preconfigurable: Boolean(def.preset),
        current,
        pinned: mine.some((r) => r.pinned),
        releases: mine,
      };
    });
  }

  private def(key: string) {
    const def = EXTENSIONS.find((e) => e.key === key);
    if (!def) throw new NotFoundException('Extension inconnue');
    return def;
  }

  /** Le paquet ZIP d'une version ; préconfiguré avec la clé du compte si
   * demandé (le fichier de configuration est rempli, rien d'autre ne change). */
  async download(
    key: string,
    version: string,
    opts: { preset: boolean; origin: string },
    acting: CurrentUser,
  ) {
    const def = this.def(key);
    const release = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key, version } } });
    if (!release) throw new NotFoundException('Version introuvable');
    const files = (release.files as unknown as StoredFile[]).map((f) => ({ path: f.path, data: Buffer.from(f.b64, 'base64') }));
    let presetInfo = 'sans clé';
    if (opts.preset) {
      if (!def.preset) throw new BadRequestException('Cette extension ne se préconfigure pas');
      const user = await this.prisma.user.findUnique({ where: { id: acting.id }, select: { automationKey: true, nstApiKey: true } });
      if (!user?.automationKey) throw new BadRequestException('Ce compte n’a pas de clé d’automatisation');
      const ctx: PresetContext = { origin: opts.origin.replace(/\/+$/, ''), apiKey: user.automationKey, nstApiKey: user.nstApiKey ?? '' };
      const target = files.find((f) => f.path === def.preset!.file);
      const filled = Buffer.from(def.preset.fill(target ? target.data.toString('utf8') : '', ctx), 'utf8');
      if (target) target.data = filled;
      else files.push({ path: def.preset.file, data: filled });
      presetInfo = `préconfigurée (clé du compte « ${acting.username} »${ctx.nstApiKey ? ' + clé NSTBrowser' : ''})`;
    }
    await this.prisma.activityLog.create({
      data: {
        eventType: 'EXTENSION_DOWNLOADED',
        level: opts.preset ? 'WARN' : 'INFO',
        message: `${def.name} ${version} téléchargée par « ${acting.username} », ${presetInfo}`,
        metadata: { key, version, preset: opts.preset, by: acting.username },
      },
    });
    const safe = version.replace(/[^0-9A-Za-z.+-]/g, '');
    return {
      fileName: `${key}-${safe}${opts.preset ? '-preconfiguree' : ''}.zip`,
      zip: buildZip(files, release.createdAt),
    };
  }

  /** Revenir à une version (ou ne plus épingler : la plus récente redevient
   * la courante). */
  async pin(key: string, version: string | null, acting: CurrentUser) {
    const def = this.def(key);
    if (version) {
      const release = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key, version } }, select: { id: true } });
      if (!release) throw new NotFoundException('Version introuvable');
    }
    await this.prisma.$transaction([
      this.prisma.extensionRelease.updateMany({ where: { key }, data: { pinned: false } }),
      ...(version ? [this.prisma.extensionRelease.update({ where: { key_version: { key, version } }, data: { pinned: true } })] : []),
      this.prisma.activityLog.create({
        data: {
          eventType: 'EXTENSION_PINNED',
          level: 'WARN',
          message: version
            ? `${def.name} : retour à la version ${version} (par « ${acting.username} »)`
            : `${def.name} : la plus récente redevient la version courante (par « ${acting.username} »)`,
        },
      }),
    ]);
    return { key, pinned: version };
  }
}
