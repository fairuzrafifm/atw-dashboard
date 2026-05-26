// ============================================================
// ATW Dashboard — patch4.js  (v2 — fix let vs window bug)
// Lazy Loading — Level 1: Project-Scoped Data Fetch
//
// ROOT CAUSE FIX:
//   core.js menggunakan  let P=[], ISS=[], WBS=[], ...
//   let di-level global BUKAN window.P / window.ISS.
//   patch4 v1 menulis ke window.P → render() tetap baca P kosong.
//   Solusi: assign langsung ke P, ISS, WBS, ... (tanpa window.)
//
// STRATEGI:
//   Phase 1 (cepat): projects + history + documents → render()
//   Phase 2 (demand): 8 tabel sekunder hanya untuk proyek aktif
//   Background: sisa proyek, stagger 400ms antar proyek
//
// Load order: SETELAH patch1, patch2, patch3. Sebelum </body>.
// ============================================================
(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────
  function _sb()  { return (typeof _initSb === 'function') ? _initSb() : null; }
  function _log(m){ console.log('[Patch4]', m); }

  // ── State loading ──────────────────────────────────────────
  var _loaded   = new Set();  // projId sudah di-fetch
  var _loading  = new Set();  // projId sedang di-fetch
  var _lastSel  = null;       // deteksi perubahan selId

  // ── Merge helper: ganti slice projId di array ──────────────
  function _merge(arr, pid, newItems) {
    return arr
      .filter(function(x){ return String(x.projId) !== pid; })
      .concat(newItems);
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 1 — ganti loadFromSupabase sepenuhnya
  // ═══════════════════════════════════════════════════════════
  var _phase1Promise = null;

  window.loadFromSupabase = function() {
    if (_phase1Promise) {
      _log('Dedup: Phase 1 sedang berjalan');
      return _phase1Promise;
    }
    _phase1Promise = _doPhase1().finally(function(){ _phase1Promise = null; });
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
      _log('Phase 1: projects + history + documents...');
      var t0 = Date.now();

      var results = await Promise.all([
        client.from('projects').select('*').order('created_at'),
        client.from('project_history').select('*').order('date'),
        client.from('documents').select('*').order('created_at', { ascending: false }),
      ]);

      results.forEach(function(r, i){
        if (r.error) console.warn('[Phase1] query', i, r.error.message);
      });

      var projects  = results[0].data || [];
      var history   = results[1].data || [];
      var documents = results[2].data || [];

      // ── KRITIS: tulis ke let-binding, BUKAN window.X ──────
      // let P, ISS, ... di core.js BUKAN window.P, window.ISS
      // render() membaca P (let), bukan window.P
      P = projects.map(mapProject);

      // Reset array sekunder — data lama semua proyek dihapus
      ISS     = [];
      PROC    = [];
      MPLOGS  = [];
      ACCLOGS = [];
      COSTS   = [];
      RAB     = [];
      WBS     = [];
      SCURVE  = [];

      // Documents: tidak ada proj_id filter di query asli → global
      if (typeof mapDocument === 'function') {
        DOCS = documents.map(mapDocument);
      }

      // Merge history ke P
      history.forEach(function(h){
        var p = P.find(function(x){ return x.id === h.proj_id; });
        if (p) {
          p.history = p.history || [];
          p.history.push({
            date: h.date, actual: h.actual, plan: h.plan,
            mp: h.mp, notes: h.notes, status: h.status
          });
        }
      });

      // Reset cache
      _loaded.clear();
      _loading.clear();

      _log('Phase 1 selesai ' + (Date.now()-t0) + 'ms — ' + P.length + ' proyek');

      // Render overview sekarang (data sekunder menyusul)
      if (typeof render === 'function') render();
      if (typeof toast === 'function') toast('Proyek dimuat ✓');

      // Update timestamp indikator patch3
      window._p3LastRefreshTs = Date.now();
      if (typeof window._p3UpdateLastRefreshIndicator === 'function') {
        window._p3UpdateLastRefreshIndicator();
      }

      // Subscribe realtime
      if (typeof sbSubscribeRealtime === 'function') sbSubscribeRealtime();

      // Phase 2: proyek aktif dulu
      var activeId = (typeof selId !== 'undefined' && selId) ||
                     (P[0] && P[0].id) || null;
      if (activeId) {
        _log('Phase 2: proyek aktif ' + activeId);
        await window.loadProjectData(activeId);
      }

      // Background: sisa proyek
      _backgroundLoadAll();

    } catch(err) {
      if (typeof toast === 'function') toast('Gagal load: ' + err.message, 'error');
      console.error('[Phase1]', err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2 — data sekunder per-project
  // ═══════════════════════════════════════════════════════════
  window.loadProjectData = async function(projId) {
    if (!projId) return;
    var pid = String(projId);
    if (_loaded.has(pid))  { _log('cache hit: ' + pid); return; }
    if (_loading.has(pid)) { _log('in-flight: ' + pid); return; }

    var client = _sb();
    if (!client) return;

    _loading.add(pid);
    var t0 = Date.now();
    _log('loadProjectData(' + pid + ')...');

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

      res.forEach(function(r, i){
        if (r.error) console.warn('[loadProjectData] q' + i + ':', r.error.message);
      });

      // ── KRITIS: assign ke let-binding, BUKAN window.X ─────
      ISS     = _merge(ISS,     pid, (res[0].data || []).map(mapIssue));
      PROC    = _merge(PROC,    pid, (res[1].data || []).map(mapProcurement));
      MPLOGS  = _merge(MPLOGS,  pid, (res[2].data || []).map(mapManpower));
      ACCLOGS = _merge(ACCLOGS, pid, (res[3].data || []).map(mapAccident));
      COSTS   = _merge(COSTS,   pid, (res[4].data || []).map(mapCost));
      RAB     = _merge(RAB,     pid, (res[5].data || []).map(mapRab));
      WBS     = _merge(WBS,     pid, (res[6].data || []).map(mapWbs));
      SCURVE  = _merge(SCURVE,  pid, (res[7].data || []).map(mapScurve));

      _loaded.add(pid);
      _loading.delete(pid);
      _log('loadProjectData(' + pid + ') OK ' + (Date.now()-t0) + 'ms' +
           ' | WBS:' + WBS.filter(function(w){ return String(w.projId)===pid; }).length);

      // Re-render hanya jika ini proyek aktif saat ini
      var curSel = (typeof selId !== 'undefined') ? String(selId) : null;
      if (curSel === pid && typeof render === 'function') render();

    } catch(err) {
      _loading.delete(pid);
      console.warn('[loadProjectData]', pid, err.message);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // BACKGROUND — sisa proyek, stagger 400ms
  // ═══════════════════════════════════════════════════════════
  function _wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  async function _backgroundLoadAll() {
    if (!Array.isArray(P) || !P.length) return;
    var remaining = P.filter(function(p){
      var pid = String(p.id);
      return !_loaded.has(pid) && !_loading.has(pid);
    });
    if (!remaining.length) return;
    _log('Background: ' + remaining.length + ' proyek tersisa');
    for (var i = 0; i < remaining.length; i++) {
      await _wait(400);
      await window.loadProjectData(remaining[i].id);
    }
    _log('Background selesai — semua ' + P.length + ' proyek loaded ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // AUTO-TRIGGER — deteksi selId berubah lewat render()
  // ═══════════════════════════════════════════════════════════
  var _origRender = window.render;
  if (typeof _origRender === 'function') {
    window.render = function() {
      _origRender.apply(this, arguments);
      var cur = (typeof selId !== 'undefined' && selId) ? String(selId) : null;
      if (cur && cur !== _lastSel) {
        _lastSel = cur;
        if (!_loaded.has(cur) && !_loading.has(cur)) {
          _log('render(): selId→' + cur + ' belum di-cache, trigger load');
          window.loadProjectData(cur);
        }
      }
    };
    _log('render() wrapper terpasang ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // DEBUG API
  // ═══════════════════════════════════════════════════════════
  window._p4 = {
    status: function() {
      // Baca P langsung (let binding, bukan window.P)
      if (!Array.isArray(P) || !P.length) { console.log('P kosong'); return; }
      console.table(P.map(function(p){
        var pid = String(p.id);
        return {
          id:     pid.slice(-6),
          nama:   (p.nama||'').slice(0,20),
          status: _loading.has(pid) ? '⏳ loading' : _loaded.has(pid) ? '✓ loaded' : '⋯ pending'
        };
      }));
      console.log('WBS total:', WBS.length, '| ISS:', ISS.length, '| COSTS:', COSTS.length);
    },
    reload: function(projId){
      var pid = String(projId);
      _loaded.delete(pid); _loading.delete(pid);
      return window.loadProjectData(pid);
    },
    reloadAll: function(){ return window.loadFromSupabase(); },
    loaded:  _loaded,
    loading: _loading,
  };

  _log([
    'Patch 4 v2 loaded ✓ (fix: let-binding, bukan window.X)',
    '  • Phase 1: projects+history+docs → render()',
    '  • Phase 2: 8 tabel sekunder on-demand per-project',
    '  • Background: sisa proyek stagger 400ms',
    '  • Debug: window._p4.status()',
  ].join('\n'));

})();
