// Capacités d'une imprimante lues par print-main.js (processus principal, sous Electron) : code de papier du pilote (RawKind), papier par
// défaut, état et durée ; imprimante réseau injoignable → « expiré » (ou « invalide ») dans le délai, jamais de blocage. Aucune impression.
// Usage : node test/test-print-caps.js  (lance Electron sur ce même fichier avec --run)
const path = require('path');
const root = path.join(__dirname, '..');

if (process.argv.includes('--run')) { // ---------------------------------------- dans Electron
  const { app } = require('electron');
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const out = {};
    try {
      const PM = require(path.join(root, 'print-main.js'));
      const { spawnSync } = require('child_process');
      const has = spawnSync('powershell.exe', ['-NoProfile', '-Command', "(Get-Printer -Name 'SpinADoc Test PDF' -ErrorAction SilentlyContinue).Name"], { encoding: 'utf8' }).stdout.trim() === 'SpinADoc Test PDF';
      if (has) out.test = await PM.capabilitiesEx('SpinADoc Test PDF');
      out.unreachable = await PM.capabilitiesEx('\\\\192.0.2.1\\imprimante-absente'); // adresse réservée à la documentation (RFC 5737)
    } catch (e) { out.error = String(e && e.stack || e); }
    process.stdout.write('RESULT ' + JSON.stringify(out) + '\n');
    app.exit(0);
  });
} else { // ---------------------------------------------------------------------- lanceur
  const { spawnSync } = require('child_process');
  const assert = require('assert');
  const electron = require(path.join(root, 'node_modules', 'electron'));
  const TIMEOUT = 3000;
  const t0 = Date.now();
  const env = Object.assign({}, process.env, { SPINADOC_CAPS_TIMEOUT_MS: String(TIMEOUT) });
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [__filename, '--run'], { encoding: 'utf8', timeout: 120000, env });
  const m = /RESULT (.*)/.exec(r.stdout || '');
  assert.ok(m, 'résultat lu : ' + (r.stdout || '') + (r.stderr || '').slice(-500));
  const out = JSON.parse(m[1]);
  assert.ok(!out.error, out.error);
  let n = 0;
  if (out.test) {
    const c = out.test.caps;
    assert.strictEqual(out.test.status, 'ok', 'imprimante de test : capacités lues');
    const a3 = c.papers.find((p) => Math.abs(p.w - 296.9) < 1 && Math.abs(p.h - 420.1) < 1);
    assert.ok(a3 && a3.kind === 8, 'A3 annoncé avec son code de papier (8) : ' + JSON.stringify(a3));
    assert.ok(c.papers.every((p) => p.kind === null || Number.isInteger(p.kind)), 'codes entiers');
    assert.ok(c.defaultPaper && c.defaultPaper.w > 0 && Number.isInteger(c.defaultPaper.kind), 'papier par défaut du pilote : ' + JSON.stringify(c.defaultPaper));
    assert.ok(out.test.ms >= 0 && out.test.ms < 15000, 'durée mesurée');
    n += 4;
    console.log(`  ok   imprimante de test : ${c.papers.length} papiers avec code, défaut ${c.defaultPaper.name} #${c.defaultPaper.kind}, lue en ${out.test.ms} ms`);
  } else console.log('  --   imprimante « SpinADoc Test PDF » absente : partie sautée');
  const u = out.unreachable;
  assert.ok(u && u.caps === null && ['expiré', 'invalide', 'échec'].includes(u.status), 'imprimante injoignable : pas de capacités, état ' + JSON.stringify(u));
  assert.ok(u.ms <= TIMEOUT + 2000, `imprimante injoignable : réponse dans le délai (${u.ms} ms)`);
  n += 2;
  console.log(`  ok   imprimante réseau injoignable : état « ${u.status} » en ${u.ms} ms (délai ${TIMEOUT} ms)`);
  console.log(`OK : capacités d'imprimante (${n} vérifications, ${Math.round((Date.now() - t0) / 1000)} s).`);
}
