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
  // Veille : l'extension regarde seule s'il y a des groupes « à rejoindre »
  // et se lance. Plafond d'adhésions par jour : au-delà, Facebook y voit du spam.
  autoWatch: true,
  maxPerDay: 15,
};

// La veille passe toutes les WATCH_MINUTES ; le premier passage attend un peu
// après l'ouverture du navigateur (pas d'adhésion dès le démarrage).
const WATCH_ALARM = "join-watch";
const WATCH_MINUTES = 15;
const WATCH_FIRST_MINUTES = 3;

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
// Le script dans la page attend au plus ~20 s. Au-delà, il ne répondra plus
// (la page a changé d'adresse sous lui) : on abandonne et on ferme l'onglet.
const SCRIPT_TIMEOUT = 60000;
const OWN_TABS_KEY = "ownTabs";

// ---------- Stockage ----------

async function getState() {
  const data = await chrome.storage.local.get(["settings", "groups", "running", "joinedThisRun", "auto"]);
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
    // Lancé par la veille (et non par « Démarrer »).
    auto: !!data.auto,
  };
}

// ---------- Plafond du jour ----------

function today() {
  return new Date().toLocaleDateString("en-CA");
}
async function joinedToday() {
  const { joinDay } = await chrome.storage.local.get("joinDay");
  return joinDay && joinDay.day === today() ? joinDay.count : 0;
}
async function countJoin() {
  await chrome.storage.local.set({ joinDay: { day: today(), count: (await joinedToday()) + 1 } });
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
async function fetchGroups({ auto = false } = {}) {
  const { running } = await getState();
  if (running) throw new Error("Arrêtez le traitement avant de recharger la liste.");
  const profileExternalId = await syncNstProfile();
  if (!profileExternalId) throw new Error("Choisissez un profil.");

  const profile = encodeURIComponent(profileExternalId);
  const list = await api(
    // La veille ne relance pas les échecs : ils repartiraient en boucle.
    `/join/profiles/${profile}/groups?status=NOT_JOINED,${auto ? "" : "FAILED,"}${PENDING_STATUSES.join(",")}`,
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
  const tab = await openOwnTab(chrome.runtime.getURL(`whoami.html?t=${token}`));
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
    await closeOwnTab(tab.id);
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

// Les onglets ouverts par l'extension sont notés en stockage : si Chrome arrête
// le service worker en plein traitement, le `finally` qui devait les fermer ne
// tourne jamais. Le réveil suivant les retrouve et les ferme — un onglet
// Facebook oublié garde des centaines de Mo de mémoire.
async function ownTabs() {
  const data = await chrome.storage.local.get(OWN_TABS_KEY);
  return Array.isArray(data[OWN_TABS_KEY]) ? data[OWN_TABS_KEY] : [];
}

async function openOwnTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.storage.local.set({ [OWN_TABS_KEY]: [...(await ownTabs()), tab.id] });
  return tab;
}

async function closeOwnTab(tabId) {
  await chrome.tabs.remove(tabId).catch(() => {});
  await chrome.storage.local.set({ [OWN_TABS_KEY]: (await ownTabs()).filter((id) => id !== tabId) });
}

// Ferme tout ce qu'un traitement interrompu a laissé ouvert.
async function closeLeftoverTabs() {
  const ids = await ownTabs();
  if (!ids.length) return 0;
  await Promise.all(ids.map((id) => chrome.tabs.remove(id).catch(() => {})));
  await chrome.storage.local.set({ [OWN_TABS_KEY]: [] });
  return ids.length;
}

// Chrome peut remplacer un onglet (préchargement) : il change alors d'identifiant.
chrome.tabs.onReplaced.addListener(async (added, removed) => {
  const ids = await ownTabs();
  if (ids.includes(removed)) {
    await chrome.storage.local.set({ [OWN_TABS_KEY]: ids.map((id) => (id === removed ? added : id)) });
  }
});

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms))),
  ]).finally(() => clearTimeout(timer));
}

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
  // Libellés normalisés (minuscules, sans accents ni signes invisibles de
  // l'arabe) : un profil en arabe, en espagnol… ne doit pas passer pour « non
  // membre », ni un groupe public rejoint pour « demande envoyée ».
  const norm = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/[آأإ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[▾▼·•]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const words = (list) => list.map(norm);
  const JOIN = words([
    "rejoindre le groupe", "rejoindre ce groupe", "rejoindre", "join group", "join",
    "انضمام إلى المجموعة", "الانضمام إلى المجموعة", "انضم إلى المجموعة", "انضمام", "انضم", "الانضمام",
    "unirte al grupo", "unirse al grupo", "unirse", "participar do grupo", "participar", "entrar no grupo", "gruppe beitreten", "beitreten", "unisciti al gruppo",
    // Russe, roumain, ukrainien (comptes dont Facebook bloque le changement de langue).
    "вступить в группу", "вступить", "присоединиться", "alătură-te grupului", "alătură-te", "înscrie-te în grup", "приєднатися до групи", "приєднатися", "вступити до групи",
  ]);
  const JOINED = words([
    "membre", "membre du groupe", "rejoint", "rejointe", "vous êtes membre", "joined", "you're a member", "member",
    "عضو", "عضوة", "أنت عضو", "تم الانضمام", "انضممت", "منضم", "منضمة", "تمت العضوية",
    "miembro", "te uniste", "unido", "membro", "participando", "mitglied", "beigetreten", "iscritto",
    "участник", "вы участник", "вы вступили", "membru", "ești membru", "te-ai alăturat", "учасник", "ви учасник",
  ]);
  const PENDING = words([
    "annuler la demande", "demande envoyée", "demande en attente", "cancel request", "requested", "pending",
    "إلغاء الطلب", "تم إرسال الطلب", "الطلب معلق", "طلب معلق", "قيد الانتظار", "في انتظار الموافقة",
    "cancelar solicitud", "solicitud enviada", "pendiente", "cancelar pedido", "pedido enviado", "anfrage abbrechen", "angefragt",
    "отменить запрос", "запрос отправлен", "на рассмотрении", "anulează solicitarea", "solicitare trimisă", "în așteptare", "скасувати запит", "запит надіслано",
  ]);
  // La zone « Écrire quelque chose… » n'existe que pour un membre.
  const COMPOSER = /écrivez quelque chose|ecrivez quelque chose|write something|اكتب شيئ|escribe algo|escreva algo|schreib etwas|scrivi qualcosa|напишите что-нибудь|scrie ceva|напишіть щось/i;

  const labelOf = (el) => norm(el.getAttribute("aria-label") || el.innerText || "");
  // Exact, ou en tête (« Joined ▾ », « عضو · مشاركة »).
  const matches = (label, list) => list.some((w) => label === w || label.startsWith(`${w} `));

  const findButton = (list) =>
    [...document.querySelectorAll('[role="button"], button')].find((el) => {
      if (el.closest('[role="dialog"]') && list === JOIN) return false;
      return el.offsetParent !== null && matches(labelOf(el), list);
    });
  const memberComposer = () => {
    const main = document.querySelector('[role="main"]') || document.body;
    return [...main.querySelectorAll('[role="button"], [role="textbox"], span, div[aria-label]')]
      .some((el) => el.offsetParent !== null && COMPOSER.test((el.getAttribute("aria-label") || el.innerText || "").slice(0, 80)));
  };
  const state = () => {
    if (findButton(PENDING)) return "pending";
    if (findButton(JOINED)) return "joined";
    if (findButton(JOIN)) return "join";
    if (memberComposer()) return "joined";
    return null;
  };

  // Attente de l'apparition des boutons (Facebook charge le contenu dynamiquement)
  let seen = null;
  for (let i = 0; i < 30 && !seen; i++) {
    seen = state();
    if (!seen) await sleep(500);
  }
  if (seen === "joined") {
    return { status: "already", message: mode === "check" ? "Demande acceptée : membre" : "Déjà membre" };
  }
  if (seen === "pending") {
    return { status: "requested", message: mode === "check" ? "Toujours en attente d’acceptation" : "Demande déjà envoyée" };
  }

  if (mode === "check") {
    // Le bouton « Rejoindre » est revenu : la demande a été refusée ou a
    // expiré. On ne la renvoie pas ici ; le groupe repasse « à rejoindre ».
    return seen === "join"
      ? { status: "declined", message: "Demande refusée ou expirée : à renvoyer" }
      : { status: "error", message: "État de l’adhésion illisible sur la page" };
  }

  const btn = findButton(JOIN);
  if (!btn) return { status: "error", message: "Bouton « Rejoindre » introuvable" };

  btn.click();
  // Groupe public : membre tout de suite ; groupe privé : demande envoyée.
  // On attend que la page le dise, au lieu de deviner.
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const dialog = document.querySelector('[role="dialog"]');
    // Groupe avec questions d'adhésion : on ne répond pas automatiquement
    if (dialog && /question|répondre|answer|أسئلة|سؤال|pregunta|pergunta|вопрос|ответьте|întreb|răspunde|питання|дайте відповідь/i.test(dialog.innerText)) {
      return { status: "questions", message: "Questions d'adhésion à remplir manuellement" };
    }
    if (findButton(PENDING)) return { status: "requested", message: "Demande envoyée (en attente)" };
    if (findButton(JOINED) || (memberComposer() && !findButton(JOIN))) return { status: "joined", message: "Groupe rejoint" };
  }
  return { status: "requested", message: "Clic effectué (statut non confirmé : revérifié plus tard)" };
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
    tab = await openOwnTab(group.url);
    await waitForTabLoad(tab.id);
    const [{ result }] = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: joinGroupInPage,
        args: [group.mode || "join"],
      }),
      SCRIPT_TIMEOUT,
      "La page du groupe ne répond plus (délai dépassé)",
    );
    await updateGroup(group.id, result);
    await syncStatus(group, result);
    return result;
  } catch (err) {
    const result = { status: "error", message: err.message };
    await updateGroup(group.id, result);
    await syncStatus(group, result);
    return result;
  } finally {
    // Groupe terminé (réussi ou non) : son onglet est fermé tout de suite.
    if (tab?.id) await closeOwnTab(tab.id);
  }
}

// ---------- Boucle principale ----------

async function processNext() {
  // La réparation du réveil d'abord : elle ne doit pas fermer l'onglet du
  // groupe qu'on s'apprête à ouvrir.
  await recovered;
  const state = await getState();
  if (!state.running) return;

  if (state.joinedThisRun >= state.settings.maxPerRun) {
    await stop("Limite par session atteinte");
    return;
  }
  // Le plafond du jour vaut aussi pour un lancement à la main.
  const nextGroup = state.groups.find((g) => g.status === "pending");
  if (nextGroup && nextGroup.mode !== "check" && (await joinedToday()) >= state.settings.maxPerDay) {
    await stop(`Plafond du jour atteint (${state.settings.maxPerDay} adhésions) : la veille reprend demain`);
    return;
  }

  // Un onglet resté d'un traitement interrompu est fermé avant d'en ouvrir un autre.
  await closeLeftoverTabs();

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
  if (countsAsAction) await countJoin();
  await chrome.storage.local.set({ joinedThisRun });

  // Toujours en cours ? (l'utilisateur a pu cliquer sur Stop entre-temps)
  if (!(await getState()).running) return;

  const { minDelay, maxDelay } = state.settings;
  const delaySec = minDelay + Math.random() * Math.max(0, maxDelay - minDelay);
  const nextAt = Date.now() + delaySec * 1000;
  await chrome.storage.local.set({ nextAt });
  chrome.alarms.create(ALARM_NAME, { when: nextAt });
}

async function start({ auto = false } = {}) {
  const { settings } = await getState();
  // La liste a été chargée pour un profil : refuser si le navigateur n'est plus celui-là.
  if (settings.nstApiKey && (await syncNstProfile()) !== settings.profileExternalId) {
    throw new Error("Le profil Nstbrowser a changé : rechargez les groupes.");
  }
  await chrome.storage.local.set({ running: true, auto, joinedThisRun: 0, lastInfo: "", nextAt: null });
  processNext();
}

async function stop(info = "Arrêté") {
  await chrome.alarms.clear(ALARM_NAME);
  await closeLeftoverTabs();
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

// ---------- Veille automatique ----------

// Un passage de la veille : si des groupes sont « à rejoindre » pour ce
// profil (nouveau lien, demande refusée, adhésion perdue…), elle charge la
// liste et lance l'adhésion, au rythme et dans les plafonds habituels.
async function watchTick() {
  const state = await getState();
  if (!state.settings.autoWatch || state.running) return;
  if ((await joinedToday()) >= state.settings.maxPerDay) {
    await chrome.storage.local.set({ lastInfo: `Veille : plafond du jour atteint (${state.settings.maxPerDay}), reprise demain.` });
    return;
  }
  try {
    // Le profil déjà détecté sert à la question rapide ; la détection
    // (qui ouvre un onglet) n'est refaite que s'il y a du travail.
    // Redétecté toutes les 6 h : un profil NSTBrowser cloné emporte l'ancien.
    const { detectedAt = 0 } = await chrome.storage.local.get("detectedAt");
    let profile = state.settings.profileExternalId;
    if (!profile || Date.now() - detectedAt > 6 * 3600 * 1000) {
      profile = await syncNstProfile();
      await chrome.storage.local.set({ detectedAt: Date.now() });
    }
    const waiting = await api(`/join/profiles/${encodeURIComponent(profile)}/groups?status=NOT_JOINED`).catch(() => null);
    if (Array.isArray(waiting) && !waiting.length) {
      await chrome.storage.local.set({ lastWatchAt: Date.now(), lastInfo: "Veille : aucun groupe à rejoindre." });
      return;
    }
    const { total, checks } = await fetchGroups({ auto: true });
    await chrome.storage.local.set({ lastWatchAt: Date.now() });
    if (total - checks > 0) {
      await chrome.storage.local.set({ lastInfo: `Veille : ${total - checks} groupe(s) à rejoindre, lancement.` });
      await start({ auto: true });
    } else {
      await chrome.storage.local.set({ lastInfo: "Veille : aucun groupe à rejoindre." });
    }
  } catch (err) {
    await chrome.storage.local.set({ lastWatchAt: Date.now(), lastInfo: `Veille : ${err.message}` });
  }
}

// (Ré)arme la veille selon le réglage. Garder l'alarme existante : la recréer
// à chaque réveil du worker repousserait sans fin le prochain passage.
async function armWatch({ soon = false } = {}) {
  const { settings } = await getState();
  if (!settings.autoWatch) return chrome.alarms.clear(WATCH_ALARM);
  const existing = await chrome.alarms.get(WATCH_ALARM);
  if (existing && !soon) return;
  chrome.alarms.create(WATCH_ALARM, {
    delayInMinutes: soon ? WATCH_FIRST_MINUTES + Math.random() * 2 : WATCH_MINUTES,
    periodInMinutes: WATCH_MINUTES,
  });
}

// Réveil du service worker : rien ne peut être « en cours » dans un worker qui
// vient de naître. Ce qu'un worker arrêté en route a laissé — onglet ouvert,
// groupe bloqué « en cours » — est réparé ici.
async function recoverInterrupted() {
  const closed = await closeLeftoverTabs();
  const { groups } = await getState();
  if (groups.some((g) => g.status === "processing")) {
    await chrome.storage.local.set({
      groups: groups.map((g) => (g.status === "processing" ? { ...g, status: "pending" } : g)),
    });
  }
  return closed;
}
const recovered = recoverInterrupted().catch(() => 0);

chrome.runtime.onStartup.addListener(autoRun);
chrome.runtime.onInstalled.addListener(autoRun);
// Ouverture du navigateur, installation : premier passage dans quelques minutes.
chrome.runtime.onStartup.addListener(() => armWatch({ soon: true }));
chrome.runtime.onInstalled.addListener(() => armWatch({ soon: true }));
armWatch();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) processNext();
  if (alarm.name === WATCH_ALARM) watchTick();
});
// Réglage changé dans le popup : la veille suit.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    const before = changes.settings.oldValue?.autoWatch;
    const after = changes.settings.newValue?.autoWatch;
    if (before !== after) armWatch({ soon: true });
  }
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
    start: () => start(),
    stop: () => stop(),
    watchNow: watchTick,
    watchInfo: async () => {
      const { settings } = await getState();
      const alarm = await chrome.alarms.get(WATCH_ALARM);
      return { on: settings.autoWatch, nextAt: alarm?.scheduledTime ?? null, today: await joinedToday(), maxPerDay: settings.maxPerDay };
    },
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
