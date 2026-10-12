/* Les trois langues : traduction à l'affichage, retour au français intact,
 * écrans redessinés traduits, arabe de droite à gauche.
 *   node public/admin/tests/i18n-test.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, '../../../node_modules/jsdom'));
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const i18n = fs.readFileSync(path.join(__dirname, '../i18n.js'), 'utf8');

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ` → ${JSON.stringify(got)}`}`);
  if (!ok) ko++;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://post.pulserecipe.com/' });
  const w = dom.window;
  w.localStorage.setItem('pf.lang', 'ar');
  w.eval(i18n);
  await tick();
  const nav = () => [...w.document.querySelectorAll('.nav span')].map((s) => s.textContent);
  check('arabe : la page passe de droite à gauche', w.document.documentElement.dir === 'rtl' && w.document.documentElement.lang === 'ar');
  check('arabe : le menu est traduit', nav().includes('المقالات') && nav().includes('الحملات') === false && nav().includes('التحليل'), nav());
  check('arabe : un placeholder est traduit', w.document.querySelector('#af-search').placeholder === 'عنوان المقال أو رابطه', w.document.querySelector('#af-search').placeholder);
  check('arabe : le sélecteur de langue est rempli', w.document.querySelector('[data-lang-select]').options.length === 3);

  // Un écran se redessine : ses textes sont traduits à leur arrivée.
  w.document.querySelector('#article-cards').innerHTML = '<button>Modifier</button><span>12 groupe(s)</span><span>Texte libre d’un utilisateur</span>';
  await tick();
  const card = w.document.querySelector('#article-cards').textContent;
  check('écran redessiné : « Modifier » traduit', card.includes('تعديل'), card);
  check('nombre : « 12 groupe(s) » traduit par modèle', card.includes('12 مجموعة'), card);
  check('texte libre inconnu : laissé tel quel', card.includes('Texte libre d’un utilisateur'), card);

  w.PF_I18N.setLang('en');
  await tick();
  check('anglais : de gauche à droite, menu en anglais', w.document.documentElement.dir === 'ltr' && nav().includes('Analytics'), nav());
  check('anglais : le texte ajouté passe aussi en anglais', w.document.querySelector('#article-cards').textContent.includes('Edit'));

  w.PF_I18N.setLang('fr');
  await tick();
  check('retour au français : textes d’origine intacts', nav().includes('Articles') && nav().includes('Analyse') && w.document.querySelector('#article-cards button').textContent === 'Modifier', nav());
  check('retour au français : placeholder d’origine', w.document.querySelector('#af-search').placeholder === 'Titre ou adresse de l’article');

  // En français, rien n'est réécrit (aucun coût, aucun risque).
  w.document.querySelector('#article-cards').innerHTML = '<button>Supprimer</button>';
  await tick();
  check('français : un nouvel écran reste en français', w.document.querySelector('#article-cards button').textContent === 'Supprimer');

  console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})();
