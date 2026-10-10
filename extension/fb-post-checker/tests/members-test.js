/**
 * Adhésion et pré-approbation de NOS profils, contre des pages qui imitent
 * Facebook. Le point vérifié avant tout : on n'agit que sur l'identifiant
 * reçu, jamais sur une autre personne, même portant le même nom.
 *
 *   node extension/fb-post-checker/tests/members-test.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const HUMAN = fs.readFileSync(path.join(__dirname, '../human.js'), 'utf8');
const MEMBERS = fs.readFileSync(path.join(__dirname, '../members.js'), 'utf8');

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko++;
};
function page(body, url) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url, runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  w.scrollBy = () => {};
  // Sans canal vers l'extension, human.js retombe sur les gestes simulés.
  w.eval(HUMAN);
  w.eval(MEMBERS);
  return w;
}
const ours = { facebookUserId: '100011', name: 'Salim Bennani' };
const request = (id, name, state = '') => `
  <div class="request" data-id="${id}"><a href="/groups/1/user/${id}/">${name}</a><span>A demandé il y a 2 j</span>
    <div role="button" class="approve">${state || 'Approuver'}</div><div role="button">Refuser</div></div>`;

(async () => {
  // ─── Demandes d'adhésion ───────────────────────────────────────────
  let w = page(`<div role="main">${request('999999', 'Salim Bennani')}${request('100011', 'Salim Bennani')}</div>`,
    'https://www.facebook.com/groups/1/member-requests');
  const clicked = [];
  w.document.querySelectorAll('.approve').forEach((b) => b.addEventListener('click', () => {
    clicked.push(b.closest('.request').dataset.id);
    b.closest('.request').remove();
  }));
  let r = await w.FPM.approve(ours);
  check('accepte la demande de NOTRE profil', r.outcome === 'done' && clicked.includes('100011'), { r, clicked });
  check('jamais celle d’un homonyme', !clicked.includes('999999'), clicked);

  w = page(`<div role="main">${request('999999', 'Salim Bennani')}</div>`, 'https://www.facebook.com/groups/1/member-requests');
  r = await w.FPM.approve(ours);
  check('pas de demande à notre identifiant → rien cliqué', r.outcome === 'not_found', r);

  // Une ligne qui mêle deux personnes (ex. « ajouté par ») : on ne clique pas.
  w = page(`<div role="main"><div><a href="/groups/1/user/100011/">Salim</a> invité par <a href="/groups/1/user/555555/">Omar</a>
    <div role="button" class="approve">Approuver</div></div></div>`, 'https://www.facebook.com/groups/1/member-requests');
  let touched = false;
  w.document.querySelector('.approve').addEventListener('click', () => (touched = true));
  r = await w.FPM.approve(ours);
  check('ligne ambiguë → rien cliqué', !touched && r.outcome === 'unreachable', r);

  w = page('<div role="main"><span>Ce contenu n’est pas disponible</span></div>', 'https://www.facebook.com/groups/1/member-requests');
  check('pas admin/modérateur → no_permission', (await w.FPM.approve(ours)).outcome === 'no_permission', null);

  // Arabe, avec voyelles.
  w = page(`<div role="main">${request('100011', 'سليم', 'مُوافقة')}</div>`, 'https://www.facebook.com/groups/1/member-requests');
  w.document.querySelector('.approve').addEventListener('click', (e) => e.target.closest('.request').remove());
  check('libellé arabe « موافقة » reconnu', (await w.FPM.approve(ours)).outcome === 'done', null);

  // ─── Pré-approbation depuis la page du membre ──────────────────────
  const memberPage = (items) => {
    const p = page(`<div role="main"><h1>Salim Bennani</h1><div role="button" aria-haspopup="menu" class="manage" aria-label="Gérer">…</div>
      <div role="feed"><div role="button" aria-haspopup="menu" class="postmenu">…</div></div></div>`,
      'https://www.facebook.com/groups/1/user/100011/');
    const log = [];
    p.document.querySelector('.manage').addEventListener('click', () => {
      p.document.body.insertAdjacentHTML('beforeend', `<div role="menu">${items.map((i) => `<div role="menuitem">${i}</div>`).join('')}</div>`);
      p.document.querySelectorAll('[role="menuitem"]').forEach((m) => m.addEventListener('click', () => log.push(m.textContent)));
    });
    p.document.querySelector('.postmenu').addEventListener('click', () => log.push('MENU DU POST'));
    return { p, log };
  };
  let m = memberPage(['Envoyer un message', 'Pré-approuver les publications', 'Retirer du groupe']);
  r = await m.p.FPM.preapproveFromMemberPage(ours);
  check('pré-approuve depuis le menu de gestion du membre', r.outcome === 'done' && m.log.includes('Pré-approuver les publications'), { r, log: m.log });
  check('sans toucher au menu d’un post ni à « Retirer du groupe »', !m.log.includes('MENU DU POST') && !m.log.includes('Retirer du groupe'), m.log);

  m = memberPage(['Retirer la pré-approbation']);
  r = await m.p.FPM.preapproveFromMemberPage(ours);
  check('déjà pré-approuvé → already, rien cliqué', r.outcome === 'already' && !m.log.length, { r, log: m.log });

  m = memberPage(['Envoyer un message']);
  r = await m.p.FPM.preapproveFromMemberPage(ours);
  check('option absente → not_found, avec ce qui a été vu', r.outcome === 'not_found' && /envoyer un message/.test(r.detail), r);

  const other = page('<div role="main"></div>', 'https://www.facebook.com/groups/1/user/999999/');
  check('page d’un autre membre → rien cliqué', (await other.FPM.preapproveFromMemberPage(ours)).outcome === 'unreachable', null);

  // ─── Contrôle (sans rien modifier) : déjà fait, ou pas ? ────────────
  m = memberPage(['Envoyer un message', 'Retirer la pré-approbation', 'Retirer du groupe']);
  r = await m.p.FPM.auditPreapproval(ours);
  check('contrôle : « déjà fait » lu dans le menu', r.outcome === 'already' && /Retirer la pré-approbation/i.test(r.detail), r);
  check('contrôle : AUCUN clic dans le menu', m.log.length === 0, m.log);

  m = memberPage(['Envoyer un message', 'Pré-approuver les publications']);
  r = await m.p.FPM.auditPreapproval(ours);
  check('contrôle : « pas fait » quand l’option est proposée', r.outcome === 'not_done', r);
  check('contrôle : l’option n’est PAS cliquée', !m.log.includes('Pré-approuver les publications'), m.log);

  m = memberPage(['Envoyer un message']);
  r = await m.p.FPM.auditPreapproval(ours);
  check('contrôle : ni l’un ni l’autre → introuvable, avec ce qui a été vu', r.outcome === 'not_found' && /Envoyer un message/.test(r.detail), r);

  const bare = page('<div role="main"><h1>Salim</h1></div>', 'https://www.facebook.com/groups/1/user/100011/');
  check('contrôle : pas de menu de gestion → pas l’option (pas admin)', (await bare.FPM.auditPreapproval(ours)).outcome === 'no_permission', null);
  const otherMember = page('<div role="main"></div>', 'https://www.facebook.com/groups/1/user/999999/');
  check('contrôle : page d’un autre membre → rien lu', (await otherMember.FPM.auditPreapproval(ours)).outcome === 'unreachable', null);

  // ─── La bonne page : <groupe>/people ───────────────────────────────
  const personRow = (id, name, status, menuClass = '') => `
    <div class="person" data-id="${id}"><a href="/groups/1/user/${id}/">${name}</a><span>${status}</span>
      <div role="button" aria-haspopup="menu" aria-label="Member settings" class="dots ${menuClass}">…</div></div>`;
  const peoplePage = (rows, items, opts = {}) => {
    const p = page(`<div role="main"><input type="search" placeholder="Search" class="q">${rows}</div>`, 'https://www.facebook.com/groups/1/people');
    const log = [];
    p.document.querySelector('.q').addEventListener('input', (e) => log.push(`search:${e.target.value}`));
    p.document.querySelectorAll('.dots').forEach((b) => b.addEventListener('click', () => {
      const who = b.closest('.person').dataset.id;
      log.push(`menu:${who}`);
      p.document.body.insertAdjacentHTML('beforeend', `<div role="menu">${items.map((i) => `<div role="menuitem">${i}</div>`).join('')}</div>`);
      p.document.querySelectorAll('[role="menuitem"]').forEach((m) => m.addEventListener('click', () => {
        log.push(`click:${who}:${m.textContent}`);
        p.document.querySelector('[role="menu"]')?.remove();
        if (!/pre-approve/i.test(m.textContent)) return;
        // Comme Facebook : une fenêtre de confirmation.
        p.document.body.insertAdjacentHTML('beforeend', `<div role="dialog"><h2>Preapprove ${who}'s posts</h2>
          <p>You are about to pre-approve this member's posts.</p>
          <div role="button" aria-label="Close" class="x"></div><div role="button" class="cancel">Cancel</div><div role="button" class="give">Give Pre-approval</div></div>`);
        const dlg = p.document.querySelector('[role="dialog"]');
        dlg.querySelector('.cancel').addEventListener('click', () => { log.push('cancel'); dlg.remove(); });
        dlg.querySelector('.x').addEventListener('click', () => { log.push('close'); dlg.remove(); });
        dlg.querySelector('.give').addEventListener('click', () => {
          log.push('give');
          if (opts.stuck) return; // la fenêtre reste ouverte
          dlg.remove();
          if (opts.noStatus) return; // fermée, mais la ligne ne change pas
          p.document.querySelector(`.person[data-id="${who}"] span`).textContent = 'Pre-approved to post · Joined about an hour ago';
        });
      }));
    }));
    return { p, log };
  };
  let pp = peoplePage(
    personRow('555', 'Soumia Ait Mellou', 'Moderator · Joined about an hour ago') +
      personRow('999999', 'Salim Bennani', 'Joined yesterday') +
      personRow('100011', 'Salim Bennani', 'Joined about an hour ago'),
    ['Pre-approve posts', 'Remove member', 'Block'],
  );
  r = await pp.p.FPM.preapproveFromPeople(ours);
  check('people : notre profil est pré-approuvé depuis son menu « … »', r.outcome === 'done' && pp.log.includes('click:100011:Pre-approve posts'), { r, log: pp.log });
  check('people : la fenêtre « Give Pre-approval » est confirmée (jamais Cancel ni la croix)', pp.log.includes('give') && !pp.log.includes('cancel') && !pp.log.includes('close'), pp.log);
  check('people : la ligne relue dit « Pre-approved to post »', /pré-approuvé pour publier/.test(r.detail) && /Give Pre-approval/.test(r.detail), r.detail);

  pp = peoplePage(personRow('100011', 'Salim Bennani', 'Joined about an hour ago'), ['Pre-approve posts'], { stuck: true });
  r = await pp.p.FPM.preapproveFromPeople(ours);
  check('people : fenêtre restée ouverte → PAS « fait »', r.outcome !== 'done' && /restée ouverte/.test(r.detail), r);

  pp = peoplePage(personRow('100011', 'Salim Bennani', 'Joined about an hour ago'), ['Pre-approve posts'], { noStatus: true });
  r = await pp.p.FPM.preapproveFromPeople(ours);
  check('people : fenêtre fermée mais ligne inchangée → PAS « fait », à recontrôler', r.outcome === 'unreachable' && /recontrôler/.test(r.detail), r);
  check('people : jamais l’homonyme, jamais « Remove member »', !pp.log.some((l) => l.includes('999999')) && !pp.log.some((l) => /Remove|Block/.test(l)), pp.log);

  pp = peoplePage(personRow('100011', 'Salim Bennani', 'Pre-approved to post · Joined about an hour ago'), ['Remove pre-approval']);
  r = await pp.p.FPM.preapproveFromPeople(ours);
  check('people : déjà « Pre-approved to post » → rien cliqué', r.outcome === 'already' && !pp.log.some((l) => l.startsWith('menu')), { r, log: pp.log });

  pp = peoplePage(personRow('100011', 'Salim Bennani', 'Joined about an hour ago'), ['Pre-approve posts', 'Remove member']);
  r = await pp.p.FPM.auditFromPeople(ours);
  check('people / contrôle : « pas fait », option lue mais PAS cliquée', r.outcome === 'not_done' && !pp.log.some((l) => l.startsWith('click')), { r, log: pp.log });

  pp = peoplePage(personRow('100011', 'Salim Bennani', 'Pre-approved to post · Joined on Thursday'), []);
  r = await pp.p.FPM.auditFromPeople(ours);
  check('people / contrôle : « déjà fait » lu sur la ligne', r.outcome === 'already', r);

  pp = peoplePage(personRow('777', 'Autre', 'Joined'), ['Pre-approve posts']);
  r = await pp.p.FPM.preapproveFromPeople(ours);
  check('people : absent de la liste → recherche par son nom, puis introuvable (rien cliqué)', r.outcome === 'not_found' && pp.log.includes('search:Salim Bennani') && !pp.log.some((l) => l.startsWith('click')), { r, log: pp.log });

  // ─── Variantes réalistes de la page des membres ───────────────────
  const realPage = (rowsHtml, items) => {
    const p = page(`<div role="main"><input placeholder="Find a member" class="q"><div role="list">${rowsHtml}</div></div>`, 'https://www.facebook.com/groups/1/people');
    const log = [];
    p.document.querySelectorAll('.dots').forEach((b) => b.addEventListener('click', () => {
      const who = b.closest('.person').dataset.id;
      log.push(`menu:${who}`);
      p.document.body.insertAdjacentHTML('beforeend', `<div role="menu">${items.map((i) => `<div role="menuitem">${i}</div>`).join('')}</div>`);
      p.document.querySelectorAll('[role="menuitem"]').forEach((m) => m.addEventListener('click', () => {
        log.push(`click:${who}:${m.textContent}`);
        p.document.querySelector('[role="menu"]')?.remove();
        if (!/pre-approve/i.test(m.textContent)) return;
        p.document.body.insertAdjacentHTML('beforeend', `<div role="dialog"><h2>Preapprove posts</h2>
          <div role="button" class="cancel">Cancel</div><div role="button" class="give">Give Pre-approval</div></div>`);
        const dlg = p.document.querySelector('[role="dialog"]');
        dlg.querySelector('.cancel').addEventListener('click', () => { log.push('cancel'); dlg.remove(); });
        dlg.querySelector('.give').addEventListener('click', () => {
          log.push('give');
          dlg.remove();
          const person = p.document.querySelector(`.person[data-id="${who}"]`);
          const status = person.querySelector('span') || person.appendChild(p.document.createElement('span'));
          status.textContent = 'Pre-approved to post · Joined about an hour ago';
        });
      }));
    }));
    return { p, log };
  };
  // Photo + nom (même lien), « … » sans attribut de menu, libellé « More options for … ».
  let rp = realPage(`
    <div class="person" data-id="100011"><a href="/groups/1/user/100011/"><img alt=""></a><div><a href="/groups/1/user/100011/">Salim Bennani</a><span>Joined about an hour ago</span></div>
      <div role="button" aria-label="More options for Salim Bennani" class="dots">…</div></div>
    <div class="person" data-id="555"><a href="/groups/1/user/555/">Soumia</a><div role="button" aria-label="More options for Soumia" class="dots">…</div></div>`,
    ['Pre-approve posts', 'Remove member']);
  r = await rp.p.FPM.preapproveFromPeople(ours);
  check('people réel : « … » libellé « More options for … » (sans attribut de menu)', r.outcome === 'done' && rp.log.includes('click:100011:Pre-approve posts'), { r, log: rp.log });

  // Bouton icône seule (svg, aucun texte, aucun libellé).
  rp = realPage(`
    <div class="person" data-id="100011"><a href="/groups/1/user/100011/">Salim Bennani</a><span>Joined</span>
      <div role="button" class="dots"><svg></svg></div></div>`, ['Pre-approve posts']);
  r = await rp.p.FPM.preapproveFromPeople(ours);
  check('people réel : bouton « … » en icône seule', r.outcome === 'done', { r, log: rp.log });

  // Lien sans identifiant (adresse personnalisée) : reconnu par le nom exact, s'il est unique.
  rp = realPage(`
    <div class="person" data-id="vanity"><a href="https://www.facebook.com/salim.bennani.75">Salim Bennani</a><span>Joined</span>
      <div role="button" aria-label="Member settings" class="dots">…</div></div>
    <div class="person" data-id="other"><a href="https://www.facebook.com/omar.x">Omar</a><div role="button" aria-label="Member settings" class="dots">…</div></div>`,
    ['Pre-approve posts']);
  r = await rp.p.FPM.preapproveFromPeople(ours);
  check('people réel : sans identifiant, reconnu par le nom exact (unique)', r.outcome === 'done' && rp.log.includes('click:vanity:Pre-approve posts') && !rp.log.some((l) => l.includes('other')), { r, log: rp.log });

  // Deux homonymes sans identifiant : rien n'est touché.
  rp = realPage(`
    <div class="person" data-id="h1"><a href="https://www.facebook.com/salim.1">Salim Bennani</a><div role="button" aria-label="Member settings" class="dots">…</div></div>
    <div class="person" data-id="h2"><a href="https://www.facebook.com/salim.2">Salim Bennani</a><div role="button" aria-label="Member settings" class="dots">…</div></div>`,
    ['Pre-approve posts']);
  r = await rp.p.FPM.preapproveFromPeople(ours);
  check('people réel : deux homonymes sans identifiant → rien cliqué', r.outcome === 'unreachable' && !rp.log.length, { r, log: rp.log });

  // Ligne trouvée mais pas de « … » : diagnostic avec les boutons vus.
  rp = realPage(`<div class="person" data-id="100011"><a href="/groups/1/user/100011/">Salim Bennani</a><div role="button">Message</div></div>`, []);
  r = await rp.p.FPM.preapproveFromPeople(ours);
  check('people réel : pas de « … » → diagnostic avec les boutons vus', r.outcome === 'not_found' && /trouvée.*Message/.test(r.detail), r);

  // ─── Repli : publications en attente ───────────────────────────────
  w = page(`<div role="main">
    <div class="pending"><a href="/groups/1/user/100011/">Salim</a><p>Recette</p>
      <div role="button" aria-haspopup="menu" class="more">…</div><div role="button" class="ok">Approve</div></div></div>`,
    'https://www.facebook.com/groups/1/pending_posts');
  const done = [];
  w.document.querySelector('.more').addEventListener('click', () => {
    w.document.body.insertAdjacentHTML('beforeend', '<div role="menu"><div role="menuitem">Pre-approve posts from Salim</div></div>');
    w.document.querySelector('[role="menuitem"]').addEventListener('click', () => done.push('preapprove'));
  });
  r = await w.FPM.preapproveFromPending(ours);
  check('repli : pré-approuvé depuis son post en attente', r.outcome === 'done' && done.includes('preapprove'), r);

  console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})();
