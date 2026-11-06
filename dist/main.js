"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const web_1 = require("./web/web");
const perf_service_1 = require("./perf/perf.service");
const short_cache_service_1 = require("./perf/short-cache.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({ bodyLimit: 15 * 1024 * 1024 }));
    app.get(perf_service_1.PerfService).register(app.getHttpAdapter().getInstance());
    app.get(short_cache_service_1.ShortCacheService).register(app.getHttpAdapter().getInstance());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    (0, web_1.registerWeb)(app);
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Data FB Posting API')
        .setDescription('API de gestion des profils, groupes, contenus et lots de publication.')
        .setVersion('1.0')
        .addCookieAuth('pf_session')
        .addTag('profiles', 'Gestion des profils')
        .addTag('groups', 'Groupes liés aux profils')
        .addTag('posts', 'Contenus à publier')
        .addTag('jobs', 'Récupération et confirmation des lots')
        .addTag('imports', 'Importation de contenus JSON')
        .addTag('generation', 'Génération textuelle OpenAI')
        .addTag('logs', 'Journaux d’activité')
        .addTag('ingest', 'Reprise de publications Facebook')
        .addTag('sites', 'Sites WordPress de destination')
        .addTag('users', 'Comptes de la plateforme')
        .addTag('access', 'Partages en publication seule')
        .build();
    const swaggerDocument = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, swaggerDocument, {
        jsonDocumentUrl: 'api/docs-json',
        customSiteTitle: 'Data FB Posting API',
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            filter: true,
        },
    });
    app.enableShutdownHooks();
    await app.listen({
        port: Number(process.env.PORT ?? 3000),
        host: '0.0.0.0',
    });
}
void bootstrap();
//# sourceMappingURL=main.js.map