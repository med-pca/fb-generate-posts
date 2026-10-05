/* The settings page. Every value maps to one of app/config.py's inputs or one
 * of the .env overrides; what is gone is everything about NSTBrowser, since the
 * browser this runs in IS the profile. */

const TEXT = ['apiBaseUrl', 'apiKey', 'profileExternalId', 'groupExternalId', 'firstCommentText'];
const NUMBERS = [
  'delayUnitSeconds', 'staggerSeconds', 'busyRetrySeconds', 'idlePollSeconds',
  'maxPostsPerRun', 'stepTimeoutSeconds', 'navigationTimeoutSeconds',
  'linkPreviewMinSeconds', 'linkPreviewWaitSeconds', 'closeIfWaitMinutes',
];
const FLAGS = [
  'controlEnabled',
  'addFirstComment',
  'focusWorkTab',
  'reuseWorkTab',
  'closeWhenIdle',
];

const $ = (id) => document.getElementById(id);
/* Parler au service de l'extension. S'il ne répond pas (copie incomplète,
 * extension en erreur), on le DIT au lieu de laisser des champs vides et un
 * « Appairage en cours... » qui ne finit jamais. */
const WORKER_DOWN =
  "Le service de l'extension ne repond pas. Ouvre chrome://extensions, active le mode developpeur, " +
  "puis clique sur ↻ (Recharger) sur « Publication · PostFlow ». Si un bouton « Erreurs » s'affiche, " +
  "retelecharge l'extension depuis la plateforme (Extensions → Publication → Telecharger (preconfiguree)) " +
  "et remplace tout le dossier.";
async function send(type, extra = {}, timeoutMs = 30000) {
  let timer;
  try {
    const answer = await Promise.race([
      chrome.runtime.sendMessage({ type, ...extra }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    if (answer === undefined) throw new Error('aucune reponse');
    return answer;
  } catch (err) {
    return { ok: false, message: err.message === 'timeout' ? "Pas de reponse en 30 s : le serveur ou l'extension ne repond pas" : WORKER_DOWN, down: err.message !== 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}

function note(el, message, kind = '') {
  el.textContent = message;
  el.className = `note ${kind}`;
}

async function load() {
  const answer = await send('status');
  if (!answer.ok && answer.down) {
    note($('pairState'), answer.message, 'err');
    return;
  }
  const { config, problems } = answer;
  TEXT.forEach((key) => { $(key).value = config[key] || ''; });
  NUMBERS.forEach((key) => { $(key).value = config[key]; });
  FLAGS.forEach((key) => { $(key).checked = Boolean(config[key]); });
  showPairState(config, problems);
}

/** Où en est ce navigateur : appairé, ou pas encore. C'est la seule question à
 * laquelle cette page doit répondre d'un coup d'œil. */
function showPairState(config, problems) {
  const paired = config.apiKey && config.profileExternalId;
  if (paired) {
    note(
      $('pairState'),
      `Ce navigateur tient le profil ${config.profileExternalId} sur ${config.apiBaseUrl}.`
        + ' Un nouveau code le rattacherait a un autre profil.',
    );
  } else {
    note(
      $('pairState'),
      `A appairer : ${(problems || []).join(', ')}.`,
      'err',
    );
  }
  // Ouvrir les reglages avances quand il n'y a rien : c'est le seul cas où
  // l'operateur peut avoir besoin d'y toucher (serveur de test, pas de code).
  const advanced = document.querySelector('details');
  if (advanced && !paired && !config.apiBaseUrl) advanced.open = true;
}

async function connect() {
  const field = $('pairCode');
  const code = field.value.trim().toUpperCase();
  if (!code) return note($('pairNote'), 'Colle le code emis par l’admin', 'err');
  note($('pairNote'), 'Appairage en cours...');
  $('pair').disabled = true;
  try {
    const answer = await send('pair', { code });
    note($('pairNote'), answer.message, answer.ok ? 'ok' : 'err');
    if (answer.ok) field.value = '';
    await load();
  } finally {
    $('pair').disabled = false;
  }
}

async function autoConnect() {
  note($('autoPairNote'), 'Detection du profil NSTBrowser...');
  $('autoPair').disabled = true;
  try {
    const answer = await send('autoPair');
    note($('autoPairNote'), answer.message, answer.ok ? 'ok' : 'err');
    await load();
  } finally {
    $('autoPair').disabled = false;
  }
}

async function save() {
  const patch = {};
  TEXT.forEach((key) => { patch[key] = $(key).value.trim(); });
  NUMBERS.forEach((key) => { patch[key] = Number($(key).value); });
  FLAGS.forEach((key) => { patch[key] = $(key).checked; });
  const answer = await send('saveConfig', { patch });
  if (!answer.ok) return note($('saved'), answer.message || 'Echec', 'err');
  note($('saved'), answer.problems.length ? `Enregistre, mais : ${answer.problems.join(', ')}` : 'Enregistre', answer.problems.length ? 'err' : 'ok');
  setTimeout(() => note($('saved'), ''), 4000);
}

/* The API and the image host are read by the extension itself, so they need a
 * host permission. Facebook and localhost are granted at install; anything else
 * is asked for here, once. */
async function grant() {
  const granted = await chrome.permissions.request({ origins: ['*://*/*'] });
  note($('testNote'), granted ? 'Acces autorise' : 'Acces refuse', granted ? 'ok' : 'err');
}

async function loadProfiles() {
  note($('profilesNote'), 'Lecture de la liste...');
  const answer = await send('profiles');
  if (!answer.ok) return note($('profilesNote'), answer.message || 'Liste indisponible', 'err');
  const list = $('profiles');
  list.replaceChildren(...answer.profiles.map((p) => {
    const option = document.createElement('option');
    option.value = p.externalId;
    option.label = p.name || p.externalId;
    return option;
  }));
  note($('profilesNote'), `${answer.profiles.length} profil(s) proposes par l'API`, 'ok');
}

$('pair').addEventListener('click', connect);
$('autoPair').addEventListener('click', autoConnect);
// Entree vaut Connecter : le code arrive du presse-papiers, la main est deja la.
$('pairCode').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    connect();
  }
});
$('save').addEventListener('click', save);
$('grant').addEventListener('click', grant);
$('load').addEventListener('click', async () => { await save(); await loadProfiles(); });
$('test').addEventListener('click', async () => {
  await save();
  note($('testNote'), 'Test en cours...');
  const answer = await send('testApi');
  note($('testNote'), answer.message || (answer.ok ? 'OK' : 'Echec'), answer.ok ? 'ok' : 'err');
});

load();
