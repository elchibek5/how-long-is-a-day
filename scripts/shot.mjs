// Headless-Chrome screenshots over CDP, no dependencies (Node 22 has WebSocket).
// Usage:
//   node scripts/shot.mjs <url> <outPrefix> [target ...] [--w=1440] [--h=900] [--wait=2500]
// A target is a CSS selector (scrolls it to the top of the viewport), a pixel
// offset like 1800, or a percentage like 50% of the page. Default: top of page.
// Prints console errors and exceptions so broken modules show up immediately.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const [url, outPrefix, ...targets] = args.filter((a) => !a.startsWith('--'));
if (!url || !outPrefix) {
  console.error('usage: node scripts/shot.mjs <url> <outPrefix> [target ...] [--w=1440] [--h=900] [--wait=2500]');
  process.exit(1);
}
const W = Number(flags.w || 1440);
const H = Number(flags.h || 900);
const WAIT = Number(flags.wait || 2500);
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shot-'))}`,
    '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${W},${H}`, 'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let target;
  for (let i = 0; i < 50; i++) {
    try {
      target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      break;
    } catch { await sleep(150); }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') console.log('EXCEPTION:', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      console.log(`CONSOLE ${msg.params.type}:`, msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') console.log('LOG error:', msg.params.entry.text, msg.params.entry.url || '');
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await send('Page.navigate', { url });
  await sleep(WAIT);
  if (flags.eval) {
    const r = await send('Runtime.evaluate', { expression: flags.eval, returnByValue: true, awaitPromise: true });
    console.log('EVAL:', JSON.stringify(r.result?.result?.value ?? r.result, null, 1));
  }
  const list = targets.length ? targets : ['0'];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const expr = /^\d+$/.test(t)
      ? `window.scrollTo(0, ${t})`
      : /^\d+%$/.test(t)
        ? `window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * ${parseFloat(t) / 100})`
        : `(() => { const el = document.querySelector(${JSON.stringify(t)}); if (!el) return 'missing'; window.scrollTo(0, el.getBoundingClientRect().top + scrollY); })()`;
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.result?.result?.value === 'missing') console.log(`target not found: ${t}`);
    await sleep(Number(flags.settle || 1400));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = `${outPrefix}-${String(i).padStart(2, '0')}.png`;
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log('saved', file);
  }
  ws.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => chrome.kill());
