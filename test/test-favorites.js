// Favoris du ruban (src/favorites.js, logique pure) : ajout, retrait, ordre, déplacement, doublon, plafond (12), identifiants inconnus ou
// invalides ignorés à la lecture, JSON corrompu, sérialisation. Usage : node test/test-favorites.js
const F = require('../src/favorites.js');

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const known = new Set(['tool-m-dist', 'tool-m-dim', 'm-snap', 'print', 'open', 'zoom-in', 'zoom-out', 'undo', 'redo', 'search', 'saveas', 'spread', 'fit-page', 'fit-width', 'tool-note']);

let r = F.add([], 'tool-m-dist', known);
check('ajout dans une liste vide', r.ok && eq(r.list, ['tool-m-dist']));
r = F.add(r.list, 'm-snap', known);
check('ajout en fin de liste (ordre d\'ajout conservé)', r.ok && eq(r.list, ['tool-m-dist', 'm-snap']));
const d = F.add(r.list, 'tool-m-dist', known);
check('doublon refusé (liste inchangée, raison « doublon »)', !d.ok && d.reason === 'doublon' && eq(d.list, r.list));
const u = F.add(r.list, 'commande-supprimee', known);
check('commande inconnue refusée (raison « inconnu »)', !u.ok && u.reason === 'inconnu' && eq(u.list, r.list));
check('identifiant de forme invalide refusé (espace, majuscule, vide, non-chaîne)', ['a b', 'Print', '', null, 42, '../x'].every((x) => !F.add([], x).ok));
check('retrait', eq(F.remove(['print', 'open', 'undo'], 'open'), ['print', 'undo']) && eq(F.remove(['print'], 'absent'), ['print']));
check('déplacement à gauche / à droite', eq(F.move(['a1', 'b2', 'c3'], 'c3', -1), ['a1', 'c3', 'b2']) && eq(F.move(['a1', 'b2', 'c3'], 'a1', 1), ['b2', 'a1', 'c3']));
check('déplacement borné aux extrémités (liste inchangée), canMove cohérent', eq(F.move(['a1', 'b2'], 'a1', -1), ['a1', 'b2']) && eq(F.move(['a1', 'b2'], 'b2', 1), ['a1', 'b2'])
  && !F.canMove(['a1', 'b2'], 'a1', -1) && F.canMove(['a1', 'b2'], 'a1', 1) && !F.canMove(['a1'], 'zz', 1));
check('les fonctions ne modifient pas la liste reçue', (() => { const l = ['a1', 'b2']; F.add(l, 'c3'); F.move(l, 'a1', 1); F.remove(l, 'a1'); return eq(l, ['a1', 'b2']); })());

// plafond
let l = [];
for (const id of known) l = F.add(l, id, known).list;
check(`plafond : ${F.MAX} favoris au plus`, F.MAX === 12 && l.length === 12);
const full = F.add(l.slice(0, 12), 'tool-note', known);
check('ajout au-delà du plafond refusé (raison « plein »)', !full.ok && full.reason === 'plein' && full.list.length === 12);
check('liste trop longue lue → tronquée à 12', F.normalize(Array.from({ length: 20 }, (_, i) => 'cmd-' + i)).length === 12);

// lecture
check('lecture : identifiants inconnus (commande supprimée) ignorés, ordre gardé', eq(F.parse(['print', 'commande-supprimee', 'open'], known), ['print', 'open']));
check('lecture : doublons et valeurs invalides ignorés', eq(F.parse(['print', 'print', 3, null, { a: 1 }, 'open', 'Open'], known), ['print', 'open']));
check('lecture : JSON corrompu → liste vide', eq(F.parse('["print", "open"', known), []) && eq(F.parse('{', known), []));
check('lecture : valeur absente ou d\'un mauvais type → liste vide', [undefined, null, 42, 'texte', {}, true].every((v) => eq(F.parse(v, known), [])));
check('lecture : texte JSON d\'un tableau ou objet de réglages (clé favorites)', eq(F.parse('["zoom-in","print"]', known), ['zoom-in', 'print']) && eq(F.parse('{"propsWidth":300,"favorites":["undo"]}', known), ['undo']));
check('sérialisation : JSON relu à l\'identique', eq(F.parse(F.serialize(['print', 'm-snap', 'print']), known), ['print', 'm-snap']));
check('sans liste des commandes connues : seules la forme, les doublons et le plafond comptent', eq(F.parse(['x-1', 'x-1', 'y-2']), ['x-1', 'y-2']));

console.log(failures.length ? `\n${failures.length} échec(s) / ${passed + failures.length}` : `\nOK : ${passed} vérifications.`);
process.exit(failures.length ? 1 : 0);
