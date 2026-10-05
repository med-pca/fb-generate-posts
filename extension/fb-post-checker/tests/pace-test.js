/**
 * Le rythme humain du modérateur : heures de travail, quotas, passages
 * irréguliers. Le vrai background.js, avec un faux `chrome`.
 *
 *   node extension/fb-post-checker/tests/pace-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ko = 0;
const check = (label, ok, got) => {
  console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ' → ' + JSON.stringify(got)}`);
  if (!ok) ko++;
};

const store = {};
const alarms = [];
const listener = { addListener() {} };
const chrome = {
  storage: { local: {
    get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, store[k]])),
    set: async (o) => Object.assign(store, o),
  } },
  alarms: { create: (name, info) => alarms.push({ name, ...info }), clear: async () => { alarms.length = 0; }, onAlarm: listener },
  runtime: { onInstalled: listener, onStartup: listener, onMessage: listener, getManifest: () => ({ version: 't' }) },
  tabs: { onUpdated: listener },
};
const ctx = { chrome, console, setTimeout, clearTimeout, Intl, Date, Math, URL, fetch: async () => ({ ok: true, json: async () => ({}) }) };
ctx.self = ctx;
ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8') + '\n;globalThis.__p = { atWork, budget, spend, batchFor, nextRound, clockIn };', ctx);
const P = ctx.__p;

(async () => {
  const cfg = { ...ctx.FPC_CONFIG, enabled: true };
  check('rythme prudent par défaut : 3 actions, ~25 min, 12/h, 60/jour, 9 h–22 h',
    cfg.batchSize === 3 && cfg.everyMinutes === 25 && cfg.hourlyLimit === 12 && cfg.dailyLimit === 60 && cfg.windowStart === 540 && cfg.windowEnd === 1320, cfg);

  const now = P.clockIn('Europe/Paris').minutes;
  check('dans ses heures, il travaille', P.atWork({ ...cfg, windowStart: (now + 1440 - 60) % 1440, windowEnd: (now + 60) % 1440 }) === true, now);
  check('hors de ses heures, il ne fait rien', P.atWork({ ...cfg, windowStart: (now + 60) % 1440, windowEnd: (now + 120) % 1440 }) === false, now);

  const small = { ...cfg, hourlyLimit: 2, dailyLimit: 60 };
  check('quota disponible au départ', (await P.budget(small)).left === 2, store.pace);
  await P.spend(); await P.spend();
  const after = await P.budget(small);
  check('quota de l’heure atteint : plus d’action', after.left === 0 && /heure/.test(after.reason), after);

  delete store.pace;
  const sizes = new Set();
  for (let i = 0; i < 60; i += 1) sizes.add(await P.batchFor({ ...cfg, batchSize: 3 }));
  check('la taille des passages varie, sans dépasser le réglage', [...sizes].every((n) => n >= 1 && n <= 3) && sizes.size > 1, [...sizes]);

  const delays = [];
  for (let i = 0; i < 200; i += 1) {
    await P.nextRound(cfg);
    delays.push(alarms.find((a) => a.name === 'fpc-round').delayInMinutes);
  }
  const distinct = new Set(delays.map((d) => Math.round(d))).size;
  check('jamais à intervalle fixe', distinct > 10, distinct);
  check('entre ~17 min et 2 h, avec de longues pauses de temps en temps',
    delays.every((d) => d >= 25 * 0.7 - 0.01 && d <= 120) && delays.some((d) => d >= 45), [Math.min(...delays), Math.max(...delays)]);
  check('jamais en « période » fixe (alarme ponctuelle)', alarms.every((a) => a.periodInMinutes === undefined), alarms);

  process.exit(ko ? 1 : 0);
})();
