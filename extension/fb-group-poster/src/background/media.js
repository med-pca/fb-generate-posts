/* Fetching a post's image so the composer can attach it. Port of app/media.py.
 *
 * Two things differ from the Python: the bytes never touch the disk (there is
 * no disk here), and the fetch happens in the service worker rather than in the
 * page -- a content script's fetch is bound by Facebook's own CORS rules, while
 * the extension's is bound by its host permissions.
 */

export class ImageError extends Error {}

const MAX_BYTES = 25 * 1024 * 1024;

// Content types Facebook's composer accepts, mapped to the file name the
// composer needs for it to be recognised.
const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

/* Download the image and hand it back as base64, ready for a DataTransfer in
 * the page. Returns null when the post carries no image.
 *
 * `relay(url)` is the fallback: it asks the platform to fetch the image and
 * returns its Response. Used when the site refuses the extension (a network
 * error, or 401/403 from hotlink protection) -- the platform is always
 * reachable, whatever the image's domain. */
export async function fetchImage(url, timeoutMs = 30000, relay = null) {
  const target = String(url || '').trim();
  if (!target) return null;

  let response;
  let direct = '';
  try {
    response = await fetchWithin(target, timeoutMs);
    if (!response.ok) direct = `HTTP ${response.status}`;
  } catch (err) {
    direct = err.name === 'AbortError' ? `pas de reponse en ${timeoutMs / 1000}s` : err.message;
  }
  if (direct && relay) {
    try {
      response = await relay(target);
      if (response.ok) direct = '';
      else direct += ` ; relais de la plateforme : HTTP ${response.status}`;
    } catch (err) {
      direct += ` ; relais de la plateforme : ${err.message}`;
    }
  }
  if (direct) throw new ImageError(`Image non telechargeable (${direct}) : ${target}`);

  const mime = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const extension = extensionFor(target, mime);
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new ImageError(`L'image est vide : ${target}`);
  if (buffer.byteLength > MAX_BYTES) {
    throw new ImageError(`L'image depasse ${Math.round(MAX_BYTES / (1024 * 1024))}Mo : ${target}`);
  }

  return {
    name: `fb-post.${extension}`,
    mime: mime && mime.startsWith('image/') ? mime : `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    base64: toBase64(buffer),
    bytes: buffer.byteLength,
  };
}

async function fetchWithin(target, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extensionFor(url, mime) {
  let fromUrl = '';
  try {
    fromUrl = decodeURIComponent(new URL(url).pathname).split('.').pop().toLowerCase();
  } catch (_) { /* not a parseable URL */ }
  if (SUPPORTED_EXTENSIONS.includes(fromUrl)) return fromUrl === 'jpeg' ? 'jpg' : fromUrl;
  if (EXTENSION_BY_TYPE[mime]) return EXTENSION_BY_TYPE[mime];
  throw new ImageError(
    `Type d'image non gere pour ${url} (extension ${fromUrl || 'aucune'}, Content-Type ${mime || 'aucun'})`,
  );
}

/* btoa() takes a string, so the bytes go over in 32 KB slices: spreading a
 * multi-megabyte array into String.fromCharCode blows the call stack. */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
