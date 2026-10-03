/* Ce que le vérificateur fait pour NOS profils dans un groupe dont il est
 * administrateur ou modérateur :
 *   - approve(member)    : accepter leur demande d'adhésion ;
 *   - preapprove(member) : les pré-approuver (leurs posts paraissent sans
 *                          validation).
 *
 * LA règle de sécurité : on n'agit QUE sur une ligne qui porte l'identifiant
 * Facebook numérique reçu de la plateforme, et sur aucune autre. Jamais sur
 * un nom (deux personnes peuvent s'appeler pareil). Une ligne qui mêle
 * plusieurs personnes est ambiguë : on ne clique pas.
 *
 * Injecté avec check.js (chrome.scripting) ; expose self.FPM.
 */
(() => {
  if (self.FPM) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Voyelles arabes, accents, tatweel : retirés avant de comparer.
  const fold = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[̀-ًͯ-ٰٟـ‌-‏]/g, '')
      .replace(/[آأإ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const words = (list) => list.map(fold);
  const labelOf = (el) => fold(el.getAttribute('aria-label') || el.innerText || el.textContent || '');

  const APPROVE = words(['approve', 'approuver', 'accepter', 'aprobar', 'aceptar', 'aprovar', 'genehmigen', 'approva', 'onayla', 'zatwierdź', 'goedkeuren', 'موافقة', 'قبول', 'الموافقة', 'وافق']);
  const PREAPPROVE = words([
    'pre-approve', 'preapprove', 'pre-approve posts', 'pre-approve member', 'approve all future posts',
    'pré-approuver', 'préapprouver', 'pré-approuver les publications', 'approuver automatiquement',
    'approuver toutes les publications futures',
    'aprobar previamente', 'preaprobar', 'pré-aprovar', 'vorab genehmigen', 'pre-approva', 'önceden onayla',
    'الموافقة المسبقة', 'موافقة مسبقة', 'الموافقه المسبقه على المنشورات',
  ]);
  const ALREADY_PREAPPROVED = words([
    'remove pre-approval', 'remove from pre-approved', 'pre-approved', 'retirer la pré-approbation', 'pré-approuvé',
    'quitar aprobación previa', 'إزالة الموافقة المسبقة', 'تمت الموافقة المسبقة',
  ]);
  const MANAGE = words(['manage', 'member settings', 'admin tools', 'more', 'gérer', 'plus', "plus d'options", 'outils d’admin', 'administrar', 'más', 'verwalten', 'gestisci', 'إدارة', 'المزيد', 'خيارات']);
  const CONFIRM = words(['confirm', 'pre-approve', 'approve', 'ok', 'confirmer', 'pré-approuver', 'approuver', 'confirmar', 'bestätigen', 'conferma', 'تأكيد', 'موافقة']);
  const UNAVAILABLE = /this content isn.?t available|ce contenu n.?est pas disponible|contenu indisponible|هذا المحتوى غير متاح/i;

  const isLabel = (el, list) => list.includes(labelOf(el));
  const hasLabel = (el, list) => {
    const l = labelOf(el);
    return list.some((w) => l === w || l.startsWith(`${w} `) || l.includes(w));
  };
  // Mot entier : « pré-approuvé » (déjà fait) ne doit pas se lire dans
  // « pré-approuver les publications » (à faire).
  const hasPhrase = (el, list) => {
    const l = ` ${labelOf(el)} `;
    return list.some((w) => l.includes(` ${w} `));
  };
  const buttons = (root) => [...root.querySelectorAll('[role="button"], button, [role="menuitem"], [role="menuitemcheckbox"]')];

  /** L'identifiant de personne qu'un lien désigne (/user/<id>/ dans un
   * groupe, profile.php?id=<id>), ou ''. */
  function idOfHref(href) {
    const m = /\/user\/(\d{5,20})(?:[/?#]|$)/.exec(href || '') || /[?&]id=(\d{5,20})(?:&|#|$)/.exec(href || '');
    return m ? m[1] : '';
  }
  function memberIdsIn(root) {
    const ids = new Set();
    for (const a of root.querySelectorAll('a[href]')) {
      const id = idOfHref(a.getAttribute('href'));
      if (id) ids.add(id);
    }
    return ids;
  }

  /** La ligne de CE membre qui porte le bouton voulu. On remonte depuis un
   * lien vers son identifiant jusqu'au premier bloc qui contient le bouton ;
   * ce bloc ne doit désigner que lui, sinon on ne touche à rien. */
  function rowOf(id, wanted) {
    const anchors = [...document.querySelectorAll('a[href]')].filter((a) => idOfHref(a.getAttribute('href')) === id);
    let ambiguous = false;
    for (const a of anchors) {
      let el = a;
      for (let i = 0; i < 18 && el && el !== document.body; i += 1) {
        el = el.parentElement;
        if (!el) break;
        const button = buttons(el).find((b) => isLabel(b, wanted));
        if (button) {
          const ids = memberIdsIn(el);
          if (ids.size === 1 && ids.has(id)) return { row: el, button };
          ambiguous = true;
          break;
        }
      }
    }
    return ambiguous ? { ambiguous: true } : null;
  }

  async function scrollFor(find, rounds = 6) {
    for (let i = 0; i <= rounds; i += 1) {
      const hit = find();
      if (hit) return hit;
      window.scrollBy(0, window.innerHeight * 1.2);
      await sleep(1500);
    }
    return null;
  }

  const unavailable = () => UNAVAILABLE.test(document.body.innerText || document.body.textContent || '');

  /** Accepter la demande d'adhésion de ce membre (page member-requests). */
  async function approve(member, { settleMs = 0 } = {}) {
    if (settleMs) await sleep(settleMs);
    if (unavailable() || !/member-requests|requests/.test(location.pathname)) {
      return { outcome: 'no_permission', detail: 'page des demandes d’adhésion inaccessible' };
    }
    const hit = await scrollFor(() => rowOf(member.facebookUserId, APPROVE));
    if (!hit) return { outcome: 'not_found', detail: 'aucune demande à cet identifiant' };
    if (hit.ambiguous) return { outcome: 'unreachable', detail: 'ligne ambiguë (plusieurs personnes) : rien cliqué' };
    hit.button.click();
    await sleep(2500);
    // La ligne disparaît, ou n'a plus de bouton « Approuver ».
    const still = rowOf(member.facebookUserId, APPROVE);
    return still && !still.ambiguous
      ? { outcome: 'unreachable', detail: 'clic sur « Approuver » sans effet visible' }
      : { outcome: 'done', detail: 'demande acceptée' };
  }

  /** Ouvrir un menu et y chercher une entrée. Rend l'entrée, ou la liste de
   * ce qu'on a vu (pour comprendre une langue ou une interface inconnue). */
  async function openMenuWith(trigger, wanted) {
    trigger.click();
    await sleep(1200);
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="dialog"] [role="menuitem"], [role="listbox"] [role="option"]')];
    const seen = items.map((i) => labelOf(i)).filter(Boolean).slice(0, 15);
    const already = items.find((i) => hasPhrase(i, ALREADY_PREAPPROVED));
    const item = items.find((i) => hasLabel(i, wanted) && !hasPhrase(i, ALREADY_PREAPPROVED));
    return { item, already, seen };
  }
  const closeMenus = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  async function confirmIfAsked() {
    await sleep(1200);
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].reverse();
    for (const d of dialogs) {
      const ok = buttons(d).find((b) => isLabel(b, CONFIRM) && b.getAttribute('aria-disabled') !== 'true');
      if (ok) {
        ok.click();
        await sleep(1500);
        return true;
      }
    }
    return false;
  }

  /** Pré-approuver ce membre depuis SA page dans le groupe
   * (/groups/<groupe>/user/<id>/), où l'admin a un menu de gestion. */
  async function preapproveFromMemberPage(member) {
    if (!location.pathname.includes(`/user/${member.facebookUserId}`)) {
      return { outcome: 'unreachable', detail: 'la page ouverte n’est pas celle de ce membre : rien cliqué' };
    }
    const main = document.querySelector('[role="main"]') || document.body;
    const feed = main.querySelector('[role="feed"]');
    const triggers = buttons(main)
      .filter((b) => !(feed && feed.contains(b)))
      .filter((b) => b.getAttribute('aria-haspopup') === 'menu' || hasLabel(b, MANAGE))
      .slice(0, 5);
    const seen = [];
    for (const t of triggers) {
      const menu = await openMenuWith(t, PREAPPROVE);
      seen.push(...menu.seen);
      if (menu.already) {
        closeMenus();
        return { outcome: 'already', detail: 'déjà pré-approuvé' };
      }
      if (menu.item) {
        menu.item.click();
        await confirmIfAsked();
        return { outcome: 'done', detail: 'pré-approuvé depuis sa page de membre' };
      }
      closeMenus();
      await sleep(500);
    }
    return { outcome: triggers.length ? 'not_found' : 'no_permission', detail: `option introuvable sur la page du membre${seen.length ? ` (vu : ${[...new Set(seen)].join(' | ')})` : ''}` };
  }

  /** Repli : dans les publications en attente, un post de ce membre porte
   * souvent l'option dans son menu « … ». On en profite pour approuver le
   * post en attente : c'est le nôtre. */
  async function preapproveFromPending(member) {
    if (unavailable() || !/pending/.test(location.pathname)) {
      return { outcome: 'no_permission', detail: 'publications en attente inaccessibles' };
    }
    const id = member.facebookUserId;
    const hit = await scrollFor(() => rowOf(id, APPROVE), 3);
    if (!hit) return { outcome: 'not_found', detail: 'aucun post en attente de ce membre' };
    if (hit.ambiguous) return { outcome: 'unreachable', detail: 'post en attente ambigu : rien cliqué' };
    const seen = [];
    const triggers = buttons(hit.row).filter((b) => b.getAttribute('aria-haspopup') === 'menu' || hasLabel(b, MANAGE)).slice(0, 3);
    for (const t of triggers) {
      const menu = await openMenuWith(t, PREAPPROVE);
      seen.push(...menu.seen);
      if (menu.already) {
        closeMenus();
        return { outcome: 'already', detail: 'déjà pré-approuvé' };
      }
      if (menu.item) {
        menu.item.click();
        await confirmIfAsked();
        return { outcome: 'done', detail: 'pré-approuvé depuis ses publications en attente' };
      }
      closeMenus();
    }
    // Pas d'option, mais le post en attente est le nôtre : on l'approuve.
    const approveButton = buttons(hit.row).find((b) => isLabel(b, APPROVE));
    if (approveButton) {
      approveButton.click();
      await sleep(2000);
    }
    return {
      outcome: 'not_found',
      detail: `option de pré-approbation introuvable${approveButton ? ' (post en attente approuvé quand même)' : ''}${seen.length ? ` (vu : ${[...new Set(seen)].join(' | ')})` : ''}`,
    };
  }

  self.FPM = { approve, preapproveFromMemberPage, preapproveFromPending, memberIdsIn, idOfHref, fold };
})();
