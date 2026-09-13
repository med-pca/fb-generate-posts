import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useStaticAssets({
    root: join(process.cwd(), 'public'),
    prefix: '/',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Data FB Posting API')
    .setDescription(
      'API de gestion des profils, groupes, contenus et lots de publication.',
    )
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
