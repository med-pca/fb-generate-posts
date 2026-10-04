// Service worker : récupère les groupes depuis l'API, puis les rejoint un par un
// avec un délai aléatoire entre chaque groupe (via chrome.alarms, car le worker
// peut être arrêté par Chrome entre deux traitements).

importScripts("config.js");
const CONFIG = self.FGJ_CONFIG;

// Seuls le profil détecté et les délais sont stockés ; le reste vient de config.js.
const DEFAULT_SETTINGS = {
  profileExternalId: "",
  minDelay: 60, // secondes
  maxDelay: 180, // secondes
  maxPerRun: 20,
};

// Statut de l'extension -> JoinStatus côté API
const API_STATUS = {
  joined: "JOINED",
  already: "JOINED",
  requested: "REQUESTED",
  questions: "QUESTIONS",
  // Vérification : la demande a été refusée ou a expiré, le bouton
  // « Rejoindre » est revenu. Elle sera renvoyée au prochain passage.
  declined: "NOT_JOINED",
  error: "FAILED",
};

// Une demande d'adhésion acceptée par l'administrateur du groupe ne se voit
// que sur la page du groupe : on revérifie les demandes en attente, au plus
// une fois par période. Sans cela, le profil reste « Demande envoyée » pour
// toujours et ne publie jamais dans ce groupe.
const CHECK_EVERY_HOURS = 6;
const PENDING_STATUSES = ["REQUESTED", "QUESTIONS"];

const NST_API = "http://localhost:8848/api/v2";
const ALARM_NAME = "join-next";
const PAGE_LOAD_TIMEOUT = 30000;

// ---------- Stockage ----------

async function getState() {
  const data = await chrome.storage.local.get(["settings", "groups", "running", "joinedThisRun"]);
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...(data.settings || {}),
      apiBase: CONFIG.apiBase,
      apiKey: CONFIG.apiKey,
      nstApiKey: CONFIG.nstApiKey,
    },
    groups: data.groups || [],
    running: !!data.running,
    joinedThisRun: data.joinedThisRun || 0,
  };
}

async function updateGroup(id, patch) {
  const { groups } = await getState();
  const next = groups.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: Date.now() } : g));
  await chrome.storage.local.set({ groups: next });
}

// ---------- API ----------

async function api(path, options = {}) {
  const { settings } = await getState();
  if (!settings.apiBase) throw new Error("URL de l'API non configurée.");
  if (!settings.apiKey) throw new Error("Clé API (X-API-Key) absente de config.js.");

  const res = await fetch(`${settings.apiBase.replace(/\/+$/, "")}/api${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": settings.apiKey,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status} : ${body.message || res.statusText}`);
  }
  return res.json();
}

function listProfiles() {
  return api("/jobs/profiles");
}

// Remplace la liste locale par les groupes du profil encore à rejoindre.
async function fetchGroups() {
  const { running } = await getState();
  if (running) throw new Error("Arrêtez le traitement avant de recharger la liste.");
  const profileExternalId = await syncNstProfile();
  if (!profileExternalId) throw new Error("Choisissez un profil.");

  const profile = encodeURIComponent(profileExternalId);
  const list = await api(
    `/join/profiles/${profile}/groups?status=NOT_JOINED,FAILED,${PENDING_STATUSES.join(",")}`,
  );
  const staleBefore = Date.now() - CHECK_EVERY_HOURS * 3600 * 1000;
  const groups = list
    // Une demande en attente vérifiée récemment n'est pas revue tout de suite.
    .filter(
      (g) =>
        !PENDING_STATUSES.includes(g.joinStatus) ||
        !g.joinCheckedAt ||
        new Date(g.joinCheckedAt).getTime() < staleBefore,
    )
    .map((g) => {
      const check = PENDING_STATUSES.includes(g.joinStatus);
      return {
        id: g.id,
        url: g.url,
        name: g.name,
        // « check » : on regarde seulement, on ne clique jamais — cliquer sur
        // le bouton d'une demande en attente l'annulerait.
        mode: check ? "check" : "join",
        status: "pending",
        message: check
          ? "Vérifier si la demande a été acceptée"
          : g.joinStatus === "FAILED"
            ? `Échec précédent : ${g.joinError || "?"}`
            : "",
        updatedAt: Date.now(),
      };
    });

  await chrome.storage.local.set({ groups });
  const checks = groups.filter((g) => g.mode === "check").length;
  return { added: groups.length, total: groups.length, checks, profileExternalId };
}

async function reportStatus(group, result) {
  const { settings } = await getState();
  const profile = encodeURIComponent(settings.profileExternalId);
  await api(`/join/profiles/${profile}/groups/${encodeURIComponent(group.id)}/join-status`, {
    method: "POST",
    body: JSON.stringify({
      joinStatus: API_STATUS[result.status] || "FAILED",
      ...(result.status === "error" ? { error: result.message } : {}),
    }),
  });
}

// ---------- Nstbrowser ----------

// Une extension ne sait pas dans quel profil Nstbrowser elle tourne. On ouvre
// un onglet portant un jeton unique, puis on cherche ce jeton dans la liste des
// onglets (/json/list) de chaque navigateur lancé : le port qui le contient
// désigne le profil courant.
async function detectNstProfile() {
  const { settings } = await getState();
  if (!settings.nstApiKey) throw new Error("Clé API Nstbrowser absente de config.js.");

  const res = await fetch(`${NST_API}/browsers?status=running`, {
    headers: { "x-api-key": settings.nstApiKey },
  }).catch(() => {
    throw new Error("API locale Nstbrowser injoignable (localhost:8848).");
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.err) throw new Error(`Nstbrowser : ${body.msg || res.status}`);
  const browsers = (body.data || []).filter((b) => b.remoteDebuggingPort);
  if (!browsers.length) throw new Error("Aucun navigateur Nstbrowser lancé.");

  const token = crypto.randomUUID();
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL(`whoami.html?t=${token}`),
    active: false,
  });
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const b of browsers) {
        const targets = await fetch(`http://127.0.0.1:${b.remoteDebuggingPort}/json/list`)
          .then((r) => r.json())
          .catch(() => []);
        if (targets.some((t) => (t.url || "").includes(token))) return String(b.profileId);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Profil courant introuvable parmi les navigateurs Nstbrowser lancés.");
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// Détecte le profil et l'enregistre. La détection est refaite à chaque fois :
// un profil Nstbrowser cloné emporte les réglages de l'extension avec lui.
async function syncNstProfile() {
  const { settings } = await getState();
  if (!settings.nstApiKey) throw new Error("Clé API Nstbrowser absente de config.js.");

  const profileId = await detectNstProfile();
  if (profileId !== settings.profileExternalId) {
    const { settings: stored = {} } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...stored, profileExternalId: profileId },
      groups: [],
    });
  }
  return profileId;
}

// ---------- Gestion des onglets ----------

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Délai de chargement dépassé"));
    }, PAGE_LOAD_TIMEOUT);

    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Exécutée dans la page Facebook. Doit être autonome (aucune référence externe).
// `mode` : « join » rejoint ; « check » regarde seulement où en est une
// demande déjà envoyée, sans jamais cliquer.
async function joinGroupInPage(mode = "join") {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Libellés français, anglais et arabes : un profil en arabe ne doit pas
  // passer pour « non membre ».
  const JOIN = /^(rejoindre le groupe|rejoindre ce groupe|rejoindre|join group|join|انضمام إلى المجموعة|الانضمام إلى المجموعة|انضم إلى المجموعة|انضمام|انضم)$/i;
  const JOINED = /^(membre|membre du groupe|rejoint|rejointe|joined|vous êtes membre|you're a member|عضو|تم الانضمام|منضم|منضمة)$/i;
  const PENDING = /^(annuler la demande|cancel request|demande envoyée|demande en attente|requested|pending|إلغاء الطلب|تم إرسال الطلب|الطلب معلق)$/i;

  const labelOf = (el) => (el.getAttribute("aria-label") || el.innerText || "").trim();

  const findButton = (regex) =>
    [...document.querySelectorAll('[role="button"], button')].find((el) => {
      if (el.closest('[role="dialog"]') && regex === JOIN) return false;
      return regex.test(labelOf(el)) && el.offsetParent !== null;
    });

  // Attente de l'apparition des boutons (Facebook charge le contenu dynamiquement)
  for (let i = 0; i < 30; i++) {
    if (findButton(JOINED)) {
      return {
        status: "already",
        message: mode === "check" ? "Demande acceptée : membre" : "Déjà membre",
      };
    }
    if (findButton(PENDING)) {
      return {
        status: "requested",
        message: mode === "check" ? "Toujours en attente d’acceptation" : "Demande déjà envoyée",
      };
    }
    if (findButton(JOIN)) break;
    await sleep(500);
  }

  if (mode === "check") {
    // Le bouton « Rejoindre » est revenu : la demande a été refusée ou a
    // expiré. On ne la renvoie pas ici ; le groupe repasse « à rejoindre ».
    return findButton(JOIN)
      ? { status: "declined", message: "Demande refusée ou expirée : à renvoyer" }
      : { status: "error", message: "État de l’adhésion illisible sur la page" };
  }

  const btn = findButton(JOIN);
  if (!btn) return { status: "error", message: "Bouton « Rejoindre » introuvable" };

  btn.click();
  await sleep(4000);

  // Groupe avec questions d'adhésion : on ne répond pas automatiquement
  const dialog = document.querySelector('[role="dialog"]');
  if (dialog && /question|répondre|answer/i.test(dialog.innerText)) {
    return { status: "questions", message: "Questions d'adhésion à remplir manuellement" };
  }

  if (findButton(PENDING)) return { status: "requested", message: "Demande envoyée (en attente)" };
  if (findButton(JOINED)) return { status: "joined", message: "Groupe rejoint" };
  return { status: "requested", message: "Clic effectué (statut non confirmé)" };
}

// Une erreur d'envoi ne doit pas bloquer la file : on la signale dans le message.
async function syncStatus(group, result) {
  try {
    await reportStatus(group, result);
    await updateGroup(group.id, { synced: true });
  } catch (err) {
    await updateGroup(group.id, {
      synced: false,
      message: `${result.message} (non synchronisé : ${err.message})`,
    });
  }
}

async function processGroup(group) {
  await updateGroup(group.id, { status: "processing", message: "" });
  let tab;
  try {
    tab = await chrome.tabs.create({ url: group.url, active: false });
    await waitForTabLoad(tab.id);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: joinGroupInPage,
      args: [group.mode || "join"],
    });
    await updateGroup(group.id, result);
    await syncStatus(group, result);
    return result;
  } catch (err) {
    const result = { status: "error", message: err.message };
    await updateGroup(group.id, result);
    await syncStatus(group, result);
    return result;
  } finally {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ---------- Boucle principale ----------

async function processNext() {
  const state = await getState();
  if (!state.running) return;

  if (state.joinedThisRun >= state.settings.maxPerRun) {
    await stop("Limite par session atteinte");
    return;
  }

  const next = state.groups.find((g) => g.status === "pending");
  if (!next) {
    await stop("Tous les groupes ont été traités");
    return;
  }

  const result = await processGroup(next);
  // Une simple vérification n'envoie rien à Facebook : elle ne compte pas
  // dans la limite d'adhésions par session.
  const countsAsAction =
    next.mode !== "check" && ["joined", "requested", "questions"].includes(result.status);
  const joinedThisRun = state.joinedThisRun + (countsAsAction ? 1 : 0);
  await chrome.storage.local.set({ joinedThisRun });

  // Toujours en cours ? (l'utilisateur a pu cliquer sur Stop entre-temps)
  if (!(await getState()).running) return;

  const { minDelay, maxDelay } = state.settings;
  const delaySec = minDelay + Math.random() * Math.max(0, maxDelay - minDelay);
  const nextAt = Date.now() + delaySec * 1000;
  await chrome.storage.local.set({ nextAt });
  chrome.alarms.create(ALARM_NAME, { when: nextAt });
}

async function start() {
  const { settings } = await getState();
  // La liste a été chargée pour un profil : refuser si le navigateur n'est plus celui-là.
  if (settings.nstApiKey && (await syncNstProfile()) !== settings.profileExternalId) {
    throw new Error("Le profil Nstbrowser a changé : rechargez les groupes.");
  }
  await chrome.storage.local.set({ running: true, joinedThisRun: 0, lastInfo: "", nextAt: null });
  processNext();
}

async function stop(info = "Arrêté") {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ running: false, nextAt: null, lastInfo: info });
  // Remettre en attente un groupe interrompu en plein traitement
  const { groups } = await getState();
  const fixed = groups.map((g) => (g.status === "processing" ? { ...g, status: "pending" } : g));
  await chrome.storage.local.set({ groups: fixed });
}

// Lancement du profil : détection, récupération des groupes non rejoints, puis adhésion.
async function autoRun() {
  // Mode manuel : au lancement du profil, rien du tout — ni liste chargée, ni
  // onglet de détection ouvert, ni adhésion. Tout part du popup.
  if (!CONFIG.autoStart) return;
  const { running } = await getState();
  if (running) return;
  try {
    const { total, checks } = await fetchGroups();
    if (total && CONFIG.autoStart) await start();
    else
      await chrome.storage.local.set({
        lastInfo: `${total - checks} groupe(s) à rejoindre, ${checks} demande(s) à vérifier.`,
      });
  } catch (err) {
    await chrome.storage.local.set({ lastInfo: `Erreur : ${err.message}` });
  }
}

chrome.runtime.onStartup.addListener(autoRun);
chrome.runtime.onInstalled.addListener(autoRun);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) processNext();
});

// ---------- Messages du popup ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    fetch: fetchGroups,
    status: async () => {
      const { settings, running } = await getState();
      return { profileExternalId: settings.profileExternalId, running };
    },
    profiles: listProfiles,
    detect: syncNstProfile,
    start,
    stop: () => stop(),
    reset: async () => {
      const { groups } = await getState();
      await chrome.storage.local.set({
        groups: groups.map((g) => ({ ...g, status: "pending", message: "" })),
      });
    },
    clear: () => chrome.storage.local.set({ groups: [] }),
  };

  const handler = handlers[msg.type];
  if (!handler) return false;

  Promise.resolve(handler())
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // réponse asynchrone
});
