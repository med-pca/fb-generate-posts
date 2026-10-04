const $ = (id) => document.getElementById(id);

const STATUS_LABELS = {
  pending: "En attente",
  processing: "En cours…",
  joined: "Rejoint",
  already: "Déjà membre",
  requested: "Demande envoyée",
  declined: "Demande refusée",
  questions: "Questions",
  error: "Erreur",
};

const SETTING_FIELDS = ["minDelay", "maxDelay", "maxPerRun"];
const DEFAULTS = { minDelay: 60, maxDelay: 180, maxPerRun: 20 };

function send(type) {
  return chrome.runtime.sendMessage({ type });
}

function showInfo(text, isError = false) {
  $("info").textContent = text;
  $("info").classList.toggle("error", isError);
}

// ---------- Réglages ----------

async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  const s = { ...DEFAULTS, ...settings };
  for (const f of SETTING_FIELDS) $(f).value = s[f];
  $("profileId").textContent = s.profileExternalId || "non détecté";
}

async function saveSettings() {
  const { settings: stored = {} } = await chrome.storage.local.get("settings");
  const settings = {
    ...stored,
    minDelay: Math.max(30, Number($("minDelay").value) || DEFAULTS.minDelay),
    maxDelay: Math.max(30, Number($("maxDelay").value) || DEFAULTS.maxDelay),
    maxPerRun: Math.max(1, Number($("maxPerRun").value) || DEFAULTS.maxPerRun),
  };
  if (settings.maxDelay < settings.minDelay) settings.maxDelay = settings.minDelay;
  await chrome.storage.local.set({ settings });
  await loadSettings();
  showInfo("Réglages enregistrés.");
}

// Détecte le profil et charge ses groupes non rejoints.
async function fetchGroups() {
  showInfo("Détection du profil et récupération des groupes…");
  const res = await send("fetch");
  await loadSettings();
  if (!res.ok) return showInfo(res.error, true);
  const checks = res.data.checks || 0;
  showInfo(`${res.data.total - checks} groupe(s) à rejoindre, ${checks} demande(s) à vérifier.`);
}

// ---------- Affichage ----------

let lastShownInfo = null;

function render({ groups = [], running = false, nextAt = null, lastInfo = "" }) {
  $("runState").textContent = running ? "En cours" : "Arrêté";
  $("runState").classList.toggle("on", running);
  $("startBtn").disabled = running || !groups.some((g) => g.status === "pending");
  $("stopBtn").disabled = !running;

  if (running && nextAt) {
    const sec = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
    showInfo(`Prochain groupe dans ${sec}s`);
  } else if (!running && lastInfo && lastInfo !== lastShownInfo) {
    showInfo(lastInfo);
  }
  lastShownInfo = lastInfo;

  const counts = {};
  for (const g of groups) counts[g.status] = (counts[g.status] || 0) + 1;
  $("stats").innerHTML = "";
  for (const [status, n] of Object.entries(counts)) {
    const span = document.createElement("span");
    span.textContent = `${STATUS_LABELS[status] || status} : ${n}`;
    $("stats").appendChild(span);
  }

  const list = $("groupList");
  list.innerHTML = "";
  for (const g of groups) {
    const li = document.createElement("li");

    const name = document.createElement("div");
    name.className = "name";
    const a = document.createElement("a");
    a.href = g.url;
    a.target = "_blank";
    a.textContent = g.name || g.url.replace(/^https?:\/\/(www\.)?facebook\.com\/groups\//, "");
    a.title = g.url;
    name.appendChild(a);
    if (g.message) {
      const msg = document.createElement("span");
      msg.className = "msg";
      msg.textContent = g.message;
      name.appendChild(msg);
    }

    const st = document.createElement("span");
    st.className = `st ${g.status}`;
    st.textContent = STATUS_LABELS[g.status] || g.status;

    li.append(name, st);
    list.appendChild(li);
  }
}

async function refresh() {
  render(await chrome.storage.local.get(["groups", "running", "nextAt", "lastInfo"]));
}

// ---------- Actions ----------

$("saveBtn").onclick = saveSettings;
$("fetchBtn").onclick = fetchGroups;
$("startBtn").onclick = async () => {
  const res = await send("start");
  if (!res.ok) showInfo(res.error, true);
};
$("stopBtn").onclick = () => send("stop");

chrome.storage.onChanged.addListener(() => {
  refresh();
  loadSettings();
});
setInterval(refresh, 1000); // mise à jour du compte à rebours

$("version").textContent = `v${chrome.runtime.getManifest().version}`;

(async () => {
  await loadSettings();
  await refresh();
  // Ouverture du popup hors traitement : liste à jour pour le profil courant.
  const { running } = await chrome.storage.local.get("running");
  if (!running) fetchGroups();
})();
