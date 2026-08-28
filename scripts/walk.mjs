// Walk every page as a logged-in user. Screenshot each. Capture console + failed network.
import { spawn } from 'node:child_process';
import http from 'node:http';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'changeme';
const baseUrl = process.argv[4] || 'http://192.168.1.94:8766';
const w = parseInt(process.argv[5] || '1280', 10);
const h = parseInt(process.argv[6] || '900', 10);
const outDir = process.argv[7] || '/tmp/walk';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 200);
const proc = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--window-size=${w},${h}`,
  `--user-data-dir=/tmp/chrome-walk-${port}`,
  'about:blank'
], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));

const targets = await new Promise((res) => {
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

const consoleMsgs = [];
const failedRequests = [];
const httpResponses = [];

ws.on('message', (msg) => {
  const m = JSON.parse(msg);
  if (m.method === 'Runtime.consoleAPICalled') {
    consoleMsgs.push({
      type: m.params.type,
      text: m.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ')
    });
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push({
      type: 'exception',
      text: m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')
    });
  }
  if (m.method === 'Network.responseReceived') {
    httpResponses.push({
      url: m.params.response.url,
      status: m.params.response.status
    });
  }
  if (m.method === 'Network.loadingFailed') {
    failedRequests.push({
      url: m.params.requestId,
      error: m.params.errorText
    });
  }
});

await new Promise(res => ws.once('open', res));
await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');

const domain = baseUrl.replace(/^https?:\/\//, '').split(':')[0];
await send('Network.setCookie', {
  name: 'bs_session', value: 'pending',
  domain, path: '/', httpOnly: true
});

// login via the form action endpoint
console.log(`[1/9] login as ${username}`);
await send('Page.navigate', { url: `${baseUrl}/login` });
await new Promise(r => setTimeout(r, 1000));
const loginResult = await send('Runtime.evaluate', {
  expression: `
    (async () => {
      const fd = new FormData();
      fd.set('username', ${JSON.stringify(username)});
      fd.set('password', ${JSON.stringify(password)});
      const r = await fetch('/login', { method: 'POST', body: fd, redirect: 'manual' });
      return { status: r.status, location: r.headers.get('location'), setCookie: r.headers.get('set-cookie') };
    })()
  `,
  awaitPromise: true,
  returnByValue: true
});
console.log('  login response:', JSON.stringify(loginResult.result.value, null, 2));

// Now go to / and verify we're logged in
await send('Page.navigate', { url: `${baseUrl}/` });
await new Promise(r => setTimeout(r, 1500));
const afterLogin = await send('Runtime.evaluate', {
  expression: 'document.title + " | " + window.location.href',
  returnByValue: true
});
console.log('  landed on:', afterLogin.result.value);

async function visit(label, url) {
  console.log(`[${label}] GET ${url}`);
  httpResponses.length = 0;
  consoleMsgs.length = 0;
  await send('Page.navigate', { url: `${baseUrl}${url}` });
  await new Promise(r => setTimeout(r, 2000));
  const finalUrl = (await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true })).result.value;
  const title = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value;
  const bodyText = (await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result.value;
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const out = path.join(outDir, `${label}.png`);
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  const errs = httpResponses.filter(r => r.status >= 400);
  const consoleErrs = consoleMsgs.filter(m => m.type === 'error' || m.type === 'exception');
  console.log(`  → ${finalUrl} (${title}) [${fs.statSync(out).size} bytes]`);
  console.log(`  body preview: ${bodyText.slice(0, 200).replace(/\\n/g, ' ').replace(/\\s+/g, ' ').trim()}`);
  if (errs.length) console.log(`  HTTP errors:`, errs);
  if (consoleErrs.length) console.log(`  Console errors:`, consoleErrs);
  return { label, url, finalUrl, title, errs, consoleErrs, bodyText, shotPath: out };
}

const pages = [
  ['2_today', '/'],
  ['3_calendar', '/calendar'],
  ['4_book', '/book'],
  ['5_availability', '/availability'],
  ['6_admin', '/admin'],
  ['7_map', '/map']
];

const results = [];
for (const [label, url] of pages) {
  results.push(await visit(label, url));
}

// job 1 detail (if it exists)
const jobExists = await send('Runtime.evaluate', {
  expression: `fetch('/jobs/1').then(r => r.status)`,
  returnByValue: true,
  awaitPromise: true
});
results.push(await visit('8_job1', '/jobs/1'));

// logout
console.log('[9/9] logout');
const logoutBtn = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out');
      if (btn) { btn.click(); return 'clicked'; }
      return 'not found';
    })()
  `,
  returnByValue: true
});
console.log('  logout:', logoutBtn.result.value);
await new Promise(r => setTimeout(r, 2500));
const afterLogout = await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
console.log('  landed on:', afterLogout.result.value);
const cookiesAfter = await send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
console.log('  cookies after logout:', cookiesAfter.result.value);

// verify auth is gone: try /admin
const adminAfterLogout = await send('Page.navigate', { url: `${baseUrl}/admin` });
await new Promise(r => setTimeout(r, 1500));
const finalAfterLogout = (await send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true })).result.value;
const bodyAfterLogout = (await send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0, 80)', returnByValue: true })).result.value;
console.log('  /admin after logout:', finalAfterLogout, '| body:', bodyAfterLogout.replace(/\n/g, ' '));

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));

ws.close();
proc.kill();
await new Promise(r => setTimeout(r, 200));

console.log('\nDONE. Results in', outDir);
