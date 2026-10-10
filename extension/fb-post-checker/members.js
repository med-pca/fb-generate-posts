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
  // Le libellé tel que Facebook l'affiche : c'est lui qui va au journal.
  const rawLabel = (el) => String(el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

  const APPROVE = words(['approve', 'approuver', 'accepter', 'aprobar', 'aceptar', 'aprovar', 'genehmigen', 'approva', 'onayla', 'zatwierdź', 'goedkeuren', 'موافقة', 'قبول', 'الموافقة', 'وافق']);
  const PREAPPROVE = words([
    'pre-approve', 'preapprove', 'pre-approve posts', 'pre-approve member', 'pre-approve to post', 'approve all future posts',
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
  // La fenêtre « Preapprove X's posts » : son bouton principal, et ceux qui
  // annulent (jamais cliqués).
  const PREAPPROVAL_CONFIRM = words([
    'give pre-approval', 'give preapproval', 'pre-approve', 'preapprove', 'confirm', 'ok',
    'donner la pré-approbation', 'accorder la pré-approbation', 'pré-approuver', 'confirmer',
    'dar aprobación previa', 'aprobar', 'conceder', 'vorab genehmigen', 'bestätigen',
    'منح الموافقة المسبقة', 'منح موافقة مسبقة', 'الموافقة المسبقة', 'تأكيد', 'موافقة',
  ]);
  const CANCEL = words(['cancel', 'annuler', 'close', 'fermer', 'cancelar', 'abbrechen', 'annulla', 'iptal', 'إلغاء', 'إغلاق']);
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
    await self.FPH.click(hit.button);
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
    await self.FPH.click(trigger);
    await sleep(1200);
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="dialog"] [role="menuitem"], [role="listbox"] [role="option"]')];
    const seen = items.map((i) => labelOf(i)).filter(Boolean).slice(0, 15);
    const already = items.find((i) => hasPhrase(i, ALREADY_PREAPPROVED));
    const item = items.find((i) => hasLabel(i, wanted) && !hasPhrase(i, ALREADY_PREAPPROVED));
    return { item, already, seen };
  }
  const closeMenus = () => self.FPH.key('Escape');

  async function confirmIfAsked() {
    await sleep(1200);
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].reverse();
    for (const d of dialogs) {
      const ok = buttons(d).find((b) => isLabel(b, CONFIRM) && b.getAttribute('aria-disabled') !== 'true');
      if (ok) {
        await self.FPH.click(ok);
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
        await self.FPH.click(menu.item);
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
        await self.FPH.click(menu.item);
        await confirmIfAsked();
        return { outcome: 'done', detail: 'pré-approuvé depuis ses publications en attente' };
      }
      closeMenus();
    }
    // Pas d'option, mais le post en attente est le nôtre : on l'approuve.
    const approveButton = buttons(hit.row).find((b) => isLabel(b, APPROVE));
    if (approveButton) {
      await self.FPH.click(approveButton);
      await sleep(2000);
    }
    return {
      outcome: 'not_found',
      detail: `option de pré-approbation introuvable${approveButton ? ' (post en attente approuvé quand même)' : ''}${seen.length ? ` (vu : ${[...new Set(seen)].join(' | ')})` : ''}`,
    };
  }

  /** CONTRÔLE, sans rien modifier : la page du membre dit-elle « déjà
   * pré-approuvé » (option « Retirer la pré-approbation ») ou « pas fait »
   * (option « Pré-approuver » proposée) ? Le menu est ouvert pour être lu,
   * puis refermé ; aucune option n'est cliquée. */
  async function auditPreapproval(member) {
    if (unavailable()) return { outcome: 'no_permission', detail: 'page du membre indisponible' };
    if (!location.pathname.includes(`/user/${member.facebookUserId}`)) {
      return { outcome: 'unreachable', detail: 'la page ouverte n’est pas celle de ce membre : rien lu' };
    }
    const main = document.querySelector('[role="main"]') || document.body;
    const feed = main.querySelector('[role="feed"]');
    const triggers = buttons(main)
      .filter((b) => !(feed && feed.contains(b)))
      .filter((b) => b.getAttribute('aria-haspopup') === 'menu' || hasLabel(b, MANAGE))
      .slice(0, 5);
    if (!triggers.length) return { outcome: 'no_permission', detail: 'aucun menu de gestion sur sa page : le modérateur est-il admin/modérateur du groupe ?' };
    const seen = [];
    for (const t of triggers) {
      await self.FPH.click(t);
      await sleep(1200);
      const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="dialog"] [role="menuitem"], [role="listbox"] [role="option"]')];
      const labels = items.map((i) => rawLabel(i)).filter(Boolean);
      seen.push(...labels);
      const already = items.find((i) => hasPhrase(i, ALREADY_PREAPPROVED));
      const offered = items.find((i) => hasLabel(i, PREAPPROVE) && !hasPhrase(i, ALREADY_PREAPPROVED));
      closeMenus();
      await sleep(400);
      if (already) return { outcome: 'already', detail: `menu : « ${rawLabel(already)} »` };
      if (offered) return { outcome: 'not_done', detail: `menu : « ${rawLabel(offered)} » proposé, non cliqué` };
    }
    return { outcome: 'not_found', detail: `ni « pré-approuver » ni « retirer la pré-approbation » (vu : ${[...new Set(seen)].slice(0, 12).join(' | ') || 'rien'})` };
  }

  /* ── La bonne page : <groupe>/people ─────────────────────────────────
   * La liste des membres du groupe. Chaque ligne porte le statut du membre
   * (« Pre-approved to post » quand c'est fait) et un menu « … » où l'admin
   * ou le modérateur trouve la pré-approbation. */

  // Ce que la LIGNE du membre affiche une fois la pré-approbation faite.
  const PREAPPROVED_ROW = words([
    'pre-approved to post', 'pre-approved', 'pré-approuvé pour publier', 'pré-approuvé pour les publications',
    'publications pré-approuvées', 'pré-approuvé', 'preaprobado para publicar', 'pré-aprovado para publicar',
    'vorab genehmigt', 'pre-approvato', 'تمت الموافقة المسبقة على النشر', 'موافقة مسبقة على النشر', 'تمت الموافقة المسبقة',
  ]);
  const SEARCH_LABEL = /search|rechercher|buscar|suchen|cerca|ara|szukaj|بحث/i;

  const rowText = (el) => fold(el.innerText || el.textContent || '');
  const rowSaysPreapproved = (row) => {
    const t = ` ${rowText(row)} `;
    // « Pre-approve » (verbe, une option) n'est pas « Pre-approved » (statut).
    return PREAPPROVED_ROW.some((w) => t.includes(` ${w} `) || t.includes(` ${w} ·`) || t.includes(`${w} ·`));
  };

  const SEARCH_WORDS = /search|find|rechercher|chercher|trouver|buscar|suchen|cerca|ara|szukaj|بحث|ابحث/i;
  /** Le bouton « … » d'une ligne : un bouton de menu, un libellé « plus /
   * options / actions », ou un bouton sans texte qui ne porte qu'une icône. */
  const MORE = words(['more', 'more options', 'options', 'actions', 'member actions', 'member settings', 'settings', 'manage',
    'plus', "plus d'options", 'gérer', 'paramètres', 'más', 'opciones', 'mehr', 'altro', 'المزيد', 'خيارات', 'إجراءات', 'إعدادات']);
  const dotsIn = (scope) =>
    buttons(scope).filter((b) => {
      if (b.closest('a[href]')) return false;
      const label = labelOf(b);
      const text = (b.textContent || '').trim();
      return (
        b.getAttribute('aria-haspopup') === 'menu' ||
        (label && MORE.some((w) => label === w || label.startsWith(`${w} `) || label.includes(` ${w} `))) ||
        /^(…|\.\.\.|⋯)$/.test(text) ||
        (!text && !b.getAttribute('aria-label') && b.querySelector('svg'))
      );
    });

  /** Les personnes qu'un bloc désigne : par identifiant, sinon par nom. */
  const personKey = (a) => idOfHref(a.getAttribute('href')) || fold(a.textContent || '');
  const personLinks = (scope) =>
    [...scope.querySelectorAll('a[href]')].filter((a) => {
      const href = a.getAttribute('href') || '';
      return idOfHref(href) || /\/user\/|profile\.php|facebook\.com\/[A-Za-z0-9.]+\/?(\?|$)|^\/[A-Za-z0-9.]{3,}\/?(\?|$)/.test(href);
    }).filter((a) => fold(a.textContent || '').length > 1 || idOfHref(a.getAttribute('href')));

  /** Taper le nom dans la recherche de la page (champ React : setter natif,
   * puis Entrée), et laisser la liste se filtrer. */
  async function searchPeople(name) {
    const main = document.querySelector('[role="main"]') || document.body;
    const input = [...main.querySelectorAll('input')].find(
      (i) => i.type === 'search' || SEARCH_WORDS.test(`${i.getAttribute('aria-label') || ''} ${i.getAttribute('placeholder') || ''}`),
    );
    if (!input || !name) return false;
    // Taper le nom lettre par lettre, puis Entrée — comme quelqu'un.
    await self.FPH.type(input, name);
    await self.FPH.key('Enter');
    await sleep(3000);
    return true;
  }

  /** La ligne de CE membre et son « … ». Par identifiant Facebook ; si la
   * page ne l'expose pas, par le nom EXACT — seulement s'il n'y a qu'une
   * personne de ce nom à l'écran. La ligne ne doit désigner que lui. */
  function peopleRow(member) {
    const id = member.facebookUserId;
    const name = fold(member.name);
    const all = personLinks(document);
    let anchors = all.filter((a) => idOfHref(a.getAttribute('href')) === id);
    let by = 'identifiant';
    if (!anchors.length && name) {
      const sameName = all.filter((a) => fold(a.textContent || '') === name);
      const distinct = new Set(sameName.map((a) => (a.getAttribute('href') || '').split('?')[0]));
      if (distinct.size > 1) return { ambiguous: true, detail: `${distinct.size} personnes s’appellent « ${member.name} » : rien cliqué` };
      anchors = sameName;
      by = 'nom exact';
    }
    if (!anchors.length) return null;
    // Sa photo et son nom pointent vers le même profil : une seule personne.
    const base = (a) => (a.getAttribute('href') || '').split('?')[0].replace(/\/+$/, '');
    const ownHrefs = new Set(anchors.map(base));
    const own = new Set([...anchors, ...all.filter((a) => ownHrefs.has(base(a)))].map(personKey));
    for (const a of anchors) {
      let el = a;
      for (let i = 0; i < 14 && el && el !== document.body; i += 1) {
        el = el.parentElement;
        if (!el) break;
        // Plus haut que la ligne : le bloc contient d'autres personnes.
        const people = new Set(personLinks(el).map(personKey).filter((k) => !own.has(k)));
        if (people.size) break;
        const dots = dotsIn(el);
        if (dots.length) return { row: el, menu: dots[dots.length - 1], by };
      }
    }
    return { noMenu: true, by };
  }

  /** Ouvrir <groupe>/people (fait par l'extension), puis trouver la ligne :
   * à l'écran, sinon par la recherche, sinon en descendant la liste. */
  async function findOnPeople(member) {
    if (!/\/people|\/members/.test(location.pathname)) return { error: { outcome: 'unreachable', detail: 'la page des membres du groupe n’est pas ouverte' } };
    if (unavailable()) return { error: { outcome: 'no_permission', detail: 'page des membres inaccessible' } };
    const usable = (h) => h && (h.row || h.ambiguous);
    let hit = peopleRow(member);
    let searched = false;
    if (!usable(hit)) {
      searched = await searchPeople(member.name);
      hit = peopleRow(member);
    }
    if (!usable(hit)) hit = (await scrollFor(() => { const h = peopleRow(member); return usable(h) ? h : null; }, 5)) || peopleRow(member);
    if (!hit) {
      return { error: { outcome: 'not_found', detail: `« ${member.name} » introuvable dans les membres du groupe${searched ? ' (recherche faite)' : ' (pas de barre de recherche trouvée)'}` } };
    }
    if (hit.ambiguous) return { error: { outcome: 'unreachable', detail: hit.detail || 'ligne ambiguë : rien cliqué' } };
    if (hit.noMenu) {
      const near = personLinks(document).find((a) => idOfHref(a.getAttribute('href')) === member.facebookUserId || fold(a.textContent || '') === fold(member.name));
      const box = near?.parentElement?.parentElement?.parentElement?.parentElement || document.body;
      const seen = buttons(box).map((b) => rawLabel(b) || (b.querySelector('svg') ? '[icône]' : '')).filter(Boolean).slice(0, 10);
      return { error: { outcome: 'not_found', detail: `ligne de « ${member.name} » trouvée (par ${hit.by}) mais pas son bouton « … » (boutons vus : ${seen.join(' | ') || 'aucun'})` } };
    }
    return hit;
  }

  async function openRowMenu(hit) {
    await self.FPH.click(hit.menu);
    await sleep(1200);
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="dialog"] [role="menuitem"], [role="listbox"] [role="option"]')];
    return {
      items,
      seen: items.map((i) => rawLabel(i)).filter(Boolean),
      already: items.find((i) => hasPhrase(i, ALREADY_PREAPPROVED)),
      offered: items.find((i) => hasLabel(i, PREAPPROVE) && !hasPhrase(i, ALREADY_PREAPPROVED)),
    };
  }

  const isPreapprovalDialog = (d) => /pre-?approv|preapprov|pre-?approuv|aprobaci|موافق/.test(fold(d.innerText || d.textContent || ''));
  const openDialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.isConnected && isPreapprovalDialog(d));

  /** La fenêtre de confirmation : cliquer son bouton principal (« Give
   * Pre-approval »), jamais « Cancel » ni la croix, puis attendre qu'elle se
   * ferme. Dit ce qui s'est passé. */
  async function confirmPreapproval() {
    let dialog = null;
    for (let i = 0; i < 20 && !dialog; i += 1) {
      dialog = openDialogs().pop() || null;
      if (!dialog) await sleep(250);
    }
    if (!dialog) return { asked: false };
    const candidates = buttons(dialog).filter((b) => b.getAttribute('aria-disabled') !== 'true' && !hasLabel(b, CANCEL));
    const ok =
      candidates.find((b) => PREAPPROVAL_CONFIRM.some((w) => labelOf(b) === w || labelOf(b).startsWith(w))) ||
      // Sinon le dernier bouton qui porte du texte (le bouton principal est
      // à droite, après « Annuler »).
      candidates.filter((b) => (b.textContent || '').trim()).pop();
    const seen = buttons(dialog).map((b) => rawLabel(b)).filter(Boolean).slice(0, 8);
    if (!ok) return { asked: true, clicked: null, closed: false, seen };
    const label = rawLabel(ok);
    await self.FPH.click(ok);
    for (let i = 0; i < 24; i += 1) {
      await sleep(250);
      if (!dialog.isConnected || !openDialogs().includes(dialog)) return { asked: true, clicked: label, closed: true, seen };
    }
    return { asked: true, clicked: label, closed: false, seen };
  }

  /** Relire la ligne du membre (la liste se redessine après la fenêtre). */
  async function rereadRow(member) {
    for (let i = 0; i < 3; i += 1) {
      await sleep(1500);
      const again = peopleRow(member);
      if (again && again.row) return again;
    }
    if (await searchPeople(member.name)) {
      const again = peopleRow(member);
      if (again && again.row) return again;
    }
    return null;
  }

  /** Pré-approuver CE membre depuis <groupe>/people. « Fait » seulement si
   * c'est PROUVÉ : la fenêtre de confirmation s'est fermée et sa ligne dit
   * « pré-approuvé pour publier ». */
  async function preapproveFromPeople(member) {
    const hit = await findOnPeople(member);
    if (hit.error) return hit.error;
    if (rowSaysPreapproved(hit.row)) return { outcome: 'already', detail: 'sa ligne dit déjà « pré-approuvé pour publier »' };
    const menu = await openRowMenu(hit);
    if (menu.already) {
      closeMenus();
      return { outcome: 'already', detail: `menu : « ${rawLabel(menu.already)} »` };
    }
    if (!menu.offered) {
      closeMenus();
      return {
        outcome: menu.items.length ? 'not_found' : 'no_permission',
        detail: menu.items.length
          ? `option de pré-approbation introuvable dans son menu (vu : ${[...new Set(menu.seen)].slice(0, 12).join(' | ')})`
          : 'son menu « … » ne s’ouvre pas : le modérateur est-il admin/modérateur du groupe ?',
      };
    }
    const label = rawLabel(menu.offered);
    await self.FPH.click(menu.offered);
    const confirm = await confirmPreapproval();
    if (confirm.asked && !confirm.closed) {
      // La fenêtre est restée ouverte : on la ferme, et ce n'est PAS fait.
      await self.FPH.key('Escape');
      return {
        outcome: 'not_found',
        detail: confirm.clicked
          ? `« ${label} » → « ${confirm.clicked} » cliqué, mais la fenêtre de confirmation est restée ouverte : non fait`
          : `« ${label} » → fenêtre de confirmation sans bouton reconnu (vu : ${confirm.seen.join(' | ')}) : non fait`,
      };
    }
    const steps = `« ${label} »${confirm.clicked ? ` → « ${confirm.clicked} »` : ''}`;
    // On ne croit pas le clic : la ligne doit maintenant le dire.
    const after = await rereadRow(member);
    if (after && rowSaysPreapproved(after.row)) {
      return { outcome: 'done', detail: `${steps} ; sa ligne dit « pré-approuvé pour publier »` };
    }
    // Pas de preuve : à revoir plus tard (un nouveau passage relira la ligne).
    return { outcome: 'unreachable', detail: `${steps} cliqué, mais sa ligne ne dit pas encore « pré-approuvé » : à recontrôler` };
  }

  /** CONTRÔLE sur <groupe>/people, sans rien cliquer d'autre que le menu
   * (ouvert pour être lu, puis refermé). */
  async function auditFromPeople(member) {
    const hit = await findOnPeople(member);
    if (hit.error) return hit.error;
    if (rowSaysPreapproved(hit.row)) return { outcome: 'already', detail: 'sa ligne dit « pré-approuvé pour publier »' };
    const menu = await openRowMenu(hit);
    closeMenus();
    await sleep(400);
    if (menu.already) return { outcome: 'already', detail: `menu : « ${rawLabel(menu.already)} »` };
    if (menu.offered) return { outcome: 'not_done', detail: `menu : « ${rawLabel(menu.offered)} » proposé, non cliqué` };
    return {
      outcome: menu.items.length ? 'not_found' : 'no_permission',
      detail: menu.items.length ? `ni pré-approuvé, ni option (vu : ${[...new Set(menu.seen)].slice(0, 12).join(' | ')})` : 'son menu « … » ne s’ouvre pas',
    };
  }

  /* ── Retirer de nos groupes un de NOS profils suspendus par Facebook ──
   * Sur la ligne qui porte SON identifiant (ou son nom exact, s'il est seul
   * à le porter), menu « … » → « Retirer du groupe » → confirmer. Aucune
   * case « bloquer » ni « supprimer son activité » n'est cochée. */
  const REMOVE = words(['remove member', 'remove from group', 'remove', 'retirer du groupe', 'retirer le membre', 'retirer', 'supprimer du groupe', 'eliminar del grupo', 'eliminar miembro', 'remover do grupo', 'remover membro', 'aus der gruppe entfernen', 'rimuovi dal gruppo', 'إزالة من المجموعة', 'إزالة العضو', 'إزالة']);
  const menuItems = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="dialog"] [role="menuitem"], [role="listbox"] [role="option"]')];

  async function removeFromPeople(member) {
    const hit = await findOnPeople(member);
    if (hit.error) return hit.error;
    await self.FPH.click(hit.menu);
    await sleep(1200);
    const items = menuItems();
    const item = items.find((i) => hasLabel(i, REMOVE) && !/block|bloquer|bloquear|حظر/i.test(rawLabel(i)));
    if (!item) {
      const seen = items.map((i) => rawLabel(i)).filter(Boolean).slice(0, 12);
      await closeMenus();
      return { outcome: 'no_permission', detail: `pas d’option « Retirer du groupe » (vu : ${seen.join(' | ') || 'menu vide'}) : le modérateur est-il administrateur ?` };
    }
    await self.FPH.click(item);
    // La fenêtre de confirmation : son bouton principal, jamais « Annuler ».
    let ok = null;
    for (let i = 0; i < 20 && !ok; i += 1) {
      await sleep(300);
      const dialog = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.isConnected).pop();
      if (!dialog) continue;
      ok = buttons(dialog).find((b) => (hasLabel(b, REMOVE) || isLabel(b, CONFIRM)) && !isLabel(b, CANCEL) && b.getAttribute('aria-disabled') !== 'true');
    }
    if (!ok) return { outcome: 'unreachable', detail: 'fenêtre de confirmation du retrait introuvable : rien confirmé' };
    await self.FPH.click(ok);
    await sleep(3000);
    const still = peopleRow(member);
    return still && still.row
      ? { outcome: 'unreachable', detail: 'retrait demandé, mais il apparaît encore dans les membres' }
      : { outcome: 'done', detail: 'retiré du groupe' };
  }

  /* ── Valider un de NOS posts en attente (page « publications en attente »
   * du groupe). Le post est reconnu à son texte (et à son auteur quand on
   * le connaît) ; seul SON bouton « Approuver » est cliqué. */
  async function approvePendingPost(task) {
    if (unavailable()) return { outcome: 'no_permission', detail: 'publications en attente inaccessibles' };
    if (!/pending_posts|pending/.test(location.pathname)) return { outcome: 'unreachable', detail: 'la page des publications en attente n’est pas ouverte' };
    const want = self.FPC.lettersOnly(String(task.content || '')).slice(0, 80);
    if (!want) return { outcome: 'unreachable', detail: 'texte du post inconnu' };
    const author = fold(task.author?.name || '');
    const find = () => {
      const blocks = [...document.querySelectorAll('[role="article"], [role="main"] [data-pagelet], [role="main"] > div div[class]')]
        .filter((b) => self.FPC.lettersOnly(b.innerText || '').includes(want))
        .filter((b) => !author || fold(b.innerText || '').includes(author));
      // Le plus petit bloc qui contient le texte ET un bouton « Approuver ».
      for (const b of blocks.sort((x, y) => (x.innerText || '').length - (y.innerText || '').length)) {
        const approveBtn = buttons(b).find((el) => isLabel(el, APPROVE) || hasPhrase(el, APPROVE));
        if (approveBtn) return { block: b, approveBtn };
      }
      return null;
    };
    const hit = (await scrollFor(find, 5)) || find();
    if (!hit) return { outcome: 'not_found', detail: 'post introuvable dans les publications en attente (déjà validé, refusé, ou pas admin)' };
    await self.FPH.click(hit.approveBtn);
    await sleep(3000);
    return find() ? { outcome: 'unreachable', detail: 'clic sur « Approuver » sans effet visible' } : { outcome: 'done', detail: 'post validé' };
  }

  self.FPM = {
    removeFromPeople,
    approvePendingPost,
    preapproveFromPeople,
    auditFromPeople,
    auditPreapproval, approve, preapproveFromMemberPage, preapproveFromPending, memberIdsIn, idOfHref, fold };
})();
