// À propos dans l'application réelle : les licences tierces sont lues (pas « introuvable »). Court, fait pour test:packaged : la version
// empaquetée lit resources/THIRD_PARTY_LICENSES.txt (le fichier sans extension n'est pas embarqué dans app.asar).
// Usage : node test/test-about-ui.js   |   SPINADOC_EXE="chemin\Orical PDF.exe" node test/test-about-ui.js
const path = require('path');
const { launchApp } = require('./lib/app.js');
const G = require('../scripts/icon-geometry.js');
const I = require('./test-icon.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };

(async () => {
  console.log('À propos — variante : ' + (process.env.SPINADOC_EXE ? path.basename(process.env.SPINADOC_EXE) : 'développement'));
  const c = await launchApp({ files: [] });
  try {
    const a = JSON.parse(await c.ev(`window.spinadoc.getAbout().then((i) => JSON.stringify({ v: i.version, n: i.licenses.length, head: i.licenses.slice(0, 80), name: i.name, suite: i.suite, license: i.license, copyright: i.copyright }))`));
    check('À propos : version de package.json', a.v === require('../package.json').version, a.v);
    check('À propos : nom « Orical PDF », suite Orical, sous licence Orical, © Orical', a.name === 'Orical PDF' && a.suite === 'Orical PDF — fait partie de la suite Orical' && /^Sous licence Orical/.test(a.license) && /^© \d{4} Orical\. Tous droits réservés\.$/.test(a.copyright), a);
    await c.click('#btn-settings'); await new Promise((r) => setTimeout(r, 250)); await c.click('#btn-about');
    const shown = JSON.parse(await c.ev(`(async () => { for (let k = 0; k < 60 && !document.getElementById('about-suite').textContent; k++) await new Promise((r) => setTimeout(r, 50)); const t = (id) => document.getElementById(id).textContent; const r = JSON.stringify({ title: t('about-title'), suite: t('about-suite'), lic: t('about-license'), logo: (() => { const i = document.querySelector('#about .about-head img'); return i ? { src: i.getAttribute('src'), w: i.naturalWidth } : null; })(), visible: !document.getElementById('about').hidden }); return r; })()`));
    check('À propos affiché : titre, suite et licence visibles', shown.visible && shown.title === 'Orical PDF' && /suite Orical/.test(shown.suite) && /Sous licence Orical/.test(shown.lic), shown);
    // Rendu RÉEL du logo (capture CDP, composée sur le fond) : halo rouge, disque sombre, trait rose ; dans l'À propos et la barre de titre.
    const logoOk = async (sel) => {
      const [x, y, w, h] = JSON.parse(await c.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify([r.x, r.y, r.width, r.height]); })()`));
      const r = await c.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 2 } });
      const p = G.decodePng(Buffer.from(r.result.data, 'base64'));
      const n = { rouge: 0, sombre: 0, rose: 0 };
      for (let yy = 0; yy < p.height; yy++) for (let xx = 0; xx < p.width; xx++) { const q = G.pixel(p, xx, yy); if (I.isRed(q)) n.rouge++; if (I.isDark(q)) n.sombre++; if (I.isPink(q)) n.rose++; }
      const tot = p.width * p.height;
      return { ok: n.rouge > tot * 0.05 && n.sombre > tot * 0.1 && n.rose > tot * 0.005, n, tot };
    };
    check('logo de l\'À propos rendu (halo rouge, disque sombre, trait rose ; image chargée)', shown.logo && shown.logo.src === 'assets/logo-orical-pdf.svg' && shown.logo.w > 0 && (await logoOk('#about .about-head img')).ok, shown.logo);
    await c.ev("document.getElementById('about-close').click()");
    const tb = await logoOk('#brand-mark svg');
    check('logo de la barre de titre rendu (SVG inline : halo flou + disque + pictogramme)', tb.ok, tb);
    check('À propos : licences tierces lues (> 1000 caractères, pas « introuvable »)', a.n > 1000 && !/introuvable/i.test(a.head), a);
  } finally { await c.close(); }
  console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
