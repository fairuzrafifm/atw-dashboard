// ╔══════════════════════════════════════════════════════════════╗
// ║  ⚠  PATCH TERAKHIR — TIDAK ADA PATCH8 DST                  ║
// ║                                                              ║
// ║  Semua perbaikan selanjutnya HARUS dilakukan langsung di    ║
// ║  file sumber:                                                ║
// ║    • core.js        • projects.js   • wbs.js                ║
// ║    • reports.js     • scurve.js     • documents.js          ║
// ║    • cost-rab.js    • manpower.js   • daily.js              ║
// ║    • gantt.js       • auth.js       • utils.js              ║
// ║                                                              ║
// ║  Status patch yang ada (patch1–patch7):                     ║
// ║    patch1 — User registration, edit lock system             ║
// ║    patch2 — Migrasi GSheet → Supabase, retry queue          ║
// ║    patch3 — Realtime history, lock WBS/Daily, auto-refresh  ║
// ║    patch4 — Lazy loading project-scoped (Phase 1 & 2)       ║
// ║    patch5 — Procurement KPI, status workflow, showConfirm   ║
// ║    patch6 — Clone Dokumen bulk                              ║
// ║    patch7 — S-Curve redesign (Chart.js), WBS table fix      ║
// ║                                                              ║
// ║  Fix yang sudah ada di source (TIDAK perlu di-patch lagi):  ║
// ║    • showConfirm z-index        → core.js (patch5 wins)     ║
// ║    • KPI Overdue/Due Today      → projects.js (patch5 wins) ║
// ║    • WBS nama tidak terpotong   → wbs.js ✓                  ║
// ║    • Weekly Report SVG font     → reports.js ✓              ║
// ╚══════════════════════════════════════════════════════════════╝

// ============================================================
// ATW Dashboard — patch7.js  (v3) — PATCH TERAKHIR
// UI Polish:
//   1. WBS — kolom sejajar (table-layout:fixed) + nama tidak terpotong
//   2. S-Curve dashboard — desain lebih bersih
//   3. Weekly Report S-Curve — full width + font proporsional
// ============================================================
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // 1. WBS TABLE — kolom sejajar & nama tidak terpotong
  //
  // Root cause: table-layout:auto membuat browser hitung lebar
  // kolom BERBEDA per-baris berdasarkan konten masing-masing.
  // Akibatnya kolom Bobot tampak di posisi berbeda antara baris
  // cat, subcat, dan item.
  //
  // Fix: table-layout:fixed → semua baris pakai lebar kolom
  // yang SAMA persis seperti di <th>. Header sudah punya width
  // attribute (#:50px, Bobot:70px, Start:88px, dst) sehingga
  // kolom Item Pekerjaan mendapat semua sisa ruang secara merata.
  // ─────────────────────────────────────────────────────────
  var _wbsCss = document.createElement('style');
  _wbsCss.id = 'p7-wbs-css';
  _wbsCss.textContent = [
    /* Root fix: fixed layout */
    '#wbsTable .tbl {',
    '  table-layout: fixed !important;',
    '  width: 100% !important;',
    '}',
    /* Kolom nama: overflow hidden agar tidak dorong kolom lain */
    '#wbsTable .tbl th:nth-child(2),',
    '#wbsTable .tbl td:nth-child(2) {',
    '  overflow: hidden !important;',
    '}',
    /* Input nama: pakai seluruh lebar td                       */
    /* Selector :not([type="number"]) karena wbs.js tidak punya */
    /* type="text" eksplisit → [type=text] tidak match          */
    '#wbsTable .wbs-inline-text input:not([type="number"]):not([type="date"]) {',
    '  max-width: 100% !important;',
    '  min-width: 80px !important;',
    '  width: 100% !important;',
    '}',
    /* Container inline-text: nowrap + overflow hidden          */
    '#wbsTable td:nth-child(2) .wbs-inline-text {',
    '  display: flex !important;',
    '  width: 100% !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '}',
    /* Override rule lama max-width:220px di index.html        */
    '.wbs-inline-text input[type=text] {',
    '  max-width: none !important;',
    '}',
  ].join('\n');
  document.head.appendChild(_wbsCss);
  console.log('[Patch7] WBS table-layout:fixed — kolom sejajar ✓');

  // ─────────────────────────────────────────────────────────
  // 2. S-CURVE DASHBOARD — override drawSCurveChart
  // ─────────────────────────────────────────────────────────
  var _origDrawSCurve = window.drawSCurveChart;
  if (typeof _origDrawSCurve === 'function') {
    window.drawSCurveChart = function (weeks, proj) {
      if (!weeks || !weeks.length) {
        var sc = document.getElementById('scChart');
        if (sc) sc.innerHTML = '<div style="text-align:center;color:var(--mt);padding:40px;font-size:12px">Belum ada data — klik ＋ Input Minggu Ini untuk mulai</div>';
        return;
      }
      if (typeof Chart === 'undefined') {
        var sc2 = document.getElementById('scChart');
        if (sc2) sc2.innerHTML = '<div style="text-align:center;color:var(--mt);padding:40px;font-size:12px">Memuat Chart.js…</div>';
        setTimeout(function () { window.drawSCurveChart(weeks, proj); }, 3000);
        return;
      }
      var light = document.documentElement.classList.contains('light');
      var BL = '#3b82f6', OR = '#f97316', BLLT = '#93c5fd', ORLT = '#fdba74';
      var GRID = light ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
      var TICK = light ? '#94a3b8' : '#64748b';
      var TTBG = light ? '#1e293b' : '#0f172a';
      var labels    = weeks.map(function(w){ return 'W'+String(w.week).padStart(2,'0'); });
      var wPlanData = weeks.map(function(w){ return +(+w.wPlan||0).toFixed(2); });
      var wActData  = weeks.map(function(w){ return +(+w.wAct||0).toFixed(2); });
      var cPlanData = weeks.map(function(w){ return +(+w.cPlan||0).toFixed(2); });
      var cActData  = weeks.map(function(w){
        var v=+w.cAct; return (w.wAct>0||w.cAct>0)?+v.toFixed(2):null;
      });
      if (window._scChart) { window._scChart.destroy(); window._scChart=null; }
      var scEl = document.getElementById('scChart');
      if (!scEl) return;
      var mkLeg = function(col,dash,lbl){
        var s=dash
          ?'<svg width="22" height="12" style="vertical-align:middle"><line x1="0" y1="6" x2="22" y2="6" stroke="'+col+'" stroke-width="2" stroke-dasharray="5,3"/><circle cx="11" cy="6" r="3" fill="'+col+'"/></svg>'
          :'<svg width="22" height="12" style="vertical-align:middle"><line x1="0" y1="6" x2="22" y2="6" stroke="'+col+'" stroke-width="2"/><circle cx="11" cy="6" r="3" fill="'+col+'"/></svg>';
        return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:'+TICK+';background:'+(light?'#f1f5f9':'rgba(255,255,255,.05)')+';padding:3px 10px;border-radius:20px;border:1px solid '+(light?'#e2e8f0':'rgba(255,255,255,.08)')+'">'+s+lbl+'</span>';
      };
      var mkBar = function(col,lbl){
        return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:'+TICK+';background:'+(light?'#f1f5f9':'rgba(255,255,255,.05)')+';padding:3px 10px;border-radius:20px;border:1px solid '+(light?'#e2e8f0':'rgba(255,255,255,.08)')+'"><span style="width:12px;height:10px;background:'+col+';border-radius:2px;display:inline-block"></span>'+lbl+'</span>';
      };
      scEl.innerHTML =
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:0 2px">'+
          mkBar(BLLT+'CC','W.Plan')+mkBar(OR+'CC','W.Actual')+
          mkLeg(BL,false,'Cum. Plan')+mkLeg(OR,true,'Cum. Actual')+
        '</div>'+
        '<div style="position:relative;width:100%;height:360px">'+
          '<canvas id="scCanvas" role="img" aria-label="S-Curve progress"></canvas>'+
        '</div>';
      setTimeout(function(){
        var ctx=document.getElementById('scCanvas'); if(!ctx)return;
        var grad=ctx.getContext('2d').createLinearGradient(0,0,0,360);
        grad.addColorStop(0,BL+'30'); grad.addColorStop(1,BL+'00');
        window._scChart=new Chart(ctx,{
          data:{labels:labels,datasets:[
            {type:'bar',label:'W.Plan',data:wPlanData,backgroundColor:BLLT+'80',borderColor:BLLT,borderWidth:1,borderRadius:2,borderSkipped:'bottom',yAxisID:'yBar',order:4},
            {type:'bar',label:'W.Actual',data:wActData,backgroundColor:OR+'99',borderColor:OR,borderWidth:1,borderRadius:2,borderSkipped:'bottom',yAxisID:'yBar',order:3},
            {type:'line',label:'Cum. Plan',data:cPlanData,borderColor:BL,backgroundColor:grad,borderWidth:2.5,pointBackgroundColor:BL,pointRadius:3,pointHoverRadius:5,fill:true,tension:0.4,yAxisID:'yCum',order:2,clip:false},
            {type:'line',label:'Cum. Actual',data:cActData,borderColor:OR,backgroundColor:'transparent',borderWidth:2.5,borderDash:[7,4],pointBackgroundColor:OR,pointRadius:3.5,pointHoverRadius:6,fill:false,tension:0.4,spanGaps:false,yAxisID:'yCum',order:1,clip:false},
          ]},
          options:{
            responsive:true,maintainAspectRatio:false,
            layout:{padding:{top:12,right:8}},
            interaction:{mode:'index',intersect:false},
            plugins:{
              legend:{display:false},
              tooltip:{backgroundColor:TTBG,titleColor:'#e2e8f0',bodyColor:'#94a3b8',borderColor:'rgba(255,255,255,.08)',borderWidth:1,padding:12,cornerRadius:8,titleFont:{size:11,weight:'600'},bodyFont:{size:10},
                callbacks:{
                  title:function(i){return 'Minggu '+i[0].label;},
                  label:function(i){var v=i.raw;if(v===null||v===undefined)return null;return '  '+['W.Plan','W.Actual','Cum.Plan','Cum.Actual'][i.datasetIndex]+': '+(+v).toFixed(1)+'%';}
                }
              }
            },
            scales:{
              x:{grid:{color:GRID,drawBorder:false},ticks:{color:TICK,font:{size:10},maxRotation:0,autoSkip:weeks.length>14},border:{display:false}},
              yBar:{type:'linear',position:'left',title:{display:true,text:'Weekly %',color:TICK,font:{size:9}},grid:{display:false},ticks:{color:TICK,font:{size:9},callback:function(v){return v+'%';}},border:{display:false},min:0,suggestedMax:Math.max.apply(null,wPlanData.concat(wActData).filter(Boolean).concat([8]))*1.3},
              yCum:{type:'linear',position:'right',title:{display:true,text:'Kumulatif %',color:TICK,font:{size:9}},grid:{color:GRID,drawBorder:false},ticks:{color:TICK,font:{size:9},callback:function(v){return v+'%';}},border:{display:false},min:0,max:100}
            }
          }
        });
      },50);
    };
    console.log('[Patch7] drawSCurveChart redesign aktif ✓');
  }

  // ─────────────────────────────────────────────────────────
  // 3. WEEKLY REPORT S-CURVE — full width + font proporsional
  // Fix: width:100% + height:auto (full page), CSS font px absolut
  // ─────────────────────────────────────────────────────────
  var _origGenWeekly = window.generateWeeklyReport;
  if (typeof _origGenWeekly === 'function') {
    window.generateWeeklyReport = function () {
      _origGenWeekly.apply(this, arguments);
      setTimeout(function () {
        var iframe = document.getElementById('weeklyPrintFrame');
        if (!iframe) return;
        var iDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iDoc || iDoc.getElementById('p7-scfix')) return;
        var style = iDoc.createElement('style');
        style.id = 'p7-scfix';
        style.textContent = [
          'svg { width: 100% !important; height: auto !important; }',
          'svg text { font-size: 9px !important; }',
          'svg text[font-weight="bold"] { font-size: 10px !important; }',
          'svg text[text-anchor="middle"] { font-size: 8px !important; }',
          'svg text[text-anchor="end"] { font-size: 8px !important; }',
          'svg text[text-anchor="start"] { font-size: 9px !important; }',
        ].join('\n');
        iDoc.head.appendChild(style);
      }, 200);
    };
    console.log('[Patch7] Weekly report S-Curve full-width fix aktif ✓');
  }

  console.log('[Patch7] v3 loaded ✓');
})();
