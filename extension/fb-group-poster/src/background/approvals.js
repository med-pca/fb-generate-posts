/* Les posts « en attente de validation » par l'administrateur du groupe.
 *
 * Soumis mais invisibles : la plateforme les garde en attente. Après chaque
 * lot, avant d'en réserver un autre, le profil revient voir les siens (2 au
 * plus par passage). Visible : il finit le travail -- premier commentaire,
 * puis l'URL -- avec les mêmes vérifications que d'habitude. Toujours
 * invisible : la plateforme le note, il reviendra après le lot suivant. Au
 * bout d'1 jour, la plateforme le marque « non validé ».
 */

import { info, warn } from '../common/log.js';
import { composePostBody } from '../common/text.js';
import * as tab from './tab.js';
import { findPublished } from './publish.js';
import { ensureComment, placeLinkNow } from './links.js';

/* Le groupe tel que la page l'attend : l'id numérique, sinon la fin de l'URL. */
function groupIdOf(group) {
  const ext = String((group && group.externalId) || '').trim();
  if (/^\d+$/.test(ext)) return ext;
  const tail = String((group && group.url) || '').trim().replace(/\/+$/, '').split('/').pop();
  return /^\d+$/.test(tail) ? tail : '';
}

export async function checkApprovals(config, api, limit = 2) {
  let due;
  try {
    due = await api.approvalsDue(config.profileExternalId, limit);
  } catch (err) {
    await warn(`Posts en attente de validation illisibles : ${err.message}`);
    return { checked: 0, approved: 0 };
  }
  if (!due.length) return { checked: 0, approved: 0 };
  const working = await tab.workTab(config);
  let approved = 0;
  for (const item of due) {
    const groupId = groupIdOf(item.group);
    const content = composePostBody(item.content);
    if (!groupId || !content) continue;
    await info(`Post en attente de validation (${item.group?.name || groupId}) : est-il visible maintenant ?`);
    const found = await findPublished(working.id, config, { groupId, content });
    // Sans son adresse, on ne peut ni le commenter ni être sûr qu'il est
    // visible de tous : on le considère encore en attente.
    if (!found.found || !found.permalink) {
      await api.reportApproval(item.targetId, 'pending').catch(() => null);
      await info('Toujours en attente de validation : nouvel essai apres le prochain lot');
      continue;
    }
    await api.reportApproval(item.targetId, 'approved', found.permalink);
    approved += 1;
    await info(`Valide par l'administrateur : ${found.permalink}`);

    const firstComment = !config.addFirstComment || item.noComment ? '' : String(config.firstCommentText || '').trim() || '.';
    if (!firstComment) continue;
    // Le travail reprend là où il s'était arrêté : le « . », puis l'URL.
    const comment = await ensureComment(
      working.id, api, { ...config, firstCommentText: firstComment },
      { jobId: item.jobId, postId: item.postId, commentExternalId: '' }, found.permalink,
    ).catch((err) => ({ ok: false, reason: err.message }));
    if (!comment.ok) {
      await warn(`Post valide, mais premier commentaire non pose : ${comment.reason}`);
      continue;
    }
    const saved = await api.markCommented(item.jobId, item.postId, comment.id).catch(() => null);
    const url = saved && saved.url ? String(saved.url) : '';
    if (!url || !item.willReceiveLink) continue;
    await placeLinkNow(working.id, api, config, {
      jobId: item.jobId, postId: item.postId, commentExternalId: comment.id, url, externalPostUrl: found.permalink,
    }).catch((err) => warn(`URL non posee apres validation : ${err.message} (nouvel essai a la cloture du lot)`));
  }
  return { checked: due.length, approved };
}
