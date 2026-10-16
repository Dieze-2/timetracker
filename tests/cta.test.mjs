import { chromium } from 'playwright';
// Adresses servies par tests/run.mjs (app courante et version d'origine figée).
const NEW = process.env.BASE_URL || 'http://localhost:8811/';
const OLD = process.env.LEGACY_URL || 'http://localhost:8812/';
const CACHE = process.env.CACHE_NAME || 'time-tracker-v4';
const b = await chromium.launch(); let bad=0;
for (const w of [360,390,1024,1280]) for (const th of ['','light']) {
  const p = await b.newPage({ viewport:{width:w,height:740} });
  await p.clock.install({ time:new Date('2026-10-16T14:58:47') });
  await p.addInitScript(([th])=>{ localStorage.setItem('theme',th); localStorage.setItem('horaireData', JSON.stringify({tempsDu:'8.26',pause:'0.34',date:'2026-10-16',rows:[{debut:'07:00',fin:'12:00'},{debut:'12:30',fin:''}],compteur:{minutes:0,month:'2026-10'}})); }, [th]);
  await p.goto(NEW); await p.clock.runFor(1500);
  const m = await p.evaluate(()=>({ txt: ctaTxt.textContent, h: ctaTxt.getBoundingClientRect().height, sw: document.documentElement.scrollWidth }));
  if (m.h >= 30 || m.sw !== w) { bad++; console.log('FAIL', w, th, JSON.stringify(m)); }
  if (w===360 && th==='') await p.locator('#ctaPunch').screenshot({ path:'cta-360.png' });
  await p.close();
}
console.log(bad ? 'ÉCHEC' : 'TOUT VERT'); process.exitCode = bad ? 1 : 0; await b.close();
