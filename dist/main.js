"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const swagger_1 = require("@nestjs/swagger");
const node_path_1 = require("node:path");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    app.useStaticAssets({
        root: (0, node_path_1.join)(process.cwd(), 'public'),
        prefix: '/',
    });
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Data FB Posting API')
        .setDescription('API de gestion des profils, groupes, contenus et lots de publication.')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('profiles', 'Gestion des profils')
        .addTag('groups', 'Groupes liés aux profils')
        .addTag('posts', 'Contenus à publier')
        .addTag('jobs', 'Récupération et confirmation des lots')
        .addTag('imports', 'Importation de contenus JSON')
        .addTag('generation', 'Génération textuelle OpenAI')
        .addTag('logs', 'Journaux d’activité')
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