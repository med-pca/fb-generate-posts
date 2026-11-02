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
/** Les cinq missions, chacune séparée : ce qu'elle fait, l'option de la
 * plateforme qui l'autorise, ses compteurs du jour. */
const MISSIONS = [
  {
    kind: 'preapprove',
    title: '🛂 Adhésion et pré-approbation',
    what: 'Accepte la demande d’adhésion de <b>nos</b> profils, puis les pré-approuve (leurs posts paraissent sans validation). Fait aussi les contrôles demandés par l’admin.',
    server: 'members',
    run: 'Pré-approuver maintenant',
    counts: [
      ['approved', '✓ adhésions acceptées', 'good'],
      ['preapproved', '✓ pré-approuvés', 'good'],
      ['audit_already', 'contrôle : déjà fait', 'good'],
      ['audit_fixed', 'contrôle : corrigé', 'good'],
      ['audit_not_done', 'contrôle : pas fait', 'warn'],
      ['audit_no_permission', 'pas l’option', 'bad'],
      ['audit_not_found', 'option introuvable', 'warn'],
      ['failed', 'échecs', 'bad'],
    ],
  },
  {
    kind: 'spam',
    title: '🧹 Spam potentiel',
    what: 'Ouvre le « Spam potentiel » de nos groupes et clique <b>« Publier »</b> sous les posts dont l’auteur est un de <b>nos</b> profils. Jamais « Refuser », jamais le post d’un autre membre.',
    server: 'spam',
    run: 'Passer au spam maintenant',
    counts: [
      ['spam_released', '✓ sortis du spam', 'good'],
      ['spam_checked', 'groupes vus, rien à nous', ''],
      ['failed', 'échecs', 'bad'],
    ],
  },
  {
    kind: 'pending',
    title: '⏳ Posts en attente',
    what: 'Valide nos posts restés « en attente de validation » dans un groupe : le profil qui l’a publié pose ensuite le lien.',
    server: 'pending',
    run: 'Valider maintenant',
    counts: [
      ['approved_post', '✓ posts validés', 'good'],
      ['failed', 'échecs', 'bad'],
    ],
  },
  {
    kind: 'posts',
    title: '📰 Vérification des posts',
    what: 'Rouvre les posts publiés : en ligne avec le lien de l’article ? Sans lien, il les <b>supprime</b> et la plateforme les republie. <b>Option coupée par défaut</b> sur la plateforme.',
    server: 'postsCheck',
    run: 'Vérifier maintenant',
    counts: [
      ['ok', '✓ en ligne avec lien', 'good'],
      ['missing_link', 'sans lien', 'bad'],
      ['missing_post', 'introuvables', 'bad'],
      ['deleted', 'supprimés', ''],
      ['requeued', 'republiés', ''],
      ['pending', 'en attente', ''],
      ['unreachable', 'illisibles', 'warn'],
      ['failed', 'erreurs', 'bad'],
    ],
  },
  {
    kind: 'removals',
    title: '🚫 Retrait des profils suspendus',
    what: 'Retire de nos groupes nos profils suspendus par Facebook, à la demande d’un administrateur. <b>Option coupée par défaut</b> sur la plateforme.',
    server: 'removals',
    run: 'Retirer maintenant',
    counts: [
      ['removed', '✓ retirés', 'good'],
      ['failed', 'échecs', 'bad'],
    ],
  },
];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const time = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const today = () => new Date().toISOString().slice(0, 10);

function statusLine(st) {
  if (!st || !st.message) return '—';
  return `${st.message}${st.at ? ` (${time(st.at)})` : ''}`;
}

async function render() {
  const keys = [...FIELDS, 'enabled', 'server', 'status_system', ...MISSIONS.flatMap((m) => [`auto_${m.kind}`, `status_${m.kind}`, `logs_${m.kind}`, `stats_${m.kind}`])];
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

  for (const m of MISSIONS) {
    const section = $(`#m-${m.kind}`);
    // Ce que la plateforme autorise (une plateforme d'avant : tout).
    const allowed = !s.server || !(m.server in s.server) || s.server[m.server] === true;
    section.classList.toggle('off', !allowed);
    const auto = $(`#auto-${m.kind}`);
    auto.checked = allowed && s[`auto_${m.kind}`] !== false;
    auto.disabled = !allowed;
    const st = s[`status_${m.kind}`] || {};
    const box = $(`#status-${m.kind}`);
    box.className = `status ${allowed ? st.state || '' : 'off'}`;
    box.textContent = allowed ? statusLine(st) : 'Désactivée sur la plateforme (Modérateurs → réglages)';
    const stats = s[`stats_${m.kind}`];
    const counts = stats && stats.day === today() ? stats.counts : {};
    $(`#counts-${m.kind}`).innerHTML =
      '<small>Aujourd’hui</small>' +
      m.counts
        .filter(([key], i) => counts[key] || i < 2)
        .map(([key, label, tone]) => `<span class="count ${counts[key] ? tone : ''}"><b>${counts[key] || 0}</b> ${label}</span>`)
        .join('');
    const logs = s[`logs_${m.kind}`] || [];
    $(`#logs-${m.kind}`).innerHTML =
      logs
        .slice(0, 30)
        .map(
          (l) =>
            `<li class="${l.level}"><b>${esc(RESULTS[l.result] || (l.level === 'error' ? 'erreur' : ''))}</b> ${esc(l.message)}` +
            `<small>${time(l.at)}${l.postUrl ? ` · <a href="${esc(l.postUrl)}" target="_blank">ouvrir</a>` : ''}</small></li>`,
        )
        .join('') || '<li class="empty">Rien pour l’instant.</li>';
    section.querySelector('[data-run]').disabled = !configured || !allowed;
  }
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
/** Les sections, une par mission. */
$('#missions').innerHTML = MISSIONS.map(
  (m) => `<section class="mission" id="m-${m.kind}">
    <header>
      <h2>${m.title}</h2>
      <label class="switch" title="Automatique pour cette mission"><input type="checkbox" id="auto-${m.kind}"><span>auto</span></label>
    </header>
    <p class="what">${m.what}</p>
    <div class="status" id="status-${m.kind}">—</div>
    <div class="counts" id="counts-${m.kind}"></div>
    <button class="secondary run" data-run="${m.kind}">${m.run}</button>
    <details>
      <summary>Historique</summary>
      <ul class="logs" id="logs-${m.kind}"></ul>
    </details>
  </section>`,
).join('');
for (const m of MISSIONS) $(`#auto-${m.kind}`).onchange = (e) => chrome.storage.local.set({ [`auto_${m.kind}`]: e.target.checked });
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
