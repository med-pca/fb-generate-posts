import { Module } from '@nestjs/common';
import {
  chatCompletionsTransport,
  LLM_TRANSPORT,
  LlmService,
} from './llm.service';

/** Le passage aux modèles, mutualisé : un seul endroit sait quels
 * fournisseurs existent et dans quel ordre les essayer. */
@Module({
  providers: [
    LlmService,
    { provide: LLM_TRANSPORT, useValue: chatCompletionsTransport },
  ],
  exports: [LlmService],
})
export class LlmModule {}
