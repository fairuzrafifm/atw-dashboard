// ============================================================
// ATW Dashboard — patch4.js
// Lazy Loading — Level 1: Project-Scoped Data Fetch
//
// STRATEGI:
//   Phase 1 (cepat):  projects + project_history + documents
//                     → render overview seketika
//   Phase 2 (demand): data sekunder per-project (issues,
//                     procurement, manpower, accident, costs,
//                     rab, wbs, scurve) hanya untuk proyek aktif
//   Background:       proyek lainnya di-load berurutan (stagger
//                     400ms antar proyek) agar tidak mengganggu
//
// Cara pakai:
//   Tambahkan SETELAH patch1.js, patch2.js, patch3.js, sebelum </body>
//   Tidak mengubah fungsi/logika yang sudah berjalan.
// ============================================================
(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────
  function _sb()  { return (typeof _initSb === 'function') ? _initSb() : null; }
  function _log(m){ console.log('[Patch4]', m); }

  // ── State ──────────────────────────────────────────────────
  var _loaded   = new Set();  // projId yang sudah selesai di-fetch
  var _loading  = new Set();  // projId yang sedang di-fetch (cegah duplikat)
  var _lastSel  = null;       // deteksi perubahan selId di render()

  // ── Helper: pastikan array global ada ──────────────────────
  function _ensureArrays() {
    ['ISS','PROC','MPLOGS','ACCLOGS','COSTS','RAB','WBS','SCURVE','DOCS'].forEach(function(k) {
      if (!Array.isArray(window[k])) window[k] = [];
    });
  }

  // ── Helper: replace slice projId di array global ────────────
  // Filter-out data lama project ini, concat dengan data baru.
  function _merge(arr, pid, newItems) {
    return arr
      .filter(function(x) { return String(x.projId) !== pid; })
      .concat(newItems);
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 1 — loadFromSupabase (diganti sepenuhnya)
  // ═══════════════════════════════════════════════════════════
  // Menggantikan seluruh chain: original → patch2(dedup) → patch3(ts)
  // Dedup di-reimplementasi di sini agar tidak kehilangan fitur itu.
  // Timestamp patch3 di-update langsung setelah Phase 1 selesai.
  // ─────────────────────────────────────────────────────────────

  var _phase1Promise = null; // dedup guard

  window.loadFromSupabase = function() {
    if (_phase1Promise) {
      _log('Dedup: Phase 1 sedang berjalan — return promise yang sama');
      return _phase1Promise;
    }
    _phase1Promise = _doPhase1().finally(function() { _phase1Promise = null; });
    return _phase1Promise;
  };

  async function _doPhase1() {
    var client = _sb();
    if (!client) {
      if (typeof toast === 'function') toast('Supabase belum siap', 'error');
      return;
    }

    try {
      if (typeof toast === 'function') toast('Memuat data proyek...', 'info');
      _log('Phase 1: mengambil projects + history + documents...');

      var t0 = Date.now();

      // Jalankan ketiganya paralel — semuanya ringan (tidak per-project)
      var results = await Promise.all([
        client.from('projects').select('*').order('created_at'),
        client.from('project_history').select('*').order('date'),
        client.from('documents').select('*').order('created_at', { ascending: false }),
      ]);

      var projects  = results[0].data || [];
      var history   = results[1].data || [];
      var documents = results[2].data || [];

      // Cek error ringan (log, jangan abort)
      results.forEach(function(r, i) {
        if (r.error) console.warn('[Phase1] query ' + i + ':', r.error.message);
      });

      _ensureArrays();

      // Reset SEMUA array sekunder — data lama dari session sebelumnya
      window.P       = (projects).map(mapProject);
      window.ISS     = [];
      window.PROC    = [];
      window.MPLOGS  = [];
      window.ACCLOGS = [];
      window.COSTS   = [];
      window.RAB     = [];
      window.WBS     = [];
      window.SCURVE  = [];

      // Documents: global (tidak ada proj_id filter di query asli)
      if (typeof mapDocument === 'function') {
        window.DOCS = documents.map(mapDocument);
      }

      // Merge history ke P
      history.forEach(function(h) {
        var p = window.P.find(function(x) { return x.id === h.proj_id; });
        if (p) {
          p.history = p.history || [];
          p.history.push({
            date: h.date, actual: h.actual, plan: h.plan,
            mp: h.mp, notes: h.notes, status: h.status
          });
        }
      });

      // Reset cache — data sekunder semua proyek harus di-fetch ulang
      _loaded.clear();
      _loading.clear();

      _log('Phase 1 selesai dalam ' + (Date.now() - t0) + 'ms — ' + window.P.length + ' proyek');

      // Render overview sekarang — proyek sudah ada, data sekunder menyusul
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('Proyek dimuat ✓');

      // Update timestamp untuk indikator patch3
      window._p3LastRefreshTs = Date.now();
      if (typeof window._p3UpdateLastRefreshIndicator === 'function') {
        window._p3UpdateLastRefreshIndicator();
      }

      // Subscribe realtime
      if (typeof sbSubscribeRealtime === 'function') sbSubscribeRealtime();

      // Phase 2: proyek aktif dulu, sisanya background
      var activeId = (typeof selId !== 'undefined' && selId) ||
                     (window.P[0] && window.P[0].id) || null;
      if (activeId) {
        _log('Phase 2: memuat data sekunder proyek aktif (' + activeId + ')...');
        await window.loadProjectData(activeId);
      }

      // Background: sisa proyek (stagger 400ms antar proyek)
      _backgroundLoadAll();

    } catch (err) {
      if (typeof toast === 'function') toast('Gagal load: ' + err.message, 'error');
      console.error('[Phase1] Error:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2 — loadProjectData(projId)
  // ═══════════════════════════════════════════════════════════
  // Fetch 8 tabel sekunder untuk satu project, merge ke globals.
  // Idempoten: skip jika sudah di-load atau sedang loading.
  // ─────────────────────────────────────────────────────────────

  window.loadProjectData = async function(projId) {
    if (!projId) return;
    var pid = String(projId);

    if (_loaded.has(pid)) {
      _log('loadProjectData(' + pid + '): sudah di-cache, skip');
      return;
    }
    if (_loading.has(pid)) {
      _log('loadProjectData(' + pid + '): sedang loading, skip');
      return;
    }

    var client = _sb();
    if (!client) return;

    _loading.add(pid);
    var t0 = Date.now();
    _log('loadProjectData: mengambil data sekunder proyek ' + pid + '...');

    try {
      var res = await Promise.all([
        client.from('issues').select('*')
              .eq('proj_id', pid).order('created_at', { ascending: false }),
        client.from('procurement').select('*')
              .eq('proj_id', pid).order('created_at', { ascending: false }),
        client.from('manpower_logs').select('*')
              .eq('proj_id', pid).order('date', { ascending: false }),
        client.from('accident_logs').select('*')
              .eq('proj_id', pid).order('date', { ascending: false }),
        client.from('costs').select('*')
              .eq('proj_id', pid).eq('_deleted', false)
              .order('date', { ascending: false }),
        client.from('rab').select('*')
              .eq('proj_id', pid).order('urutan'),
        client.from('wbs').select('*')
              .eq('proj_id', pid).order('order'),
        client.from('scurve').select('*')
              .eq('proj_id', pid).order('week'),
      ]);

      // Log error tiap query tapi jangan abort
      res.forEach(function(r, i) {
        if (r.error) console.warn('[loadProjectData] query ' + i + ':', r.error.message);
      });

      _ensureArrays();

      // Merge: filter-out slice lama project ini, concat data baru
      window.ISS     = _merge(window.ISS,     pid, (res[0].data || []).map(mapIssue));
      window.PROC    = _merge(window.PROC,     pid, (res[1].data || []).map(mapProcurement));
      window.MPLOGS  = _merge(window.MPLOGS,   pid, (res[2].data || []).map(mapManpower));
      window.ACCLOGS = _merge(window.ACCLOGS,  pid, (res[3].data || []).map(mapAccident));
      window.COSTS   = _merge(window.COSTS,    pid, (res[4].data || []).map(mapCost));
      window.RAB     = _merge(window.RAB,      pid, (res[5].data || []).map(mapRab));
      window.WBS     = _merge(window.WBS,      pid, (res[6].data || []).map(mapWbs));
      window.SCURVE  = _merge(window.SCURVE,   pid, (res[7].data || []).map(mapScurve));

      _loaded.add(pid);
      _loading.delete(pid);
      _log('loadProjectData(' + pid + ') selesai dalam ' + (Date.now() - t0) + 'ms');

      // Re-render hanya jika project ini adalah yang sedang aktif
      var curSel = (typeof selId !== 'undefined') ? String(selId) : null;
      if (curSel === pid && typeof render === 'function') {
        render();
      }

    } catch (err) {
      _loading.delete(pid);
      console.warn('[loadProjectData]', pid, err.message);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // BACKGROUND LOADING — sisa proyek di-load berurutan
  // ═══════════════════════════════════════════════════════════
  // Stagger 400ms antar proyek agar tidak banjir request ke Supabase.
  // Untuk 4-5 proyek: semua selesai dalam ~2-3 detik setelah Phase 1.
  // ─────────────────────────────────────────────────────────────

  function _wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  async function _backgroundLoadAll() {
    if (!Array.isArray(window.P)) return;

    var remaining = window.P.filter(function(p) {
      var pid = String(p.id);
      return !_loaded.has(pid) && !_loading.has(pid);
    });

    if (!remaining.length) return;
    _log('Background: ' + remaining.length + ' proyek tersisa akan di-load...');

    for (var i = 0; i < remaining.length; i++) {
      await _wait(400);                               // stagger
      await window.loadProjectData(remaining[i].id);
    }

    _log('Background: semua ' + window.P.length + ' proyek sudah di-load ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // AUTO-TRIGGER — deteksi perubahan selId lewat render()
  // ═══════════════════════════════════════════════════════════
  // Safety net: jika user berpindah proyek dan data belum ada
  // (misalnya koneksi lambat sehingga background load belum selesai),
  // loadProjectData di-trigger setelah render() dipanggil.
  // ─────────────────────────────────────────────────────────────

  var _origRender = window.render;
  if (typeof _origRender === 'function') {
    window.render = function() {
      // Jalankan render asli terlebih dahulu
      _origRender.apply(this, arguments);

      // Cek apakah selId baru dan belum di-load
      var cur = (typeof selId !== 'undefined' && selId) ? String(selId) : null;
      if (cur && cur !== _lastSel) {
        _lastSel = cur;
        if (!_loaded.has(cur) && !_loading.has(cur)) {
          _log('render(): selId berubah ke ' + cur + ' — trigger loadProjectData');
          window.loadProjectData(cur); // async, render ulang setelah selesai
        }
      }
    };
    _log('render() + selId-change detector terpasang ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // FORCE-RELOAD helper — untuk Realtime & manual refresh
  // ═══════════════════════════════════════════════════════════
  // Saat Realtime event masuk untuk project X, kita ingin data
  // terbaru segera ter-reflect tanpa full reload.
  // patch3 (realtime) memanggil render() setelah update array lokal.
  // Tapi jika array belum di-load, kita perlu fetch ulang.
  // Expose window._p4 untuk debugging dan kontrol dari konsol.
  // ─────────────────────────────────────────────────────────────

  window._p4 = {
    // Status tiap project
    status: function() {
      if (!Array.isArray(window.P)) { console.log('P kosong'); return; }
      console.table(window.P.map(function(p) {
        var pid = String(p.id);
        return {
          id:     pid.slice(-6),
          nama:   p.nama,
          status: _loading.has(pid) ? '⏳ loading' : _loaded.has(pid) ? '✓ loaded' : '⋯ pending'
        };
      }));
    },
    // Force reload 1 project (hapus dari cache dulu)
    reload: function(projId) {
      var pid = String(projId);
      _loaded.delete(pid);
      _loading.delete(pid);
      return window.loadProjectData(pid);
    },
    // Force reload semua project
    reloadAll: function() {
      return window.loadFromSupabase();
    },
    loaded:  _loaded,
    loading: _loading,
  };

  // ─────────────────────────────────────────────────────────────
  _log([
    'Patch 4 loaded ✓',
    '  • loadFromSupabase: Phase 1 (projects+history+docs) → render → Phase 2 (aktif) → background',
    '  • loadProjectData(id): on-demand fetch 8 tabel sekunder per-project',
    '  • render(): auto-detect selId change → trigger loadProjectData jika belum di-cache',
    '  • window._p4.status() — lihat status loading tiap project'
  ].join('\n'));

})();
