"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ExtensionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionsService = void 0;
exports.versionOf = versionOf;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const prisma_service_1 = require("../prisma/prisma.service");
const catalog_1 = require("./catalog");
const zip_1 = require("./zip");
const unzip_1 = require("./unzip");
function versionOf(def, files) {
    const read = (path) => {
        const f = files.find((x) => x.path === path);
        return f ? Buffer.from(f.b64, 'base64').toString('utf8') : undefined;
    };
    if (def.versionOf)
        return def.versionOf(read);
    const manifest = read('manifest.json');
    if (!manifest)
        throw new Error(`${def.dir} : manifest.json introuvable`);
    return String(JSON.parse(manifest).version || '0.0.0');
}
let ExtensionsService = ExtensionsService_1 = class ExtensionsService {
    prisma;
    logger = new common_1.Logger(ExtensionsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onModuleInit() {
        this.syncAll().catch((err) => this.logger.warn(`Extensions non enregistrées : ${err.message}`));
    }
    async snapshot(def, root = process.cwd()) {
        const base = (0, node_path_1.join)(root, def.dir);
        const out = [];
        const walk = async (dir) => {
            for (const entry of await (0, promises_1.readdir)(dir, { withFileTypes: true })) {
                const full = (0, node_path_1.join)(dir, entry.name);
                const rel = (0, node_path_1.relative)(base, full).split('\\').join('/');
                if (def.exclude.test(rel))
                    continue;
                if (def.include && !def.include.some((p) => rel === p || rel.startsWith(`${p}/`) || p.startsWith(`${rel}/`)))
                    continue;
                if (entry.isDirectory())
                    await walk(full);
                else if (entry.isFile())
                    out.push({ path: rel, b64: (await (0, promises_1.readFile)(full)).toString('base64') });
            }
        };
        await walk(base);
        out.sort((a, b) => a.path.localeCompare(b.path));
        const version = versionOf(def, out);
        const hash = (0, node_crypto_1.createHash)('sha256');
        for (const f of out)
            hash.update(f.path).update('\0').update(f.b64);
        const size = out.reduce((n, f) => n + Buffer.from(f.b64, 'base64').length, 0);
        return { version, files: out, sha256: hash.digest('hex'), size };
    }
    async importArchive(root = process.cwd()) {
        const created = [];
        let index = [];
        try {
            index = JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(root, 'extension', 'archive', 'index.json'), 'utf8'));
        }
        catch {
            return created;
        }
        for (const entry of index) {
            const def = catalog_1.EXTENSIONS.find((e) => e.key === entry.key);
            if (!def)
                continue;
            const entries = (0, unzip_1.readZip)(await (0, promises_1.readFile)((0, node_path_1.join)(root, 'extension', 'archive', entry.file)))
                .filter((f) => !def.exclude.test(f.path))
                .sort((a, b) => a.path.localeCompare(b.path));
            const files = entries.map((f) => ({ path: f.path, b64: f.data.toString('base64') }));
            const hash = (0, node_crypto_1.createHash)('sha256');
            for (const f of files)
                hash.update(f.path).update('\0').update(f.b64);
            const sha256 = hash.digest('hex');
            if (await this.prisma.extensionRelease.findFirst({ where: { key: def.key, sha256 }, select: { id: true } }))
                continue;
            const taken = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key: def.key, version: entry.version } }, select: { id: true } });
            const version = taken ? `${entry.version}+${sha256.slice(0, 7)}` : entry.version;
            await this.prisma.extensionRelease.create({
                data: {
                    key: def.key,
                    version,
                    sha256,
                    size: entries.reduce((n, f) => n + f.data.length, 0),
                    fileCount: files.length,
                    files: files,
                    notes: [entry.notes, entry.source && `source : ${entry.source}`].filter(Boolean).join(' — ') || 'version archivée',
                    createdAt: new Date(entry.date),
                },
            });
            created.push(`${def.name} ${version} (archive)`);
        }
        return created;
    }
    async syncAll(root = process.cwd()) {
        const created = await this.importArchive(root);
        for (const def of catalog_1.EXTENSIONS) {
            try {
                await (0, promises_1.stat)((0, node_path_1.join)(root, def.dir));
            }
            catch {
                continue;
            }
            const snap = await this.snapshot(def, root);
            const same = await this.prisma.extensionRelease.findFirst({ where: { key: def.key, sha256: snap.sha256 }, select: { id: true } });
            if (same)
                continue;
            const taken = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key: def.key, version: snap.version } }, select: { id: true } });
            const version = taken ? `${snap.version}+${snap.sha256.slice(0, 7)}` : snap.version;
            await this.prisma.extensionRelease.create({
                data: {
                    key: def.key,
                    version,
                    sha256: snap.sha256,
                    size: snap.size,
                    fileCount: snap.files.length,
                    files: snap.files,
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
    async list() {
        const releases = await this.prisma.extensionRelease.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, key: true, version: true, sha256: true, size: true, fileCount: true, notes: true, pinned: true, createdAt: true },
        });
        return catalog_1.EXTENSIONS.map((def) => {
            const mine = releases.filter((r) => r.key === def.key);
            const current = mine.find((r) => r.pinned) ?? mine[0] ?? null;
            return {
                key: def.key,
                name: def.name,
                letter: def.letter,
                color: def.color,
                role: def.role,
                installOn: def.installOn,
                kind: def.kind ?? 'chrome',
                installHint: def.installHint ?? null,
                preconfigurable: Boolean(def.preset),
                nstKey: def.nstKey ?? null,
                nstKeyWhy: def.nstKeyWhy ?? null,
                current,
                pinned: mine.some((r) => r.pinned),
                releases: mine,
            };
        });
    }
    def(key) {
        const def = catalog_1.EXTENSIONS.find((e) => e.key === key);
        if (!def)
            throw new common_1.NotFoundException('Extension inconnue');
        return def;
    }
    async download(key, version, opts, acting) {
        const def = this.def(key);
        const release = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key, version } } });
        if (!release)
            throw new common_1.NotFoundException('Version introuvable');
        const files = release.files.map((f) => ({ path: f.path, data: Buffer.from(f.b64, 'base64') }));
        let presetInfo = 'sans clé';
        if (opts.preset) {
            if (!def.preset)
                throw new common_1.BadRequestException('Cette extension ne se préconfigure pas');
            const user = await this.prisma.user.findUnique({ where: { id: acting.id }, select: { automationKey: true, nstApiKey: true } });
            if (!user?.automationKey)
                throw new common_1.BadRequestException('Ce compte n’a pas de clé d’automatisation');
            const ctx = { origin: opts.origin.replace(/\/+$/, ''), apiKey: user.automationKey, nstApiKey: user.nstApiKey ?? '' };
            const target = files.find((f) => f.path === def.preset.file);
            const filled = Buffer.from(def.preset.fill(target ? target.data.toString('utf8') : '', ctx), 'utf8');
            if (target)
                target.data = filled;
            else
                files.push({ path: def.preset.file, data: filled });
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
        const packed = def.zipRoot ? files.map((f) => ({ ...f, path: `${def.zipRoot}${f.path}` })) : files;
        return {
            fileName: def.kind === 'wordpress' ? `data-fb-posting-${safe}.zip` : `${key}-${safe}${opts.preset ? '-preconfiguree' : ''}.zip`,
            zip: (0, zip_1.buildZip)(packed, release.createdAt),
        };
    }
    async pin(key, version, acting) {
        const def = this.def(key);
        if (version) {
            const release = await this.prisma.extensionRelease.findUnique({ where: { key_version: { key, version } }, select: { id: true } });
            if (!release)
                throw new common_1.NotFoundException('Version introuvable');
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
};
exports.ExtensionsService = ExtensionsService;
exports.ExtensionsService = ExtensionsService = ExtensionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExtensionsService);
//# sourceMappingURL=extensions.service.js.map