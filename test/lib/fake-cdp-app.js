// Fausse application pour tester les délais du harnais (test/lib/app.js) sans Electron. Lancée par node avec les mêmes arguments
// qu'Electron (--remote-debugging-port=N …). FAKE_CDP_MODE :
//   silent     : n'ouvre aucun port (application qui ne démarre jamais)
//   mute       : /json répond, le WebSocket s'ouvre, aucune commande CDP ne reçoit de réponse
//   stall-eval : répond à tout sauf à Runtime.evaluate (blocage au milieu d'une suite)
// Le processus reste en vie jusqu'à ce que le harnais le tue (vérifié par le test).
const http = require('http');
const crypto = require('crypto');

const mode = process.env.FAKE_CDP_MODE || 'mute';
const port = Number((process.argv.find((a) => a.startsWith('--remote-debugging-port=')) || '').split('=')[1]);
setInterval(() => {}, 60000); // garde le processus en vie

if (mode !== 'silent') {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([{ type: 'page', url: 'file:///faux/index.html', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/1` }]));
  });
  server.on('upgrade', (req, socket) => {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buf = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) { // trames client (masquées) : texte seulement
        if (buf.length < 2) return;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
        const opcode = buf[0] & 0x0f;
        buf = buf.subarray(off + 4 + len);
        if (opcode !== 1 || mode === 'mute') continue;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.method === 'Runtime.evaluate') continue; // stall-eval
        const out = Buffer.from(JSON.stringify({ id: msg.id, result: {} }));
        const head = out.length < 126 ? Buffer.from([0x81, out.length]) : Buffer.from([0x81, 126, out.length >> 8, out.length & 0xff]);
        socket.write(Buffer.concat([head, out]));
      }
    });
  });
  server.listen(port, '127.0.0.1');
}
