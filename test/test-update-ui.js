// Recherche de mise à jour (interface + processus principal, hors écran) avec un PETIT SERVEUR LOCAL (127.0.0.1) : AUCUNE requête vers
// orical.app. Recherche automatique au démarrage, bandeau (notes en texte, empreinte, Détails, Télécharger, Plus tard, Ignorer), recherche
// manuelle (plus récente, identique, antérieure, 404, JSON invalide, réponse trop grosse, serveur muet > 8 s, redirection vers un autre hôte
// refusée, redirection vers le même hôte suivie), en-têtes envoyés (agent générique, ni cookie ni version), rendu toujours hors-ligne,
// une fois par jour, case décochée, stratégie DisableUpdateCheck (clé de TEST sous HKCU\Software\OricalPDF-Test-…, jamais la vraie clé),
// variable de test ignorée sans le témoin .oricalpdf-test. Usage : node test/test-update-ui.js  (ORICALPDF_EXE = exécutable empaqueté)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { launchApp, sleep } = require('./lib/app');
const { SCRIPT: CLICKABLE } = require('./lib/clickable.js');
const { makeAll } = require('./lib/make-pdfs.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail).slice(0, 400) : ''); } };

const version = require('../package.json').version;
const SHA = '0123456789abcdef'.repeat(4);
const doc = (v, extra) => JSON.stringify(Object.assign({ schema: 1, version: v, date: '2026-12-01', url: 'https://orical.app/orical-pdf/', sha256: SHA,
  notes: ['Nouveautés : <img src=x onerror="document.title=1">', 'Ligne\u0007 avec\u202E contrôle', 'Troisième'] }, extra));

let mode = 'newer';
const hits = [];
const server = http.createServer((req, res) => {
  hits.push({ url: req.url, method: req.method, headers: req.headers, mode });
  const port = server.address().port;
  switch (mode) {
    case 'newer': res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(doc('9.9.9')); break;
    case 'same': res.writeHead(200); res.end(doc(version)); break;
    case 'older': res.writeHead(200); res.end(doc('0.0.1')); break;
    case '404': res.writeHead(404); res.end('absent'); break;
    case 'invalid': res.writeHead(200); res.end('{"schema":1,'); break;
    case 'big': res.writeHead(200); res.end(doc('9.9.9', { pad: 'x'.repeat(70 * 1024) })); break;
    case 'mute': break; // ne répond jamais
    case 'redirect-other': res.writeHead(302, { Location: `http://localhost:${port}/latest.json` }); res.end(); mode = 'newer'; break;
    case 'redirect-same': res.writeHead(302, { Location: `http://127.0.0.1:${port}/latest.json?r=1` }); res.end(); mode = 'newer'; break;
    default: res.writeHead(500); res.end();
  }
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const URL_TEST = `http://127.0.0.1:${port}/latest.json`;
  const ext = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oricalpdf-update-ext-')), 'external.txt');
  const marker = { '.oricalpdf-test': '' };
  const baseEnv = { ORICALPDF_TEST_UPDATE_URL: URL_TEST, ORICALPDF_TEST_UPDATE_DELAY_MS: '800', ORICALPDF_TEST_EXTERNAL: ext };
  const policyKey = 'HKCU\\Software\\OricalPDF-Test-' + process.pid + '-' + Date.now().toString(36);
  let c = null;
  const others = [];
  const settingsOf = (cc) => JSON.parse(fs.readFileSync(path.join(cc.userData, 'settings.json'), 'utf8'));
  const manual = async (cc, m) => { mode = m; const t0 = Date.now(); const r = JSON.parse(await cc.ev(`window.oricalpdf.updateCheck().then((r) => JSON.stringify(r))`)); r.ms = Date.now() - t0; return r; };
  try {
    console.log('1. Recherche automatique au démarrage (~10 s en réel ; 0,8 s ici) et bandeau');
    const f = await makeAll(path.join(os.tmpdir(), 'oricalpdf-ui-pdfs'));
    c = await launchApp({ files: [f.a], env: baseEnv, userDataFiles: marker });
    await c.waitFor(`document.querySelectorAll('.docview.active canvas').length>0`);
    await c.waitFor(`!document.getElementById('update-banner').hidden`, 15000);
    check('une requête GET vers l\'adresse configurée, au démarrage', hits.length === 1 && hits[0].method === 'GET' && hits[0].url === '/latest.json', hits.map((h) => h.url));
    const h = hits[0].headers;
    check('agent utilisateur générique (sans version, ni Electron, ni nom de l\'application)', h['user-agent'] === 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', h['user-agent']);
    check('aucun cookie, aucun en-tête contenant la version ou le nom de l\'application', !('cookie' in h) && !Object.values(h).some((v) => String(v).includes(version) || /orical|electron/i.test(String(v))), h);
    const b = JSON.parse(await c.ev(`JSON.stringify({t:document.getElementById('update-title').textContent, d:document.getElementById('update-date').textContent,
      li:[...document.querySelectorAll('#update-notes li')].map((x)=>x.textContent), img:document.querySelectorAll('#update-banner img').length,
      sha:document.getElementById('update-sha').textContent, more:document.getElementById('update-more').hidden, title:document.title})`));
    check('bandeau : « Orical PDF 9.9.9 est disponible », date', b.t === 'Orical PDF 9.9.9 est disponible' && b.d === 'publiée le 01/12/2026', b);
    check('notes affichées en TEXTE (balise visible, aucune image créée, aucun script exécuté)', b.li[0] === 'Nouveautés : <img src=x onerror="document.title=1">' && b.img === 0 && b.title !== '1', b);
    check('notes nettoyées (caractères de contrôle et de direction retirés)', b.li.length === 3 && !/[\u0000-\u001f\u202a-\u202e]/.test(b.li.join('')), b.li);
    check('empreinte SHA-256 dans le détail (replié au départ)', b.sha === SHA && b.more === true, b);
    await c.click('#update-more-btn'); await sleep(150);
    check('« Détails » déplie les notes et l\'empreinte', (await c.ev(`!document.getElementById('update-more').hidden && document.getElementById('update-more-btn').getAttribute('aria-expanded')==='true'`)));
    const ck = JSON.parse(await c.ev(CLICKABLE('#update-banner')));
    check('bandeau cliquable (hors zone de glissement de la barre de titre)', ck.n >= 4 && ck.bad.length === 0, ck);
    let s = settingsOf(c);
    check('settings.json : dernière recherche notée, résultat « available »', s.update && typeof s.update.lastCheck === 'number' && s.update.lastStatus === 'available' && s.update.auto === true, s.update);
    await c.click('#update-download'); await sleep(300);
    check('« Télécharger » : adresse VALIDÉE du fichier ouverte dans le navigateur (notée en test)', fs.existsSync(ext) && fs.readFileSync(ext, 'utf8').trim() === 'update\thttps://orical.app/orical-pdf/', fs.existsSync(ext) && fs.readFileSync(ext, 'utf8'));
    await c.click('#update-later'); await sleep(150);
    check('« Plus tard » masque le bandeau', await c.ev(`document.getElementById('update-banner').hidden`));

    console.log('2. Recherche manuelle : réponses du serveur');
    let r = await manual(c, 'same');
    check('version identique : « latest », rien à proposer', r.status === 'latest' && r.version === version, r);
    r = await manual(c, 'older');
    check('version antérieure : « latest »', r.status === 'latest', r);
    check('aucun bandeau pour une version identique ou antérieure', await c.ev(`document.getElementById('update-banner').hidden`));
    r = await manual(c, '404');
    check('404 : erreur', r.status === 'error' && /404/.test(r.reason), r);
    r = await manual(c, 'invalid');
    check('JSON invalide : erreur (fichier refusé)', r.status === 'error' && /JSON invalide/.test(r.reason), r);
    r = await manual(c, 'big');
    check('réponse > 64 Ko : erreur', r.status === 'error' && /trop grosse/.test(r.reason), r);
    r = await manual(c, 'mute');
    check('serveur muet : abandon après 8 s', r.status === 'error' && /délai/.test(r.reason) && r.ms >= 7500 && r.ms < 14000, r);
    const before = hits.length;
    r = await manual(c, 'redirect-other');
    check('redirection vers un autre hôte (localhost) : refusée, non suivie', r.status === 'error' && /redirection refusée/.test(r.reason) && hits.length === before + 1, { r, n: hits.length - before });
    r = await manual(c, 'redirect-same');
    check('redirection vers le même hôte : suivie', r.status === 'available' && r.info.version === '9.9.9' && hits[hits.length - 1].url === '/latest.json?r=1', r);

    console.log('3. Réglages > Mises à jour');
    await c.click('#btn-settings'); await sleep(300);
    const st0 = JSON.parse(await c.ev(`JSON.stringify({chk:document.getElementById('opt-update').checked, dis:document.getElementById('opt-update').disabled, pol:document.getElementById('opt-update-policy').hidden})`));
    check('case « Rechercher automatiquement » cochée par défaut, active, sans mention d\'administrateur', st0.chk && !st0.dis && st0.pol, st0);
    mode = 'same'; await c.click('#update-now'); await c.waitFor(`/dernière version/.test(document.getElementById('update-result').textContent)`, 12000);
    check('« Rechercher maintenant » : « Vous avez la dernière version. »', (await c.ev(`document.getElementById('update-result').textContent`)) === 'Vous avez la dernière version.');
    mode = '404'; await c.click('#update-now'); await c.waitFor(`/joindre/.test(document.getElementById('update-result').textContent)`, 12000);
    check('échec : « Impossible de joindre le serveur. »', (await c.ev(`document.getElementById('update-result').textContent`)) === 'Impossible de joindre le serveur.');
    mode = 'newer'; await c.click('#update-now'); await c.waitFor(`/disponible/.test(document.getElementById('update-result').textContent)`, 12000);
    check('plus récente : « Version 9.9.9 disponible. » et bandeau affiché', (await c.ev(`document.getElementById('update-result').textContent`)) === 'Version 9.9.9 disponible.' && !(await c.ev(`document.getElementById('update-banner').hidden`)));
    const ck2 = JSON.parse(await c.ev(CLICKABLE('#settings')));
    check('boîte Réglages cliquable avec la rubrique ajoutée', ck2.n > 0 && ck2.bad.length === 0, ck2);
    await c.click('#settings-close'); await sleep(200);
    await c.click('#update-ignore'); await sleep(300);
    s = settingsOf(c);
    const stI = JSON.parse(await c.ev(`window.oricalpdf.updateState().then((s)=>JSON.stringify(s))`));
    check('« Ignorer cette version » : bandeau masqué, version notée, plus proposée', (await c.ev(`document.getElementById('update-banner').hidden`)) && s.update.ignored === '9.9.9' && stI.available === null, { u: s.update, a: stI.available });

    console.log('4. Le rendu reste hors-ligne ; diagnostic ; À propos');
    const nHits = hits.length;
    const fr = await c.ev(`fetch(${JSON.stringify(URL_TEST)}).then(() => 'passée', () => 'bloquée')`);
    await sleep(300);
    check('requête depuis la fenêtre (rendu) : bloquée, rien reçu par le serveur', fr === 'bloquée' && hits.length === nHits, { fr, n: hits.length - nHits });
    const diag = await c.ev(`window.oricalpdf.diagnostic()`);
    check('diagnostic : état de la recherche, sans adresse', /Recherche de mise à jour : automatique ; dernière : \d{4}-\d\d-\d\d \d\d:\d\d ; résultat : available \(9\.9\.9\)/.test(diag) && !/127\.0\.0\.1|orical\.app|http/.test(diag), diag.split('\n').slice(-3));
    await c.click('#btn-settings'); await sleep(200); await c.click('#btn-about'); await sleep(400);
    check('À propos : « Dernière recherche de mise à jour : <date> »', /^Dernière recherche de mise à jour : \d\d\/\d\d\/\d{4} \d\d:\d\d\.$/.test(await c.ev(`document.getElementById('about-update').textContent`)), await c.ev(`document.getElementById('about-update').textContent`));
    await c.click('#about-close'); await sleep(150);
    await c.click('#btn-settings'); await sleep(200);
    await c.click('#opt-update'); await sleep(300);
    check('case décochée : réglage auto = false', settingsOf(c).update.auto === false, settingsOf(c).update);
    check('aucune erreur JavaScript', c.logs.length === 0, c.logs);
    await c.close(); c = null;

    console.log('5. Une fois par jour, case décochée, stratégie, témoin de test');
    let n0 = hits.length;
    const c2 = await launchApp({ env: baseEnv, userDataFiles: Object.assign({ 'settings.json': { update: { auto: true, lastCheck: Date.now() - 3600 * 1000 } } }, marker) }); others.push(c2);
    await sleep(3500);
    check('recherche faite il y a 1 h : aucune requête au démarrage', hits.length === n0, hits.length - n0);
    await c2.close(); others.pop();
    const c3 = await launchApp({ env: baseEnv, userDataFiles: Object.assign({ 'settings.json': { update: { auto: false, lastCheck: null } } }, marker) }); others.push(c3);
    await sleep(3500);
    check('case décochée : aucune requête au démarrage', hits.length === n0, hits.length - n0);
    await c3.close(); others.pop();
    const c4 = await launchApp({ env: baseEnv, userDataFiles: Object.assign({ 'settings.json': { update: { auto: true, lastCheck: Date.now() + 5 * 86400000 } } }, marker) }); others.push(c4);
    await c4.waitFor(`!document.getElementById('update-banner').hidden`, 15000);
    check('horloge qui a reculé (dernière recherche « dans le futur ») : nouvelle recherche', hits.length === n0 + 1, hits.length - n0);
    await c4.close(); others.pop();
    n0 = hits.length;
    const add = spawnSync('reg', ['add', policyKey, '/v', 'DisableUpdateCheck', '/t', 'REG_DWORD', '/d', '1', '/f'], { encoding: 'utf8' });
    check('clé de stratégie de TEST créée (HKCU\\Software\\OricalPDF-Test-…)', add.status === 0, add.stderr);
    const c5 = await launchApp({ env: Object.assign({ ORICALPDF_TEST_POLICY_KEY: policyKey }, baseEnv), userDataFiles: marker }); others.push(c5);
    await sleep(2500);
    await c5.click('#btn-settings'); await sleep(400);
    const sp = JSON.parse(await c5.ev(`JSON.stringify({chk:document.getElementById('opt-update').checked, dis:document.getElementById('opt-update').disabled, pol:!document.getElementById('opt-update-policy').hidden, pt:document.getElementById('opt-update-policy').textContent, now:document.getElementById('update-now').disabled})`));
    check('stratégie DisableUpdateCheck = 1 : case grisée et décochée, « Désactivée par votre administrateur », bouton grisé', !sp.chk && sp.dis && sp.pol && sp.pt === 'Désactivée par votre administrateur.' && sp.now, sp);
    const rp = JSON.parse(await c5.ev(`window.oricalpdf.updateCheck().then((r)=>JSON.stringify(r))`));
    check('stratégie : recherche manuelle refusée, aucune requête (ni automatique ni manuelle)', rp.status === 'disabled' && hits.length === n0, { rp, n: hits.length - n0 });
    await c5.close(); others.pop();
    const c6 = await launchApp({ env: baseEnv }); others.push(c6); // sans le témoin .oricalpdf-test : la variable de test est ignorée
    await sleep(2000);
    const r6 = JSON.parse(await c6.ev(`window.oricalpdf.updateCheck().then((r)=>JSON.stringify(r))`));
    check('sans témoin .oricalpdf-test : adresse de test ignorée, et aucune requête réelle pendant les tests automatisés', r6.status === 'error' && /aucune requête pendant les tests/.test(r6.reason) && hits.length === n0, { r6, n: hits.length - n0 });
    await c6.close(); others.pop();
  } catch (e) {
    check('exécution sans exception', false, String(e && e.stack || e));
  } finally {
    if (c) await c.close();
    for (const o of others) await o.close().catch(() => {});
    spawnSync('reg', ['delete', policyKey, '/f'], { stdio: 'ignore' });
    const left = spawnSync('reg', ['query', policyKey], { stdio: 'ignore' }).status === 0;
    if (left) check('clé de stratégie de test supprimée', false, policyKey);
    server.close();
    try { fs.rmSync(path.dirname(ext), { recursive: true, force: true }); } catch { /* */ }
  }
  console.log(`\n${passed} ok, ${failures.length} échec(s)`);
  if (failures.length) { console.log('Échecs :\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('OK : recherche de mise à jour (interface).');
  process.exit(0);
})();
