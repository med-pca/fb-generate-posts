/* The control panel: what app/web.py served on localhost:8765, in the popup.
 * It owns no logic -- every button is one message to the service worker. */

const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

const PHASES = {
  claim: 'reservation d’un lot',
  publish: 'publication',
  wait: 'attente entre deux posts',
  complete: 'cloture du job',
  link: 'modification des commentaires',
  recover: 'reprise apres interruption',
};

function countdown(at) {
  const left = at - Date.now();
  if (!at || left <= 0) return 'maintenant';
  const s = Math.round(left / 1000);
  if (s < 60) return `dans ${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `dans ${m} min ${s % 60}s` : `dans ${Math.floor(m / 60)} h ${m % 60} min`;
}

async function render() {
  const status = await send('status');
  if (!status || !status.ok) return;
  const { state, config, problems } = status;

  $('badge').textContent = state.running ? 'en cours' : 'arrete';
  $('badge').className = `badge ${state.running ? 'on' : 'off'}`;
  $('profile').textContent = config.profileExternalId || '(non configure)';
  $('phase').textContent = state.running ? (PHASES[state.phase] || state.phase) : '-';
  $('due').textContent = state.running ? countdown(state.nextDueAt) : '-';
  $('group').textContent = state.job ? `${state.job.groupName || state.job.groupId} (${(state.job.posts || []).length} post(s))` : '-';
  $('message').textContent = state.lastMessage || '';

  // Qui commande. Sans cette ligne, un profil arrete par l'admin ressemble a
  // un profil qu'on aurait oublie de demarrer.
  const remote = state.remote;
  if (!config.controlEnabled) {
    $('remote').textContent = 'non pilote (local)';
  } else if (!remote || !remote.at) {
    $('remote').textContent = problems.length ? 'a configurer' : 'pas encore demande';
  } else if (remote.error) {
    $('remote').textContent = `injoignable (${remote.error.slice(0, 40)})`;
  } else {
    $('remote').textContent = `${remote.run ? 'publier' : 'arret'} - ${remote.reason}`;
  }

  $('published').textContent = state.stats.published || 0;
  $('failed').textContent = state.stats.failed || 0;
  $('links').textContent = state.stats.links || 0;
  $('empty').textContent = state.stats.empty || 0;

  // Non appairé : dire quoi faire, pas ce qui manque. Trois champs vides ne
  // disent pas « colle le code de l'admin », et c'est pourtant tout ce qu'il y
  // a à faire.
  const unpaired = !config.apiKey || !config.profileExternalId;
  $('problems').hidden = problems.length === 0;
  $('problems').textContent = !problems.length
    ? ''
    : unpaired
      ? 'Navigateur pas encore appairé. Dans l’admin : Pilotage → Appairer, puis colle le code dans les Options.'
      : `A regler dans les options : ${problems.join(', ')}.`;

  $('start').disabled = state.running || problems.length > 0;
  $('once').disabled = state.running || problems.length > 0;
  $('stop').disabled = !state.running;
  $('links-btn').disabled = state.running || problems.length > 0;

  const { logs } = await send('logs');
  const list = $('log');
  list.replaceChildren(...(logs || []).slice(-60).reverse().map((line) => {
    const li = document.createElement('li');
    li.className = line.level;
    const time = document.createElement('time');
    time.textContent = new Date(line.at).toLocaleTimeString('fr-FR', { hour12: false });
    const text = document.createElement('span');
    text.textContent = line.message;
    li.append(time, text);
    return li;
  }));
}

const act = (id, type, confirmText) => {
  $(id).addEventListener('click', async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    $(id).disabled = true;
    const answer = await send(type);
    if (answer && answer.message && (!answer.ok || type === 'placeLinks')) $('message').textContent = answer.message;
    await render();
  });
};

act('start', 'start');
act('stop', 'stop');
act('once', 'startOnce');
act('links-btn', 'placeLinks', 'Remplacer maintenant par leur URL tous les commentaires de ce profil qui l’attendent encore ?');
act('sync', 'sync');
act('tab', 'openTab');
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('clear').addEventListener('click', async () => {
  await send('clearLogs');
  await render();
});

render();
setInterval(render, 1000);
