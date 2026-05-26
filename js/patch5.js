// ============================================================
// ATW Dashboard — patch5.js
// Procurement: Auto-KPI dari due date + Activity-based status
//
// Override:
//   window.renderProc    — satu wrapper (KPI + filter + warna)
//   window.toggleProcCost — tambah 'On Production'
//   window.openModal      — inject pStat options saat modal buka
//   window.loadProjectData — re-init KPI setelah data load
//
// Load order: SETELAH patch1–patch4. Sebelum </body>.
// ============================================================
(function () {
  'use strict';

  // ── Status aktivitas (urutan workflow) ──────────────────────
  var STATUSES = [
    'Waiting Approval',  // menunggu approval PO
    'PO Issued',         // PO sudah diterbitkan
    'On Production',     // sedang diproduksi / fabrikasi
    'In Transit',        // dalam pengiriman
    'On Site',           // sudah di lokasi
    'Done',              // selesai / diterima
  ];

  // Item dengan status ini = "selesai" → tidak masuk KPI due date
  var TERMINAL = ['On Site', 'Done'];

  // Warna per status untuk tabel
  var STATUS_COLOR = {
    'Waiting Approval': 'var(--pu)',
    'PO Issued':        'var(--or)',
    'On Production':    '#06b6d4',
    'In Transit':       'var(--bl)',
    'On Site':          'var(--gn)',
    'Done':             'var(--mt)',
  };

  // ── KPI dari due date ───────────────────────────────────────
  function _calcKpi(items) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var nowMs = now.getTime();
    var in3Ms = nowMs + 3 * 86400000;
    var overdue = 0, dueToday = 0, due3 = 0;

    (items || []).forEach(function (i) {
      if (TERMINAL.indexOf(i.status) !== -1 || !i.due) return;
      var d = typeof parseLocalDate === 'function'
        ? parseLocalDate(i.due)
        : new Date(String(i.due).trim().slice(0, 10) + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      var dMs = d.getTime();
      if      (dMs < nowMs)       overdue++;
      else if (dMs === nowMs)     dueToday++;
      else if (dMs <= in3Ms)      due3++;
    });

    return { overdue: overdue, dueToday: dueToday, due3: due3 };
  }

  // ── Helper set el text ──────────────────────────────────────
  function _setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Update warna status di tabel ────────────────────────────
  function _applyStatusColors() {
    var tbl = document.getElementById('procTable');
    if (!tbl) return;
    tbl.querySelectorAll('td span').forEach(function (span) {
      var color = STATUS_COLOR[(span.textContent || '').trim()];
      if (color) span.style.color = color;
    });
  }

  // ── Perbarui filter dropdown (procFilt) ─────────────────────
  function _patchFilterDropdown() {
    var sel = document.getElementById('procFilt');
    if (!sel || sel.dataset.p5ok) return;
    var html = '<option value="">Semua Status</option>';
    STATUSES.forEach(function (s) {
      html += '<option value="' + s + '">' + s + '</option>';
    });
    sel.innerHTML = html;
    sel.dataset.p5ok = '1';
  }

  // ═══════════════════════════════════════════════════════════
  // OVERRIDE 1 — renderProc (satu wrapper saja)
  // ═══════════════════════════════════════════════════════════
  var _orig_renderProc = window.renderProc;

  if (typeof _orig_renderProc === 'function') {
    window.renderProc = function () {
      // Perbarui filter dropdown sebelum render (agar filt tidak invalid)
      _patchFilterDropdown();

      // Jalankan render asli
      _orig_renderProc.apply(this, arguments);

      // Override pc1 & pc2 dengan hitungan tanggal
      // (render asli pakai cnt('Overdue') / cnt('Due Today') → manual)
      var all = typeof PROC !== 'undefined' ? PROC : [];
      var kpi = _calcKpi(all);
      _setText('pc1', kpi.overdue);   // Overdue
      _setText('pc2', kpi.dueToday);  // Due Today
      // pc6 (Due ≤3 hari) sudah benar di render asli ✓
      // pc3 (In Transit)  sudah benar ✓
      // pc4 (On Site)     sudah benar ✓

      // pc5: ubah dari (Waiting Approval + PO Issued) ke Waiting Approval saja
      _setText('pc5', all.filter(function (i) {
        return i.status === 'Waiting Approval';
      }).length);

      // Warna status On Production (tidak ada di sc map asli)
      _applyStatusColors();
    };

    _log('renderProc override aktif ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // OVERRIDE 2 — toggleProcCost
  // Tambah 'On Production' ke daftar status yang tampilkan kolom harga
  // Asli: ['PO Issued','In Transit','On Site']
  // ═══════════════════════════════════════════════════════════
  window.toggleProcCost = function (status) {
    var wrap = document.getElementById('procCostWrap');
    if (!wrap) return;
    wrap.style.display =
      ['PO Issued', 'On Production', 'In Transit', 'On Site'].indexOf(status) !== -1
        ? 'block' : 'none';
  };
  _log('toggleProcCost override aktif ✓');

  // ═══════════════════════════════════════════════════════════
  // OVERRIDE 3 — openModal
  // Inject opsi pStat saat modal addProc/editProc dibuka
  // Tidak mengubah logika modal lainnya
  // ═══════════════════════════════════════════════════════════
  var _orig_openModal = window.openModal;

  if (typeof _orig_openModal === 'function') {
    window.openModal = function (type, id) {
      _orig_openModal.apply(this, arguments);

      if (type === 'addProc' || type === 'editProc') {
        // Jalankan setelah original mengisi sv('pStat', ...)
        setTimeout(_patchPStatSelect, 20);
      }
    };
    _log('openModal override aktif ✓');
  }

  function _patchPStatSelect() {
    var sel = document.getElementById('pStat');
    if (!sel) return;
    var cur = sel.value;

    // Rebuild opsi dengan status baru
    sel.innerHTML = STATUSES.map(function (s) {
      return '<option value="' + s + '"' + (s === cur ? ' selected' : '') + '>' + s + '</option>';
    }).join('');

    // Pastikan value valid; default ke Waiting Approval
    if (STATUSES.indexOf(sel.value) === -1) sel.value = 'Waiting Approval';

    // Sinkronisasi cost wrap
    window.toggleProcCost(sel.value);
  }

  // Sync cost wrap saat user ganti status di modal
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'pStat') {
      window.toggleProcCost(e.target.value);
    }
  });

  // MutationObserver sebagai backup (jika openModal dipanggil
  // sebelum patch5 ter-load, atau timing 20ms kurang)
  (function () {
    function _observe() {
      var modal = document.getElementById('ov-addProc');
      if (!modal) { setTimeout(_observe, 600); return; }

      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.attributeName === 'style' && modal.offsetParent !== null) {
            setTimeout(_patchPStatSelect, 30);
          }
        });
      }).observe(modal, { attributes: true, attributeFilter: ['style'] });

      _log('MutationObserver ov-addProc aktif ✓');
    }
    _observe();
  })();

  // ═══════════════════════════════════════════════════════════
  // OVERRIDE 4 — loadProjectData
  // Re-init KPI setelah data proyek selesai di-load
  // ═══════════════════════════════════════════════════════════
  var _orig_loadProjectData = window.loadProjectData;

  if (typeof _orig_loadProjectData === 'function') {
    window.loadProjectData = async function (projId) {
      var result = await _orig_loadProjectData.apply(this, arguments);
      // Perbarui KPI jika procurement tab aktif
      setTimeout(function () {
        var isProc = typeof activeTab !== 'undefined' && activeTab === 'procurement';
        if (isProc && typeof window.renderProc === 'function') {
          window.renderProc();
        } else {
          // Update KPI cards saja tanpa re-render penuh
          var all = typeof PROC !== 'undefined' ? PROC : [];
          var kpi = _calcKpi(all);
          _setText('pc1', kpi.overdue);
          _setText('pc2', kpi.dueToday);
        }
      }, 200);
      return result;
    };
    _log('loadProjectData + KPI init aktif ✓');
  }

  // ── Init awal ───────────────────────────────────────────────
  setTimeout(function () {
    _patchFilterDropdown();
    var all = typeof PROC !== 'undefined' ? PROC : [];
    var kpi = _calcKpi(all);
    _setText('pc1', kpi.overdue);
    _setText('pc2', kpi.dueToday);
  }, 1500);

  // ── Helpers ─────────────────────────────────────────────────
  function _log(m) { console.log('[Patch5]', m); }

  window._p5 = {
    kpi: function () {
      var kpi = _calcKpi(typeof PROC !== 'undefined' ? PROC : []);
      console.table(kpi);
      return kpi;
    },
    statuses: STATUSES,
  };

  // ═══════════════════════════════════════════════════════════
  // OVERRIDE 5 — showConfirm
  // Root cause: .ov (modal) z-index:9999, confirmBox z-index:9998
  // → dialog selalu tertutup di belakang modal.
  // Fix: z-index 99999 + backdrop gelap + posisi tengah layar.
  // ═══════════════════════════════════════════════════════════
  window.showConfirm = function (msg, onYes) {
    // Hapus instance lama
    var old = document.getElementById('confirmBox');
    if (old) old.remove();
    var oldBg = document.getElementById('confirmBackdrop');
    if (oldBg) oldBg.remove();

    // Backdrop gelap (di atas modal tapi di bawah dialog)
    var bg = document.createElement('div');
    bg.id = 'confirmBackdrop';
    bg.style.cssText = [
      'position:fixed;inset:0;',
      'background:rgba(0,0,0,.55);',
      'z-index:99998;',           // tepat di bawah dialog
      'animation:su .15s ease',
    ].join('');
    document.body.appendChild(bg);

    // Dialog confirm
    var box = document.createElement('div');
    box.id = 'confirmBox';
    box.style.cssText = [
      'position:fixed;',
      'top:50%;left:50%;',
      'transform:translate(-50%,-50%);',
      'z-index:99999;',           // di atas segalanya termasuk .ov (9999)
      'background:var(--sf);',
      'border:1px solid var(--bd);',
      'border-top:3px solid var(--rd);',
      'border-radius:10px;',
      'padding:20px 22px;',
      'box-shadow:0 16px 48px rgba(0,0,0,.6);',
      'max-width:380px;width:90vw;',
      'animation:su .18s ease',
    ].join('');

    box.innerHTML = [
      '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">',
        '<div style="width:32px;height:32px;border-radius:50%;background:rgba(239,68,68,.15);',
             'display:flex;align-items:center;justify-content:center;flex-shrink:0">',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rd)" stroke-width="2.5">',
            '<polyline points="3 6 5 6 21 6"/>',
            '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
          '</svg>',
        '</div>',
        '<div style="font-size:13px;color:var(--tx);line-height:1.5;padding-top:4px">' + msg + '</div>',
      '</div>',
      '<div style="display:flex;gap:8px;justify-content:flex-end">',
        '<button id="confirmNo"  class="btn" style="padding:6px 18px;min-width:70px">Batal</button>',
        '<button id="confirmYes" class="btn" style="padding:6px 18px;min-width:70px;',
          'background:var(--rd);color:#fff;border-color:var(--rd)">Hapus</button>',
      '</div>',
    ].join('');

    document.body.appendChild(box);

    function _close() {
      box.remove();
      bg.remove();
    }

    document.getElementById('confirmNo').onclick  = _close;
    document.getElementById('confirmYes').onclick = function () { _close(); onYes(); };
    bg.onclick = _close;  // klik di luar = batal

    // Auto-dismiss setelah 10 detik
    setTimeout(function () { if (document.getElementById('confirmBox')) _close(); }, 10000);
  };

  _log('showConfirm override aktif ✓ (z-index:99999, centered, backdrop)');

  _log([
    'Patch 5 loaded ✓',
    '  • KPI Overdue & Due Today → otomatis dari field due',
    '  • KPI Waiting → Waiting Approval saja',
    '  • Status: ' + STATUSES.join(' → '),
    '  • On Production → tampilkan kolom harga',
    '  • showConfirm → selalu di atas modal (z-index:99999)',
  ].join('\n'));

})();
