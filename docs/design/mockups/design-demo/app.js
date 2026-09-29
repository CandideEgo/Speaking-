/* =====================================================================
   SPEAKING redesign — static demo interactions
   ===================================================================== */

/* ---------- data ---------- */
const VIDEOS = [
  {t:'How to speak so that people want to listen', ch:'TED · Julian Treasure', dur:'12:08', lvl:'B2', cat:'演讲', seed:'talk-listen', hot:true},
  {t:'The psychology of self-motivation', ch:'TEDx · Scott Geller', dur:'17:24', lvl:'B2', cat:'演讲', seed:'psych-motiv'},
  {t:'A day in the life of a New York chef', ch:'Eater · vlog', dur:'08:51', lvl:'B1', cat:'vlog', seed:'ny-chef'},
  {t:'Inside the mind of a master procrastinator', ch:'TED · Tim Urban', dur:'14:03', lvl:'B2', cat:'演讲', seed:'procrast', hot:true},
  {t:'Steve Jobs 2005 Stanford commencement', ch:'Stanford · speech', dur:'15:01', lvl:'C1', cat:'演讲', seed:'jobs-stan'},
  {t:'Why we sleep — Matthew Walker interview', ch:'Book tour · interview', dur:'22:40', lvl:'C1', cat:'访谈', seed:'sleep-walk'},
  {t:'BBC Newsround: climate explained simply', ch:'BBC · news', dur:'06:12', lvl:'A2', cat:'新闻', seed:'bbc-climate'},
  {t:'The Grand Budapest Hotel — opening scene', ch:'A24 · film', dur:'04:38', lvl:'C1', cat:'影视', seed:'budapest'},
  {t:'Lex Fridman & Yuval Noah Harari on AI', ch:'Lex podcast · long-form', dur:'1:48:22', lvl:'C1', cat:'播客', seed:'lex-harari'},
  {t:'Gordon Ramsay makes the perfect scrambled eggs', ch:'Gordon · vlog', dur:'05:29', lvl:'A2', cat:'vlog', seed:'ramsay-egg', hot:true},
  {t:'Maya Angelou on the power of words', ch:'Archive · interview', dur:'09:17', lvl:'B2', cat:'访谈', seed:'angelou'},
  {t:'The physics of everyday phenomena', ch:'Veritasium · edu', dur:'13:55', lvl:'B2', cat:'播客', seed:'veritasium'},
];

const SUBTITLES = [
  {i:80, en:'The human voice is the most powerful sound in the world.', zh:'人类的声音是世界上最有力的声音。', time:'03:02'},
  {i:81, en:"It's the only one that can start a war or say 'I love you.'", zh:'它是唯一能发动战争，或说"我爱你"的声音。', time:'03:10'},
  {i:82, en:'And yet many people have the experience that when they speak,', zh:'然而很多人都有这样的经历：当他们说话时，', time:'03:18'},
  {i:83, en:'people do not listen.', zh:'别人并不在听。', time:'03:24'},
  {i:84, en:'and the way you say it is just as important as what you say.', zh:'你说话的方式，和你说的内容一样重要。', time:'03:42', cur:true},
  {i:85, en:'This is serious. This is your lifeline.', zh:'这很严肃。这是你的生命线。', time:'03:50'},
  {i:86, en:'Hail, light of the world, light up the world.', zh:'万岁，世界之光，照亮世界。', time:'03:58'},
  {i:87, en:'I would like to suggest that there are a number of habits', zh:'我想提出，有一些习惯', time:'04:06'},
  {i:88, en:'that you need to move away from.', zh:'是你需要远离的。', time:'04:12'},
  {i:89, en:'Gossip. Speaking ill of somebody not present.', zh:'八卦。在背后说人坏话。', time:'04:18'},
];

const WORDS = [
  {w:'important', ph:'/ˌɪmpɔːrˈtant/', pos:'adj.', zh:'重要的', lvl:'B1', st:'due', due:'今天', cat:'考点词', src:'How to speak…', acc:92},
  {w:'procrastinate', ph:'/proʊˈkræstɪneɪt/', pos:'v.', zh:'拖延', lvl:'C1', st:'due', due:'今天', cat:'高频', src:'Tim Urban TED', acc:74},
  {w:'inevitable', ph:'/ɪnˈevɪtəbl/', pos:'adj.', zh:'不可避免的', lvl:'C1', st:'due', due:'今天', cat:'学术', src:'Yuval Harari', acc:68},
  {w:'genuine', ph:'/ˈdʒenjuɪn/', pos:'adj.', zh:'真诚的', lvl:'B2', st:'learn', due:'2天后', cat:'日常', src:'Maya Angelou', acc:55},
  {w:'phenomenon', ph:'/fəˈnɒmɪnən/', pos:'n.', zh:'现象', lvl:'C1', st:'learn', due:'3天后', cat:'学术', src:'Veritasium', acc:61},
  {w:'scrambled', ph:'/ˈskræmbld/', pos:'adj.', zh:'炒（蛋）', lvl:'A2', st:'due', due:'今天', cat:'生活', src:'Gordon Ramsay', acc:80},
  {w:'commencement', ph:'/kəˈmensmənt/', pos:'n.', zh:'毕业典礼', lvl:'C1', st:'master', due:'已掌握', cat:'正式', src:'Jobs Stanford', acc:96},
  {w:'lifeline', ph:'/ˈlaɪflaɪn/', pos:'n.', zh:'生命线', lvl:'B2', st:'learn', due:'4天后', cat:'比喻', src:'Julian Treasure', acc:58},
  {w:'gossip', ph:'/ˈɡɒsɪp/', pos:'n./v.', zh:'八卦', lvl:'B1', st:'due', due:'今天', cat:'日常', src:'Julian Treasure', acc:71},
];

const ACTIVITY = [
  {t:'刚刚', what:'完成第 84 句 take', sub:'How to speak so people listen · 流利度 78', cat:'take', score:86},
  {t:'8 分钟前', what:'收录新词 procrastinate', sub:'Tim Urban TED · 到期 5 天后', cat:'word'},
  {t:'35 分钟前', what:'完成第 83 句 take', sub:'How to speak so people listen · 准确度 90', cat:'take', score:90},
  {t:'今天 09:12', what:'复习 12 个到期词', sub:'掌握 9 个 · 保留率 91%', cat:'review'},
  {t:'昨天 22:40', what:'看完一段 22 分钟访谈', sub:'Why we sleep — Matthew Walker', cat:'watch'},
  {t:'昨天 21:15', what:'完成 8 句 take', sub:'平均分 82 · 连续 14 天', cat:'take', score:82},
  {t:'前天', what:'解锁"连读"徽章', sub:'本周流利度提升 +5', cat:'badge'},
];

/* ---------- helpers ---------- */
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const lvlColor = l => ({A2:'mint',B1:'mint',B2:'signal',C1:'gold'}[l]||'');

function vcard(v){
  return `<div class="vcard" data-go="studio">
    <div class="thumb">
      <img src="https://picsum.photos/seed/${v.seed}/480/270" loading="lazy"/>
      <span class="dur mono">${v.dur}</span>
      <span class="lvl"><span class="tag ${lvlColor(v.lvl)}">${v.lvl}</span></span>
      ${v.hot?'<span style="position:absolute;right:8px;top:8px" class="tag signal">HOT</span>':''}
    </div>
    <div class="body">
      <h4>${v.t}</h4>
      <div class="meta"><span>${v.ch}</span><span>·</span><span>${v.cat}</span></div>
    </div>
  </div>`;
}

/* ---------- view switching ---------- */
const VIEWS = ['onair','library','studio','logbook','lexicon'];
const VIEW_LABEL = {onair:'On Air',library:'Library',studio:'Studio',logbook:'Logbook',lexicon:'Lexicon'};

function go(view){
  VIEWS.forEach(v=>{
    $(`#view-${v}`).classList.toggle('active', v===view);
  });
  $$('.nav-item[data-view]').forEach(n=>n.classList.toggle('active', n.dataset.view===view));
  $('#crumb-view').textContent = VIEW_LABEL[view];
  window.scrollTo({top:0,behavior:'instant'});
  // re-trigger reveal on view
  const vc = $(`#view-${view}`);
  vc.querySelectorAll('.reveal').forEach((el,i)=>{
    el.style.animation='none'; void el.offsetWidth; el.style.animation='';
  });
  // lazy-build per view
  if(view==='library' && !$('#lib-grid').dataset.built) buildLibrary();
  if(view==='logbook' && !$('#heatmap').dataset.built) buildLogbook();
  if(view==='lexicon' && !$('#lex-grid').dataset.built) buildLexicon();
  if(view==='studio' && !$('#sub-list').dataset.built) buildStudio();
}

$$('.nav-item[data-view]').forEach(n=>n.addEventListener('click',()=>go(n.dataset.view)));
$$('[data-go]').forEach(el=>el.addEventListener('click',e=>{
  e.preventDefault(); go(el.dataset.go);
}));

/* ---------- ON AIR: featured + recent ---------- */
function buildOnAir(){
  $('#featured-grid').innerHTML = VIDEOS.slice(0,4).map(vcard).join('');
  $$('#featured-grid [data-go]').forEach(el=>el.addEventListener('click',()=>go('studio')));
  const feed = [
    {u:'林夕', a:'你', act:'录了第 84 句', sc:86, c:'mint', t:'刚刚'},
    {u:'Maya', a:'收录 procrastinate', c:'signal', t:'8 分钟前'},
    {u:'Alex', a:'完成今日 12 词复习', c:'gold', t:'35 分钟前'},
    {u:'小满', a:'看完 22 分钟访谈', c:'plum', t:'1 小时前'},
    {u:'林夕', a:'你', act:'录了第 83 句', sc:90, c:'mint', t:'今天 09:12'},
  ];
  $('#recent-feed').innerHTML = feed.map(f=>`
    <div style="display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;background:var(--ink-880);border:1px solid var(--line-soft)">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--${f.c});box-shadow:0 0 8px var(--${f.c});flex:none"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--cream)"><b style="font-weight:600">${f.u}</b> <span style="color:var(--cream-4)">${f.act||''}</span>${f.sc?` · <span class="mono" style="color:var(--mint)">${f.sc}</span>`:''}</div>
      </div>
      <span class="mono" style="font-size:10.5px;color:var(--cream-5)">${f.t}</span>
    </div>`).join('');
}

/* ---------- LIBRARY ---------- */
function buildLibrary(){
  $('#lib-grid').dataset.built='1';
  $('#lib-grid').innerHTML = VIDEOS.map(vcard).join('');
  $$('#lib-grid [data-go]').forEach(el=>el.addEventListener('click',()=>go('studio')));
  // tab filter demo
  $$('#lib-tabs .tab').forEach(t=>t.addEventListener('click',()=>{
    $$('#lib-tabs .tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
    const cat=t.textContent.trim();
    const list = cat==='全部'?VIDEOS:VIDEOS.filter(v=>v.cat===cat);
    $('#lib-grid').innerHTML = list.map(vcard).join('');
    $$('#lib-grid [data-go]').forEach(el=>el.addEventListener('click',()=>go('studio')));
  }));
}

/* ---------- STUDIO ---------- */
function buildStudio(){
  $('#sub-list').dataset.built='1';
  $('#sub-list').innerHTML = SUBTITLES.map(s=>`
    <div class="srow ${s.cur?'cur':''}" data-i="${s.i}" style="padding:11px 16px 11px 13px;border-radius:9px;cursor:pointer;border-left:3px solid ${s.cur?'var(--signal)':'transparent'};background:${s.cur?'rgba(255,107,53,.06)':'transparent'};transition:.15s;margin:2px 4px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:3px">
        <span class="mono tnum" style="font-size:10.5px;color:${s.cur?'var(--signal-2)':'var(--cream-4)'};min-width:38px">${s.time}</span>
        <span style="font-size:13.5px;line-height:1.45;color:${s.cur?'var(--cream)':'var(--cream-2)'};font-weight:${s.cur?'500':'400'}">${s.en}</span>
      </div>
      <div class="mono" style="font-size:11.5px;color:var(--cream);opacity:.78;padding-left:48px">${s.zh}</div>
    </div>`).join('');
  $$('#sub-list .srow').forEach(r=>r.addEventListener('mouseenter',()=>{if(!r.classList.contains('cur'))r.style.background='var(--ink-880)'}));
  $$('#sub-list .srow').forEach(r=>r.addEventListener('mouseleave',()=>{if(!r.classList.contains('cur'))r.style.background='transparent'}));

  // subtitle modes
  const en = $('#sub-line .w') ? SUBTITLES.find(s=>s.cur).en : '';
  const zhLine = SUBTITLES.find(s=>s.cur).zh;
  $$('#sub-modes .tab').forEach(t=>t.addEventListener('click',()=>{
    $$('#sub-modes .tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
    const m=t.dataset.mode;
    const line=$('#sub-line'), zh=$('#sub-zh');
    if(m==='zh'){ line.style.opacity='.3'; zh.style.cssText='font-size:18px;color:var(--cream);font-family:var(--font-display)'; }
    else if(m==='en'){ line.style.opacity='1'; zh.style.cssText='font-size:13px;color:var(--cream-5);display:none'; }
    else { line.style.opacity='1'; zh.style.cssText='font-size:13px;color:var(--cream-4);display:block'; }
  }));

  // word click → toast
  $$('#sub-line .w').forEach(w=>w.addEventListener('click',()=>{
    w.style.cssText='color:var(--signal-2);background:rgba(255,107,53,.14);border-radius:4px;padding:0 3px';
    toast(`已查询 "${w.textContent.replace(/[.,]/g,'')}" · /音标/ 已载入`);
    setTimeout(()=>w.style.cssText='',900);
  }));

  // record button toggle
  let rec=false, timer=null, t0=0;
  const btn=$('#rec-btn'), wave=$('#rec-wave');
  btn.addEventListener('click',()=>{
    rec=!rec;
    if(rec){
      btn.style.background='var(--rec)'; btn.style.boxShadow='0 0 0 8px rgba(239,68,68,.2),0 8px 26px -8px var(--rec-glow)';
      btn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
      toast('● 录制中… 松开评分');
      wave.querySelectorAll('i').forEach(b=>{b.style.background='var(--signal)';b.classList.add='';});
      wave.classList.add('live-wave');
      t0=Date.now();
      timer=setInterval(()=>{
        const ms=Date.now()-t0;
        const sec=Math.floor(ms/1000);
        $('#rec-time').textContent='00:0'+sec+'.'+(ms%1000+'').padStart(3,'0').slice(0,1);
        wave.querySelectorAll('i').forEach(b=>{b.style.height=(20+Math.random()*70)+'%'});
      },90);
    }else{
      clearInterval(timer);
      btn.style.background='var(--rec)'; btn.style.boxShadow='0 0 0 5px rgba(239,68,68,.16),0 8px 26px -8px var(--rec-glow)';
      btn.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      wave.classList.remove('live-wave');
      wave.querySelectorAll('i').forEach(b=>{b.style.background='var(--ink-650)';b.style.height='';});
      toast('已评分 · 综合 86 · 流利度 +6 ↗');
    }
  });
}

/* ---------- LOGBOOK ---------- */
function buildLogbook(){
  $('#heatmap').dataset.built='1';
  // 7 rows (days) × 12 cols (weeks) — CSS grid for uniform square cells
  const cols=12, rows=7, cell=26, gap=4;
  const heat=[];
  for(let d=0;d<rows*cols;d++){
    const v=Math.random();
    let bg='var(--ink-750)';
    if(v>.85) bg='var(--signal)';
    else if(v>.65) bg='rgba(255,107,53,.6)';
    else if(v>.4) bg='rgba(255,107,53,.3)';
    const c = v>.4 ? Math.floor(v*8) : 0;
    heat.push(`<div title="${c} takes" style="width:${cell}px;height:${cell}px;border-radius:3px;background:${bg};cursor:pointer;transition:.15s"></div>`);
  }
  $('#heatmap').style.cssText=`display:grid;grid-template-columns:repeat(${cols}, ${cell}px);grid-auto-rows:${cell}px;gap:${gap}px;justify-content:center`;
  $('#heatmap').innerHTML=heat.join('');

  // trend svg
  const pts=[];
  for(let i=0;i<30;i++) pts.push(60+Math.sin(i/3)*12+Math.random()*18+i*.5);
  const W=320,H=150, pad=8;
  const max=Math.max(...pts), min=Math.min(...pts);
  const px=i=>pad+i*(W-2*pad)/(pts.length-1);
  const py=v=>H-pad-(v-min)/(max-min)*(H-2*pad);
  let d=pts.map((v,i)=>(i?'L':'M')+px(i).toFixed(1)+' '+py(v).toFixed(1)).join(' ');
  let area=d+` L ${px(pts.length-1)} ${H-pad} L ${px(0)} ${H-pad} Z`;
  $('#trend').innerHTML=`
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b35" stop-opacity=".35"/><stop offset="1" stop-color="#ff6b35" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#g)"/>
    <path d="${d}" fill="none" stroke="#ff6b35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${px(29)}" cy="${py(pts[29])}" r="4" fill="#5eead4"/>
    <circle cx="${px(29)}" cy="${py(pts[29])}" r="8" fill="#5eead4" opacity=".25"/>`;

  // timeline
  const ico={take:'mic',word:'book',review:'rotate',watch:'play',badge:'star'};
  $('#timeline').innerHTML = ACTIVITY.map(a=>`
    <div style="display:flex;align-items:center;gap:14px;padding:13px 6px;border-bottom:1px solid var(--line-soft)">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--ink-880);border:1px solid var(--line);display:grid;place-items:center;color:var(--${a.cat==='take'?'mint':a.cat==='word'?'signal':a.cat==='review'?'gold':a.cat==='badge'?'plum':'cream-3'});flex:none">
        ${({take:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',word:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h7v15M11 4h7v16"/></svg>',review:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/></svg>',watch:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',badge:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6 6.6.6-5 4.4 1.5 6.5L12 16l-6 3.5L7.5 13l-5-4.4 6.6-.6z"/></svg>'})[a.cat]}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;color:var(--cream);font-weight:500">${a.what}${a.score?` <span class="mono" style="color:var(--mint);font-weight:600">· ${a.score}</span>`:''}</div>
        <div style="font-size:12px;color:var(--cream-4);margin-top:1px">${a.sub}</div>
      </div>
      <span class="mono" style="font-size:11px;color:var(--cream-5);white-space:nowrap">${a.t}</span>
    </div>`).join('');
}

/* ---------- LEXICON ---------- */
function buildLexicon(){
  $('#lex-grid').dataset.built='1';
  const stMap={due:{c:'signal',t:'到期'},learn:{c:'gold',t:'学习中'},master:{c:'mint',t:'已掌握'}};
  $('#lex-grid').innerHTML = WORDS.map(w=>{
    const st=stMap[w.st];
    return `<div class="panel" style="padding:18px;cursor:pointer;transition:.18s" onmouseover="this.style.borderColor='var(--line-strong)'" onmouseout="this.style.borderColor='var(--line)'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
        <div>
          <div class="serif" style="font-size:24px;font-weight:500;letter-spacing:-.01em">${w.w}</div>
          <div class="mono" style="font-size:12px;color:var(--cream-4);margin-top:2px">${w.ph} <span style="color:var(--cream-5)">· ${w.pos}</span></div>
        </div>
        <span class="tag ${lvlColor(w.lvl)}">${w.lvl}</span>
      </div>
      <div style="font-size:14px;color:var(--cream-2);margin-bottom:12px">${w.zh}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px">
        <div style="display:flex;gap:6px;align-items:center">
          <span class="tag ${st.c}">${st.t}</span>
          <span class="mono" style="font-size:10.5px;color:var(--cream-4)">${w.due}</span>
        </div>
        ${w.acc?`<span class="mono" style="font-size:11px;color:var(--cream-3)">acc ${w.acc}</span>`:''}
      </div>
      <div style="margin-top:11px;padding-top:11px;border-top:1px solid var(--line-soft);font-size:11.5px;color:var(--cream-3);font-family:var(--font-mono)">↳ ${w.src}</div>
    </div>`;
  }).join('');
  $$('#lex-tabs .tab').forEach(t=>t.addEventListener('click',()=>{
    $$('#lex-tabs .tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  }));
}

/* ---------- toast ---------- */
let toastT;
function toast(msg){
  $('#toast-msg').textContent=msg;
  $('#toast').classList.add('show');
  clearTimeout(toastT);
  toastT=setTimeout(()=>$('#toast').classList.remove('show'),2200);
}

/* ---------- keyboard nav ---------- */
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  const map={'1':'onair','2':'library','3':'studio','4':'logbook','5':'lexicon'};
  if(map[e.key]) go(map[e.key]);
});

/* ---------- init ---------- */
buildOnAir();
