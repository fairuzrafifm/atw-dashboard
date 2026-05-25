// ===============================================================
// MANPOWER TAB
// ===============================================================
function renderMP(){
  const today=new Date().toISOString().slice(0,10);
  const weekOffset=+(gv('mpTrendWeek')||0);

  // KPIs
  const todayLogs=MPLOGS.filter(m=>m.date===today);
  const totalToday=todayLogs.reduce((s,m)=>s+(+m.total||0),0);
  const totalMD=MPLOGS.reduce((s,m)=>s+(+m.total||0),0);
  const mdPlan=P.reduce((s,p)=>s+(+p.mdPlan||+p.mpPlan||0),0);
  const mdVar=totalMD-mdPlan;
  const timeLost=MPLOGS.reduce((s,m)=>s+(+m.timeLost||0),0)+ACCLOGS.reduce((s,a)=>s+(+a.timeLost||0),0);
  if($('mp1'))$('mp1').textContent=totalToday;
  if($('mp1s'))$('mp1s').textContent=P.map(p=>{const l=todayLogs.find(m=>m.projId==p.id);return l?p.kode+': '+(+l.total||0):''}).filter(Boolean).join(' | ')||'\u2014';
  if($('mp2'))$('mp2').textContent=totalMD;
  if($('mp2s'))$('mp2s').textContent='Plan: '+(mdPlan||0)+' MD';
  if($('mp3'))$('mp3').textContent=(mdVar>=0?'+':'')+mdVar;
  if($('mp3s'))$('mp3s').textContent=mdPlan>0?(mdVar>=0?'Ahead':'Behind'):'\u2014';
  if($('mp4'))$('mp4').textContent=timeLost+' hr';

  // Manpower table (hari ini per project)
  if($('mpTable')){
    $('mpTable').innerHTML=P.length?P.map(p=>{
      const log=todayLogs.find(m=>m.projId==p.id)||{};
      const mdAct=MPLOGS.filter(m=>m.projId==p.id).reduce((s,m)=>s+(+m.total||0),0);
      const mdPl=+p.mdPlan||+p.mpPlan||0;
      const pct=mdPl>0?Math.min(100,Math.round(mdAct/mdPl*100)):0;
      const tl=+(log.timeLost||0);
      return`<div class="mp-row">
        <div style="font-family:var(--fm);font-size:11px;color:var(--bl)">${p.kode}<div style="color:var(--mt);font-size:9px">${p.nama.slice(0,30)}</div></div>
        <div><div class="mp-bar-wrap"><div class="mp-bar-ac" style="width:${pct}%"></div></div><div style="font-size:9px;color:var(--mt)">${mdAct}/${mdPl} MD (${pct}%)</div></div>
        <div style="font-family:var(--fm)">${log.spv||0}</div>
        <div style="font-family:var(--fm)">${log.mandor||0}</div>
        <div style="font-family:var(--fm)">${log.installer||0}</div>
        <div style="font-family:var(--fm)">${log.tukang||0}</div>
        <div style="font-family:var(--fm)">${log.helper||0}</div>
        <div style="font-family:var(--fm)">${log.safety||0}</div>
        <div style="font-family:var(--fm);font-weight:600;color:${(+log.total||0)>0?'var(--or)':'var(--mt)'}">${log.total||0}</div>
        <div style="font-family:var(--fm);color:${tl>0?'var(--rd)':'var(--mt)'}">${tl>0?tl+'h':'\u2014'}</div>
      </div>`;
    }).join(''):'<div style="text-align:center;color:var(--mt);padding:20px;font-size:12px">Belum ada log manpower</div>';
  }

  // Weekly trend chart
  if($('mpTrend')){
    const days=[];
    const base=new Date();base.setDate(base.getDate()-weekOffset*7);
    for(let i=6;i>=0;i--){const d=new Date(base);d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
    const light=document.documentElement.classList.contains('light');
    const TICK=light?'#94a3b8':'#64748b';
    const vals=days.map(d=>MPLOGS.filter(m=>m.date===d).reduce((s,m)=>s+(+m.total||0),0));
    const maxV=Math.max(...vals,1);
    const dayName=d=>new Date(d+'T12:00').toLocaleDateString('id-ID',{weekday:'short'});
    const bars=days.map((d,i)=>{
      const h=Math.round((vals[i]/maxV)*70);
      const isToday=d===today;
      return`<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <div style="font-size:9px;font-family:var(--fm);color:${vals[i]>0?'var(--or)':'var(--mt)'}">${vals[i]||''}</div>
        <div style="width:28px;height:${h||2}px;background:${isToday?'var(--or)':'var(--bl)'};opacity:${isToday?1:.7};border-radius:3px 3px 0 0;min-height:2px;transition:none"></div>
        <div style="font-size:9px;color:${isToday?'var(--or)':TICK};font-weight:${isToday?700:400}">${dayName(d)}</div>
        <div style="font-size:8px;color:var(--mt)">${d.slice(5)}</div>
      </div>`;
    }).join('');
    $('mpTrend').innerHTML=`<div style="display:flex;align-items:flex-end;gap:4px;padding:8px 0 0;height:110px">${bars}</div>`;
  }

  renderMpLog();
  renderMpActivity();
}

function renderMpLog(){
  const fp=$('mpLogFiltProj');
  if(fp){
    const cur=fp.value;
    fp.innerHTML='<option value="">Semua Project</option>'+P.map(p=>`<option value="${p.id}">${p.kode} — ${p.nama}</option>`).join('');
    fp.value=cur||'';
  }
  const fP=fp?.value||'';
  const logs=[...MPLOGS].filter(m=>!fP||m.projId==fP).sort((a,b)=>b.date.localeCompare(a.date));
  if(!$('mpLogTable'))return;
  if(!logs.length){$('mpLogTable').innerHTML='<div style="text-align:center;color:var(--mt);padding:16px;font-size:12px">Belum ada data</div>';return;}
  $('mpLogTable').innerHTML=`<table class="tbl" style="min-width:900px"><thead><tr><th>Tgl</th><th>Project</th><th>SPV</th><th>Mdr</th><th>Inst</th><th>Tukang</th><th>Helper</th><th>Safety</th><th>Total</th><th>MH</th><th>TL</th><th>Catatan / Aktivitas</th><th></th></tr></thead><tbody>
    ${logs.map(m=>{
      const pr=P.find(p=>p.id==m.projId);
      const tl=+m.timeLost||0;
      return`<tr>
        <td style="font-family:var(--fm);font-size:10px;white-space:nowrap">${fmtDate(m.date)}</td>
        <td style="color:var(--bl);font-size:10px">${pr?.kode||'\u2014'}</td>
        <td>${m.spv||0}</td><td>${m.mandor||0}</td><td>${m.installer||0}</td>
        <td>${m.tukang||0}</td><td>${m.helper||0}</td><td>${m.safety||0}</td>
        <td style="font-weight:600;color:var(--or)">${m.total||0}</td>
        <td style="color:var(--mt)">${m.mhActual||0}</td>
        <td style="color:${tl>0?'var(--rd)':'var(--mt)'}">${tl>0?tl+'h':'\u2014'}</td>
        <td style="max-width:160px">
          ${m.notes?`<div style="color:var(--mt);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.notes}</div>`:''}
          ${(m.activities&&m.activities.length)?`<div style="margin-top:2px;display:flex;flex-wrap:wrap;gap:2px">
            ${m.activities.map(a=>`<span title="${a.wbsName}: ${a.total} orang" style="font-size:8px;background:rgba(59,130,246,.12);color:var(--bl);padding:1px 5px;border-radius:3px;white-space:nowrap;border:1px solid rgba(59,130,246,.2);cursor:default">
              ${(a.wbsName||'Aktivitas').slice(0,18)}: <b>${a.total}</b>
            </span>`).join('')}
          </div>`:'<span style="color:var(--bd);font-size:9px">—</span>'}
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" style="padding:1px 5px;font-size:10px" onclick="openModal('inputMp','${m.id}')">✏</button>
          <button class="btn btn-sm brd" style="padding:1px 5px;font-size:10px" onclick="delMpLog('${m.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

// ═══════════════════════════════════════════════════════
// REKAP MANPOWER PER ITEM PEKERJAAN
// ═══════════════════════════════════════════════════════
function renderMpActivity(){
  // Populate project filter
  const fp=$('mpActFiltProj');
  if(fp){
    const cur=fp.value;
    fp.innerHTML='<option value="">Semua Project</option>'+
      P.map(p=>`<option value="${p.id}">${p.kode} — ${p.nama}</option>`).join('');
    // Sync dengan selId jika belum ada pilihan manual
    if(!fp._mpActFiltManual && selId) fp.value=selId;
    else fp.value=cur||'';
  }

  const el=$('mpActivityReport');
  if(!el)return;

  // Filter params
  const projFilt=gv('mpActFiltProj')||'';
  const period=gv('mpActFiltPeriod')||'all';
  const today=new Date().toISOString().slice(0,10);

  // Custom range toggle
  const customWrap=$('mpActCustomRange');
  if(customWrap)customWrap.style.display=period==='custom'?'flex':'none';

  let dateFrom='',dateTo=today;
  if(period==='week'){
    const d=new Date();d.setDate(d.getDate()-d.getDay());
    dateFrom=d.toISOString().slice(0,10);
  } else if(period==='month'){
    dateFrom=today.slice(0,7)+'-01';
  } else if(period==='custom'){
    dateFrom=gv('mpActDateFrom')||'';
    dateTo=gv('mpActDateTo')||today;
  }

  // Filter logs
  const logs=MPLOGS.filter(m=>{
    if(projFilt&&String(m.projId)!==String(projFilt))return false;
    if(dateFrom&&m.date<dateFrom)return false;
    if(dateTo&&m.date>dateTo)return false;
    return true;
  });

  // Aggregate per WBS item dari activities[]
  // Map: wbsId → {wbsName, projId, days: [{date,spv,mandor,installer,tukang,helper,safety,total,notes}], totals}
  const wbsMap=new Map();

  logs.forEach(log=>{
    const acts=log.activities||[];
    if(!acts.length)return;
    const pr=P.find(p=>String(p.id)===String(log.projId));
    acts.forEach(act=>{
      const key=(act.wbsId||'__nokey__')+'|'+String(log.projId);
      if(!wbsMap.has(key)){
        wbsMap.set(key,{
          wbsId:act.wbsId||'',
          wbsName:act.wbsName||'(tanpa nama)',
          projId:String(log.projId),
          projKode:pr?.kode||'—',
          entries:[],
          spv:0,mandor:0,installer:0,tukang:0,helper:0,safety:0,total:0,days:0
        });
      }
      const r=wbsMap.get(key);
      r.entries.push({
        date:log.date,
        spv:+act.spv||0,mandor:+act.mandor||0,installer:+act.installer||0,
        tukang:+act.tukang||0,helper:+act.helper||0,safety:+act.safety||0,
        total:+act.total||0,notes:act.notes||''
      });
      r.spv      +=(+act.spv||0);
      r.mandor   +=(+act.mandor||0);
      r.installer+=(+act.installer||0);
      r.tukang   +=(+act.tukang||0);
      r.helper   +=(+act.helper||0);
      r.safety   +=(+act.safety||0);
      r.total    +=(+act.total||0);
      r.days     +=1;
    });
  });

  // Sort by total desc
  const rows=[...wbsMap.values()].sort((a,b)=>b.total-a.total);

  if(!rows.length){
    el.innerHTML='<div style="text-align:center;color:var(--mt);padding:24px;font-size:12px">'+
      (logs.length?'Belum ada assignment aktivitas pada periode ini — isi lewat Input Harian → Assignment Pekerja per Aktivitas':
      'Belum ada log manpower')+
      '</div>';
    return;
  }

  // Total keseluruhan
  const grandTotal=rows.reduce((s,r)=>s+r.total,0);

  // Render tabel dengan expand/collapse per WBS item
  let html=`<table class="tbl" style="border-collapse:collapse;width:100%;min-width:800px">
    <thead><tr style="position:sticky;top:0;z-index:2;background:var(--sf)">
      <th style="background:var(--sf)">Item Pekerjaan</th>
      <th style="background:var(--sf)">Project</th>
      <th style="text-align:center;background:var(--sf)">Hari Kerja</th>
      <th style="text-align:center;background:var(--sf)">SPV</th>
      <th style="text-align:center;background:var(--sf)">Mandor</th>
      <th style="text-align:center;background:var(--sf)">Installer</th>
      <th style="text-align:center;background:var(--sf)">Tukang</th>
      <th style="text-align:center;background:var(--sf)">Helper</th>
      <th style="text-align:center;background:var(--sf)">Safety</th>
      <th style="text-align:center;background:var(--sf)">Total MD</th>
      <th style="text-align:center;background:var(--sf)">% dari Total</th>
      <th style="background:var(--sf)"></th>
    </tr></thead><tbody>`;

  rows.forEach((r,idx)=>{
    const pct=grandTotal>0?Math.round(r.total/grandTotal*100):0;
    const barW=Math.max(2,pct);
    const rowId='mpar_'+idx;
    html+=`<tr style="border-bottom:1px solid var(--bd)">
      <td style="font-weight:600;font-size:12px;max-width:220px">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.wbsName}">${r.wbsName}</div>
      </td>
      <td style="font-size:10px;color:var(--bl);white-space:nowrap">${r.projKode}</td>
      <td style="text-align:center;font-family:var(--fm)">${r.days}</td>
      <td style="text-align:center;font-family:var(--fm);color:${r.spv>0?'var(--bl)':'var(--mt)'}">${r.spv||'—'}</td>
      <td style="text-align:center;font-family:var(--fm);color:${r.mandor>0?'var(--pu,#8b5cf6)':'var(--mt)'}">${r.mandor||'—'}</td>
      <td style="text-align:center;font-family:var(--fm);color:${r.installer>0?'var(--gn)':'var(--mt)'}">${r.installer||'—'}</td>
      <td style="text-align:center;font-family:var(--fm);color:${r.tukang>0?'var(--tl,#2dd4bf)':'var(--mt)'}">${r.tukang||'—'}</td>
      <td style="text-align:center;font-family:var(--fm);color:${r.helper>0?'var(--or)':'var(--mt)'}">${r.helper||'—'}</td>
      <td style="text-align:center;font-family:var(--fm);color:${r.safety>0?'var(--yw)':'var(--mt)'}">${r.safety||'—'}</td>
      <td style="text-align:center;font-family:var(--fm);font-weight:700;font-size:14px;color:var(--or)">${r.total}</td>
      <td style="min-width:100px">
        <div style="display:flex;align-items:center;gap:5px">
          <div style="flex:1;background:var(--sf2);border-radius:3px;height:6px;overflow:hidden">
            <div style="width:${barW}%;height:100%;background:linear-gradient(90deg,var(--or),var(--yw));border-radius:3px"></div>
          </div>
          <span style="font-size:10px;color:var(--mt);flex-shrink:0">${pct}%</span>
        </div>
      </td>
      <td style="white-space:nowrap">
        <button onclick="toggleMpActDetail('${rowId}')"
          style="background:none;border:1px solid var(--bd);border-radius:4px;padding:1px 7px;cursor:pointer;color:var(--mt);font-size:11px"
          id="btn_${rowId}">Detail →</button>
      </td>
    </tr>
    ${'<'}!-- Detail rows (hidden) -->
    <tr id="${rowId}" style="display:none">
      <td colspan="12" style="padding:0;background:var(--sf2)">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead>
            <tr style="background:var(--sf);border-bottom:1px solid var(--bd)">
              <th style="padding:5px 12px;text-align:left;color:var(--mt);font-weight:600">Tanggal</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">SPV</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">Mandor</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">Inst</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">Tukang</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">Helper</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">Safety</th>
              <th style="padding:5px 8px;text-align:center;color:var(--mt);font-weight:600">Total</th>
              <th style="padding:5px 8px;text-align:left;color:var(--mt);font-weight:600">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${r.entries.sort((a,b)=>a.date>b.date?1:-1).map(e=>`
            <tr style="border-bottom:1px solid var(--bd)">
              <td style="padding:4px 12px;font-family:var(--fm);color:var(--bl)">${e.date}</td>
              <td style="padding:4px 8px;text-align:center">${e.spv||'—'}</td>
              <td style="padding:4px 8px;text-align:center">${e.mandor||'—'}</td>
              <td style="padding:4px 8px;text-align:center">${e.installer||'—'}</td>
              <td style="padding:4px 8px;text-align:center">${e.tukang||'—'}</td>
              <td style="padding:4px 8px;text-align:center">${e.helper||'—'}</td>
              <td style="padding:4px 8px;text-align:center">${e.safety||'—'}</td>
              <td style="padding:4px 8px;text-align:center;font-weight:700;color:var(--or)">${e.total}</td>
              <td style="padding:4px 8px;color:var(--mt);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.notes||'—'}</td>
            </tr>`).join('')}
            <tr style="background:var(--sf);font-weight:700;border-top:2px solid var(--bd)">
              <td style="padding:5px 12px;font-size:11px;color:var(--mt)">SUBTOTAL</td>
              <td style="padding:5px 8px;text-align:center">${r.spv||'—'}</td>
              <td style="padding:5px 8px;text-align:center">${r.mandor||'—'}</td>
              <td style="padding:5px 8px;text-align:center">${r.installer||'—'}</td>
              <td style="padding:5px 8px;text-align:center">${r.tukang||'—'}</td>
              <td style="padding:5px 8px;text-align:center">${r.helper||'—'}</td>
              <td style="padding:5px 8px;text-align:center">${r.safety||'—'}</td>
              <td style="padding:5px 8px;text-align:center;color:var(--or)">${r.total}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>`;
  });

  // Grand total row
  const gSpv=rows.reduce((s,r)=>s+r.spv,0);
  const gMandor=rows.reduce((s,r)=>s+r.mandor,0);
  const gInst=rows.reduce((s,r)=>s+r.installer,0);
  const gTukang=rows.reduce((s,r)=>s+r.tukang,0);
  const gHelper=rows.reduce((s,r)=>s+r.helper,0);
  const gSafety=rows.reduce((s,r)=>s+r.safety,0);
  html+=`<tr style="background:var(--sf2);font-weight:700;border-top:2px solid var(--bd);position:sticky;bottom:0">
    <td colspan="2" style="padding:8px 10px;font-size:11px;color:var(--mt)">GRAND TOTAL — ${rows.length} item pekerjaan</td>
    <td style="text-align:center;font-family:var(--fm)">${rows.reduce((s,r)=>s+r.days,0)}</td>
    <td style="text-align:center;font-family:var(--fm);color:var(--bl)">${gSpv}</td>
    <td style="text-align:center;font-family:var(--fm)">${gMandor}</td>
    <td style="text-align:center;font-family:var(--fm);color:var(--gn)">${gInst}</td>
    <td style="text-align:center;font-family:var(--fm)">${gTukang}</td>
    <td style="text-align:center;font-family:var(--fm);color:var(--or)">${gHelper}</td>
    <td style="text-align:center;font-family:var(--fm)">${gSafety}</td>
    <td style="text-align:center;font-family:var(--fm);font-size:16px;font-weight:800;color:var(--or)">${grandTotal}</td>
    <td colspan="2"></td>
  </tr>`;

  html+='</tbody></table>';
  el.innerHTML=html;
}

function toggleMpActDetail(rowId){
  const row=document.getElementById(rowId);
  const btn=document.getElementById('btn_'+rowId);
  if(!row)return;
  const hidden=row.style.display==='none';
  row.style.display=hidden?'table-row':'none';
  if(btn)btn.textContent=hidden?'▼ Tutup':'Detail →';
}

function delMpLog(id){
  showConfirm('Hapus log ini?',()=>{_doDelMpLog(id);});return;}
function _doDelMpLog(id){
  MPLOGS=MPLOGS.filter(m=>m.id!==id);
  dirty();renderMP();updateTimeLostKPI();toast('Log dihapus','warn');gsSync();
}

function calcMpTot(){
  // Field manual sudah dihapus — total dihitung dari activities
  updateMpActSummary();
}

// ── Render activity assignment rows ──────────────────────────
function renderMpActivityRows(){
  const container=$('mpActivityRows');
  if(!container)return;
  const projId=gv('mpProj');
  const date=gv('mpDate');
  const editId=$('mpProj')?.dataset?.editId;

  // Get WBS items for project
  const allWbs=WBS.filter(w=>String(w.projId)===String(projId));
  const leafItems=allWbs.filter(w=>w.type==='item');
  const subcats=allWbs.filter(w=>w.type==='subcat'&&!allWbs.some(x=>x.type==='item'&&x.parentId===w.id));
  const wbsChoices=[...leafItems,...subcats].sort((a,b)=>(a.order||0)-(b.order||0));

  // Load existing activities if editing or if same project+date already has log
  let existingActivities=[];
  if(editId){
    const ex=MPLOGS.find(m=>m.id===editId);
    existingActivities=ex?.activities||[];
  } else if(date&&projId){
    const ex=MPLOGS.find(m=>String(m.projId)===String(projId)&&m.date===date);
    existingActivities=ex?.activities||[];
  }

  // Clear and re-render
  container.innerHTML='';
  if(existingActivities.length>0){
    existingActivities.forEach(act=>addMpActivityRow(act,wbsChoices));
  } else if(wbsChoices.length>0){
    // Default: tambah 1 row kosong
    addMpActivityRow(null,wbsChoices);
  } else {
    container.innerHTML='<div style="color:var(--mt);font-size:11px;padding:8px;text-align:center">Belum ada item WBS untuk project ini — setup WBS terlebih dahulu</div>';
  }
  updateMpActSummary();
}

function addMpActivityRow(existing, wbsChoices){
  const container=$('mpActivityRows');
  if(!container)return;
  const projId=gv('mpProj');
  if(!wbsChoices){
    const allWbs=WBS.filter(w=>String(w.projId)===String(projId));
    const leafItems=allWbs.filter(w=>w.type==='item');
    const subcats=allWbs.filter(w=>w.type==='subcat'&&!allWbs.some(x=>x.type==='item'&&x.parentId===w.id));
    wbsChoices=[...leafItems,...subcats].sort((a,b)=>(a.order||0)-(b.order||0));
  }

  const rowId='mpar_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const selVal=existing?.wbsId||'';

  // Build WBS options dengan hierarchy
  const allWbs=WBS.filter(w=>String(w.projId)===String(projId));
  const buildOpts=()=>{
    let opts='<option value="">— Pilih Item Pekerjaan —</option>';
    const cats=allWbs.filter(w=>w.type==='cat').sort((a,b)=>(a.order||0)-(b.order||0));
    if(cats.length){
      cats.forEach(cat=>{
        opts+=`<optgroup label="▸ ${cat.name}">`;
        const subs=allWbs.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>(a.order||0)-(b.order||0));
        subs.forEach(sub=>{
          const items=allWbs.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>(a.order||0)-(b.order||0));
          if(items.length){
            items.forEach(item=>{
              const sel=selVal===item.id?'selected':'';
              opts+=`<option value="${item.id}" ${sel}>${sub.name} / ${item.name}</option>`;
            });
          } else {
            const sel=selVal===sub.id?'selected':'';
            opts+=`<option value="${sub.id}" ${sel}>${sub.name}</option>`;
          }
        });
        // Direct items under cat
        allWbs.filter(w=>w.type==='item'&&w.parentId===cat.id).forEach(item=>{
          const sel=selVal===item.id?'selected':'';
          opts+=`<option value="${item.id}" ${sel}>${item.name}</option>`;
        });
        opts+='</optgroup>';
      });
    } else {
      wbsChoices.forEach(w=>{
        const sel=selVal===w.id?'selected':'';
        opts+=`<option value="${w.id}" ${sel}>${w.name}</option>`;
      });
    }
    return opts;
  };

  const row=document.createElement('div');
  row.className='mp-act-row';
  row.dataset.wbsId=selVal;
  row.dataset.wbsName=existing?.wbsName||'';
  row.style.cssText='background:var(--sf2);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;position:relative';
  row.innerHTML=`
    <button onclick="this.closest('.mp-act-row').remove();updateMpActSummary()"
      style="position:absolute;top:6px;right:8px;background:none;border:none;cursor:pointer;color:var(--mt);font-size:14px;line-height:1;padding:0" title="Hapus aktivitas">✕</button>

    <div style="margin-bottom:8px">
      <label style="font-size:10px;color:var(--mt);font-weight:600;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Item Pekerjaan / Aktivitas</label>
      <select class="fi mpa-wbs" style="font-size:12px" onchange="
        this.closest('.mp-act-row').dataset.wbsId=this.value;
        this.closest('.mp-act-row').dataset.wbsName=this.selectedOptions[0]?.text||'';
        updateMpActSummary()">
        ${buildOpts()}
      </select>
    </div>

    <div style="display:grid;grid-template-columns:repeat(6,1fr) auto;gap:6px;align-items:end">
      ${['SPV','Mandor','Inst','Tukang','Helper','Safety'].map((lbl,i)=>{
        const cls=['mpa-spv','mpa-mandor','mpa-installer','mpa-tukang','mpa-helper','mpa-safety'][i];
        const val=existing?[existing.spv,existing.mandor,existing.installer,existing.tukang,existing.helper,existing.safety][i]||0:0;
        return`<div>
          <div style="font-size:9px;color:var(--mt);margin-bottom:2px;text-align:center">${lbl}</div>
          <input type="number" class="fi ${cls}" value="${val}" min="0" style="text-align:center;padding:4px 2px;font-size:12px" oninput="updateMpActSummary()">
        </div>`;
      }).join('')}
      <div style="text-align:center">
        <div style="font-size:9px;color:var(--or);margin-bottom:2px">Total</div>
        <div class="mpa-rowtot" style="font-family:var(--fm);font-weight:700;color:var(--or);font-size:14px;padding:4px 0">${
          existing?[existing.spv||0,existing.mandor||0,existing.installer||0,existing.tukang||0,existing.helper||0,existing.safety||0].reduce((s,v)=>s+v,0):0
        }</div>
      </div>
    </div>

    <div style="margin-top:8px">
      <input class="fi mpa-notes" value="${existing?.notes||''}" placeholder="Keterangan aktivitas / lokasi / progres..." style="font-size:11px">
    </div>`;

  // Auto-calc row total
  row.querySelectorAll('input[type=number]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const tot=['mpa-spv','mpa-mandor','mpa-installer','mpa-tukang','mpa-helper','mpa-safety']
        .reduce((s,cls)=>s+(+row.querySelector('.'+cls)?.value||0),0);
      row.querySelector('.mpa-rowtot').textContent=tot;
    });
  });

  container.appendChild(row);
  updateMpActSummary();
}

function updateMpActSummary(){
  // Hitung totals dari semua activity rows
  const rows=document.querySelectorAll('#mpActivityRows .mp-act-row');
  const totals={spv:0,mandor:0,installer:0,tukang:0,helper:0,safety:0};
  rows.forEach(row=>{
    totals.spv      +=(+row.querySelector('.mpa-spv')?.value||0);
    totals.mandor   +=(+row.querySelector('.mpa-mandor')?.value||0);
    totals.installer+=(+row.querySelector('.mpa-installer')?.value||0);
    totals.tukang   +=(+row.querySelector('.mpa-tukang')?.value||0);
    totals.helper   +=(+row.querySelector('.mpa-helper')?.value||0);
    totals.safety   +=(+row.querySelector('.mpa-safety')?.value||0);
  });
  const grandTot=Object.values(totals).reduce((s,v)=>s+v,0);

  // Update hidden fields (untuk saveMp)
  sv('mpSpv',totals.spv);sv('mpMandor',totals.mandor);sv('mpInstaller',totals.installer);
  sv('mpTukang',totals.tukang);sv('mpHelper',totals.helper);sv('mpSafety',totals.safety);
  sv('mpTot',grandTot);

  // Tampilkan summary bar
  const bar=$('mpTotSummary');
  const breakdown=$('mpTotBreakdown');
  if(!bar||!breakdown)return;
  if(!rows.length||grandTot===0){bar.style.display='none';return;}
  bar.style.display='block';
  const roles=[
    {lbl:'SPV',val:totals.spv,clr:'var(--bl)'},
    {lbl:'Mandor',val:totals.mandor,clr:'var(--pu)'},
    {lbl:'Installer',val:totals.installer,clr:'var(--gn)'},
    {lbl:'Tukang',val:totals.tukang,clr:'var(--tl,#2dd4bf)'},
    {lbl:'Helper',val:totals.helper,clr:'var(--or)'},
    {lbl:'Safety',val:totals.safety,clr:'var(--yw)'},
    {lbl:'TOTAL',val:grandTot,clr:'var(--tx)',bold:true},
  ];
  breakdown.innerHTML=roles.map(r=>`
    <div>
      <div style="font-size:9px;color:var(--mt);margin-bottom:2px">${r.lbl}</div>
      <div style="font-family:var(--fm);font-size:${r.bold?'18':'15'}px;font-weight:${r.bold?'800':'600'};color:${r.clr}">${r.val}</div>
    </div>`).join('');
}
function calcEmlTot(){sv('emlTot',(+gv('emlSpv')||0)+(+gv('emlMandor')||0)+(+gv('emlInstaller')||0)+(+gv('emlTukang')||0)+(+gv('emlHelper')||0)+(+gv('emlSafety')||0));}

function fillMpPlan(){
  const projId=gv('mpProj');
  const p=P.find(x=>x.id==projId);
  if(p){
    // Hitung mandays actual = akumulasi total pekerja dari semua log project ini
    const mdActual=MPLOGS.filter(m=>m.projId===p.id).reduce((s,m)=>s+(+m.total||0),0);
    const mdPlan=+p.mdPlan||+p.mpPlan||0; // fallback ke mpPlan lama
    const mdVar=mdActual-mdPlan;
    const dispPlan=$('mpMdPlanDisp');
    const dispAct=$('mpMdActDisp');
    const dispVar=$('mpMdVarDisp');
    if(dispPlan)dispPlan.textContent=mdPlan||'Belum diset';
    if(dispAct)dispAct.textContent=mdActual+' MD';
    if(dispVar){
      dispVar.textContent=(mdPlan>0?(mdVar>=0?'+':'')+mdVar+' MD':'\u2014');
      dispVar.style.color=mdPlan>0?(mdVar>=0?'var(--gn)':'var(--rd)'):'var(--mt)';
    }
  }
}
function saveMp(){
  const projId=gv('mpProj');
  if(!projId){toast('Pilih project terlebih dahulu','error');return;}
  const date=gv('mpDate')||new Date().toISOString().slice(0,10);

  // ── Collect activity assignments ──────────────────────────
  const activities=[];
  document.querySelectorAll('#mpActivityRows .mp-act-row').forEach(row=>{
    const wbsId  = row.dataset.wbsId||'';
    const wbsName= row.querySelector('.mpa-wbs')?.selectedOptions?.[0]?.text||row.dataset.wbsName||'';
    const spv    = +row.querySelector('.mpa-spv')?.value||0;
    const mandor = +row.querySelector('.mpa-mandor')?.value||0;
    const inst   = +row.querySelector('.mpa-installer')?.value||0;
    const tukang = +row.querySelector('.mpa-tukang')?.value||0;
    const helper = +row.querySelector('.mpa-helper')?.value||0;
    const safety = +row.querySelector('.mpa-safety')?.value||0;
    const total  = spv+mandor+inst+tukang+helper+safety;
    const notes  = row.querySelector('.mpa-notes')?.value?.trim()||'';
    if(total>0||notes){
      activities.push({wbsId,wbsName,spv,mandor,installer:inst,tukang,helper,safety,total,notes});
    }
  });

  // ── Auto-aggregate total dari activities (field SPV/Mandor dihapus dari UI) ──
  const spv    = activities.reduce((s,a)=>s+(+a.spv||0),0);
  const mandor = activities.reduce((s,a)=>s+(+a.mandor||0),0);
  const inst   = activities.reduce((s,a)=>s+(+a.installer||0),0);
  const tukang = activities.reduce((s,a)=>s+(+a.tukang||0),0);
  const helper = activities.reduce((s,a)=>s+(+a.helper||0),0);
  const safety = activities.reduce((s,a)=>s+(+a.safety||0),0);
  const tot    = spv+mandor+inst+tukang+helper+safety;

  if(activities.length===0){toast('Tambahkan minimal 1 aktivitas dengan pekerja','warn');return;}

  // ── Build entry ───────────────────────────────────────────
  const editId=$('mpProj').dataset?.editId||'';
  const entry={
    id:editId||genId(),
    projId:String(projId),
    date,
    spv,mandor,installer:inst,tukang,helper,safety,total:tot,
    mhActual:+gv('mpMhAct')||0,
    timeLost:+gv('mpTL')||0,
    timeLostReason:gv('mpTLReason')||'',
    notes:gv('mpNotes')||'',
    activities
  };

  // ── Upsert ke MPLOGS ──────────────────────────────────────
  if(editId){
    const idx=MPLOGS.findIndex(m=>m.id===editId);
    if(idx>=0)MPLOGS[idx]=entry; else MPLOGS.push(entry);
    if($('mpProj').dataset)delete $('mpProj').dataset.editId;
  } else {
    // Upsert by project+date (timpa tanpa konfirmasi)
    const existing=MPLOGS.findIndex(m=>String(m.projId)===String(projId)&&m.date===date);
    if(existing>=0) MPLOGS[existing]=entry;
    else MPLOGS.push(entry);
  }

  // Update project mpActual
  const pi=P.findIndex(p=>String(p.id)===String(projId));
  if(pi>=0) P[pi].mpActual=tot;

  dirty();
  cm('inputMp');
  render();
  updateTimeLostKPI();
  toast(`✓ Manpower disimpan — ${tot} pekerja${activities.length?' | '+activities.length+' aktivitas':''}`);
  gsSync();
}
function saveAcc(){
  const projId=gv('accProj');if(!projId){toast('Pilih project','error');return;}
  const entry={id:genId(),projId:+projId||projId,date:gv('accDate')||new Date().toISOString().slice(0,10),
    fatality:+gv('accFat')||0,lti:+gv('accLti')||0,minorInjury:+gv('accMin')||0,medTreatment:+gv('accMed')||0,
    propertyDamage:+gv('accProp')||0,fire:+gv('accFire')||0,traffic:+gv('accTraf')||0,
    environment:+gv('accEnv')||0,nearMiss:+gv('accNM')||0,timeLost:+gv('accTL')||0,notes:gv('accNotes')};
  ACCLOGS.push(entry);
  dirty();cm('addAccident');
  // Selalu update OV time lost KPI langsung, tidak perlu tunggu tab switch
  updateTimeLostKPI();
  if(activeTab==='overview')renderOV();
  toast('Accident log disimpan ✓');gsSync();
}
// ── EDIT HISTORY ENTRY ──────────────────────────────────────
function editHistEntry(projId,idx){
  const p=P.find(x=>x.id===projId);if(!p||!p.history[idx])return;
  const h=p.history[idx];
  sv('ehProjId',projId);sv('ehIdx',idx);
  sv('ehDate',h.date||'');sv('ehNotes',h.notes||'');sv('ehMp',h.mp||0);
  sv('ehStatus',h.status||p.status||'On Track');
  $('ehActual').value=h.actual||0;$('ehPlan').value=h.plan||0;
  rv('ehActual','ehActualV','ehActualB');rv('ehPlan','ehPlanV','ehPlanB');
  show('ov-editHist');
}
function delHistEntry(projId,idx){
  showConfirm('Hapus entri riwayat ini?',()=>{_doDelHist(projId,idx);});return;}
function _doDelHist(projId,idx){
  const p=P.find(x=>x.id===projId);if(!p)return;
  p.history.splice(idx,1);
  dirty();renderDetail(projId);toast('Entri dihapus','warn');gsSync();
}
function saveHistEntry(){
  const projId=+gv('ehProjId')||gv('ehProjId');
  const idx=+gv('ehIdx');
  const p=P.find(x=>x.id===projId);if(!p||!p.history)return;
  p.history[idx]={
    date:gv('ehDate')||p.history[idx].date,
    actual:+$('ehActual').value,plan:+$('ehPlan').value,
    mp:+gv('ehMp')||0,notes:gv('ehNotes').trim(),status:gv('ehStatus')
  };
  // Sync progress ke project juga (entri terbaru)
  const lastIdx=p.history.length-1;
  if(idx===lastIdx){
    p.actual=p.history[idx].actual;p.plan=p.history[idx].plan;
    if(gv('ehStatus'))p.status=gv('ehStatus');
  }
  dirty();cm('editHist');renderDetail(projId);render();toast('Riwayat diupdate ✓');gsSync();
}

// ── EDIT ACCIDENT LOG ────────────────────────────────────────
function editAccLog(id){
  const a=ACCLOGS.find(x=>String(x.id)===String(id));if(!a)return;
  sv('eaId',String(id));
  $('eaProj').innerHTML=P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
  sv('eaProj',a.projId);sv('eaDate',a.date);
  sv('eaFat',a.fatality||0);sv('eaLti',a.lti||0);sv('eaMin',a.minorInjury||0);
  sv('eaMed',a.medTreatment||0);sv('eaProp',a.propertyDamage||0);sv('eaNM',a.nearMiss||0);
  sv('eaFire',a.fire||0);sv('eaTraf',a.traffic||0);sv('eaEnv',a.environment||0);
  sv('eaTL',a.timeLost||0);sv('eaNotes',a.notes||'');
  show('ov-editAcc');
}
function saveAccEdit(){
  const id=gv('eaId');
  const idx=ACCLOGS.findIndex(x=>String(x.id)===String(id));
  if(idx<0){toast('Data tidak ditemukan','error');return;}
  ACCLOGS[idx]={...ACCLOGS[idx],
    projId:+gv('eaProj')||gv('eaProj'),date:gv('eaDate'),
    fatality:+gv('eaFat')||0,lti:+gv('eaLti')||0,minorInjury:+gv('eaMin')||0,
    medTreatment:+gv('eaMed')||0,propertyDamage:+gv('eaProp')||0,nearMiss:+gv('eaNM')||0,
    fire:+gv('eaFire')||0,traffic:+gv('eaTraf')||0,environment:+gv('eaEnv')||0,
    timeLost:+gv('eaTL')||0,notes:gv('eaNotes')};
  dirty();cm('editAcc');updateTimeLostKPI();
  if(activeTab==='overview')renderOV();
  toast('Accident log diupdate ✓');gsSync();
}
function delAccLog(){
  const id=gv('eaId');
  const entry=ACCLOGS.find(x=>String(x.id)===String(id));
  if(!entry){toast('Data tidak ditemukan','error');return;}
  const tl=entry.timeLost||0;
  const proj=P.find(p=>p.id===entry.projId)?.kode||'';
  const ok=window.confirm(`Hapus accident log ini?\n${entry.date} · ${proj} · Time Lost: ${tl} jam`);
  if(!ok)return;
  ACCLOGS=ACCLOGS.filter(x=>String(x.id)!==String(id));
  dirty();cm('editAcc');updateTimeLostKPI();
  if(activeTab==='overview')renderOV();
  toast('Accident log dihapus','warn');gsSync();
}

function saveWeather(){
  P.forEach(p=>{const el=$('wf_'+p.id);if(el)p.weather=el.value;});
  dirty();cm('editWeather');if(activeTab==='overview')renderOV();else renderSB();toast('Cuaca diupdate ✓');gsSync();
}

function saveIss(){
  const uraian=gv('iUraian').trim();if(!uraian){toast('Uraian wajib diisi','error');return;}
  const d={projId:+gv('iProj')||gv('iProj'),tgl:gv('iTgl'),uraian,prioritas:gv('iPri'),
    kategori:gv('iKat'),pj:gv('iPJ').trim(),due:gv('iDue'),status:gv('iStat'),done:gv('iDone'),action:gv('iAction').trim()};
  if(editIssId){const i=ISS.findIndex(x=>String(x.id)===String(editIssId));if(i>=0)ISS[i]={...ISS[i],...d};toast('Issue diupdate ✓');}
  else{d.id=genId();ISS.push(d);toast('Issue ditambahkan ✓');}
  dirty();cm('addIssue');renderIssues();$('pk5').textContent=ISS.filter(i=>i.status!=='Closed').length;gsSync();
}

function delIss(){showConfirm('Hapus issue ini?',()=>{ISS=ISS.filter(i=>String(i.id)!==String(editIssId));dirty();cm('addIssue');renderIssues();toast('Issue dihapus','warn');gsSync();});}

function saveProc(){
  const item=gv('pItem').trim();if(!item){toast('Nama item wajib diisi','error');return;}
  const rabKatId=gv('pRabKat')||null;
  const rabItemId=gv('pRabItem')||null;
  const hargaVal=$('pHarga')&&$('pHarga').value?+$('pHarga').value||0:undefined;
  const d={
    projId:String(gv('pProj')||selId||''),
    item,
    kategori:gv('pKat'),
    qty:gv('pQty'),
    satuan:gv('pSat'),
    due:gv('pDue'),
    supplier:(gv('pSup')||'').trim(),
    status:gv('pStat'),
    notes:(gv('pNotes')||'').trim(),
    harga:hargaVal,
    rabKatId:rabKatId||null,
    rabItemId:rabItemId||null
  };
  if(editProcId){
    const i=PROC.findIndex(x=>String(x.id)===String(editProcId));
    if(i>=0)PROC[i]={...PROC[i],...d};
    toast('Item diupdate ✓');
  } else {
    d.id=genId();
    PROC.push(d);
    toast('Item ditambahkan ✓');
  }
  dirty();cm('addProc');renderProc();renderRab();
  if(activeTab==='overview')renderOV();
  gsSync();
}

function delProc(){showConfirm('Hapus item ini?',()=>{PROC=PROC.filter(p=>String(p.id)!==String(editProcId));dirty();cm('addProc');renderProc();toast('Item dihapus','warn');gsSync();});}

