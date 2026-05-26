// ============================================================
// ATW Dashboard — patch3.js
// Fitur:
//   1. Realtime project_history subscription (Supabase)
//   2. Edit Lock untuk WBS Edit modal & Daily Report modal
//   3. Auto-refresh data setiap 10 menit
//   4. Visual indicator "Data diperbarui X menit lalu" di save bar
//
// Urutan load: SETELAH patch1.js dan patch2.js, sebelum </body>
// Tidak mengubah logika yang sudah berjalan — hanya adisi.
// ============================================================
(function () {
  'use strict';

  // ── INTERNAL HELPERS ────────────────────────────────────────
  function _getSb() {
    return (typeof sb !== 'undefined' ? sb : null) || window.sb || null;
  }
  function _log(msg) {
    console.log('[Patch3]', msg);
  }

  // ═══════════════════════════════════════════════════════════
  // 1. REALTIME — project_history subscription
  // ═══════════════════════════════════════════════════════════
  //
  // supabase.js sudah subscribe: projects, issues, procurement,
  // costs, manpower_logs, accident_logs, wbs, scurve, photos.
  // Yang belum ada: project_history.
  // Kita buat channel terpisah agar tidak mengganggu channel utama.
  // ─────────────────────────────────────────────────────────────

  var _p3HistChannel = null;

  function _subscribeProjectHistory() {
    var client = _getSb();
    if (!client || _p3HistChannel) return;

    _p3HistChannel = client.channel('atw-p3-history')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_history' },
        function (payload) { _handleHistoryChange(payload); }
      )
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          _log('project_history realtime subscription aktif ✓');
        }
      });
  }

  function _handleHistoryChange(payload) {
    var eventType = payload.eventType;
    var newRow    = payload.new  || {};
    var oldRow    = payload.old  || {};

    var projId = newRow.proj_id || oldRow.proj_id;
    if (!projId) return;

    var proj = (typeof P !== 'undefined') &&
               Array.isArray(P) &&
               P.find(function (p) { return String(p.id) === String(projId); });
    if (!proj) return;
    if (!proj.history) proj.history = [];

    function mapH(r) {
      return {
        date: r.date, actual: r.actual, plan: r.plan,
        mp:   r.mp,   notes: r.notes,  status: r.status
      };
    }

    if (eventType === 'INSERT') {
      var exists = proj.history.find(function (h) { return h.date === newRow.date; });
      if (!exists) proj.history.push(mapH(newRow));

    } else if (eventType === 'UPDATE') {
      var idx = proj.history.findIndex(function (h) { return h.date === newRow.date; });
      if (idx >= 0) proj.history[idx] = mapH(newRow);
      else proj.history.push(mapH(newRow));

    } else if (eventType === 'DELETE') {
      proj.history = proj.history.filter(function (h) { return h.date !== oldRow.date; });
    }

    // Sinkronkan plan/actual project dari entri terakhir history
    if (proj.history.length) {
      proj.history.sort(function (a, b) { return a.date.localeCompare(b.date); });
      var last = proj.history[proj.history.length - 1];
      if (last.actual != null) proj.actual = last.actual;
      if (last.plan   != null) proj.plan   = last.plan;
      if (last.status)         proj.status = last.status;
    }

    // Debounce render — hindari flicker jika banyak event bersamaan
    clearTimeout(window._p3HistRenderTimer);
    window._p3HistRenderTimer = setTimeout(function () {
      if (typeof render === 'function') render();
    }, 350);
  }

  // Hook sbSubscribeRealtime: panggil _subscribeProjectHistory sesudahnya
  // sehingga tetap berjalan bahkan jika loadFromSupabase dipanggil ulang.
  var _origSbSubscribeRealtime = window.sbSubscribeRealtime;
  if (typeof _origSbSubscribeRealtime === 'function') {
    window.sbSubscribeRealtime = function () {
      _origSbSubscribeRealtime.apply(this, arguments);
      // Reset channel agar subscribe ulang setiap loadFromSupabase
      if (_p3HistChannel) {
        try { _getSb() && _getSb().removeChannel(_p3HistChannel); } catch (e) {}
        _p3HistChannel = null;
      }
      _subscribeProjectHistory();
    };
    _log('sbSubscribeRealtime + project_history hook terpasang ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // 2. EDIT LOCK — WBS Edit Modal
  // ═══════════════════════════════════════════════════════════
  //
  // Pola sama dengan modul lain di patch1.js:
  //   • openEditWbs()  → _checkAndWarnLock + _acquireLock
  //   • saveEditWbs()  → _releaseLock (save berhasil)
  //   • cm('wbsEdit') → _releaseLock (modal ditutup tanpa save)
  // ─────────────────────────────────────────────────────────────

  // Simpan ID node yang sedang di-lock di scope global agar bisa
  // diakses dari cm() override (closure terpisah tidak bisa saling akses).
  window._p3WbsLockId = null;

  var _origOpenEditWbs = window.openEditWbs;
  if (typeof _origOpenEditWbs === 'function') {
    window.openEditWbs = async function (id) {
      var lockId = String(id);

      // 1. Cek apakah ada user lain yang sedang mengedit node ini
      if (typeof window._checkAndWarnLock === 'function') {
        var isLocked = await window._checkAndWarnLock('wbs', lockId);
        if (isLocked) {
          // Buka modal sebagai read-only — user tetap bisa melihat data
          _origOpenEditWbs.call(this, id);
          window._p3WbsLockId = null; // jangan acquire lock milik kita

          setTimeout(function () {
            var modal = document.getElementById('ov-wbsEdit');
            if (!modal) return;
            // Disable semua input dalam modal
            modal.querySelectorAll('input, select, textarea').forEach(function (el) {
              el.disabled = true;
              el.title = 'Sedang diedit pengguna lain — read only';
            });
            // Disable tombol simpan
            modal.querySelectorAll('button').forEach(function (btn) {
              if (btn.textContent.toLowerCase().includes('simpan') ||
                  (btn.getAttribute('onclick') || '').includes('saveEditWbs')) {
                btn.disabled = true;
                btn.style.opacity = '0.35';
                btn.title = 'Sedang dikunci pengguna lain';
              }
            });
            // Tampilkan banner peringatan jika belum ada
            if (!modal.querySelector('#_p3LockBanner')) {
              var banner = document.createElement('div');
              banner.id = '_p3LockBanner';
              banner.style.cssText = [
                'background:rgba(239,68,68,.12);border:1px solid var(--rd);',
                'border-radius:6px;padding:7px 12px;font-size:11px;color:var(--rd);',
                'margin-bottom:10px;display:flex;align-items:center;gap:6px'
              ].join('');
              banner.innerHTML = '🔒 Sedang diedit pengguna lain — mode baca saja';
              var firstChild = modal.querySelector('.fg, .fi, input, select');
              if (firstChild) firstChild.parentNode.insertBefore(banner, firstChild);
              else modal.appendChild(banner);
            }
          }, 120);
          return;
        }
      }

      // 2. Tidak ada lock aktif — buka modal dan langsung acquire
      _origOpenEditWbs.call(this, id);
      window._p3WbsLockId = lockId;

      if (typeof window._acquireLock === 'function') {
        window._acquireLock('wbs', lockId);
      }

      // Pastikan form aktif (reset dari kemungkinan disabled sebelumnya)
      setTimeout(function () {
        var modal = document.getElementById('ov-wbsEdit');
        if (!modal) return;
        modal.querySelectorAll('input, select, textarea').forEach(function (el) {
          el.disabled = false;
          el.title = '';
        });
        modal.querySelectorAll('button').forEach(function (btn) {
          btn.disabled = false;
          btn.style.opacity = '';
          btn.title = '';
        });
        var banner = modal.querySelector('#_p3LockBanner');
        if (banner) banner.remove();
      }, 120);
    };
    _log('openEditWbs + lock check/acquire aktif ✓');
  }

  // Setelah save → release lock
  var _origSaveEditWbs = window.saveEditWbs;
  if (typeof _origSaveEditWbs === 'function') {
    window.saveEditWbs = function () {
      var lockId = window._p3WbsLockId;
      _origSaveEditWbs.call(this);
      if (lockId && typeof window._releaseLock === 'function') {
        window._releaseLock('wbs', lockId);
        window._p3WbsLockId = null;
      }
    };
    _log('saveEditWbs + lock release aktif ✓');
  }

  // Saat modal wbsEdit ditutup tanpa save → release lock
  // Note: cm() sudah di-override oleh patch2.js untuk scPlan.
  // Kita wrap lagi — rantai: patch3.cm → patch2.cm → original.cm
  var _origCm_p3 = window.cm;
  if (typeof _origCm_p3 === 'function') {
    window.cm = function (modalName) {
      // Release WBS lock jika modal wbsEdit ditutup
      if (modalName === 'wbsEdit' && window._p3WbsLockId) {
        if (typeof window._releaseLock === 'function') {
          window._releaseLock('wbs', window._p3WbsLockId);
        }
        window._p3WbsLockId = null;
      }
      return _origCm_p3.apply(this, arguments);
    };
    _log('cm() + wbsEdit lock-release hook terpasang ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // 3. EDIT LOCK — Daily Report (drInput & drQtySetup)
  // ═══════════════════════════════════════════════════════════
  //
  // Untuk Daily Report tidak ada fungsi openModal khusus,
  // sehingga lock diterapkan pada saat SAVE:
  //   • Cek lock sebelum eksekusi → abort jika terkunci
  //   • Acquire lock → jalankan original → release setelah selesai
  //
  // Record key: "projId_tanggal" agar granular per project per hari.
  // ─────────────────────────────────────────────────────────────

  // saveDrInput — input harian per item WBS
  var _origSaveDrInput_p3 = window.saveDrInput;
  if (typeof _origSaveDrInput_p3 === 'function') {
    window.saveDrInput = async function () {
      var projId = (document.getElementById('drInputProj') || {}).value || '';
      var date   = (document.getElementById('drInputDate')  || {}).value ||
                   new Date().toISOString().slice(0, 10);
      var lockKey = (projId + '_' + date).replace(/[^a-zA-Z0-9_-]/g, '_');

      // Cek apakah user lain sedang menyimpan data hari + project yang sama
      if (typeof window._checkAndWarnLock === 'function') {
        var isLocked = await window._checkAndWarnLock('daily_input', lockKey);
        if (isLocked) return; // abort — biarkan toast dari _checkAndWarnLock tampil
      }

      // Acquire lock sebelum proses
      if (typeof window._acquireLock === 'function') {
        window._acquireLock('daily_input', lockKey);
      }

      // Jalankan fungsi asli (bisa sudah di-wrap oleh patch2)
      _origSaveDrInput_p3.call(this);

      // Release lock setelah selesai (delay kecil agar async patch2 selesai dulu)
      setTimeout(function () {
        if (typeof window._releaseLock === 'function') {
          window._releaseLock('daily_input', lockKey);
        }
      }, 3000);
    };
    _log('saveDrInput + lock aktif ✓');
  }

  // saveDrQtySetup — setup qty plan per project
  var _origSaveDrQtySetup_p3 = window.saveDrQtySetup;
  if (typeof _origSaveDrQtySetup_p3 === 'function') {
    window.saveDrQtySetup = async function () {
      var projId  = (document.getElementById('drSetupProj') || {}).value || '';
      var lockKey = ('setup_' + projId).replace(/[^a-zA-Z0-9_-]/g, '_');

      if (typeof window._checkAndWarnLock === 'function') {
        var isLocked = await window._checkAndWarnLock('daily_setup', lockKey);
        if (isLocked) return;
      }

      if (typeof window._acquireLock === 'function') {
        window._acquireLock('daily_setup', lockKey);
      }

      _origSaveDrQtySetup_p3.call(this);

      setTimeout(function () {
        if (typeof window._releaseLock === 'function') {
          window._releaseLock('daily_setup', lockKey);
        }
      }, 3000);
    };
    _log('saveDrQtySetup + lock aktif ✓');
  }

  // ═══════════════════════════════════════════════════════════
  // 4. AUTO-REFRESH DATA setiap 10 menit
  // ═══════════════════════════════════════════════════════════
  //
  // Terpisah dari token-refresh 50 menit di patch2.js.
  // Ini me-refresh DATA (loadFromSupabase) bukan JWT token.
  // Skip jika: belum login, atau ada overlay/modal terbuka
  // (mencegah interrupt saat user sedang mengedit).
  // ─────────────────────────────────────────────────────────────

  var _p3LastRefreshTs = null; // timestamp ms terakhir loadFromSupabase berhasil

  // Hook loadFromSupabase untuk catat waktu terakhir berhasil
  var _origLoadFromSupabase_p3 = window.loadFromSupabase;
  if (typeof _origLoadFromSupabase_p3 === 'function') {
    window.loadFromSupabase = async function () {
      var result = await _origLoadFromSupabase_p3.apply(this, arguments);
      _p3LastRefreshTs = Date.now();
      _p3UpdateLastRefreshIndicator();
      return result;
    };
    _log('loadFromSupabase timestamp-hook terpasang ✓');
  }

  function _p3IsLoggedIn() {
    var as = document.getElementById('authScreen');
    if (!as) return false;
    // Auth screen disembunyikan = sudah login
    var st = as.style;
    return st.display === 'none' ||
           (!st.cssText.includes('fixed') && !st.cssText.includes('flex'));
  }

  function _p3HasOpenModal() {
    // Cek apakah ada overlay aktif — hindari refresh di tengah edit
    var ovs = document.querySelectorAll('.ov');
    for (var i = 0; i < ovs.length; i++) {
      var st = ovs[i].style;
      if (st.display === 'flex' || st.display === 'block') return true;
    }
    return false;
  }

  var _DATA_REFRESH_MS = 10 * 60 * 1000; // 10 menit

  setInterval(async function () {
    if (!_p3IsLoggedIn())    return; // belum login
    if (_p3HasOpenModal())   return; // ada modal terbuka — jangan interrupt
    if (typeof window.loadFromSupabase !== 'function') return;

    _log('Auto-refresh data (10 menit)...');
    try {
      await window.loadFromSupabase();
    } catch (e) {
      _log('Auto-refresh error: ' + e.message);
    }
  }, _DATA_REFRESH_MS);

  _log('Auto-refresh data setiap 10 menit aktif ✓');

  // ═══════════════════════════════════════════════════════════
  // 5. INDIKATOR "Data diperbarui X menit lalu" di save bar
  // ═══════════════════════════════════════════════════════════
  //
  // Injek <span id="p3RefreshBadge"> tepat setelah #smsg.
  // Diklik → trigger loadFromSupabase() manual.
  // Update teks setiap 60 detik (menit penuh) dan setiap kali
  // loadFromSupabase selesai.
  // ─────────────────────────────────────────────────────────────

  function _p3InjectRefreshBadge() {
    if (document.getElementById('p3RefreshBadge')) return;
    var smsg = document.getElementById('smsg');
    if (!smsg) return;

    var badge = document.createElement('span');
    badge.id = 'p3RefreshBadge';
    badge.title = 'Klik untuk refresh data sekarang';
    badge.style.cssText = [
      'display:inline-flex;align-items:center;gap:3px;',
      'font-size:10px;font-family:var(--fm);',
      'padding:1px 7px;border-radius:10px;cursor:pointer;',
      'border:1px solid var(--bd);background:rgba(255,255,255,.04);',
      'color:var(--mt);white-space:nowrap;flex-shrink:0;',
      'transition:border-color .2s,color .2s;margin-left:6px;',
      'user-select:none'
    ].join('');
    badge.textContent = '⟳ —';

    badge.addEventListener('mouseenter', function () {
      badge.style.borderColor = 'var(--bl)';
      badge.style.color = 'var(--bl)';
    });
    badge.addEventListener('mouseleave', function () {
      _p3UpdateLastRefreshIndicator();
    });
    badge.addEventListener('click', function () {
      if (typeof window.loadFromSupabase !== 'function') return;
      badge.textContent = '⟳ loading...';
      badge.style.borderColor = 'var(--or)';
      badge.style.color = 'var(--or)';
      window.loadFromSupabase().catch(function () {});
    });

    // Masuk setelah #smsg dalam .sbar-info
    smsg.parentNode.insertBefore(badge, smsg.nextSibling);
    _log('Refresh badge diinjek ke save bar ✓');
  }

  function _p3UpdateLastRefreshIndicator() {
    var el = document.getElementById('p3RefreshBadge');
    if (!el) return;

    if (!_p3LastRefreshTs) {
      el.textContent = '⟳ —';
      el.style.borderColor = 'var(--bd)';
      el.style.color = 'var(--mt)';
      return;
    }

    var mins = Math.floor((Date.now() - _p3LastRefreshTs) / 60000);

    if (mins < 1) {
      el.textContent = '✓ baru saja';
      el.style.borderColor = 'var(--gn)';
      el.style.color = 'var(--gn)';
    } else if (mins < 10) {
      el.textContent = '✓ ' + mins + ' mnt lalu';
      el.style.borderColor = 'var(--gn)';
      el.style.color = 'var(--gn)';
    } else if (mins < 15) {
      el.textContent = '⟳ ' + mins + ' mnt lalu';
      el.style.borderColor = 'var(--yw)';
      el.style.color = 'var(--yw)';
    } else {
      el.textContent = '⚠ ' + mins + ' mnt lalu';
      el.style.borderColor = 'var(--rd)';
      el.style.color = 'var(--rd)';
    }
  }

  // Perbarui badge setiap menit
  setInterval(_p3UpdateLastRefreshIndicator, 60 * 1000);

  // ═══════════════════════════════════════════════════════════
  // 6. INIT — tunggu DOM + login
  // ═══════════════════════════════════════════════════════════

  function _p3Init() {
    _p3InjectRefreshBadge();
    _p3UpdateLastRefreshIndicator();

    // Jika sudah login saat init, subscribe history langsung
    if (_p3IsLoggedIn()) {
      setTimeout(_subscribeProjectHistory, 1500);
    }
  }

  // Jalankan saat DOM siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(_p3Init, 800); });
  } else {
    setTimeout(_p3Init, 800);
  }

  // Observer untuk deteksi login (authScreen disembunyikan)
  // sehingga history subscription bisa aktif tepat setelah login.
  (function () {
    var _observed = false;
    function _tryObserve() {
      if (_observed) return;
      var as = document.getElementById('authScreen');
      if (!as) return;
      _observed = true;

      var mo = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.target.id === 'authScreen' && m.target.style.display === 'none') {
            setTimeout(function () {
              _subscribeProjectHistory();
              _p3InjectRefreshBadge();
            }, 2000);
          }
        });
      });
      mo.observe(as, { attributes: true, attributeFilter: ['style'] });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _tryObserve);
    } else {
      _tryObserve();
    }
  })();

  // ─────────────────────────────────────────────────────────────
  _log([
    'Patch 3 loaded ✓',
    '  • Realtime: project_history',
    '  • Lock: WBS Edit modal (openEditWbs / saveEditWbs / cm)',
    '  • Lock: Daily Report (saveDrInput / saveDrQtySetup)',
    '  • Auto-refresh data: 10 menit',
    '  • Save bar: indikator last-refresh'
  ].join('\n'));

})();
