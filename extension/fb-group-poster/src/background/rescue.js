/* 🛟 Le profil sauveteur.
 *
 * Un AUTRE profil a publié un post, mais n'a pas réussi à mettre le lien dans
 * son premier commentaire (commentaire introuvable, modification refusée…).
 * Facebook ne laisse modifier un commentaire qu'à son auteur : ce profil-ci,
 * membre du même groupe, pose donc le lien dans SON propre commentaire, par le
 * même chemin que pour ses posts -- un « . », remplacé par le lien, vérifié
 * sur la page rechargée. Le lien est sous le post : la publication est sauvée,
 * sans suppression ni republication.
 *
 * Avant chaque lot, 2 au plus par passage (la plateforme les réserve pour lui).
 */

import { info, warn } from '../common/log.js';
import { composeFirstComment } from '../common/text.js';
import * as tab from './tab.js';
import { editToLink } from './links.js';

export async function rescueLinks(config, api, limit = 2) {
  if (config.rescueLinks === false) return { checked: 0, rescued: 0 };
  let due;
  try {
    due = await api.rescuesDue(config.profileExternalId, limit);
  } catch (err) {
    // Plateforme plus ancienne (route absente) ou muette : on passe.
    if (!/HTTP 404/.test(String(err.message))) await warn(`Sauvetages illisibles : ${err.message}`);
    return { checked: 0, rescued: 0 };
  }
  if (!Array.isArray(due) || !due.length) return { checked: 0, rescued: 0 };
  const working = await tab.workTab(config);
  let rescued = 0;
  for (const task of due) {
    const outcome = await rescueOne(working.id, config, task).catch((err) => ({ outcome: 'failed', detail: err.message }));
    try {
      await api.reportRescue(task.targetId, config.profileExternalId, outcome.outcome, outcome);
    } catch (err) {
      await warn(`Sauvetage non signale a la plateforme : ${err.message}`);
    }
    if (outcome.outcome !== 'failed') rescued += 1;
  }
  return { checked: due.length, rescued };
}

async function rescueOne(tabId, config, task) {
  const link = composeFirstComment(task.url);
  const postUrl = String(task.postUrl || '').replace(/[?&]comment_id=[^&]*/, '');
  const stepMs = config.stepTimeoutSeconds * 1000;
  const run = (name, args = {}) => tab.step(tabId, name, { stepTimeoutMs: stepMs, ...args }, stepMs + 20000);
  await info(`🛟 Sauvetage : poser le lien sous « ${task.title} » (${task.group})`);
  await tab.navigate(tabId, postUrl, config);
  if (config.focusWorkTab) await tab.focus(tabId);

  // Le lien y est peut-être déjà (l'auteur a fini par y arriver).
  const present = await run('pageHasLink', { url: link }).catch(() => null);
  if (present && present.ok) {
    await info('🛟 Le lien est deja sous le post : rien a faire');
    return { outcome: 'already', detail: 'lien déjà sous le post' };
  }
  // Notre nom (« Commenter en tant que … ») : pour reconnaître NOTRE commentaire.
  // Sans lui, son « . » se confondrait avec celui de l'auteur : on s'arrête.
  const me = await run('readAuthor', { stepTimeoutMs: 15000 }).catch((err) => ({ ok: false, reason: err.message }));
  if (!me || !me.ok) return { outcome: 'failed', detail: `nom du compte illisible sous le post : ${(me && me.reason) || 'sans réponse'}` };

  const placeholder = String(config.firstCommentText || '').trim() || '.';
  const written = await run('writeComment', { postContent: '', comment: placeholder });
  if (!written.ok) return { outcome: 'failed', detail: `commentaire impossible sous le post : ${written.reason}` };
  await tab.navigate(tabId, postUrl, config);
  const found = await run('readCommentId', { comment: placeholder });
  if (!found.ok) return { outcome: 'failed', detail: `commentaire posé mais introuvable : ${found.reason}` };

  const saved = await editToLink(tabId, config, found.id, postUrl, link);
  if (!saved.ok) return { outcome: 'failed', detail: `lien non posé : ${saved.reason}`, commentExternalId: found.id };
  await info(`🛟 Lien pose sous le post d'un autre profil : ${link}`);
  return { outcome: 'done', detail: 'lien posé dans le commentaire du profil sauveteur', commentExternalId: found.id };
}
