/* Publishing one post: the sequence app/facebook/composer.py drove over CDP.
 *
 * The steps themselves live in the page (src/content/steps.js). What is here is
 * the order they go in, and the navigations between them -- because a page
 * change destroys the code running inside it.
 *
 *   group feed -> composer -> text -> image -> Post -> verify in the feed
 *   -> read the post id -> open the post -> first comment -> read its id
 */

import { groupUrl, groupFeedUrl, groupOwnPostsUrl } from '../common/config.js';
import { info, warn, error } from '../common/log.js';
import * as tab from './tab.js';
import * as cdp from './cdp.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Tentatives au plus pour chaque étape vérifiée, avant de passer à la suite. */
export const MAX_TRIES = 3;

const result = (fields) => ({
  success: false,
  postPublished: false,
  message: '',
  postId: '',
  permalink: '',
  commentId: '',
  author: '',
  ...fields,
});

export async function publishPost(tabId, config, job) {
  try {
    return await publishPostFocused(tabId, config, job);
  } finally {
    // La barre « débogage en cours » ne reste pas entre deux posts.
    await cdp.detach(tabId).catch(() => null);
  }
}

async function publishPostFocused(tabId, config, job) {
  const { groupId, content, firstComment, image } = job;
  const stepMs = config.stepTimeoutSeconds * 1000;
  const wireMs = stepMs + 20000;
  let author = job.author || '';
  const run = (name, args = {}) => tab.step(tabId, name, { stepTimeoutMs: stepMs, author, ...args }, wireMs);

  // -- everything before the Post click: a failure here published nothing ----
  try {
    await info(`Ouverture du groupe ${groupId}`);
    await tab.navigate(tabId, groupUrl(groupId), config);
    if (config.focusWorkTab) await tab.focus(tabId);

    let opened = await run('openComposer');
    if (!opened.ok) {
      // Souvent passager quand plusieurs profils tournent sur la machine : la
      // page, restée en arrière-plan, n'a pas fini de se dessiner. On la
      // recharge une fois avant d'abandonner.
      await warn(`Composeur absent (${opened.reason}) : rechargement du groupe et nouvel essai`);
      await tab.navigate(tabId, groupUrl(groupId), config);
      await sleep(3000);
      opened = await run('openComposer');
    }
    if (!opened.ok) return result({ message: `Le composeur ne s'est pas ouvert : ${opened.reason}` });

    const named = await run('readAuthor');
    if (named.ok) {
      author = named.name;
      await info(`Publication en tant que ${author}`);
    } else {
      // Matching on text alone is ambiguous when two accounts post the same
      // content in one group -- but it is not a reason to stop.
      await warn("Nom du compte illisible : les posts seront reconnus sur leur texte seul");
    }

    await info('Saisie du contenu...');
    const typed = await run('typeContent', { content });
    if (!typed.ok) return result({ message: typed.reason, author });
    if (typed.discardedDraft) {
      await warn(`Brouillon Facebook ecarte du composeur : "${typed.discardedDraft.slice(0, 80)}"`);
    }

    if (image) {
      await info(`Image jointe (${Math.round(image.bytes / 1024)} Ko)`);
      const attached = await run('attachImage', { file: image });
      if (!attached.ok) return result({ message: attached.reason, author });
      // Attaching rebuilds part of the composer; make sure the text held.
      const held = await run('checkContent', { content });
      if (!held.ok || normalise(held.text) !== normalise(content)) {
        return result({ message: `L'image a modifie le texte du post : "${(held.text || '').slice(0, 120)}"`, author });
      }
    }
  } catch (err) {
    // Nothing was submitted: the composer never got as far as the Post click.
    return result({ message: `Page : ${err.message}`, author });
  }

  // -- the Post click, and everything after it -----------------------------
  let submitted;
  try {
    await info('Publication...');
    if (job.onSubmit) await job.onSubmit();
    submitted = await run('submit');
  } catch (err) {
    // The click may have gone through before the page stopped answering.
    return result({ message: `Post peut-etre soumis, page muette : ${err.message}`, postPublished: true, author });
  }

  if (submitted.blocked) {
    // « We limit how often you can post… » : la plateforme met ce profil en
    // pause et confie son travail aux autres. Rien n'est parti.
    return result({ message: 'Facebook a refuse la publication (publication bloquee : limite de publication)', author, blocked: true });
  }
  if (!submitted.ok) {
    // A composer still on screen does NOT mean nothing was submitted. Verified
    // on the live site: posts reported here as unsubmitted were on the feed. So
    // the feed gets the last word -- and since Post is not clicked again,
    // checking costs nothing but a moment.
    await warn(`${submitted.reason} -- verification dans le fil avant d'abandonner`);
  }

  try {
    return await afterSubmit(tabId, config, { ...job, author }, submitted);
  } catch (err) {
    // Past this point Facebook may already hold the post, and the page can no
    // longer tell us. postPublished stops a retry: it would publish twice.
    return result({ message: `Post soumis mais la page ne repond plus : ${err.message}`, postPublished: true, author });
  }
}

async function afterSubmit(tabId, config, job, submitted) {
  const { groupId, content, firstComment } = job;
  let author = job.author || '';
  const stepMs = config.stepTimeoutSeconds * 1000;
  const wireMs = stepMs + 20000;
  const run = (name, args = {}) => tab.step(tabId, name, { stepTimeoutMs: stepMs, author, ...args }, wireMs);

  await info('Verification de la publication...');
  await tab.navigate(tabId, groupFeedUrl(groupId), config);
  // The feed carries "Comment as <name>" under its posts, which names the
  // account more reliably than the composer dialog did.
  const named = await run('readAuthor');
  if (named.ok) author = named.name;

  let seen = await run('verifyPublished', { content, stepTimeoutMs: Math.min(stepMs, 20000) });
  if (!seen.ok) {
    const state = await run('composerState');
    if (submitted.pending || state.pending) {
      // Submitted, not visible: a moderator still has to let it through.
      // postPublished is what stops a retry -- if it is approved later,
      // republishing would put the same content up twice.
      return result({ message: 'Post soumis mais en attente de validation par un moderateur', postPublished: true, author });
    }
  }
  // Le fil ouvert juste après la publication ne contient pas toujours encore
  // le nouveau post, et il ne se met pas à jour seul : on le recharge, puis on
  // regarde « Votre contenu publié », où ne figurent que les posts du compte.
  for (const [label, url] of [
    ['Rechargement du fil', groupFeedUrl(groupId)],
    ['Recherche dans « Votre contenu publie »', groupOwnPostsUrl(groupId)],
  ]) {
    if (seen.ok) break;
    await info(`${label}...`);
    await tab.navigate(tabId, url, config);
    seen = await run('verifyPublished', { content });
  }
  if (!seen.ok) {
    if (submitted.ok) {
      // La fenêtre de publication s'est fermée sur le clic : Facebook a pris le
      // post. Introuvable ne veut pas dire absent — le marquer en échec
      // inviterait une relance qui le publierait deux fois. Il est donc
      // enregistré comme publié, sans commentaire, à vérifier à la main.
      return result({
        message: `Post soumis mais non retrouve dans le groupe, ni dans « Votre contenu publie » (${seen.reason}) : a verifier a la main, premier commentaire non pose`,
        postPublished: true,
        author,
      });
    }
    return result({ message: `Post soumis mais introuvable dans le fil (le plus recent en premier) : ${seen.reason}`, author });
  }
  await info('Post visible dans le fil du groupe');

  const identified = await run('readPostId', { content });
  const postId = identified.ok ? identified.id : '';
  const permalink = identified.ok ? identified.url : '';
  if (postId) await info(`Post ID: ${postId} -- ${permalink}`);
  else await warn(`ID du post illisible : ${identified.reason}`);

  const published = result({ success: true, postPublished: true, postId, permalink, author, message: 'Post publie' });
  if (!firstComment) return published;

  // -- the first comment ---------------------------------------------------
  if (permalink) {
    // One post on the page: no chance of commenting under someone else's.
    await info(`Ouverture du post : ${permalink}`);
    await tab.navigate(tabId, permalink, config);
    await run('verifyPublished', { content });
  }
  // Chaque étape est vérifiée et refaite si elle n'a pas eu lieu (souris
  // bougée, saisie perdue) — 3 tentatives au plus, puis on passe à la suite.
  let written = { ok: false, reason: 'not tried' };
  for (let attempt = 1; attempt <= MAX_TRIES && !written.ok; attempt += 1) {
    if (attempt > 1) {
      if (!permalink) break;
      await info(`Premier commentaire absent : tentative ${attempt}/${MAX_TRIES}...`);
      await tab.navigate(tabId, permalink, config);
      // Peut-être posé malgré tout : on regarde avant de réécrire.
      const there = await run('commentPosted', { postContent: content, comment: firstComment, stepTimeoutMs: 8000 });
      if (there.ok) { written = { ok: true }; break; }
    } else {
      await info('Ajout du premier commentaire...');
    }
    written = await run('writeComment', { postContent: content, comment: firstComment });
    if (written.ok && permalink) {
      // Confirmé sur une page rechargée, pas seulement à l'écran.
      await tab.navigate(tabId, permalink, config);
      const landed = await run('commentPosted', { postContent: content, comment: firstComment, stepTimeoutMs: 15000 });
      if (!landed.ok) written = { ok: false, reason: `absent apres rechargement : ${landed.reason}` };
    }
  }
  if (!written.ok) {
    return { ...published, success: false, message: `Post publie, mais le premier commentaire a echoue apres ${MAX_TRIES} tentatives : ${written.reason}` };
  }

  let identifiedComment = { ok: false, reason: 'not read' };
  for (let attempt = 1; attempt <= MAX_TRIES && !identifiedComment.ok; attempt += 1) {
    if (attempt > 1 && permalink) await tab.navigate(tabId, permalink, config);
    identifiedComment = await run('readCommentId', { comment: firstComment });
  }
  if (identifiedComment.ok) await info(`Commentaire ${identifiedComment.id} enregistre`);
  else await warn(`ID du commentaire illisible apres ${MAX_TRIES} tentatives : ${identifiedComment.reason}`);

  return {
    ...published,
    commentId: identifiedComment.ok ? identifiedComment.id : '',
    message: 'Post publie, avec son premier commentaire',
  };
}

/* Is this post already on the group's feed? Asked after a crash, before
 * anything is reported to the API: the post was consumed, the run stopped
 * mid-flight, and only the page can say whether it went out. */
export async function findPublished(tabId, config, { groupId, content }) {
  const stepMs = config.stepTimeoutSeconds * 1000;
  try {
    await tab.navigate(tabId, groupFeedUrl(groupId), config);
    const named = await tab.step(tabId, 'readAuthor', { stepTimeoutMs: stepMs }, stepMs + 20000);
    const author = named.ok ? named.name : '';
    const seen = await tab.step(tabId, 'verifyPublished', { content, author, stepTimeoutMs: stepMs }, stepMs + 20000);
    if (!seen.ok) return { found: false, reason: seen.reason };
    const identified = await tab.step(tabId, 'readPostId', { content, author, stepTimeoutMs: stepMs }, stepMs + 20000);
    return { found: true, postId: identified.ok ? identified.id : '', permalink: identified.ok ? identified.url : '' };
  } catch (err) {
    await error(`Verification impossible apres interruption : ${err.message}`);
    return { found: false, reason: err.message, unknown: true };
  }
}

const normalise = (text) => String(text || '').split(/\s+/).filter(Boolean).join(' ');
