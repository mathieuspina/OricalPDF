// Harnais des tests d'interface (test/lib/app.js) : délais maximaux. Sans Electron : une fausse application (test/lib/fake-cdp-app.js)
// joue un port occupé, une application qui ne démarre jamais, une commande CDP sans réponse et une suite bloquée.
// Cause d'origine (1.2.1) : le port CDP tiré au hasard (9395) était déjà pris par un service système qui accepte la connexion sans répondre ;
// la requête /json attendait sans fin → test-measure-ui bloqué plus d'une heure.
// Usage : node test/test-app-harness.js   (≈ 10 s)
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };

const FAKE = path.join(__dirname, 'lib', 'fake-cdp-app.js');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const fake = (mode) => ({ exe: process.execPath, exeArgs: [FAKE], env: { FAKE_CDP_MODE: mode } });

(async () => {
  process.env.ORICALPDF_TEST_CONNECT_MS = '1500';
  process.env.ORICALPDF_TEST_CDP_MS = '1500';
  const { launchApp, internal } = require('./lib/app');

  // 1. Port occupé par un programme qui accepte la connexion sans jamais répondre (situation réelle reproduite).
  const sockets = [];
  const squatter = net.createServer((s) => sockets.push(s)); // ne répond jamais
  await new Promise((r) => squatter.listen(0, '127.0.0.1', r));
  const busy = squatter.address().port;
  let t = Date.now();
  const r = await internal.getJson(`http://127.0.0.1:${busy}/json`, 800).then(() => 'réponse', (e) => e.message);
  check('requête /json vers un port muet : abandon après le délai (plus d\'attente sans fin)', /pas de réponse HTTP/.test(r) && Date.now() - t < 3000, r);
  check('port occupé détecté comme non libre', (await internal.portFree(busy)) === false);
  const msg1 = await launchApp({ ...fake('mute'), port: busy }).then(() => 'lancé', (e) => e.message);
  check('port imposé déjà utilisé : refus immédiat, message clair', /port de débogage \d+ déjà utilisé/.test(msg1), msg1);
  const picked = await internal.pickPort([busy]);
  check('port tiré au hasard : libre', picked >= 9300 && picked < 9800 && (await internal.portFree(picked)));

  // 2. Application qui n'ouvre jamais son port : délai de connexion, message (suite, étape, état), processus tué.
  t = Date.now();
  const e2 = await launchApp(fake('silent')).then(() => null, (e) => e);
  const pid2 = e2 && Number((e2.message.match(/PID (\d+)/) || [])[1]);
  check('connexion : échec après ORICALPDF_TEST_CONNECT_MS', e2 && /non connectée en 1500 ms/.test(e2.message) && Date.now() - t < 6000, e2 && e2.message);
  check('connexion : message avec suite, étape et instantané', e2 && /test-app-harness\.js/.test(e2.message) && /étape : recherche de la page CDP/.test(e2.message) && /processus : PID \d+/.test(e2.message) && /dernière ligne du journal/.test(e2.message), e2 && e2.message);
  await new Promise((res) => setTimeout(res, 500));
  check('connexion : application tuée', pid2 > 0 && !alive(pid2), pid2);

  // 3. Commande CDP sans réponse : rejet après ORICALPDF_TEST_CDP_MS, application tuée.
  t = Date.now();
  const e3 = await launchApp(fake('mute')).then(() => null, (e) => e);
  const pid3 = e3 && Number((e3.message.match(/PID (\d+)/) || [])[1]);
  check('CDP muette : échec après ORICALPDF_TEST_CDP_MS sur la 1re commande (Runtime.enable)', e3 && /aucune réponse CDP en 1500 ms/.test(e3.message) && /étape : Runtime\.enable/.test(e3.message) && Date.now() - t < 6000, e3 && e3.message);
  check('CDP muette : état (WebSocket ouvert, page, commandes en attente)', e3 && /WebSocket : (ouvert|fermeture|fermé)/.test(e3.message) && /file:\/\/\/faux\/index\.html/.test(e3.message), e3 && e3.message);
  await new Promise((res) => setTimeout(res, 500));
  check('CDP muette : application tuée', pid3 > 0 && !alive(pid3), pid3);

  // 4. Blocage au milieu d'une suite (évaluation sans réponse) : l'étape nomme l'expression.
  const app = await launchApp(fake('stall-eval'));
  console.log('  (dernière ligne de journal témoin)');
  const e4 = await app.ev('window.__etapeTemoin()').then(() => null, (e) => e);
  check('évaluation sans réponse : échec, étape = expression, dernière ligne du journal', e4 && /étape : Runtime\.evaluate window\.__etapeTemoin\(\)/.test(e4.message) && /dernière ligne du journal : \(dernière ligne de journal témoin\)/.test(e4.message), e4 && e4.message);
  await new Promise((res) => setTimeout(res, 500));
  check('évaluation sans réponse : application tuée', !alive(app.proc.pid));
  await app.close();

  // 5. Délai global de la suite (ORICALPDF_TEST_SUITE_MS) : processus de test arrêté avec un message, application tuée.
  const child = spawnSync(process.execPath, ['-e', `
    const { launchApp } = require(${JSON.stringify(path.join(__dirname, 'lib', 'app.js'))});
    launchApp({ exe: process.execPath, exeArgs: [${JSON.stringify(FAKE)}], env: { FAKE_CDP_MODE: 'stall-eval' } })
      .then((a) => { console.log('PID ' + a.proc.pid); return a.ev('1'); });`],
  { encoding: 'utf8', timeout: 20000, env: Object.assign({}, process.env, { ORICALPDF_TEST_SUITE_MS: '2000', ORICALPDF_TEST_CDP_MS: '60000', ORICALPDF_TEST_CONNECT_MS: '5000' }) });
  const pid5 = Number((child.stdout.match(/PID (\d+)/) || [])[1]);
  check('délai global : code 1 et message « délai global de la suite dépassé » avec l\'état', child.status === 1 && /délai global de la suite dépassé/.test(child.stderr) && /étape|processus : PID/.test(child.stderr), { status: child.status, err: child.stderr.slice(0, 400) });
  await new Promise((res) => setTimeout(res, 500));
  check('délai global : application tuée', pid5 > 0 && !alive(pid5), pid5);

  for (const s of sockets) s.destroy();
  squatter.close();
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
  process.exit(failures.length ? 1 : 0);
})();
