// ===============================================================
// WBS \u2014 WORK BREAKDOWN STRUCTURE
// ===============================================================

function autoFixWbsProjIds(){
  // Strategy: match orphaned projIds to projects by numeric comparison
  // If ambiguous (multiple orphaned -> multiple projects), use order/proximity
  const validIds=new Set(P.map(p=>String(p.id)));
  const orphanedIds=[...new Set(WBS.filter(w=>!validIds.has(String(w.projId))).map(w=>String(w.projId)))];
  if(!orphanedIds.length){toast('Semua projId sudah valid ✓');renderWBS();return;}

  let fixed=0;
  orphanedIds.forEach(oid=>{
    // Try exact numeric match first
    const numMatch=P.find(p=>+p.id===+oid);
    if(numMatch){
      WBS.filter(w=>String(w.projId)===oid).forEach(w=>{w.projId=numMatch.id;fixed++;});
      return;
    }
    // If only 1 project, assign all
    if(P.length===1){
      WBS.filter(w=>String(w.projId)===oid).forEach(w=>{w.projId=P[0].id;fixed++;});
      return;
    }
    // Check if orphaned nodes' parentId chain can help identify project
    // Find root categories for this orphaned group
    const orphanedNodes=WBS.filter(w=>String(w.projId)===oid&&w.type==='cat');
    if(orphanedNodes.length){
      // Try matching by project name similarity (not implemented \u2014 use manual)
      toast(`${orphanedNodes.length} kategori dengan projId ${oid.slice(-6)} tidak bisa di-fix otomatis \u2014 gunakan tombol Fix manual`,'warn');
    }
  });

  if(fixed>0){
    dirty();syncAllWbsToProjects();saveLocal();renderWBS();gsSync();
    toast(`✓ ${fixed} WBS node berhasil di-fix`);
  }else{
    // Fallback: show per-project assignment buttons
    renderWBS();
  }
}

function fixWbsProjId(fromProjId, toProjId){
  let fixed=0;
  WBS.forEach(w=>{
    if(String(w.projId)===String(fromProjId)){
      w.projId=toProjId;
      fixed++;
    }
  });
  if(fixed){
    toast(`✓ Fixed ${fixed} WBS entries -> project ini`);
    dirty();syncAllWbsToProjects();renderWBS();gsSync();
  } else {
    toast('Tidak ada WBS dengan projId tersebut','warn');
  }
}

function resetWbsAndReload(){
  showConfirm('Reset WBS lokal dan load ulang dari GSheet? Data WBS di browser akan diganti dengan data GSheet.',()=>{
    WBS=[];
    saveLocal();
    toast('WBS lokal direset \u2014 loading dari GSheet...');
    setTimeout(()=>loadFromGS(),500);
  });
}

function renderWBS(){
  // Destroy chart lama saat ganti project — cegah bleed antar project
  if(window._wbsChart){window._wbsChart.destroy();window._wbsChart=null;}
  const sel=$('wbsProjSel');
  if(sel){
    const cur=sel.value||selId;
    sel.innerHTML=P.map(p=>`<option value="${p.id}">${p.kode} \u2014 ${p.nama}</option>`).join('');
    if(cur)sel.value=cur;
    // Fallback ke selId jika option tidak tersedia
    if(!sel.value&&selId)sel.value=selId;
  }
  const projId=sel?.value||P[0]?.id;
  if(!projId){$('wbsTable').innerHTML='<div style="text-align:center;color:var(--mt);padding:30px">Belum ada project</div>';return;}
  const proj=P.find(p=>String(p.id)===String(projId));
  if($('wbsChartTitle'))$('wbsChartTitle').textContent=proj?.nama||'';
  // Try both string and loose match
  let all=WBS.filter(w=>String(w.projId)===String(projId));
  // Fallback: try numeric match if string match fails
  if(!all.length&&WBS.length){
    all=WBS.filter(w=>+w.projId===+projId);
  }
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  // Auto-sum bobot ke atas
  all.forEach(w=>{if(w.type==='subcat'){const cb=all.filter(x=>x.type==='item'&&x.parentId===w.id).reduce((s,x)=>s+(+x.bobot||0),0);if(cb>0)w._ab=cb;}});
  cats.forEach(cat=>{const sb=all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).reduce((s,sub)=>s+all.filter(x=>x.type==='item'&&x.parentId===sub.id).reduce((ss,x)=>ss+(+x.bobot||0),0),0);if(sb>0)cat._ab=sb;});
  // Leaf nodes (items or subcats without children) for total
  // True leaf = item level 3, ATAU subcat yang tidak punya item anak
  // Subcat yang punya item anak -> bobotnya sudah direpresentasikan oleh item anaknya
  // True leaves: item level 3, ATAU subcat tanpa item anak
  // Jika subcat punya item anak -> bobotnya direpresentasikan oleh item anaknya
  const leafItems=all.filter(w=>w.type==='item');
  const subcatLeaf=all.filter(w=>w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)&&+w.bobot>0);
  const trueLeaves=[...leafItems,...subcatLeaf];
  const totalBobot=trueLeaves.reduce((s,w)=>s+(+w.bobot||0),0);
  const totalKontrib=trueLeaves.reduce((s,w)=>s+(+w.bobot||0)*(+w.cumActual||0)/100,0);
  const bobotOk=Math.abs(totalBobot-100)<0.1;  if($('wbsTotalBobot'))$('wbsTotalBobot').innerHTML='Total bobot: <span style="font-family:var(--fm);font-weight:700;color:'+( bobotOk?'var(--gn)':totalBobot>100?'var(--rd)':'var(--yw)')+'">'+totalBobot.toFixed(2)+'%</span>'+( bobotOk?' ✓':' (harus 100%)');
  let html='';
  if(!cats.length){
    const projIdsInWBS=[...new Set(WBS.map(w=>String(w.projId)))];
    const validIds=new Set(P.map(p=>String(p.id)));
    const orphaned=projIdsInWBS.filter(id=>!validIds.has(id));
    if(WBS.length&&orphaned.length){
      html=`<div style="padding:16px"><div style="padding:10px 14px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.3);border-radius:8px;font-size:11px">
        <b style="color:var(--or)">⚠ ${WBS.length} WBS node dengan projId tidak cocok \u2014 klik Auto-Fix</b><br><br>
        <div style="font-family:monospace;font-size:10px;margin-bottom:8px">
          ${orphaned.map(oid=>{const m=P.find(p=>+p.id===+oid);const c=WBS.filter(w=>String(w.projId)===oid).length;
            return '<span style="display:block;padding:3px 6px;background:var(--sf);border-radius:3px;margin-bottom:3px">projId <b style=\"color:var(--rd)\">'
              +oid+'</b> ('+c+' node) '+(m?'→ <b style=\"color:var(--gn)\">'+m.kode+'</b>':'→ tidak ada project cocok')+'</span>';}).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="autoFixWbsProjIds()" style="padding:5px 14px;background:var(--gn);color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">✓ Auto-Fix projId</button>
          <button onclick="resetWbsAndReload()" style="padding:5px 14px;background:var(--bl);color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">↓ Load dari GSheet</button>
        </div>
      </div></div>`;
    }else{
      html='<div style="text-align:center;color:var(--mt);padding:30px;font-size:12px">Belum ada WBS \u2014 klik ＋ Kategori untuk mulai</div>';
    }
  }
  else{
    const fmtD=d=>d?new Date(d+'T12:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'2-digit'}):'\u2014';
    html=`<table class="tbl"><thead><tr><th style="width:50px">#</th><th>Item Pekerjaan</th><th style="width:70px;text-align:right">Bobot</th><th style="width:88px">Start</th><th style="width:88px">Finish</th><th style="width:80px;text-align:right">% Selesai</th><th style="width:80px;text-align:right">Kontribusi</th><th style="width:75px;text-align:center">Aksi</th></tr></thead><tbody>`;
    cats.forEach((cat,ci)=>{
      const db=cat._ab||+cat.bobot||0;
      // Auto-summarize dates from all children
      const catChildren=all.filter(w=>w.parentId===cat.id||all.filter(x=>x.parentId===cat.id).some(s=>s.id===w.parentId));
      const catStarts=catChildren.map(w=>w.startDate).filter(Boolean).sort();
      const catFinishes=catChildren.map(w=>w.finishDate).filter(Boolean).sort();
      const catStart=catStarts[0]||'';const catFinish=catFinishes.slice(-1)[0]||'';
      html+=`<tr style="background:rgba(59,130,246,.08)"><td style="font-family:var(--fd);font-weight:700;color:var(--bl);font-size:13px">${String.fromCharCode(65+ci)}</td><td style="font-weight:700;color:var(--bl);font-size:12px">${safeStr(cat.name)}</td><td style="text-align:right;font-family:var(--fm);font-weight:700;color:var(--bl)">${db?db.toFixed(1)+'%':'\u2014'}</td><td style="font-size:10px;color:var(--mt)">${fmtD(catStart)}</td><td style="font-size:10px;color:var(--mt)">${fmtD(catFinish)}</td><td colspan="2"></td><td style="text-align:center"><button class="btn btn-sm edit-only" style="padding:1px 6px;font-size:10px;border-color:var(--bl);color:var(--bl)" onclick="openEditWbs('${cat.id}')">✏</button> <button class="btn btn-sm brd edit-only" style="padding:1px 6px;font-size:10px" onclick="delWbs('${cat.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td></tr>`;
      all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
        const sb=sub._ab||+sub.bobot||0;
        const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>a.order-b.order);
        const isLeaf=subItems.length===0;
        const effectiveSb=isLeaf?+sub.bobot||0:subItems.reduce((s,x)=>s+(+x.bobot||0),0);
        // % Selesai = sum cumActual semua sub-item (bukan rata-rata)
        const subPct=isLeaf
          ?+(sub.cumActual||0)
          :subItems.reduce((s,x)=>s+(+x.cumActual||0),0);
        const subK=isLeaf?(+sub.bobot||0)*subPct/100:subItems.reduce((s,x)=>s+(+x.bobot||0)*(+x.cumActual||0)/100,0);
        const bobotMismatch=!isLeaf&&+sub.bobot>0&&Math.abs(+sub.bobot-effectiveSb)>0.01;
        const barColor=subPct>=100?'var(--gn)':subPct>0?'var(--or)':'var(--bd)';
        html+=`<tr style="background:rgba(16,185,129,.05)">
          <td style="padding-left:16px;font-family:var(--fm);color:var(--gn);font-weight:600">${ci+1}.${si+1}</td>
          <td style="padding-left:22px;color:var(--gn);font-size:12px;font-weight:600">
            <span class="wbs-inline-text edit-only" onclick="this.classList.add('editing');this.querySelector('input').focus()" title="Klik untuk edit nama">
              <input value="${safeStr(sub.name)}" onblur="saveWbsInlineText('${sub.id}','name',this.value);this.closest('.wbs-inline-text')?.classList.remove('editing')" onkeydown="if(event.key==='Enter'){this.blur()}" style="color:var(--gn);font-weight:600;font-size:12px;min-width:80px">
            </span>${bobotMismatch?'<span style="font-size:9px;color:var(--yw);margin-left:6px">⚠</span>':''}
            ${!isLeaf&&subPct>0?`<div style="margin-top:4px;height:4px;background:var(--bd);border-radius:3px;overflow:hidden;max-width:200px"><div style="width:${Math.min(100,subPct)}%;height:100%;background:linear-gradient(90deg,${barColor},${barColor==='var(--or)'?'#fbbf24':'#34d399'});transition:width .4s"></div></div>`:''}
          </td>
          <td style="text-align:right;font-family:var(--fm);font-weight:600;color:var(--gn)">${isLeaf?`<span class="wbs-inline-text edit-only" onclick="this.classList.add('editing');this.querySelector('input').focus()" title="Klik untuk edit bobot"><input value="${(+sub.bobot||0).toFixed(1)}" type="number" min="0" max="100" step="0.1" onblur="saveWbsInlineText('${sub.id}','bobot',this.value);this.closest('.wbs-inline-text')?.classList.remove('editing')" onkeydown="if(event.key==='Enter'){this.blur()}" style="color:var(--gn);font-weight:600"><span style="color:var(--gn);font-weight:600">%</span></span>`:effectiveSb?effectiveSb.toFixed(1)+'%':'\u2014'}</td>
          <td class="wbs-date-cell edit-only ${sub.startDate?'has-date':''}" data-wbs-date="${sub.id}-startDate" onclick="inlineDateCell('${sub.id}','startDate',this)"><span style="font-size:10px;pointer-events:none">${fmtD(sub.startDate)||'—'}</span><input type="date" value="${sub.startDate||''}" onchange="saveWbsInlineDate('${sub.id}','startDate',this.value)" onblur="this.closest('.wbs-date-cell')?.classList.remove('editing')"></td>
          <td class="wbs-date-cell edit-only ${sub.finishDate?'has-date':''}" data-wbs-date="${sub.id}-finishDate" onclick="inlineDateCell('${sub.id}','finishDate',this)"><span style="font-size:10px;pointer-events:none">${fmtD(sub.finishDate)||'—'}</span><input type="date" value="${sub.finishDate||''}" onchange="saveWbsInlineDate('${sub.id}','finishDate',this.value)" onblur="this.closest('.wbs-date-cell')?.classList.remove('editing')"></td>
          <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--or);font-weight:600">${subPct>0?subPct.toFixed(1)+'%':'\u2014'}</td>
          <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--gn)">${subK>0?subK.toFixed(2)+'%':'\u2014'}</td>
          <td style="text-align:center">
            <button class="btn btn-sm brd edit-only" style="padding:1px 6px;font-size:10px" onclick="delWbs('${sub.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </td>
        </tr>`;
        subItems.forEach((item,ii)=>{
          const b=+item.bobot||0;const pct=+item.cumActual||0;
          html+=`<tr>
            <td style="padding-left:30px;font-size:10px;color:var(--mt)">${ci+1}.${si+1}.${ii+1}</td>
            <td style="padding-left:38px;font-size:11px;color:var(--tx)">
              <span class="wbs-inline-text edit-only" onclick="this.classList.add('editing');this.querySelector('input').focus()" title="Klik untuk edit nama">
                <input value="${safeStr(item.name)}" onblur="saveWbsInlineText('${item.id}','name',this.value);this.closest('.wbs-inline-text')?.classList.remove('editing')" onkeydown="if(event.key==='Enter'){this.blur()}" style="color:var(--tx);font-size:11px;min-width:80px">
              </span>
            </td>
            <td style="text-align:right;font-family:var(--fm);font-size:11px">
              <span class="wbs-inline-text edit-only" onclick="this.classList.add('editing');this.querySelector('input').focus()" title="Klik untuk edit bobot"><input value="${b.toFixed(2)}" type="number" min="0" max="100" step="0.01" onblur="saveWbsInlineText('${item.id}','bobot',this.value);this.closest('.wbs-inline-text')?.classList.remove('editing')" onkeydown="if(event.key==='Enter'){this.blur()}" style="font-size:11px"><span style="font-size:11px">%</span></span>
            </td>
            <td class="wbs-date-cell edit-only ${item.startDate?'has-date':''}" data-wbs-date="${item.id}-startDate" onclick="inlineDateCell('${item.id}','startDate',this)"><span style="font-size:10px;pointer-events:none">${fmtD(item.startDate)||'—'}</span><input type="date" value="${item.startDate||''}" onchange="saveWbsInlineDate('${item.id}','startDate',this.value)" onblur="this.closest('.wbs-date-cell')?.classList.remove('editing')"></td>
            <td class="wbs-date-cell edit-only ${item.finishDate?'has-date':''}" data-wbs-date="${item.id}-finishDate" onclick="inlineDateCell('${item.id}','finishDate',this)"><span style="font-size:10px;pointer-events:none">${fmtD(item.finishDate)||'—'}</span><input type="date" value="${item.finishDate||''}" onchange="saveWbsInlineDate('${item.id}','finishDate',this.value)" onblur="this.closest('.wbs-date-cell')?.classList.remove('editing')"></td>
            <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--mt)">${pct>0?pct.toFixed(1)+'%':'\u2014'}</td>
            <td style="text-align:right;font-family:var(--fm);font-size:11px;color:var(--mt)">${(b*pct/100)>0?(b*pct/100).toFixed(2)+'%':'\u2014'}</td>
            <td style="text-align:center">
              <button class="btn btn-sm brd edit-only" style="padding:1px 6px;font-size:10px" onclick="delWbs('${item.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </td>
          </tr>`;
        });
      });
    });
    html+=`<tr style="background:var(--sf2);font-weight:700"><td colspan="2" style="text-align:right;font-size:11px;color:var(--mt);padding-right:8px">TOTAL</td><td style="text-align:right;font-family:var(--fm);color:${bobotOk?'var(--gn)':totalBobot>100?'var(--rd)':'var(--yw)'}">${totalBobot.toFixed(2)}%</td><td colspan="2"></td><td></td><td style="text-align:right;font-family:var(--fm);color:var(--gn)">${totalKontrib.toFixed(2)}%</td><td></td></tr>`;
    html+='</tbody></table>';
  }
  $('wbsTable').innerHTML=html;
  // Auto-sync WBS plan ke SCURVE jika belum ada data scurve
  const _hasPlan=WBS.filter(w=>String(w.projId)===String(projId)).some(w=>w.weeklyPlan&&Object.keys(w.weeklyPlan).length>0);
  const _hasSc=SCURVE.some(d=>String(d.projId)===String(projId)&&d.fromWbs);
  if(_hasPlan&&!_hasSc){syncWbsToSCurve(projId);}
  renderWbsSCurve(projId);
  if(_ganttView==='gantt')renderGantt();
}


function calcWbsWeightedActual(projId){return WBS.filter(w=>String(w.projId)===String(projId)&&w.type==='item').reduce((s,w)=>s+((+w.bobot||0)*(+w.cumActual||0)/100),0);}
function calcWbsWeightedPlan(projId){return WBS.filter(w=>String(w.projId)===String(projId)&&w.type==='item').reduce((s,w)=>s+((+w.bobot||0)*(+w.cumPlan||0)/100),0);}

function populateWbsParents(targetId,projSelId,type){
  const projId=$(projSelId)?.value;const sel=$(targetId);if(!sel)return;
  sel.innerHTML=WBS.filter(w=>String(w.projId)===String(projId)&&w.type===type).sort((a,b)=>a.order-b.order).map(w=>`<option value="${w.id}">${safeStr(w.name)}</option>`).join('');
}
function checkWbsBobot(){
  const projId=$('wbsItemProj')?.value;const cur=parseFloat($('wbsItemBobot')?.value)||0;
  // Only count other leaf items (not subcats that have items, as they'll be replaced)
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const total=all.filter(w=>w.type==='item').reduce((s,w)=>s+(+w.bobot||0),0)
    +all.filter(w=>w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)&&+w.bobot>0).reduce((s,w)=>s+(+w.bobot||0),0);
  const warn=$('wbsBobotWarn');if(warn)warn.style.display=(total+cur)>100.05?'block':'none';
}
function saveWbsCat(){
  const projId=$('wbsCatProj').value;const name=gv('wbsCatName').trim();
  if(!name){toast('Nama kategori wajib diisi','error');return;}
  const order=WBS.filter(w=>String(w.projId)===String(projId)&&w.type==='cat').length;
  WBS.push({id:genId(),projId,type:'cat',parentId:null,name,bobot:parseFloat($('wbsCatBobot')?.value)||0,order,cumPlan:0,cumActual:0});
  dirty();cm('wbsAddCat');renderWBS();toast('Kategori ditambahkan ✓');gsSync();
}
function saveWbsSub(){
  const projId=$('wbsSubProj').value;const name=gv('wbsSubName').trim();const parentId=String($('wbsSubParent')?.value||'');
  if(!name||!parentId){toast('Lengkapi data','error');return;}
  const order=WBS.filter(w=>String(w.projId)===String(projId)&&w.type==='subcat'&&String(w.parentId)===parentId).length;
  WBS.push({id:genId(),projId,type:'subcat',parentId,name,
    bobot:parseFloat($('wbsSubBobot')?.value)||0,order,cumPlan:0,cumActual:0,
    startDate:gv('wbsSubStart')||'',finishDate:gv('wbsSubFinish')||''});
  dirty();cm('wbsAddSub');renderWBS();toast('Sub-kategori ditambahkan ✓');gsSync();
}
function saveWbsItem(){
  const projId=$('wbsItemProj').value;const name=gv('wbsItemName').trim();
  const parentId=String($('wbsItemParent')?.value||'');const bobot=parseFloat($('wbsItemBobot')?.value)||0;
  if(!name||!parentId||!bobot){toast('Lengkapi nama, induk, dan bobot item','error');return;}
  // Total = semua item level 3 (bobot subcat induk dikecualikan karena akan digantikan item anaknya)
  const allItems=WBS.filter(w=>String(w.projId)===String(projId)&&w.type==='item').reduce((s,w)=>s+(+w.bobot||0),0);
  if(allItems+bobot>100.05){toast('Total bobot item melebihi 100%','error');return;}
  const order=WBS.filter(w=>String(w.projId)===String(projId)&&w.type==='item'&&String(w.parentId)===parentId).length;
  WBS.push({id:genId(),projId,type:'item',parentId,name,bobot,order,cumPlan:0,cumActual:0,
    weeklyData:{},weeklyPlan:{},
    startDate:gv('wbsItemStart')||'',finishDate:gv('wbsItemFinish')||''});
  dirty();cm('wbsAddItem');renderWBS();toast('Item ditambahkan ✓');gsSync();
}


function openEditWbs(id){
  const node=WBS.find(w=>w.id===id);if(!node)return;
  sv('wbsEditId',id);sv('wbsEditName',safeStr(node.name));
  sv('wbsEditBobot',+node.bobot||0);
  sv('wbsEditStart',node.startDate||'');
  sv('wbsEditFinish',node.finishDate||'');
  const lbl=$('wbsEditBobotLbl');
  if(lbl)lbl.textContent=node.type==='item'?'Bobot Item (%)':node.type==='subcat'?'Bobot Sub-Kategori (%)':'Bobot Kategori (%)';
  const hasCh=WBS.some(w=>w.parentId===id);
  const bobotFg=$('wbsEditBobot')?.closest('.fg');
  if(bobotFg)bobotFg.style.display=(node.type==='cat'&&hasCh)?'none':'block';
  // Hide dates for category (summarized automatically)
  const datesDiv=$('wbsEditDates');
  if(datesDiv)datesDiv.style.display=node.type==='cat'?'none':'grid';
  show('ov-wbsEdit');
}
function saveEditWbs(){
  const id=String($('wbsEditId')?.value||'');
  const node=WBS.find(w=>String(w.id)===id);if(!id||!node){toast('Node tidak ditemukan','error');return;}
  const name=gv('wbsEditName').trim();if(!name){toast('Nama wajib diisi','error');return;}
  node.name=name;
  const b=parseFloat($('wbsEditBobot')?.value);
  if(!isNaN(b))node.bobot=b;
  node.startDate=gv('wbsEditStart')||'';
  node.finishDate=gv('wbsEditFinish')||'';
  dirty();cm('wbsEdit');renderWBS();toast('✓ Diupdate');gsSync();
}

function delWbs(id){
  const sid=String(id);
  const node=WBS.find(w=>String(w.id)===sid);if(!node)return;
  const childIds=WBS.filter(w=>String(w.parentId)===sid).map(w=>String(w.id));
  const grandIds=WBS.filter(w=>childIds.includes(String(w.parentId))).map(w=>String(w.id));
  const toRm=new Set([sid,...childIds,...grandIds]);
  const msg=`Hapus "${safeStr(node.name)}"${toRm.size>1?' dan '+(toRm.size-1)+' child-nya':''}?`;
  showConfirm(msg,()=>{
    // 1. Tandai ke pending delete (agar Supabase/GSheet benar-benar hapus baris)
    toRm.forEach(rmId=>{if(typeof addPendingDeleteWbs==='function')addPendingDeleteWbs(rmId);});
    // 2. Simpan Set ID yg dihapus ke window agar _rtPoll tidak merge balik
    if(!window._wbsRecentDeleted)window._wbsRecentDeleted=new Set();
    toRm.forEach(rmId=>window._wbsRecentDeleted.add(String(rmId)));
    // 3. Filter lokal & render segera
    WBS=WBS.filter(w=>!toRm.has(String(w.id)));
    dirty();renderWBS();toast('Dihapus','warn');
    gsSync();
    // 4. Re-render ulang setelah 2 detik untuk override stale realtime/poll reload
    setTimeout(()=>{
      WBS=WBS.filter(w=>!window._wbsRecentDeleted||!window._wbsRecentDeleted.has(String(w.id)));
      renderWBS();
      // Bersihkan flag setelah 10 detik
      setTimeout(()=>{if(window._wbsRecentDeleted)window._wbsRecentDeleted.clear();},10000);
    },2000);
  });
}
// ── WBS PLAN ONLY ────────────────────────────────────────────
// ===============================================================
// WBS PLAN GRID \u2014 Cumulative Achievement per Week
// ===============================================================

// Calculate total weeks from project start/end dates
function getProjectWeeks(proj){
  if(!proj||!proj.mulai||!proj.selesai)return 12;
  const ms=new Date(proj.mulai).getTime();const me=new Date(proj.selesai).getTime();
  if(isNaN(ms)||isNaN(me)||me<=ms)return 12;
  return Math.max(1,Math.ceil((me-ms)/(7*24*3600*1000)));
}

// Get week start date label
function getWeekDateLabel(proj,week){
  if(!proj?.mulai)return `W${String(week).padStart(2,'0')}`;
  const d=new Date(proj.mulai);d.setDate(d.getDate()+(week-1)*7);
  return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
}

// Get current week number relative to project start
function getCurrentWeekNum(proj){
  if(!proj?.mulai)return 0;
  const now=Date.now();const ms=new Date(proj.mulai).getTime();
  if(isNaN(ms))return 0;
  return Math.max(1,Math.ceil((now-ms)/(7*24*3600*1000)));
}

function renderWbsPlanGrid(){
  const projId=$('wbsPlanProj')?.value;
  const wrap=$('wbsPlanGridWrap');
  const scPrev=$('wbsPlanScPreview');
  if(!projId){if(wrap)wrap.innerHTML='';if(scPrev)scPrev.innerHTML='';return;}

  const proj=P.find(p=>String(p.id)===String(projId));
  const totalWeeks=getProjectWeeks(proj);
  const curWeek=getCurrentWeekNum(proj);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));

  if(!leafNodes.length){
    if(wrap)wrap.innerHTML='<div style="text-align:center;color:var(--mt);padding:30px;font-size:12px">Belum ada item WBS. Tambahkan item WBS terlebih dahulu.</div>';
    return;
  }

  // Build week columns
  const weeks=Array.from({length:totalWeeks},(_,i)=>i+1);

  // Build table header
  let html=`<table class="wbspg-table"><thead><tr>
    <th class="wbspg-name">Item WBS</th>
    <th style="min-width:60px;font-size:9px;color:var(--mt)">Bobot</th>`;
  weeks.forEach(w=>{
    const isCur=w===curWeek;
    const lbl=getWeekDateLabel(proj,w);
    html+=`<th class="wbspg-week-hdr${isCur?' wk-cur':''}">
      W${String(w).padStart(2,'0')}${isCur?'<div style="font-size:8px;color:var(--or)">▼now</div>':''}
      <div style="font-size:8px;color:var(--mt);font-weight:400">${lbl}</div>
    </th>`;
  });
  html+=`</tr></thead><tbody>`;

  // Build rows by category
  cats.forEach((cat,ci)=>{
    html+=`<tr class="wbspg-cat"><td class="wbspg-name" colspan="2">${String.fromCharCode(65+ci)}. ${safeStr(cat.name)}</td>${weeks.map(()=>'<td></td>').join('')}</tr>`;

    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>a.order-b.order);
      const isLeafSub=subItems.length===0;

      if(isLeafSub){
        html+=_wbsPlanRow(sub,ci,si,weeks,curWeek,proj);
      } else {
        html+=`<tr class="wbspg-sub"><td class="wbspg-name" style="padding-left:20px;color:var(--gn);font-weight:600">${ci+1}.${si+1} ${safeStr(sub.name)}</td><td class="wbspg-bobot" style="text-align:center;color:var(--mt)"></td>${weeks.map(()=>'<td></td>').join('')}</tr>`;
        subItems.forEach((item,ii)=>{
          html+=_wbsPlanRow(item,ci,si,weeks,curWeek,proj,ii);
        });
      }
    });
  });
  html+=`</tbody></table>`;

  if(wrap)wrap.innerHTML=html;

  // Update S-Curve preview chips
  _updateWbsPlanScPreview(projId,totalWeeks,proj);
}

function _wbsPlanRow(node,ci,si,weeks,curWeek,proj,ii){
  const wp=node.weeklyPlan||{};
  const fmtPD=ds=>{if(!ds)return'';const d=new Date(ds+'T12:00');return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'});};
  const sdLabel=node.startDate?fmtPD(node.startDate):'';
  const fdLabel=node.finishDate?fmtPD(node.finishDate):'';
  let dateInfo='';
  if(sdLabel||fdLabel){
    dateInfo='<div style="display:flex;gap:4px;margin-top:1px">';
    if(sdLabel) dateInfo+='<span style="font-size:8px;color:var(--bl);background:rgba(59,130,246,.1);border-radius:3px;padding:0 4px">▶ '+sdLabel+'</span>';
    if(fdLabel) dateInfo+='<span style="font-size:8px;color:var(--rd);background:rgba(239,68,68,.1);border-radius:3px;padding:0 4px">■ '+fdLabel+'</span>';
    dateInfo+='</div>';
  }
  let html=`<tr data-nid="${node.id}">
    <td class="wbspg-name" style="padding-left:${node.type==='item'?'32px':'16px'}">
      <div style="font-size:11px;color:${node.type==='item'?'var(--tx)':'var(--gn)'};font-weight:${node.type==='item'?'400':'600'}">${safeStr(node.name)}</div>
      ${dateInfo}
      ${_wbsPlanActualBar(node,weeks)}
    </td>
    <td class="wbspg-bobot" style="text-align:center">
      <span style="font-family:var(--fm);font-size:10px;color:var(--bl);font-weight:600">${(+node.bobot||0).toFixed(1)}%</span>
    </td>`;
  weeks.forEach(w=>{
    // cumPlan = cumulative achievement stored for this week
    const cumVal=wp[w]?.cumPlan!=null?wp[w].cumPlan:(wp[w]?.wPlan!=null?wp[w].wPlan:null);
    const hasVal=cumVal!=null&&cumVal!=='';
    const is100=hasVal&&+cumVal>=100;
    const isCur=w===curWeek;
    const cls=`wbspg-cell${isCur?' style="background:rgba(249,115,22,.03)"':''}`;
    html+=`<td class="${cls}" style="${isCur?'background:rgba(249,115,22,.03)':''}">
      <div class="wbspg-cell">
        <input type="number" min="0" max="100" step="1" placeholder="\u2014"
          id="wgpl_${node.id}_${w}"
          value="${hasVal?+cumVal:''}"
          class="${is100?'val-100':hasVal?'val-set':''}"
          oninput="onWbsGridInput(this,'${node.id}',${w})"
          onblur="onWbsGridBlur(this,'${node.id}',${w},'${node.type}')"
          style="width:52px">
      </div>
    </td>`;
  });
  html+=`</tr>`;
  return html;
}

function _wbsPlanActualBar(node,weeks){
  // Show actual progress bar under item name for reference
  const wd=node.weeklyData||{};
  const maxW=Math.max(...weeks,...Object.keys(wd).map(Number),0);
  if(!maxW)return '';
  let cumAct=0;
  const actPoints=[];
  for(let w=1;w<=maxW;w++){
    cumAct+=+(wd[w]?.wAct||0);
    actPoints.push(Math.min(100,cumAct));
  }
  const lastAct=actPoints[actPoints.length-1]||0;
  if(!lastAct)return '';
  return `<div style="margin-top:2px;display:flex;align-items:center;gap:3px">
    <div style="flex:1;height:3px;background:var(--sf2);border-radius:2px;overflow:hidden">
      <div style="width:${lastAct}%;height:100%;background:var(--or);border-radius:2px"></div>
    </div>
    <span style="font-size:8px;font-family:var(--fm);color:var(--or)">${lastAct.toFixed(0)}%</span>
  </div>`;
}

function _updateWbsPlanScPreview(projId,totalWeeks,proj){
  const sc=$('wbsPlanScPreview');if(!sc)return;
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));

  // Calculate S-Curve from current inputs
  let cumPlanArr=[];
  for(let w=1;w<=totalWeeks;w++){
    let planContrib=0;
    leafNodes.forEach(node=>{
      const el=$(`wgpl_${node.id}_${w}`);
      const cumVal=el?parseFloat(el.value)||0:(node.weeklyPlan?.[w]?.cumPlan||node.weeklyPlan?.[w]?.wPlan||0);
      planContrib+=(+node.bobot||0)*cumVal/100;
    });
    cumPlanArr.push(Math.round(planContrib*10)/10);
  }

  const lastPlan=cumPlanArr[cumPlanArr.length-1]||0;
  // Current actual
  const lastActualSc=SCURVE.filter(d=>String(d.projId)===String(projId)&&d.fromWbs).sort((a,b)=>b.week-a.week)[0];
  const cAct=+(lastActualSc?.cAct||0);

  sc.innerHTML=`
    <span class="wbspg-preview-chip chip-plan"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg> Total Plan: <b>${lastPlan.toFixed(1)}%</b></span>
    <span class="wbspg-preview-chip chip-act"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> Actual s/d skrg: <b>${cAct.toFixed(1)}%</b></span>
    <span class="wbspg-preview-chip" style="${lastPlan>0&&lastPlan<99?'border-color:var(--yw);background:rgba(245,158,11,.08);color:var(--yw)':''}">
      ${totalWeeks} minggu | ${leafNodes.length} items
    </span>`;
}

function onWbsGridInput(el,nodeId,week){
  const val=parseFloat(el.value);
  if(isNaN(val)||el.value===''){
    el.className='';el.style.borderColor='transparent';
    return;
  }
  const is100=val>=100;const hasVal=val>0;
  el.className=is100?'val-100':hasVal?'val-set':'';
  // Validate: must be >= previous week
  const prev=$(`wgpl_${nodeId}_${week-1}`);
  const prevVal=prev?parseFloat(prev.value)||0:0;
  if(val<prevVal){el.classList.add('val-err');}
  else {el.classList.remove('val-err');}
  // Update next week if it's less
  const next=$(`wgpl_${nodeId}_${+week+1}`);
  if(next&&next.value!==''&&parseFloat(next.value)<val){
    next.value=val;next.className=is100?'val-100':hasVal?'val-set':'';
  }
  // Refresh preview
  const projId=$('wbsPlanProj')?.value;
  const p=P.find(p=>String(p.id)===String(projId));
  if(projId&&p)_updateWbsPlanScPreview(projId,getProjectWeeks(p),p);
}

function onWbsGridBlur(el,nodeId,week,nodeType){
  let val=parseFloat(el.value);
  if(isNaN(val)||el.value==='')return;
  // Clamp 0-100
  val=Math.min(100,Math.max(0,val));
  el.value=val;
  // Auto-fill forward if 100
  if(val>=100){
    let w=+week+1;
    while(true){
      const nx=$(`wgpl_${nodeId}_${w}`);
      if(!nx)break;
      if(nx.value===''||parseFloat(nx.value)<100){nx.value=100;nx.className='val-100';}
      w++;
    }
  }
}

function wbsPlanFillLinear(){
  const projId=$('wbsPlanProj')?.value;if(!projId)return;
  const proj=P.find(p=>String(p.id)===String(projId));
  const totalWeeks=getProjectWeeks(proj);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  leafNodes.forEach(node=>{
    // Find first and last active week from existing data, or use full duration
    const existKeys=Object.keys(node.weeklyPlan||{}).map(Number).filter(k=>node.weeklyPlan[k]?.cumPlan>0||node.weeklyPlan[k]?.wPlan>0);
    let startW=1,endW=totalWeeks;
    // If start/finish dates on node, use them
    if(node.startDate){const d=new Date(node.startDate);const ms=new Date(proj?.mulai).getTime();if(!isNaN(d)&&!isNaN(ms)){startW=Math.max(1,Math.ceil((d-ms)/(7*24*3600*1000)));}}
    if(node.finishDate){const d=new Date(node.finishDate);const ms=new Date(proj?.mulai).getTime();if(!isNaN(d)&&!isNaN(ms)){endW=Math.max(startW,Math.ceil((d-ms)/(7*24*3600*1000)));}}
    const dur=endW-startW+1;
    for(let w=1;w<=totalWeeks;w++){
      const el=$(`wgpl_${node.id}_${w}`);if(!el)continue;
      if(w<startW){el.value='';el.className='';}
      else if(w>=endW){el.value=100;el.className='val-100';}
      else{const pct=Math.round((w-startW+1)/dur*1000)/10;el.value=Math.min(100,pct);el.className='val-set';}
    }
  });
  _updateWbsPlanScPreview(projId,totalWeeks,proj);
  toast('Auto-fill linear diterapkan');
}

function wbsPlanClearAll(){
  const projId=$('wbsPlanProj')?.value;if(!projId)return;
  if(!confirm('Hapus semua nilai plan WBS untuk project ini?'))return;
  const proj=P.find(p=>String(p.id)===String(projId));
  const totalWeeks=getProjectWeeks(proj);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  leafNodes.forEach(node=>{
    for(let w=1;w<=totalWeeks;w++){
      const el=$(`wgpl_${node.id}_${w}`);if(el){el.value='';el.className='';}
    }
    node.weeklyPlan={};node.cumPlan=0;
  });
  _updateWbsPlanScPreview(projId,totalWeeks,proj);
  toast('Plan dihapus','warn');
}

function saveWbsPlanGrid(){
  const projId=$('wbsPlanProj')?.value;if(!projId){toast('Pilih project','error');return;}
  const proj=P.find(p=>String(p.id)===String(projId));
  const totalWeeks=getProjectWeeks(proj);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));

  // Validate: each node must be non-decreasing
  let errs=0;
  leafNodes.forEach(node=>{
    let prev=0;
    for(let w=1;w<=totalWeeks;w++){
      const el=$(`wgpl_${node.id}_${w}`);
      if(!el||el.value==='')continue;
      const v=parseFloat(el.value)||0;
      if(v<prev-0.01){el.classList.add('val-err');errs++;}
      else {el.classList.remove('val-err');prev=v;}
    }
  });
  if(errs>0){toast(`${errs} nilai tidak valid (harus naik per minggu)`, 'error');return;}

  // Save cumulative plan per week per node
  leafNodes.forEach(node=>{
    if(!node.weeklyPlan)node.weeklyPlan={};
    let prevCum=0;
    for(let w=1;w<=totalWeeks;w++){
      const el=$(`wgpl_${node.id}_${w}`);
      if(!el||el.value===''){
        // Clear this week if empty
        if(node.weeklyPlan[w]){delete node.weeklyPlan[w];}
        continue;
      }
      const cumVal=Math.min(100,Math.max(0,parseFloat(el.value)||0));
      // wPlan = incremental for this week (for backward compat)
      const wPlan=Math.max(0,Math.round((cumVal-prevCum)*10)/10);
      node.weeklyPlan[w]={cumPlan:Math.round(cumVal*10)/10,wPlan};
      prevCum=cumVal;
    }
    // cumPlan = last non-null cumulative
    const maxW=Math.max(...Object.keys(node.weeklyPlan).map(Number).filter(k=>node.weeklyPlan[k]?.cumPlan!=null),0);
    node.cumPlan=maxW>0?node.weeklyPlan[maxW].cumPlan:0;
  });

  // Update project plan%
  if(proj){
    const totalPlan=leafNodes.reduce((s,n)=>{
      const maxW=Math.max(...Object.keys(n.weeklyPlan||{}).map(Number).filter(k=>n.weeklyPlan[k]?.cumPlan!=null),0);
      const cp=maxW>0?n.weeklyPlan[maxW].cumPlan:0;
      return s+(+n.bobot||0)*cp/100;
    },0);
    proj.plan=Math.round(totalPlan*10)/10;
  }

  syncWbsToSCurve(projId);
  dirty();cm('wbsPlan');render();renderWBS();
  toast('✓ Plan WBS berhasil disimpan');gsSync();
}

// Keep old function aliases for backward compatibility
function renderWbsPlanForm(){renderWbsPlanGrid();}
function updateWbsPlanPreview(){}
function saveWbsPlanOnly(){saveWbsPlanGrid();}


// ── WBS ACTUAL ───────────────────────────────────────────────
function renderWbsProgressForm(){
  const projId=$('wbsProgProj')?.value;const week=+($('wbsProgWeek')?.value||1);
  if(!projId){$('wbsProgressForm').innerHTML='';return;}
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);

  // Leaf nodes = item level 3, atau subcat yang tidak punya item di bawahnya
  const leafNodes=all.filter(w=>{
    if(w.type==='item')return true;
    if(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id))return true;
    return false;
  });

  if(!leafNodes.length){
    $('wbsProgressForm').innerHTML='<div style="text-align:center;color:var(--mt);padding:20px">Belum ada item WBS. Tambahkan Sub-Kategori atau Item terlebih dahulu.</div>';
    return;
  }

  let html='';
  cats.forEach((cat,ci)=>{
    html+=`<div style="font-family:var(--fd);font-size:12px;letter-spacing:1px;color:var(--bl);margin:10px 0 4px;padding:6px 10px;background:rgba(59,130,246,.07);border-radius:6px">${String.fromCharCode(65+ci)}. ${safeStr(cat.name)}</div>`;
    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>a.order-b.order);
      const isLeafSub=subItems.length===0;

      if(isLeafSub){
        const wd=sub.weeklyData||{};const wkd=wd[week]||{};
        const wp=sub.weeklyPlan||{};const wkp=wp[week]||{};
        const histRows=Object.keys(wd).sort((a,b)=>+a-+b)
          .map(w=>+w!==week?`<span style="font-size:9px;font-family:var(--fm);padding:1px 5px;border-radius:3px;background:var(--sf);border:1px solid var(--bd);color:var(--mt)">W${String(+w).padStart(2,'0')}: ${(+wd[w].wAct||0).toFixed(1)}%</span>`:'').filter(Boolean).join(' ');
        // Also show plan reference for context
        const wkp_ref=sub.weeklyPlan&&sub.weeklyPlan[week]?sub.weeklyPlan[week]:{};
        const planRef=wkp_ref.wPlan!=null?`<span style="font-size:9px;color:var(--bl);font-family:var(--fm);margin-left:4px">plan:${(+wkp_ref.wPlan||0).toFixed(1)}%</span>`:'';
        html+=`<div style="display:grid;grid-template-columns:1fr 130px;gap:8px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--bd);background:rgba(16,185,129,.03)">
          <div>
            <span style="font-size:12px;color:var(--gn);font-weight:600">${ci+1}.${si+1} ${safeStr(sub.name)}</span>
            <span style="font-size:9px;color:var(--mt);font-family:var(--fm);margin-left:6px">bobot:${(+sub.bobot||0).toFixed(1)}%</span>
            ${planRef}
            <span style="font-size:9px;color:var(--or);font-family:var(--fm);margin-left:4px">cum:${(+sub.cumActual||0).toFixed(1)}%</span>
            ${histRows?`<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">${histRows}</div>`:''}
          </div>
          <div>
            <label style="font-size:9px;color:var(--or);display:block;font-weight:600">W.Actual %</label>
            <input type="number" min="0" max="100" step="0.1" placeholder="0"
              value="${wkd.wAct!=null?wkd.wAct:''}"
              id="wpi_${sub.id}_wact"
              oninput="updateWbsProgPreview()"
              style="width:100%;padding:5px 8px;font-size:14px;font-weight:700;text-align:center;border-radius:4px;border:1.5px solid ${wkd.wAct!=null?'var(--or)':'var(--bd)'};background:${wkd.wAct!=null?'rgba(249,115,22,.08)':'var(--sf2)'}" class="fi">
          </div>
        </div>`;
      }else{
        html+=`<div style="font-size:11px;color:var(--gn);padding:4px 10px;font-weight:600">${ci+1}.${si+1} ${safeStr(sub.name)}</div>`;
        subItems.forEach((item,ii)=>{
          const wd=item.weeklyData||{};const wkd=wd[week]||{};
          const dl=item.dailyLogs||[];
          const today=new Date().toISOString().slice(0,10);
          const todayLog=dl.find(l=>l.date===today)||{};
          const histRows=Object.keys(wd).sort((a,b)=>+a-+b)
            .map(w=>+w!==week?`<span style="font-size:9px;font-family:var(--fm);padding:1px 5px;border-radius:3px;background:var(--sf);border:1px solid var(--bd);color:var(--mt)">W${String(+w).padStart(2,'0')}: ${(+wd[w].wAct||0).toFixed(1)}%</span>`:'').filter(Boolean).join(' ');
          const planRef2=item.weeklyPlan&&item.weeklyPlan[week]?`<span style="font-size:9px;color:var(--bl);font-family:var(--fm);margin-left:4px">plan:${(+(item.weeklyPlan[week].wPlan||0)).toFixed(1)}%</span>`:'';
          // Daily log rows for this item
          const recentLogs=dl.slice(-3).reverse().map(l=>`<span style="font-size:9px;font-family:var(--fm);padding:1px 5px;border-radius:3px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);color:var(--or)">${l.date.slice(5)}: +${(+l.pct||0).toFixed(1)}%${l.notes?' \u2014 '+l.notes:''}</span>`).join(' ');
          html+=`<div style="border-bottom:1px solid var(--bd);padding:6px 12px;">
            ${'<'}!-- Header row -->
            <div style="display:grid;grid-template-columns:1fr 130px;gap:8px;align-items:start">
              <div>
                <span style="font-size:11px;font-weight:500">${safeStr(item.name)}</span>
                <span style="font-size:9px;color:var(--mt);font-family:var(--fm);margin-left:6px">bobot:${(+item.bobot||0).toFixed(2)}%</span>
                ${planRef2}
                <span style="font-size:9px;color:var(--or);font-family:var(--fm);margin-left:4px">cum:${(+item.cumActual||0).toFixed(1)}%</span>
                ${histRows?`<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">${histRows}</div>`:''}
                ${recentLogs?`<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">${recentLogs}</div>`:''}
              </div>
              <div>
                <label style="font-size:9px;color:var(--or);display:block;font-weight:600">W.Actual % (minggu)</label>
                <input type="number" min="0" max="100" step="0.1" placeholder="0"
                  value="${wkd.wAct!=null?wkd.wAct:''}"
                  id="wpi_${item.id}_wact"
                  oninput="updateWbsProgPreview()"
                  style="width:100%;padding:4px 8px;font-size:13px;font-weight:700;text-align:center;border-radius:4px;border:1.5px solid ${wkd.wAct!=null?'var(--or)':'var(--bd)'};background:${wkd.wAct!=null?'rgba(249,115,22,.08)':'var(--sf2)'}" class="fi">
              </div>
            </div>
            ${'<'}!-- Daily update row -->
            <div style="display:grid;grid-template-columns:130px 80px 1fr auto;gap:6px;align-items:center;margin-top:6px;padding:6px 8px;background:var(--sf2);border-radius:6px;border:1px dashed var(--bd)">
              <div style="font-size:9px;color:var(--mt);font-weight:600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> UPDATE HARIAN</div>
              <div>
                <label style="font-size:8px;color:var(--mt);display:block">Tanggal</label>
                <input type="date" value="${today}" id="wdi_${item.id}_date" class="fi" style="padding:2px 4px;font-size:10px;width:100%">
              </div>
              <div style="display:grid;grid-template-columns:70px 1fr;gap:6px">
                <div>
                  <label style="font-size:8px;color:var(--mt);display:block">% Hari Ini</label>
                  <input type="number" min="0" max="100" step="0.1" placeholder="0"
                    value="${todayLog.pct!=null?todayLog.pct:''}"
                    id="wdi_${item.id}_pct" class="fi"
                    style="padding:3px 6px;font-size:12px;font-weight:700;text-align:center;border:1px solid var(--gn);background:rgba(16,185,129,.06);width:100%;border-radius:4px">
                </div>
                <div>
                  <label style="font-size:8px;color:var(--mt);display:block">Catatan</label>
                  <input type="text" placeholder="kendala, aktivitas..."
                    value="${todayLog.notes||''}"
                    id="wdi_${item.id}_notes" class="fi"
                    style="padding:3px 6px;font-size:11px;width:100%;border-radius:4px">
                </div>
              </div>
              <div>
                <button class="btn btn-sm" style="padding:3px 8px;font-size:10px;border-color:var(--gn);color:var(--gn);margin-top:10px"
                  onclick="saveDailyLog('${item.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
              </div>
            </div>
          </div>`; 
        });
      }
    });
  });
  $('wbsProgressForm').innerHTML=html;
  updateWbsProgPreview();
}
// Sync daily logs -> cumActual per node -> project.actual
function _syncDailyToProject(projId){
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  const proj=P.find(p=>String(p.id)===String(projId));

  // Recalculate cumActual dari dailyLogs qty (source of truth)
  leafNodes.forEach(node=>{
    const dl=node.dailyLogs||[];
    if(+node.qtyPlan>0){
      // Qty-based: totalQty kumulatif / qtyPlan
      const totalQty=dl.reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
      node.cumActual=Math.min(100,Math.round(totalQty/node.qtyPlan*10000)/100);
    } else if(dl.length>0){
      // Pct-based fallback (legacy)
      node.cumActual=Math.min(100,Math.round(dl.reduce((s,l)=>s+(+l.pct||0),0)*100)/100);
    }
    // Sync cumActual ke weeklyData per minggu
    if(node.weeklyData){
      const weeks=[...new Set(dl.map(l=>l.week).filter(Boolean))].sort((a,b)=>a-b);
      weeks.forEach(w=>{
        const wLogs=dl.filter(l=>l.week===w);
        if(+node.qtyPlan>0){
          const wQty=wLogs.reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
          const wAct=Math.min(100,Math.round(wQty/node.qtyPlan*10000)/100);
          const cumQty=dl.filter(l=>(l.week||0)<=w).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
          const cAct=Math.min(100,Math.round(cumQty/node.qtyPlan*10000)/100);
          node.weeklyData[w]={...(node.weeklyData[w]||{}),wAct,cAct};
        }
      });
    }
  });

  // Update project actual & status
  if(proj){
    const cWeighted=leafNodes.reduce((s,n)=>(s+(+n.bobot||0)*(+n.cumActual||0)/100),0);
    const cPlanWeighted=leafNodes.reduce((s,n)=>{
      const wp=n.weeklyPlan||{};
      const cum=Math.min(100,Object.keys(wp).reduce((ss,k)=>ss+(+(wp[k].wPlan||0)),0));
      return s+(+n.bobot||0)*cum/100;
    },0);
    proj.actual=Math.round(cWeighted*10)/10;
    if(cPlanWeighted>0)proj.plan=Math.round(cPlanWeighted*10)/10;
    const variance=proj.actual-(proj.plan||0);
    if(proj.actual>=100)proj.status='Done';
    else if(variance>=-3)proj.status='On Track';
    else if(variance>=-10)proj.status='Delayed';
    else proj.status='Critical';
    if(!proj.history)proj.history=[];
    const today=new Date().toLocaleDateString('id-ID');
    // Add history only if not duplicate of today
    const lastH=proj.history.slice(-1)[0];
    if(!lastH||lastH.date!==today||lastH.actual!==proj.actual){
      proj.history.push({date:today,actual:proj.actual,plan:proj.plan||0,notes:'Update harian WBS'});
    }
  }
  // Sync S-Curve
  syncWbsToSCurve(projId);
}

function getWbsWeekNum(projId, date){
  const proj=P.find(p=>String(p.id)===String(projId));
  if(!proj?.mulai||!date)return null;
  // Snap project start ke Senin terdekat (ke belakang)
  const startRaw=new Date(proj.mulai+'T00:00:00');
  const dow=startRaw.getDay(); // 0=Min,1=Sen,...,6=Sab
  const snapDays=dow===0?-6:1-dow; // mundur ke Senin
  const weekStart=new Date(startRaw.getTime()+snapDays*86400000);
  const d=new Date(date+'T00:00:00');
  const diffDays=Math.floor((d-weekStart)/86400000);
  if(diffDays<0)return null;
  // Cut-off Minggu: Senin-Minggu = satu minggu
  return Math.floor(diffDays/7)+1;
}

function renderWbsDailyForm(){
  const projId=$('wbsDailyProj')?.value;
  const date=$('wbsDailyDate')?.value||new Date().toISOString().slice(0,10);
  if(!projId){$('wbsDailyForm').innerHTML='';return;}

  // Detect week
  const weekNum=getWbsWeekNum(projId,date);
  const weekInfo=$('wbsDailyWeekInfo');
  if(weekInfo){
    if(weekNum){
      weekInfo.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> <b style="color:var(--bl)">Tanggal ${date}</b> masuk ke <b style="color:var(--or)">Minggu W${String(weekNum).padStart(2,'0')}</b> \u2014 progress harian akan otomatis masuk ke W${String(weekNum).padStart(2,'0')}`;
      weekInfo.style.borderLeft='3px solid var(--or)';
    }else{
      const proj=P.find(p=>String(p.id)===String(projId));
      weekInfo.innerHTML=proj?.mulai
        ?`⚠ Tanggal dipilih sebelum tanggal mulai project (${proj.mulai})`
        :`⚠ Tanggal mulai project belum diset \u2014 buka Edit Project untuk mengisi`;
      weekInfo.style.borderLeft='3px solid var(--yw)';
    }
  }

  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  if(!leafNodes.length){$('wbsDailyForm').innerHTML='<div style="text-align:center;color:var(--mt);padding:20px">Belum ada item WBS.</div>';return;}
  let html='';
  cats.forEach((cat,ci)=>{
    html+=`<div style="font-family:var(--fd);font-size:12px;letter-spacing:1px;color:var(--bl);margin:10px 0 4px;padding:6px 10px;background:rgba(59,130,246,.07);border-radius:6px">${String.fromCharCode(65+ci)}. ${safeStr(cat.name)}</div>`;
    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>a.order-b.order);
      const isLeafSub=subItems.length===0;
      const renderNodeRow=(node,label)=>{
        const dl=node.dailyLogs||[];
        const existing=dl.find(l=>l.date===date)||{};
        // Get current week's wAct if exists
        const wkAct=weekNum&&node.weeklyData&&node.weeklyData[weekNum]?.wAct!=null?node.weeklyData[weekNum].wAct:null;
        const recent=dl.slice(-3).reverse().map(l=>l.date!==date?`<span style="font-size:9px;font-family:var(--fm);padding:1px 5px;border-radius:3px;background:var(--sf);border:1px solid var(--bd);color:var(--mt)">${l.date.slice(5)}: +${(+l.pct||0).toFixed(1)}%${l.notes?' \u2014 '+l.notes:''}</span>`:'').filter(Boolean).join(' ');
        return `<div style="display:grid;grid-template-columns:1fr 80px 1fr auto;gap:8px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--bd)">
          <div>
            <span style="font-size:11px;font-weight:500">${label}</span>
            <span style="font-size:9px;color:var(--mt);font-family:var(--fm);margin-left:6px">bobot:${(+node.bobot||0).toFixed(1)}%</span>
            <span style="font-size:9px;color:var(--or);font-family:var(--fm);margin-left:4px">cum:${(+node.cumActual||0).toFixed(1)}%</span>
            ${weekNum&&wkAct!=null?`<span style="font-size:9px;color:var(--bl);font-family:var(--fm);margin-left:4px">W${String(weekNum).padStart(2,'0')}:${wkAct.toFixed(1)}%</span>`:''}
            ${recent?`<div style="margin-top:2px;display:flex;gap:3px;flex-wrap:wrap">${recent}</div>`:''}
          </div>
          <div>
            <label style="font-size:9px;color:var(--gn);display:block;font-weight:600">% Hari Ini</label>
            <input type="number" min="0" max="100" step="0.1" placeholder="\u2014"
              value="${existing.pct!=null?existing.pct:''}"
              id="wdl_${node.id}_pct" class="fi"
              style="padding:4px 6px;font-size:13px;font-weight:700;text-align:center;border:1.5px solid ${existing.pct!=null?'var(--gn)':'var(--bd)'};background:${existing.pct!=null?'rgba(16,185,129,.08)':'var(--sf2)'};border-radius:4px;width:100%">
          </div>
          <div>
            <label style="font-size:9px;color:var(--mt);display:block">Catatan / Kendala</label>
            <input type="text" placeholder="aktivitas, kendala..."
              value="${existing.notes||''}"
              id="wdl_${node.id}_notes" class="fi"
              style="padding:4px 8px;font-size:11px;border-radius:4px;width:100%">
          </div>
          <div style="padding-top:12px">
            <button class="btn btn-sm" style="padding:3px 8px;font-size:10px;border-color:var(--gn);color:var(--gn)" onclick="saveSingleDailyLog('${node.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button>
          </div>
        </div>`;
      };
      if(isLeafSub){
        html+=renderNodeRow(sub,`${ci+1}.${si+1} ${safeStr(sub.name)}`);
      }else{
        html+=`<div style="font-size:11px;color:var(--gn);padding:4px 10px;font-weight:600">${ci+1}.${si+1} ${safeStr(sub.name)}</div>`;
        subItems.forEach((item,ii)=>{
          html+=renderNodeRow(item,`${ci+1}.${si+1}.${ii+1} ${safeStr(item.name)}`);
        });
      }
    });
  });
  $('wbsDailyForm').innerHTML=html||'<div style="text-align:center;color:var(--mt);padding:20px">Tidak ada item</div>';
}

function saveSingleDailyLog(nodeId){
  const node=WBS.find(w=>String(w.id)===String(nodeId));if(!node)return;
  const date=$('wbsDailyDate')?.value||new Date().toISOString().slice(0,10);
  const pct=parseFloat($('wdl_'+nodeId+'_pct')?.value)||0;
  const notes=($('wdl_'+nodeId+'_notes')?.value||'').trim();
  if(!node.dailyLogs)node.dailyLogs=[];
  const idx=node.dailyLogs.findIndex(l=>l.date===date);
  const weekNum=getWbsWeekNum(node.projId,date);
  const entry={date,pct,notes,week:weekNum,ts:Date.now()};
  if(idx>=0)node.dailyLogs[idx]=entry;else node.dailyLogs.push(entry);
  node.dailyLogs.sort((a,b)=>a.date.localeCompare(b.date));
  // Sync daily logs ke weeklyData \u2014 sum semua daily pct dalam minggu yang sama
  if(weekNum){
    if(!node.weeklyData)node.weeklyData={};
    const weekLogs=node.dailyLogs.filter(l=>l.week===weekNum);
    const wAct=Math.min(100,weekLogs.reduce((s,l)=>s+(+l.pct||0),0));
    node.weeklyData[weekNum]={...(node.weeklyData[weekNum]||{}),wAct:Math.round(wAct*100)/100};
    // Recalculate cumulative
    const wd=node.weeklyData;
    const cumAct=Math.min(100,Object.keys(wd).filter(k=>+k<=weekNum).reduce((s,k)=>s+(+(wd[k].wAct||0)),0));
    node.weeklyData[weekNum].cAct=Math.round(cumAct*100)/100;
    node.cumActual=node.weeklyData[weekNum].cAct;
  }
  _syncDailyToProject(node.projId);
  dirty();render();if(selId)renderDetail(selId);renderWBS();gsSync();
  const el=$('wdl_'+nodeId+'_pct');
  if(el){el.style.borderColor='var(--gn)';el.style.background='rgba(16,185,129,.12)';}
  toast(`✓ ${node.name.slice(0,20)}${weekNum?' \u2014 W'+String(weekNum).padStart(2,'0'):''} \u2014 ${date}`);
}

function saveAllDailyLogs(){
  const projId=$('wbsDailyProj')?.value;if(!projId)return;
  const date=$('wbsDailyDate')?.value||new Date().toISOString().slice(0,10);
  const weekNum=getWbsWeekNum(projId,date);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  let saved=0;
  leafNodes.forEach(node=>{
    const el=$('wdl_'+node.id+'_pct');if(!el||el.value==='')return;
    const pct=parseFloat(el.value)||0;
    const notes=($('wdl_'+node.id+'_notes')?.value||'').trim();
    if(!node.dailyLogs)node.dailyLogs=[];
    const idx=node.dailyLogs.findIndex(l=>l.date===date);
    const entry={date,pct,notes,week:weekNum,ts:Date.now()};
    if(idx>=0)node.dailyLogs[idx]=entry;else node.dailyLogs.push(entry);
    node.dailyLogs.sort((a,b)=>a.date.localeCompare(b.date));
    // Sync ke weeklyData
    if(weekNum){
      if(!node.weeklyData)node.weeklyData={};
      const weekLogs=node.dailyLogs.filter(l=>l.week===weekNum);
      const wAct=Math.min(100,weekLogs.reduce((s,l)=>s+(+l.pct||0),0));
      node.weeklyData[weekNum]={...(node.weeklyData[weekNum]||{}),wAct:Math.round(wAct*100)/100};
      // cAct = cumulative qty up to this week / qtyPlan (source of truth)
      const cumQty=node.dailyLogs.filter(l=>l.week!=null&&+l.week<=weekNum).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
      const cumAct=Math.min(100,cumQty/node.qtyPlan*100);
      node.weeklyData[weekNum].cAct=Math.round(cumAct*100)/100;
      node.cumActual=node.weeklyData[weekNum].cAct;
    }
    saved++;
  });
  if(saved){
    _syncDailyToProject(projId);
    syncWbsToSCurve(projId);
    dirty();render();if(selId)renderDetail(selId);renderWBS();gsSync();
    toast(`✓ ${saved} item tersimpan${weekNum?' \u2014 W'+String(weekNum).padStart(2,'0'):''} \u2014 ${date}`);
  }else{toast('Tidak ada data yang diisi','warn');}
  renderWbsDailyForm();
}

function saveDailyLog(itemId){
  const node=WBS.find(w=>String(w.id)===String(itemId));if(!node)return;
  const date=$('wdi_'+itemId+'_date')?.value||new Date().toISOString().slice(0,10);
  const pct=parseFloat($('wdi_'+itemId+'_pct')?.value)||0;
  const notes=$('wdi_'+itemId+'_notes')?.value?.trim()||'';
  if(!node.dailyLogs)node.dailyLogs=[];
  const existing=node.dailyLogs.findIndex(l=>l.date===date);
  const entry={date,pct,notes,ts:Date.now()};
  if(existing>=0)node.dailyLogs[existing]=entry;
  else node.dailyLogs.push(entry);
  node.dailyLogs.sort((a,b)=>a.date.localeCompare(b.date));
  dirty();gsSync();
  // Refresh form untuk update tampilan
  renderWbsProgressForm();
  toast(`✓ Log harian ${date} disimpan`);
}

function updateWbsProgPreview(){
  const projId=$('wbsProgProj')?.value;const week=+($('wbsProgWeek')?.value||1);
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  let weighted=0,cumTot=0,planTot=0;
  leafNodes.forEach(node=>{
    const wActEl=$('wpi_'+node.id+'_wact');
    const wAct=parseFloat(wActEl?.value)||0;
    const wd=node.weeklyData||{};
    const prevWeeksSum=Object.keys(wd).filter(k=>+k<week).reduce((s,k)=>s+(+(wd[k].wAct||0)),0);
    const cumAct=Math.min(100,prevWeeksSum+wAct);
    const bobot=+node.bobot||0;
    weighted+=bobot*wAct/100;
    cumTot+=bobot*cumAct/100;
    // Plan
    const wPlanEl=$('wpp_'+node.id+'_wplan');
    if(wPlanEl&&wPlanEl.value!==''){
      const wPlan=parseFloat(wPlanEl.value)||0;
      const wp=node.weeklyPlan||{};
      const prevPlanSum=Object.keys(wp).filter(k=>+k<week).reduce((s,k)=>s+(+(wp[k].wPlan||0)),0);
      planTot+=bobot*Math.min(100,prevPlanSum+wPlan)/100;
    }else{
      // Use existing plan
      const wp=node.weeklyPlan||{};
      const cumPlan=Object.keys(wp).filter(k=>+k<=week).reduce((s,k)=>s+(+(wp[k].wPlan||0)),0);
      planTot+=bobot*Math.min(100,cumPlan)/100;
    }
  });
  if($('wbsProgWeighted'))$('wbsProgWeighted').textContent=weighted.toFixed(2)+'%';
  if($('wbsProgCumAct'))$('wbsProgCumAct').textContent=`Cum.Act: ${cumTot.toFixed(2)}%  |  Cum.Plan: ${planTot.toFixed(2)}%  |  Var: ${(cumTot-planTot>=0?'+':'')}${(cumTot-planTot).toFixed(2)}%`;
}

function saveWbsProgress(){
  const projId=$('wbsProgProj').value;const week=+$('wbsProgWeek').value;
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  const proj=P.find(p=>String(p.id)===String(projId));
  let cWeighted=0;
  leafNodes.forEach(node=>{
    const wActEl=$('wpi_'+node.id+'_wact');
    if(!wActEl)return;
    const wAct=parseFloat(wActEl.value)||0;
    if(!node.weeklyData)node.weeklyData={};
    const wd=node.weeklyData;
    wd[week]={wAct};
    const cumAct=Math.min(100,Object.keys(wd).filter(k=>+k<=week).reduce((s,k)=>s+(+(wd[k].wAct||0)),0));
    wd[week].cAct=Math.round(cumAct*100)/100;
    node.cumActual=wd[week].cAct;
    cWeighted+=(+node.bobot||0)*wd[week].cAct/100;
  });
  syncWbsToSCurve(projId);
  if(proj){
    proj.actual=Math.round(cWeighted*10)/10;
    // Hitung cum plan dari semua leaf nodes
    const all2=WBS.filter(w=>String(w.projId)===String(projId));
    const leaves=all2.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all2.some(x=>x.type==='item'&&x.parentId===w.id)));
    const cPlanWeighted=leaves.reduce((s,node)=>{
      const wp=node.weeklyPlan||{};
      const cumPlan=Math.min(100,Object.keys(wp).reduce((ss,k)=>ss+(+(wp[k].wPlan||0)),0));
      return s+(+node.bobot||0)*cumPlan/100;
    },0);
    proj.plan=Math.round(cPlanWeighted*10)/10;
    const variance=proj.actual-(proj.plan||0);
    if(proj.actual>=100)proj.status='Done';
    else if(variance>=-3)proj.status='On Track';
    else if(variance>=-10)proj.status='Delayed';
    else proj.status='Critical';
    if(!proj.history)proj.history=[];
    proj.history.push({date:new Date().toLocaleDateString('id-ID'),actual:proj.actual,plan:proj.plan||0,notes:`Update WBS W${String(week).padStart(2,'0')}`});
    toast(`✓ W${String(week).padStart(2,'0')} disimpan · Cum.Actual ${proj.actual.toFixed(1)}% (${proj.status})`);
  }
  dirty();cm('wbsProgress');render();if(selId)renderDetail(selId);renderWBS();gsSync();
}
function syncWbsToSCurve(projId){
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)&&+w.bobot>0));
  if(!leafNodes.length)return;
  const proj=P.find(p=>String(p.id)===String(projId));

  // Week start: snap project mulai ke Senin
  let weekStartBase=null;
  if(proj?.mulai){
    const raw=new Date(proj.mulai+'T00:00:00');
    const dow=raw.getDay();
    const snap=dow===0?-6:1-dow;
    weekStartBase=new Date(raw.getTime()+snap*86400000);
  }

  const weekSet=new Set();
  leafNodes.forEach(node=>{
    for(const k in (node.weeklyData||{})){const n=parseInt(k,10);if(!isNaN(n)&&n>0)weekSet.add(n);}
    for(const k in (node.weeklyPlan||{})){const n=parseInt(k,10);if(!isNaN(n)&&n>0)weekSet.add(n);}
    // Also include weeks from dailyLogs (Daily Report input)
    (node.dailyLogs||[]).forEach(l=>{const n=parseInt(l.week,10);if(!isNaN(n)&&n>0)weekSet.add(n);});
  });
  if(!weekSet.size)return;
  SCURVE=SCURVE.filter(d=>!(String(d.projId)===String(projId)&&(d.fromWbs===true||d.fromWbs==='true'||d.fromWbs===1)));
  const prevCumByNode={};
  [...weekSet].sort((a,b)=>a-b).forEach(week=>{
    let wPlan=0,wAct=0,cPlanContrib=0;
    // cAct = weighted sum of each node's cumActual up to this week
    let cActContrib=0;
    leafNodes.forEach(node=>{
      const bobot=+node.bobot||0;
      const wp=node.weeklyPlan||{};
      const wd=node.weeklyData||{};
      // wAct from weeklyData
      wAct+=bobot*(+(wd[week]?.wAct||0))/100;
      // cAct: use cAct from weeklyData, fallback to cumActual for last known week
      const keysUpTo=Object.keys(wd).filter(k=>+k<=week&&wd[k].cAct!=null).map(Number);
      const maxWeekWithAct=keysUpTo.length>0?Math.max(...keysUpTo):0;
      // Check if this is the last available week (use cumActual as fallback)
      const allWeeks=[...weekSet].sort((a,b)=>a-b);
      const isLastOrBeyond=week>=Math.max(...[...weekSet]);
      if(maxWeekWithAct>0){
        cActContrib+=bobot*(+wd[maxWeekWithAct].cAct||0)/100;
      } else if(isLastOrBeyond&&(+node.cumActual||0)>0){
        // Fallback: use cumActual directly for latest week if no weeklyData.cAct
        cActContrib+=bobot*(+node.cumActual||0)/100;
      }
      // Plan
      let cumPlanNode=null;
      if(wp[week]?.cumPlan!=null){cumPlanNode=+wp[week].cumPlan;}
      else if(Object.keys(wp).some(k=>+k<=week&&wp[k]?.wPlan!=null)){
        cumPlanNode=Math.min(100,Object.keys(wp).filter(k=>+k<=week).reduce((s,k)=>s+(+(wp[k].wPlan||0)),0));
      }
      if(cumPlanNode!=null){
        cPlanContrib+=bobot*cumPlanNode/100;
        const prevCum=prevCumByNode[node.id]||0;
        wPlan+=bobot*Math.max(0,cumPlanNode-prevCum)/100;
        prevCumByNode[node.id]=cumPlanNode;
      }
    });
    // dateStart = Senin minggu ke-week (cut-off Minggu)
    let dateStart='';
    if(weekStartBase){
      const d=new Date(weekStartBase.getTime()+(week-1)*7*86400000);
      dateStart=d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
    } else {
      dateStart='W'+String(week).padStart(2,'0');
    }
    SCURVE.push({projId,week,
      wPlan:Math.round(wPlan*100)/100,
      wAct:Math.round(wAct*100)/100,
      cPlan:Math.round(cPlanContrib*100)/100,
      cAct:Math.min(100,Math.round(cActContrib*100)/100),
      dateStart,fromWbs:true});
  });
  // Auto-refresh WBS S-Curve chart HANYA jika projId ini yang sedang ditampilkan
  if(activeTab==='wbs' && typeof renderWbsSCurve==='function'){
    const _activeWbsProj=String($('wbsProjSel')?.value||'');
    if(_activeWbsProj===String(projId)){
      setTimeout(()=>renderWbsSCurve(projId), 50);
    }
  }
}
function resyncAndDrawSCurve(){
  const projId=$('wbsProjSel')?.value||selId;
  if(!projId){toast('Pilih project dulu','error');return;}
  const wbsItems=WBS.filter(w=>String(w.projId)===String(projId));
  if(!wbsItems.length){toast('Tidak ada WBS untuk project ini','error');return;}
  syncWbsToSCurve(projId);
  dirty();
  setTimeout(()=>{
    renderWbsSCurve(projId);
    const scData=SCURVE.filter(d=>String(d.projId)===String(projId)&&d.fromWbs);
    toast(`✓ S-Curve direbuild — ${scData.length} minggu data`);
  },100);
  gsSync();
}

function resyncScurveFromWbs(){
  const projId=$('scProjSel')?.value;
  if(!projId){toast('Pilih project dulu','error');return;}
  const wbsItems=WBS.filter(w=>String(w.projId)===String(projId));
  if(!wbsItems.length){toast('Tidak ada data WBS untuk project ini','error');return;}
  syncWbsToSCurve(projId);
  dirty();renderSCurve();
  toast('✓ S-Curve berhasil di-rebuild dari WBS');
  gsSync();
}

function renderWbsSCurve(projId){
  // Guard: hanya render jika projId sesuai selector aktif
  const _activeSel=String($('wbsProjSel')?.value||'');
  if(_activeSel && _activeSel!==String(projId)) return;
  const _isFromWbs=d=>d.fromWbs===true||d.fromWbs==='true'||d.fromWbs===1;

  // Cek apakah project ini punya SCURVE data
  const hasAnyData=SCURVE.some(d=>String(d.projId)===String(projId)&&_isFromWbs(d));
  const section=$('wbsScSection');
  if(!hasAnyData){
    // Destroy chart lama (dari project sebelumnya) dan sembunyikan section
    if(window._wbsChart){window._wbsChart.destroy();window._wbsChart=null;}
    if(section)section.style.display='none';
    return;
  }
  if(section)section.style.display='block';
  const data=SCURVE.filter(d=>
    String(d.projId)===String(projId) &&
    _isFromWbs(d) &&
    ((+d.cPlan||0)>0||(+d.wPlan||0)>0||(+d.cAct||0)>0||(+d.wAct||0)>0)
  ).sort((a,b)=>a.week-b.week);
  console.log('[WBS S-Curve] projId='+projId+' data='+data.length+' SCURVE total='+SCURVE.length+
    ' fromWbs(any)='+SCURVE.filter(d=>_isFromWbs(d)).length+
    ' sample fromWbs='+JSON.stringify(SCURVE[0]?.fromWbs));
  const lastW=data.filter(d=>+d.cAct>0).slice(-1)[0]||data.slice(-1)[0];
  const cAct=+(lastW?.cAct||0);const cPlan=+(lastW?.cPlan||0);const varr=(cAct-cPlan).toFixed(1);
  const vClr=+varr>=0?'var(--gn)':+varr>=-5?'var(--yw)':'var(--rd)';
  if($('wbsScKpi'))$('wbsScKpi').innerHTML=`
    <div style="background:var(--sf2);border-radius:8px;padding:8px 10px;text-align:center"><div style="font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Cum. Plan</div><div style="font-family:var(--fd);font-size:20px;color:var(--gn)">${cPlan.toFixed(1)}%</div></div>
    <div style="background:var(--sf2);border-radius:8px;padding:8px 10px;text-align:center"><div style="font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Cum. Actual</div><div style="font-family:var(--fd);font-size:20px;color:var(--or)">${cAct.toFixed(1)}%</div></div>
    <div style="background:var(--sf2);border-radius:8px;padding:8px 10px;text-align:center"><div style="font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Variance</div><div style="font-family:var(--fd);font-size:20px;color:${vClr}">${+varr>=0?'+':''}${varr}%</div></div>
    <div style="background:var(--sf2);border-radius:8px;padding:8px 10px;text-align:center"><div style="font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Progress</div><div style="font-family:var(--fd);font-size:20px;color:var(--bl)">${cAct.toFixed(0)}%</div></div>`;

  // Canvas render — support hidden tab via pending draw
  const tryDraw=(force)=>{
    const ctx=$('wbsScCanvas');
    if(!ctx||!window.Chart)return;
    // Jika canvas tidak visible (tab hidden), simpan pending lalu return
    const isVisible=ctx.offsetWidth>0||force;
    if(!isVisible){
      window._wbsPendingChart={projId,data};return;
    }
    window._wbsPendingChart=null;
    if(!data.length){
      // Jangan replace innerHTML karena akan hapus canvas — tampilkan overlay saja
      let noDataEl=document.getElementById('wbsScNoData');
      if(!noDataEl){
        noDataEl=document.createElement('div');
        noDataEl.id='wbsScNoData';
        noDataEl.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mt);font-size:12px;pointer-events:none';
        ctx.parentElement.style.position='relative';
        ctx.parentElement.appendChild(noDataEl);
      }
      noDataEl.textContent='Belum ada data — klik ↺ Rebuild S-Curve atau input via Daily Report';
      noDataEl.style.display='flex';
      return;
    }
    // Sembunyikan no-data overlay jika ada data
    const noDataEl=document.getElementById('wbsScNoData');
    if(noDataEl)noDataEl.style.display='none';
    if(window._wbsChart)window._wbsChart.destroy();
    const light=document.documentElement.classList.contains('light');
    const GRID=light?'rgba(0,0,0,.06)':'rgba(255,255,255,.06)';const TICK=light?'#94a3b8':'#64748b';
    const maxBar=Math.max(...data.map(d=>Math.max(+d.wPlan||0,+d.wAct||0)),1)*1.4;
    window._wbsChart=new Chart(ctx,{
      data:{labels:data.map(d=>'W'+String(d.week).padStart(2,'0')),datasets:[
        {type:'bar',data:data.map(d=>+(+d.wPlan||0).toFixed(2)),backgroundColor:'rgba(59,130,246,.5)',borderColor:'#3b82f6',borderWidth:1.5,borderRadius:{topLeft:3,topRight:3},yAxisID:'yB',order:3},
        {type:'bar',data:data.map(d=>+(+d.wAct||0).toFixed(2)),backgroundColor:'rgba(249,115,22,.75)',borderColor:'#f97316',borderWidth:1.5,borderRadius:{topLeft:3,topRight:3},yAxisID:'yB',order:2},
        {type:'line',data:data.map(d=>+(+d.cPlan||0).toFixed(2)),borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.12)',borderWidth:2.5,pointBackgroundColor:'#10b981',pointRadius:4,fill:true,tension:0.4,yAxisID:'yC',order:1},
        {type:'line',data:data.map(d=>(+d.cAct>0||+d.wAct>0)?+(+d.cAct||0).toFixed(2):null),borderColor:'#f59e0b',borderDash:[6,3],borderWidth:2.5,pointBackgroundColor:'#f59e0b',pointRadius:4,fill:false,tension:0.4,spanGaps:false,yAxisID:'yC',order:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{backgroundColor:light?'#1e293b':'#0f172a',titleColor:'#f1f5f9',bodyColor:'#94a3b8',borderColor:'rgba(255,255,255,.1)',borderWidth:1,padding:10,cornerRadius:8,
          callbacks:{title:i=>'Minggu '+i[0].label,label:i=>{if(i.raw===null)return null;return ' '+['W.Plan','W.Actual','Cum.Plan','Cum.Actual'][i.datasetIndex]+': '+(+i.raw).toFixed(2)+'%';}}}},
        scales:{
          x:{grid:{color:GRID},ticks:{color:TICK,font:{size:10},maxRotation:0},border:{display:false}},
          yB:{type:'linear',position:'left',grid:{display:false},ticks:{color:TICK,font:{size:10},callback:v=>v+'%'},border:{display:false},min:0,suggestedMax:maxBar,title:{display:true,text:'Weekly %',color:TICK,font:{size:10}}},
          yC:{type:'linear',position:'right',grid:{color:GRID},ticks:{color:TICK,font:{size:10},callback:v=>v+'%',stepSize:25},border:{display:false},min:0,max:100,title:{display:true,text:'Cumulative %',color:TICK,font:{size:10}}}
        }
      }
    });
  };
  // Retry beberapa kali untuk handle tab animation & async chart destroy
  setTimeout(()=>tryDraw(true), 50);
  setTimeout(()=>tryDraw(true), 250);
  setTimeout(()=>tryDraw(true), 600);
}
