// Recherche de mise à jour : logique PURE (ni DOM, ni Electron, ni réseau). Le seul accès réseau de l'application est fait par le processus
// principal (update-main.js) : une requête HTTPS GET vers l'adresse fixe URL, au plus une fois par jour, désactivable (réglage ou stratégie).
// Fichier attendu (schéma 1, publié APRÈS chaque Release, voir RELEASING.md et scripts/make-latest-json.js) :
//   {"schema":1,"version":"x.y.z","date":"AAAA-MM-JJ","url":"https://orical.app/...","sha256":"64 hex","notes":["..."]}
// Tout écart est refusé (taille, JSON, schéma, version, date, adresse, empreinte, notes non textuelles) ; champs inconnus ignorés ; notes
// nettoyées (caractères de contrôle et de mise en forme bidirectionnelle retirés) et tronquées (20 lignes, 200 caractères).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UpdateCheck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const URL_LATEST = 'https://orical.app/orical-pdf/latest.json';
  const PAGE = 'https://orical.app/orical-pdf/';
  const HOSTS = ['orical.app', 'www.orical.app'];
  const MAX_BYTES = 64 * 1024;
  const MAX_NOTES = 20;
  const MAX_NOTE = 200;
  const DAY = 24 * 3600 * 1000;
  const VERSION = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;
  const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const SHA = /^[0-9a-f]{64}$/i;
  // contrôle C0 / DEL / C1, et marques de direction (U+200E/F, U+202A-202E, U+2066-2069) : jamais affichés
  const STRIP = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

  const byteLength = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);

  function versionParts(v) {
    const m = typeof v === 'string' && VERSION.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  // -1 / 0 / 1 ; null si l'une des deux versions n'est pas « chiffres.chiffres.chiffres »
  function compareVersions(a, b) {
    const x = versionParts(a), y = versionParts(b);
    if (!x || !y) return null;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }
  // seule une version STRICTEMENT plus récente est proposée
  const isNewer = (candidate, current) => compareVersions(candidate, current) === 1;

  function validDate(s) {
    const m = typeof s === 'string' && DATE.exec(s);
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    return y >= 2000 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
  }

  // Adresse sûre : https, hôte orical.app ou www.orical.app exactement, ni identifiants, ni port, ni espace / caractère de contrôle.
  // Renvoie l'adresse normalisée, ou null.
  function safeUrl(u) {
    if (typeof u !== 'string' || u.length > 2048 || /[\s\u0000-\u001f\u007f-\u009f\\]/.test(u) || !/^https:\/\//i.test(u)) return null;
    let p;
    try { p = new URL(u); } catch { return null; }
    if (p.protocol !== 'https:' || p.username || p.password || p.port || !HOSTS.includes(p.hostname.toLowerCase())) return null;
    return p.href;
  }

  function cleanNotes(notes) {
    const out = [];
    for (const n of notes) {
      let s = String(n).replace(STRIP, ' ').replace(/ {2,}/g, ' ').trim();
      if (!s) continue;
      if (s.length > MAX_NOTE) s = s.slice(0, MAX_NOTE - 1).trimEnd() + '…';
      out.push(s);
      if (out.length >= MAX_NOTES) break;
    }
    return out;
  }

  const fail = (reason) => ({ ok: false, reason });

  function parse(text) {
    if (typeof text !== 'string') return fail('réponse illisible');
    if (byteLength(text) > MAX_BYTES) return fail('réponse trop grosse');
    let j;
    try { j = JSON.parse(text.replace(/^﻿/, '')); } catch { return fail('JSON invalide'); }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return fail('objet attendu');
    if (j.schema !== 1) return fail('schéma inconnu');
    if (!versionParts(j.version)) return fail('version invalide');
    if (!validDate(j.date)) return fail('date invalide');
    const url = safeUrl(j.url);
    if (!url) return fail('adresse refusée');
    if (typeof j.sha256 !== 'string' || !SHA.test(j.sha256)) return fail('empreinte invalide');
    const notes = j.notes === undefined ? [] : j.notes;
    if (!Array.isArray(notes) || notes.some((n) => typeof n !== 'string')) return fail('notes invalides');
    return { ok: true, info: { version: j.version, date: j.date, url, sha256: j.sha256.toLowerCase(), notes: cleanNotes(notes) } };
  }

  // Une fois par jour au plus. Horloge qui recule (dernière recherche « dans le futur ») : on recherche de nouveau.
  function shouldCheck(now, lastCheck) {
    if (typeof lastCheck !== 'number' || !Number.isFinite(lastCheck)) return true;
    if (now < lastCheck) return true;
    return now - lastCheck >= DAY;
  }
  const ignored = (info, ignoredVersion) => !!(info && ignoredVersion && info.version === ignoredVersion);
  // à proposer : strictement plus récente et non ignorée
  const offer = (info, current, ignoredVersion) => !!(info && isNewer(info.version, current) && !ignored(info, ignoredVersion));

  // Stratégie d'entreprise : sortie de « reg query <clé> /v DisableUpdateCheck » → true si la valeur DWORD vaut 1 (ou plus).
  function policyDisabled(regOutput) {
    const m = /DisableUpdateCheck\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(regOutput || ''));
    return !!m && parseInt(m[1], 16) !== 0;
  }

  return { URL: URL_LATEST, PAGE, HOSTS, MAX_BYTES, MAX_NOTES, MAX_NOTE, DAY, parse, safeUrl, compareVersions, isNewer, validDate, shouldCheck, ignored, offer, policyDisabled };
});
