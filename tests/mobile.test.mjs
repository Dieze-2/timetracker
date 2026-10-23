import { chromium } from 'playwright';
// Adresses servies par tests/run.mjs (app courante et version d'origine figée).
const NEW = process.env.BASE_URL || 'http://localhost:8811/';
const OLD = process.env.LEGACY_URL || 'http://localhost:8812/';
const CACHE = process.env.CACHE_NAME || 'time-tracker-v4';
const base = { tempsDu:'8.26', pause:'0.34', rows:[{debut:'07:02',fin:'11:58'},{debut:'12:20',fin:''},{debut:'',fin:''}] };
const SC = {
  vide: { data:null, t:'07:38' },
  encours: { data:base, t:'14:05' },
  faites: { data:base, t:'15:31' },
  limite: { data:base, t:'16:06' },
  nuit: { data:{tempsDu:'8.26',pause:'0.34',rows:[{debut:'21:00',fin:'01:30'},{debut:'02:00',fin:''}]}, t:'03:10' },
  clos: { data:{tempsDu:'7.5',pause:'0',rows:[{debut:'08:00',fin:'12:00'},{debut:'13:00',fin:'17:00'}]}, t:'17:30' },
};
const b = await chromium.launch({ args:['--lang=fr-FR'] });
async function open(url, sc, vp, theme) {
  const ctx = await b.newContext({ viewport: vp, locale:'fr-FR', deviceScaleFactor: 2, hasTouch:true, isMobile:true });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.clock.install({ time: new Date(`2026-10-12T${SC[sc].t}:00`) });
  await p.addInitScript(([d,th]) => { if (!sessionStorage.getItem('init')) { localStorage.clear(); if (d) localStorage.setItem('horaireData', JSON.stringify(d)); if (th) localStorage.setItem('theme', th); sessionStorage.setItem('init','1'); } }, [SC[sc].data, theme||'']);
  await p.goto(url); await p.waitForTimeout(400); await p.clock.runFor(1500);
  return { p, ctx, errs };
}
let fail = 0; const ok=(c,m)=>{ if(!c){fail++; console.log('FAIL', m);} };
// 1) Non-régression des chiffres
for (const sc of Object.keys(SC)) {
  const o = await open(OLD, sc, {width:390,height:800}); const n = await open(NEW, sc, {width:390,height:800});
  const ov = await o.p.evaluate(()=>({tot:dureeTravail.textContent, diff:difference.textContent, p:partirHeures.textContent, l:partir9h.textContent, cls:difference.className.includes('positive')}));
  const nv = await n.p.evaluate(()=>({tot:dureeDec.textContent, diff:diffDec.textContent.replace('+',''), p:partirHeures.textContent, l:partir9h.textContent, cls:difference.className.includes('positive'), state:document.documentElement.dataset.state}));
  const same = ov.tot===nv.tot && ov.diff===nv.diff && ov.p===nv.p && ov.l===nv.l && ov.cls===nv.cls;
  console.log(sc, nv.state, same ? 'IDENTIQUE' : 'DIFF', JSON.stringify(ov), JSON.stringify(nv), n.errs.join(';'));
  ok(same, 'calc '+sc); ok(!n.errs.length, 'errors '+sc);
  // stockage identique après chargement
  const os = await o.p.evaluate(()=>localStorage.getItem('horaireData')), ns = await n.p.evaluate(()=>localStorage.getItem('horaireData'));
  { const O=JSON.parse(os), N=JSON.parse(ns); const pick=x=>JSON.stringify({tempsDu:x.tempsDu,pause:x.pause,rows:x.rows});
  ok(pick(O)===pick(N) && N.date==='2026-10-12' && N.veille===null, 'storage '+sc+' '+os+' / '+ns); }
  await o.ctx.close(); await n.ctx.close();
}
// 2) Ouverture : saisie rapide visible sans défiler, débordement, cibles
for (const vp of [{width:360,height:640},{width:390,height:700},{width:360,height:800}]) {
  for (const sc of Object.keys(SC)) for (const th of ['', 'light']) {
    const n = await open(NEW, sc, vp, th);
    const m = await n.p.evaluate(() => {
      const q = document.getElementById('ctaPunch').getBoundingClientRect(), qi = q;
      const small = [...document.querySelectorAll('button, input')].filter(e => { const r=e.getBoundingClientRect(); return r.width && (r.height<43.5||r.width<43.5); }).map(e=>(e.id||e.className)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height));
      const clip = [...document.querySelectorAll('body *')].filter(e => e.scrollWidth > e.clientWidth+1 && !['INPUT','svg','use'].includes(e.tagName) && getComputedStyle(e).overflow!=='visible' && !e.classList.contains('timeline') && !e.classList.contains('cta') && !e.classList.contains('hero') && !e.classList.contains('meter')).map(e=>e.className||e.tagName);
      return { dup: document.querySelectorAll('.info-message').length, lay: document.querySelector('.btn-clear').previousElementSibling.classList.contains('btn-add') && document.querySelector('[data-block=params]').style.order==='4', ov: !document.getElementById('overlapHint').hidden, sw: document.documentElement.scrollWidth, qBottom: Math.max(q.bottom, qi.bottom), small, clip };
    });
    ok(m.dup===0, 'carte info en doublon '+sc); ok(m.lay, 'effacer sous ajouter + paramètres en dernier '+sc); ok(!m.ov, 'fausse alerte chevauchement '+sc); ok(!m.ov, 'fausse alerte chevauchement '+sc); ok(m.sw === vp.width, `overflow ${vp.width} ${sc}`); ok(m.qBottom <= vp.height, `quick sous la ligne de flottaison ${vp.width}x${vp.height} ${sc} ${m.qBottom}`);
    ok(!m.small.length, 'small '+vp.width+'x'+vp.height+' '+sc+' '+th+' '+m.small); ok(!m.clip.length, 'clip '+m.clip);
    if (th==='' ) console.log(`${vp.width}x${vp.height} ${sc}: bas saisie rapide ${Math.round(m.qBottom)} px`);
    if (vp.height!==800 && (sc==='encours'||sc==='vide')) await n.p.screenshot({ path:`fold-${vp.width}-${sc}${th}.png` });
    if (vp.height===800 && th==='' && ['encours','limite'].includes(sc)) await n.p.screenshot({ path:`full-${vp.width}-${sc}.png`, fullPage:true });
    await n.ctx.close();
  }
}
// 3) Fonctions
{
  const n = await open(NEW, 'vide', {width:390,height:800});
  const p = n.p;
  ok(await p.locator('#quickTime').count()===0 && await p.locator('.btn-save').count()===0, 'champ manuel et Sauvegarder retirés');
  ok(/^Pointer entrée · 07:38:\d\d$/.test(await p.textContent('#ctaTxt')), 'libellé entrée: '+await p.textContent('#ctaTxt'));
  const w = await p.evaluate(()=>[ctaPunch.getBoundingClientRect().width, document.querySelector('.hero').getBoundingClientRect().width]);
  ok(w[0] > w[1]-40, 'bouton pleine largeur '+w);
  { const h = await p.evaluate(()=>{ const r=ctaPunch.getBoundingClientRect(); return [r.height, ctaTxt.getBoundingClientRect().height]; });
    ok(h[1] < 30, 'libellé du bouton sur une ligne à 390 '+h); }
  await p.click('#ctaPunch');
  let s = JSON.parse(await p.evaluate(()=>localStorage.getItem('horaireData')));
  ok(s.rows[0].debut==='07:38' && s.rows.length===3, 'pointer entrée '+JSON.stringify(s.rows));
  ok(/^Pointer sortie · 07:38:\d\d$/.test(await p.textContent('#ctaTxt')), 'libellé sortie: '+await p.textContent('#ctaTxt'));
  await p.clock.runFor(4*3600*1000);
  await p.click('#ctaPunch');
  s = JSON.parse(await p.evaluate(()=>localStorage.getItem('horaireData')));
  ok(s.rows[0].fin==='11:38', 'pointer sortie '+JSON.stringify(s.rows));
  ok((await p.textContent('#ctaTxt')).startsWith('Pointer entrée'), 'retour entrée');
  const inp = p.locator('[data-i="2"][data-k="debut"]'); await inp.fill('13:00');
  ok(await inp.evaluate(e=>document.activeElement===e), 'focus conservé après saisie');
  await p.click('.btn-add'); ok((await p.locator('.time-card').count())===4, 'ajout');
  await p.locator('.delete-btn').nth(3).click(); ok((await p.locator('.time-card').count())===3, 'suppression');
  await p.fill('#tempsDu','7'); await p.locator('#tempsDu').blur();
  s = JSON.parse(await p.evaluate(()=>localStorage.getItem('horaireData'))); ok(s.tempsDu==='7', 'temps dû sauvegardé');
  await p.reload(); await p.clock.runFor(1000);
  ok((await p.locator('.time-card').count())===3 && (await p.inputValue('#tempsDu'))==='7', 'rechargement');
  await p.click('#themeBtn'); ok(await p.evaluate(()=>localStorage.getItem('theme'))==='light', 'thème clair');
  await p.click('#themeBtn'); ok(await p.evaluate(()=>localStorage.getItem('theme'))==='', 'thème sombre');
  // Effacer : immédiat, garde les paramètres, annulable
  const before = await p.evaluate(()=>localStorage.getItem('horaireData'));
  await p.click('.btn-clear');
  s = JSON.parse(await p.evaluate(()=>localStorage.getItem('horaireData')));
  ok(s.rows.length===3 && s.rows.every(r=>!r.debut&&!r.fin) && s.tempsDu==='7', 'effacer créneaux, garder params '+JSON.stringify(s));
  ok(await p.locator('#toast.on').count()===1, 'toast annuler visible');
  await p.click('#toastActions button');
  ok(await p.evaluate(()=>localStorage.getItem('horaireData'))===before, 'annuler restaure');
  await p.click('.btn-clear'); await p.clock.runFor(7000);
  ok(await p.locator('#toast.on').count()===0, 'toast disparu');
  await p.reload(); await p.clock.runFor(1000);
  ok((await p.inputValue('#tempsDu'))==='7' && (await p.locator('.time-card').count())===3, 'après effacer + rechargement');
  ok(!n.errs.length, 'errors fonctions '+n.errs);
  ok(!(await p.getAttribute('meta[name=viewport]','content')).includes('user-scalable'), 'zoom');
  ok(await p.evaluate(async()=>{ await document.fonts.ready; return document.fonts.check('700 20px "Bricolage Grotesque"') && document.fonts.check('16px "Instrument Sans"'); }), 'polices');
  await n.ctx.close();
}
// 3a) Minute qui change, y compris si la page se déclare cachée
for (const hidden of [false, true]) {
  const ctx = await b.newContext({ viewport:{width:390,height:800} }); const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-12T14:05:40') });
  if (hidden) await p.addInitScript(()=>{ Object.defineProperty(document,'hidden',{get:()=>true}); Object.defineProperty(document,'visibilityState',{get:()=>'hidden'}); });
  await p.addInitScript(d=>localStorage.setItem('horaireData', JSON.stringify(d)), base);
  await p.goto(NEW); await p.clock.runFor(1000);
  const a = await p.evaluate(()=>[heroSub.textContent, today.textContent, ctaTxt.textContent]);
  await p.clock.runFor(21000);
  const c = await p.evaluate(()=>[heroSub.textContent, today.textContent, ctaTxt.textContent]);
  ok(a[0]!==c[0] && c[1].endsWith('14:06') && /14:06:\d\d$/.test(c[2]), `minute ${hidden?'cachée':'visible'}: ${a} -> ${c}`);
  console.log(`  minute (${hidden?'page déclarée cachée':'visible'}): ${a[0]} -> ${c[0]}`);
  // secondes : défilent chaque seconde, la minute change à :00, même page déclarée cachée
  await p.clock.setSystemTime(new Date('2026-10-12T14:07:57'));
  // Décalé d'une demi-seconde par rapport au minuteur d'une seconde : aucune
  // lecture ne tombe pile sur un tick (cause de l'échec intermittent).
  await p.clock.runFor(1500);
  const s1 = await p.textContent('#ctaClock'); await p.clock.runFor(1000); const s2 = await p.textContent('#ctaClock');
  await p.clock.runFor(2000); const s3 = await p.textContent('#ctaClock');
  ok(/^14:07:5\d$/.test(s1) && s1!==s2 && /^14:08:0\d$/.test(s3), `secondes ${hidden?'cachée':'visible'}: ${s1} ${s2} ${s3}`);
  console.log(`  secondes : ${s1} -> ${s2} -> ${s3}`);
  // 8 lectures à 1 s d'intervalle, phase quelconque : secondes strictement consécutives
  { await p.clock.runFor(337); const seen=[]; for (let k=0;k<8;k++){ await p.clock.runFor(1000); seen.push(await p.textContent('#ctaClock')); }
    const sec = seen.map(x=>{ const [h,m,s]=x.split(':').map(Number); return h*3600+m*60+s; });
    ok(sec.every((v,k)=>k===0||v-sec[k-1]===1), `secondes consécutives ${hidden?'cachée':'visible'}: ${seen.join(' ')}`); }
  ok((await p.getAttribute('#ctaPunch','aria-label')).match(/\d\d:\d\d$/) && !(await p.getAttribute('#ctaPunch','aria-label')).match(/:\d\d:\d\d$/), 'aria-label à la minute');
  await ctx.close();
}
// 3c) Chevauchement (données réelles, 12/10 13:26)
{
  const fab = [{debut:'06:27',fin:'09:11'},{debut:'09:30',fin:'12:13'},{debut:'09:44',fin:''}];
  for (const [rowsC, expectOv, expectSub] of [
    [fab, true, /heures faites/],
    [[fab[0], fab[1], {debut:'12:44',fin:''}], false, /encore 1 h 46/],
    [[{debut:'07:00',fin:'12:00'},{debut:'12:00',fin:''}], false, null],
  ]) {
    const ctx = await b.newContext({ viewport:{width:390,height:800} }); const p = await ctx.newPage();
    await p.clock.install({ time: new Date('2026-10-12T13:26:00') });
    await p.addInitScript(d=>localStorage.setItem('horaireData', JSON.stringify(d)), {tempsDu:'8.26',pause:'0.34',rows:rowsC});
    await p.goto(NEW); await p.clock.runFor(1500);
    const m = await p.evaluate(()=>({ hint: !overlapHint.hidden, txt: overlapTxt.textContent, cards:[...document.querySelectorAll('.time-card.overlap')].length, sub: heroSub.textContent, partir: partirHeures.textContent, row3: document.querySelectorAll('.time-card .warn-line')[2]?.textContent.trim(), sw: document.documentElement.scrollWidth }));
    ok(m.sw===390 && m.hint===expectOv && (expectOv ? m.cards===2 : m.cards===0) && (!expectSub || expectSub.test(m.sub)), 'chevauchement '+JSON.stringify(m));
    console.log('  ', JSON.stringify(rowsC.map(r=>r.debut+'-'+r.fin)), '->', m.partir, '|', m.sub, '|', m.hint ? m.txt : 'pas d\'alerte', m.row3 ? '| ligne 3: '+m.row3 : '');
    if (expectOv) { await p.screenshot({ path:'overlap-390.png', fullPage:true }); }
    await ctx.close();
  }
  // 360 px : alerte affichée, pas de débordement, bouton toujours sans défilement à 640
  const ctx = await b.newContext({ viewport:{width:360,height:640} }); const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-12T13:26:00') });
  await p.addInitScript(d=>localStorage.setItem('horaireData', JSON.stringify(d)), {tempsDu:'8.26',pause:'0.34',rows:fab});
  await p.goto(NEW); await p.clock.runFor(1500);
  const q = await p.evaluate(()=>[document.documentElement.scrollWidth, ctaPunch.getBoundingClientRect().bottom]);
  ok(q[0]===360 && q[1]<=640, 'chevauchement 360x640 '+q); console.log('   360x640 avec alerte : bas du bouton', Math.round(q[1]), 'px');
  await p.screenshot({ path:'overlap-360-fold.png' });
  await ctx.close();
}
// 3d) Nouvelle journée, veille, correction du pointage, manifest
{
  const mk = async (time, data) => {
    const ctx = await b.newContext({ viewport:{width:360,height:740} }); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.clock.install({ time: new Date(time) });
    await p.addInitScript(d=>{ if (!sessionStorage.getItem('i')) { localStorage.setItem('horaireData', JSON.stringify(d)); sessionStorage.setItem('i','1'); } }, data);
    await p.goto(NEW); await p.clock.runFor(1500);
    return { ctx, p, errs, store: async()=>JSON.parse(await p.evaluate(()=>localStorage.getItem('horaireData'))) };
  };
  const fab = [{debut:'06:27',fin:'09:11'},{debut:'09:30',fin:'12:13'},{debut:'12:44',fin:'15:20'}];
  // ouverture le lendemain
  let t = await mk('2026-10-13T07:10:00', {tempsDu:'8.26',pause:'0.34',rows:fab,date:'2026-10-12'});
  let st = await t.store();
  ok(st.rows.every(r=>!r.debut&&!r.fin) && st.date==='2026-10-13' && st.veille?.date==='2026-10-12' && st.veille.rows.length===3, 'nouvelle journée '+JSON.stringify(st));
  const v = await t.p.evaluate(()=>({ shown: !document.querySelector('[data-block=veille]').hidden, title: prevTitle.textContent, total: prevTotal.textContent, diff: prevDiff.textContent, n: prevList.children.length, toast: !!document.querySelector('#toast.on'), msg: toastTxt.textContent }));
  await t.p.waitForTimeout(800); await t.p.screenshot({ path:'newday-toast-360.png' });
  ok(v.shown && v.title==='Hier' && v.total==='8 h 03' && v.diff==='+0 h 08' && v.n===3 && v.toast, 'bloc Hier '+JSON.stringify(v));
  console.log('   lendemain :', JSON.stringify(v));
  await t.p.screenshot({ path:'newday-360.png', fullPage:true });
  await t.p.click('#toastActions button');
  st = await t.store();
  ok(st.rows[0].debut==='06:27' && st.veille==null && st.date==='2026-10-13', 'annuler nouvelle journée '+JSON.stringify(st));
  await t.p.reload(); await t.p.clock.runFor(1500); st = await t.store();
  ok(st.rows[0].debut==='06:27', 'pas de 2e remise à zéro le même jour');
  ok(!t.errs.length, 'erreurs nouvelle journée '+t.errs); await t.ctx.close();
  // titre si la veille date de plusieurs jours
  t = await mk('2026-10-15T07:10:00', {tempsDu:'8.26',pause:'0.34',rows:fab,date:'2026-10-12'});
  ok((await t.p.textContent('#prevTitle'))==='Journée précédente · lundi 12 octobre', 'titre jour ancien: '+await t.p.textContent('#prevTitle')); await t.ctx.close();
  // créneau de nuit ouvert : rien
  t = await mk('2026-10-13T02:00:00', {tempsDu:'8.26',pause:'0.34',rows:[{debut:'22:00',fin:''}],date:'2026-10-12'});
  st = await t.store(); ok(st.rows[0].debut==='22:00' && !st.veille, 'créneau ouvert, pas de remise à zéro'); await t.ctx.close();
  // anciennes données sans date : rien
  t = await mk('2026-10-13T07:10:00', {tempsDu:'8.26',pause:'0.34',rows:fab});
  st = await t.store(); ok(st.rows[0].debut==='06:27' && st.date==='2026-10-13', 'sans date, rien vidé'); await t.ctx.close();
  // app ouverte pendant minuit
  t = await mk('2026-10-12T23:59:20', {tempsDu:'8.26',pause:'0.34',rows:fab,date:'2026-10-12'});
  await t.p.clock.runFor(60000); st = await t.store();
  ok(st.rows.every(r=>!r.debut) && st.veille?.date==='2026-10-12', 'minuit app ouverte'); await t.ctx.close();
  // correction du pointage
  t = await mk('2026-10-12T12:20:00', {tempsDu:'8.26',pause:'0.34',rows:[{debut:'07:00',fin:''}],date:'2026-10-12'});
  await t.p.click('#ctaPunch');
  ok((await t.p.textContent('#toastTxt'))==='Sortie 12:20', 'toast pointage '+await t.p.textContent('#toastTxt'));
  const btns = t.p.locator('#toastActions button');
  ok((await btns.count())===2 && (await btns.nth(0).boundingBox()).height>=43.5, 'boutons correction 44 px');
  await btns.nth(0).click(); st = await t.store(); ok(st.rows[0].fin==='12:15', '−5 min '+st.rows[0].fin);
  await btns.nth(1).click(); st = await t.store(); ok(st.rows[0].fin==='12:00' && (await t.p.textContent('#toastTxt'))==='Sortie 12:00', '−15 min '+st.rows[0].fin);
  const tb = await t.p.evaluate(()=>{ const r=toast.getBoundingClientRect(); return [r.left, r.right, document.documentElement.scrollWidth]; });
  ok(tb[0]>=0 && tb[1]<=360 && tb[2]===360, 'toast dans l\'écran à 360 '+tb);
  await t.p.screenshot({ path:'punchfix-360.png' });
  await t.p.clock.runFor(9000); ok(await t.p.locator('#toast.on').count()===0, 'toast correction expire');
  await t.ctx.close();
  // sortie jamais avant l'entrée
  t = await mk('2026-10-12T07:05:00', {tempsDu:'8.26',pause:'0.34',rows:[{debut:'07:00',fin:''}],date:'2026-10-12'});
  await t.p.click('#ctaPunch'); await t.p.locator('#toastActions button').nth(1).click(); st = await t.store();
  ok(st.rows[0].fin==='07:05', 'sortie pas avant entrée '+st.rows[0].fin); await t.ctx.close();
  // l'ancienne version lit le nouveau format (retour arrière possible)
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await p.clock.install({ time: new Date('2026-10-12T13:26:00') });
    await p.addInitScript(d=>localStorage.setItem('horaireData', JSON.stringify(d)), {tempsDu:'8.26',pause:'0.34',rows:[fab[0],fab[1],{debut:'12:44',fin:''}],date:'2026-10-12',veille:{date:'2026-10-11',tempsDu:'8.26',pause:'0.34',rows:fab}});
    await p.goto(OLD); await p.waitForTimeout(300);
    ok((await p.textContent('#partirHeures'))==='15:12', 'ancienne version lit le nouveau format'); await ctx.close();
  }
  // installabilité (Chrome) + précache
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await p.goto(NEW); await p.waitForTimeout(2500); await p.reload(); await p.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(p);
    const ie = await cdp.send('Page.getInstallabilityErrors');
    const man = await cdp.send('Page.getAppManifest');
    ok(ie.installabilityErrors.length===0, 'installable '+JSON.stringify(ie.installabilityErrors));
    ok(!man.errors?.length, 'manifest sans erreur '+JSON.stringify(man.errors));
    const cached = await p.evaluate(async(CACHE)=>{ const c = await caches.open(CACHE); return (await c.keys()).map(r=>new URL(r.url).pathname); }, CACHE);
    ok(cached.includes('/icons/icon-512.png') && cached.includes('/manifest.json'), 'précache '+cached);
    console.log('   installabilité :', ie.installabilityErrors.length ? JSON.stringify(ie.installabilityErrors) : 'aucune erreur', '| précache :', cached.length, 'fichiers');
    await ctx.close();
  }
}
// 3e) Compteur d'heures (calcul en centièmes d'heure, chaque créneau arrondi au plus proche)
{
  const mk = async (time, data, vp={width:360,height:740}) => {
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.clock.install({ time: new Date(time) });
    await p.addInitScript(d=>{ if (!sessionStorage.getItem('i')) { localStorage.setItem('horaireData', JSON.stringify(d)); sessionStorage.setItem('i','1'); } }, data);
    await p.goto(NEW); await p.clock.runFor(1500);
    return { ctx, p, errs, store: async()=>JSON.parse(await p.evaluate(()=>localStorage.getItem('horaireData'))) };
  };
  const read = p => p.evaluate(()=>({ val: cntVal.textContent, hm: cntHm.textContent, cls: cntVal.className, chip: cntChip.textContent, proj: cntProjTxt.textContent, sw: document.documentElement.scrollWidth }));
  const fix = async (p, txt, sign) => { await p.click('#cntFixBtn'); if (sign) await p.click(sign); await p.fill('#cntDec', txt); await p.click('#cntEditor .btn-ok'); await p.clock.runFor(1000); };
  // 06:27-09:11 = 164 min = 2.7333 → 2.73 ; 09:30-12:13 = 163 min = 2.7167 → 2.72 ; 12:44-15:20 = 156 min = 2.60
  const fab = [{debut:'06:27',fin:'09:11'},{debut:'09:30',fin:'12:13'},{debut:'12:44',fin:'15:20'}];
  const P = {tempsDu:'8.26',pause:'0.34'};
  // affichage : 12.75 ; projection à 14:00 avec 12:44 ouvert (76 min = 1.27) : 2.73 + 2.72 + 1.27 + 0.34 − 8.26 = −1.20 → 11.55
  let t = await mk('2026-10-15T14:00:00', {...P, rows:[fab[0],fab[1],{debut:'12:44',fin:''}], date:'2026-10-15', compteur:{cent:1275, month:'2026-10'}});
  let m = await read(t.p);
  ok(m.val==='+12.75' && m.hm==='12 h 45' && m.cls.includes('c-norm') && m.chip==='dans la plage' && m.proj==='+11.55 (11 h 33)' && m.sw===360, 'compteur affichage '+JSON.stringify(m));
  console.log('   compteur :', JSON.stringify(m));
  await t.p.locator('#counterCard').screenshot({ path:'counter-360.png' });
  // correction décimale, exemple de l'entreprise : 29.83 = 29 h 50
  await fix(t.p, '29.83', '#cntPlus'); let st = await t.store(); m = await read(t.p);
  ok(st.compteur.cent===2983 && m.val==='+29.83' && m.hm==='29 h 50' && m.cls.includes('c-high') && m.chip==='au-dessus de 20 h', 'correction 29.83 '+JSON.stringify(m));
  await t.p.locator('#counterCard').screenshot({ path:'counter-360-high.png' });
  // négatif tapé avec un signe moins et une virgule
  await fix(t.p, '-2,25'); st = await t.store(); m = await read(t.p);
  ok(st.compteur.cent===-225 && m.val==='−2.25' && m.hm==='−2 h 15' && m.cls.includes('c-neg') && m.chip==='en négatif', 'correction −2,25 '+JSON.stringify(m));
  await t.p.locator('#counterCard').screenshot({ path:'counter-360-neg.png' });
  await t.p.reload(); await t.p.clock.runFor(1500); m = await read(t.p);
  ok(m.val==='−2.25', 'correction conservée');
  // bouton − puis valeur positive
  await fix(t.p, '3.5', '#cntMinus'); st = await t.store(); ok(st.compteur.cent===-350, 'signe par bouton '+st.compteur.cent);
  await fix(t.p, '20', '#cntPlus'); m = await read(t.p); ok(m.val==='+20.00' && m.cls.includes('c-norm'), '20.00 pile = normal');
  // saisie invalide : refusée, message, rien d'enregistré
  await t.p.click('#cntFixBtn'); await t.p.fill('#cntDec', '12.345'); await t.p.click('#cntEditor .btn-ok');
  const inv = await t.p.evaluate(()=>({ open: !cntEditor.hidden, err: cntConv.classList.contains('err'), msg: cntConv.textContent }));
  st = await t.store(); ok(inv.open && inv.err && st.compteur.cent===2000, 'saisie invalide refusée '+JSON.stringify(inv));
  await t.p.fill('#cntDec', '29.83'); ok((await t.p.textContent('#cntConv'))==='= 29 h 50', 'conversion en direct');
  ok(!t.errs.length, 'erreurs compteur '+t.errs); await t.ctx.close();
  // nouvelle journée : 2.73 + 2.72 + 2.60 + 0.34 − 8.26 = +0.13 → 12.88
  t = await mk('2026-10-16T07:00:00', {...P, rows:fab, date:'2026-10-15', compteur:{cent:1275, month:'2026-10'}});
  st = await t.store(); m = await read(t.p);
  ok(st.compteur.cent===1288 && m.val==='+12.88' && m.hm==='12 h 53', 'ajout journée '+JSON.stringify(st.compteur));
  await t.p.click('#toastActions button'); st = await t.store();
  ok(st.compteur.cent===1275 && st.rows[0].debut==='06:27', 'annuler retire l\'ajout '+JSON.stringify(st.compteur)); await t.ctx.close();
  // arrondi PAR CRÉNEAU (et non du total) : 07:02-12:13 = 5.1833 → 5.18 ; 12:44-15:46 = 3.0333 → 3.03
  // Σ = 8.21 + 0.34 − 8.26 = +0.29 (l'arrondi du total exact 8.2167 → 8.22 aurait donné +0.30)
  t = await mk('2026-10-16T07:00:00', {...P, rows:[{debut:'07:02',fin:'12:13'},{debut:'12:44',fin:'15:46'}], date:'2026-10-15', compteur:{cent:0, month:'2026-10'}});
  st = await t.store(); ok(st.compteur.cent===29, 'arrondi par créneau '+st.compteur.cent); await t.ctx.close();
  // créneau qui passe minuit : 22:00-01:30 = 3.50
  t = await mk('2026-10-16T07:00:00', {...P, rows:[{debut:'22:00',fin:'01:30'}], date:'2026-10-15', compteur:{cent:0, month:'2026-10'}});
  st = await t.store(); ok(st.compteur.cent===350+34-826, 'passage de minuit '+st.compteur.cent); await t.ctx.close();
  // journée vide : rien
  t = await mk('2026-10-16T07:00:00', {...P, rows:[{debut:'',fin:''}], date:'2026-10-15', compteur:{cent:1275, month:'2026-10'}});
  st = await t.store(); ok(st.compteur.cent===1275, 'journée vide n\'ajoute rien'); await t.ctx.close();
  // 1er du mois : 31 ajouté PUIS plafond. 07:00-16:12 = 9.20 + 0.34 − 8.26 = +1.28 ; 19.90 + 1.28 = 21.18 → 20.00
  t = await mk('2026-11-01T07:00:00', {...P, rows:[{debut:'07:00',fin:'16:12'}], date:'2026-10-31', compteur:{cent:1990, month:'2026-10'}});
  st = await t.store(); ok(st.compteur.cent===2000 && st.compteur.month==='2026-11', 'plafond après ajout '+JSON.stringify(st.compteur));
  await t.p.click('#toastActions button'); st = await t.store(); ok(st.compteur.cent===1990 && st.compteur.month==='2026-10', 'annuler retire aussi le plafond '+JSON.stringify(st.compteur)); await t.ctx.close();
  // ouverture tardive (le 3) sans créneau : plafond quand même
  t = await mk('2026-11-03T07:00:00', {...P, rows:[{debut:'',fin:''}], date:'2026-10-30', compteur:{cent:2325, month:'2026-10'}});
  st = await t.store(); ok(st.compteur.cent===2000, 'plafond ouverture tardive '+JSON.stringify(st.compteur)); await t.ctx.close();
  // sous 20.00 : inchangé ; négatif : inchangé
  for (const v of [1833, -500]) {
    t = await mk('2026-11-02T07:00:00', {...P, rows:[{debut:'',fin:''}], date:'2026-10-30', compteur:{cent:v, month:'2026-10'}});
    st = await t.store(); ok(st.compteur.cent===v && st.compteur.month==='2026-11', 'pas de plafond '+v); await t.ctx.close();
  }
  // même mois : pas de plafond même au-dessus
  t = await mk('2026-10-16T07:00:00', {...P, rows:[{debut:'',fin:''}], date:'2026-10-15', compteur:{cent:2500, month:'2026-10'}});
  st = await t.store(); ok(st.compteur.cent===2500, 'pas de plafond en cours de mois'); await t.ctx.close();
  // migration de l'ancien format en minutes : 765 min → 12.75 ; 1790 min → 29.83
  for (const [mins, cent, txt] of [[765, 1275, '+12.75'], [1790, 2983, '+29.83'], [-135, -225, '−2.25']]) {
    t = await mk('2026-10-15T09:00:00', {...P, rows:fab, date:'2026-10-15', compteur:{minutes:mins, month:'2026-10'}});
    m = await read(t.p); st = await t.store();
    ok(m.val===txt && st.compteur.cent===cent && st.compteur.minutes===undefined, `migration ${mins} min → ${JSON.stringify(st.compteur)} ${m.val}`); await t.ctx.close();
  }
  // anciennes données sans compteur
  t = await mk('2026-10-15T09:00:00', {...P, rows:fab});
  m = await read(t.p); st = await t.store(); ok(m.val==='0.00' && st.compteur.cent===0 && !t.errs.length, 'données sans compteur '+JSON.stringify(m)); await t.ctx.close();
  // grand écran : pas de débordement
  t = await mk('2026-10-15T14:00:00', {...P, rows:fab, date:'2026-10-15', compteur:{cent:1275, month:'2026-10'}}, {width:1280,height:800});
  ok((await read(t.p)).sw===1280, 'compteur 1280'); await t.ctx.close();
  // ancienne version lit le nouveau format
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await p.clock.install({ time: new Date('2026-10-15T13:26:00') });
    await p.addInitScript(d=>localStorage.setItem('horaireData', JSON.stringify(d)), {...P, rows:[fab[0],fab[1],{debut:'12:44',fin:''}], date:'2026-10-15', compteur:{cent:1275,month:'2026-10'}});
    await p.goto(OLD); await p.waitForTimeout(300);
    ok((await p.textContent('#partirHeures'))==='15:12', 'ancienne version + compteur'); await ctx.close();
  }
}
// 3b) Cohérence rebours / anneau / état (bug « encore 8 h 41 »)
{
  const cases = [
    { rows:[{debut:'13:08',fin:''}], t:'12:22', expect:/créneau prévu à 13:08, encore 7 h 55/ },
    { rows:[{debut:'07:00',fin:'12:00'},{debut:'12:30',fin:'17:00'},{debut:'17:30',fin:''}], t:'12:22', expect:/heures déjà faites/ },
    { rows:[{debut:'07:00',fin:'12:00'},{debut:'12:30',fin:''}], t:'16:30', expect:/heures faites depuis 1 h 05/ },
    { rows:[{debut:'07:00',fin:'12:00'},{debut:'12:30',fin:''}], t:'14:00', expect:/encore 1 h 25/ },
    { rows:[{debut:'21:00',fin:'01:30'},{debut:'02:00',fin:''}], t:'03:10', expect:/encore 2 h 15/ },
  ];
  for (const c of cases) {
    const ctx = await b.newContext({ viewport:{width:390,height:800} }); const p = await ctx.newPage();
    await p.clock.install({ time: new Date(`2026-10-12T${c.t}:00`) });
    await p.addInitScript(d=>localStorage.setItem('horaireData', JSON.stringify(d)), {tempsDu:'8.26',pause:'0.34',rows:c.rows});
    await p.goto(NEW); await p.waitForTimeout(200); await p.clock.runFor(1500);
    const sub = await p.textContent('#heroSub'), pct = +(await p.textContent('#ringPct')), st = await p.evaluate(()=>document.documentElement.dataset.state);
    const coherent = sub.includes('encore') ? (pct < 100 && st!=='faites') : (pct >= 100);
    ok(c.expect.test(sub) && coherent, `cohérence ${c.t}: "${sub}" ${pct}% ${st}`);
    console.log(`  ${c.t} ${JSON.stringify(c.rows.map(r=>r.debut+'-'+r.fin))}: ${sub} | ${pct}% | ${st}`);
    await ctx.close();
  }
}
// 4) Reduced motion : valeurs finales immédiates
{
  const ctx = await b.newContext({ viewport:{width:390,height:800}, reducedMotion:'reduce' }); const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-12T14:05:00') });
  await p.addInitScript(d=>{localStorage.setItem('horaireData', JSON.stringify(d));}, base);
  await p.goto(NEW); await p.waitForTimeout(100);
  ok((await p.textContent('#dureeTravail'))==='4 h 56', 'reduced: total immédiat '+await p.textContent('#dureeTravail'));
  const anim = await p.evaluate(()=>getComputedStyle(document.querySelector('.hero')).animationName + '|' + getComputedStyle(document.querySelector('.aurora')).animationName);
  ok(anim==='none|none', 'reduced: pas d\'animation '+anim);
  await ctx.close();
}
console.log(fail ? `${fail} ÉCHEC(S)` : 'TOUT VERT'); process.exitCode = fail ? 1 : 0;
await b.close();
