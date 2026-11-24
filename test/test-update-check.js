// Recherche de mise à jour : logique pure (src/update-check.js). Usage : node test/test-update-check.js
const path = require('path');
const U = require(path.join(__dirname, '..', 'src', 'update-check.js'));

const failures = [];
let passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log('  ok   ', name); } else { failures.push(name); console.log('  ECHEC', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); } };

const SHA = 'a'.repeat(64);
const base = { schema: 1, version: '1.5.0', date: '2026-12-01', url: 'https://orical.app/orical-pdf/', sha256: SHA, notes: ['Nouveautés'] };
const P = (o) => U.parse(JSON.stringify(Object.assign({}, base, o)));
const reason = (o) => { const r = P(o); return r.ok ? 'accepté' : r.reason; };

console.log('1. Fichier valide');
let r = U.parse(JSON.stringify(base));
check('schéma 1 complet : accepté, champs recopiés', r.ok && r.info.version === '1.5.0' && r.info.date === '2026-12-01' && r.info.url === 'https://orical.app/orical-pdf/' && r.info.sha256 === SHA && r.info.notes[0] === 'Nouveautés', r);
check('champs inconnus ignorés (absents du résultat)', P({ extra: 1, script: '<b>x</b>' }).ok && !('extra' in P({ extra: 1 }).info));
check('empreinte en majuscules : acceptée, rendue en minuscules', P({ sha256: 'ABCDEF'.repeat(10) + 'ABCD' }).info.sha256 === 'abcdef'.repeat(10) + 'abcd');
check('www.orical.app accepté', P({ url: 'https://www.orical.app/orical-pdf/OricalPDF-Setup-1.5.0.exe' }).ok);
check('notes absentes : liste vide', (() => { const o = Object.assign({}, base); delete o.notes; const x = U.parse(JSON.stringify(o)); return x.ok && x.info.notes.length === 0; })());
check('BOM UTF-8 en tête toléré', U.parse('\uFEFF' + JSON.stringify(base)).ok);

console.log('2. Refus');
check('JSON invalide', U.parse('{schema:1').reason === 'JSON invalide');
check('texte vide', !U.parse('').ok);
check('non-texte (Buffer, null)', !U.parse(Buffer.from('{}')).ok && !U.parse(null).ok);
check('tableau au lieu d\'objet', U.parse(JSON.stringify([base])).reason === 'objet attendu');
check('null, nombre, chaîne JSON', ['null', '3', '"x"'].every((t) => !U.parse(t).ok));
check('schéma ≠ 1 (2, "1", absent)', [2, '1', undefined].every((s) => reason({ schema: s }) === 'schéma inconnu'));
const big = JSON.stringify(Object.assign({}, base, { pad: 'x'.repeat(U.MAX_BYTES) }));
check('réponse > 64 Ko refusée (avant même l\'analyse)', U.parse(big).reason === 'réponse trop grosse', big.length);
check('64 Ko mesurés en octets (caractères accentués = 2 octets)', U.parse(JSON.stringify(Object.assign({}, base, { pad: 'é'.repeat(33000) }))).reason === 'réponse trop grosse');
for (const v of ['1.4', 'v1.4.0', '1.4.0-beta', '1.4.0.1', ' 1.4.0', '1.4.0 ', '1.a.0', '', '1..0', '-1.4.0', '1.4.0\n', '1234567.0.0']) check(`version refusée : ${JSON.stringify(v)}`, reason({ version: v }) === 'version invalide');
check('version non textuelle (nombre 1.4)', reason({ version: 1.4 }) === 'version invalide');
for (const d of ['2026-13-01', '2026-02-30', '2026-2-1', '01-12-2026', '2026-12-01T00:00', '', 'demain', '1999-12-31']) check(`date refusée : ${JSON.stringify(d)}`, reason({ date: d }) === 'date invalide');
check('29 février d\'une année bissextile accepté', P({ date: '2028-02-29' }).ok);
const badUrls = ['http://orical.app/orical-pdf/', 'https://orical.app.evil.com/', 'https://orical.app@evil.com/', 'https://user:pw@orical.app/',
  'https://orical.app:8443/', 'https://evil.com/orical.app', 'https://evilorical.app/', 'https://sub.orical.app/', 'ftp://orical.app/', 'javascript:alert(1)',
  'https://orical.app\\@evil.com/', 'https://orical.app /x', 'https://orical.app/\u0000', '//orical.app/', 'orical.app/orical-pdf/', 'https://xn--orcal-4ra.app/', 'file:///C:/x'];
for (const u of badUrls) check(`adresse refusée : ${JSON.stringify(u)}`, reason({ url: u }) === 'adresse refusée');
check('adresse non textuelle', reason({ url: ['https://orical.app/'] }) === 'adresse refusée');
for (const s of ['a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), '', 123]) check(`empreinte refusée : ${String(s).slice(0, 8)}… (${String(s).length})`, reason({ sha256: s }) === 'empreinte invalide');
check('notes non tableau', reason({ notes: 'texte' }) === 'notes invalides');
check('notes avec un élément non textuel', reason({ notes: ['ok', 3] }) === 'notes invalides');

console.log('3. Notes : nettoyage et troncature');
r = P({ notes: ['a\u0000b\u0007c\u001b[31m', 'ligne\r\ncoupée', 'x\u202Eevil\u202C', '   ', '\u0085'] });
check('caractères de contrôle et de direction retirés, lignes vides écartées', r.ok && r.info.notes.length === 3 && r.info.notes.every((n) => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(n)), r.info && r.info.notes);
check('texte HTML gardé tel quel (affiché en texte, jamais interprété)', P({ notes: ['<img src=x onerror=alert(1)>'] }).info.notes[0] === '<img src=x onerror=alert(1)>');
r = P({ notes: Array.from({ length: 30 }, (_, i) => 'n' + i) });
check('plus de 20 lignes : les 20 premières', r.info.notes.length === 20 && r.info.notes[19] === 'n19');
r = P({ notes: ['é'.repeat(500)] });
check('ligne de plus de 200 caractères : tronquée à 200 avec « … »', r.info.notes[0].length === 200 && r.info.notes[0].endsWith('…'), r.info.notes[0].length);

console.log('4. Versions');
const cmp = U.compareVersions;
check('1.10.0 > 1.9.9', cmp('1.10.0', '1.9.9') === 1);
check('1.4.0 = 1.4.0, 1.4.0 < 1.4.1, 2.0.0 > 1.99.99', cmp('1.4.0', '1.4.0') === 0 && cmp('1.4.0', '1.4.1') === -1 && cmp('2.0.0', '1.99.99') === 1);
check('version invalide : null', cmp('1.4', '1.4.0') === null && cmp('v1.4.0', '1.4.0') === null && cmp('1.4.0-beta', '1.4.0') === null);
check('isNewer : strictement plus récente seulement', U.isNewer('1.4.1', '1.4.0') && !U.isNewer('1.4.0', '1.4.0') && !U.isNewer('1.3.9', '1.4.0') && !U.isNewer('1.5', '1.4.0'));
const info = P({ version: '1.5.0' }).info;
check('offer : plus récente et non ignorée', U.offer(info, '1.4.0', null) && !U.offer(info, '1.4.0', '1.5.0') && !U.offer(info, '1.5.0', null) && !U.offer(info, '1.6.0', null) && !U.offer(null, '1.4.0', null));
check('ignored : seulement la version ignorée exacte', U.ignored(info, '1.5.0') && !U.ignored(info, '1.5.1') && !U.ignored(info, null));

console.log('5. Une fois par jour');
const now = Date.UTC(2026, 10, 24, 12);
check('jamais recherché : oui', U.shouldCheck(now, null) && U.shouldCheck(now, undefined) && U.shouldCheck(now, 'x') && U.shouldCheck(now, NaN));
check('il y a 23 h 59 : non ; il y a 24 h : oui', !U.shouldCheck(now, now - U.DAY + 60000) && U.shouldCheck(now, now - U.DAY));
check('horloge qui recule (dernière recherche dans le futur) : oui', U.shouldCheck(now, now + 3600000));

console.log('6. Adresse fixe et stratégie');
check('adresse fixe : https://orical.app/orical-pdf/latest.json, acceptée par safeUrl', U.URL === 'https://orical.app/orical-pdf/latest.json' && U.safeUrl(U.URL) === U.URL);
check('stratégie : DisableUpdateCheck REG_DWORD 0x1 → désactivée', U.policyDisabled('\r\nHKEY_CURRENT_USER\\Software\\Policies\\Orical\\OricalPDF\r\n    DisableUpdateCheck    REG_DWORD    0x1\r\n'));
check('stratégie : 0x0, absente, texte vide, autre type → autorisée', !U.policyDisabled('    DisableUpdateCheck    REG_DWORD    0x0') && !U.policyDisabled('') && !U.policyDisabled(null) &&
  !U.policyDisabled('ERREUR : le système n\'a pas trouvé la clé') && !U.policyDisabled('    DisableUpdateCheck    REG_SZ    1'));

console.log(`\n${passed} ok, ${failures.length} échec(s)`);
if (failures.length) process.exit(1);
console.log('OK : recherche de mise à jour (logique).');
