import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SitesModule } from '../sites/sites.module';
import { WordpressModule } from '../wordpress/wordpress.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { RewriterService } from './rewriter.service';
import { ScrapeController } from './scrape.controller';
import { SourceReaderService } from './source-reader.service';
import { WordpressWriterService } from './wordpress-writer.service';
import { NewsService } from './news.service';
import { ImageTranslatorService } from './image-translator.service';
import { VisualsService } from '../visuals/visuals.service';
import { VisualsController } from '../visuals/visuals.controller';

/** La reprise d'une publication Facebook : collecte du post d'origine,
 * lecture de la page source, réécriture, puis dépôt WordPress. */
@Module({
  imports: [LlmModule, SitesModule, WordpressModule],
  controllers: [IngestController, ScrapeController, VisualsController],
  providers: [
    IngestService,
    SourceReaderService,
    RewriterService,
    WordpressWriterService,
    NewsService,
    ImageTranslatorService,
    VisualsService,
  ],

  exports: [IngestService, SourceReaderService, RewriterService, ImageTranslatorService],
})
export class IngestModule {}
