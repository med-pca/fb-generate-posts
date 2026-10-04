/* L'identifiant du commentaire : sans lui, « . » ne reçoit jamais son lien.
 * Facebook l'écrit en chiffres ou en base64 (comment:<post>_<commentaire>). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScript } from './helpers.mjs';

const scope = await loadContentScript('../src/content/helpers.js', {
  location: { href: 'https://www.facebook.com/groups/2952843151497909/posts/28924441720578030/' },
});
const D = scope.FBX.dom;
const b64 = (s) => Buffer.from(s).toString('base64');

test('identifiant en chiffres', () => {
  assert.equal(D.commentIdOf('/groups/1/posts/2/?comment_id=1234567890'), '1234567890');
});

test('identifiant en base64 : comment:<post>_<commentaire>', () => {
  const id = encodeURIComponent(b64('comment:28924441720578030_1517305366187412'));
  assert.equal(
    D.commentIdOf(`https://www.facebook.com/groups/2952843151497909/posts/28924441720578030/?comment_id=${id}&__cft__[0]=x`),
    '1517305366187412',
  );
});

test('une réponse : reply_comment_id l’emporte', () => {
  assert.equal(D.commentIdOf('?comment_id=111&reply_comment_id=222'), '222');
});

test('un lien sans identifiant de commentaire ne rend rien', () => {
  assert.equal(D.commentIdOf('https://www.facebook.com/profile.php?id=42'), '');
  assert.equal(D.commentIdOf('?comment_id=pas-du-base64!'), '');
});
