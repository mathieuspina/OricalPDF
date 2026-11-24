// Mémorisation de la fenêtre (src/window-state.js, logique pure) + branchement dans main.js (lecture du source).
// Cas : agrandie, plein écran, taille normale, écran disparu, écran secondaire, résolution réduite, fichier absent ou corrompu, valeurs absurdes,
// fenêtre réduite à la fermeture ; main.js : rien lu ni écrit en mode test (ORICALPDF_TEST_HEADLESS=1) ni par une seconde instance.
// Usage : node test/test-window-state.js
const fs = require('fs');
const path = require('path');
const W = require('../src/window-state.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Écrans (coordonnées Windows en DIP) : principal 1920 × 1080 (barre des tâches 48 px), secondaire à droite 2560 × 1440.
const primary = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
const second = { bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, workArea: { x: 1920, y: 0, width: 2560, height: 1392 } };
const one = [primary], two = [primary, second];

// 1. Capture
const normal = { x: 100, y: 80, width: 1400, height: 900 };
check('capture : taille normale', eq(W.capture({ bounds: normal, normalBounds: normal, isMaximized: false, isFullScreen: false }), { ...normal, maximized: false, fullScreen: false }));
const maxi = W.capture({ bounds: { x: -8, y: -8, width: 1936, height: 1048 }, normalBounds: normal, isMaximized: true, isFullScreen: false });
check('capture : agrandie → bornes NORMALES gardées (taille de restauration) + maximized', eq(maxi, { ...normal, maximized: true, fullScreen: false }), maxi);
const fs1 = W.capture({ bounds: primary.bounds, normalBounds: normal, isMaximized: false, isFullScreen: true });
check('capture : plein écran → fullScreen + bornes normales', eq(fs1, { ...normal, maximized: false, fullScreen: true }), fs1);
const mini = W.capture({ bounds: normal, normalBounds: normal, isMaximized: false, isMinimized: true, wasMaximized: true, wasFullScreen: false });
check('capture : fermée depuis la barre des tâches (réduite) → état d\'avant la réduction (agrandie)', mini.maximized === true && mini.fullScreen === false, mini);
check('capture : bornes invalides → null', W.capture({ bounds: { x: 0, y: 0, width: 0, height: 10 } }) === null && W.capture(null) === null);

// 2. Restauration
const r1 = W.restore(W.capture({ bounds: normal, normalBounds: normal }), one);
check('restaure : taille normale, même position', eq(r1.bounds, normal) && !r1.maximize && !r1.fullScreen, r1);
const r2 = W.restore(maxi, one);
check('restaure : agrandie → maximize, taille de restauration gardée', r2.maximize && !r2.fullScreen && eq(r2.bounds, normal), r2);
const r3 = W.restore(fs1, one);
check('restaure : plein écran → fullScreen', r3.fullScreen && !r3.maximize, r3);
const onSecond = { x: 2200, y: 100, width: 1600, height: 1000, maximized: false, fullScreen: false };
check('restaure : sur l\'écran secondaire présent → position gardée', eq(W.restore(onSecond, two).bounds, { x: 2200, y: 100, width: 1600, height: 1000 }));
const gone = W.restore(onSecond, one);
check('restaure : écran disparu → pas de position (centrée par Windows), taille gardée si elle tient', gone.bounds.x === undefined && gone.bounds.y === undefined && gone.bounds.width === 1600 && gone.bounds.height === 1000 && gone.reason === 'écran absent', gone);
const goneBig = W.restore({ x: 2000, y: 0, width: 2500, height: 1350, maximized: true }, one);
check('restaure : écran disparu, fenêtre plus grande que l\'écran principal → taille ramenée à sa zone de travail, agrandie conservée', goneBig.bounds.x === undefined && goneBig.bounds.width === 1920 && goneBig.bounds.height === 1032 && goneBig.maximize, goneBig);
const offTop = W.restore({ x: 300, y: -500, width: 1200, height: 800 }, one);
check('restaure : barre de titre au-dessus de l\'écran (invisible) → position par défaut', offTop.bounds.x === undefined, offTop);
const edge = W.restore({ x: 1850, y: 100, width: 1200, height: 800 }, one);
check('restaure : à peine visible (70 px de barre de titre) → position par défaut', edge.bounds.x === undefined, edge);
const half = W.restore({ x: 1300, y: 100, width: 1200, height: 800 }, one);
check('restaure : en partie hors écran mais barre de titre saisissable → position gardée', eq(half.bounds, { x: 1300, y: 100, width: 1200, height: 800 }), half);
const shrunk = W.restore({ x: 0, y: 0, width: 2560, height: 1400 }, one);
check('restaure : résolution réduite depuis → taille limitée à la zone de travail', shrunk.bounds.width === 1920 && shrunk.bounds.height === 1032 && shrunk.bounds.x === 0, shrunk);
const tiny = W.restore({ x: 10, y: 10, width: 200, height: 100 }, one);
check('restaure : taille sous le minimum → minimum (900 × 560)', tiny.bounds.width === W.MIN.width && tiny.bounds.height === W.MIN.height, tiny);
check('restaure : aucun écran connu → taille seule, sans position', (() => { const r = W.restore(normal, []); return r.bounds.x === undefined && r.bounds.width === 1400; })());

// 3. Fichier absent ou corrompu, valeurs absurdes → défaut
const def = (r) => r.reason === 'défaut' && r.bounds.width === W.DEFAULT.width && r.bounds.height === W.DEFAULT.height && r.bounds.x === undefined && !r.maximize && !r.fullScreen;
check('fichier settings.json absent → défaut 1280 × 860', def(W.restore(W.fromJsonText(null), one)));
check('fichier corrompu (JSON illisible) → défaut', def(W.restore(W.fromJsonText('{"window": {"width": 14'), one)));
check('fichier sans clé « window » (réglages existants seuls) → défaut', def(W.restore(W.fromJsonText('{"propsWidth": 300}'), one)));
check('clé « window » valide relue depuis le texte du fichier', eq(W.restore(W.fromJsonText(JSON.stringify({ propsWidth: 300, window: { ...normal, maximized: true } })), one).bounds, normal));
const absurd = [{ width: 'grand', height: 800 }, { width: -5, height: 800 }, { width: NaN, height: 800 }, { width: 1e9, height: 800 }, [], 'texte', 42, null];
check('valeurs absurdes (texte, négatif, NaN, énorme, tableau, nombre) → défaut', absurd.every((a) => def(W.restore(a, one))));
check('position absurde ignorée, taille gardée', (() => { const r = W.restore({ x: 'a', y: 5, width: 1000, height: 700 }, one); return r.bounds.x === undefined && r.bounds.width === 1000; })());
check('« maximized » seulement si true (pas "oui" ni 1)', !W.restore({ ...normal, maximized: 'oui', fullScreen: 1 }, one).maximize && !W.restore({ ...normal, fullScreen: 1 }, one).fullScreen);
check('défaut plus grand qu\'un petit écran (1280 × 720) → ramené à sa zone de travail', (() => { const r = W.restore(null, [{ workArea: { x: 0, y: 0, width: 1280, height: 680 } }]); return r.bounds.width === 1280 && r.bounds.height === 680; })());

// 4. Branchement dans main.js
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
check('main.js : état lu dans settings.json (clé window) et restauré à la création de la fenêtre', /WindowState\.restore\(/.test(main) && /WindowState\.fromJsonText\(/.test(main) && /settings\.json/.test(main));
check('main.js : enregistré à la fermeture (bornes normales, agrandie, plein écran)', /getNormalBounds\(\)/.test(main) && /isFullScreen\(\)/.test(main) && /WindowState\.capture\(/.test(main));
check('main.js : ni lu ni écrit en mode test (ORICALPDF_TEST_HEADLESS=1) ni par une seconde instance', /const rememberWindow = !headlessEnv && gotLock/.test(main) || /rememberWindow\s*=\s*[^;]*ORICALPDF_TEST_HEADLESS[^;]*gotLock|rememberWindow\s*=\s*[^;]*gotLock[^;]*ORICALPDF_TEST_HEADLESS/.test(main), 'rememberWindow');
check('main.js : les autres réglages sont conservés (lecture puis fusion de settings.json)', /Object\.assign\(readJson\('settings\.json', \{\}\), \{ window:/.test(main));

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
