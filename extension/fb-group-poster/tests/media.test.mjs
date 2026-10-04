import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchImage, ImageError } from '../src/background/media.js';

const IMAGE = 'https://medaut.test/wp-content/uploads/photo.jpg';
const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });

async function withFetch(impl, run) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
}

test("l'image est prise directement quand le site la donne", async () => {
  let relayed = false;
  await withFetch(async () => jpeg(), async () => {
    const image = await fetchImage(IMAGE, 1000, async () => { relayed = true; return jpeg(); });
    assert.equal(image.name, 'fb-post.jpg');
    assert.equal(relayed, false);
  });
});

test('site refuse (Failed to fetch) : la plateforme relaie l’image', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    const image = await fetchImage(IMAGE, 1000, async (url) => {
      assert.equal(url, IMAGE);
      return jpeg();
    });
    assert.equal(image.mime, 'image/jpeg');
    assert.equal(image.bytes, 3);
  });
});

test('anti-hotlink (403) : la plateforme relaie aussi', async () => {
  await withFetch(async () => new Response('', { status: 403 }), async () => {
    const image = await fetchImage(IMAGE, 1000, async () => jpeg());
    assert.equal(image.bytes, 3);
  });
});

test('si le relais échoue aussi, l’erreur dit les deux causes', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(
      fetchImage(IMAGE, 1000, async () => new Response('', { status: 502 })),
      (err) => err instanceof ImageError && /Failed to fetch/.test(err.message) && /relais de la plateforme : HTTP 502/.test(err.message),
    );
  });
});

test('sans relais, le comportement reste celui d’avant', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(fetchImage(IMAGE, 1000), ImageError);
  });
});
