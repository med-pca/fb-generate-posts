/**
 * Le popup : lit la publication ouverte dans l'onglet, laisse vérifier ce
 * qui a été relevé, demande l'article à réécrire, et envoie le tout en un
 * appel. Rien n'est envoyé sans que l'utilisateur ait vu ce qui part.
 */
const config = self.FCP_CONFIG;
const els = {
  capture: document.getElementById('capture'),
  preview: document.getElementById('preview'),
  caption: document.getElementById('caption'),
  source: document.getElementById('source'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
  follow: document.getElementById('follow'),
};
let captured = null;

function say(message, kind = '') {
  els.status.textContent = message;
  els.status.className = kind;
}

/** Le bouton ne s'active que si les deux moitiés sont là : le texte relevé
 * et l'article à réécrire. */
function refresh() {
  const source = els.source.value.trim();
  els.send.disabled = !(
    captured && els.caption.value.trim().length >= 15 && /^https:\/\/\S+\.\S+/.test(source)
  );
}

async function capture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(tab.url || '')) {
    say("Ouvrez d'abord la publication Facebook à reprendre.", 'error');
    return;
  }
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['capture.js'],
    });
  } catch (error) {
    say('Lecture impossible : ' + error.message, 'error');
    return;
  }
  if (!result || result.blocked) {
    say("Facebook n'a pas montré la publication à ce compte.", 'error');
    return;
  }
  if (!result.caption || result.caption.length < 15) {
    say("Aucun texte trouvé. Ouvrez la publication elle-même (clic sur sa date), pas le fil.", 'error');
    return;
  }
  captured = result;
  els.caption.value = result.caption;
  if (result.imageUrl) els.preview.src = result.imageUrl;
  els.capture.classList.remove('hidden');
  say(
    result.postsOnPage > 1
      ? `Publication la plus visible sur ${result.postsOnPage} — vérifiez le texte.`
      : (result.imageUrl ? 'Texte et image relevés.' : 'Texte relevé, aucune image.'),
  );
  refresh();
}

async function send() {
  els.send.disabled = true;
  say('Envoi…');
  const body = {
    facebookUrl: captured.facebookUrl,
    sourceUrl: els.source.value.trim(),
    caption: els.caption.value.trim(),
    language: config.language || 'fr',
  };
  if (captured.imageUrl) body.imageUrl = captured.imageUrl;
  if (config.profileIds && config.profileIds.length) body.profileIds = config.profileIds;

  let response;
  try {
    response = await fetch(`${config.apiBase}/api/jobs/scrape/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify(body),
    });
  } catch (error) {
    say('Serveur injoignable : ' + error.message, 'error');
    els.send.disabled = false;
    return;
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text);
      detail = [].concat(parsed.message || detail).join('\n');
    } catch { /* la réponse n'est pas du JSON : on montre le texte brut */ }
    say(`Refusé (HTTP ${response.status})\n${detail}`, 'error');
    els.send.disabled = false;
    return;
  }
  const { ingestId } = JSON.parse(text);
  // Le serveur rend la main tout de suite : la réécriture, le dépôt
  // WordPress et la fabrication du post suivent, en une minute environ.
  say('Envoyé. La réécriture et la publication suivent côté serveur.', 'ok');
  els.follow.href = `${config.apiBase}/admin/?ingest=${ingestId}`;
  els.follow.textContent = `Suivre la reprise ${ingestId.slice(0, 10)}…`;
  els.follow.classList.remove('hidden');
}

els.source.addEventListener('input', refresh);
els.caption.addEventListener('input', refresh);
els.send.addEventListener('click', () => void send());
void capture();
