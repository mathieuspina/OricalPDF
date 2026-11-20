// Restauration des annotations modifiables dans un Web Worker (l'interface ne se fige pas, même sur un PDF de plusieurs centaines de pages) :
// { bytes (ArrayBuffer, octets du fichier, déchiffrés s'il était protégé) } → résultat de EditablePdf.read (voir src/editable-pdf.js).
// Annulation (« Ouvrir sans les annotations modifiables ») : le renderer termine le worker.
/* eslint-env worker */
importScripts('../../vendor/pdf-lib/pdf-lib.min.js');
importScripts('../editable-state.js');
importScripts('../editable-pdf.js');

self.onmessage = async (e) => {
  try {
    const r = await self.EditablePdf.read(self.PDFLib, new Uint8Array(e.data.bytes));
    const transfer = [];
    if (r.base) { r.base = r.base.buffer.slice(r.base.byteOffset, r.base.byteOffset + r.base.byteLength); transfer.push(r.base); }
    for (const im of Object.values(r.images || {})) { im.bytes = im.bytes.buffer.slice(im.bytes.byteOffset, im.bytes.byteOffset + im.bytes.byteLength); transfer.push(im.bytes); }
    self.postMessage(r, transfer);
  } catch (err) {
    self.postMessage({ status: 'fallback', reason: 'lecture', message: String(err && err.message || err) });
  }
};
