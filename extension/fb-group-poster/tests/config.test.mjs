import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubChrome } from './helpers.mjs';

stubChrome();
const { getConfig, setConfig, configProblems, groupUrl, groupFeedUrl, DEFAULTS } = await import('../src/common/config.js');

test('les valeurs par defaut sont completes tant que rien n’est enregistre', async () => {
  const config = await getConfig();
  assert.equal(config.delayUnitSeconds, DEFAULTS.delayUnitSeconds);
  assert.equal(config.addFirstComment, true);
});

test("une ancienne option de pose automatique des liens est ignoree", async () => {
  await chrome.storage.local.set({ config: { placeLinksAfterJob: true } });
  const config = await getConfig();
  assert.equal(config.placeLinksAfterJob, undefined);
});

test('un champ vide ne devient pas un delai de zero seconde', async () => {
  const config = await setConfig({ stepTimeoutSeconds: 0, navigationTimeoutSeconds: NaN, idlePollSeconds: 5 });
  assert.equal(config.stepTimeoutSeconds, 10);
  assert.equal(config.navigationTimeoutSeconds, DEFAULTS.navigationTimeoutSeconds);
  assert.equal(config.idlePollSeconds, 30);
});

test('ce qui manque pour demarrer est nomme', () => {
  assert.deepEqual(configProblems({ apiBaseUrl: '', apiKey: '', profileExternalId: '' }).length, 3);
  assert.deepEqual(configProblems({ apiBaseUrl: 'http://x/api', apiKey: 'k', profileExternalId: 'p' }), []);
});

test("l'URL du groupe est construite, et la verification lit le fil chronologique", () => {
  assert.equal(groupUrl('123'), 'https://www.facebook.com/groups/123');
  // "Most relevant" does not surface a just-published post.
  assert.match(groupFeedUrl('123'), /sorting_setting=CHRONOLOGICAL$/);
});
