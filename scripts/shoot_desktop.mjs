import { spawn } from 'node:child_process';
import http from 'node:http';
import WebSocket from 'ws';
import fs from 'node:fs';

const cookie = process.argv[2];
const path = process.argv[3];
const out = process.argv[4];
const w = parseInt(process.argv[5] || '1280', 10);
const h = parseInt(process.argv[6] || '720', 10);
const port = 9300 + Math.floor(Math.random() * 100);

const proc = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--window-size=${w},${h}`,
  `--user-data-dir=/tmp/chrome-desktop-${port}`,
  'about:blank'
], { stdio: 'ignore' });

await new Promise(r => setTimeout(r, 1500));

const targets = await new Promise((res, rej) => {
  http.get(`http://localhost:${port}/json`, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  });
});
const target = targets.find(t => t.type === 'page');
if (!target) { console.error('no page target'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const send = (method, params = {}) => new Promise((res, rej) => {
  const myId = ++id;
  const handler = (msg) => {
    const m = JSON.parse(msg);
    if (m.id === myId) { ws.off('message', handler); m.error ? rej(m.error) : res(m.result); }
  };
  ws.on('message', handler);
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await new Promise(res => ws.once('open', res));

await send('Network.enable');
await send('Network.setCookie', {
  name: 'bs_session', value: cookie,
  domain: '192.168.1.94', path: '/', httpOnly: true
});

await send('Page.enable');
await send('Page.navigate', { url: `http://192.168.1.94:8766${path}` });
await new Promise(r => setTimeout(r, 2200));

const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log('shot', out, fs.statSync(out).size, `${w}x${h}`);

ws.close();
proc.kill();
await new Promise(r => setTimeout(r, 200));
