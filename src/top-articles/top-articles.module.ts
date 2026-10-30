import { Module } from '@nestjs/common';
import { TopArticlesController } from './top-articles.controller';
import { TopArticlesService } from './top-articles.service';

@Module({ controllers: [TopArticlesController], providers: [TopArticlesService] })
export class TopArticlesModule {}
