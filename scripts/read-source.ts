/**
 * Essai direct de l'étape de lecture, et de la réécriture si les clés sont
 * en place. Rien n'est écrit : ni base, ni WordPress, ni Facebook.
 *
 *   npx ts-node scripts/read-source.ts <url> [--rewrite] [--lang fr]
 */
// Lancé hors de Nest : personne n'a encore lu le .env.
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { chatCompletionsTransport, LlmService } from '../src/llm/llm.service';
import { RewriterService } from '../src/ingest/rewriter.service';
import { SourceReaderService } from '../src/ingest/source-reader.service';

async function main() {
  const [url, ...flags] = process.argv.slice(2);
  if (!url) {
    console.error(
      'Usage : npx ts-node scripts/read-source.ts <url> [--rewrite] [--lang fr]',
    );
    process.exit(1);
  }
  // `indexOf` rend -1 quand le drapeau est absent, et flags[0] serait alors
  // pris pour la langue.
  const at = flags.indexOf('--lang');
  const language = at >= 0 ? flags[at + 1] || 'auto' : 'auto';

  const source = await new SourceReaderService().read(url);
  console.log('\n=== Page source ===');
  console.log('URL lue    :', source.url);
  console.log('Titre      :', source.title);
  console.log('Site       :', source.siteName ?? '—');
  console.log('Image      :', source.leadImageUrl ?? '—');
  console.log('Longueur   :', source.text.length, 'caractères');
  console.log('\n--- Début du texte ---');
  console.log(source.text.slice(0, 600));

  if (!flags.includes('--rewrite')) {
    console.log('\n(--rewrite pour enchaîner sur la réécriture)');
    return;
  }
  const llm = new LlmService(
    new ConfigService(process.env),
    chatCompletionsTransport,
  );
  const providers = llm.providers();
  if (!providers.length) {
    throw new Error(
      'Aucun fournisseur configuré : renseigner KIMI_API_KEY, OPENAI_API_KEY ou GEMINI_API_KEY',
    );
  }
  console.log(
    '\nFournisseurs, dans l’ordre :',
    providers
      .map((provider) => `${provider.name} (${provider.model})`)
      .join(' → '),
  );
  const generated = await new RewriterService(llm).rewrite({
    source,
    language,
  });
  console.log('\n=== Article réécrit ===');
  console.log('Titre      :', generated.title);
  console.log('Slug       :', generated.slug);
  console.log('Extrait    :', generated.excerpt);
  console.log('Meta       :', generated.metaDescription);
  console.log('Hashtags   :', generated.hashtags.join(', '));
  console.log('\n--- Légende Facebook ---');
  console.log(generated.caption);
  console.log('\n--- Corps HTML ---');
  console.log(generated.contentHtml);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\nÉchec :', message);
  process.exit(1);
});
