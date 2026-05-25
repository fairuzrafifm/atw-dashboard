// ===============================================================
// DAILY REPORT \u2014 QUANTITY BASED PROGRESS
// ===============================================================

function renderDailyReport(){
  const sel=$('drProjSel');
  if(sel){
    const cur=sel.value||selId;
    sel.innerHTML=P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
    if(cur)sel.value=cur;
    if(!sel.value&&selId)sel.value=selId;
  }
  const projId=sel?.value||P[0]?.id;
  const today=new Date().toISOString().slice(0,10);
  if(!$('drDate').value)$('drDate').value=today;
  const date=$('drDate').value||today;
  if(!projId)return;
  const weekNum=getWbsWeekNum(projId,date);
  const wb=$('drWeekBadge');
  if(wb){if(weekNum){wb.textContent='Minggu W'+String(weekNum).padStart(2,'0');wb.style.display='inline-block';}else wb.style.display='none';}
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  let dayPct=0,cumAct=0,cumPlan=0;
  leafNodes.forEach(node=>{
    const qtyPlan=+node.qtyPlan||0;const bobot=+node.bobot||0;
    const dl=node.dailyLogs||[];
    const todayLog=dl.find(l=>l.date===date);
    const todayQty=todayLog?.qty!=null?+todayLog.qty:0;
    if(qtyPlan>0&&todayQty>0)dayPct+=(bobot/100)*(todayQty/qtyPlan);
    const totalQty=Math.min(qtyPlan||999999,dl.filter(l=>l.date<=date).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0));
    if(qtyPlan>0)cumAct+=(bobot/100)*(totalQty/qtyPlan);
    if(weekNum&&node.weeklyPlan&&node.weeklyPlan[weekNum])cumPlan+=(bobot/100)*((+node.weeklyPlan[weekNum].cumPlan||+node.weeklyPlan[weekNum].wPlan||0)/100);
    else cumPlan+=(bobot/100)*(+node.cumPlan||0)/100;
  });
  if($('drK1'))$('drK1').textContent=(dayPct*100).toFixed(2)+'%';
  if($('drK2'))$('drK2').textContent=(cumAct*100).toFixed(2)+'%';
  if($('drK3'))$('drK3').textContent=(cumPlan*100).toFixed(2)+'%';
  const variance=cumAct-cumPlan;
  if($('drK4')){$('drK4').textContent=(variance>=0?'+':'')+(variance*100).toFixed(2)+'%';$('drK4').style.color=variance>=0?'var(--gn)':variance>=-0.0005?'var(--yw)':'var(--rd)';}
  if($('drK5'))$('drK5').textContent=weekNum?'W'+String(weekNum).padStart(2,'0'):'\u2014';
  if($('drDateLabel'))$('drDateLabel').textContent=date;
  renderDrMainTable(projId,date);
}
function renderDrMainTable(projId,date){
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  if(!cats.length){$('drTable').innerHTML='<div style="text-align:center;color:var(--mt);padding:30px">Setup WBS terlebih dahulu di tab <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M3 6v.01"/><path d="M3 12v.01"/><path d="M3 18v.01"/></svg> WBS</div>';return;}
  let html=`<table class="tbl"><thead><tr>
    <th style="width:50px">#</th><th>Item Pekerjaan</th>
    <th style="width:70px;text-align:right">Bobot</th>
    <th style="width:80px;text-align:right">Qty Plan</th>
    <th style="width:90px;text-align:right">Qty Hari Ini</th>
    <th style="width:80px;text-align:right">Qty Cum.</th>
    <th style="width:80px;text-align:right">% Selesai</th>
    <th style="width:80px;text-align:right">Kontribusi</th>
    <th style="width:60px;text-align:center">Satuan</th>
  </tr></thead><tbody>`;
  cats.forEach((cat,ci)=>{
    const catLeaves=all.filter(w=>(w.type==='item'&&all.some(x=>x.type==='subcat'&&x.parentId===cat.id&&x.id===w.parentId))||(w.type==='subcat'&&w.parentId===cat.id&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
    const catKontrib=catLeaves.reduce((s,n)=>s+_drNodeKontrib(n,date),0);
    html+=`<tr style="background:rgba(59,130,246,.08)"><td style="font-family:var(--fd);font-weight:700;color:var(--bl);font-size:13px">${String.fromCharCode(65+ci)}</td><td style="font-weight:700;color:var(--bl);font-size:12px">${safeStr(cat.name)}</td><td colspan="5"></td><td style="text-align:right;font-family:var(--fm);font-weight:700;color:var(--gn)">${(catKontrib*100).toFixed(2)}%</td><td></td></tr>`;
    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>a.order-b.order);
      const isLeaf=subItems.length===0;
      if(isLeaf){html+=_drNodeRow(`${ci+1}.${si+1}`,sub,date,22);}
      else{
        const subKontrib=subItems.reduce((s,x)=>s+_drNodeKontrib(x,date),0);
        html+=`<tr style="background:rgba(16,185,129,.05)"><td style="padding-left:16px;color:var(--gn);font-weight:600;font-family:var(--fm)">${ci+1}.${si+1}</td><td style="padding-left:22px;color:var(--gn);font-size:12px;font-weight:600">${safeStr(sub.name)}</td><td colspan="5"></td><td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--gn)">${(subKontrib*100).toFixed(2)}%</td><td></td></tr>`;
        subItems.forEach((item,ii)=>{ html+=_drNodeRow(`${ci+1}.${si+1}.${ii+1}`,item,date,38); });
      }
    });
  });
  html+='</tbody></table>';
  $('drTable').innerHTML=html;
}
function _drNodeKontrib(node,date){
  const qtyPlan=+node.qtyPlan||0;const bobot=+node.bobot||0;
  if(!qtyPlan)return (bobot/100)*(+node.cumActual||0)/100;
  const totalQty=Math.min(qtyPlan,(node.dailyLogs||[]).filter(l=>l.date<=date).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0));
  return (bobot/100)*(totalQty/qtyPlan);
}
function _drNodeRow(num,node,date,indent){
  const qtyPlan=+node.qtyPlan||0;const sat=safeStr(node.qtySatuan)||'';const bobot=+node.bobot||0;
  const dl=node.dailyLogs||[];
  const todayLog=dl.find(l=>l.date===date)||{};
  const todayQty=todayLog.qty!=null?+todayLog.qty:0;
  const cumQty=Math.min(qtyPlan||999999,dl.filter(l=>l.date<=date).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0));
  const pct=qtyPlan>0?Math.min(100,cumQty/qtyPlan*100):(+node.cumActual||0);
  const kontrib=qtyPlan>0?(bobot/100)*(cumQty/qtyPlan):(bobot/100)*(pct/100);
  const noQty=!qtyPlan;const bg=todayQty>0?'background:rgba(16,185,129,.04)':'';
  return `<tr style="${bg}"><td style="padding-left:${indent}px;font-size:10px;color:var(--mt)">${num}</td>
    <td style="padding-left:${indent+8}px;font-size:11px">${safeStr(node.name)}</td>
    <td style="text-align:right;font-family:var(--fm);font-size:11px">${bobot.toFixed(2)}%</td>
    <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--bl)">${noQty?'\u2014':qtyPlan+' '+sat}</td>
    <td style="text-align:right;font-family:var(--fm);font-size:12px;font-weight:700;color:${todayQty>0?'var(--gn)':'var(--mt)'}">${todayQty>0?'+'+todayQty+' '+sat:'\u2014'}</td>
    <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--or)">${noQty?'\u2014':cumQty+' '+sat}</td>
    <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--or);font-weight:600">${pct.toFixed(1)}%</td>
    <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--gn)">${(kontrib*100).toFixed(2)}%</td>
    <td style="text-align:center;font-size:10px;color:var(--mt)">${sat}</td>
  </tr>`;
}
function renderDrQtySetupForm(){
  const projId=$('drSetupProj')?.value;if(!projId){$('drQtySetupForm').innerHTML='';return;}
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  if(!leafNodes.length){$('drQtySetupForm').innerHTML='<div style="text-align:center;color:var(--mt);padding:20px">Belum ada item WBS</div>';return;}
  let html='';
  cats.forEach((cat,ci)=>{
    html+=`<div style="font-family:var(--fd);font-size:12px;letter-spacing:1px;color:var(--bl);margin:10px 0 4px;padding:6px 10px;background:rgba(59,130,246,.07);border-radius:6px">${String.fromCharCode(65+ci)}. ${safeStr(cat.name)}</div>`;
    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id);
      const nodes=subItems.length?subItems:[sub];
      if(subItems.length)html+=`<div style="font-size:11px;color:var(--gn);padding:3px 10px;font-weight:600">${ci+1}.${si+1} ${safeStr(sub.name)}</div>`;
      nodes.forEach((node,ii)=>{
        const label=subItems.length?`${ci+1}.${si+1}.${ii+1} ${safeStr(node.name)}`:`${ci+1}.${si+1} ${safeStr(node.name)}`;
        html+=`<div style="display:grid;grid-template-columns:1fr 110px 130px;gap:8px;align-items:center;padding:5px 12px;border-bottom:1px solid var(--bd)">
          <div style="font-size:11px">${label} <span style="font-size:9px;color:var(--mt);font-family:var(--fm)">bobot:${(+node.bobot||0).toFixed(2)}%</span></div>
          <div>
            <label style="font-size:9px;color:var(--bl);display:block;font-weight:600">Qty Plan</label>
            <input type="number" min="0" step="1" placeholder="162"
              value="${node.qtyPlan!=null?node.qtyPlan:''}" id="drqp_${node.id}" class="fi"
              style="padding:4px 6px;font-size:13px;text-align:center;border-radius:4px;border:1px solid var(--bl);background:rgba(59,130,246,.06);width:100%">
          </div>
          <div>
            <label style="font-size:9px;color:var(--mt);display:block;font-weight:600">Satuan (pcs, m, unit...)</label>
            <input type="text" placeholder="pcs"
              value="${node.qtySatuan||''}" id="drqs_${node.id}" class="fi"
              style="padding:4px 6px;font-size:12px;border-radius:4px;width:100%">
          </div>
        </div>`;
      });
    });
  });
  $('drQtySetupForm').innerHTML=html;
}
function saveDrQtySetup(){
  const projId=$('drSetupProj').value;
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  leafNodes.forEach(node=>{
    const qp=$('drqp_'+node.id);const qs=$('drqs_'+node.id);
    if(qp)node.qtyPlan=qp.value!==''?+qp.value:null;
    if(qs)node.qtySatuan=qs.value.trim();
  });
  dirty();cm('drQtySetup');renderDailyReport();toast('✓ Setup qty disimpan');gsSync();
}
function renderDrInputForm(){
  const projId=$('drInputProj')?.value;
  const date=$('drInputDate')?.value||new Date().toISOString().slice(0,10);
  if(!projId){$('drInputForm').innerHTML='';return;}
  const weekNum=getWbsWeekNum(projId,date);
  const banner=$('drWeekInfoBanner');
  if(banner)banner.innerHTML=weekNum?`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> <b>${date}</b> = <b style="color:var(--or)">W${String(weekNum).padStart(2,'0')}</b> \u2014 Qty otomatis masuk ke minggu ini`:`⚠ Tanggal mulai project belum diset`;
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  if(!leafNodes.length){$('drInputForm').innerHTML='<div style="text-align:center;color:var(--mt);padding:20px">Setup WBS & Qty Plan terlebih dahulu</div>';return;}
  let html='';
  cats.forEach((cat,ci)=>{
    html+=`<div style="font-family:var(--fd);font-size:12px;letter-spacing:1px;color:var(--bl);margin:10px 0 4px;padding:6px 10px;background:rgba(59,130,246,.07);border-radius:6px">${String.fromCharCode(65+ci)}. ${safeStr(cat.name)}</div>`;
    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id);
      const nodes=subItems.length?subItems:[sub];
      if(subItems.length)html+=`<div style="font-size:11px;color:var(--gn);padding:3px 10px;font-weight:600">${ci+1}.${si+1} ${safeStr(sub.name)}</div>`;
      nodes.forEach((node,ii)=>{
        const label=subItems.length?`${ci+1}.${si+1}.${ii+1} ${safeStr(node.name)}`:`${ci+1}.${si+1} ${safeStr(node.name)}`;
        const qtyPlan=+node.qtyPlan||0;const dl=node.dailyLogs||[];
        const todayLog=dl.find(l=>l.date===date)||{};
        const cumQty=dl.filter(l=>l.date<date).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
        const pct=qtyPlan>0?Math.min(100,cumQty/qtyPlan*100):(+node.cumActual||0);
        html+=`<div style="display:grid;grid-template-columns:1fr 100px 1fr;gap:8px;align-items:center;padding:5px 12px;border-bottom:1px solid var(--bd)">
          <div>
            <span style="font-size:11px">${label}</span>
            <span style="font-size:9px;color:var(--mt);font-family:var(--fm);margin-left:6px">bobot:${(+node.bobot||0).toFixed(2)}%</span>
            ${qtyPlan?`<span style="font-size:9px;color:var(--bl);font-family:var(--fm);margin-left:4px">plan:${qtyPlan} ${node.qtySatuan||''}</span>`:''}
            <span style="font-size:9px;color:var(--or);font-family:var(--fm);margin-left:4px">cum:${cumQty} ${node.qtySatuan||''} (${pct.toFixed(1)}%)</span>
          </div>
          <div>
            <label style="font-size:9px;color:var(--gn);display:block;font-weight:600">Qty Hari Ini${node.qtySatuan?' ('+node.qtySatuan+')':''}</label>
            <input type="number" min="0" step="1" placeholder="0"
              value="${todayLog.qty!=null?todayLog.qty:''}"
              id="dri_${node.id}_qty" oninput="updateDrPreview()" class="fi"
              style="padding:5px 8px;font-size:14px;font-weight:700;text-align:center;border-radius:4px;border:1.5px solid ${todayLog.qty!=null?'var(--gn)':'var(--bd)'};background:${todayLog.qty!=null?'rgba(16,185,129,.08)':'var(--sf2)'};width:100%">
          </div>
          <div>
            <label style="font-size:9px;color:var(--mt);display:block">Catatan / Kendala</label>
            <input type="text" placeholder="kendala, aktivitas..."
              value="${todayLog.notes||''}" id="dri_${node.id}_notes" class="fi"
              style="padding:5px 8px;font-size:11px;border-radius:4px;width:100%">
          </div>
        </div>`;
      });
    });
  });
  $('drInputForm').innerHTML=html;updateDrPreview();
}
function updateDrPreview(){
  const projId=$('drInputProj')?.value;const date=$('drInputDate')?.value||new Date().toISOString().slice(0,10);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  let dayPct=0,cumPct=0;
  leafNodes.forEach(node=>{
    const qtyPlan=+node.qtyPlan||0;const bobot=+node.bobot||0;if(!qtyPlan)return;
    const todayQty=parseFloat($('dri_'+node.id+'_qty')?.value)||0;
    const prevQty=(node.dailyLogs||[]).filter(l=>l.date<date).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
    dayPct+=(bobot/100)*(todayQty/qtyPlan);
    cumPct+=(bobot/100)*Math.min(qtyPlan,prevQty+todayQty)/qtyPlan;
  });
  if($('drInputDayPct'))$('drInputDayPct').textContent=(dayPct*100).toFixed(2)+'%';
  if($('drInputCumPct'))$('drInputCumPct').textContent=(cumPct*100).toFixed(2)+'%';
}
function saveDrInput(){
  const projId=$('drInputProj').value;if(!projId){toast('Pilih project','error');return;}
  const date=$('drInputDate').value;const weekNum=getWbsWeekNum(projId,date);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  let saved=0;
  leafNodes.forEach(node=>{
    const qtyEl=$('dri_'+node.id+'_qty');if(!qtyEl||qtyEl.value==='')return;
    const qty=parseFloat(qtyEl.value)||0;
    const notes=($('dri_'+node.id+'_notes')?.value||'').trim();
    if(!node.dailyLogs)node.dailyLogs=[];
    const idx=node.dailyLogs.findIndex(l=>l.date===date);
    const entry={date,qty,notes,week:weekNum,ts:Date.now()};
    if(idx>=0)node.dailyLogs[idx]=entry;else node.dailyLogs.push(entry);
    node.dailyLogs.sort((a,b)=>a.date.localeCompare(b.date));
    // Update weeklyData dari qty
    if(weekNum&&+node.qtyPlan>0){
      if(!node.weeklyData)node.weeklyData={};
      const weekQty=node.dailyLogs.filter(l=>l.week===weekNum).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
      const wAct=Math.min(100,weekQty/node.qtyPlan*100);
      node.weeklyData[weekNum]={...(node.weeklyData[weekNum]||{}),wAct:Math.round(wAct*100)/100};
      const cumAct=Math.min(100,Object.keys(node.weeklyData).filter(k=>+k<=weekNum).reduce((s,k)=>s+(+(node.weeklyData[k].wAct||0)),0));
      node.weeklyData[weekNum].cAct=Math.round(cumAct*100)/100;
    }
    if(+node.qtyPlan>0){
      const totalQty=Math.min(+node.qtyPlan,node.dailyLogs.reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0));
      node.cumActual=Math.round(totalQty/node.qtyPlan*100*100)/100;
    }
    saved++;
  });
  if(!saved){toast('Tidak ada data diisi','warn');return;}
  _syncDailyToProject(projId);syncWbsToSCurve(projId);
  dirty();cm('drInput');render();if(selId)renderDetail(selId);renderWBS();renderDailyReport();
  // Jika S-Curve tab aktif, re-render
  if(activeTab==='scurve')renderSCurve();
  // Update WBS S-Curve preview jika WBS tab aktif
  if(activeTab==='wbs'){
    // Re-render S-Curve dengan projId yang benar dari selector
    const _wbsPid=String($('wbsProjSel')?.value||projId||selId||'');
    if(_wbsPid) setTimeout(()=>renderWbsSCurve(_wbsPid), 200);
  }
  gsSync();
  toast(`✓ Daily report ${date}${weekNum?' (W'+String(weekNum).padStart(2,'0')+')':''} disimpan`);
}
function toggleDrHistory(){
  const projId=$('drProjSel')?.value;if(!projId)return;
  const hCard=$('drHistCard');const btn=$('drHistBtn');
  if(!hCard)return;
  const isOpen=hCard.style.display!=='none';
  if(isOpen){
    hCard.style.display='none';
    if(btn){btn.textContent='📋 Lihat Riwayat';btn.style.borderColor='var(--bl)';btn.style.color='var(--bl)';}
    return;
  }
  hCard.style.display='block';
  if(btn){btn.textContent='✕ Tutup Riwayat';btn.style.borderColor='var(--rd)';btn.style.color='var(--rd)';}
  renderDailyHistoryTable(projId);
}
function renderDailyHistoryTable(projId){
  projId=projId||$('drProjSel')?.value;if(!projId)return;
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  const dateSet=new Set();
  leafNodes.forEach(n=>(n.dailyLogs||[]).forEach(l=>dateSet.add(l.date)));
  const dates=[...dateSet].sort().reverse();
  const proj=P.find(p=>String(p.id)===String(projId));
  if($('drHistTitle'))$('drHistTitle').textContent=proj?.kode||'';
  if(!dates.length){$('drHistTable').innerHTML='<div style="text-align:center;color:var(--mt);padding:20px">Belum ada data daily report</div>';return;}
  let html=`<table class="tbl"><thead><tr>
    <th>Tanggal</th><th>Minggu</th><th>Item</th>
    <th style="text-align:right">Qty</th>
    <th style="text-align:right">Kontribusi</th>
    <th>Catatan</th>
    <th style="width:50px"></th>
  </tr></thead><tbody>`;
  dates.forEach(date=>{
    const weekNum=getWbsWeekNum(projId,date);let first=true;
    leafNodes.forEach(node=>{
      const log=(node.dailyLogs||[]).find(l=>l.date===date);if(!log||(log.qty==null&&!log.notes))return;
      const qty=log.qty!=null?+log.qty:0;
      const qtyPlan=+node.qtyPlan||0;
      const kontrib=qtyPlan>0?(+node.bobot||0)*(qty/qtyPlan):0;
      html+=`<tr>
        <td style="font-family:var(--fm);font-size:10px;white-space:nowrap">${first?date:''}</td>
        <td style="color:var(--or);font-size:10px;font-family:var(--fm)">${first&&weekNum?'W'+String(weekNum).padStart(2,'0'):''}</td>
        <td style="font-size:11px">${safeStr(node.name)}</td>
        <td style="text-align:right;font-family:var(--fm);font-weight:700;color:var(--gn)">${qty>0?'+'+qty+' '+(node.qtySatuan||''):'\u2014'}</td>
        <td style="text-align:right;font-family:var(--fm);color:var(--gn)">${kontrib>0?(kontrib*100).toFixed(2)+'%':'\u2014'}</td>
        <td style="color:var(--mt);font-size:10px">${log.notes||'\u2014'}</td>
        <td style="text-align:center">
          <button class="btn btn-sm brd edit-only" style="padding:1px 5px;font-size:9px" onclick="delDailyLog('${node.id}','${date}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </td>
      </tr>`;
      first=false;
    });
  });
  html+='</tbody></table>';
  $('drHistTable').innerHTML=html;
}
function delDailyLog(nodeId,date){
  const node=WBS.find(w=>String(w.id)===String(nodeId));if(!node)return;
  showConfirm(`Hapus log ${date}?`,()=>{
    node.dailyLogs=(node.dailyLogs||[]).filter(l=>l.date!==date);
    _syncDailyToProject(node.projId);
    dirty();renderDailyReport();renderDailyHistoryTable(node.projId);gsSync();
    toast('Log dihapus','warn');
  });
}

