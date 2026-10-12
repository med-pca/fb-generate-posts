/**
 * La lecture de l'état d'adhésion sur la page d'un groupe, en plusieurs
 * langues — dont l'arabe, où un groupe public rejoint passait pour « demande
 * envoyée ».   node extension/fb-group-joiner/tests/join-test.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const src = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const fnSource = src.slice(src.indexOf('async function joinGroupInPage'), src.indexOf("// Une erreur d'envoi ne doit pas bloquer la file"));

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko++;
};
function page(body) {
  const dom = new JSDOM(`<!doctype html><body><div role="main">${body}</div></body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
  w.eval(`${fnSource}; window.joinGroupInPage = joinGroupInPage;`);
  return w;
}

(async () => {
  let w = page('<div role="button">انضممت</div>');
  let r = await w.joinGroupInPage('join');
  check('arabe « انضممت » : déjà membre', r.status === 'already', r);

  w = page('<div role="button" aria-label="عضو">‏عضو‏</div>');
  r = await w.joinGroupInPage('join');
  check('arabe « عضو » avec signes invisibles : déjà membre', r.status === 'already', r);

  // Groupe public : après le clic, le bouton devient « انضممت ».
  w = page('<div role="button" class="j">انضمام إلى المجموعة</div>');
  w.document.querySelector('.j').addEventListener('click', (e) => { e.target.textContent = 'انضممت'; });
  r = await w.joinGroupInPage('join');
  check('groupe public en arabe : rejoint (pas « demande envoyée »)', r.status === 'joined', r);

  // Groupe public : le bouton disparaît, la zone « اكتب شيئًا » apparaît.
  w = page('<div role="button" class="j">انضمام إلى المجموعة</div>');
  w.document.querySelector('.j').addEventListener('click', (e) => { e.target.remove(); w.document.querySelector('[role="main"]').insertAdjacentHTML('beforeend', '<div role="button">اكتب شيئًا...</div>'); });
  r = await w.joinGroupInPage('join');
  check('zone « اكتب شيئًا » réservée aux membres : rejoint', r.status === 'joined', r);

  // Groupe privé : « إلغاء الطلب ».
  w = page('<div role="button" class="j">انضمام إلى المجموعة</div>');
  w.document.querySelector('.j').addEventListener('click', (e) => { e.target.textContent = 'إلغاء الطلب'; });
  r = await w.joinGroupInPage('join');
  check('groupe privé en arabe : demande envoyée', r.status === 'requested' && /en attente/.test(r.message), r);

  w = page('<div role="button">Joined ▾</div>');
  check('anglais « Joined ▾ » : déjà membre', (await w.joinGroupInPage('join')).status === 'already', null);

  w = page('<div role="button">Annuler la demande</div>');
  check('français « Annuler la demande » : en attente', (await w.joinGroupInPage('check')).status === 'requested', null);

  w = page('<div role="button">Rejoindre le groupe</div>');
  check('vérification : « Rejoindre » revenu → refusée/expirée', (await w.joinGroupInPage('check')).status === 'declined', null);

  console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})();
