/* The group id the composer needs -- the rule that keeps a slug from being
 * taken for an id. Port of the checks in tests/test_worker.py. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubChrome } from './helpers.mjs';

stubChrome();
const { resolveGroupId } = await import('../src/background/orchestrator.js');

test("l'externalId numerique est la source de verite", () => {
  assert.equal(resolveGroupId({ groupExternalId: '422151397276363', groupUrl: 'https://fb.com/groups/slug' }), '422151397276363');
});

test('a defaut, un ID numerique en fin d’URL est accepte', () => {
  assert.equal(resolveGroupId({ groupExternalId: '', groupUrl: 'https://www.facebook.com/groups/12345/' }), '12345');
});

test('un slug ne passe pas pour un ID : le lot doit etre corrige dans l’admin', () => {
  assert.throws(
    () => resolveGroupId({ groupExternalId: 'mon-groupe', groupUrl: 'https://fb.com/groups/mon-groupe', groupName: 'Mon groupe' }),
    /ID Facebook numerique/,
  );
});
