// Recherche de mise à jour : SEULE connexion réseau de l'application, faite par le processus principal (le rendu reste hors-ligne : CSP et
// installNetGuard inchangés). Une requête HTTPS GET vers l'adresse fixe UpdateCheck.URL (https://orical.app/orical-pdf/latest.json) :
//   - automatique : au plus une fois par jour, ~10 s après l'ouverture de la fenêtre, jamais pendant une impression ; échec silencieux ;
//   - manuelle : bouton « Rechercher maintenant » (Réglages) ; message clair en cas d'échec.
// Session dédiée EN MÉMOIRE (partition sans « persist: » : ni cookie ni cache sur disque), agent utilisateur générique (ni version ni nom),
// aucun en-tête ajouté, certificat TLS vérifié par Chromium (magasin de Windows ; jamais désactivé), délai 8 s, 64 Ko au plus, redirections
// seulement vers le même hôte (3 au plus). Désactivable : réglage update.auto (recherche automatique) ou stratégie d'entreprise
// DisableUpdateCheck = 1 (DWORD) sous HKLM / HKCU\Software\Policies\Orical\OricalPDF (automatique ET manuelle).
// Installation : jamais faite ici ; « Télécharger » ouvre dans le navigateur l'adresse VALIDÉE du fichier latest.json (update:open).
// Tests : ORICALPDF_TEST_UPDATE_URL (http://127.0.0.1:port/…), ORICALPDF_TEST_POLICY_KEY (HKCU\Software\OricalPDF-Test-…),
// ORICALPDF_TEST_UPDATE_DELAY_MS, pris en compte SEULEMENT si ORICALPDF_USER_DATA contient le témoin .oricalpdf-test.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const U = require('./src/update-check.js');

const TIMEOUT = 8000;
const MAX_REDIRECTS = 3;
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const PARTITION = 'oricalpdf-update'; // sans « persist: » : en mémoire
const POLICY_KEYS = ['HKLM\\Software\\Policies\\Orical\\OricalPDF', 'HKCU\\Software\\Policies\\Orical\\OricalPDF'];
const DEFAULTS = { auto: true, lastCheck: null, lastStatus: null, lastVersion: null, ignored: null };

const testMode = (env) => !!env.ORICALPDF_USER_DATA && fs.existsSync(path.join(env.ORICALPDF_USER_DATA, '.oricalpdf-test'));
function sourceUrl(env) {
  const t = env.ORICALPDF_TEST_UPDATE_URL;
  if (t && testMode(env) && /^http:\/\/127\.0\.0\.1:\d{2,5}\/[^\s]*$/.test(t)) return t;
  // tests automatisés (fenêtres hors écran) sans serveur local : AUCUNE requête réelle vers orical.app
  if (env.ORICALPDF_TEST_HEADLESS === '1') return null;
  return U.URL;
}
function policyKeys(env) {
  const t = env.ORICALPDF_TEST_POLICY_KEY;
  if (t && testMode(env) && /^HKCU\\Software\\OricalPDF-Test-[A-Za-z0-9-]{1,40}$/.test(t)) return [t];
  return POLICY_KEYS;
}
const regQuery = (key) => new Promise((resolve) => {
  execFile('reg', ['query', key, '/v', 'DisableUpdateCheck'], { timeout: 3000, windowsHide: true }, (_e, stdout) => resolve(String(stdout || '')));
});

let ctx = null; // { app, electron, readSettings, writeSettings, isPrinting, getWin, env }
let busy = null;
let available = null; // dernier fichier valide plus récent que la version installée
let policyCache = null;

function settings() { return Object.assign({}, DEFAULTS, (ctx.readSettings() || {}).update); }
function saveSettings(patch) { const s = ctx.readSettings() || {}; s.update = Object.assign({}, DEFAULTS, s.update, patch); ctx.writeSettings(s); return s.update; }

async function policyDisabled() {
  if (policyCache && Date.now() - policyCache.t < 60000) return policyCache.v;
  let v = false;
  for (const k of policyKeys(ctx.env)) if (U.policyDisabled(await regQuery(k))) { v = true; break; }
  policyCache = { t: Date.now(), v };
  return v;
}

function fetchText(url) {
  const { net, session } = ctx.electron;
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(AGENT);
  return new Promise((resolve) => {
    let done = false, redirects = 0, size = 0;
    const chunks = [];
    const origin = new URL(url);
    const req = net.request({ url, method: 'GET', partition: PARTITION, redirect: 'manual', credentials: 'omit', useSessionCookies: false, cache: 'no-store' });
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); if (!r.ok) { try { req.abort(); } catch { /* */ } } resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, reason: 'délai dépassé' }), TIMEOUT);
    req.on('redirect', (_status, _method, to) => {
      let u = null;
      try { u = new URL(to); } catch { /* */ }
      redirects++;
      if (!u || redirects > MAX_REDIRECTS || u.protocol !== origin.protocol || u.host !== origin.host || u.username || u.password) finish({ ok: false, reason: 'redirection refusée' });
      else req.followRedirect();
    });
    req.on('response', (res) => {
      if (res.statusCode !== 200) { finish({ ok: false, reason: 'réponse HTTP ' + res.statusCode }); return; }
      res.on('data', (c) => { size += c.length; if (size > U.MAX_BYTES) finish({ ok: false, reason: 'réponse trop grosse' }); else chunks.push(c); });
      res.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', () => finish({ ok: false, reason: 'réponse interrompue' }));
    });
    req.on('error', () => finish({ ok: false, reason: 'serveur injoignable' }));
    req.on('abort', () => finish({ ok: false, reason: 'requête annulée' }));
    req.end();
  });
}

// { status: 'latest' | 'available' | 'error' | 'disabled', info?, ignored?, reason? }
function check() {
  if (busy) return busy;
  busy = (async () => {
    if (await policyDisabled()) return { status: 'disabled' };
    const url = sourceUrl(ctx.env);
    if (!url) return { status: 'error', reason: 'aucune requête pendant les tests automatisés' };
    saveSettings({ lastCheck: Date.now() });
    const r = await fetchText(url);
    if (!r.ok) { saveSettings({ lastStatus: 'error' }); return { status: 'error', reason: r.reason }; }
    const p = U.parse(r.text);
    if (!p.ok) { saveSettings({ lastStatus: 'error' }); return { status: 'error', reason: 'fichier refusé (' + p.reason + ')' }; }
    if (!U.isNewer(p.info.version, ctx.app.getVersion())) { available = null; saveSettings({ lastStatus: 'latest', lastVersion: p.info.version }); return { status: 'latest', version: p.info.version }; }
    available = p.info;
    const s = saveSettings({ lastStatus: 'available', lastVersion: p.info.version });
    return { status: 'available', info: p.info, ignored: U.ignored(p.info, s.ignored) };
  })().finally(() => { busy = null; });
  return busy;
}

async function state() {
  const s = settings();
  const policy = await policyDisabled();
  return { auto: s.auto !== false, lastCheck: s.lastCheck, lastStatus: s.lastStatus, lastVersion: s.lastVersion, ignored: s.ignored, policy,
    current: ctx.app.getVersion(), available: available && U.offer(available, ctx.app.getVersion(), s.ignored) ? available : null };
}

// Recherche automatique : ~10 s après l'ouverture de la fenêtre ; reportée (60 s, 10 fois au plus) pendant une impression.
function schedule() {
  const env = ctx.env;
  const delay = testMode(env) && /^\d{1,6}$/.test(env.ORICALPDF_TEST_UPDATE_DELAY_MS || '') ? Number(env.ORICALPDF_TEST_UPDATE_DELAY_MS) : 10000;
  let tries = 0;
  const run = async () => {
    const s = settings();
    if (s.auto === false || !U.shouldCheck(Date.now(), s.lastCheck)) return;
    if (ctx.isPrinting() && tries++ < 10) { setTimeout(run, 60000).unref(); return; }
    let r;
    try { r = await check(); } catch { return; } // silencieux
    const win = ctx.getWin();
    if (r.status === 'available' && !r.ignored && win && !win.isDestroyed()) win.webContents.send('update:available', r.info);
  };
  setTimeout(run, delay).unref();
}

function open() {
  const url = available && U.safeUrl(available.url); // adresse VALIDÉE du fichier, jamais une adresse venant du rendu
  if (!url) return Promise.resolve(false);
  if (ctx.env.ORICALPDF_TEST_EXTERNAL) { fs.appendFileSync(ctx.env.ORICALPDF_TEST_EXTERNAL, 'update\t' + url + '\n'); return Promise.resolve(true); }
  return ctx.electron.shell.openExternal(url).then(() => true, () => false);
}

function set(patch) {
  const p = {};
  if (patch && typeof patch.auto === 'boolean') p.auto = patch.auto;
  if (patch && (patch.ignored === null || U.compareVersions(patch.ignored, '0.0.0') !== null)) p.ignored = patch.ignored;
  return saveSettings(p);
}

// Ligne du diagnostic (sans adresse ni donnée personnelle)
async function diagLine() {
  const s = await state();
  const d = s.lastCheck ? new Date(s.lastCheck).toISOString().slice(0, 16).replace('T', ' ') : 'jamais';
  return `Recherche de mise à jour : ${s.policy ? 'désactivée par stratégie' : (s.auto ? 'automatique' : 'manuelle seulement')} ; dernière : ${d} ; résultat : ${s.lastStatus || '—'}${s.lastVersion ? ' (' + s.lastVersion + ')' : ''}`;
}

function init(c) {
  ctx = Object.assign({ env: process.env }, c);
  const { ipcMain } = ctx.electron;
  ipcMain.handle('update:state', () => state());
  ipcMain.handle('update:check', () => check());
  ipcMain.handle('update:set', (_e, patch) => set(patch));
  ipcMain.handle('update:open', () => open());
}

module.exports = { init, schedule, check, state, diagLine, sourceUrl, policyKeys, testMode, TIMEOUT, AGENT, PARTITION, POLICY_KEYS };
