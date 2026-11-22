// Icônes embarquées dans un exécutable Windows (PE) : lecture des ressources RT_ICON (3) et RT_GROUP_ICON (14), sans dépendance.
// Sert à vérifier que l'exécutable, l'installeur et la version portable portent bien build/icon.ico (et plus l'ancien logo).
// Usage : node scripts/pe-icons.js "<fichier.exe>" [build/icon.ico]   →  images trouvées, et comparaison avec l'ICO si donné.
const fs = require('fs');
const crypto = require('crypto');

function resources(buf) {
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('pas un fichier PE');
  const nSec = buf.readUInt16LE(pe + 6), optSize = buf.readUInt16LE(pe + 20), opt = pe + 24;
  const dirs = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96);
  const rsrcRva = buf.readUInt32LE(dirs + 2 * 8);
  const secs = [];
  for (let i = 0, s = opt + optSize; i < nSec; i++, s += 40) secs.push({ va: buf.readUInt32LE(s + 12), vsize: buf.readUInt32LE(s + 8), raw: buf.readUInt32LE(s + 20), rawSize: buf.readUInt32LE(s + 16) });
  const off = (rva) => { const s = secs.find((x) => rva >= x.va && rva < x.va + Math.max(x.vsize, x.rawSize)); if (!s) throw new Error('RVA hors section'); return rva - s.va + s.raw; };
  if (!rsrcRva) return [];
  const base = off(rsrcRva), out = [];
  const walk = (at, path) => {
    const n = buf.readUInt16LE(at + 12) + buf.readUInt16LE(at + 14);
    for (let i = 0; i < n; i++) {
      const e = at + 16 + 8 * i, id = buf.readUInt32LE(e), to = buf.readUInt32LE(e + 4);
      const key = id & 0x80000000 ? 'nom' : id;
      if (to & 0x80000000) walk(base + (to & 0x7fffffff), [...path, key]);
      else { const d = base + to; out.push({ path: [...path, key], data: buf.subarray(off(buf.readUInt32LE(d)), off(buf.readUInt32LE(d)) + buf.readUInt32LE(d + 4)) }); }
    }
  };
  walk(base, []);
  return out;
}

// Images RT_ICON (données brutes : PNG ou DIB) et groupes RT_GROUP_ICON (taille de chaque entrée).
function icons(buf) {
  const r = resources(buf);
  const images = r.filter((x) => x.path[0] === 3).map((x) => ({ id: x.path[1], data: x.data }));
  const groups = r.filter((x) => x.path[0] === 14).map((x) => { const d = x.data, c = d.readUInt16LE(4), e = []; for (let i = 0; i < c; i++) e.push({ size: d[6 + 14 * i] || 256, id: d.readUInt16LE(6 + 14 * i + 12) }); return e; });
  return { images, groups };
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// Toutes les images de l'ICO se retrouvent-elles, octet pour octet, parmi les RT_ICON de l'exécutable ?
function compareWithIco(exeBuf, icoEntries) {
  const { images, groups } = icons(exeBuf);
  const have = new Set(images.map((i) => sha(i.data)));
  const missing = icoEntries.filter((e) => !have.has(sha(e.data))).map((e) => e.size);
  return { images: images.length, groups: groups.map((g) => g.map((e) => e.size)), missing, same: missing.length === 0 };
}

module.exports = { resources, icons, compareWithIco };

if (require.main === module) {
  const exe = fs.readFileSync(process.argv[2]);
  const { images, groups } = icons(exe);
  console.log(`${images.length} image(s) RT_ICON ; groupes : ${JSON.stringify(groups.map((g) => g.map((e) => e.size)))}`);
  if (process.argv[3]) {
    const { readIco } = require('./icon-geometry.js');
    const r = compareWithIco(exe, readIco(fs.readFileSync(process.argv[3])));
    console.log(r.same ? 'Toutes les images de l\'ICO sont dans l\'exécutable.' : 'Absentes de l\'exécutable : ' + r.missing.join(', ') + ' px');
    process.exit(r.same ? 0 : 1);
  }
}
