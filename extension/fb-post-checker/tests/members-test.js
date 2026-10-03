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
