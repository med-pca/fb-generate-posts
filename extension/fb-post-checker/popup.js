const $ = (s) => document.querySelector(s);
const FIELDS = ['apiBase', 'apiKey', 'profileExternalId'];
const RESULTS = {
  verified: 'vérifié',
  requeued: 'remis dans la file',
  needs_action: 'à traiter',
  retry_later: 'à revoir plus tard',
  member_done: 'fait',
  gave_up: 'abandonné',
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const time = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

async function render() {
  const s = await chrome.storage.local.get([...FIELDS, 'enabled', 'status', 'logs', 'members']);
  $('#members').checked = s.members !== false;
  for (const f of FIELDS) if (document.activeElement !== $(`#${f}`)) $(`#${f}`).value = s[f] || self.FPC_CONFIG[f] || '';
  const configured = Boolean((s.apiKey || self.FPC_CONFIG.apiKey) && (s.profileExternalId || self.FPC_CONFIG.profileExternalId));
  $('#setup').open = !configured;
  $('#toggle').textContent = s.enabled ? 'Désactiver' : 'Activer';
  $('#toggle').classList.toggle('on', Boolean(s.enabled));
  $('#toggle').disabled = $('#run').disabled = !configured;
  const st = s.status || {};
  $('#state').className = `state ${st.state || ''}`;
  $('#state').textContent =
    (s.enabled ? `● Actif, toutes les ${self.FPC_CONFIG.everyMinutes} min` : '○ Inactif') +
    (st.message ? ` — ${st.message}` : '') +
    (st.at ? ` (${time(st.at)})` : '');
  const logs = s.logs || [];
  $('#logs').innerHTML =
    logs
      .map(
        (l) =>
          `<li class="${l.level}"><b>${esc(RESULTS[l.result] || (l.level === 'error' ? 'erreur' : ''))}</b> ${esc(l.message)}` +
          `<small>${time(l.at)}${l.postUrl ? ` · <a href="${esc(l.postUrl)}" target="_blank">ouvrir</a>` : ''}</small></li>`,
      )
      .join('') || '<li class="empty">Aucun contrôle pour l’instant.</li>';
}

$('#save').onclick = async () => {
  const patch = {};
  for (const f of FIELDS) patch[f] = $(`#${f}`).value.trim();
  await chrome.storage.local.set(patch);
  await chrome.runtime.sendMessage({ type: 'schedule' });
  render();
};
$('#toggle').onclick = async () => {
  const { enabled } = await chrome.storage.local.get('enabled');
  await chrome.storage.local.set({ enabled: !enabled });
  await chrome.runtime.sendMessage({ type: 'schedule' });
  render();
};
$('#members').onchange = async () => {
  await chrome.storage.local.set({ members: $('#members').checked });
};
$('#run').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'run-now' });
  setTimeout(render, 300);
};
chrome.storage.onChanged.addListener(render);
render();
