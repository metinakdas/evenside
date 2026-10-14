/*
 * QA KOŞUCUSU — gerçek oturumla, gerçek tarayıcıda.
 *
 * Kullanım: node qa.js <senaryo.js> [url]
 * Senaryo dosyası, sayfada çalışacak bir IIFE döndürür (Promise dönebilir); sonucu metin olarak
 * yazdırılır. Oturum kullanıcının kendi Supabase oturumundan tohumlanır (login.json) —
 * sahte JWT ile RLS'e takılan akışlar (kadro yazma, takım listesi) ancak böyle test edilebilir.
 *
 * Ağ trafiği de toplanıyor: "her açılışta DELETE+POST" gibi hatalar yalnızca istek
 * kaydından görülür.
 */
const cp = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 80);
const scenarioFile = process.argv[2];
const startUrl = process.argv[3] || 'http://localhost:4200/';
const session = JSON.parse(fs.readFileSync('C:/Users/metin/AppData/Local/Temp/login.json', 'utf8'));
// İKİNCİ HESAP taklidi: aynı tarayıcıda başka bir kullanıcı kimliğiyle açmak için.
if (process.env.QA_USER_ID) session.user = { ...session.user, id: process.env.QA_USER_ID, email: 'yeni@ornek.com' };

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
const chrome = cp.spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`, '--window-size=1900,950', 'about:blank']);

const get = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try { target = (await get('/json/list')).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch {}
  }
  if (!target) throw new Error('CDP hedefi yok');

  const WebSocket = require('c:/Users/metin/Desktop/seyirKadro/app/node_modules/ws');
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const requests = [];
  const consoleErrors = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      if (r.url.includes('/rest/v1/')) requests.push(`${r.method} ${r.url.replace(/^https:\/\/[^/]+\/rest\/v1\//, '')}`);
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || a.type).join(' ').slice(0, 200));
    }
  });
  const send = (method, params = {}) => new Promise((res) => {
    const my = ++id; pending.set(my, res); ws.send(JSON.stringify({ id: my, method, params }));
  });

  await new Promise((r) => ws.on('open', r));
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      ${process.env.QA_NO_SESSION ? "//" : ""}localStorage.setItem('sb-gqkwuilixnhhfvjnbnvm-auth-token', ${JSON.stringify(JSON.stringify(session))});
      localStorage.setItem('saha42.intro.skipped', 'true');
      ${process.env.QA_NO_ONBOARDING ? "" : "localStorage.setItem('saha42.onboarding.v1', JSON.stringify({ dismissed: true, snoozedAt: null }));"}
      window.__qaRequests = [];
      ${fs.existsSync(path.join(__dirname, "seed.js")) ? fs.readFileSync(path.join(__dirname, "seed.js"), "utf8") : ""}
    `,
  });

  // MOBİL: gerçek cihaz ölçüsü + dokunmatik (CSS medya sorguları ancak böyle doğru çalışır).
  if (process.env.QA_MOBILE) {
    const [mw, mh] = process.env.QA_MOBILE.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width: mw, height: mh, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await send('Page.navigate', { url: startUrl });
  await sleep(6500);

  const helpers = fs.readFileSync(path.join(__dirname, 'helpers.js'), 'utf8');
  await send('Runtime.evaluate', { expression: helpers });

  // GERÇEK hover: CSS :hover yalnızca gerçek işaretçi olayıyla tetiklenir (JS ile taklit edilemez).
  if (process.env.QA_HOVER) {
    const [hx, hy] = process.env.QA_HOVER.split(',').map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hx, y: hy, buttons: 0 });
    await sleep(700);
  }
  const scenario = fs.readFileSync(path.join(__dirname, scenarioFile), 'utf8');
  const res = await send('Runtime.evaluate', { expression: scenario, returnByValue: true, awaitPromise: true });
  console.log(res.result && res.result.value !== undefined ? res.result.value : JSON.stringify(res).slice(0, 400));

  console.log('\n--- REST istekleri ---\n' + (requests.length ? requests.join('\n') : '(yok)'));
  if (consoleErrors.length) console.log('\n--- konsol hata/uyarı ---\n' + consoleErrors.join('\n'));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'qa.png'), Buffer.from(shot.data, 'base64'));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error('HATA:', e.message); chrome.kill(); process.exit(1); });
