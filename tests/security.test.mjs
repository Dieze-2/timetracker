import { chromium } from 'playwright';
// Adresses servies par tests/run.mjs (app courante et version d'origine figée).
const NEW = process.env.BASE_URL || 'http://localhost:8811/';
const OLD = process.env.LEGACY_URL || 'http://localhost:8812/';
const CACHE = process.env.CACHE_NAME || 'time-tracker-v4';
const URL_ = NEW;
const b = await chromium.launch(); let fail=0; const ok=(c,m)=>{ if(!c){fail++; console.log('FAIL',m);} else console.log('ok  ',m); };
const pay = '<img src=x onerror="window.__pwn=1">';
// 1. Injection via le stockage
{
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs=[], csp=[];
  p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await p.addInitScript(([pay])=>localStorage.setItem('horaireData', JSON.stringify({
    tempsDu: '8.26"><img src=x onerror="window.__pwn=2">', pause: '0.34',
    rows:[{debut:pay, fin:'12:00'},{debut:'07:00', fin:pay},null,'x'],
    date:'2026-10-16', veille:{date:pay, tempsDu:'8.26', pause:'0.34', rows:[{debut:pay,fin:pay}]},
    compteur:{cent:1275, month:pay} })), [pay]);
  await p.goto(URL_); await p.waitForTimeout(800);
  const r = await p.evaluate(()=>({ pwn: window.__pwn, imgs: document.querySelectorAll('img[src="x"]').length, rows: JSON.parse(localStorage.getItem('horaireData')).rows, veille: JSON.parse(localStorage.getItem('horaireData')).veille, month: JSON.parse(localStorage.getItem('horaireData')).compteur.month, du: document.getElementById('tempsDu').value }));
  ok(r.pwn===undefined && r.imgs===0, 'aucune exécution ni balise injectée '+JSON.stringify({pwn:r.pwn,imgs:r.imgs}));
  ok(JSON.stringify(r.rows)===JSON.stringify([{debut:'',fin:'12:00'},{debut:'07:00',fin:''}]), 'créneaux nettoyés '+JSON.stringify(r.rows));
  ok(r.veille===null && /^\d{4}-\d\d$/.test(r.month) && r.du==='8.26', 'veille / mois / temps dû nettoyés '+JSON.stringify([r.veille,r.month,r.du]));
  ok(!errs.length, 'pas d\'erreur JS '+errs); await ctx.close();
}
// 2. Stockage corrompu
{
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('horaireData','{pas du json'));
  await p.goto(URL_); await p.waitForTimeout(600);
  ok(!errs.length && await p.locator('.time-card').count()===3 && await p.locator('#ctaPunch').isVisible(), 'stockage corrompu : app utilisable '+errs);
  await ctx.close();
}
// 3. CSP : rien de légitime bloqué ; une sortie externe l'est
{
  const ctx = await b.newContext(); const p = await ctx.newPage(); const csp=[];
  p.on('console', m=>{ if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  await p.goto(URL_); await p.waitForTimeout(2500);
  const r = await p.evaluate(async()=>{ await document.fonts.ready; return { fonts: document.fonts.check('700 20px "Bricolage Grotesque"'), sw: !!(await navigator.serviceWorker.getRegistration()) }; });
  ok(!csp.length && r.fonts && r.sw, 'CSP sans blocage légitime '+JSON.stringify(r)+' '+csp.join(' | '));
  const blocked = await p.evaluate(()=>fetch('https://example.com/').then(()=>'parti',()=>'bloqué'));
  ok(blocked==='bloqué', 'fetch externe bloqué par la CSP : '+blocked);
  const cdp = await ctx.newCDPSession(p); const ie = await cdp.send('Page.getInstallabilityErrors');
  ok(ie.installabilityErrors.length===0, 'toujours installable '+JSON.stringify(ie.installabilityErrors));
  await ctx.close();
}
// 4. Service worker : une 404 ne remplace pas l'app hors ligne
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(URL_); await p.waitForTimeout(2500); await p.reload(); await p.waitForTimeout(1000);
  ok(await p.evaluate(()=>!!navigator.serviceWorker.controller), 'page contrôlée par le SW');
  const r404 = await p.goto(URL_+'nexiste-pas'); ok(r404.status()===404, '404 servie');
  await p.waitForTimeout(500);
  const cached = await p.evaluate(async(CACHE)=>{ const c=await caches.open(CACHE); const r=await c.match('./index.html'); return r ? [r.status, (await r.text()).includes('ctaPunch')] : null; }, CACHE);
  ok(cached && cached[0]===200 && cached[1], 'index en cache intact après une 404 '+JSON.stringify(cached));
  await ctx.setOffline(true);
  await p.goto(URL_).catch(()=>{}); await p.waitForTimeout(500);
  ok(await p.locator('#ctaPunch').count()===1, 'app hors ligne après une 404');
  await ctx.close();
}
console.log(fail ? fail+' ÉCHEC(S)' : 'TOUT VERT'); process.exitCode = fail ? 1 : 0; await b.close();
