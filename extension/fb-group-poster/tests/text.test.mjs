import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unescapeHtml, composePostBody, composeFirstComment } from '../src/common/text.js';

test('les entites HTML sont decodees avant la composition', () => {
  // A post went out reading "Mango-Poblano Salsa &amp; Coconut Rice".
  assert.equal(composePostBody('Salsa &amp; Coconut Rice'), 'Salsa & Coconut Rice');
  assert.equal(unescapeHtml('caf&eacute; &#233; &#x2026;'), 'café é …');
});

test('une entite inconnue est laissee telle quelle', () => {
  assert.equal(unescapeHtml('&nonsense; &amp;'), '&nonsense; &');
});

test('le corps du post est le seul texte, sans titre ni lien', () => {
  assert.equal(composePostBody('   du texte\n\nsur deux paragraphes  '), 'du texte\n\nsur deux paragraphes');
  assert.equal(composePostBody(''), '');
  assert.equal(composePostBody(null), '');
});

test('le premier commentaire porte le lien seul', () => {
  assert.equal(composeFirstComment('  https://pulserecipe.com/a  '), 'https://pulserecipe.com/a');
  assert.equal(composeFirstComment(''), '');
});
