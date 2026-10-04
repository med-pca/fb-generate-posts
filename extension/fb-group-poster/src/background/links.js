/* The second phase: putting each post's link into the comment it left behind.
 * Port of app/links.py.
 *
 * The API keeps the link back until a job is closed, so that a post never
 * carries an outbound link while Facebook is deciding who sees it. Once closed,
 * the comment written under that post is edited to carry the link -- which is
 * why the comment's own identifier was recorded when it was written.
 *
 *     claim -> publish -> comment -> complete      (orchestrator.js)
 *     link-updates -> edit that comment -> link-updated   (here)
 */

import { composeFirstComment } from '../common/text.js';
import { info, warn, error } from '../common/log.js';
import * as tab from './tab.js';
import * as cdp from './cdp.js';

const EVENT_PLACED = 'WORKER_LINK_PLACED';
const EVENT_FAILED = 'WORKER_LINK_FAILED';

export async function placeLinks(tabId, api, config, { jobId = '', limit = 20 } = {}) {
  const tally = { pending: 0, placed: 0, failed: 0, errors: [] };

  let updates;
  try {
    // A normal publishing pass scopes itself to the batch that just finished, so
    // a stale queue entry from an older run can never pull the browser away.
    updates = jobId
      ? await api.jobLinkUpdates(jobId)
      : await api.pendingLinkUpdates(config.profileExternalId, limit);
  } catch (err) {
    await error(`Liens en attente illisibles : ${err.message}`);
    tally.failed += 1;
    tally.errors.push(err.message);
    return tally;
  }

  // The most recent batch first: the backlog can hold weeks-old entries, and
  // they must not stand in front of the job that just finished.
  updates = [...updates].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  tally.pending = updates.length;
  if (!updates.length) {
    await info('Aucun commentaire n’attend son lien');
    return tally;
  }
  await info(`${updates.length} commentaire(s) attendent leur lien${jobId ? ` (job ${jobId})` : ''}`);

  return placeUpdates(tabId, api, config, updates, tally);
}

/* The link of ONE post, right after its comment was written: the normal path
 * now. The pass at the end of the job only picks up what this one missed. */
export async function placeLinkNow(tabId, api, config, update) {
  const tally = { pending: 1, placed: 0, failed: 0, errors: [] };
  await info(`Modification du premier commentaire avec l'URL du post ${update.postId}...`);
  return placeUpdates(tabId, api, config, [update], tally);
}

async function placeUpdates(tabId, api, config, updates, tally) {
  // One debugger session for the whole pass. Without it the edit falls back to
  // synthetic events, which Facebook ignores on this step -- say so plainly.
  let trusted = false;
  try {
    await cdp.attach(tabId);
    trusted = true;
  } catch (err) {
    await warn(`Saisie de confiance indisponible (${err.message}) : essai en evenements simules`);
  }
  try {
    for (const update of updates) {
      await placeOne(tabId, api, config, update, tally, trusted);
    }
  } finally {
    if (trusted) {
      // An editor left open is what makes Facebook ask "Leave site?" later.
      await cdp.pressEscape(tabId).catch(() => null);
      await cdp.detach(tabId);
    }
  }
  return tally;
}

async function placeOne(tabId, api, config, update, tally, trusted) {
  const link = composeFirstComment(update.url);
  const where = update.externalPostUrl;
  const ids = { postId: update.postId, jobId: update.jobId };

  if (!where) {
    await warn(`Aucun lien de post enregistre pour ${update.postId} : son commentaire est inatteignable`);
    tally.failed += 1;
    tally.errors.push(`${update.postId}: pas de lien de post`);
    return;
  }

  const target = where.includes('comment_id=')
    ? where
    : `${where}${where.includes('?') ? '&' : '?'}comment_id=${update.commentExternalId}`;

  let saved;
  try {
    await info(`Pose du lien dans le commentaire ${update.commentExternalId}`);
    await tab.navigate(tabId, target, config);
    if (config.focusWorkTab) await tab.focus(tabId);
    const stepMs = config.stepTimeoutSeconds * 1000;
    saved = trusted
      ? await editTrusted(tabId, update.commentExternalId, link, stepMs, config)
      : await tab.step(
        tabId,
        'editCommentById',
        { commentId: update.commentExternalId, newText: link, stepTimeoutMs: stepMs },
        stepMs + 20000,
      );
  } catch (err) {
    tally.failed += 1;
    tally.errors.push(`${update.postId}: ${err.message}`);
    await api.log(EVENT_FAILED, err.message, { level: 'ERROR', ...ids });
    return;
  }

  if (!saved.ok && saved.skipped) {
    await warn(`Post ${update.postId} : commentaire laisse tel quel -- ${saved.reason}`);
    tally.failed += 1;
    tally.errors.push(`${update.postId}: ${saved.reason}`);
    await api.log(EVENT_FAILED, `Not edited: ${saved.reason}`, { level: 'WARN', ...ids });
    return;
  }
  if (!saved.ok) {
    await error(`Post ${update.postId} : ${saved.reason}`);
    tally.failed += 1;
    tally.errors.push(`${update.postId}: ${saved.reason}`);
    await api.log(EVENT_FAILED, saved.reason, { level: 'ERROR', ...ids });
    return;
  }
  if (saved.alreadyThere) await info('Ce commentaire portait deja le lien : enregistre sans le modifier');

  try {
    await api.markLinkUpdated(update.jobId, update.postId);
  } catch (err) {
    // Facebook has saved the link, but the workflow is not acknowledged. A
    // retry checks that same comment before attempting another edit.
    await warn(`Lien pose mais non enregistre pour ${update.postId} : ${err.message}`);
    tally.failed += 1;
    tally.errors.push(`${update.postId}: lien sauve sur Facebook, confirmation API en attente : ${err.message}`);
    return;
  }
  tally.placed += 1;
  await info(`Lien pose : ${link}`);
  await api.log(EVENT_PLACED, `Link placed: ${link}`, ids);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const SHORT_MS = 5000;

/* Poll a page step from here until it answers ok, or say why it never did. */
async function until(tabId, name, args, ms) {
  const deadline = Date.now() + ms;
  let last = { ok: false, reason: 'no answer' };
  for (;;) {
    try {
      last = await tab.step(tabId, name, args, SHORT_MS + 10000);
    } catch (err) {
      last = { ok: false, reason: err.message };
    }
    if (last.ok || Date.now() >= deadline) return last;
    await sleep(700);
  }
}

/* Port of composer._rewrite_by_id: the page says where things are, the
 * debugger hovers, clicks and types there. Hover, "...", Edit, replace, Enter
 * -- and the whole round again if any of it did not take, because each of
 * those controls can be in the DOM before Facebook is listening to it. */
async function editTrusted(tabId, commentId, newText, stepMs, config) {
  const present = await tab.step(tabId, 'locateComment', { commentId, timeoutMs: stepMs }, stepMs + 10000);
  if (!present.ok) return present;

  const holds = { commentId, text: newText };
  const before = await tab.step(tabId, 'commentHoldsText', holds);
  if (before.ok) return { ok: true, alreadyThere: true };
  // Somebody (or an older run) already put a link here: leave it alone.
  if (before.otherLink) return { ok: false, skipped: true, reason: before.reason };

  const deadline = Date.now() + stepMs;
  let reason = 'the comment never became editable';
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    if (attempt > 1) await cdp.pressEscape(tabId).catch(() => null);

    const anchor = await tab.step(tabId, 'locateComment', { commentId, timeoutMs: SHORT_MS }, SHORT_MS + 10000);
    if (!anchor.ok) { reason = anchor.reason; continue; }
    // The "..." button only exists while the pointer is over the comment.
    await cdp.hover(tabId, anchor.x, anchor.y);
    await sleep(400);

    const menu = await tab.step(tabId, 'locateCommentMenu', { commentId, timeoutMs: SHORT_MS }, SHORT_MS + 10000);
    if (!menu.ok) { reason = menu.reason; continue; }
    await cdp.click(tabId, menu.x, menu.y);
    await sleep(600);

    const item = await tab.step(tabId, 'locateEditItem', { timeoutMs: SHORT_MS }, SHORT_MS + 10000);
    if (!item.ok) { reason = item.reason; continue; }
    await tab.step(tabId, 'snapshotEditors', {});
    await cdp.click(tabId, item.x, item.y);

    const editor = await tab.step(tabId, 'focusEditor', { timeoutMs: SHORT_MS }, SHORT_MS + 10000);
    if (!editor.ok) { reason = editor.reason; continue; }
    // The space after the URL is what makes Facebook see a finished link and
    // fetch its preview; it is trimmed on save.
    await cdp.insertText(tabId, `${newText} `);
    await sleep(1000);

    // Never send a half-replaced comment: the old text plus the link would be
    // saved as is.
    const typed = await tab.step(tabId, 'editorText', {});
    if (typed.ok && norm(typed.text) !== norm(newText)) {
      reason = `the edit box holds "${typed.text.slice(0, 120)}", not the link`;
      continue;
    }
    await waitForPreview(tabId, commentId, config, 'editor');
    await cdp.pressEnter(tabId);

    const saved = await until(tabId, 'commentHoldsText', holds, stepMs);
    if (saved.ok) {
      if (attempt > 1) await info(`Commentaire modifie a la tentative ${attempt}`);
      // Stay while the saved comment loads the site's image too, instead of
      // leaving the instant the link is in.
      await waitForPreview(tabId, commentId, config, 'comment');
      return { ok: true };
    }
    reason = `the edit did not take: ${saved.reason}`;
  }
  return { ok: false, reason: `could not edit comment ${commentId}: ${reason}` };
}

/* Let Facebook fetch the site and show its card: never less than the minimum,
 * never more than the maximum. Not finding a card is not a failure -- some
 * sites have none -- so it is only logged. */
async function waitForPreview(tabId, commentId, config, where) {
  const minMs = Math.max(0, Number(config.linkPreviewMinSeconds) || 0) * 1000;
  const maxMs = Math.max(minMs, (Number(config.linkPreviewWaitSeconds) || 0) * 1000);
  if (!maxMs) return;
  const started = Date.now();
  const card = await until(tabId, 'linkPreview', { commentId, where }, maxMs);
  const left = minMs - (Date.now() - started);
  if (left > 0) await sleep(left);
  const took = Math.round((Date.now() - started) / 1000);
  const label = where === 'editor' ? 'avant enregistrement' : 'apres enregistrement';
  if (card.ok) await info(`Apercu du site charge ${label} (${took}s)`);
  else await warn(`Apercu du site non detecte ${label} apres ${took}s : ${card.reason}`);
}
