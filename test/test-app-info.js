// Diagnostic : masquage des noms d'imprimantes (serveur d'une imprimante réseau, nom d'utilisateur). Noms FICTIFS uniquement.
// Usage : node test/test-app-info.js
const { maskPrinter, SERVER_MASK } = require('../app-info.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const BS = '\\';

check('masque = \\\\<serveur>\\', SERVER_MASK === BS + BS + '<serveur>' + BS);
const net = maskPrinter(BS + BS + 'serveur-exemple' + BS + 'Imprimante', 'jdupont');
check('imprimante réseau : serveur masqué, nom de l\'imprimante gardé', net === BS + BS + '<serveur>' + BS + 'Imprimante', net);
check('imprimante réseau : le nom du serveur n\'apparaît plus', !/serveur-exemple/.test(net), net);
const sub = maskPrinter(BS + BS + 'serveur-exemple.domaine.local' + BS + 'Étage 2' + BS + 'Couleur', '');
check('nom d\'imprimante avec « \\ » et accents : seul le serveur est masqué', sub === SERVER_MASK + 'Étage 2' + BS + 'Couleur', sub);
check('« \\\\serveur » seul (sans imprimante) : entièrement masqué', maskPrinter(BS + BS + 'serveur-exemple', '') === SERVER_MASK);
check('imprimante locale inchangée', maskPrinter('Microsoft Print to PDF', 'jdupont') === 'Microsoft Print to PDF');
check('nom d\'utilisateur masqué (local et réseau)', maskPrinter('PDF de jdupont', 'jdupont') === 'PDF de <utilisateur>' && maskPrinter(BS + BS + 'serveur-exemple' + BS + 'jdupont-A4', 'jdupont') === SERVER_MASK + '<utilisateur>-A4');
check('nom d\'utilisateur trop court (≤ 2 caractères) : pas de masquage parasite', maskPrinter('Imprimante A4', 'A4') === 'Imprimante A4');
check('nom vide ou absent : chaîne vide', maskPrinter('', 'x') === '' && maskPrinter(undefined, '') === '');

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
