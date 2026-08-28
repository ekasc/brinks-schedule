import http from 'node:http';
import WebSocket from 'ws';
import fs from 'node:fs';

const cookie = process.argv[2];
const port = 9300 + Math.floor(Math.random() * 100);

const proc = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--window-size=420,1200`,
  `--user-data-dir=/tmp/chrome-probe-${port}`,
  'about:blank'
], { stdio: 'ignore' });

import { spawn } from 'node:child_process';
await new Promise(r => setTimeout(r, 1500));

const targets = await new Promise((res, rej) => {
  http.get(`http://localhost:${port}/json`, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  });
});
const target = targets.find(t => t.type === 'page');
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

// capture console
const consoleMsgs = [];
ws.on('message', (msg) => {
  const m = JSON.parse(msg);
  if (m.method === 'Runtime.consoleAPICalled') {
    consoleMsgs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value || a.description).join(' '));
  }
});

await new Promise(res => ws.once('open', res));
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCookie', { name: 'bs_session', value: cookie, domain: '192.168.1.94', path: '/', httpOnly: true });
await send('Page.enable');
await send('Page.navigate', { url: 'http://192.168.1.94:8766/book' });
await new Promise(r => setTimeout(r, 2500));

// count slot buttons before
const before = await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('button.slot-btn').length`,
  returnByValue: true
});
console.log('BEFORE click:', before.result.value, 'slot buttons');

// find the "1 hr" button by text and click it
const click = await send('Runtime.evaluate', {
  expression: `
    const btns = [...document.querySelectorAll('button.slot-btn')];
    const oneHr = btns.find(b => b.textContent.trim() === '1 hr');
    if (oneHr) {
      oneHr.click();
      JSON.stringify({ found: true, text: oneHr.textContent.trim() });
    } else {
      JSON.stringify({ found: false, allTexts: btns.map(b => b.textContent.trim()).slice(0, 20) });
    }
  `,
  returnByValue: true
});
console.log('CLICK 1hr:', click.result.value);

await new Promise(r => setTimeout(r, 1500));

const after = await send('Runtime.evaluate', {
  expression: `document.querySelectorAll('button.slot-btn').length`,
  returnByValue: true
});
console.log('AFTER click:', after.result.value, 'slot buttons');

const url = await send('Runtime.evaluate', {
  expression: `window.location.href`,
  returnByValue: true
});
console.log('URL after click:', url.result.value);

const selectedDur = await send('Runtime.evaluate', {
  expression: `
    [...document.querySelectorAll('button.slot-btn')].find(b => b.classList.contains('selected'))?.textContent.trim()
  `,
  returnByValue: true
});
console.log('Selected after click:', selectedDur.result.value);

console.log('--- console messages ---');
consoleMsgs.forEach(m => console.log(m));

ws.close();
proc.kill();
await new Promise(r => setTimeout(r, 200));
