import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AutomationAuthGuard } from '../auth/automation-auth.guard';
import { FailScrapeDto } from './dto/fail-scrape.dto';
import { ScrapeResultDto } from './dto/scrape-result.dto';
import { IngestService } from './ingest.service';

/** Ce que l'extension appelle pour relever les publications d'origine. Elle
 * est déjà connectée au compte : c'est le seul endroit d'où un post Facebook
 * se lit normalement. Même clé que les lots de publication. */
@ApiTags('jobs')
@ApiHeader({ name: 'X-API-Key', required: true })
@UseGuards(AutomationAuthGuard)
@Controller('jobs/scrape')
export class ScrapeController {
  constructor(private readonly ingest: IngestService) {}

  @Post('claim')
  @ApiOperation({
    summary: 'Réserver une publication à relever',
    description:
      'Rend une reprise en attente, ou `scrape: null`. La réservation ' +
      'expire après CLAIM_TTL_MINUTES et la reprise revient d’elle-même ' +
      'dans la file.',
  })
  @ApiQuery({ name: 'profileExternalId', required: false })
  claim(@Query('profileExternalId') profileExternalId?: string) {
    return this.ingest.claimScrape(profileExternalId);
  }

  @Post(':id/result')
  @ApiOperation({
    summary: 'Rendre le texte et l’image de la publication',
    description:
      'Rend la main tout de suite : la lecture de la page source, la ' +
      'réécriture et le dépôt WordPress prennent une minute, et l’extension ' +
      'a d’autres lots à traiter. Suivre l’avancement sur /admin/ingest/:id.',
  })
  async result(@Param('id') id: string, @Body() dto: ScrapeResultDto) {
    const ingest = await this.ingest.submitScrape(id, dto);
    // Volontairement sans `await`. La suite se poursuit côté serveur, et
    // chaque étape est enregistrée : rien ne se perd si l'extension s'en va.
    void this.ingest.advance(id).catch(() => undefined);
    return { accepted: true, ingestId: ingest.id, status: ingest.status };
  }

  @Post(':id/failed')
  @ApiOperation({ summary: 'Signaler une publication impossible à relever' })
  failed(@Param('id') id: string, @Body() dto: FailScrapeDto) {
    return this.ingest.failScrape(id, dto.error);
  }
}
