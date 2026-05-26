// ===============================================================
// WEEKLY REPORT
// ===============================================================

// Weekly report photos \u2014 stored as base64 in memory
const wrPhotos = {}; // {1: {src, caption}, 2: ...}

function loadWrPhoto(n, input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    wrPhotos[n] = {src: e.target.result, caption: ''};
    // Update preview in modal
    const slot = $('wrPhotoSlot_'+n);
    if(slot){
      slot.innerHTML = `
        <img src="${e.target.result}" style="width:100%;height:90px;object-fit:contain;display:block;background:#f1f5f9">
        <button onclick="clearWrPhoto(${n},event)" style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,.9);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;line-height:1;padding:0">✕</button>
        <input type="file" id="wrPhotoFile_${n}" accept="image/*" style="display:none" onchange="loadWrPhoto(${n},this)">`;
    }
    toast(`✓ Foto ${n} dimuat`);
  };
  reader.readAsDataURL(file);
}

function clearWrPhoto(n, e){
  e.stopPropagation();
  delete wrPhotos[n];
  const slot = $('wrPhotoSlot_'+n);
  if(slot){
    slot.innerHTML = `
      <span style="font-size:20px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>
      <span style="font-size:9px;color:var(--mt);margin-top:2px">Foto ${n}</span>
      <input type="file" id="wrPhotoFile_${n}" accept="image/*" style="display:none" onchange="loadWrPhoto(${n},this)">`;
    slot.onclick = () => document.getElementById('wrPhotoFile_'+n)?.click();
  }
  if($('wrPhotoCaption_'+n)) $('wrPhotoCaption_'+n).value='';
}

function previewWrPhoto(input, slotId, captionId){} // legacy stub

function populateWeekOptions(){
  const projId=$('wrProj')?.value;if(!projId)return;
  const proj=P.find(p=>String(p.id)===String(projId));
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));
  const weekSet=new Set();
  leafNodes.forEach(n=>(n.dailyLogs||[]).forEach(l=>{if(l.week)weekSet.add(+l.week);}));
  SCURVE.filter(d=>String(d.projId)===String(projId)).forEach(d=>weekSet.add(+d.week));
  MPLOGS.filter(m=>String(m.projId)===String(projId)).forEach(m=>{
    const wn=getWbsWeekNum(projId,m.date);
    if(wn)weekSet.add(wn);
  });
  // Jika tidak ada data minggu tapi ada MPLOGS → kemungkinan proj.mulai tidak diisi
  // Fallback: gunakan urutan tanggal unik dari MPLOGS sebagai "minggu"
  if(!weekSet.size){
    const mpDates=[...new Set(MPLOGS.filter(m=>String(m.projId)===String(projId)).map(m=>m.date))].sort();
    if(mpDates.length){
      // Coba ambil mulai dari tanggal MP log pertama jika proj.mulai kosong
      const warn=$('wrWeekWarn');
      if(!proj?.mulai){
        if(warn)warn.style.display='block';
        // Estimasi minggu dari tanggal pertama MP log
        const firstDate=mpDates[0];
        mpDates.forEach(d=>{
          const diff=Math.floor((new Date(d)-new Date(firstDate))/86400000);
          weekSet.add(Math.floor(diff/7)+1);
        });
      }
    }
  }else{
    const warn=$('wrWeekWarn');if(warn)warn.style.display='none';
  }
  const weeks=[...weekSet].sort((a,b)=>a-b);
  const sel=$('wrWeek');
  if(!sel)return;
  if(!weeks.length){
    sel.innerHTML='<option value="">Belum ada data</option>';
    const warn=$('wrWeekWarn');
    if(warn){warn.style.display='block';warn.textContent='⚠ Pastikan Tanggal Mulai project sudah diisi dan ada data Daily Log / Manpower.';}
    return;
  }
  sel.innerHTML=weeks.map(w=>`<option value="${w}">W${String(w).padStart(2,'0')}</option>`).join('');
  sel.value=weeks[weeks.length-1];
}

function toggleMrCustom(){
  const v=gv('mrPeriod')||'';
  const w=$('mrCustomWrap');if(w)w.style.display=v==='custom'?'flex':'none';
}

function generateMpReport(){
  const projId=gv('mrProj')||'';
  const period=gv('mrPeriod')||'week';
  const today=new Date().toISOString().slice(0,10);
  let dateFrom='',dateTo=today,periodLabel='';

  if(period==='week'){
    const d=new Date();d.setDate(d.getDate()-d.getDay()+1);
    dateFrom=d.toISOString().slice(0,10);
    periodLabel='Minggu Ini ('+dateFrom+' s/d '+dateTo+')';
  } else if(period==='lastweek'){
    const d=new Date();d.setDate(d.getDate()-d.getDay()-6);
    dateFrom=d.toISOString().slice(0,10);
    const d2=new Date();d2.setDate(d2.getDate()-d2.getDay());
    dateTo=d2.toISOString().slice(0,10);
    periodLabel='Minggu Lalu ('+dateFrom+' s/d '+dateTo+')';
  } else if(period==='month'){
    dateFrom=today.slice(0,7)+'-01';
    periodLabel='Bulan Ini ('+dateFrom+' s/d '+dateTo+')';
  } else if(period==='all'){
    dateFrom='';periodLabel='Semua Periode';
  } else if(period==='custom'){
    dateFrom=gv('mrDateFrom')||'';
    dateTo=gv('mrDateTo')||today;
    periodLabel='Periode '+dateFrom+' s/d '+dateTo;
  }

  const proj=projId?P.find(p=>String(p.id)===String(projId)):null;
  const html=buildMpReportHTML(projId,dateFrom,dateTo,periodLabel,proj);
  cm('mpReport');

  const old=document.getElementById('mpReportFrame');if(old)old.remove();
  const oldC=document.getElementById('mpRCloseBtn');if(oldC)oldC.remove();
  const oldP=document.getElementById('mpRPrintBtn');if(oldP)oldP.remove();

  // Ambil logo dari localStorage atau dashLogoImg
  let _pdfLogo=''; try{_pdfLogo=localStorage.getItem('atw_dash_logo')||'';}catch(e){}
  if(!_pdfLogo){const _li=$('dashLogoImg');if(_li&&_li.src&&_li.src.startsWith('data:'))_pdfLogo=_li.src;}
  const _mpPrintDate=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const fullHtml=`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Manpower Report — ${proj?.kode||'All Projects'}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:10.5px}
      .pdf-wrap{width:100%;border-collapse:collapse;table-layout:fixed}
      .pdf-wrap thead td,.pdf-wrap tfoot td{padding:0}
      .pdf-wrap tbody td{padding:0;vertical-align:top}
      .pdf-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#1e293b;color:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pdf-hdr-logo{height:32px;object-fit:contain;background:#fff;border-radius:3px;padding:2px 4px}
      .pdf-hdr-info{margin-left:10px}
      .pdf-hdr-title{font-size:12px;font-weight:700;letter-spacing:.2px}
      .pdf-hdr-sub{font-size:8.5px;color:#94a3b8;margin-top:1px}
      .pdf-hdr-right{text-align:right;font-size:9px;color:#94a3b8;white-space:nowrap}
      .pdf-hdr-right strong{display:block;font-size:11px;color:#f1f5f9;margin-bottom:1px}
      .pdf-hdr-spacer{height:10px}
      .pdf-ftr{display:flex;align-items:center;justify-content:space-between;padding:5px 14px;border-top:1.5px solid #1e293b;font-size:8px;color:#6b7280;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pdf-ftr-spacer{height:6px}
      .wr-sec{margin-bottom:14px}
      .wr-sec-title{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f97316;border-bottom:1px solid #fed7aa;padding-bottom:3px;margin-bottom:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table.data-table,table.wr-tbl{width:100%;border-collapse:collapse;font-size:9.5px}
      table.data-table th,table.wr-tbl th{background:#1e293b;color:#f1f5f9;padding:4px 7px;text-align:left;font-size:8.5px;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .data-table th.r,.data-table td.r,.wr-tbl th.r,.wr-tbl td.r{text-align:center}
      table.data-table td,table.wr-tbl td{padding:3px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
      table.data-table tr:nth-child(even) td,table.wr-tbl tr:nth-child(even) td{background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .kat-row td{background:#dbeafe;color:#1e40af!important;font-weight:700;font-size:9px;color:#1e40af;padding:5px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .sub-row td{background:#fefce8!important;font-size:8.5px;padding:2px 7px;color:#374151;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .total-row td{background:#1e293b!important;color:#f1f5f9!important;font-weight:700;padding:5px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:600}
      .pb,.wr-pb{page-break-before:always;break-before:page}
      @media print{
        @page{size:A4 landscape;margin:12mm}
        body{padding:0}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        tbody{display:table-row-group}
        tr{break-inside:avoid}
      }
    </style>
  </head><body>
  <table class="pdf-wrap"><thead><tr><td>
    <div class="pdf-hdr">
      <div style="display:flex;align-items:center;flex:1">
        <img class="pdf-hdr-logo" src="${_pdfLogo}" alt="" onerror="this.style.display='none'">
        <div class="pdf-hdr-info">
          <div class="pdf-hdr-title">ATW SOLAR &mdash; PROJECT PERFORMANCE</div>
          <div class="pdf-hdr-sub">Manpower Report &mdash; ${proj?.kode||'All Projects'}</div>
        </div>
      </div>
      <div style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;padding:0 18px">
        ${proj?.logo?('<img src="'+proj.logo+'" style="height:28px;max-width:110px;object-fit:contain;background:#fff;border-radius:3px;padding:2px 5px">'):''}
      </div>
      <div class="pdf-hdr-right" style="flex:0 0 auto">
        <strong>${proj?.name||'All Projects'}</strong>
        <span>Periode: ${periodLabel}</span>
      </div>
    </div>
    <div class="pdf-hdr-spacer"></div>
  </td></tr></thead>
  <tfoot><tr><td>
    <div class="pdf-ftr-spacer"></div>
    <div class="pdf-ftr">
      <span>ATW Solar &mdash; Project Performance</span>
      <span>Dicetak: ${_mpPrintDate}</span>
    </div>
  </td></tr></tfoot>
  <tbody><tr><td>${html}</td></tr></tbody>
  </table>
  </body></html>`;

  const iframe=document.createElement('iframe');
  iframe.id='mpReportFrame';
  iframe.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;border:none;background:#fff;display:block';
  document.body.appendChild(iframe);

  // Tulis HTML langsung ke iframe document (aman di semua environment)
  const iDoc=iframe.contentDocument||iframe.contentWindow.document;
  iDoc.open();iDoc.write(fullHtml);iDoc.close();

  setTimeout(()=>{
    const closeBtn=document.createElement('button');
    closeBtn.innerHTML='✕ Tutup';closeBtn.id='mpRCloseBtn';
    closeBtn.style.cssText='position:fixed;top:12px;right:12px;z-index:100000;background:#ef4444;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    closeBtn.onclick=()=>{iframe.remove();closeBtn.remove();printBtn.remove();};
    document.body.appendChild(closeBtn);
    const printBtn=document.createElement('button');
    printBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print / Save PDF';printBtn.id='mpRPrintBtn';
    printBtn.style.cssText='position:fixed;top:12px;right:100px;z-index:100000;background:#8b5cf6;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    printBtn.onclick=()=>iframe.contentWindow.print();
    document.body.appendChild(printBtn);
  },100);
}

function buildMpReportHTML(projId,dateFrom,dateTo,periodLabel,proj){
  const today=new Date().toISOString().slice(0,10);
  const fmtD=d=>d?d.split('-').reverse().join('/'):'-';
  // Logo: coba localStorage, lalu src dari dashLogoImg
  let logo='';
  try{logo=localStorage.getItem('atw_dash_logo')||'';}catch(e){}
  if(!logo){const img=$('dashLogoImg');if(img&&img.src&&!img.src.includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlg'))logo=img.src;}

  // Filter logs
  const logs=MPLOGS.filter(m=>{
    if(projId&&String(m.projId)!==String(projId))return false;
    if(dateFrom&&m.date<dateFrom)return false;
    if(dateTo&&m.date>dateTo)return false;
    return true;
  }).sort((a,b)=>a.date>b.date?1:-1);

  // Aggregate per WBS item dari activities[]
  const wbsMap=new Map();
  logs.forEach(log=>{
    const pr=P.find(p=>String(p.id)===String(log.projId));
    (log.activities||[]).forEach(act=>{
      const key=(act.wbsId||'_')+'|'+log.projId;
      if(!wbsMap.has(key)) wbsMap.set(key,{
        wbsId:act.wbsId||'',wbsName:act.wbsName||'(tanpa nama)',
        projKode:pr?.kode||'\u2014',projNama:pr?.nama||'',projId:String(log.projId),
        entries:[],spv:0,mandor:0,installer:0,tukang:0,helper:0,safety:0,total:0
      });
      const r=wbsMap.get(key);
      r.entries.push({date:log.date,spv:+act.spv||0,mandor:+act.mandor||0,
        installer:+act.installer||0,tukang:+act.tukang||0,helper:+act.helper||0,
        safety:+act.safety||0,total:+act.total||0,notes:act.notes||''});
      r.spv+=(+act.spv||0);r.mandor+=(+act.mandor||0);r.installer+=(+act.installer||0);
      r.tukang+=(+act.tukang||0);r.helper+=(+act.helper||0);r.safety+=(+act.safety||0);
      r.total+=(+act.total||0);
    });
  });

  const rows=[...wbsMap.values()].sort((a,b)=>a.projId.localeCompare(b.projId)||b.total-a.total);
  const grandTot={spv:0,mandor:0,installer:0,tukang:0,helper:0,safety:0,total:0};
  rows.forEach(r=>{grandTot.spv+=r.spv;grandTot.mandor+=r.mandor;grandTot.installer+=r.installer;
    grandTot.tukang+=r.tukang;grandTot.helper+=r.helper;grandTot.safety+=r.safety;grandTot.total+=r.total;});

  // Daily summary
  const dailyMap=new Map();
  logs.forEach(m=>{
    if(!dailyMap.has(m.date))dailyMap.set(m.date,{spv:0,mandor:0,installer:0,tukang:0,helper:0,safety:0,total:0,mh:0,tl:0});
    const d=dailyMap.get(m.date);
    d.spv+=(+m.spv||0);d.mandor+=(+m.mandor||0);d.installer+=(+m.installer||0);
    d.tukang+=(+m.tukang||0);d.helper+=(+m.helper||0);d.safety+=(+m.safety||0);
    d.total+=(+m.total||0);d.mh+=(+m.mhActual||0);d.tl+=(+m.timeLost||0);
  });
  const dailyRows=[...dailyMap.entries()].sort((a,b)=>a[0]>b[0]?1:-1);
  const totalMD=logs.reduce((s,m)=>s+(+m.total||0),0);
  const totalMH=logs.reduce((s,m)=>s+(+m.mhActual||0),0);
  const totalTL=logs.reduce((s,m)=>s+(+m.timeLost||0),0);

  const logoHtml=logo?`<img src="${logo}" style="height:54px;object-fit:contain">`:
    `<div style="font-weight:900;font-size:22px;color:#8b5cf6;letter-spacing:1px">ATW SOLAR</div>`;
  const projLabel=proj?`${proj.kode} \u2014 ${proj.nama}${proj.client?' ('+proj.client+')':''}${proj.mdPlan?' '+proj.mdPlan:''}`:'Semua Project';

  // ── Page 1 ──
  let html=`
  <div style="padding:20px 24px 16px">

    ${'<'}!-- HEADER -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;border-bottom:3px solid #8b5cf6;padding-bottom:12px">
      <div>${logoHtml}</div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px">${projLabel}</div>
        <div style="font-size:13px;font-weight:700;color:#8b5cf6">${periodLabel}</div>
        <div style="font-size:10px;color:#64748b;margin-top:3px">Dicetak: ${fmtD(today)} | ${logs.length} hari log | ${totalMD} orang-hari</div>
      </div>
    </div>

    ${'<'}!-- KPI CARDS -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${[
        {l:'TOTAL MANDAYS',v:totalMD+' MD',c:'#8b5cf6'},
        {l:'TOTAL MANHOURS',v:totalMH+' Jam',c:'#3b82f6'},
        {l:'TIME LOST',v:totalTL+' Jam',c:totalTL>0?'#ef4444':'#10b981'},
        {l:'ITEM PEKERJAAN',v:rows.length+' item',c:'#f97316'},
      ].map(k=>`<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 10px;text-align:center;border-top:3px solid ${k.c}">
        <div style="font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${k.l}</div>
        <div style="font-size:24px;font-weight:800;color:${k.c}">${k.v}</div>
      </div>`).join('')}
    </div>

    ${'<'}!-- REKAP HARIAN -->
    <div style="margin-bottom:6px;font-size:11px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.5px;border-left:4px solid #8b5cf6;padding-left:8px">REKAP HARIAN</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead>
        <tr style="background:#1e293b">
          <th style="color:#f1f5f9;padding:6px 8px;text-align:left;font-size:9px;letter-spacing:.4px">Tanggal</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">SPV</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Mandor</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Installer</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Tukang</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Helper</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Safety</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Total</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">MH (jam)</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">TL (jam)</th>
        </tr>
      </thead>
      <tbody>
        ${dailyRows.map(([date,d],i)=>`<tr style="background:${i%2===0?'#fff':'#f8fafc'}">
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-weight:600">${fmtD(date)}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.spv||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.mandor||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.installer||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.tukang||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.helper||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.safety||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#f97316">${d.total}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${d.mh||'\u2014'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:${d.tl>0?'#ef4444':'#94a3b8'}">${d.tl||'\u2014'}</td>
        </tr>`).join('')}
        <tr style="background:#1e293b">
          <td style="padding:6px 8px;color:#f1f5f9;font-weight:700">TOTAL</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.spv||0}</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.mandor||0}</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.installer||0}</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.tukang||0}</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.helper||0}</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.safety||0}</td>
          <td style="padding:6px 8px;color:#f97316;text-align:center;font-weight:700">${totalMD}</td>
          <td style="padding:6px 8px;color:#f1f5f9;text-align:center;font-weight:700">${totalMH}</td>
          <td style="padding:6px 8px;color:${totalTL>0?'#fca5a5':'#f1f5f9'};text-align:center;font-weight:700">${totalTL||'\u2014'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${'<'}!-- PAGE 2: Rekap per Item -->
  <div class="pb" style="padding:20px 24px 16px">

    ${'<'}!-- HEADER PAGE 2 -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:3px solid #8b5cf6;padding-bottom:10px">
      <div>
        <div style="font-size:16px;font-weight:800;color:#1e293b;letter-spacing:.3px">REKAP MANPOWER PER ITEM PEKERJAAN</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">${projLabel} | ${periodLabel}</div>
      </div>
      ${logoHtml}
    </div>

    ${'<'}!-- TABLE REKAP -->
    ${rows.length===0?`<div style="text-align:center;color:#94a3b8;padding:40px;font-size:12px">Belum ada data assignment aktivitas pada periode ini</div>`:`
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:20px">
      <thead>
        <tr style="background:#1e293b">
          <th style="color:#f1f5f9;padding:6px 8px;text-align:left;font-size:9px">Item Pekerjaan</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:left;font-size:9px">Project</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">SPV</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Mandor</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Inst</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Tukang</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Helper</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Safety</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">Total MD</th>
          <th style="color:#f1f5f9;padding:6px 8px;text-align:center;font-size:9px">%</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r=>{
          const pct=grandTot.total>0?Math.round(r.total/grandTot.total*100):0;
          const subRows=r.entries.sort((a,b)=>a.date>b.date?1:-1).map(e=>`
          <tr style="background:#fffbeb">
            <td style="padding:3px 8px 3px 20px;border-bottom:1px solid #e2e8f0;color:#78716c;font-size:9px">${fmtD(e.date)}${e.notes?' \u2014 '+e.notes.slice(0,50):''}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0"></td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px">${e.spv||'\u2014'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px">${e.mandor||'\u2014'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px">${e.installer||'\u2014'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px">${e.tukang||'\u2014'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px">${e.helper||'\u2014'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px">${e.safety||'\u2014'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px;font-weight:600;color:#f97316">${e.total}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e2e8f0"></td>
          </tr>`).join('');
          return`<tr style="background:#f8fafc">
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;font-weight:700;color:#1e293b">${r.wbsName}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;font-size:9px;color:#3b82f6;font-weight:600">${r.projKode}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center">${r.spv||'\u2014'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center">${r.mandor||'\u2014'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center">${r.installer||'\u2014'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center">${r.tukang||'\u2014'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center">${r.helper||'\u2014'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center">${r.safety||'\u2014'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center;font-weight:700;color:#f97316">${r.total}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #cbd5e1;text-align:center;font-size:9px;color:#64748b">${pct}%</td>
          </tr>${subRows}`;
        }).join('')}
        <tr style="background:#1e293b">
          <td colspan="2" style="padding:7px 8px;color:#f1f5f9;font-weight:700;font-size:11px">GRAND TOTAL \u2014 ${rows.length} item</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.spv||0}</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.mandor||0}</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.installer||0}</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.tukang||0}</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.helper||0}</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">${grandTot.safety||0}</td>
          <td style="padding:7px 8px;color:#f97316;text-align:center;font-weight:700">${grandTot.total}</td>
          <td style="padding:7px 8px;color:#f1f5f9;text-align:center;font-weight:700">100%</td>
        </tr>
      </tbody>
    </table>`}

    ${'<'}!-- SIGNATURE -->
    <div style="margin-top:40px;display:flex;justify-content:space-around">
      ${['Site Manager','Project Manager','Diketahui oleh'].map(role=>`
      <div style="text-align:center">
        <div style="height:44px;border-bottom:1px solid #1e293b;width:150px;margin:0 auto"></div>
        <div style="margin-top:5px;font-size:10px;color:#64748b">${role}</div>
      </div>`).join('')}
    </div>
  </div>`;

  return html;
}

function generateWeeklyReport(){
  const projId=$('wrProj').value;
  const week=+$('wrWeek').value;
  if(!projId||!week){toast('Pilih project dan minggu','warn');return;}

  // Collect captions into wrPhotos before building HTML
  for(let n=1;n<=6;n++){
    const cap=$('wrPhotoCaption_'+n)?.value?.trim()||'';
    if(wrPhotos[n])wrPhotos[n].caption=cap;
  }

  const html=buildWeeklyReportHTML(projId,week);
  cm('weeklyReport');

  const old=document.getElementById('weeklyPrintFrame');if(old)old.remove();
  const oldC=document.getElementById('wrCloseBtn');if(oldC)oldC.remove();
  const oldP=document.getElementById('wrPrintBtn');if(oldP)oldP.remove();

  // Ambil logo
  let _wrLogo=''; try{_wrLogo=localStorage.getItem('atw_dash_logo')||'';}catch(e){}
  if(!_wrLogo){const _wli=$('dashLogoImg');if(_wli&&_wli.src&&_wli.src.startsWith('data:'))_wrLogo=_wli.src;}
  const _wrPrintDate=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const _wrProj=P.find(p=>String(p.id)===String(projId));
  const fullHtml=`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Weekly Report W${String(week).padStart(2,'0')}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:10.5px}
      .pdf-wrap{width:100%;border-collapse:collapse;table-layout:fixed}
      .pdf-wrap thead td,.pdf-wrap tfoot td{padding:0}
      .pdf-wrap tbody td{padding:0;vertical-align:top}
      .pdf-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#1e293b;color:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pdf-hdr-logo{height:32px;object-fit:contain;background:#fff;border-radius:3px;padding:2px 4px}
      .pdf-hdr-info{margin-left:10px}
      .pdf-hdr-title{font-size:12px;font-weight:700;letter-spacing:.2px}
      .pdf-hdr-sub{font-size:8.5px;color:#94a3b8;margin-top:1px}
      .pdf-hdr-right{text-align:right;font-size:9px;color:#94a3b8;white-space:nowrap}
      .pdf-hdr-right strong{display:block;font-size:11px;color:#f1f5f9;margin-bottom:1px}
      .pdf-hdr-spacer{height:10px}
      .pdf-ftr{display:flex;align-items:center;justify-content:space-between;padding:5px 14px;border-top:1.5px solid #1e293b;font-size:8px;color:#6b7280;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pdf-ftr-spacer{height:6px}
      .wr-sec{margin-bottom:14px}
      .wr-sec-title{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f97316;border-bottom:1px solid #fed7aa;padding-bottom:3px;margin-bottom:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table.data-table,table.wr-tbl{width:100%;border-collapse:collapse;font-size:9.5px}
      table.data-table th,table.wr-tbl th{background:#1e293b;color:#f1f5f9;padding:4px 7px;text-align:left;font-size:8.5px;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .data-table th.r,.data-table td.r,.wr-tbl th.r,.wr-tbl td.r{text-align:center}
      table.data-table td,table.wr-tbl td{padding:3px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
      table.data-table tr:nth-child(even) td,table.wr-tbl tr:nth-child(even) td{background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .kat-row td{background:#dbeafe;color:#1e40af!important;font-weight:700;font-size:9px;color:#1e40af;padding:5px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .sub-row td{background:#fefce8!important;font-size:8.5px;padding:2px 7px;color:#374151;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .total-row td{background:#1e293b!important;color:#f1f5f9!important;font-weight:700;padding:5px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:600}
      .pb,.wr-pb{page-break-before:always;break-before:page}
      @media print{
        @page{size:A4 landscape;margin:12mm}
        body{padding:0}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        tbody{display:table-row-group}
        tr{break-inside:avoid}
      }
      svg{width:100%!important;height:auto!important}
      svg text{font-size:9px!important;font-family:Arial,sans-serif}
      svg text[font-weight='bold']{font-size:10px!important}
      svg text[text-anchor='middle']{font-size:8px!important}
      svg text[text-anchor='end']{font-size:8px!important}
    </style>
  </head><body>
  <table class="pdf-wrap"><thead><tr><td>
    <div class="pdf-hdr">
      <div style="display:flex;align-items:center;flex:1">
        <img class="pdf-hdr-logo" src="${_wrLogo}" alt="" onerror="this.style.display='none'">
        <div class="pdf-hdr-info">
          <div class="pdf-hdr-title">ATW SOLAR &mdash; PROJECT PERFORMANCE</div>
          <div class="pdf-hdr-sub">Weekly Report &mdash; Week ${String(week).padStart(2,'0')}</div>
        </div>
      </div>
      <div style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;padding:0 18px">
        ${_wrProj?.logo?('<img src="'+_wrProj.logo+'" style="height:28px;max-width:110px;object-fit:contain;background:#fff;border-radius:3px;padding:2px 5px">'):''}
      </div>
      <div class="pdf-hdr-right" style="flex:0 0 auto">
        <strong>${_wrProj?.kode||''} ${_wrProj?.name||''}</strong>
        <span>Week ${String(week).padStart(2,'0')} / ${new Date().getFullYear()}</span>
      </div>
    </div>
    <div class="pdf-hdr-spacer"></div>
  </td></tr></thead>
  <tfoot><tr><td>
    <div class="pdf-ftr-spacer"></div>
    <div class="pdf-ftr">
      <span>ATW Solar &mdash; Project Performance</span>
      <span>Dicetak: ${_wrPrintDate}</span>
    </div>
  </td></tr></tfoot>
  <tbody><tr><td>${html}</td></tr></tbody>
  </table>
  </body></html>`;

  const iframe=document.createElement('iframe');
  iframe.id='weeklyPrintFrame';
  iframe.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;border:none;background:#fff;display:block';
  document.body.appendChild(iframe);

  // Tulis HTML langsung ke iframe document (aman di semua environment)
  const iDoc=iframe.contentDocument||iframe.contentWindow.document;
  iDoc.open();iDoc.write(fullHtml);iDoc.close();

  // Tunggu sebentar agar konten render dulu
  setTimeout(()=>{
    const closeBtn=document.createElement('button');
    closeBtn.innerHTML='✕ Tutup Preview';closeBtn.id='wrCloseBtn';
    closeBtn.style.cssText='position:fixed;top:12px;right:12px;z-index:100000;background:#ef4444;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    closeBtn.onclick=()=>{iframe.remove();closeBtn.remove();printBtn.remove();};
    document.body.appendChild(closeBtn);
    const printBtn=document.createElement('button');
    printBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print / Save PDF';printBtn.id='wrPrintBtn';
    printBtn.style.cssText='position:fixed;top:12px;right:160px;z-index:100000;background:#f97316;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    printBtn.onclick=()=>iframe.contentWindow.print();
    document.body.appendChild(printBtn);
  },100);
}


function buildWeeklyReportHTML(projId,week){
  const proj=P.find(p=>String(p.id)===String(projId));if(!proj)return '';
  const all=WBS.filter(w=>String(w.projId)===String(projId));
  const cats=all.filter(w=>w.type==='cat').sort((a,b)=>a.order-b.order);
  const leafNodes=all.filter(w=>(w.type==='item')||(w.type==='subcat'&&!all.some(x=>x.type==='item'&&x.parentId===w.id)));

  // Week date range
  let weekStartDate=null,weekEndDate=null,weekStart='',weekEnd='';
  if(proj.mulai){
    const _raw=new Date(proj.mulai+'T00:00:00');
    const _dow=_raw.getDay();const _snap=_dow===0?-6:1-_dow;
    const _base=new Date(_raw.getTime()+_snap*86400000);
    weekStartDate=new Date(_base.getTime()+(week-1)*7*86400000);
    weekEndDate=new Date(weekStartDate.getTime()+6*86400000);
    weekStart=weekStartDate.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
    weekEnd=weekEndDate.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
  }
  const fmtD=d=>d?new Date(d+'T12:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'';

  // S-Curve
  const sc=SCURVE.find(d=>String(d.projId)===String(projId)&&d.week===week)||{};
  const cumPlan=+(sc.cPlan||0);const cumAct=+(sc.cAct||0);
  const wPlan=+(sc.wPlan||0);const wAct=+(sc.wAct||0);
  const variance=cumAct-cumPlan;
  const statusTxt=variance>=-3?'On Track':variance>=-10?'Delayed':'Critical';
  const statusClr=variance>=-3?'#16a34a':variance>=-10?'#ea580c':'#dc2626';

  // Manpower this week
  const mpLogs=MPLOGS.filter(m=>m.projId==projId&&getWbsWeekNum(projId,m.date)===week);
  const totalWorkers=mpLogs.reduce((s,m)=>s+(+m.total||0),0);
  const totalMH=mpLogs.reduce((s,m)=>s+(+m.mhActual||0),0);
  const timeLost=mpLogs.reduce((s,m)=>s+(+m.timeLost||0),0);
  const timeLostReasons=[...new Set(mpLogs.filter(m=>+m.timeLost>0).map(m=>m.timeLostReason).filter(Boolean))].join(', ');
  const totalSpv=mpLogs.reduce((s,m)=>s+(+m.spv||0),0);
  const totalMandor=mpLogs.reduce((s,m)=>s+(+m.mandor||0),0);
  const totalInstaller=mpLogs.reduce((s,m)=>s+(+m.installer||0),0);
  const totalTukang=mpLogs.reduce((s,m)=>s+(+m.tukang||0),0);
  const totalHelper=mpLogs.reduce((s,m)=>s+(+m.helper||0),0);
  const totalSafety=mpLogs.reduce((s,m)=>s+(+m.safety||0),0);

  // Daily activities this week
  const dailyData={};
  leafNodes.forEach(node=>{
    (node.dailyLogs||[]).filter(l=>l.week===week).forEach(l=>{
      if(!dailyData[l.date])dailyData[l.date]={items:[],mp:null};
      dailyData[l.date].items.push({node,log:l});
    });
  });
  mpLogs.forEach(m=>{if(!dailyData[m.date])dailyData[m.date]={items:[],mp:null};dailyData[m.date].mp=m;});
  const sortedDates=Object.keys(dailyData).sort();

  // Issues
  const issues=ISS.filter(i=>i.projId==projId&&i.status!=='Closed');

  // Accident logs this week
  const accLogs=ACCLOGS.filter(a=>a.projId==projId&&getWbsWeekNum(projId,a.date)===week);

  // Logo
  // Logo client dari project, logo ATW dari konstant
  const clientLogoHtml=proj.logo
    ?`<img src="${proj.logo}" style="height:50px;max-width:160px;object-fit:contain">`
    :`<div style="width:120px;height:50px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#94a3b8">Client Logo</div>`;
  const atwLogoHtml=`<img src="${ATW_LOGO_B64}" style="height:54px;max-width:180px;object-fit:contain">`;

  // Table styles
  const ts=`border:1px solid #d1d5db;border-collapse:collapse;width:100%;font-size:10px`;
  const th=`background:#e2e8f0;color:#1e293b;font-weight:700;padding:4px 6px;border:1px solid #9ca3af;text-align:center;font-size:9px;text-transform:uppercase`;
  const td=`padding:4px 6px;border:1px solid #d1d5db;vertical-align:top;color:#1e293b`;
  const tdc=`padding:4px 6px;border:1px solid #d1d5db;text-align:center;vertical-align:middle;color:#1e293b`;

  let html=`<div style="font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:20px 24px;max-width:100%;font-size:10px">

  ${'<'}!-- PROJECT INFO -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
    <div>
      <table style="${ts}">
        <tr><td style="${td};font-weight:700;background:#475569;color:#fff;width:120px">Project</td><td style="${td}">${proj.kode} \u2014 ${proj.nama}</td></tr>
        <tr><td style="${td};font-weight:700;background:#f9fafb">Client</td><td style="${td}">${proj.client||'\u2014'}</td></tr>
        <tr><td style="${td};font-weight:700;background:#f9fafb">Lokasi</td><td style="${td}">${proj.lokasi||'\u2014'}</td></tr>
        <tr><td style="${td};font-weight:700;background:#f9fafb">Periode</td><td style="${td}">${weekStart} \u2014 ${weekEnd}</td></tr>
        <tr><td style="${td};font-weight:700;background:#f9fafb">Minggu</td><td style="${td};font-weight:700;color:#f97316">W${String(week).padStart(2,'0')}</td></tr>
      </table>
    </div>
    <div>
      <table style="${ts}">
        <tr><td style="background:#1e293b;color:#f1f5f9;font-weight:700;padding:5px 6px;border:1px solid #0f172a;text-align:center;font-size:9px;text-transform:uppercase" colspan="4">PROGRESS REPORT</td></tr>
        <tr><th style="${th}">Indikator</th><th style="${th}">Weekly</th><th style="${th}">Kumulatif</th><th style="${th}">Status</th></tr>
        <tr><td style="${td};font-weight:700;color:#3b82f6">Plan</td><td style="${tdc}">${wPlan.toFixed(2)}%</td><td style="${tdc};font-weight:700">${cumPlan.toFixed(2)}%</td><td rowspan="2" style="${tdc};font-weight:700;color:${statusClr};font-size:12px">${statusTxt}</td></tr>
        <tr><td style="${td};font-weight:700;color:#f97316">Actual</td><td style="${tdc}">${wAct.toFixed(2)}%</td><td style="${tdc};font-weight:700;color:#f97316">${cumAct.toFixed(2)}%</td></tr>
        <tr><td style="${td};font-weight:700">Variance</td><td colspan="2" style="${tdc};font-weight:700;color:${statusClr}">${variance>=0?'+':''}${variance.toFixed(2)}%</td><td style="${tdc}"></td></tr>
        <tr><td style="${td};font-weight:700">Progress Bar</td><td colspan="3" style="${td}">
          <div style="margin-bottom:4px">
            <div style="font-size:8px;color:#3b82f6;margin-bottom:1px">Plan ${cumPlan.toFixed(1)}%</div>
            <div style="height:8px;background:#e5e7eb;border-radius:3px"><div style="width:${Math.min(100,cumPlan)}%;height:100%;background:#3b82f6;border-radius:3px"></div></div>
          </div>
          <div>
            <div style="font-size:8px;color:#f97316;margin-bottom:1px">Actual ${cumAct.toFixed(1)}%</div>
            <div style="height:8px;background:#e5e7eb;border-radius:3px"><div style="width:${Math.min(100,cumAct)}%;height:100%;background:#f97316;border-radius:3px"></div></div>
          </div>
        </td></tr>
      </table>
    </div>
  </div>

  ${'<'}!-- SECTION 1: PEKERJAAN MINGGU INI -->
  <div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:0">PEKERJAAN MINGGU INI (W${String(week).padStart(2,'0')})</div>
  <table style="${ts};margin-bottom:10px">
    <tr>
      <th style="${th};width:40px">#</th>
      <th style="${th}">Item Pekerjaan</th>
      <th style="${th};width:55px">Bobot</th>
      <th style="${th};width:70px">Qty Plan</th>
      <th style="${th};width:70px">Qty W${String(week).padStart(2,'0')}</th>
      <th style="${th};width:70px">Qty Cum.</th>
      <th style="${th};width:60px">% Selesai</th>
      <th style="${th};width:70px">Kontribusi</th>
      <th style="${th};width:55px">Satuan</th>
    </tr>`;

  // WBS rows
  cats.forEach((cat,ci)=>{
    html+=`<tr style="background:#dbeafe;color:#1e40af"><td style="${tdc};font-weight:700;color:#1d4ed8">${String.fromCharCode(65+ci)}</td><td style="${td};font-weight:700;color:#1d4ed8" colspan="8">${cat.name}</td></tr>`;
    all.filter(w=>w.type==='subcat'&&w.parentId===cat.id).sort((a,b)=>a.order-b.order).forEach((sub,si)=>{
      const subItems=all.filter(w=>w.type==='item'&&w.parentId===sub.id).sort((a,b)=>a.order-b.order);
      const isLeaf=subItems.length===0;
      if(isLeaf){html+=_wrItemRowNew(`${ci+1}.${si+1}`,sub,week,th,td,tdc,true);}
      else{
        html+=`<tr style="background:#dcfce7;color:#15803d"><td style="${tdc};color:#15803d">${ci+1}.${si+1}</td><td style="${td};font-weight:600;color:#15803d" colspan="8">${sub.name}</td></tr>`;
        subItems.forEach((item,ii)=>{html+=_wrItemRowNew(`${ci+1}.${si+1}.${ii+1}`,item,week,th,td,tdc,false);});
      }
    });
  });
  // Totals row
  const totalKontrib=leafNodes.reduce((s,n)=>s+_drNodeKontrib(n,weekStartDate?weekEndDate.toISOString().slice(0,10):new Date().toISOString().slice(0,10)),0);
  html+=`<tr style="background:#e2e8f0;color:#1e293b;font-weight:700">
    <td style="${tdc}" colspan="7">TOTAL KONTRIBUSI MINGGU INI</td>
    <td style="${tdc};color:#16a34a">${(totalKontrib*100).toFixed(2)}%</td><td></td>
  </tr>`;
  html+=`</table>`;

  // SECTION 2: AKTIVITAS HARIAN
  html+=`<div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:0;break-after:avoid;page-break-after:avoid">AKTIVITAS HARIAN</div>
  <table style="${ts};margin-bottom:10px;border-top:none">
    <thead style="display:table-header-group">
      <tr>
        <th style="${th};background:#374151;color:#fff;width:80px">Tanggal</th>
        <th style="${th};background:#374151;color:#fff;width:40px">Hari</th>
        <th style="${th};background:#374151;color:#fff">Item Pekerjaan</th>
        <th style="${th};background:#374151;color:#fff;width:80px">Qty Dikerjakan</th>
        <th style="${th};background:#374151;color:#fff;width:60px">Kontribusi</th>
        <th style="${th};background:#374151;color:#fff">Catatan / Kendala</th>
        <th style="${th};background:#374151;color:#fff;width:60px">Pekerja</th>
        <th style="${th};background:#374151;color:#fff;width:55px">MH (jam)</th>
        <th style="${th};background:#374151;color:#fff;width:55px">Time Lost</th>
      </tr>
    </thead>
    <tbody>`;
  if(sortedDates.length){
    sortedDates.forEach(date=>{
      const dd=dailyData[date];
      const d=new Date(date+'T12:00');
      const dayName=d.toLocaleDateString('id-ID',{weekday:'short'});
      const dateLabel=d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'2-digit'});
      const mp=dd.mp||{};
      const tl=+mp.timeLost||0;
      const rowspan=Math.max(1,dd.items.length);
      const mpCell=`<td style="${tdc}" rowspan="${rowspan}">${mp.total||'\u2014'}</td><td style="${tdc}" rowspan="${rowspan}">${mp.mhActual||'\u2014'}</td><td style="${tdc};color:${tl>0?'#dc2626':'#64748b'}" rowspan="${rowspan}">${tl>0?tl+'h':'\u2014'}</td>`;
      if(!dd.items.length){
        html+=`<tr><td style="${tdc}">${dateLabel}</td><td style="${tdc}">${dayName}</td><td style="${td}" colspan="4" style="color:#94a3b8;font-style:italic">Manpower only / No activity logged</td>${mpCell}</tr>`;
      }else{
        dd.items.forEach(({node,log},idx)=>{
          const qty=log.qty!=null?+log.qty:0;
          const qtyPlan=+node.qtyPlan||0;
          const kontrib=qtyPlan>0?(+node.bobot||0)/100*(qty/qtyPlan)*100:0;
          html+=`<tr>
            ${idx===0?`<td style="${tdc}" rowspan="${rowspan}">${dateLabel}</td><td style="${tdc}" rowspan="${rowspan}">${dayName}</td>`:''}
            <td style="${td}">${node.name}</td>
            <td style="${tdc};font-weight:700;color:#16a34a">${qty>0?'+'+qty+' '+(node.qtySatuan||''):'\u2014'}</td>
            <td style="${tdc}">${kontrib>0?kontrib.toFixed(2)+'%':'\u2014'}</td>
            <td style="${td};color:#64748b;font-size:9px">${log.notes||'\u2014'}</td>
            ${idx===0?mpCell:''}
          </tr>`;
        });
      }
    });
  }else{
    html+=`<tr><td colspan="9" style="${tdc};color:#94a3b8;padding:12px">Belum ada data aktivitas harian untuk minggu ini</td></tr>`;
  }
  html+=`</tbody></table>`;

  // SECTION 3: MANPOWER & TIME LOST
  html+=`<div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:0">REKAPITULASI MANPOWER & TIME LOST</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
    <table style="${ts}">
      <tr><th style="background:#475569;color:#fff;font-weight:700;padding:5px 6px;border:1px solid #334155;text-align:center;font-size:9px;text-transform:uppercase" colspan="8">MANPOWER WEEKLY SUMMARY</th></tr>
      <tr><th style="${th}">Tgl</th><th style="${th}">SPV</th><th style="${th}">Mdr</th><th style="${th}">Inst</th><th style="${th}">Tkng</th><th style="${th}">Hlpr</th><th style="${th}">Safety</th><th style="${th}">Total</th></tr>`;
  mpLogs.sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>{
    html+=`<tr><td style="${tdc};font-size:9px">${m.date.slice(5)}</td><td style="${tdc}">${m.spv||0}</td><td style="${tdc}">${m.mandor||0}</td><td style="${tdc}">${m.installer||0}</td><td style="${tdc}">${m.tukang||0}</td><td style="${tdc}">${m.helper||0}</td><td style="${tdc}">${m.safety||0}</td><td style="${tdc};font-weight:700">${m.total||0}</td></tr>`;
  });
  html+=`<tr style="background:#e2e8f0;color:#1e293b;font-weight:700"><td style="${tdc}">TOTAL</td><td style="${tdc}">${totalSpv}</td><td style="${tdc}">${totalMandor}</td><td style="${tdc}">${totalInstaller}</td><td style="${tdc}">${totalTukang}</td><td style="${tdc}">${totalHelper}</td><td style="${tdc}">${totalSafety}</td><td style="${tdc};color:#f97316">${totalWorkers}</td></tr>`;
  html+=`</table>
    <table style="${ts}">
      <tr><th style="background:#475569;color:#fff;font-weight:700;padding:5px 6px;border:1px solid #334155;text-align:center;font-size:9px;text-transform:uppercase" colspan="3">TIME LOST RECORD</th></tr>
      <tr><th style="${th}">Tanggal</th><th style="${th}">Jam Lost</th><th style="${th}">Penyebab</th></tr>`;
  const tlLogs=mpLogs.filter(m=>+m.timeLost>0);
  if(tlLogs.length){
    tlLogs.forEach(m=>{html+=`<tr><td style="${tdc};font-size:9px">${m.date}</td><td style="${tdc};color:#dc2626;font-weight:700">${m.timeLost}h</td><td style="${td};font-size:9px">${m.timeLostReason||'\u2014'}</td></tr>`;});
  }else{
    html+=`<tr><td colspan="3" style="${tdc};color:#16a34a">Tidak ada time lost minggu ini ✓</td></tr>`;
  }
  html+=`<tr style="background:#e2e8f0;color:#1e293b;font-weight:700"><td style="${tdc}">TOTAL</td><td style="${tdc};color:${timeLost>0?'#dc2626':'#16a34a'}">${timeLost}h</td><td style="${td};font-size:9px">${timeLostReasons||'\u2014'}</td></tr>`;
  html+=`</table></div>`;

  // SECTION 4: HSE
  const hseItems=['Safety Briefing','Toolbox Meeting','Safety Patrol','P3K Check','APD Check','Fire Extinguisher Check'];
  html+=`<div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:0">HSE PROGRAM</div>
  <table style="${ts};margin-bottom:10px">
    <tr><th style="${th}">Program</th><th style="${th};width:50px">Qty</th><th style="${th}">Remarks</th><th style="${th}">Findings</th><th style="${th};width:50px">Qty</th><th style="${th}">Remarks</th></tr>`;
  hseItems.forEach((item,i)=>{
    html+=`<tr><td style="${td}">${item}</td><td style="${tdc}"></td><td style="${td}"></td>${i===0?`<td style="${td}" rowspan="${hseItems.length}">Near Miss / Incident / Unsafe Act</td><td style="${tdc}" rowspan="${hseItems.length}"></td><td style="${td}" rowspan="${hseItems.length}"></td>`:''}</tr>`;
  });
  html+=`</table>`;

  // SECTION 5: ISSUES
  if(issues.length){
    html+=`<div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:0">OPEN ISSUES & CONSTRAINTS</div>
    <table style="${ts};margin-bottom:10px">
      <tr><th style="${th};width:80px">Tanggal</th><th style="${th}">Uraian</th><th style="${th};width:70px">Prioritas</th><th style="${th}">PIC</th><th style="${th};width:70px">Status</th></tr>`;
    issues.forEach(i=>{
      const pClr=i.prioritas==='Critical'?'#dc2626':i.prioritas==='High'?'#ea580c':'#2563eb';
      html+=`<tr><td style="${tdc};font-size:9px">${i.tgl||'\u2014'}</td><td style="${td}">${i.uraian||'\u2014'}</td><td style="${tdc};color:${pClr};font-weight:700">${i.prioritas||'\u2014'}</td><td style="${td}">${i.pj||'\u2014'}</td><td style="${tdc};color:${i.status==='Open'?'#ea580c':'#16a34a'}">${i.status||'\u2014'}</td></tr>`;
    });
    html+=`</table>`;
  }

  // SECTION 6: WORKPLAN NEXT WEEK
  html+=`<div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:0">WORKPLAN NEXT WEEK (W${String(week+1).padStart(2,'0')})</div>
  <table style="${ts};margin-bottom:10px">
    <tr><th style="${th}">#</th><th style="${th}">Item Pekerjaan</th><th style="${th};width:70px">Target Qty</th><th style="${th};width:55px">Satuan</th><th style="${th};width:60px">Target %</th><th style="${th}">Rencana Aktivitas</th></tr>`;
  let nwRow=0;
  leafNodes.forEach((node,idx)=>{
    const wp=node.weeklyPlan&&node.weeklyPlan[week+1];
    if(wp||idx<6){
      nwRow++;
      html+=`<tr><td style="${tdc}">${nwRow}</td><td style="${td}">${node.name}</td><td style="${tdc}">${+node.qtyPlan?Math.round(+node.qtyPlan*(+(wp?.wPlan||0)/100)):''}</td><td style="${tdc}">${node.qtySatuan||''}</td><td style="${tdc}">${wp?(+(wp.wPlan||0)).toFixed(1)+'%':''}</td><td style="${td}"></td></tr>`;
    }
  });
  for(let i=nwRow;i<6;i++){html+=`<tr><td style="${tdc}">${i+1}</td><td style="${td}"></td><td style="${tdc}"></td><td style="${tdc}"></td><td style="${tdc}"></td><td style="${td}"></td></tr>`;}
  html+=`</table>`;

  // SIGNATURE
  html+=`<table style="${ts};margin-top:8px">
    <tr>
      <td style="${tdc};width:33%;padding:8px"><div style="font-size:9px;color:#64748b;margin-bottom:35px">Dibuat oleh / Prepared by</div><div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:9px;color:#374151">SPV / Project Engineer</div></td>
      <td style="${tdc};width:33%;padding:8px"><div style="font-size:9px;color:#64748b;margin-bottom:35px">Diperiksa oleh / Checked by</div><div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:9px;color:#374151">HSE Officer / Site Manager</div></td>
      <td style="${tdc};width:33%;padding:8px"><div style="font-size:9px;color:#64748b;margin-bottom:35px">Disetujui oleh / Approved by</div><div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:9px;color:#374151">Project Manager</div></td>
    </tr>
  </table>
  <div style="text-align:center;font-size:8px;color:#94a3b8;margin-top:8px">
    Generated by ATW Solar Dashboard \u2014 ${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  </div>
  </div>

  ${'<'}!-- =========== PAGE 2 =========== -->
  <div class="wr-pb"></div>
  <div style="font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:20px 24px;max-width:100%;font-size:10px">

  ${'<'}!-- PAGE 2 HEADER -->
  ${'<'}!-- S-CURVE SECTION -->
  <div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:8px">S-CURVE PROGRESS \u2014 W${String(week).padStart(2,'0')}</div>

  ${'<'}!-- S-Curve Table Data -->
  <table style="${ts};margin-bottom:10px">
    <tr><th style="${th}">Minggu</th><th style="${th};text-align:right">W.Plan</th><th style="${th};text-align:right">W.Actual</th><th style="${th};text-align:right">Cum.Plan</th><th style="${th};text-align:right">Cum.Actual</th><th style="${th};text-align:right">Variance</th><th style="${th}">Status</th></tr>
    ${(()=>{
      const scData=SCURVE.filter(d=>String(d.projId)===String(projId)).sort((a,b)=>a.week-b.week);
      if(!scData.length)return`<tr><td colspan="7" style="${tdc};color:#94a3b8;padding:12px">Belum ada data S-Curve</td></tr>`;
      return scData.map(d=>{
        const v=(+(d.cAct||0))-(+(d.cPlan||0));
        const clr=v>=0?'#16a34a':v>=-5?'#ea580c':'#dc2626';
        const isThisWeek=d.week===week;
        return`<tr style="${isThisWeek?'background:#fff7ed;color:#c2410c;font-weight:700':''}">
          <td style="${tdc}${isThisWeek?';color:#f97316':''}">${isThisWeek?'\u25B6 ':''}W${String(d.week).padStart(2,'0')}</td>
          <td style="${tdc}">${(+d.wPlan||0).toFixed(2)}%</td>
          <td style="${tdc}">${(+d.wAct||0).toFixed(2)}%</td>
          <td style="${tdc};font-weight:600">${(+d.cPlan||0).toFixed(2)}%</td>
          <td style="${tdc};color:#f97316;font-weight:600">${(+d.cAct||0).toFixed(2)}%</td>
          <td style="${tdc};color:${clr};font-weight:600">${v>=0?'+':''}${v.toFixed(2)}%</td>
          <td style="${tdc};font-size:9px;color:${clr}">${v>=-3?'On Track':v>=-10?'Delayed':'Critical'}</td>
        </tr>`;
      }).join('');
    })()}
  </table>

  <!-- S-Curve Line Chart -->
  <div style="margin-bottom:16px;padding:10px 0;background:#fff;border:1px solid #e2e8f0;border-radius:6px">
    <div style="font-size:9px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;padding:0 14px">S-CURVE PROGRESS CHART</div>
    ${(()=>{
      const scData=SCURVE.filter(d=>String(d.projId)===String(projId)).sort((a,b)=>a.week-b.week);
      if(!scData.length)return'<div style="text-align:center;color:#94a3b8;font-size:10px;padding:30px">Belum ada data S-Curve</div>';

      const W=780, H=220;
      const padL=36, padR=20, padT=20, padB=30;
      const chartW=W-padL-padR, chartH=H-padT-padB;
      const n=scData.length;

      // X positions \u2014 evenly spaced weeks
      const xPos=i=>padL+i/(Math.max(n-1,1))*chartW;
      // Y position \u2014 0% at bottom, 100% at top
      const yPos=v=>padT+chartH-(v/100)*chartH;

      // Build plan and actual polyline points
      let planPts='', actPts='';
      let planArea='', actArea='';
      let planFirst=true, actFirst=true;
      let planAreaPts=`${padL},${padT+chartH}`, actAreaPts=`${padL},${padT+chartH}`;

      scData.forEach((d,i)=>{
        const x=xPos(i);
        const yPlan=yPos(+d.cPlan||0);
        const yAct=yPos(+d.cAct||0);
        planPts+=(planFirst?'':' ')+`${x},${yPlan}`;
        planAreaPts+=` ${x},${yPlan}`;
        planFirst=false;
        if((+d.cAct||0)>0||(+d.wAct||0)>0){
          actPts+=(actFirst?'':' ')+`${x},${yAct}`;
          actAreaPts+=` ${x},${yAct}`;
          actFirst=false;
        }
      });
      // Find last actual data point index
      let lastActIdx=0;
      scData.forEach((d,i)=>{if((+d.cAct||0)>0)lastActIdx=i;});
      planAreaPts+=` ${xPos(n-1)},${padT+chartH}`;
      actAreaPts+=` ${xPos(lastActIdx)},${padT+chartH}`;

      // Grid lines Y (0,25,50,75,100)
      let gridY='';
      [0,25,50,75,100].forEach(p=>{
        const y=yPos(p);
        gridY+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
        gridY+=`<text x="${padL-4}" y="${y+3}" text-anchor="end" font-size="7" fill="#94a3b8">${p}%</text>`;
      });

      // Grid lines X + week labels
      let gridX='', labels='';
      const step=n<=10?1:n<=20?2:Math.ceil(n/10);
      scData.forEach((d,i)=>{
        if(i%step!==0&&i!==n-1)return;
        const x=xPos(i);
        const isNow=d.week===week;
        gridX+=`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT+chartH}" stroke="${isNow?'rgba(249,115,22,.3)':'#f1f5f9'}" stroke-width="${isNow?2:1}"/>`;
        labels+=`<text x="${x}" y="${padT+chartH+12}" text-anchor="middle" font-size="7" fill="${isNow?'#f97316':'#94a3b8'}" font-weight="${isNow?'bold':'normal'}">W${String(d.week).padStart(2,'0')}</text>`;
      });

      // Data point dots + tooltips
      let dots='';
      scData.forEach((d,i)=>{
        const x=xPos(i);
        const isNow=d.week===week;
        const yP=yPos(+d.cPlan||0);
        const yA=yPos(+d.cAct||0);
        dots+=`<circle cx="${x}" cy="${yP}" r="${isNow?4:2.5}" fill="#3b82f6" opacity="${isNow?1:0.7}"/>`;
        if((+d.cAct||0)>0){
          dots+=`<circle cx="${x}" cy="${yA}" r="${isNow?4:2.5}" fill="#f97316" opacity="${isNow?1:0.7}"/>`;
        }
        // Label for current week
        if(isNow){
          dots+=`<text x="${x}" y="${yP-6}" text-anchor="middle" font-size="8" fill="#3b82f6" font-weight="bold">${(+d.cPlan||0).toFixed(1)}%</text>`;
          if((+d.cAct||0)>0){
            dots+=`<text x="${x}" y="${yA-6}" text-anchor="middle" font-size="8" fill="#f97316" font-weight="bold">${(+d.cAct||0).toFixed(1)}%</text>`;
          }
        }
      });

      return`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
        <style>text{font-family:Arial,sans-serif;font-size:9px}text[font-weight="bold"]{font-size:10px}text[text-anchor="middle"]{font-size:8px}text[text-anchor="end"]{font-size:8px}</style>
        ${'<'}!-- Grid -->
        ${gridY}${gridX}
        ${'<'}!-- Axes -->
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+chartH}" stroke="#e2e8f0" stroke-width="1.5"/>
        <line x1="${padL}" y1="${padT+chartH}" x2="${W-padR}" y2="${padT+chartH}" stroke="#e2e8f0" stroke-width="1.5"/>
        ${'<'}!-- Plan area fill -->
        <polygon points="${planAreaPts}" fill="rgba(59,130,246,0.06)"/>
        ${'<'}!-- Actual area fill -->
        <polygon points="${actAreaPts}" fill="rgba(249,115,22,0.06)"/>
        ${'<'}!-- Plan line -->
        <polyline points="${planPts}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5,3"/>
        ${'<'}!-- Actual line -->
        <polyline points="${actPts}" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${'<'}!-- Dots -->
        ${dots}
        ${'<'}!-- Week labels -->
        ${labels}
        ${'<'}!-- Legend -->
        <line x1="${W-120}" y1="${padT+8}" x2="${W-104}" y2="${padT+8}" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4,2"/>
        <circle cx="${W-112}" cy="${padT+8}" r="3" fill="#3b82f6"/>
        <text x="${W-100}" y="${padT+12}" font-size="8" fill="#3b82f6">Cum. Plan</text>
        <line x1="${W-120}" y1="${padT+22}" x2="${W-104}" y2="${padT+22}" stroke="#f97316" stroke-width="2.5"/>
        <circle cx="${W-112}" cy="${padT+22}" r="3" fill="#f97316"/>
        <text x="${W-100}" y="${padT+26}" font-size="8" fill="#f97316">Cum. Actual</text>
      </svg>`;
    })()}
  </div>

  ${'<'}!-- DOCUMENTATION PHOTOS SECTION -->
  <div style="background:#374151;color:#fff;text-align:center;padding:5px;font-weight:700;font-size:11px;margin-bottom:8px">DOKUMENTASI FOTO \u2014 W${String(week).padStart(2,'0')}</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
    ${[1,2,3,4,5,6].map(n=>{
      const photo=wrPhotos[n];
      if(photo&&photo.src){
        return`<div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
          <img src="${photo.src}" style="width:100%;height:160px;object-fit:contain;display:block;background:#f1f5f9">
          <div style="padding:4px 8px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:9px;color:#374151;min-height:22px">${photo.caption||'Foto '+n}</div>
        </div>`;
      }else{
        return`<div style="border:1px dashed #e2e8f0;border-radius:6px;height:183px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;color:#cbd5e1">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          <span style="font-size:9px;margin-top:4px;color:#e2e8f0">Foto ${n}</span>
        </div>`;
      }
    }).join('')}
  </div>

  ${'<'}!-- PAGE 2 FOOTER -->
  <div style="margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8">
    <span>${proj.kode} \u2014 Weekly Report W${String(week).padStart(2,'0')}</span>
    <span>Hal. 2 / 2</span>
    <span>Generated by ATW Solar Dashboard</span>
  </div>
  </div>`;

  return html;
}

function _wrItemRowNew(num,node,week,th,td,tdc,isGn){
  const qtyPlan=+node.qtyPlan||0;
  const dl=node.dailyLogs||[];
  const weekQty=dl.filter(l=>l.week===week).reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0);
  const cumQty=Math.min(qtyPlan||999999,dl.reduce((s,l)=>s+(l.qty!=null?+l.qty:0),0));
  const pct=qtyPlan>0?Math.min(100,cumQty/qtyPlan*100):(+node.cumActual||0);
  const kontrib=qtyPlan>0?(+node.bobot||0)/100*(cumQty/qtyPlan)*100:(+node.bobot||0)*(pct/100);
  const nameStyle=isGn?'font-weight:600;color:#15803d':'';
  return `<tr>
    <td style="${tdc};color:#94a3b8;font-size:9px">${num}</td>
    <td style="${td};${nameStyle};padding-left:${isGn?14:24}px">${node.name}</td>
    <td style="${tdc}">${(+node.bobot||0).toFixed(1)}%</td>
    <td style="${tdc};color:#2563eb">${qtyPlan?qtyPlan+' '+(node.qtySatuan||''):'\u2014'}</td>
    <td style="${tdc};font-weight:700;color:${weekQty>0?'#16a34a':'#94a3b8'}">${weekQty>0?'+'+weekQty:'\u2014'}</td>
    <td style="${tdc};color:#f97316">${qtyPlan?cumQty:pct.toFixed(1)+'%'}</td>
    <td style="${tdc};font-weight:700;color:#f97316">${pct.toFixed(1)}%</td>
    <td style="${tdc};color:#16a34a">${kontrib>0?kontrib.toFixed(2)+'%':'\u2014'}</td>
    <td style="${tdc}">${node.qtySatuan||'\u2014'}</td>
  </tr>`;
}



