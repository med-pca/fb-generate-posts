import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SitesModule } from '../sites/sites.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { RewriterService } from './rewriter.service';
import { ScrapeController } from './scrape.controller';
import { SourceReaderService } from './source-reader.service';
import { WordpressWriterService } from './wordpress-writer.service';

/** La reprise d'une publication Facebook : collecte du post d'origine,
 * lecture de la page source, réécriture, puis dépôt WordPress. */
@Module({
  imports: [LlmModule, SitesModule],
  controllers: [IngestController, ScrapeController],
  providers: [
    IngestService,
    SourceReaderService,
    RewriterService,
    WordpressWriterService,
  ],
  exports: [IngestService, SourceReaderService, RewriterService],
})
export class IngestModule {}
