// Annotations « modifiables » : écriture du flux de contenu DÉDIÉ et de l'état (appelé par pdf-edit.applyEdits), lecture et retrait à la
// réouverture (appelé par js/editable-worker.js). Format de l'état : voir editable-state.js. Fonctionne dans le renderer, un worker et Node.
//
// ÉCRITURE (pdf-edit) : begin() AVANT tout dessin d'objet : pour chaque page concernée, relevé des clés de ressources (Font, XObject,
// ExtGState) puis ouverture d'un flux NEUF (/OricalPDF BMC) ; pdf-lib ajoute ses ressources AVANT d'ouvrir son flux, d'où le relevé préalable
// (sinon une entrée en trop à chaque enregistrement). end() : EMC, clés ajoutées, empreinte SHA-256 du flux (contenu non compressé), images
// (page + clé de ressource) ; le flux est ensuite « détaché » (un dessin ultérieur, aplatissement de formulaire par exemple, va dans un autre flux).
// LECTURE : tout est vérifié AVANT la moindre modification (nombre de pages, flux retrouvé par son empreinte) ; repli sinon. Le retrait
// (flux, enveloppe q / Q ajoutée par pdf-lib, clés de ressources, champs créés, clé du catalogue) est écrit en mise à jour INCRÉMENTALE : base =
// octets reçus + section ajoutée (les objets devenus inutiles restent dans la base : pdf-edit les supprime au prochain enregistrement, `purge`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./editable-state.js'));
  else root.EditablePdf = factory(root.EditableState);
})(typeof self !== 'undefined' ? self : this, function (ES) {
  'use strict';

  const RES = ['Font', 'XObject', 'ExtGState'];

  function keysOf(PDFLib, node, n) {
    const res = node.Resources();
    const d = res && res.lookupMaybe(PDFLib.PDFName.of(n), PDFLib.PDFDict);
    return d ? d.keys().map((k) => k.asString()) : [];
  }

  // indices : pages qui recevront des objets ou une numérotation.
  function begin(PDFLib, doc, indices) {
    const pages = doc.getPages();
    const recs = [];
    for (const i of [...new Set(indices)].sort((a, b) => a - b)) {
      const pg = pages[i];
      if (!pg) continue;
      pg.node.normalize();
      const res0 = {}; for (const n of RES) res0[n] = keysOf(PDFLib, pg.node, n);
      const cs = pg.getContentStream(false);
      cs.push(PDFLib.beginMarkedContent(ES.TAG));
      recs.push({ i, pg, cs, res0 });
    }
    return { recs };
  }

  // images : { [imgId]: PDFImage intégrée } → { streams, images: { [imgId]: { mime, page, key } } }.
  async function end(PDFLib, doc, sess, images, mimes) {
    const streams = [];
    const imgOut = {};
    const want = new Map(Object.entries(images || {}).map(([id, im]) => [im.ref.toString(), id]));
    for (const r of sess.recs) {
      r.cs.push(PDFLib.endMarkedContent());
      const added = {};
      for (const n of RES) { const now = keysOf(PDFLib, r.pg.node, n); added[n] = now.filter((k) => !r.res0[n].includes(k)); }
      const xo = r.pg.node.Resources().lookupMaybe(PDFLib.PDFName.of('XObject'), PDFLib.PDFDict);
      for (const k of added.XObject) {
        const v = xo && xo.get(PDFLib.PDFName.of(k.replace(/^\//, '')));
        const id = v && want.get(v.toString());
        if (id && !imgOut[id]) imgOut[id] = { mime: mimes[id], page: r.i, key: k };
      }
      streams.push({ i: r.i, hash: await ES.sha256(r.cs.getUnencodedContents()), added });
      r.pg.contentStream = undefined; // flux détaché : un dessin ultérieur ouvre un autre flux
      r.pg.contentStreamRef = undefined;
    }
    return { streams, images: imgOut };
  }

  function writeState(PDFLib, doc, state) {
    const bytes = new TextEncoder().encode(ES.serialize(state));
    const s = doc.context.flateStream(bytes, { Type: ES.TYPE, V: ES.VERSION });
    doc.catalog.set(PDFLib.PDFName.of(ES.KEY), doc.context.register(s));
  }

  // ------------------------------------------------------------------ lecture
  function decode(PDFLib, s) {
    if (s instanceof PDFLib.PDFRawStream) return PDFLib.decodePDFRawStream(s).decode();
    if (typeof s.getUnencodedContents === 'function') return s.getUnencodedContents();
    return s.getContents();
  }
  const textOf = (bytes) => { let t = ''; for (let i = 0; i < bytes.length && i < 64; i++) t += String.fromCharCode(bytes[i]); return t.trim(); };

  // PNG (mêmes pixels) depuis une image intégrée par pdf-lib : 8 bits, DeviceRGB ou DeviceGray, masque /SMask facultatif.
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function deflate(bytes) {
    const cs = new CompressionStream('deflate');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(await out);
  }
  async function pngOf(PDFLib, ctx, s) {
    const { PDFName } = PDFLib;
    const d = s.dict;
    const num = (k) => { const v = d.lookup(PDFName.of(k)); return v ? v.asNumber() : 0; };
    const W = num('Width'), H = num('Height'), bpc = num('BitsPerComponent');
    const csName = String(d.lookup(PDFName.of('ColorSpace')) || '');
    const ch = csName === '/DeviceRGB' ? 3 : csName === '/DeviceGray' ? 1 : 0;
    if (!W || !H || bpc !== 8 || !ch) return null;
    const px = decode(PDFLib, s);
    const sm = d.lookup(PDFName.of('SMask'));
    const alpha = sm ? decode(PDFLib, sm) : null;
    if (px.length < W * H * ch || (alpha && alpha.length < W * H)) return null;
    const oc = ch + (alpha ? 1 : 0);
    const raw = new Uint8Array(H * (1 + W * oc));
    for (let y = 0; y < H; y++) {
      let o = y * (1 + W * oc) + 1;
      for (let x = 0; x < W; x++) { const p = (y * W + x) * ch; for (let c = 0; c < ch; c++) raw[o++] = px[p + c]; if (alpha) raw[o++] = alpha[y * W + x]; }
    }
    const chunk = (type, data) => { const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer); dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8); dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out; };
    const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, W); dv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = ch === 3 ? (alpha ? 6 : 2) : (alpha ? 4 : 0);
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0; for (const p of parts) { out.set(p, k); k += p.length; }
    return { bytes: out, w: W, h: H };
  }

  // Valeur actuelle d'un champ créé (elle a pu être saisie dans un autre lecteur), au format de doc.form.values (voir forms.js).
  function fieldValue(PDFLib, form, name) {
    let f; try { f = form.getField(name); } catch { return undefined; }
    try {
      if (f instanceof PDFLib.PDFTextField) return f.getText() || '';
      if (f instanceof PDFLib.PDFCheckBox) return f.isChecked();
      if (f instanceof PDFLib.PDFRadioGroup) return f.getSelected() || '';
      if (f instanceof PDFLib.PDFDropdown) return f.getSelected()[0] || '';
      if (f instanceof PDFLib.PDFOptionList) return f.getSelected();
    } catch { /* valeur illisible */ }
    return undefined;
  }

  // → { status: 'none' } | { status: 'fallback', reason } | { status: 'ok', state, base, images: { [imgId]: { mime, bytes, w, h } }, values }
  async function read(PDFLib, bytes) {
    const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef } = PDFLib;
    if (!ES.detect(bytes)) return { status: 'none' };
    let doc;
    try { doc = await PDFDocument.load(bytes, { updateMetadata: false, forIncrementalUpdate: true, throwOnInvalidObject: false }); } catch { return { status: 'fallback', reason: 'lecture' }; }
    const ctx = doc.context;
    const sref = doc.catalog.get(PDFName.of(ES.KEY));
    const ss = sref && ctx.lookup(sref);
    if (!ss || !ss.dict) return { status: 'none' }; // marqueur présent mais état non rattaché (fichier fusionné, copie de pages…) : PDF ordinaire
    let parsed;
    try { parsed = ES.parse(new TextDecoder().decode(decode(PDFLib, ss))); } catch { parsed = { ok: false, reason: 'corrompu' }; }
    if (!parsed.ok) return { status: 'fallback', reason: parsed.reason };
    const state = parsed.state;
    const pages = doc.getPages();
    if (pages.length !== state.pages) return { status: 'fallback', reason: 'pages' };

    // 1. vérifications (aucune modification) : chaque flux dédié retrouvé par son empreinte
    const plan = [];
    for (const r of state.streams) {
      const node = pages[r.i].node;
      const arr = node.lookup(PDFName.of('Contents'));
      if (!(arr instanceof PDFArray)) return { status: 'fallback', reason: 'flux' };
      const items = arr.asArray();
      const dec = items.map((it) => { const s = ctx.lookup(it); return s && s.dict ? decode(PDFLib, s) : null; });
      let at = -1;
      for (let k = items.length - 1; k >= 0 && at < 0; k--) if (dec[k] && (await ES.sha256(dec[k])) === r.hash) at = k;
      if (at < 0) return { status: 'fallback', reason: items.length > 1 ? 'empreinte' : 'flux' };
      let keep = items.map((it, k) => ({ it, t: dec[k] ? textOf(dec[k]) : '' })).filter((_, k) => k !== at);
      if (keep.length >= 3 && keep[0].t === 'q' && keep[keep.length - 1].t === 'Q') keep = keep.slice(1, -1); // enveloppe ajoutée par pdf-lib
      plan.push({ r, node, page: pages[r.i], list: keep.map((x) => x.it) });
    }

    // 2. images (avant le retrait de leurs clés)
    const images = {};
    for (const [id, im] of Object.entries(state.images || {})) {
      try {
        const xo = pages[im.page].node.Resources().lookup(PDFName.of('XObject'), PDFDict);
        const s = xo.lookup(PDFName.of(im.key.replace(/^\//, '')));
        if (im.mime === 'image/jpeg') {
          const w = s.dict.lookup(PDFName.of('Width')).asNumber(), h = s.dict.lookup(PDFName.of('Height')).asNumber();
          images[id] = { mime: 'image/jpeg', bytes: s instanceof PDFLib.PDFRawStream ? s.contents.slice() : decode(PDFLib, s), w, h };
        } else { const p = await pngOf(PDFLib, ctx, s); if (p) images[id] = Object.assign({ mime: 'image/png' }, p); }
      } catch { /* image illisible : l'objet restera sans image (signalé par l'interface) */ }
    }

    // 3. champs créés : valeurs actuelles, puis retrait du formulaire et des pages
    const snap = doc.takeSnapshot();
    const mark = (ref) => { if (ref instanceof PDFRef) snap.markRefForSave(ref); };
    const values = {};
    if (state.fields && state.fields.length) {
      let form = null; try { form = doc.getForm(); } catch { form = null; }
      const acroRef = doc.catalog.get(PDFName.of('AcroForm'));
      const acro = acroRef && ctx.lookup(acroRef, PDFDict);
      const fieldsRaw = acro && acro.get(PDFName.of('Fields'));
      const fields = fieldsRaw && ctx.lookup(fieldsRaw, PDFArray);
      if (fields) {
        const widgetRefs = new Set();
        for (const name of state.fields) {
          if (form) { const v = fieldValue(PDFLib, form, name); if (v !== undefined) values[name] = v; }
          for (let k = fields.size() - 1; k >= 0; k--) {
            const fref = fields.get(k); const fd = ctx.lookup(fref, PDFDict);
            const t = fd && fd.lookup(PDFName.of('T'));
            if (!t || t.decodeText() !== name) continue;
            const kids = fd.lookup(PDFName.of('Kids'));
            if (kids instanceof PDFArray) kids.asArray().forEach((x) => widgetRefs.add(x.toString())); else widgetRefs.add(fref.toString());
            fields.remove(k);
          }
        }
        mark(acroRef); mark(fieldsRaw);
        for (const pg of pages) {
          const aRaw = pg.node.get(PDFName.of('Annots'));
          const annots = aRaw && ctx.lookup(aRaw, PDFArray);
          if (!annots) continue;
          let changed = false;
          for (let k = annots.size() - 1; k >= 0; k--) if (widgetRefs.has(annots.get(k).toString())) { annots.remove(k); changed = true; }
          if (changed) { mark(aRaw); mark(pg.ref); }
        }
      }
    }

    // 4. retrait des flux dédiés et des ressources ajoutées
    for (const p of plan) {
      p.node.set(PDFName.of('Contents'), ctx.obj(p.list));
      mark(p.page.ref);
      const resRaw = p.node.get(PDFName.of('Resources'));
      mark(resRaw);
      const res = p.node.Resources();
      for (const n of RES) {
        const raw = res.get(PDFName.of(n));
        const d = raw && ctx.lookup(raw, PDFDict);
        if (!d) continue;
        for (const k of p.r.added[n] || []) d.delete(PDFName.of(k.replace(/^\//, '')));
        mark(raw);
      }
    }
    doc.catalog.delete(PDFName.of(ES.KEY));
    mark(ctx.trailerInfo.Root);
    const inc = await doc.saveIncremental(snap);
    const base = new Uint8Array(bytes.length + inc.length);
    base.set(bytes, 0); base.set(inc, bytes.length);
    return { status: 'ok', state, base, images, values };
  }

  return { begin, end, writeState, read };
});
