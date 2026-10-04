/* What the page is searched for. These prefixes are why a long post stopped
 * being reported missing and why a link comment can be found at all. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.mjs';

const scope = await loadContentScript('../src/content/helpers.js');
const D = scope.FBX.dom;

test('le post est cherche sur un prefixe : Facebook coupe le reste derriere "See more"', () => {
  const long = 'A'.repeat(300);
  assert.equal(D.needle(long).length, 100);
  assert.equal(D.needle('  deux   espaces\nligne '), 'deux espaces ligne');
});

test("un commentaire portant un lien est cherche sur l'hote : le reste de l'URL n'est pas affiche", () => {
  assert.equal(
    D.commentNeedle('https://pulserecipe.com/recipes/creamy-tomato-tortellini'),
    'pulserecipe.com',
  );
  assert.equal(D.commentNeedle('\u{1F449} https://PulseRecipe.com/x'), 'pulserecipe.com');
});

test('un commentaire sans lien est cherche sur son texte', () => {
  assert.equal(D.commentNeedle('Bonjour tout le monde'), 'bonjour tout le monde');
  assert.equal(D.commentNeedle('B'.repeat(80)).length, 50);
});

test('compter les occurrences : le texte deux fois = le post et son commentaire', () => {
  assert.equal(D.occurrences('abc abc abc', 'abc'), 3);
  assert.equal(D.occurrences('aaaa', 'aa'), 2);
  assert.equal(D.occurrences('rien', 'abc'), 0);
});

// Facebook n'affiche jamais un lien tel qu'il a été tapé. Comparer le texte
// exact ne reconnaissait pas un lien pourtant posé : le commentaire était
// modifié une deuxième fois, et jamais confirmé à l'API.
const URL_ = 'https://foodtime.nordiskmat.com/hidden-smartphone-tricks-you-probably-didnt-know-you-could-use/';

test('un lien est reconnu sans son schema, sans www et sans / final', () => {
  const wanted = D.canonUrl(URL_);
  assert.equal(wanted, 'foodtime.nordiskmat.com/hidden-smartphone-tricks-you-probably-didnt-know-you-could-use');
  assert.ok(D.showsUrl('foodtime.nordiskmat.com/hidden-smartphone-tricks-you-probably-didnt-know-you-could-use/', wanted));
  assert.ok(D.showsUrl('https://www.foodtime.nordiskmat.com/hidden-smartphone-tricks-you-probably-didnt-know-you-could-use', wanted));
});

test('un lien raccourci par Facebook avec « … » est reconnu', () => {
  const wanted = D.canonUrl(URL_);
  assert.ok(D.showsUrl('foodtime.nordiskmat.com/hidden-smartphone-tricks…', wanted));
  assert.ok(D.showsUrl('foodtime.nordiskmat.com/hidden-sm…know-you-could-use/', wanted));
});

test("un autre lien, ou un raccourci trop court, n'est pas pris pour le bon", () => {
  const wanted = D.canonUrl(URL_);
  assert.ok(!D.showsUrl('foodtime.nordiskmat.com/another-article…', wanted));
  assert.ok(!D.showsUrl('foo…', wanted));
  assert.ok(!D.showsUrl('Le texte du post', wanted));
});

// Le post « soumis mais introuvable dans le fil » : Facebook affiche les
// emojis en images (absentes du texte lu) et peut rendre autrement les
// caractères stylisés. La clé ne garde que lettres et chiffres.
test('un post se retrouve malgre ses emojis, rendus en images par Facebook', () => {
  const published = '🩸 7 powerful blood-thinning foods you need to know about 👇 #health';
  const onThePage = '7 powerful blood-thinning foods you need to know about #health'; // emojis = images
  assert.ok(D.lettersOnly(onThePage).includes(D.postKey(published)));
});

test('les caracteres stylises (𝐏𝐋𝐄𝐀𝐒𝐄) sont ramenes a leurs lettres', () => {
  assert.equal(D.postKey('𝐏𝐋𝐄𝐀𝐒𝐄 𝐒.𝐀.𝐘'), 'pleasesay');
});

test('ponctuation, espaces et casse ne comptent pas, la cle reste courte', () => {
  assert.equal(D.postKey("Stretch Your Ring Finger — with Your Thumb… and Hold It!"), 'stretchyourringfingerwithyourthumbandholdit');
  assert.equal(D.postKey('a'.repeat(200)).length, 60);
});
