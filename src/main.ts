import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { registerWeb } from './web/web';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // 15 Mo : une image importée (rubrique Visuels) arrive en base64 dans le
    // corps ; au-delà de 1 Mo (défaut de Fastify), elle était refusée.
    new FastifyAdapter({ bodyLimit: 15 * 1024 * 1024 }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Plus de dossier public servi tel quel : la page de connexion est seule
  // publique, l'interface n'est servie qu'à une session valide.
  registerWeb(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Data FB Posting API')
    .setDescription(
      'API de gestion des profils, groupes, contenus et lots de publication.',
    )
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
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
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
