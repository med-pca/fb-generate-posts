/**
 * Les deux nouvelles missions du modérateur, contre des pages qui imitent
 * Facebook : retirer de nos groupes un de NOS profils suspendus (jamais un
 * homonyme, jamais « bloquer »), et valider un de NOS posts en attente.
 *
 *   node extension/fb-post-checker/tests/group-tasks-test.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const src = (f) => fs.readFileSync(path.join(__dirname, `../${f}`), 'utf8');
const HUMAN = src('human.js'), CHECK = src('check.js'), MEMBERS = src('members.js');

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
  w.eval(HUMAN);
  w.eval(CHECK);
  w.eval(MEMBERS);
  return w;
}
const ours = { facebookUserId: '100011', name: 'Salim Bennani' };
const person = (id, name) => `<div class="person" data-id="${id}"><a href="/groups/1/user/${id}/">${name}</a><span>Membre</span><div role="button" aria-label="Member settings" class="dots">…</div></div>`;

function peoplePage(rows, items) {
  const w = page(`<div role="main"><input placeholder="Find a member"><div role="list">${rows}</div></div>`, 'https://www.facebook.com/groups/1/people');
  const log = [];
  w.document.querySelectorAll('.dots').forEach((b) => b.addEventListener('click', () => {
    const who = b.closest('.person').dataset.id;
    log.push(`menu:${who}`);
    w.document.body.insertAdjacentHTML('beforeend', `<div role="menu">${items.map((i) => `<div role="menuitem">${i}</div>`).join('')}</div>`);
    w.document.querySelectorAll('[role="menuitem"]').forEach((m) => m.addEventListener('click', () => {
      log.push(`item:${m.textContent}`);
      w.document.querySelector('[role="menu"]')?.remove();
      w.document.body.insertAdjacentHTML('beforeend', `<div role="dialog"><h2>Remove Salim Bennani from group?</h2>
        <label><input type="checkbox"> Block</label><div role="button" class="cancel">Cancel</div><div role="button" class="ok">Confirm</div></div>`);
      const d = w.document.querySelector('[role="dialog"]');
      d.querySelector('.cancel').addEventListener('click', () => { log.push('cancel'); d.remove(); });
      d.querySelector('.ok').addEventListener('click', () => {
        log.push('confirm');
        d.remove();
        w.document.querySelector(`.person[data-id="${who}"]`)?.remove();
      });
    }));
  }));
  return { w, log };
}

(async () => {
  // ─── Retirer un de nos profils suspendus ────────────────────────────
  let { w, log } = peoplePage(person('999999', 'Omar') + person('100011', 'Salim Bennani'), ['Make admin', 'Block from group', 'Remove member']);
  let r = await w.FPM.removeFromPeople(ours);
  check('retire NOTRE profil (menu de SA ligne, « Remove member », confirmer)', r.outcome === 'done' && log.join(',') === 'menu:100011,item:Remove member,confirm', { r, log });
  check('jamais « Block from group »', !log.some((l) => /Block/.test(l)), log);

  ({ w, log } = peoplePage(person('100011', 'Salim Bennani'), ['Make admin', 'Mute member']));
  r = await w.FPM.removeFromPeople(ours);
  check('pas d’option « Retirer » → no_permission, rien confirmé', r.outcome === 'no_permission' && !log.includes('confirm'), { r, log });

  ({ w, log } = peoplePage(person('999999', 'Omar'), ['Remove member']));
  r = await w.FPM.removeFromPeople(ours);
  check('absent des membres → not_found, rien cliqué', r.outcome === 'not_found' && !log.length, { r, log });

  // ─── Valider un de nos posts en attente ─────────────────────────────
  const pending = (id, author, text) => `<div role="article" data-id="${id}"><a href="/groups/1/user/1/">${author}</a><p>${text}</p>
    <div role="button" class="approve">Approve</div><div role="button">Decline</div></div>`;
  w = page(`<div role="main">${pending('a', 'Autre membre', 'Une recette facile de couscous au poulet')}${pending('b', 'Salim Bennani', 'Une recette facile de couscous au poulet')}</div>`,
    'https://www.facebook.com/groups/1/pending_posts');
  const approved = [];
  w.document.querySelectorAll('.approve').forEach((b) => b.addEventListener('click', () => { approved.push(b.closest('[role="article"]').dataset.id); b.closest('[role="article"]').remove(); }));
  r = await w.FPM.approvePendingPost({ content: 'Une recette facile de couscous au poulet', author: { name: 'Salim Bennani' } });
  check('valide NOTRE post (texte + auteur), pas celui d’un autre membre', r.outcome === 'done' && approved.join() === 'b', { r, approved });

  w = page('<div role="main"><p>Aucune publication en attente</p></div>', 'https://www.facebook.com/groups/1/pending_posts');
  r = await w.FPM.approvePendingPost({ content: 'Une recette facile', author: { name: 'Salim Bennani' } });
  check('rien en attente → not_found', r.outcome === 'not_found', r);

  console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})();
