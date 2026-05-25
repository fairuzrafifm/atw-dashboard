// ===============================================================
// COST / FINANCE
// ===============================================================
let editCostId=null;

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

function toggleProcCost(status){
  const wrap=$('procCostWrap');
  if(!wrap)return;
  const show=['PO Issued','In Transit','On Site'].includes(status);
  wrap.style.display=show?'block':'none';
}

function getAllCosts(){
  // Gabungkan COSTS (OPEX) + PROC yang sudah ada harga
  const all=[];
  // OPEX entries
  COSTS.forEach(c=>all.push({...c,_src:'opex'}));
  // Procurement dengan harga — include rabItemId/rabKatId untuk RAB tracking
  PROC.filter(p=>p.harga&&+p.harga>0).forEach(p=>{
    all.push({
      id:'proc_'+String(p.id),
      projId:String(p.projId),
      date:p.due||'',
      rabItemId:p.rabItemId||null,
      rabKatId:p.rabKatId||null,
      type:'procurement',
      kategori:p.kategori||'Material',
      deskripsi:p.item+(p.supplier?` (${p.supplier})`:''),
      amount:+p.harga||0,
      paidBy:p.supplier||'',
      notes:p.notes||'',
      _src:'procurement'
    });
  });
  return all.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}

function renderCost(){
  // Sync project dropdown
  const fp=$('costFiltProj');
  if(fp){
    const cur=fp.value,wasManual=fp._costFiltManual;
    fp.innerHTML='<option value="">Semua Project</option>'+P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
    fp._costFiltManual=wasManual;
    if(wasManual&&cur!==undefined)fp.value=cur;
    else if(selId)fp.value=selId;
  }
  const filtProj=gv('costFiltProj')||'';
  const filtType=gv('costFiltType')||'';
  const search=(gv('costSearch')||'').toLowerCase();
  const all=getAllCosts();
  const filtered=all.filter(c=>{
    if(filtProj&&String(c.projId)!==String(filtProj))return false;
    if(filtType&&c.type!==filtType)return false;
    if(search&&!c.deskripsi?.toLowerCase().includes(search)&&!c.kategori?.toLowerCase().includes(search))return false;
    return true;
  });

  // KPI
  const totalAll=all.reduce((s,c)=>s+(+c.amount||0),0);
  const totalProc=all.filter(c=>c.type==='procurement').reduce((s,c)=>s+(+c.amount||0),0);
  const totalOpex=all.filter(c=>c.type==='opex'||c.type==='other').reduce((s,c)=>s+(+c.amount||0),0);
  $('ck1').textContent=fmtRpShort(totalAll);
  $('ck1s').textContent=`${all.length} entri · ${P.length} project`;
  $('ck2').textContent=fmtRpShort(totalProc);
  $('ck2s').textContent=`${PROC.filter(p=>p.harga&&+p.harga>0).length} item PO`;
  $('ck3').textContent=fmtRpShort(totalOpex);
  $('ck3s').textContent=`${COSTS.length} entri OPEX`;
  // Project terbesar
  const byProj={};
  all.forEach(c=>{const k=String(c.projId);byProj[k]=(byProj[k]||0)+(+c.amount||0);});
  const topProjId=Object.entries(byProj).sort((a,b)=>b[1]-a[1])[0];
  if(topProjId){
    const tp=P.find(p=>String(p.id)===topProjId[0]);
    $('ck4').textContent=tp?.kode||'\u2014';
    $('ck4s').textContent=fmtRpShort(topProjId[1]);
  }

  // Summary per project
  const summEl=$('costSummaryTable');
  if(summEl){
    const projRows=P.map(p=>{
      const pid=String(p.id);
      const pAll=all.filter(c=>String(c.projId)===pid);
      const pProc=pAll.filter(c=>c.type==='procurement').reduce((s,c)=>s+(+c.amount||0),0);
      const pOpex=pAll.filter(c=>c.type!=='procurement').reduce((s,c)=>s+(+c.amount||0),0);
      const pTotal=pProc+pOpex;
      return{p,pTotal,pProc,pOpex};
    }).filter(r=>r.pTotal>0).sort((a,b)=>b.pTotal-a.pTotal);
    const grandTotal=projRows.reduce((s,r)=>s+r.pTotal,0);
    if(!projRows.length){
      summEl.innerHTML='<div style="text-align:center;color:var(--mt);font-size:12px;padding:16px">Belum ada data cost</div>';
    }else{
      summEl.innerHTML=`<table class="tbl"><thead><tr>
        <th>Project</th><th>Procurement</th><th>Operasional</th><th>Total</th><th>% dari Semua</th>
      </tr></thead><tbody>
      ${projRows.map(({p,pTotal,pProc,pOpex})=>{
        const pct=grandTotal?Math.round(pTotal/grandTotal*100):0;
        return`<tr>
          <td><span style="font-family:var(--fm);color:var(--bl);font-size:11px">${p.kode}</span><br><span style="font-size:10px;color:var(--mt)">${p.nama}</span></td>
          <td style="font-family:var(--fm);color:var(--bl)">${fmtRp(pProc)}</td>
          <td style="font-family:var(--fm);color:var(--pu)">${fmtRp(pOpex)}</td>
          <td style="font-family:var(--fm);font-weight:700;color:var(--or)">${fmtRp(pTotal)}</td>
          <td style="min-width:100px">
            <div style="display:flex;align-items:center;gap:6px">
              <div class="cost-bar" style="flex:1"><div class="cost-bar-fill" style="width:${pct}%"></div></div>
              <span style="font-size:10px;font-family:var(--fm);color:var(--mt);width:28px">${pct}%</span>
            </div>
          </td>
        </tr>`;}).join('')}
      <tr style="border-top:2px solid var(--bd);font-weight:700">
        <td style="color:var(--tx)">TOTAL</td>
        <td style="font-family:var(--fm);color:var(--bl)">${fmtRp(projRows.reduce((s,r)=>s+r.pProc,0))}</td>
        <td style="font-family:var(--fm);color:var(--pu)">${fmtRp(projRows.reduce((s,r)=>s+r.pOpex,0))}</td>
        <td style="font-family:var(--fm);color:var(--or)">${fmtRp(grandTotal)}</td>
        <td></td>
      </tr>
      </tbody></table>`;
    }
  }

  // Detail table
  const detEl=$('costDetailTable');
  if(!detEl)return;
  if(!filtered.length){
    detEl.innerHTML=`<div style="text-align:center;color:var(--mt);font-size:12px;padding:22px">${all.length?'Tidak ada entri cocok filter':'Belum ada data pengeluaran \u2014 klik ＋ Tambah Pengeluaran atau update harga di Procurement'}</div>`;
    return;
  }
  const typeLabel=t=>t==='procurement'?`<span class="cost-type-proc">PROC</span>`:t==='opex'?`<span class="cost-type-opex">OPEX</span>`:`<span class="cost-type-other">LAIN</span>`;
  detEl.innerHTML=`<table class="tbl" style="border-collapse:collapse;width:100%"><thead><tr>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Tgl</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Project</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Tipe</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Kategori</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Deskripsi</th>
    <th title="Alokasi RAB" style="white-space:nowrap;position:sticky;top:0;background:var(--sf);z-index:3">RAB Link</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Dibayar oleh</th>
    <th style="text-align:right;position:sticky;top:0;background:var(--sf);z-index:3">Jumlah</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3"></th>
  </tr></thead><tbody>
  ${filtered.map(co=>{
    const pr=P.find(p=>String(p.id)===String(co.projId));
    const canEdit=co._src==='opex'||co._src==='other';
    let rabTag='<span style="font-size:9px;color:var(--bd)">—</span>';
    if(co.rabItemId){
      const ri=RAB.find(r=>String(r.id)===String(co.rabItemId));
      if(ri)rabTag='<span style="font-size:9px;background:rgba(59,130,246,.12);color:var(--bl);padding:1px 5px;border-radius:3px;white-space:nowrap;display:inline-block" title="'+(ri.deskripsi||ri.name||'')+'">'+(ri.deskripsi||ri.name||'').slice(0,20)+'</span>';
    }else if(co.rabKatId){
      const rk=RAB.find(r=>String(r.id)===String(co.rabKatId));
      if(rk)rabTag='<span style="font-size:9px;background:rgba(139,92,246,.1);color:var(--pu);padding:1px 5px;border-radius:3px;white-space:nowrap;display:inline-block" title="'+(rk.name||'')+'">'+( rk.name||'').slice(0,20)+'</span>';
    }
    return`<tr>
      <td style="font-family:var(--fm);font-size:10px;white-space:nowrap">${co.date||'—'}</td>
      <td style="font-family:var(--fm);font-size:10px;color:var(--bl)">${pr?.kode||'—'}</td>
      <td>${typeLabel(co.type)}</td>
      <td style="color:var(--mt);font-size:11px">${co.kategori||'—'}</td>
      <td style="font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${co.deskripsi||''}">${co.deskripsi||'—'}</td>
      <td>${rabTag}</td>
      <td style="color:var(--mt);font-size:11px">${co.paidBy||'—'}</td>
      <td style="font-family:var(--fm);font-weight:700;color:var(--gn);text-align:right;white-space:nowrap">${fmtRp(co.amount)}</td>
      <td>${canEdit?`<button class="btn btn-sm edit-only" style="padding:2px 6px" onclick="openModal('editCost','${co.id}')">&#x270F;</button>`:'<span style="font-size:9px;color:var(--mt)">via Proc</span>'}</td>
    </tr>`;}).join('')}
  </tbody></table>`;
}

function openCostModal(id=null){
  editCostId=id?String(id):null;
  $('costMT').textContent=id?'EDIT PENGELUARAN':'TAMBAH PENGELUARAN';
  $('btnSaveCost').innerHTML=id?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan':'＋ Tambah';
  $('btnDelCost').style.display=id?'block':'none';
  $('cProj').innerHTML=P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
  const entry=id?COSTS.find(x=>String(x.id)===String(id)):null;
  if(entry){
    sv('cProj',String(entry.projId));sv('cDate',entry.date||'');
    sv('cType',entry.type||'opex');sv('cKat',entry.kategori||'');
    sv('cDesc',entry.deskripsi||'');
    if($('cAmount'))$('cAmount').value=entry.amount||'';
    sv('cPaidBy',entry.paidBy||'');sv('cNotes',entry.notes||'');
    sv('cRef',entry.ref||'');sv('cStatus',entry.status||'unpaid');
    _updateCostKatList(entry.projId);
    _populateCostRab(String(entry.projId), entry.rabKatId||'', entry.rabItemId||'');
  }else{
    const _cp=String(selId||P[0]?.id||'');
    sv('cProj',_cp);sv('cDate',new Date().toISOString().slice(0,10));
    sv('cType','opex');sv('cKat','');sv('cDesc','');
    if($('cAmount'))$('cAmount').value='';
    sv('cPaidBy','');sv('cNotes','');sv('cRef','');sv('cStatus','unpaid');
    _updateCostKatList(_cp);
    _populateCostRab(_cp,'','');
  }
  $('cBudgetPreview').style.display='none';
  show('ov-addCost');
}

function saveCost(){
  const desc=(gv('cDesc')||'').trim();
  const amt=+gv('cAmount')||0;
  if(!desc){toast('Deskripsi wajib diisi','error');return;}
  if(!amt){toast('Jumlah wajib diisi','error');return;}
  const rabKatId=gv('cRabKat')||'';
  const rabItemId=gv('cRabItem')||'';
  // Auto-isi kategori dari nama RAB item jika dipilih
  let katVal=(gv('cKat')||'').trim();
  if(!katVal&&rabItemId){
    const ri=RAB.find(r=>String(r.id)===rabItemId);
    if(ri)katVal=(ri.deskripsi||ri.name||'').slice(0,60);
  }
  if(!katVal&&rabKatId){
    const rk=RAB.find(r=>String(r.id)===rabKatId);
    if(rk)katVal=rk.name||'Lainnya';
  }
  const d={
    projId:String(gv('cProj')||selId||''),
    date:gv('cDate')||new Date().toISOString().slice(0,10),
    type:gv('cType')||'opex',
    kategori:(katVal||'Lainnya'),
    deskripsi:desc,
    amount:amt,
    paidBy:(gv('cPaidBy')||'').trim(),
    notes:(gv('cNotes')||'').trim(),
    ref:(gv('cRef')||'').trim(),
    status:gv('cStatus')||'unpaid',
    rabKatId:rabKatId||null,
    rabItemId:rabItemId||null
  };
  if(editCostId){
    const i=COSTS.findIndex(x=>String(x.id)===String(editCostId));
    if(i>=0)COSTS[i]={...COSTS[i],...d};
    toast('Pengeluaran diupdate ✓');
  }else{
    d.id=genId();
    COSTS.push(d);
    toast('Pengeluaran ditambahkan ✓');
  }
  dirty();cm('addCost');renderCost();
  if(activeTab==='overview')renderOV();
  gsSync();
}

// ── RAB COST LINK HELPERS ────────────────────────────────────────────────────

// Hitung total pengeluaran yang ter-link ke sebuah RAB item
function _getRabItemUsed(rabItemId, excludeCostId){
  // OPEX costs
  const opex=COSTS.filter(c=>
    String(c.rabItemId)===String(rabItemId) &&
    (!excludeCostId||String(c.id)!==String(excludeCostId))
  ).reduce((s,c)=>s+(+c.amount||0),0);
  // Procurement dengan harga
  const proc=PROC.filter(p=>
    String(p.rabItemId)===String(rabItemId) &&
    p.harga&&+p.harga>0 &&
    (!excludeCostId||String('proc_'+p.id)!==String(excludeCostId))
  ).reduce((s,p)=>s+(+p.harga||0),0);
  return opex+proc;
}
function _getRabKatUsed(rabKatId, excludeCostId){
  // OPEX costs
  const opex=COSTS.filter(c=>
    String(c.rabKatId)===String(rabKatId) &&
    (!excludeCostId||String(c.id)!==String(excludeCostId))
  ).reduce((s,c)=>s+(+c.amount||0),0);
  // Procurement dengan harga
  const proc=PROC.filter(p=>
    String(p.rabKatId)===String(rabKatId) &&
    p.harga&&+p.harga>0 &&
    (!excludeCostId||String('proc_'+p.id)!==String(excludeCostId))
  ).reduce((s,p)=>s+(+p.harga||0),0);
  return opex+proc;
}

// Populate RAB dropdowns berdasarkan projId, restore selection jika ada
function _populateCostRab(projId, selKatId, selItemId){
  const kats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(projId))
    .sort((a,b)=>(+a.urutan||0)-(+b.urutan||0)||(a.name>b.name?1:-1));
  const rabKatSel=$('cRabKat');
  if(!rabKatSel)return;

  if(!kats.length){
    rabKatSel.innerHTML='<option value="">— Tidak dialokasikan —</option>';
    const ni=$('cRabNoRab');if(ni)ni.style.display='block';
    const bi=$('cRabBudgetInfo');if(bi)bi.style.display='none';
    const ri=$('cRabItem');if(ri)ri.innerHTML='<option value="">— Pilih sub-item —</option>';
    return;
  }
  const ni=$('cRabNoRab');if(ni)ni.style.display='none';
  rabKatSel.innerHTML='<option value="">— Tidak dialokasikan —</option>'+
    kats.map(k=>`<option value="${k.id}">${k.name}</option>`).join('');
  if(selKatId)rabKatSel.value=selKatId;
  _populateCostRabItems(projId, rabKatSel.value, selItemId);
  _updateCostRabBudget();
}

// Populate sub-item dropdown berdasarkan kategori RAB yang dipilih
function _populateCostRabItems(projId, katId, selItemId){
  const itemSel=$('cRabItem');if(!itemSel)return;
  if(!katId){
    itemSel.innerHTML='<option value="">— Pilih sub-item —</option>';
    const bi=$('cRabBudgetInfo');if(bi)bi.style.display='none';
    return;
  }
  const items=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(projId)&&String(r.katId)===String(katId))
    .sort((a,b)=>(+a.urutan||0)-(+b.urutan||0));
  itemSel.innerHTML='<option value="">— Pilih sub-item —</option>'+
    items.map(it=>{
      const budget=+it.total||0;
      const used=_getRabItemUsed(it.id, editCostId||'');
      const sisa=budget-used;
      const pct=budget>0?Math.round(used/budget*100):0;
      const warn=pct>=90?'⚠ ':'';
      const budgetStr=budget>0?` — Rp ${(+sisa).toLocaleString('id-ID')} sisa`:'';
      return`<option value="${it.id}">${warn}${it.deskripsi||it.name||'Item'}${budgetStr}</option>`;
    }).join('');
  if(selItemId)itemSel.value=selItemId;
  _updateCostRabBudget();
}

// Update budget info bar
function _updateCostRabBudget(){
  const bi=$('cRabBudgetInfo');if(!bi)return;
  const itemId=gv('cRabItem')||'';
  const katId=gv('cRabKat')||'';
  const amount=+($('cAmount')?.value||0);

  if(itemId){
    const ri=RAB.find(r=>String(r.id)===itemId);
    if(!ri){bi.style.display='none';return;}
    const budget=+ri.total||0;
    const used=_getRabItemUsed(itemId, editCostId||'');
    const afterThis=used+amount;
    const sisa=budget-afterThis;
    const pct=budget>0?Math.min(100,Math.round(afterThis/budget*100)):0;
    bi.style.display='block';
    const lbl=$('cRabBudgetLabel');const bAmt=$('cRabBudgetAmt');
    const uAmt=$('cRabUsedAmt');const bar=$('cRabBar');const sAmt=$('cRabSisaAmt');
    if(lbl)lbl.textContent=(ri.deskripsi||ri.name||'Item')+':';
    if(bAmt)bAmt.textContent=budget>0?'Rp '+budget.toLocaleString('id-ID'):'Tidak diset';
    if(uAmt)uAmt.textContent='Rp '+afterThis.toLocaleString('id-ID')+' ('+pct+'%)';
    if(bar){
      bar.style.width=pct+'%';
      bar.style.background=pct>=100?'var(--rd)':pct>=85?'var(--yw)':'linear-gradient(90deg,var(--gn),#34d399)';
    }
    if(sAmt){
      sAmt.textContent='Rp '+Math.abs(sisa).toLocaleString('id-ID')+(sisa<0?' (OVER!)':'');
      sAmt.style.color=sisa<0?'var(--rd)':sisa<budget*0.1?'var(--yw)':'var(--gn)';
    }
  }else if(katId){
    // Tampilkan info level kategori
    const rk=RAB.find(r=>String(r.id)===katId);
    const katItems=RAB.filter(r=>r.type==='item'&&String(r.katId)===katId);
    const totalBudget=katItems.reduce((s,r)=>s+(+r.total||0),0);
    const totalUsed=_getRabKatUsed(katId, editCostId||'')+amount;
    const pct=totalBudget>0?Math.min(100,Math.round(totalUsed/totalBudget*100)):0;
    const sisa=totalBudget-totalUsed;
    bi.style.display='block';
    const lbl=$('cRabBudgetLabel');const bAmt=$('cRabBudgetAmt');
    const uAmt=$('cRabUsedAmt');const bar=$('cRabBar');const sAmt=$('cRabSisaAmt');
    if(lbl)lbl.textContent=(rk?.name||'Kategori')+' (total):';
    if(bAmt)bAmt.textContent=totalBudget>0?'Rp '+totalBudget.toLocaleString('id-ID'):'Tidak diset';
    if(uAmt)uAmt.textContent='Rp '+totalUsed.toLocaleString('id-ID')+(totalBudget>0?' ('+pct+'%)':'');
    if(bar){bar.style.width=pct+'%';bar.style.background=pct>=100?'var(--rd)':pct>=85?'var(--yw)':'linear-gradient(90deg,var(--gn),#34d399)';}
    if(sAmt){
      sAmt.textContent=totalBudget>0?'Rp '+Math.abs(sisa).toLocaleString('id-ID')+(sisa<0?' (OVER!)':''):'\u2014';
      sAmt.style.color=sisa<0?'var(--rd)':sisa<totalBudget*0.1?'var(--yw)':'var(--gn)';
    }
  }else{
    bi.style.display='none';
  }
}

// Event handlers
function _onCostProjChange(){
  const projId=gv('cProj')||'';
  _updateCostKatList(projId);
  _populateCostRab(projId,'','');
  $('cBudgetPreview').style.display='none';
}
function _onCostTypeChange(){
  // bisa dipakai untuk logika khusus per tipe
}
function _onCostRabKatChange(){
  const projId=gv('cProj')||'';
  const katId=gv('cRabKat')||'';
  _populateCostRabItems(projId, katId, '');
  // Auto-isi field Kategori dengan nama RAB kategori
  if(katId&&!gv('cKat')){
    const rk=RAB.find(r=>String(r.id)===katId);
    if(rk)sv('cKat',rk.name||'');
  }
  _updateCostRabBudget();
}
function _onCostRabItemChange(){
  const itemId=gv('cRabItem')||'';
  // Auto-isi field Kategori dengan nama RAB item
  if(itemId&&!gv('cKat')){
    const ri=RAB.find(r=>String(r.id)===itemId);
    if(ri)sv('cKat',(ri.deskripsi||ri.name||'').slice(0,60));
  }
  _updateCostRabBudget();
}
function _onCostAmountInput(){
  _updateCostRabBudget();
}

// ═══════════════════════════════════════════════════
// PROCUREMENT — RAB LINKING FUNCTIONS
// ═══════════════════════════════════════════════════

function _onProcProjChange(){
  const projId=gv('pProj')||'';
  _populateProcRab(projId,'','');
}

function _populateProcRab(projId, selKatId, selItemId){
  const kats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(projId))
    .sort((a,b)=>(+a.urutan||0)-(+b.urutan||0)||(a.name>b.name?1:-1));
  const rabKatSel=$('pRabKat');
  if(!rabKatSel)return;
  const noRab=$('pRabNoRab');
  if(!kats.length){
    rabKatSel.innerHTML='<option value="">— Tidak dialokasikan —</option>';
    if(noRab)noRab.style.display='block';
    const ri=$('pRabItem');if(ri)ri.innerHTML='<option value="">— Pilih sub-item —</option>';
    if($('pRabBudgetInfo'))$('pRabBudgetInfo').style.display='none';
    return;
  }
  if(noRab)noRab.style.display='none';
  rabKatSel.innerHTML='<option value="">— Tidak dialokasikan —</option>'+
    kats.map(k=>`<option value="${k.id}">${k.name}</option>`).join('');
  if(selKatId)rabKatSel.value=String(selKatId);
  _populateProcRabItems(projId, rabKatSel.value, selItemId);
  // Trigger hide/fill logic
  if(selKatId||selItemId) _onProcRabItemChange();
  _updateProcRabBudget();
}

function _populateProcRabItems(projId, katId, selItemId){
  const itemSel=$('pRabItem');if(!itemSel)return;
  if(!katId){
    itemSel.innerHTML='<option value="">— Pilih sub-item —</option>';
    if($('pRabBudgetInfo'))$('pRabBudgetInfo').style.display='none';
    return;
  }
  const items=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(projId)&&String(r.katId)===String(katId))
    .sort((a,b)=>(+a.urutan||0)-(+b.urutan||0));
  itemSel.innerHTML='<option value="">— Pilih sub-item —</option>'+
    items.map(it=>{
      const budget=+it.total||0;
      const usedOpex=COSTS.filter(c=>String(c.rabItemId)===String(it.id)).reduce((s,c)=>s+(+c.amount||0),0);
      const usedProc=PROC.filter(p=>String(p.rabItemId)===String(it.id)&&p.harga&&+p.harga>0&&String(p.id)!==(editProcId||'')).reduce((s,p)=>s+(+p.harga||0),0);
      const used=usedOpex+usedProc;
      const sisa=budget-used;
      const pct=budget>0?Math.round(used/budget*100):0;
      const warn=pct>=90?'⚠ ':'';
      const budgetStr=budget>0?` — sisa Rp ${sisa.toLocaleString('id-ID')}`:'';
      return`<option value="${it.id}">${warn}${it.deskripsi||it.name||'Item'}${budgetStr}</option>`;
    }).join('');
  if(selItemId)itemSel.value=String(selItemId);
  _updateProcRabBudget();
}

function _updateProcRabBudget(){
  const bi=$('pRabBudgetInfo');if(!bi)return;
  const itemId=gv('pRabItem')||'';
  const katId=gv('pRabKat')||'';
  const harga=+($('pHarga')?.value||0);

  const _getProcUsed=(rabItemId)=>PROC.filter(p=>
    String(p.rabItemId)===String(rabItemId)&&p.harga&&+p.harga>0&&
    String(p.id)!==(editProcId||'')
  ).reduce((s,p)=>s+(+p.harga||0),0);
  const _getProcKatUsed=(rabKatId)=>PROC.filter(p=>
    String(p.rabKatId)===String(rabKatId)&&p.harga&&+p.harga>0&&
    String(p.id)!==(editProcId||'')
  ).reduce((s,p)=>s+(+p.harga||0),0);

  if(itemId){
    const ri=RAB.find(r=>String(r.id)===itemId);
    if(!ri){bi.style.display='none';return;}
    const budget=+ri.total||0;
    const usedOpex=COSTS.filter(c=>String(c.rabItemId)===itemId).reduce((s,c)=>s+(+c.amount||0),0);
    const usedProc=_getProcUsed(itemId);
    const afterThis=usedOpex+usedProc+harga;
    const sisa=budget-afterThis;
    const pct=budget>0?Math.min(100,Math.round(afterThis/budget*100)):0;
    bi.style.display='block';
    if($('pRabBudgetLabel'))$('pRabBudgetLabel').textContent=(ri.deskripsi||ri.name||'Item')+':';
    if($('pRabBudgetAmt'))$('pRabBudgetAmt').textContent=budget>0?'Rp '+budget.toLocaleString('id-ID'):'Tidak diset';
    if($('pRabUsedAmt'))$('pRabUsedAmt').textContent='Rp '+afterThis.toLocaleString('id-ID')+(budget>0?' ('+pct+'%)':'');
    if($('pRabBar')){
      $('pRabBar').style.width=pct+'%';
      $('pRabBar').style.background=pct>=100?'var(--rd)':pct>=85?'var(--yw)':'linear-gradient(90deg,var(--gn),#34d399)';
    }
    if($('pRabSisaAmt')){
      $('pRabSisaAmt').textContent='Rp '+Math.abs(sisa).toLocaleString('id-ID')+(sisa<0?' (OVER!)':'');
      $('pRabSisaAmt').style.color=sisa<0?'var(--rd)':sisa<budget*0.1?'var(--yw)':'var(--gn)';
    }
  } else if(katId){
    const rk=RAB.find(r=>String(r.id)===katId);
    const katItems=RAB.filter(r=>r.type==='item'&&String(r.katId)===katId);
    const totalBudget=katItems.reduce((s,r)=>s+(+r.total||0),0);
    const usedOpex=COSTS.filter(c=>String(c.rabKatId)===katId).reduce((s,c)=>s+(+c.amount||0),0);
    const usedProc=_getProcKatUsed(katId);
    const afterThis=usedOpex+usedProc+harga;
    const pct=totalBudget>0?Math.min(100,Math.round(afterThis/totalBudget*100)):0;
    const sisa=totalBudget-afterThis;
    bi.style.display='block';
    if($('pRabBudgetLabel'))$('pRabBudgetLabel').textContent=(rk?.name||'Kategori')+' (total):';
    if($('pRabBudgetAmt'))$('pRabBudgetAmt').textContent=totalBudget>0?'Rp '+totalBudget.toLocaleString('id-ID'):'Tidak diset';
    if($('pRabUsedAmt'))$('pRabUsedAmt').textContent='Rp '+afterThis.toLocaleString('id-ID')+(totalBudget>0?' ('+pct+'%)':'');
    if($('pRabBar')){
      $('pRabBar').style.width=pct+'%';
      $('pRabBar').style.background=pct>=100?'var(--rd)':pct>=85?'var(--yw)':'linear-gradient(90deg,var(--gn),#34d399)';
    }
    if($('pRabSisaAmt')){
      $('pRabSisaAmt').textContent=totalBudget>0?'Rp '+Math.abs(sisa).toLocaleString('id-ID')+(sisa<0?' (OVER!)':''):'—';
      $('pRabSisaAmt').style.color=sisa<0?'var(--rd)':sisa<totalBudget*0.1?'var(--yw)':'var(--gn)';
    }
  } else {
    bi.style.display='none';
  }
}

function _onProcRabKatChange(){
  const projId=gv('pProj')||'';
  const katId=gv('pRabKat')||'';
  _populateProcRabItems(projId, katId, '');
  if(katId){
    const rk=RAB.find(r=>String(r.id)===katId);
    _setProcKatFromRab(rk?.name||'');
    _hideProcKat(true);
  } else {
    _hideProcKat(false);
  }
  _updateProcRabBudget();
}

function _onProcRabItemChange(){
  const itemId=gv('pRabItem')||'';
  const katId=gv('pRabKat')||'';
  if(itemId){
    const ri=RAB.find(r=>String(r.id)===itemId);
    if(ri){
      // Auto-fill Nama Item jika kosong
      if(!gv('pItem'))sv('pItem',(ri.deskripsi||ri.name||'').slice(0,100));
      // Auto-fill Kategori dari parent RAB kat
      const rk=RAB.find(r=>String(r.id)===String(ri.katId));
      _setProcKatFromRab(rk?.name||ri.name||'');
    }
    _hideProcKat(true);
  } else if(katId){
    const rk=RAB.find(r=>String(r.id)===katId);
    _setProcKatFromRab(rk?.name||'');
    _hideProcKat(true);
  } else {
    _hideProcKat(false);
  }
  _updateProcRabBudget();
}

function _hideProcKat(hide){
  const wrap=$('pKatWrap');
  const hint=$('pKatHint');
  if(!wrap)return;
  if(hide){
    wrap.style.display='none';
  } else {
    wrap.style.display='block';
    if(hint)hint.textContent='';
  }
}

function _setProcKatFromRab(rabKatName){
  // Map nama RAB kategori ke option Kategori Proc
  const hint=$('pKatHint');
  const map={'equipment':'Equipment','material':'Material','civil':'Civil','service':'Service',
    'subcon':'Service','solar panel':'Material','pv':'Material','inverter':'Equipment',
    'cable':'Material','kabel':'Material','panel':'Equipment','struktur':'Civil','structure':'Civil'};
  const lower=(rabKatName||'').toLowerCase();
  let matched='Material'; // default
  for(const [key,val] of Object.entries(map)){
    if(lower.includes(key)){matched=val;break;}
  }
  sv('pKat',matched);
  if(hint)hint.textContent='(dari RAB: '+rabKatName+')';
}

function delCost(){
  showConfirm('Hapus entri pengeluaran ini?',()=>{
    const idx=COSTS.findIndex(c=>String(c.id)===String(editCostId));
    if(idx<0){cm('addCost');return;}

    // 1. Tandai _deleted di memory
    COSTS[idx]={...COSTS[idx],_deleted:true};
    addPendingDeleteCost(editCostId);

    // 2. Ambil snapshot COSTS+deleted SEKARANG sebelum difilter
    const costsSnapshot=[...COSTS];

    // 3. Filter lokal untuk UI
    COSTS=COSTS.filter(c=>!c._deleted);
    cm('addCost');renderCost();renderRab();
    toast('Pengeluaran dihapus','warn');

    // 4. Kirim snapshot (berisi _deleted record) langsung ke GSheet tanpa debounce
    dirty();
    _gsSyncWithCosts(costsSnapshot);
  });
}

function exportCostCSV(){
  const all=getAllCosts();
  if(!all.length){toast('Tidak ada data untuk di-export','warn');return;}
  const hdr=['Tanggal','Project','Kode','Tipe','Kategori','Deskripsi','Jumlah','Dibayar Oleh','Keterangan'];
  const rows=all.map(c=>{
    const pr=P.find(p=>String(p.id)===String(c.projId));
    return[c.date||'',pr?.nama||'',pr?.kode||'',c.type||'',c.kategori||'',c.deskripsi||'',c.amount||0,c.paidBy||'',c.notes||''];
  });
  const csv=[hdr,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=`ATW_Cost_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();URL.revokeObjectURL(url);
  toast('CSV berhasil di-export ✓');
}

function sanitizeCosts(arr){
  const seen=new Set();
  return(arr||[]).filter(c=>c.deskripsi||c.amount).map(c=>({
    id:String(c.id||Date.now()),
    projId:String(c.projId||''),
    date:String(c.date||'').slice(0,10),
    type:String(c.type||'opex'),
    kategori:String(c.kategori||'Lainnya').slice(0,100),
    deskripsi:String(c.deskripsi||'').slice(0,300),
    amount:+c.amount||0,
    paidBy:String(c.paidBy||'').slice(0,100),
    notes:String(c.notes||'').slice(0,300),
    ref:String(c.ref||'').slice(0,100),
    status:['paid','unpaid','partial'].includes(c.status)?c.status:'unpaid',
    rabKatId:c.rabKatId?String(c.rabKatId):null,
    rabItemId:c.rabItemId?String(c.rabItemId):null
  })).filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;});
}

// RAB default categories
const RAB_DEFAULT_CATS=['Material & Equipment','Manpower','Subkontraktor','Transportasi & Logistik','Overhead & Administrasi','Contingency'];

function sanitizeRab(arr){
  const seen=new Set();
  return(arr||[]).filter(r=>r.id).map(r=>({
    id:String(r.id||Date.now()),
    projId:String(r.projId||''),
    type:String(r.type||'item'), // 'kat' | 'item'
    katId:r.katId!=null?String(r.katId):'',
    name:String(r.name||'').slice(0,200),       // for type='kat'
    deskripsi:String(r.deskripsi||'').slice(0,300), // for type='item'
    satuan:String(r.satuan||'').slice(0,50),
    volume:+r.volume||0,
    hargaSatuan:+r.hargaSatuan||0,
    total:+r.total||0,
    notes:String(r.notes||'').slice(0,300),
    urutan:+r.urutan||0,
    isCustom:!!r.isCustom,
    procKat:String(r.procKat||'')
  })).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
}

// ===============================================================
// RAB \u2014 RENCANA ANGGARAN BIAYA
// ===============================================================

// Helper: get actual spending per RAB kategori for a project
function getRabActualByKat(projId){
  const allCosts=getAllCosts().filter(c=>String(c.projId)===String(projId));
  const byKat={};  // katId -> total actual
  const byItem={};  // itemId -> total actual (untuk display per-item)

  const rabItems=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(projId));
  const rabKats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(projId));

  // procKat -> rabKatId fallback map (untuk procurement lama tanpa rabKatId)
  const procKatToRabKat={};
  rabItems.forEach(ri=>{ if(ri.procKat)procKatToRabKat[ri.procKat]=ri.katId; });

  allCosts.forEach(c=>{
    const amt=+c.amount||0;
    if(!amt)return;
    let katId=null;

    // PRIORITAS 1: rabItemId langsung (paling akurat)
    if(c.rabItemId){
      const ri=rabItems.find(r=>String(r.id)===String(c.rabItemId));
      if(ri){
        katId=ri.katId;
        byItem[String(c.rabItemId)]=(byItem[String(c.rabItemId)]||0)+amt;
      }
    }
    // PRIORITAS 2: rabKatId langsung
    else if(c.rabKatId){
      const rk=rabKats.find(r=>String(r.id)===String(c.rabKatId));
      if(rk)katId=rk.id;
    }
    // PRIORITAS 3: procurement match via procKat
    else if(c.type==='procurement'&&c.kategori&&procKatToRabKat[c.kategori]){
      katId=procKatToRabKat[c.kategori];
    }
    // PRIORITAS 4: nama kategori sama persis
    else{
      const matchKat=rabKats.find(r=>r.name===c.kategori);
      if(matchKat)katId=matchKat.id;
    }

    if(katId)byKat[String(katId)]=(byKat[String(katId)]||0)+amt;
    else byKat['_uncat']=(byKat['_uncat']||0)+amt;
  });

  // Expose byItem untuk dipakai renderRab
  getRabActualByKat._byItem=byItem;
  return byKat;
}

function renderRab(){
  // Sync project dropdown
  const fp=$('rabFiltProj');
  if(fp){
    const cur=fp.value;
    fp.innerHTML='<option value="">\u2014 Pilih Project \u2014</option>'+P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
    if(cur)fp.value=cur;
  }
  const projId=gv('rabFiltProj');
  const btnAdd=$('btnAddRabItem');
  if(btnAdd)btnAdd.style.display=projId?'block':'none';

  const rabKpiRow=$('rabKpiRow');
  const rabTable=$('rabTable');
  if(!rabTable)return;

  if(!projId){
    rabTable.innerHTML='<div style="text-align:center;color:var(--mt);font-size:12px;padding:24px">Pilih project untuk melihat RAB</div>';
    if(rabKpiRow)rabKpiRow.style.display='none';
    return;
  }

  const kats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(projId)).sort((a,b)=>a.urutan-b.urutan||(a.name>b.name?1:-1));
  const items=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(projId));
  const actualByKat=getRabActualByKat(projId);

  // Total RAB
  const totalRab=items.reduce((s,i)=>s+(+i.total||0),0);
  const totalActual=Object.values(actualByKat).reduce((s,v)=>s+v,0);
  const sisaAngg=totalRab-totalActual;
  const pctUsed=totalRab>0?Math.round(totalActual/totalRab*100):0;
  const critKats=kats.filter(k=>{
    const rabKat=items.filter(i=>i.katId===k.id).reduce((s,i)=>s+(+i.total||0),0);
    const act=actualByKat[k.id]||0;
    return rabKat>0&&act/rabKat>=0.9;
  }).length;

  // KPI
  if(rabKpiRow)rabKpiRow.style.display='block';
  const el1=$('rabK1');if(el1)el1.textContent=fmtRpShort(totalRab);
  const el1s=$('rabK1s');if(el1s)el1s.textContent=`${items.length} item di ${kats.length} kategori`;
  const el2=$('rabK2');if(el2)el2.textContent=fmtRpShort(totalActual);
  const el2s=$('rabK2s');if(el2s)el2s.textContent=`${pctUsed}% dari total RAB`;
  const el3=$('rabK3');
  if(el3){el3.textContent=fmtRpShort(Math.abs(sisaAngg));el3.style.color=sisaAngg<0?'var(--rd)':sisaAngg/totalRab<0.1&&totalRab>0?'var(--yw)':'var(--gn)';}
  const el3s=$('rabK3s');if(el3s)el3s.textContent=sisaAngg<0?'⚠ MELEBIHI RAB':sisaAngg===0?'Pas RAB':'Tersedia';
  const el4=$('rabK4');if(el4)el4.textContent=critKats;
  const el4s=$('rabK4s');if(el4s)el4s.textContent=`kategori sudah ≥90% terpakai`;

  if(!kats.length&&!items.length){
    rabTable.innerHTML=`<div style="text-align:center;color:var(--mt);font-size:12px;padding:24px">
      Belum ada RAB untuk project ini. Klik <strong>＋ Kategori</strong> untuk memulai.
    </div>`;
    return;
  }

  // Build table
  let rows='';
  kats.forEach(k=>{
    const katItems=items.filter(i=>i.katId===k.id);
    const rabKatTotal=katItems.reduce((s,i)=>s+(+i.total||0),0);
    const actKat=actualByKat[k.id]||0;
    const pctKat=rabKatTotal>0?Math.round(actKat/rabKatTotal*100):0;
    const sisaKat=rabKatTotal-actKat;
    const fillClass=pctKat>=100?'rab-pct-danger':pctKat>=90?'rab-pct-warn':'rab-pct-ok';
    const badge=pctKat>=100?`<span class="rab-badge-over">OVER ${pctKat}%</span>`:pctKat>=90?`<span class="rab-badge-warn">${pctKat}% ⚠</span>`:`<span class="rab-badge-ok">${pctKat}%</span>`;

    rows+=`<tr class="rab-kat-row" onclick="toggleRabKat('rkat_${k.id}')">
      <td colspan="4">
        <div class="rab-kat-name">
          <span id="rkat_${k.id}_ico">▼</span>
          <span style="font-size:12px">${k.name}</span>
          ${badge}
          <div class="rab-progress-bar" style="flex:1;max-width:140px">
            <div class="rab-progress-fill ${fillClass}" style="width:${Math.min(pctKat,100)}%"></div>
          </div>
        </div>
      </td>
      <td style="font-family:var(--fm);text-align:right;color:var(--bl)">${fmtRp(rabKatTotal)}</td>
      <td style="font-family:var(--fm);text-align:right;color:var(--gn)">${fmtRp(actKat)}</td>
      <td style="font-family:var(--fm);text-align:right;color:${sisaKat<0?'var(--rd)':sisaKat/rabKatTotal<0.1&&rabKatTotal>0?'var(--yw)':'var(--tx)'};font-weight:700">${fmtRp(Math.abs(sisaKat))}${sisaKat<0?' (OVER)':''}</td>
      <td class="edit-only" style="white-space:nowrap">
        <button class="btn btn-sm" style="padding:2px 6px;font-size:10px" onclick="event.stopPropagation();openRabKatModal('${k.id}')">✏</button>
        <button class="btn btn-sm" style="padding:2px 6px;font-size:10px;border-color:var(--bl);color:var(--bl)" onclick="event.stopPropagation();openRabItemModal(null,'${k.id}')">＋</button>
      </td>
    </tr>`;

    // Items under this kategori
    rows+=`<tbody id="rkat_${k.id}">`;
    if(katItems.length){
      katItems.sort((a,b)=>(+a.urutan||0)-(+b.urutan||0)||(a.deskripsi>b.deskripsi?1:-1)).forEach(item=>{
        const itemBudget=+item.total||0;
        const itemActual=(getRabActualByKat._byItem&&getRabActualByKat._byItem[String(item.id)])||COSTS.filter(co=>String(co.rabItemId)===String(item.id)).reduce((s,co)=>s+(+co.amount||0),0);
        const itemSisa=itemBudget-itemActual;
        const itemPct=itemBudget>0?Math.min(100,Math.round(itemActual/itemBudget*100)):0;
        const itemFillClass=itemPct>=100?'rab-pct-danger':itemPct>=85?'rab-pct-warn':'rab-pct-ok';
        const itemBadge=itemActual>0?(itemPct>=100?`<span class="rab-badge-over">OVER</span>`:itemPct>=85?`<span class="rab-badge-warn">${itemPct}%</span>`:`<span class="rab-badge-ok">${itemPct}%</span>`):'';
        rows+=`<tr class="rab-item-row" onclick="openCostFilteredByRabItem('${item.id}','${item.deskripsi||item.name||''}')" style="cursor:pointer" title="Klik untuk lihat pengeluaran item ini">
          <td style="padding-left:28px;color:var(--mt);font-size:10px">└</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            <span title="${item.deskripsi}">${item.deskripsi}</span>
            ${itemBadge}
          </td>
          <td style="color:var(--mt);font-size:10px;text-align:center">${item.volume||'\u2014'} ${item.satuan||''}</td>
          <td style="font-family:var(--fm);text-align:right;font-size:10px;color:var(--mt)">${fmtRp(item.hargaSatuan)}</td>
          <td style="font-family:var(--fm);text-align:right;color:var(--bl)">${fmtRp(itemBudget)}</td>
          <td style="font-family:var(--fm);text-align:right;color:${itemActual>0?'var(--or)':'var(--mt)'}">
            ${itemActual>0?fmtRp(itemActual):'<span style="font-size:10px">\u2014</span>'}
            ${itemActual>0?`<div class="rab-progress-bar" style="min-width:60px;margin-top:3px"><div class="rab-progress-fill ${itemFillClass}" style="width:${itemPct}%"></div></div>`:''}
          </td>
          <td style="font-family:var(--fm);text-align:right;color:${itemSisa<0?'var(--rd)':itemActual===0?'var(--mt)':itemSisa/itemBudget<0.1&&itemBudget>0?'var(--yw)':'var(--gn)'};font-weight:${itemActual>0?'700':'400'}">
            ${itemActual>0?fmtRp(Math.abs(itemSisa))+(itemSisa<0?' \u26A0':''):'<span style="font-size:10px">\u2014</span>'}
          </td>
          <td class="edit-only" style="white-space:nowrap;display:flex;gap:3px;align-items:center">
            <button class="btn btn-sm" style="padding:2px 6px;font-size:10px;border-color:var(--gn);color:var(--gn);font-weight:700" onclick="event.stopPropagation();addCostForRabItem('${item.id}','${item.katId}',\`${item.deskripsi||item.name||''}\`)" title="Input pengeluaran untuk item ini">＋</button>
            <button class="btn btn-sm" style="padding:2px 6px;font-size:10px" onclick="event.stopPropagation();openRabItemModal('${item.id}')">✏</button>
          </td>
        </tr>`;
      });
    } else {
      rows+=`<tr><td colspan="8" style="padding:6px 28px;color:var(--mt);font-size:11px;font-style:italic">Belum ada item \u2014 klik ＋ untuk tambah</td></tr>`;
    }
    rows+=`</tbody>`;
  });

  // Grand total row
  const grandTotal=items.reduce((s,i)=>s+(+i.total||0),0);
  const grandAct=Object.entries(actualByKat).filter(([k])=>k!=='_uncat').reduce((s,[,v])=>s+v,0);
  const grandSisa=grandTotal-grandAct;

  rabTable.innerHTML=`<table class="tbl" style="border-collapse:collapse;width:100%"><thead><tr style="position:sticky;top:0;z-index:3">
    <th style="width:20px;position:sticky;top:0;background:var(--sf);z-index:3"></th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Item</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Volume</th>
    <th style="position:sticky;top:0;background:var(--sf);z-index:3">Harga Satuan</th>
    <th style="text-align:right;position:sticky;top:0;background:var(--sf);z-index:3">RAB</th>
    <th style="text-align:right;position:sticky;top:0;background:var(--sf);z-index:3">Aktual</th>
    <th style="text-align:right;position:sticky;top:0;background:var(--sf);z-index:3">Sisa</th>
    <th class="edit-only" style="width:60px;position:sticky;top:0;background:var(--sf);z-index:3"></th>
  </tr></thead><tbody>
  ${rows}
  <tr style="border-top:2px solid var(--bd);font-weight:700;background:var(--sf2)">
    <td colspan="4" style="color:var(--tx)">TOTAL RAB</td>
    <td style="font-family:var(--fm);text-align:right;color:var(--bl)">${fmtRp(grandTotal)}</td>
    <td style="font-family:var(--fm);text-align:right;color:var(--gn)">${fmtRp(grandAct)}</td>
      <td style="font-family:var(--fm);text-align:right;color:${grandSisa<0?'var(--rd)':'var(--tx)'};font-weight:700">${fmtRp(Math.abs(grandSisa))}${grandSisa<0?' (OVER)':''}</td>
    <td></td>
  </tr>
  </tbody></table>`;
}

// Drill-down: klik RAB item → pindah ke tab Cost dengan filter item tersebut
// Shortcut: buka form pengeluaran langsung pre-fill ke RAB item tertentu
// Bisa dipanggil berkali-kali untuk input partial cost ke item yang sama
function addCostForRabItem(rabItemId, rabKatId, itemName){
  // Cari project dari RAB item
  const ri=RAB.find(r=>String(r.id)===String(rabItemId));
  const projId=ri?.projId||selId||P[0]?.id||'';
  // Set selId ke project ini
  if(projId&&selId!==projId){
    selId=projId;
    const psel=$('drProjSel');if(psel)psel.value=projId;
  }
  openCostModal(null); // buka fresh
  // Pre-fill setelah modal render
  setTimeout(()=>{
    // Set project
    const cpEl=$('cProj');if(cpEl){cpEl.value=String(projId);_onCostProjChange();}
    // Tunggu RAB dropdown populate lalu set values
    setTimeout(()=>{
      const rk=$('cRabKat');
      if(rk){rk.value=String(rabKatId||'');_onCostRabKatChange();}
      setTimeout(()=>{
        const ri2=$('cRabItem');
        if(ri2){ri2.value=String(rabItemId);_onCostRabItemChange();}
        // Pre-fill kategori dengan nama item
        if(!gv('cKat')&&itemName)sv('cKat',itemName);
        // Focus ke field jumlah
        const amtEl=$('cAmount');if(amtEl){amtEl.value='';amtEl.focus();}
        _updateCostRabBudget();
      },80);
    },80);
  },80);
}

function openCostFilteredByRabItem(rabItemId, itemName){
  // Pindah ke tab Cost
  const costTab=document.querySelector('.tab[onclick*="cost"]');
  if(costTab)costTab.click();
  // Set search filter
  setTimeout(()=>{
    const s=$('costSearch');
    if(s){s.value=itemName||'';renderCost();}
    toast('Menampilkan pengeluaran untuk: '+(itemName||'item ini'));
  },100);
}

function toggleRabKat(tbodyId){
  const tb=$(tbodyId);
  const ico=$(tbodyId+'_ico');
  if(!tb)return;
  const hidden=tb.style.display==='none';
  tb.style.display=hidden?'':'none';
  if(ico)ico.textContent=hidden?'▼':'\u25B6';
}

function calcRabTotal(){
  const vol=+gv('riVolume')||0;
  const harga=+gv('riHarga')||0;
  const total=vol*harga;
  const el=$('riTotal');
  if(el)el.value=total>0?total:'';
}

function updateRabKatDropdown(){
  const projId=gv('rkProj')||gv('rabFiltProj');
  // no-op for now, can add project-specific logic
}

function updateRabItemDropdown(){
  const projId=gv('riProj');
  const katSel=$('riKat');
  if(!katSel)return;
  const kats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(projId)).sort((a,b)=>a.urutan-b.urutan);
  katSel.innerHTML=kats.length
    ?kats.map(k=>`<option value="${k.id}">${k.name}</option>`).join('')
    :'<option value="">\u2014 Belum ada kategori \u2014</option>';
}

function openRabKatModal(id=null){
  editRabCatId=id?String(id):null;
  $('rabKatMT').textContent=id?'EDIT KATEGORI RAB':'TAMBAH KATEGORI RAB';
  $('btnSaveRabKat').innerHTML=id?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan':'＋ Tambah';
  $('btnDelRabKat').style.display=id?'block':'none';
  // Fill project dropdown
  $('rkProj').innerHTML=P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
  if(id){
    const k=RAB.find(r=>r.id===id&&r.type==='kat');
    if(k){
      sv('rkProj',String(k.projId));
      sv('rkName',k.name);
      sv('rkUrutan',k.urutan||1);
    }
  } else {
    sv('rkProj',gv('rabFiltProj')||selId||'');
    sv('rkName','');sv('rkUrutan',1);
  }
  show('ov-addRabKat');
}

function saveRabKat(){
  const projId=gv('rkProj');
  const name=(gv('rkName')||'').trim();
  if(!projId){toast('Pilih project','error');return;}
  if(!name){toast('Nama kategori wajib diisi','error');return;}
  if(editRabCatId){
    const idx=RAB.findIndex(r=>r.id===editRabCatId);
    if(idx>=0)RAB[idx]={...RAB[idx],projId,name,urutan:+gv('rkUrutan')||1,isCustom:true};
  } else {
    RAB.push({id:genId(),projId,type:'kat',katId:'',name,deskripsi:'',satuan:'',volume:0,hargaSatuan:0,total:0,notes:'',urutan:+gv('rkUrutan')||1,isCustom:true});
  }
  dirty();cm('addRabKat');renderRab();
  toast(editRabCatId?'Kategori diperbarui ✓':'Kategori ditambahkan ✓');
  gsSync();
}

function delRabKat(){
  if(!editRabCatId)return;
  const k=RAB.find(r=>r.id===editRabCatId&&r.type==='kat');
  const hasItems=RAB.some(r=>r.type==='item'&&r.katId===editRabCatId);
  if(hasItems&&!confirm(`Kategori "${k?.name}" masih memiliki item RAB. Hapus semua item di dalamnya juga?`))return;
  if(hasItems)RAB=RAB.filter(r=>!(r.type==='item'&&r.katId===editRabCatId));
  RAB=RAB.filter(r=>r.id!==editRabCatId);
  dirty();cm('addRabKat');renderRab();toast('Kategori dihapus','warn');gsSync();
}

function openRabItemModal(id=null,defaultKatId=null){
  editRabId=id?String(id):null;
  $('rabItemMT').textContent=id?'EDIT ITEM RAB':'TAMBAH ITEM RAB';
  $('btnSaveRabItem').innerHTML=id?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan':'＋ Tambah';
  $('btnDelRabItem').style.display=id?'block':'none';
  $('riProj').innerHTML=P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
  if(id){
    const item=RAB.find(r=>r.id===id&&r.type==='item');
    if(item){
      sv('riProj',String(item.projId));
      updateRabItemDropdown();
      sv('riKat',String(item.katId));
      sv('riDesc',item.deskripsi||'');
      sv('riSatuan',item.satuan||'');
      $('riVolume').value=item.volume||'';
      $('riHarga').value=item.hargaSatuan||'';
      $('riTotal').value=item.total||'';
      sv('riProcKat',item.procKat||'');
      sv('riNotes',item.notes||'');
    }
  } else {
    const proj=gv('rabFiltProj')||selId||'';
    sv('riProj',proj);
    updateRabItemDropdown();
    if(defaultKatId)sv('riKat',defaultKatId);
    sv('riDesc','');sv('riSatuan','');
    $('riVolume').value='';$('riHarga').value='';$('riTotal').value='';
    sv('riProcKat','');sv('riNotes','');
  }
  show('ov-addRabItem');
}

function saveRabItem(){
  const projId=gv('riProj');
  const katId=gv('riKat');
  const desc=(gv('riDesc')||'').trim();
  if(!projId){toast('Pilih project','error');return;}
  if(!desc){toast('Deskripsi item wajib diisi','error');return;}
  const vol=+$('riVolume').value||0;
  const harga=+$('riHarga').value||0;
  const total=+$('riTotal').value||(vol*harga);
  const d={projId,type:'item',katId:katId||'',deskripsi:desc,satuan:gv('riSatuan'),volume:vol,hargaSatuan:harga,total,procKat:gv('riProcKat'),notes:gv('riNotes')};
  if(editRabId){
    const idx=RAB.findIndex(r=>r.id===editRabId);
    if(idx>=0)RAB[idx]={...RAB[idx],...d};
  } else {
    RAB.push({id:genId(),urutan:0,isCustom:false,...d});
  }
  dirty();cm('addRabItem');renderRab();
  toast(editRabId?'Item RAB diperbarui ✓':'Item RAB ditambahkan ✓');
  gsSync();
}

function delRabItem(){
  if(!editRabId)return;
  if(!confirm('Hapus item RAB ini?'))return;
  RAB=RAB.filter(r=>r.id!==editRabId);
  dirty();cm('addRabItem');renderRab();toast('Item RAB dihapus','warn');gsSync();
}

// ── CLONE RAB ──────────────────────────────────────────────────
function openCloneRabModal(){
  const destProjId=gv('rabFiltProj');
  if(!destProjId){toast('Pilih project tujuan terlebih dahulu di dropdown','warn');return;}
  const destProj=P.find(p=>String(p.id)===String(destProjId));
  // Fill destination info
  $('cloneRabDestInfo').textContent=`${destProj?.kode||'?'} — ${destProj?.nama||'?'}`;
  // Fill source dropdown (exclude current project)
  $('cloneRabSrc').innerHTML='<option value="">— Pilih Project Sumber —</option>'+
    P.filter(p=>String(p.id)!==String(destProjId))
     .map(p=>`<option value="${p.id}">${p.kode} — ${p.nama}</option>`).join('');
  $('cloneRabSrc').value='';
  $('cloneRabMerge').checked=false;
  $('cloneRabCopyHarga').checked=true;
  $('cloneRabPreview').innerHTML='<div style="color:var(--mt);font-style:italic">Pilih project sumber untuk melihat preview RAB...</div>';
  $('ov-cloneRab').dataset.destId=destProjId;
  show('ov-cloneRab');
}

function _onCloneRabSrcChange(){
  const srcId=gv('cloneRabSrc');
  if(!srcId){$('cloneRabPreview').innerHTML='<div style="color:var(--mt);font-style:italic">Pilih project sumber untuk melihat preview RAB...</div>';return;}
  const kats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(srcId)).sort((a,b)=>a.urutan-b.urutan);
  const items=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(srcId));
  if(!kats.length&&!items.length){
    $('cloneRabPreview').innerHTML='<div style="color:var(--mt);font-style:italic">Belum ada RAB di project ini.</div>';return;
  }
  const totalRab=items.reduce((s,i)=>s+(+i.total||0),0);
  let html=`<div style="color:var(--or);font-weight:600;margin-bottom:6px">${kats.length} kategori | ${items.length} item | Total: ${fmtRpShort(totalRab)}</div>`;
  kats.forEach((k,ki)=>{
    const katItems=items.filter(i=>i.katId===k.id);
    const katTotal=katItems.reduce((s,i)=>s+(+i.total||0),0);
    html+=`<div style="color:var(--or);font-weight:700;margin-top:4px">${ki+1}. ${k.name} <span style="color:var(--mt);font-weight:400">${fmtRpShort(katTotal)}</span></div>`;
    katItems.forEach(item=>{
      html+=`<div style="padding-left:14px;color:var(--tx)">${item.deskripsi} <span style="color:var(--mt)">${item.volume||0} ${item.satuan||''} × ${fmtRpShort(item.hargaSatuan||0)}</span></div>`;
    });
  });
  $('cloneRabPreview').innerHTML=html;
}

function executeCloneRab(){
  const srcId=gv('cloneRabSrc');
  const destId=$('ov-cloneRab').dataset.destId;
  if(!srcId){toast('Pilih project sumber RAB','error');return;}
  if(!destId){toast('Project tujuan tidak ditemukan','error');return;}

  const merge=$('cloneRabMerge')?.checked;
  const copyHarga=$('cloneRabCopyHarga')?.checked!==false;

  const srcKats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(srcId)).sort((a,b)=>a.urutan-b.urutan);
  const srcItems=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(srcId));

  if(!srcKats.length&&!srcItems.length){toast('Project sumber belum memiliki RAB','warn');return;}

  // Jika tidak merge → hapus RAB lama di project tujuan
  if(!merge){
    const existCount=RAB.filter(r=>String(r.projId)===String(destId)).length;
    if(existCount>0&&!confirm(`RAB existing di project tujuan (${existCount} item) akan dihapus dan diganti. Lanjutkan?`))return;
    RAB=RAB.filter(r=>String(r.projId)!==String(destId));
  }

  // Clone kategori dengan id mapping
  const katIdMap={};
  srcKats.forEach(k=>{
    const newKatId=genId();
    katIdMap[k.id]=newKatId;
    RAB.push({
      id:newKatId,projId:destId,type:'kat',katId:'',
      name:k.name,deskripsi:'',satuan:'',volume:0,hargaSatuan:0,total:0,
      notes:'',urutan:k.urutan||1,isCustom:true,procKat:''
    });
  });

  // Clone items
  let clonedItems=0;
  srcItems.forEach(item=>{
    RAB.push({
      id:genId(),projId:destId,type:'item',
      katId:katIdMap[item.katId]||'',
      deskripsi:item.deskripsi||'',
      satuan:item.satuan||'',
      volume:item.volume||0,
      hargaSatuan:copyHarga?(item.hargaSatuan||0):0,
      total:copyHarga?(item.total||0):0,
      notes:item.notes||'',
      urutan:item.urutan||0,
      isCustom:item.isCustom||false,
      procKat:item.procKat||''
    });
    clonedItems++;
  });

  dirty();cm('cloneRab');renderRab();gsSync();
  toast(`✓ RAB berhasil di-clone: ${srcKats.length} kategori, ${clonedItems} item`,'ok',4000);
}

function exportRabCSV(){
  const projId=gv('rabFiltProj');
  const proj=P.find(p=>String(p.id)===String(projId));
  const kats=RAB.filter(r=>r.type==='kat'&&String(r.projId)===String(projId)).sort((a,b)=>a.urutan-b.urutan);
  const items=RAB.filter(r=>r.type==='item'&&String(r.projId)===String(projId));
  const actualByKat=getRabActualByKat(projId);
  const rows=[['Project','Kategori','Deskripsi','Satuan','Volume','Harga Satuan','Total RAB','Aktual','Sisa','% Terpakai']];
  kats.forEach(k=>{
    const katItems=items.filter(i=>i.katId===k.id);
    const act=actualByKat[k.id]||0;
    const rabTotal=katItems.reduce((s,i)=>s+(+i.total||0),0);
    rows.push([proj?.kode||projId,k.name,'(Sub-total)','','','',rabTotal,act,rabTotal-act,rabTotal>0?Math.round(act/rabTotal*100)+'%':'\u2014']);
    katItems.forEach(item=>{
      rows.push([proj?.kode||projId,k.name,item.deskripsi,item.satuan,item.volume,item.hargaSatuan,item.total,'','','']);
    });
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;
  a.download=`RAB_${proj?.kode||projId}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();URL.revokeObjectURL(url);
  toast('CSV RAB berhasil di-export ✓');
}
