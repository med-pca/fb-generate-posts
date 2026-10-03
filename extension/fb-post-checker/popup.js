const $ = (s) => document.querySelector(s);
const FIELDS = ['apiBase', 'apiKey', 'profileExternalId'];
const RESULTS = {
  verified: 'vérifié',
  requeued: 'republié',
  needs_action: 'à traiter',
  retry_later: 'à revoir',
  member_done: 'fait',
  gave_up: 'abandonné',
  audit: 'contrôle',
};
/** Les compteurs du jour, mission par mission : ce qui a marché, et non. */
const COUNTS = {
  posts: [
    ['ok', '✓ en ligne avec lien', 'good'],
    ['missing_link', 'sans lien', 'bad'],
    ['missing_post', 'introuvables', 'bad'],
    ['deleted', 'supprimés', ''],
    ['requeued', 'republiés', ''],
    ['pending', 'en attente', ''],
    ['unreachable', 'illisibles', 'warn'],
    ['failed', 'erreurs', 'bad'],
  ],
  members: [
    ['approved', '✓ adhésions acceptées', 'good'],
    ['preapproved', '✓ pré-approuvés', 'good'],
    ['audit_already', 'contrôle : déjà fait', 'good'],
    ['audit_not_done', 'contrôle : pas fait', 'warn'],
    ['audit_fixed', 'contrôle : corrigé', 'good'],
    ['audit_no_permission', 'pas l’option', 'bad'],
    ['audit_not_found', 'option introuvable', 'warn'],
    ['failed', 'échecs', 'bad'],
  ],
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const time = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const today = () => new Date().toISOString().slice(0, 10);

function statusLine(st) {
  if (!st || !st.message) return '—';
  return `${st.message}${st.at ? ` (${time(st.at)})` : ''}`;
}

async function render() {
  const keys = [...FIELDS, 'enabled', 'members', 'posts', 'server', 'status_system', 'status_posts', 'status_members', 'logs_posts', 'logs_members', 'stats_posts', 'stats_members'];
  const s = await chrome.storage.local.get(keys);
  for (const f of FIELDS) if (document.activeElement !== $(`#${f}`)) $(`#${f}`).value = s[f] || self.FPC_CONFIG[f] || '';
  const configured = Boolean((s.apiKey || self.FPC_CONFIG.apiKey) && (s.profileExternalId || self.FPC_CONFIG.profileExternalId));
  $('#setup').open = !configured;
  const every = s.server?.everyMinutes || self.FPC_CONFIG.everyMinutes;
  $('#toggle').textContent = s.enabled ? 'Désactiver le mode automatique' : 'Activer le mode automatique';
  $('#toggle').classList.toggle('on', Boolean(s.enabled));
  $('#toggle').disabled = !configured;
  const sys = s.status_system || {};
  $('#state').className = `state ${sys.state || ''}`;
  $('#state').textContent =
    (s.enabled ? `● Automatique, toutes les ${every} min` : '○ Manuel (automatique désactivé)') +
    (sys.message ? ` — ${statusLine(sys)}` : '');

  $('#auto-posts').checked = s.posts !== false;
  $('#auto-members').checked = s.members !== false && s.server?.members !== false;
  $('#auto-members').disabled = s.server?.members === false;
  for (const cat of ['posts', 'members']) {
    const st = s[`status_${cat}`] || {};
    const box = $(`#status-${cat}`);
    box.className = `status ${st.state || ''}`;
    box.textContent = statusLine(st);
    const stats = s[`stats_${cat}`];
    const counts = stats && stats.day === today() ? stats.counts : {};
    $(`#counts-${cat}`).innerHTML =
      '<small>Aujourd’hui</small>' +
      COUNTS[cat]
        .filter(([key], i) => counts[key] || i < 3)
        .map(([key, label, tone]) => `<span class="count ${counts[key] ? tone : ''}"><b>${counts[key] || 0}</b> ${label}</span>`)
        .join('');
    const logs = s[`logs_${cat}`] || [];
    $(`#logs-${cat}`).innerHTML =
      logs
        .slice(0, 30)
        .map(
          (l) =>
            `<li class="${l.level}"><b>${esc(RESULTS[l.result] || (l.level === 'error' ? 'erreur' : ''))}</b> ${esc(l.message)}` +
            `<small>${time(l.at)}${l.postUrl ? ` · <a href="${esc(l.postUrl)}" target="_blank">ouvrir</a>` : ''}</small></li>`,
        )
        .join('') || '<li class="empty">Rien pour l’instant.</li>';
  }
  document.querySelectorAll('[data-run]').forEach((b) => (b.disabled = !configured));
  if (s.server?.members === false) $('#status-members').textContent = 'Désactivé par l’administrateur (rubrique Modérateurs)';
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
$('#auto-posts').onchange = (e) => chrome.storage.local.set({ posts: e.target.checked });
$('#auto-members').onchange = (e) => chrome.storage.local.set({ members: e.target.checked });
document.querySelectorAll('[data-run]').forEach(
  (b) =>
    (b.onclick = async () => {
      b.disabled = true;
      await chrome.runtime.sendMessage({ type: 'run-now', kind: b.dataset.run });
      setTimeout(() => {
        b.disabled = false;
        render();
      }, 600);
    }),
);
chrome.storage.onChanged.addListener(render);
render();
