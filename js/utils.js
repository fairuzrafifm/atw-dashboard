// ============================================================
//  ATW Solar Dashboard — js/utils.js
//  Helper functions: DOM, format, storage, sanitize, ID utils
//  Harus dimuat PERTAMA sebelum semua modul lain
// ============================================================

// ── DOM & FORMAT HELPERS ────────────────────────────────────
// ===============================================================
// UTILS
// ===============================================================
const $=id=>document.getElementById(id);
const sv=(id,v)=>{const e=$(id);if(e)e.value=v;};
const gv=id=>$(id)?.value||'';
const show=id=>$(id)?.classList.add('open');

// Format tanggal \u2014 handle ISO string, locale string, date object
function fmtDate(d){
  if(!d)return '\u2014';
  try{
    // Jika sudah format yang readable (misal "28/4/2026" atau "28 Apr 2026"), return as-is
    if(typeof d==='string'&&!d.includes('T')&&!d.includes('-'))return d;
    const dt=new Date(d);
    if(isNaN(dt.getTime()))return String(d).slice(0,10);
    return dt.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
  }catch(e){return String(d).slice(0,10);}
}
// cm() defined below in auth section
function cm(t){
  const m={addProj:'ov-addProj',updProgress:'ov-updProgress',inputMp:'ov-inputMp',
    addAccident:'ov-addAccident',editWeather:'ov-editWeather',addIssue:'ov-addIssue',
    addProc:'ov-addProc',addCost:'ov-addCost',gsConfig:'ov-gsConfig',import:'ov-import',
    editMpLog:'ov-editMpLog',editHist:'ov-editHist',editAcc:'ov-editAcc',
    changePw:'ov-changePw',scPlan:'ov-scPlan',scActual:'ov-scActual',scManage:'ov-scManage',
    wbsAddCat:'ov-wbsAddCat',wbsAddSub:'ov-wbsAddSub',wbsAddItem:'ov-wbsAddItem',
    wbsProgress:'ov-wbsProgress',wbsPlan:'ov-wbsPlan',wbsActual:'ov-wbsActual',wbsEdit:'ov-wbsEdit',wbsDaily:'ov-wbsDaily',
    drQtySetup:'ov-drQtySetup',drInput:'ov-drInput',weeklyReport:'ov-weeklyReport',mpReport:'ov-mpReport',
    addRabKat:'ov-addRabKat',addRabItem:'ov-addRabItem'};
  $(m[t]||'ov-'+t)?.classList.remove('open');
}
function rv(inp,dv,bv){
  const v=$(inp).value;
  if(dv)$(dv).textContent=v+'%';
  if(bv)$(bv).style.width=v+'%';
}
function saveLocal(ts,fromGS=false){
  try{localStorage.setItem('atw_data',JSON.stringify({P,I:ISS,PR:PROC,M:MPLOGS,A:ACCLOGS,SC:SCURVE,WB:WBS,CO:COSTS,RB:RAB,ts:ts||Date.now(),fromGS:fromGS}));}catch(e){}
}
function loadLocal(){
  try{
    const raw=localStorage.getItem('atw_data');
    if(!raw)return false;
    const d=JSON.parse(raw);
    // Deteksi data corrupt \u2014 jika ada object di field string, bersihkan
    const rawProc=d.PR||[];
    const isCorrupt=rawProc.some(p=>typeof p.due==='object'||typeof p.supplier==='object'||typeof p.notes==='object'||typeof p.item==='object');
    if(isCorrupt){
      console.warn('Data corrupt terdeteksi di localStorage \u2014 membersihkan...');
      localStorage.removeItem('atw_data');
      return false; // paksa load dari GSheet
    }
    // Sanitasi semua data
    P=sanitizeProjects(d.P||[]);
    ISS=sanitizeIssues(d.I||[]);
    PROC=sanitizeProc(d.PR||[]);
    MPLOGS=sanitizeMpLogs(d.M||[]);
    ACCLOGS=sanitizeAccLogs(d.A||[]);
    SCURVE=d.SC||[];
    const _pf=v=>{if(!v||v==='[object Object]')return{};if(typeof v==='object')return v;try{return JSON.parse(v);}catch(e){return{};}};
    const _pa=v=>{if(!v||v==='[object Object]')return[];if(Array.isArray(v))return v;try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch(e){return[];}};
    const _pd=v=>{if(!v)return'';const s=String(v);return s.includes('T')?s.slice(0,10):s.trim();};
    const _rawWbs=(d.WB||[]).map(w=>({...w,bobot:+w.bobot||0,cumActual:+w.cumActual||0,cumPlan:+w.cumPlan||0,weeklyData:_pf(w.weeklyData),weeklyPlan:_pf(w.weeklyPlan),dailyLogs:_pa(w.dailyLogs),qtyPlan:w.qtyPlan!=null&&w.qtyPlan!==''?+w.qtyPlan:null,qtySatuan:w.qtySatuan||'',startDate:_pd(w.startDate),finishDate:_pd(w.finishDate)}));
    // Deduplicate by id
    const _wbsMap=new Map();_rawWbs.forEach(w=>_wbsMap.set(String(w.id),w));
    WBS=[..._wbsMap.values()].map(w=>({...w,id:String(w.id),projId:String(w.projId),parentId:w.parentId!=null&&w.parentId!==''?String(w.parentId):null}));
    COSTS=sanitizeCosts(d.CO||[]);
    RAB=sanitizeRab(d.RB||[]);
    (d.P||[]).forEach(lp=>{const p=P.find(x=>x.id==lp.id);if(p&&Array.isArray(lp.history))p.history=lp.history;});
    // Re-sync WBS -> project plan/actual
    syncAllWbsToProjects();
    return P.length>0;
  }catch(e){
    localStorage.removeItem('atw_data'); // hapus data rusak
    return false;
  }
}
// Recalculate plan/actual for ALL projects from WBS data
function syncAllWbsToProjects(){
  if(!WBS||!WBS.length)return;
  // First: auto-fix orphaned WBS projIds
  // If a WBS node's projId doesn't match any project, try to find correct project
  const validProjIds=new Set(P.map(p=>String(p.id)));
  WBS.forEach(w=>{
    if(!validProjIds.has(String(w.projId))){
      // Try numeric match
      const match=P.find(p=>+p.id===+w.projId);
      if(match){w.projId=match.id;return;}
      // If only 1 project exists, assign to it
      if(P.length===1){w.projId=P[0].id;}
    }
  });
  P.forEach(proj=>{
    const projId=proj.id;
    const all=WBS.filter(w=>String(w.projId)===String(projId));
    if(!all.length)return;
    const leaves=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
    if(!leaves.length)return;
    // Recalculate cumActual dari dailyLogs (source of truth) before using it
    leaves.forEach(node=>{
      const dl=node.dailyLogs||[];
      if(+node.qtyPlan>0&&dl.length>0){
        const totalQty=dl.reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
        const newCum=Math.min(100,Math.round(totalQty/node.qtyPlan*10000)/100);
        if(newCum>0)node.cumActual=newCum;
      }
    });
    // cAct: use cumActual as source of truth (set by _syncDailyToProject or manual WBS update)
    const cAct=leaves.reduce((s,n)=>s+(+n.bobot||0)*(+n.cumActual||0)/100,0);
    const cPlan=leaves.reduce((s,n)=>{
      const wp=n.weeklyPlan||{};
      const cum=Math.min(100,Object.keys(wp).reduce((ss,k)=>ss+(+(wp[k].wPlan||0)),0));
      return s+(+n.bobot||0)*cum/100;
    },0);
    if(cAct>0||cPlan>0){
      proj.actual=Math.round(cAct*10)/10;
      if(cPlan>0)proj.plan=Math.round(cPlan*10)/10;
    }
    // Always sync S-Curve jika ada WBS data (cumActual sudah valid)
    syncWbsToSCurve(projId);
    // Chart di-refresh oleh renderWBS() saat tab aktif, tidak perlu di sini
  });
}

function dirty(){
  isDirty=true;
  $('sdot').classList.add('unsaved');
  $('smsg').textContent='Perubahan belum disimpan \u2014 Ctrl+S';
  $('sbar').classList.add('dirty');
  saveLocal(Date.now()); // timestamp = saat data diubah
  if(typeof updateNotif==='function')updateNotif();
}
function clean(f){
  isDirty=false;curFile=f||curFile;
  $('sdot').classList.remove('unsaved');
  $('smsg').textContent='Tersimpan '+new Date().toLocaleTimeString('id-ID');
  $('flabel').textContent=curFile||'\u2014';
  $('sbar').classList.remove('dirty');
  saveLocal();
  // Setelah user selesai save, render ulang untuk tampilkan data user lain
  // yang mungkin masuk selama isDirty (silentMode)
  if(typeof _rtSmartRender==='function')_rtSmartRender();
}
function toast(msg,type='success'){
  const el=$('toast');
  el.textContent=msg;el.className=`toast ${type} show`;
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),3500);
}


// ── FORMAT RUPIAH ───────────────────────────────────────────
function fmtRp(n){
  if(!n&&n!==0)return'\u2014';
  const v=+n;if(isNaN(v))return'\u2014';
  return'Rp '+v.toLocaleString('id-ID');
}
function fmtRpShort(n){
  const v=+n||0;
  if(v>=1e9)return'Rp '+(v/1e9).toFixed(1).replace('.',',')+'M';
  if(v>=1e6)return'Rp '+(v/1e6).toFixed(1).replace('.',',')+'jt';
  if(v>=1e3)return'Rp '+(v/1e3).toFixed(0)+'rb';
  return'Rp '+v.toLocaleString('id-ID');
}

// ── PENDING DELETES & ID HELPERS ────────────────────────────
function getPendingDeletes(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_proc')||'[]'));}catch(e){return new Set();}}
function addPendingDelete(id){const ids=getPendingDeletes();ids.add(String(id));try{localStorage.setItem('atw_deleted_proc',JSON.stringify([...ids]));}catch(e){}}
function clearPendingDeletes(){try{localStorage.removeItem('atw_deleted_proc');}catch(e){}}
function getPendingDeletesWbs(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_wbs')||'[]'));}catch(e){return new Set();}}
function addPendingDeleteWbs(id){const ids=getPendingDeletesWbs();ids.add(String(id));try{localStorage.setItem('atw_deleted_wbs',JSON.stringify([...ids]));}catch(e){}}
function clearPendingDeletesWbs(){try{localStorage.removeItem('atw_deleted_wbs');}catch(e){}}
function getPendingDeletesIss(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_iss')||'[]'));}catch(e){return new Set();}}
function addPendingDeleteIss(id){const s=getPendingDeletesIss();s.add(String(id));try{localStorage.setItem('atw_deleted_iss',JSON.stringify([...s]));}catch(e){}}
function clearPendingDeletesIss(){try{localStorage.removeItem('atw_deleted_iss');}catch(e){}}
function getPendingDeletesMp(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_mp')||'[]'));}catch(e){return new Set();}}
function addPendingDeleteMp(id){const s=getPendingDeletesMp();s.add(String(id));try{localStorage.setItem('atw_deleted_mp',JSON.stringify([...s]));}catch(e){}}
function clearPendingDeletesMp(){try{localStorage.removeItem('atw_deleted_mp');}catch(e){}}
function getPendingDeletesAcc(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_acc')||'[]'));}catch(e){return new Set();}}
function addPendingDeleteAcc(id){const s=getPendingDeletesAcc();s.add(String(id));try{localStorage.setItem('atw_deleted_acc',JSON.stringify([...s]));}catch(e){}}
function clearPendingDeletesAcc(){try{localStorage.removeItem('atw_deleted_acc');}catch(e){}}
function getPendingDeletesCost(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_cost')||'[]'));}catch(e){return new Set();}}
function addPendingDeleteCost(id){const s=getPendingDeletesCost();s.add(String(id));try{localStorage.setItem('atw_deleted_cost',JSON.stringify([...s]));}catch(e){}}
function clearPendingDeletesCost(){try{localStorage.removeItem('atw_deleted_cost');}catch(e){}}
function getPendingDeletesRab(){try{return new Set(JSON.parse(localStorage.getItem('atw_deleted_rab')||'[]'));}catch(e){return new Set();}}
function addPendingDeleteRab(id){const s=getPendingDeletesRab();s.add(String(id));try{localStorage.setItem('atw_deleted_rab',JSON.stringify([...s]));}catch(e){}}
function clearPendingDeletesRab(){try{localStorage.removeItem('atw_deleted_rab');}catch(e){}}
function genId(){return String(Date.now())+Math.random().toString(36).slice(2,6);}
function parseLocalDate(s){if(!s)return null;const str=String(s).slice(0,10);const parts=str.split('-');if(parts.length!==3)return new Date(s);const d=new Date(+parts[0],+parts[1]-1,+parts[2],0,0,0,0);return isNaN(d)?null:d;}
function _numPrefix(id){const s=String(id||'');const m=s.match(/^(\d+)/);return m?m[1]:s;}
function _idMatch(a,b){if(String(a)===String(b))return true;const na=_numPrefix(a),nb=_numPrefix(b);return na&&nb&&na===nb;}

// ── SAFE STRING & DATA SANITIZERS ──────────────────────────
function safeStr(v){
  if(v===null||v===undefined)return '';
  if(v instanceof Date)return v.toLocaleDateString('id-ID');
  if(typeof v==='object'){
    // Google Sheets Date serial number object
    if(v.constructor&&v.constructor.name==='Date')return v.toLocaleDateString('id-ID');
    return ''; // semua object lain -> string kosong
  }
  if(typeof v==='boolean')return '';
  const s=String(v);
  // Jika string terlihat seperti JSON array/object -> kosongkan
  if((s.startsWith('[')&&s.endsWith(']'))||(s.startsWith('{')&&s.endsWith('}')))return '';
  return s;
}

// Sanitize seluruh data array yang datang dari GSheet/localStorage
function sanitizeProjects(arr){
  return (arr||[]).map(p=>({
    ...p,
    id:String(p.id||Date.now()),
    kode:safeStr(p.kode),nama:safeStr(p.nama),lokasi:safeStr(p.lokasi),
    client:safeStr(p.client),status:safeStr(p.status)||'Planning',
    mulai:safeStr(p.mulai),selesai:safeStr(p.selesai),
    weather:safeStr(p.weather),notes:safeStr(p.notes),
    plan:+p.plan||0,actual:+p.actual||0,
    mpPlan:+p.mpPlan||0,mpActual:+p.mpActual||0,
    mhPlan:+p.mhPlan||0,mdPlan:+p.mdPlan||+p.mpPlan||0,
    logo:p.logo&&String(p.logo).startsWith('data:')?String(p.logo):'',
    picPm:safeStr(p.picPm).slice(0,100),picSm:safeStr(p.picSm).slice(0,100),
    picEng:safeStr(p.picEng).slice(0,100),picProc:safeStr(p.picProc).slice(0,100),
    history:Array.isArray(p.history)?p.history:[]
  }));
}
function sanitizeIssues(arr){
  return (arr||[]).filter(r=>r.uraian&&typeof r.uraian==='string'&&r.uraian.trim()!='').map(i=>({
    id:i.id||Date.now(),
    projId:i.projId,
    tgl:safeStr(i.tgl).slice(0,30),
    uraian:safeStr(i.uraian).slice(0,500),
    prioritas:safeStr(i.prioritas)||'Medium',
    kategori:safeStr(i.kategori)||'Other',
    pj:safeStr(i.pj).slice(0,100),
    due:safeStr(i.due).slice(0,30),
    status:safeStr(i.status)||'Open',
    done:safeStr(i.done).slice(0,30),
    action:safeStr(i.action).slice(0,500)
  }));
}
function sanitizeProc(arr){
  const _trimDate=v=>{if(!v)return'';const s=String(v).trim();return s.includes('T')?s.slice(0,10):s.slice(0,10);};
  const seen=new Set();
  return (arr||[]).filter(r=>r.item&&typeof r.item==='string'&&r.item.trim()!='').map(pr=>({
    id:String(pr.id||Date.now()),
    projId:String(pr.projId||''),
    item:safeStr(pr.item).slice(0,200),
    kategori:safeStr(pr.kategori)||'Material',
    qty:safeStr(pr.qty).slice(0,50),
    satuan:safeStr(pr.satuan).slice(0,50),
    supplier:safeStr(pr.supplier).slice(0,200),
    due:_trimDate(pr.due),
    status:safeStr(pr.status)||'Waiting Approval',
    notes:safeStr(pr.notes).slice(0,500),
    harga:pr.harga!=null&&pr.harga!==''?+pr.harga||0:undefined,
    rabKatId:pr.rabKatId||null,
    rabItemId:pr.rabItemId||null
  })).filter(pr=>{
    if(seen.has(pr.id))return false;
    seen.add(pr.id);return true;
  });
}
function sanitizeMpLogs(arr){
  return (arr||[]).filter(r=>r.date).map(m=>({
    id:m.id||Date.now(),
    projId:m.projId,
    date:safeStr(m.date).slice(0,30),
    spv:+m.spv||0,mandor:+m.mandor||0,installer:+m.installer||0,
    tukang:+m.tukang||0,helper:+m.helper||0,safety:+m.safety||0,
    total:+m.total||0,mhActual:+m.mhActual||0,
    timeLost:+m.timeLost||0,
    timeLostReason:safeStr(m.timeLostReason).slice(0,200),
    notes:safeStr(m.notes).slice(0,500),
    // Preserve activities assignment array
    activities:Array.isArray(m.activities)?m.activities.map(a=>({
      wbsId:String(a.wbsId||''),
      wbsName:String(a.wbsName||''),
      spv:+a.spv||0,mandor:+a.mandor||0,installer:+a.installer||0,
      tukang:+a.tukang||0,helper:+a.helper||0,safety:+a.safety||0,
      total:+a.total||0,notes:String(a.notes||'')
    })):[]
  }));
}
function sanitizeAccLogs(arr){
  return (arr||[]).filter(r=>r.date).map(a=>({
    id:a.id||Date.now(),
    projId:a.projId,
    date:safeStr(a.date).slice(0,30),
    fatality:+a.fatality||0,lti:+a.lti||0,
    minorInjury:+a.minorInjury||0,medTreatment:+a.medTreatment||0,
    propertyDamage:+a.propertyDamage||0,fire:+a.fire||0,
    traffic:+a.traffic||0,environment:+a.environment||0,
    nearMiss:+a.nearMiss||0,timeLost:+a.timeLost||0,
    notes:safeStr(a.notes).slice(0,500)
  }));
}
function exportPDF(){
  // Siapkan PDF header
  const logo=localStorage.getItem('atw_dash_logo')||$('dashLogoImg')?.src||'';
  const pdfLogo=$('pdfLogoImg');
  if(pdfLogo&&logo&&logo.startsWith('data:'))pdfLogo.src=logo;
  const dateStr=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const pdfDate=$('pdfHeaderDate');
