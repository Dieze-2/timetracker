import { chromium } from 'playwright';
// Adresses servies par tests/run.mjs (app courante et version d'origine figée).
const NEW = process.env.BASE_URL || 'http://localhost:8811/';
const OLD = process.env.LEGACY_URL || 'http://localhost:8812/';
const CACHE = process.env.CACHE_NAME || 'time-tracker-v4';
const base = { tempsDu:'8.26', pause:'0.34', date:'2026-10-12', compteur:{cent:1275,month:'2026-10'}, rows:[{debut:'06:27',fin:'09:11'},{debut:'09:30',fin:'12:13'},{debut:'12:44',fin:''}],
  veille:{date:'2026-10-11',tempsDu:'8.26',pause:'0.34',rows:[{debut:'07:00',fin:'12:00'},{debut:'12:30',fin:'16:10'}]} };
const b = await chromium.launch(); let fail=0; const ok=(c,m)=>{ if(!c){fail++; console.log('FAIL',m);} };
for (const [w,h] of [[1024,768],[1280,800],[1440,900],[1920,1080],[900,800]]) for (const t of ['14:05','16:20']) for (const th of ['','light']) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} }); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({ time: new Date(`2026-10-12T${t}:00`) });
  await p.addInitScript(([d,th])=>{ localStorage.setItem('horaireData', JSON.stringify(d)); localStorage.setItem('theme', th); }, [base, th]);
  await p.goto(NEW); await p.clock.runFor(1500); await p.waitForTimeout(1200);
  const m = await p.evaluate(()=>{
    const hero=document.querySelector('.hero').getBoundingClientRect(), blocks=document.querySelector('.blocks').getBoundingClientRect();
    const order=[...document.querySelectorAll('.blocks > [data-block]')].filter(e=>!e.hidden).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top||a.getBoundingClientRect().left-b.getBoundingClientRect().left).map(e=>e.dataset.block);
    const whyShown=[...document.querySelectorAll('.why')].some(e=>getComputedStyle(e).display!=='none');
    const cnt=document.getElementById('counterCard').getBoundingClientRect(); const inSide=!!document.querySelector('.side #counterCard'), inMain=!!document.querySelector('[data-block=chiffres] #counterCard');
    return { inSide, inMain, under: cnt.top >= hero.bottom && cnt.right <= blocks.left, sw: document.documentElement.scrollWidth, side: hero.right <= blocks.left, cta: ctaPunch.getBoundingClientRect().bottom, order, whyShown, state: document.documentElement.dataset.state };
  });
  const desk = w >= 1024;
  ok(m.sw===w, `overflow ${w}`); ok(!errs.length, 'errors '+errs);
  if (desk) {
    ok(m.inSide && !m.inMain && m.under, `compteur sous le héros ${w}x${h} ${JSON.stringify([m.inSide,m.inMain,m.under])}`);
    ok(m.side, `deux colonnes ${w}`); ok(m.cta <= h, `CTA visible ${w}x${h} ${m.cta}`);
    ok(JSON.stringify(m.order)===JSON.stringify(['frise','chiffres','creneaux','veille','params']), `ordre fixe ${w} ${t} ${m.order}`);
    ok(!m.whyShown, 'pastilles masquées');
    await p.mouse.wheel(0, 1500); await p.waitForTimeout(300);
    const after = await p.evaluate(()=>{ const r=ctaPunch.getBoundingClientRect(); return [r.top, r.bottom, scrollY]; });
    ok(after[2] > 0 ? (after[0] >= 0 && after[1] <= h) : true, `héros collant après défilement ${w}x${h} ${after}`);
    await p.evaluate(()=>scrollTo(0,0));
  }
  if (!desk) ok(m.inMain && !m.inSide, `compteur dans le tableau de bord ${w}`);
  if (desk && th==='' && t==='14:05') {
    await p.click('#cntFixBtn'); await p.waitForTimeout(200);
    await p.evaluate(()=>scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(400);
    const okb = await p.evaluate(()=>{ const r=document.querySelector('#cntEditor .btn-ok').getBoundingClientRect(); return [r.top, r.bottom, innerHeight]; });
    ok(okb[0] >= 0 && okb[1] <= okb[2], `bouton Enregistrer atteignable ${w}x${h} ${okb}`);
    await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(300);
    const top = await p.evaluate(()=>ctaPunch.getBoundingClientRect().bottom);
    ok(top <= h, `pointage visible en haut avec saisie ouverte ${w}x${h}`);
    if (w===1280) await p.screenshot({ path:'desk-cnt-edit.png' });
  }
  console.log(`${w}x${h} ${t} ${th||'dark'} ${m.state}: 2 col=${m.side} ordre=${m.order.join(',')} cta=${Math.round(m.cta)}`);
  if (th==='' && (w===1280||w===1440) && t==='14:05') await p.screenshot({ path:`desk-${w}.png` });
  if (th==='light' && w===1280 && t==='16:20') await p.screenshot({ path:`desk-${w}-light.png`, fullPage:true });
  await ctx.close();
}
console.log(fail ? fail+' ÉCHEC(S)' : 'TOUT VERT'); process.exitCode = fail ? 1 : 0; await b.close();
