// ============================================================
// SUPABASE FULL MIGRATION PATCH v1.0
// Menggantikan semua GSheet sync dengan Supabase
// Append sebelum </body> — jangan hapus script di atasnya
// ============================================================
(function () {
  'use strict';

  // ── 1. MATIKAN GSHEET SYNC & POLLING ────────────────────
  // gsSync menjadi no-op — semua save kini langsung ke Supabase per fungsi
  window.gsSync = function () {};
  // Hentikan polling GSheet setiap 15 detik
  window._rtPoll = async function () {};

  // Sembunyikan badge & tombol GSheet dari header/toolbar
  function _hideGsUI() {
    const ids = ['gsBadge', 'btnSync', 'btnLoad'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
  setTimeout(_hideGsUI, 800);

  // ── 2. HELPER: status bar Supabase ──────────────────────
  function _sbStatusOk() {
    try {
      const dot = document.getElementById('sdot');
      const msg = document.getElementById('smsg');
      const bar = document.getElementById('sbar');
      if (dot) { dot.style.background = 'var(--gn)'; dot.classList.remove('unsaved'); }
      if (msg) msg.textContent = 'Tersimpan ke Supabase ✓ · ' + new Date().toLocaleTimeString('id-ID');
      if (bar) bar.classList.remove('dirty');
      if (typeof isDirty !== 'undefined') window.isDirty = false;
    } catch (e) {}
  }

  function _sbStatusErr(msg) {
    try {
      const dot = document.getElementById('sdot');
      const smsg = document.getElementById('smsg');
      if (dot) dot.style.background = 'var(--rd)';
      if (smsg) smsg.textContent = '⚠ Gagal simpan: ' + (msg || 'cek koneksi');
    } catch (e) {}
  }

  // ── 3. CENTRAL SUPABASE PERSIST ─────────────────────────
  async function _sbPersist(type, action, data) {
    const client = (typeof _initSb === 'function') ? _initSb() : null;
    if (!client) { console.warn('[sbPersist] client null'); return; }
    try {
      switch (type) {

        case 'project':
          if (action === 'save') await sbSaveProject(data);
          else if (action === 'delete')
            await client.from('projects').delete().eq('id', data.id);
          break;

        case 'history':
          // data = { projId, history[] }
          if (action === 'save') await sbSaveHistory(data.projId, data.history || []);
          break;

        case 'issue':
          if (action === 'save') await sbSaveIssue(data);
          else if (action === 'delete') await sbDeleteIssue(data.id);
          break;

        case 'procurement':
          if (action === 'save') await sbSaveProcurement(data);
          else if (action === 'delete')
            await client.from('procurement').delete().eq('id', data.id);
          break;

        case 'cost':
          if (action === 'save') await sbSaveCost(data);
          else if (action === 'delete')
            await client.from('costs').update({ _deleted: true }).eq('id', data.id);
          break;

        case 'manpower':
          if (action === 'save') await sbSaveManpower(data);
          else if (action === 'delete')
            await client.from('manpower_logs').delete().eq('id', data.id);
          break;

        case 'accident':
          if (action === 'save') await sbSaveAccident(data);
          else if (action === 'delete')
            await client.from('accident_logs').delete().eq('id', data.id);
          break;

        case 'wbs':
          if (action === 'save') await sbSaveWbs(data);
          else if (action === 'delete')
            await client.from('wbs').delete().eq('id', data.id);
          break;

        case 'wbs_bulk':
          // Upsert batch — sort cat→subcat→item agar FK parent_id tidak gagal
          if (action === 'save' && data.length) {
            const typeOrder = { cat: 0, subcat: 1, item: 2 };
            const sorted = [...data].sort((a, b) =>
              (typeOrder[a.type] ?? 1) - (typeOrder[b.type] ?? 1));
            const mapped = sorted.map(n => unmapWbs(n));
            const { error } = await client.from('wbs')
              .upsert(mapped, { onConflict: 'id' });
            if (error) throw error;
          } else if (action === 'delete' && data.length) {
            // Hapus berurutan item→subcat→cat (reverse FK order)
            const typeOrder = { cat: 2, subcat: 1, item: 0 };
            const sorted = [...data].sort((a, b) =>
              (typeOrder[a.type] ?? 0) - (typeOrder[b.type] ?? 0));
            for (const n of sorted) {
              await client.from('wbs').delete().eq('id', n.id);
            }
          }
          break;

        case 'scurve':
          if (action === 'save') await sbSaveScurve(data);
          else if (action === 'delete')
            await client.from('scurve').delete().eq('proj_id', data.projId).eq('week', data.week);
          break;

        case 'rab':
          if (action === 'save') await sbSaveRab(Array.isArray(data) ? data : [data]);
          else if (action === 'delete')
            await client.from('rab').delete().eq('id', data.id);
          break;

        case 'rab_bulk':
          if (action === 'save') await sbSaveRab(data);
          break;
      }
      _sbStatusOk();
    } catch (e) {
      console.warn('[sbPersist]', type, action, e.message);
      _sbStatusErr(e.message);
    }
  }
  window._sbPersist = _sbPersist;

  // ── ATOMIC PATCH HELPER ──────────────────────────────────
  // Kirim HANYA field tertentu — bukan seluruh objek
  // Ini mencegah User A menimpa perubahan User B di field berbeda
  async function _sbAtomicPatch(table, id, fields) {
    if (!id) return;
    const client = _initSb(); if (!client) return;
    const payload = { ...fields, updated_at: new Date().toISOString() };
    const { error } = await client.from(table).update(payload).eq('id', id);
    if (error) throw error;
  }
  window._sbAtomicPatch = _sbAtomicPatch;

  // ── ATOMIC INSERT HELPER ─────────────────────────────────
  // Untuk record BARU — pakai insert, bukan upsert
  async function _sbAtomicInsert(table, obj) {
    const client = _initSb(); if (!client) return;
    const { error } = await client.from(table).insert(obj);
    if (error) throw error;
  }
  window._sbAtomicInsert = _sbAtomicInsert;

  // ── 4. OVERRIDE autoLoadOnStart → Supabase ───────────────
  window.autoLoadOnStart = async function () {
    // Tampilkan cache lokal dulu (instant)
    try {
      if (typeof loadLocal === 'function' && loadLocal()) {
        if (typeof loadLogosCache === 'function') loadLogosCache();
        if (typeof P !== 'undefined' && P.length && !selId) selId = P[0]?.id || null;
        if (typeof render === 'function') render();
      }
    } catch (e) {}

    // Update status bar
    const smsg = document.getElementById('smsg');
    const sdot = document.getElementById('sdot');
    if (smsg) smsg.textContent = 'Menghubungkan ke Supabase...';
    if (sdot) sdot.style.background = 'var(--yw)';

    // Load dari Supabase
    try {
      if (typeof loadFromSupabase === 'function') {
        await loadFromSupabase();
        if (smsg) smsg.textContent = 'Data dimuat dari Supabase ✓';
        if (sdot) { sdot.style.background = 'var(--gn)'; sdot.classList.remove('unsaved'); }
      }
    } catch (e) {
      console.warn('[autoLoadOnStart] Supabase error:', e);
      if (smsg) smsg.textContent = '⚠ Gagal terhubung ke Supabase';
    }
  };

  // ── 5. PROJECT — Atomic PATCH per domain ────────────────
  // saveProj: PATCH hanya field form (metadata)
  // Tidak menyentuh plan/actual/status — itu domain S-Curve & saveUpdate
  const _orig_saveProj = window.saveProj;
  window.saveProj = async function () {
    const prevId = typeof editProjId !== 'undefined' ? editProjId : null;
    _orig_saveProj.call(this);
    const proj = prevId ? P.find(p => p.id === prevId) : P[P.length - 1];
    if (!proj) return;
    try {
      if (prevId) {
        // UPDATE existing — PATCH metadata fields only
        await _sbAtomicPatch('projects', prevId, {
          kode: proj.kode, nama: proj.nama,
          lokasi: proj.lokasi || null, client: proj.client || null,
          mulai: proj.mulai || null, selesai: proj.selesai || null,
          mp_plan: proj.mpPlan || 0, mh_plan: proj.mhPlan || 0,
          notes: proj.notes || null, logo: proj.logo || null,
          weather: proj.weather || null,
          pic_pm: proj.picPm || null, pic_sm: proj.picSm || null,
          pic_eng: proj.picEng || null, pic_proc: proj.picProc || null
        });
      } else {
        // INSERT new project — full upsert (record belum ada di DB)
        await sbSaveProject(proj);
      }
      _sbStatusOk();
    } catch(e) { _sbStatusErr(e.message); console.warn('[saveProj patch]', e); }
  };

  const _orig_doDelProj = window._doDelProj;
  window._doDelProj = async function () {
    const pid = typeof editProjId !== 'undefined' ? editProjId : null;
    _orig_doDelProj.call(this);
    if (pid) await _sbPersist('project', 'delete', { id: pid });
  };

  const _orig_executeCloneProject = window.executeCloneProject;
  window.executeCloneProject = async function () {
    const prevLen = P.length;
    const prevWbsLen = WBS.length;
    _orig_executeCloneProject.call(this);
    const newProj = P[P.length - 1];
    if (newProj && P.length > prevLen) {
      await sbSaveProject(newProj);
      const newWbs = WBS.slice(prevWbsLen);
      if (newWbs.length) await _sbPersist('wbs_bulk', 'save', newWbs);
    }
  };

  // saveUpdate: PATCH hanya plan/actual/status/notes — domain progress
  const _orig_saveUpdate = window.saveUpdate;
  window.saveUpdate = async function () {
    _orig_saveUpdate.call(this);
    const p = P.find(x => x.id === selId);
    if (!p) return;
    try {
      await _sbAtomicPatch('projects', p.id, {
        plan: p.plan, actual: p.actual,
        mp_actual: p.mpActual || 0, status: p.status,
        notes: p.notes || null
      });
      if (p.history?.length) await _sbPersist('history', 'save', { projId: p.id, history: p.history });
      _sbStatusOk();
    } catch(e) { _sbStatusErr(e.message); }
  };

  // saveWeather: PATCH hanya field weather
  const _orig_saveWeather = window.saveWeather;
  window.saveWeather = async function () {
    _orig_saveWeather.call(this);
    try {
      await Promise.all(P.map(p =>
        _sbAtomicPatch('projects', p.id, { weather: p.weather || null })
      ));
      _sbStatusOk();
    } catch(e) { _sbStatusErr(e.message); }
  };

  // History edit/delete
  const _orig_saveHistEntry = window.saveHistEntry;
  window.saveHistEntry = async function () {
    const projId = document.getElementById('ehProjId')?.value;
    const idx     = +document.getElementById('ehIdx')?.value;
    _orig_saveHistEntry.call(this);
    const p = projId ? P.find(x => String(x.id) === String(projId)) : null;
    if (p) {
      await _sbPersist('history', 'save', { projId: p.id, history: p.history });
      // Jika entri terakhir, sync plan/actual ke project
      if (idx === (p.history?.length ?? 0) - 1) {
        await _sbAtomicPatch('projects', p.id, {
          plan: p.plan, actual: p.actual, status: p.status
        });
      }
      _sbStatusOk();
    }
  };

  const _orig_doDelHist = window._doDelHist;
  window._doDelHist = async function (projId, idx) {
    _orig_doDelHist.call(this, projId, idx);
    const p = P.find(x => x.id === projId);
    if (p) await _sbPersist('history', 'save', { projId: p.id, history: p.history });
  };


  // ── 6. MANPOWER ──────────────────────────────────────────
  const _orig_saveMp = window.saveMp;
  window.saveMp = async function () {
    const projId = document.getElementById('mpProj')?.value || '';
    const date = document.getElementById('mpDate')?.value || new Date().toISOString().slice(0, 10);
    _orig_saveMp.call(this);
    const entry = MPLOGS.find(m => String(m.projId) === String(projId) && m.date === date);
    if (entry) await _sbPersist('manpower', 'save', entry);
  };

  const _orig_delMpLog = window.delMpLog;
  window.delMpLog = async function (id) {
    const target = id || (typeof editMpId !== 'undefined' ? editMpId : null);
    _orig_delMpLog.call(this, id);
    if (target) await _sbPersist('manpower', 'delete', { id: target });
  };

  // ── 7. ACCIDENT ──────────────────────────────────────────
  const _orig_saveAcc = window.saveAcc;
  window.saveAcc = async function () {
    _orig_saveAcc.call(this);
    const entry = ACCLOGS[ACCLOGS.length - 1];
    if (entry) await _sbPersist('accident', 'save', entry);
  };

  const _orig_saveAccEdit = window.saveAccEdit;
  window.saveAccEdit = async function () {
    const eaId = document.getElementById('eaId')?.value;
    _orig_saveAccEdit.call(this);
    const entry = eaId ? ACCLOGS.find(a => String(a.id) === String(eaId)) : null;
    if (entry) await _sbPersist('accident', 'save', entry);
  };

  const _orig_delAccLog = window.delAccLog;
  window.delAccLog = async function () {
    const eaId = document.getElementById('eaId')?.value;
    _orig_delAccLog.call(this);
    if (eaId) await _sbPersist('accident', 'delete', { id: eaId });
  };

  // ── 8. ISSUES ────────────────────────────────────────────
  const _orig_saveIss = window.saveIss;
  window.saveIss = async function () {
    const prevId = typeof editIssId !== 'undefined' ? editIssId : null;
    _orig_saveIss.call(this);
    const iss = prevId ? ISS.find(x => String(x.id) === String(prevId))
                       : ISS[ISS.length - 1];
    if (iss) await _sbPersist('issue', 'save', iss);
  };

  window.delIss = function () {
    const id = typeof editIssId !== 'undefined' ? editIssId : null;
    if (typeof showConfirm === 'function') {
      showConfirm('Hapus issue ini?', async () => {
        if (typeof ISS !== 'undefined')
          window.ISS = ISS.filter(i => String(i.id) !== String(id));
        if (typeof dirty === 'function') dirty();
        if (typeof cm === 'function') cm('addIssue');
        if (typeof renderIssues === 'function') renderIssues();
        if (typeof toast === 'function') toast('Issue dihapus', 'warn');
        if (id) await _sbPersist('issue', 'delete', { id });
      });
    }
  };

  // ── 9. PROCUREMENT ───────────────────────────────────────
  const _orig_saveProc = window.saveProc;
  window.saveProc = async function () {
    const prevId = typeof editProcId !== 'undefined' ? editProcId : null;
    _orig_saveProc.call(this);
    const proc = prevId ? PROC.find(x => String(x.id) === String(prevId))
                        : PROC[PROC.length - 1];
    if (proc) await _sbPersist('procurement', 'save', proc);
  };

  window.delProc = function () {
    const id = typeof editProcId !== 'undefined' ? editProcId : null;
    if (typeof showConfirm === 'function') {
      showConfirm('Hapus item ini?', async () => {
        if (typeof PROC !== 'undefined')
          window.PROC = PROC.filter(p => String(p.id) !== String(id));
        if (typeof dirty === 'function') dirty();
        if (typeof cm === 'function') cm('addProc');
        if (typeof renderProc === 'function') renderProc();
        if (typeof toast === 'function') toast('Item dihapus', 'warn');
        if (id) await _sbPersist('procurement', 'delete', { id });
      });
    }
  };

  // ── 10. COST ─────────────────────────────────────────────
  const _orig_saveCost = window.saveCost;
  window.saveCost = async function () {
    const prevId = typeof editCostId !== 'undefined' ? editCostId : null;
    _orig_saveCost.call(this);
    const cost = prevId ? COSTS.find(x => String(x.id) === String(prevId))
                        : COSTS[COSTS.length - 1];
    if (cost) await _sbPersist('cost', 'save', cost);
  };

  const _orig_delCost = window.delCost;
  window.delCost = async function () {
    const id = typeof editCostId !== 'undefined' ? editCostId : null;
    _orig_delCost.call(this);
    if (id) await _sbPersist('cost', 'delete', { id });
  };

  // ── 11. RAB ──────────────────────────────────────────────
  const _orig_saveRabKat = window.saveRabKat;
  window.saveRabKat = async function () {
    const prevId = typeof editRabCatId !== 'undefined' ? editRabCatId : null;
    _orig_saveRabKat.call(this);
    const item = prevId ? RAB.find(x => String(x.id) === String(prevId))
                        : RAB[RAB.length - 1];
    if (item) await _sbPersist('rab', 'save', item);
  };

  // delRabKat: pakai original (confirm() di dalamnya), capture ids sebelum
  const _orig_delRabKat = window.delRabKat;
  window.delRabKat = async function () {
    const catId = typeof editRabCatId !== 'undefined' ? editRabCatId : null;
    const childIds = catId ? RAB.filter(r => r.type === 'item' && String(r.katId) === String(catId)).map(r => r.id) : [];
    _orig_delRabKat.call(this); // confirm() synchronous di dalam
    // Cek apakah benar-benar dihapus dari memory
    const deleted = catId && !RAB.find(r => String(r.id) === String(catId));
    if (deleted) {
      await _sbPersist('rab', 'delete', { id: catId });
      for (const id of childIds) await _sbPersist('rab', 'delete', { id });
    }
  };

  const _orig_saveRabItem = window.saveRabItem;
  window.saveRabItem = async function () {
    const prevId = typeof editRabId !== 'undefined' ? editRabId : null;
    _orig_saveRabItem.call(this);
    const item = prevId ? RAB.find(x => String(x.id) === String(prevId))
                        : RAB[RAB.length - 1];
    if (item) await _sbPersist('rab', 'save', item);
  };

  // delRabItem: pakai original (confirm() di dalamnya)
  const _orig_delRabItem = window.delRabItem;
  window.delRabItem = async function () {
    const id = typeof editRabId !== 'undefined' ? editRabId : null;
    _orig_delRabItem.call(this); // confirm() di dalam
    const deleted = id && !RAB.find(r => String(r.id) === String(id));
    if (deleted) await _sbPersist('rab', 'delete', { id });
  };

  const _orig_executeCloneRab = window.executeCloneRab;
  window.executeCloneRab = async function () {
    const prevLen = typeof RAB !== 'undefined' ? RAB.length : 0;
    if (_orig_executeCloneRab) _orig_executeCloneRab.call(this);
    const newItems = RAB.slice(prevLen);
    if (newItems.length) await _sbPersist('rab_bulk', 'save', newItems);
  };

  // ── 12. WBS ──────────────────────────────────────────────
  const _orig_saveWbsCat = window.saveWbsCat;
  window.saveWbsCat = async function () {
    _orig_saveWbsCat.call(this);
    const node = WBS[WBS.length - 1];
    if (node) await _sbPersist('wbs', 'save', node);
  };

  const _orig_saveWbsSub = window.saveWbsSub;
  window.saveWbsSub = async function () {
    _orig_saveWbsSub.call(this);
    const node = WBS[WBS.length - 1];
    if (node) await _sbPersist('wbs', 'save', node);
  };

  const _orig_saveWbsItem = window.saveWbsItem;
  window.saveWbsItem = async function () {
    _orig_saveWbsItem.call(this);
    const node = WBS[WBS.length - 1];
    if (node) await _sbPersist('wbs', 'save', node);
  };

  const _orig_saveEditWbs = window.saveEditWbs;
  window.saveEditWbs = async function () {
    const id = document.getElementById('wbsEditId')?.value;
    _orig_saveEditWbs.call(this);
    const node = id ? WBS.find(w => String(w.id) === String(id)) : null;
    if (node) await _sbPersist('wbs', 'save', node);
  };

  window.delWbs = function (id) {
    const sid = String(id);
    const node = WBS.find(w => w.id === sid); if (!node) return;
    const childIds = WBS.filter(w => String(w.parentId) === sid).map(w => String(w.id));
    const grandIds = WBS.filter(w => childIds.includes(String(w.parentId))).map(w => String(w.id));
    const toRm = new Set([sid, ...childIds, ...grandIds]);
    const msg = `Hapus "${(node.name||'').slice(0,30)}"${toRm.size > 1 ? ' dan ' + (toRm.size - 1) + ' child-nya' : ''}?`;
    if (typeof showConfirm === 'function') {
      showConfirm(msg, async () => {
        window.WBS = WBS.filter(w => !toRm.has(String(w.id)));
        if (typeof dirty === 'function') dirty();
        if (typeof renderWBS === 'function') renderWBS();
        if (typeof toast === 'function') toast('Dihapus', 'warn');
        await Promise.all([...toRm].map(wid => _sbPersist('wbs', 'delete', { id: wid })));
      });
    }
  };

  const _orig_saveWbsPlanGrid = window.saveWbsPlanGrid;
  window.saveWbsPlanGrid = async function () {
    const projId = document.getElementById('wbsPlanProj')?.value || '';
    _orig_saveWbsPlanGrid.call(this);
    const nodes = WBS.filter(w => String(w.projId) === String(projId));
    if (nodes.length) await _sbPersist('wbs_bulk', 'save', nodes);
    // Juga simpan project (plan% terupdate)
    const proj = P.find(p => String(p.id) === String(projId));
    if (proj) await _sbPersist('project', 'save', proj);
  };

  const _orig_saveWbsProgress = window.saveWbsProgress;
  window.saveWbsProgress = async function () {
    const projId = document.getElementById('wbsProgProj')?.value || selId || '';
    _orig_saveWbsProgress.call(this);
    const nodes = WBS.filter(w => String(w.projId) === String(projId));
    if (nodes.length) await _sbPersist('wbs_bulk', 'save', nodes);
    const proj = P.find(p => String(p.id) === String(projId));
    if (proj) {
      await _sbPersist('project', 'save', proj);
      if (proj.history?.length) await _sbPersist('history', 'save', { projId: proj.id, history: proj.history });
    }
  };

  // WBS inline & daily logs
  const _orig_saveWbsInlineDate = window.saveWbsInlineDate;
  if (_orig_saveWbsInlineDate) {
    window.saveWbsInlineDate = async function (nodeId, field, val) {
      _orig_saveWbsInlineDate.call(this, nodeId, field, val);
      const node = WBS.find(w => String(w.id) === String(nodeId));
      if (node) await _sbPersist('wbs', 'save', node);
    };
  }

  const _orig_saveWbsInlineText = window.saveWbsInlineText;
  if (_orig_saveWbsInlineText) {
    window.saveWbsInlineText = async function (nodeId, field, val) {
      _orig_saveWbsInlineText.call(this, nodeId, field, val);
      const node = WBS.find(w => String(w.id) === String(nodeId));
      if (node) await _sbPersist('wbs', 'save', node);
    };
  }

  // saveDailyLog (per-item)
  const _orig_saveDailyLog = window.saveDailyLog;
  if (_orig_saveDailyLog) {
    window.saveDailyLog = async function (itemId) {
      _orig_saveDailyLog.call(this, itemId);
      const node = WBS.find(w => String(w.id) === String(itemId));
      if (node) await _sbPersist('wbs', 'save', node);
    };
  }

  // saveDrQtySetup
  const _orig_saveDrQtySetup = window.saveDrQtySetup;
  window.saveDrQtySetup = async function () {
    const projId = document.getElementById('drSetupProj')?.value || '';
    _orig_saveDrQtySetup.call(this);
    const nodes = WBS.filter(w => String(w.projId) === String(projId));
    if (nodes.length) await _sbPersist('wbs_bulk', 'save', nodes);
  };

  // saveAllDailyLogs (bulk)
  const _orig_saveAllDailyLogs = window.saveAllDailyLogs;
  if (_orig_saveAllDailyLogs) {
    window.saveAllDailyLogs = async function () {
      const projId = document.getElementById('wbsDailyProj')?.value || '';
      _orig_saveAllDailyLogs.call(this);
      const nodes = WBS.filter(w => String(w.projId) === String(projId));
      if (nodes.length) await _sbPersist('wbs_bulk', 'save', nodes);
      const proj = P.find(p => String(p.id) === String(projId));
      if (proj) {
        await _sbPersist('project', 'save', proj);
        const sc = SCURVE.find(s => String(s.projId) === String(projId));
        if (sc) await _sbPersist('scurve', 'save', sc);
      }
    };
  }

  // ── 13. S-CURVE — atomic PATCH plan/actual ke project ───
  const _orig_doSaveSCurveActual = window._doSaveSCurveActual;
  window._doSaveSCurveActual = async function (projId, week, wAct, cAct) {
    _orig_doSaveSCurveActual.call(this, projId, week, wAct, cAct);
    const entry = SCURVE.find(d => String(d.projId) === String(projId) && d.week === week);
    if (entry) await _sbPersist('scurve', 'save', entry);
    const proj = P.find(p => String(p.id) === String(projId));
    if (proj) {
      // PATCH hanya plan/actual/status — tidak timpa metadata
      await _sbAtomicPatch('projects', proj.id, {
        plan: proj.plan, actual: proj.actual, status: proj.status
      });
      if (proj.history?.length)
        await _sbPersist('history', 'save', { projId: proj.id, history: proj.history });
      _sbStatusOk();
    }
  };

  window._doDelScWeek = async function (projId, week) {
    const _orig = window.__origDoDelScWeek;
    if (_orig) _orig.call(this, projId, week);
    else {
      SCURVE = SCURVE.filter(d => !(String(d.projId) === String(projId) && d.week === week));
      if (typeof dirty === 'function') dirty();
      if (typeof renderSCurve === 'function') renderSCurve();
      if (typeof renderScManageTable === 'function') renderScManageTable();
      if (typeof toast === 'function') toast('Data dihapus', 'warn');
    }
    await _sbPersist('scurve', 'delete', { projId, week });
  };
  // Simpan referensi original sebelum override hilang
  if (!window.__origDoDelScWeek && window._doDelScWeek_orig_backup)
    window.__origDoDelScWeek = window._doDelScWeek_orig_backup;

  const _orig_cm_scPlan = window.cm;
  if (_orig_cm_scPlan) {
    window.cm = function (modalName) {
      _orig_cm_scPlan.call(this, modalName);
      if (modalName === 'scPlan') {
        setTimeout(async () => {
          const projId = document.getElementById('scPlanProj')?.value || selId;
          if (!projId) return;
          const entries = SCURVE.filter(s => String(s.projId) === String(projId));
          await Promise.all(entries.map(e => _sbPersist('scurve', 'save', e)));
          const proj = P.find(p => String(p.id) === String(projId));
          if (proj) {
            await _sbAtomicPatch('projects', proj.id, {
              plan: proj.plan, actual: proj.actual
            });
          }
        }, 300);
      }
    };
  }

  console.log('✅ Supabase Migration Patch loaded — GSheet sync disabled');

  // ── 16. FIX VIEWER MODE WBS — nama & bobot tersembunyi ──────
  // Masalah: nama subcat/item dibungkus .wbs-inline-text.edit-only
  // yang disembunyikan CSS untuk viewer-mode.
  // Fix: tampilkan sebagai read-only text (input tidak interaktif)
  const _viewerWbsCss = document.createElement('style');
  _viewerWbsCss.textContent = `
    body.viewer-mode .wbs-inline-text.edit-only {
      display: inline-flex !important;
      pointer-events: none !important;
      cursor: default !important;
    }
    body.viewer-mode .wbs-inline-text.edit-only input {
      pointer-events: none !important;
      background: transparent !important;
      border: none !important;
      outline: none !important;
      cursor: text;
      color: inherit;
      -webkit-user-select: text;
      user-select: text;
    }
    body.viewer-mode .wbs-date-cell.edit-only {
      display: table-cell !important;
      pointer-events: none !important;
    }
    body.viewer-mode .wbs-date-cell.edit-only input[type="date"] {
      display: none !important;
    }
  `;
  document.head.appendChild(_viewerWbsCss);

  // ── 15. DISABLE GSHEET PASSWORD LOADING ─────────────────
  // Login sekarang murni Supabase Auth — tidak perlu fetch password dari GSheet
  window.loadPwFromGS = async function () {
    // No-op: skip GSheet request, pakai default values saja
    return Promise.resolve();
  };

  // ══════════════════════════════════════════════════════════
  // FIX 1 — Deduplikasi loadFromSupabase()
  // ══════════════════════════════════════════════════════════
  // Root cause:
  //   a) doLogin() → _loginSuccess() → autoLoadOnStart() → loadFromSupabase() [1]
  //      lalu doLogin() langsung memanggil loadFromSupabase() lagi             [2]
  //   b) _initAuthListener() mendengar SIGNED_IN → loadFromSupabase()          [3]
  //
  // Solusi: Wrap window.loadFromSupabase dengan dedup promise.
  // Semua caller (doLogin, autoLoadOnStart, _initAuthListener) me-resolve
  // window.loadFromSupabase via scope chain → override ini selalu tertangkap.
  (function () {
    const _orig = window.loadFromSupabase;
    if (typeof _orig !== 'function') { console.warn('[Fix1] loadFromSupabase not found'); return; }

    let _running = null; // promise yang sedang berjalan

    window.loadFromSupabase = function () {
      // Jika load sedang berjalan, kembalikan promise yang sama (bukan load baru)
      if (_running) {
        console.log('[loadFromSupabase] Deduplicated — returning in-progress promise');
        return _running;
      }
      // Mulai load baru, simpan promise-nya
      _running = Promise.resolve().then(() => _orig.apply(this, arguments))
        .finally(function () { _running = null; });
      return _running;
    };

    console.log('✅ Fix 1: loadFromSupabase dedup aktif');
  })();

  // ══════════════════════════════════════════════════════════
  // FIX 2 — Verifikasi session Supabase saat halaman dimuat
  // ══════════════════════════════════════════════════════════
  // Root cause:
  //   checkSession() hanya cek localStorage timer 8 jam, tidak verifikasi
  //   token Supabase (expire ~1 jam). Akibatnya user terlihat login di UI
  //   tapi API call ke Supabase bisa dapat 401 secara diam-diam.
  //
  // Solusi:
  //   1. Saat halaman load, cek Supabase session aktif via getSession()
  //   2. Jika token habis, coba refresh. Jika gagal → paksa re-login
  //   3. Jadwalkan auto-refresh token setiap 50 menit (Supabase expire ~1 jam)
  (function () {

    // ── Paksa re-login (tampilkan auth screen) ──────────────
    function _forceRelogin(reason) {
      console.warn('[Session]', reason, '— meminta login ulang');
      localStorage.removeItem('atw_session');
      const as = document.getElementById('authScreen');
      if (as) {
        as.style.cssText = [
          'position:fixed;inset:0;z-index:9999;display:flex;',
          'align-items:center;justify-content:center;flex-direction:column;',
          'background:linear-gradient(135deg,#060a14 0%,#0a0f1e 50%,#0d1525 100%)'
        ].join('');
      }
      try { toast('Sesi berakhir, silakan login kembali', 'error'); } catch (e) {}
      // Sign out dari Supabase agar token lama tidak tersimpan di browser
      try {
        const c = (typeof _initSb === 'function') ? _initSb() : null;
        if (c) c.auth.signOut();
      } catch (e) {}
    }

    // ── Update timestamp localStorage agar 8 jam selalu fresh ──
    function _refreshLocalSession() {
      try {
        const s = JSON.parse(localStorage.getItem('atw_session') || '{}');
        if (s.role) {
          localStorage.setItem('atw_session', JSON.stringify({ role: s.role, ts: Date.now() }));
        }
      } catch (e) {}
    }

    // ── Cek apakah user sedang dalam keadaan logged in ──────
    function _isLoggedIn() {
      const as = document.getElementById('authScreen');
      // auth screen tersembunyi = user sudah login
      return as && (as.style.display === 'none' || !as.style.cssText.includes('fixed'));
    }

    // ── Verifikasi sesi Supabase (async) ────────────────────
    async function _verifySbSession() {
      if (!_isLoggedIn()) return; // belum login, skip

      const client = (typeof _initSb === 'function') ? _initSb() : null;
      if (!client) return;

      try {
        const { data: { session }, error } = await client.auth.getSession();

        if (error) {
          console.warn('[Session] getSession error:', error.message);
          return; // error jaringan, jangan paksa logout
        }

        if (!session) {
          // Token tidak ada di browser — coba refresh
          const { data: refreshData, error: refreshErr } = await client.auth.refreshSession();
          if (refreshErr || !refreshData.session) {
            _forceRelogin('Token Supabase expired dan tidak bisa di-refresh');
            return;
          }
          // Refresh berhasil
          _refreshLocalSession();
          console.log('[Session] Token di-refresh otomatis ✓');
          return;
        }

        // Session valid — perbarui localStorage timestamp
        _refreshLocalSession();

        // Cek apakah token hampir habis (sisa < 5 menit)
        const expiresAt = session.expires_at; // unix timestamp
        if (expiresAt && (expiresAt - Math.floor(Date.now() / 1000)) < 300) {
          const { data: refreshData, error: refreshErr } = await client.auth.refreshSession();
          if (!refreshErr && refreshData.session) {
            _refreshLocalSession();
            console.log('[Session] Token di-refresh preventif (sisa < 5 menit) ✓');
          }
        }

      } catch (e) {
        console.warn('[Session] Verification exception:', e.message);
        // Jangan paksa logout jika terjadi error jaringan
      }
    }

    // ── Auto-refresh token setiap 50 menit ──────────────────
    function _scheduleTokenRefresh() {
      setInterval(async function () {
        if (!_isLoggedIn()) return;
        const client = (typeof _initSb === 'function') ? _initSb() : null;
        if (!client) return;
        try {
          const { data, error } = await client.auth.refreshSession();
          if (!error && data.session) {
            _refreshLocalSession();
            console.log('[Session] Auto-refresh token ✓ —', new Date().toLocaleTimeString('id-ID'));
          } else if (error) {
            // Refresh gagal — cek apakah masih ada session
            const { data: { session } } = await client.auth.getSession();
            if (!session) _forceRelogin('Auto-refresh gagal dan tidak ada session aktif');
          }
        } catch (e) {
          console.warn('[Session] Auto-refresh error:', e.message);
        }
      }, 50 * 60 * 1000); // setiap 50 menit
    }

    // ── Jalankan verifikasi saat page load ──────────────────
    // Untuk user yang sudah login sebelumnya (via checkSession)
    if (document.readyState === 'complete') {
      setTimeout(_verifySbSession, 1000); // delay kecil agar _initSb() sudah siap
    } else {
      window.addEventListener('load', function () {
        setTimeout(_verifySbSession, 1000);
      });
    }

    // Jadwalkan auto-refresh
    _scheduleTokenRefresh();

    // Expose untuk debugging
    window._verifySbSession = _verifySbSession;

    console.log('✅ Fix 2: Session verification + auto-refresh aktif (setiap 50 menit)');
  })();

  // ══════════════════════════════════════════════════════════
  // FIX 3 — Bersihkan referensi GSheet di save bar
  // ══════════════════════════════════════════════════════════
  // Root cause (3 sumber):
  //   a) setInterval(_rtPoll, 15000) memanggil _rtPoll original setiap 15 detik
  //      → _rtPoll set smsg = 'GSheet ✓ · time'
  //      → Fix: gsOk=false agar _rtPoll return early (baris 11009: if(!gsOk||...)return)
  //   b) autoLoadOnStart() original dipanggil dari initAuth() SEBELUM migration patch
  //      → set flabel = 'Google Sheet · time'
  //      → Fix: re-trigger loadFromSupabase + update flabel untuk returning users
  //   c) Dropdown Data masih ada "Sync ke GSheet" / "Load dari GSheet"
  //      → Fix: sembunyikan item-item tersebut
  (function () {

    // ── A. Stop _rtPoll — set gsOk=false ─────────────────────
    // _rtPoll cek: if(!gsOk||!gsUrl||!_rtOnline)return; (line 11009)
    // Dengan gsOk=false, SEMUA call _rtPoll dari setInterval jadi no-op.
    try { gsOk = false; gsUrl = ''; } catch (e) {}

    // ── B. Tampilkan email user di flabel ─────────────────────
    // Menggantikan "Google Sheet · time" dengan info Supabase user.
    async function _updateFlabel() {
      const flabel = document.getElementById('flabel');
      if (!flabel) return;
      try {
        const client = (typeof _initSb === 'function') ? _initSb() : null;
        if (!client) { flabel.textContent = '\u2601 Supabase'; return; }
        const { data } = await client.auth.getUser();
        if (data && data.user) {
          const stored = JSON.parse(localStorage.getItem('atw_session') || '{}');
          const role = stored.role || (typeof currentRole !== 'undefined' ? currentRole : '');
          const shortEmail = (data.user.email || '').split('@')[0];
          flabel.textContent = '\u2601 ' + shortEmail + (role ? ' \u00b7 ' + role : '');
        } else {
          flabel.textContent = '\u2601 Supabase';
        }
      } catch (e) {
        const fl = document.getElementById('flabel');
        if (fl) fl.textContent = '\u2601 Supabase';
      }
    }

    // ── C. Untuk returning users: trigger Supabase load ───────
    // initAuth() memanggil autoLoadOnStart() ORIGINAL sebelum migration patch.
    // Hasilnya: smsg = "Memuat cache lokal — menghubungi GSheet..."
    // Fix: cek jika user sudah login via checkSession → panggil loadFromSupabase
    (function _fixReturningUser() {
      const as = document.getElementById('authScreen');
      const isLoggedIn = as && (as.style.display === 'none' ||
        (as.style.cssText && !as.style.cssText.includes('fixed')));
      if (!isLoggedIn) return; // belum login, skip

      // Update smsg agar tidak tampil pesan GSheet
      const smsg = document.getElementById('smsg');
      const sdot = document.getElementById('sdot');
      if (smsg && (smsg.textContent.includes('GSheet') || smsg.textContent.includes('Google'))) {
        smsg.textContent = 'Menghubungkan ke Supabase...';
      }
      if (sdot) { sdot.style.background = 'var(--yw)'; sdot.classList.remove('unsaved'); }

      // Load data dari Supabase (replace data GSheet jika ada)
      setTimeout(async function () {
        try {
          if (typeof loadFromSupabase === 'function') await loadFromSupabase();
        } catch (e) { console.warn('[Fix3-C]', e.message); }
        _updateFlabel();
      }, 400);
    })();

    // ── D. Patch autoLoadOnStart — tambahkan flabel update ────
    // Agar flabel selalu di-update setelah Supabase load selesai
    // (berlaku untuk new login via doLogin)
    const _origAutoLoad3 = window.autoLoadOnStart;
    window.autoLoadOnStart = async function () {
      if (typeof _origAutoLoad3 === 'function') await _origAutoLoad3.apply(this, arguments);
      setTimeout(_updateFlabel, 500);
    };

    // ── E. Sembunyikan elemen GSheet di save bar ──────────────
    function _cleanSbarGsUI() {
      // Sembunyikan item dropdown GSheet
      ['btnSync', 'btnLoad'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'none';
        // Sembunyikan separator setelah item jika ada
        const next = el.nextElementSibling;
        if (next && next.classList && next.classList.contains('sbar-dd-sep')) {
          next.style.display = 'none';
        }
      });

      // Sembunyikan GSheet badge di header (redundant tapi pastikan hilang)
      const badge = document.getElementById('gsBadge');
      if (badge) badge.style.display = 'none';

      // Jika smsg masih menampilkan teks GSheet, ganti
      const smsg = document.getElementById('smsg');
      if (smsg) {
        const t = smsg.textContent || '';
        if (t.includes('GSheet') || t.includes('Google Sheet') ||
            t.includes('cache lokal') || t.includes('menghubungi')) {
          smsg.textContent = 'Siap \u2014 Supabase';
        }
      }
    }
    setTimeout(_cleanSbarGsUI, 600);

    // ── F. Override _sbStatusOk — jaga flabel tetap Supabase ──
    // Setelah setiap save berhasil, pastikan flabel tidak kembali ke GSheet text
    const _origStatusOk2 = window._sbStatusOk;
    window._sbStatusOk = function () {
      if (typeof _origStatusOk2 === 'function') _origStatusOk2.apply(this, arguments);
      const fl = document.getElementById('flabel');
      if (fl && (fl.textContent.includes('Google') || fl.textContent.includes('GSheet') ||
                 fl.textContent === '\u2014' || fl.textContent === 'Belum ada file' ||
                 fl.textContent === 'Lokal' || fl.textContent === 'Cache Offline')) {
        _updateFlabel();
      }
    };

    console.log('\u2705 Fix 3: Save bar GSheet references dibersihkan');
  })();

  // ══════════════════════════════════════════════════════════
  // RETRY QUEUE + OFFLINE MODE
  // ══════════════════════════════════════════════════════════
  // Arsitektur:
  //   Semua save akhirnya memanggil _sbStatusErr saat gagal.
  //   Kita intercept _sbStatusErr + hook tiap window.save* untuk capture data.
  //   Data pending disimpan ke localStorage (atw_sq) → di-flush saat online kembali.
  //   Offline mode: navigator.onLine check di setiap save, queue langsung.
  (function () {

    var QUEUE_KEY = 'atw_sq';
    var MAX_Q = 80;
    var _errFlag = 0; // timestamp terakhir _sbStatusErr dipanggil

    // ── Queue helpers ─────────────────────────────────────────
    function _qLoad() {
      try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
    }
    function _qSave(q) {
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_Q))); } catch (e) {}
    }
    function _qAdd(op) {
      var q = _qLoad();
      // Dedup: ganti item dengan key yang sama
      if (op.key) {
        var idx = q.findIndex(function (x) { return x.key === op.key; });
        if (idx >= 0) { q[idx] = op; } else { q.push(op); }
      } else {
        q.push(op);
      }
      _qSave(q);
      _uiBadge();
    }
    function _qRemove(opId) {
      _qSave(_qLoad().filter(function (x) { return x.id !== opId; }));
      _uiBadge();
    }
    function _qClear() {
      localStorage.removeItem(QUEUE_KEY);
      _uiBadge();
    }

    // ── Badge UI ──────────────────────────────────────────────
    function _uiBadge() {
      var q = _qLoad();
      var badge = document.getElementById('_sqBadge');
      if (!badge) {
        var info = document.querySelector('#sbar .sbar-info');
        if (!info) return;
        badge = document.createElement('span');
        badge.id = '_sqBadge';
        badge.title = 'Operasi tertunda — klik untuk kirim ulang';
        badge.style.cssText = [
          'display:none;margin-left:8px;padding:1px 8px;border-radius:10px;',
          'font-size:9px;font-family:var(--fm);cursor:pointer;',
          'background:rgba(249,115,22,.15);color:var(--or);',
          'border:1px solid rgba(249,115,22,.3);animation:pulse 2s infinite'
        ].join('');
        badge.onclick = function () { _flush(); };
        info.appendChild(badge);
      }
      if (q.length === 0) {
        badge.style.display = 'none';
      } else {
        badge.style.display = 'inline-block';
        badge.textContent = '\u21bb ' + q.length + ' tertunda';
      }
    }

    // ── Intercept _sbStatusErr ────────────────────────────────
    // Saat error save terdeteksi, tandai waktunya
    var _origSbErr = window._sbStatusErr;
    window._sbStatusErr = function (msg) {
      _errFlag = Date.now();
      if (typeof _origSbErr === 'function') _origSbErr.call(this, msg);
    };
    function _hadErr() { return (Date.now() - _errFlag) < 600; }

    // ── Offline indicator ─────────────────────────────────────
    function _setOfflineUI(on) {
      var smsg = document.getElementById('smsg');
      var sdot = document.getElementById('sdot');
      if (on) {
        if (smsg) smsg.textContent = '\u26a1 Offline \u2014 perubahan tersimpan lokal';
        if (sdot) sdot.style.background = 'var(--or)';
      } else {
        if (sdot) { sdot.style.background = 'var(--gn)'; sdot.classList.remove('unsaved'); }
        var q = _qLoad();
        if (smsg) smsg.textContent = q.length > 0
          ? 'Online \u2014 memproses ' + q.length + ' operasi tertunda...'
          : 'Online \u2014 Supabase';
      }
    }

    // ── Thin wrapper: capture pending op sebelum call ─────────
    // op = { key, fn, retry }
    // fn()    = fungsi async yang melakukan save
    // retry() = fungsi async untuk re-execute saat flush
    async function _withQueue(op, fn) {
      // Cek offline
      if (!navigator.onLine) {
        _qAdd({ id: _uid(), key: op.key, type: op.type, payload: op.payload, ts: Date.now() });
        _setOfflineUI(true);
        try { toast('Offline \u2014 akan dikirim otomatis saat koneksi pulih', 'info'); } catch (e) {}
        return;
      }

      _errFlag = 0;
      try {
        await fn();
      } catch (e) {
        _errFlag = Date.now();
        try { _sbStatusErr(e.message); } catch (ee) {}
      }

      // Jika ada error (dari catch ATAU dari _sbStatusErr yang dipanggil internal)
      if (_hadErr() && op.payload) {
        _qAdd({ id: _uid(), key: op.key, type: op.type, payload: op.payload, ts: Date.now() });
        try { toast('\u26a0 Gagal simpan \u2014 akan dicoba ulang otomatis', 'error'); } catch (e) {}
      }
    }
    function _uid() { return Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

    // ── Flush queue → kirim ke Supabase ──────────────────────
    var _flushing = false;
    async function _flush() {
      if (_flushing || !navigator.onLine) return;
      var q = _qLoad();
      if (!q.length) return;

      _flushing = true;
      var smsg = document.getElementById('smsg');
      if (smsg) smsg.textContent = 'Mengirim ' + q.length + ' operasi tertunda...';

      var ok = 0, fail = 0;
      var client = (typeof _initSb === 'function') ? _initSb() : null;

      for (var i = 0; i < q.length; i++) {
        var op = q[i];
        try {
          await _execOp(op, client);
          _qRemove(op.id);
          ok++;
        } catch (e) {
          console.warn('[SQ flush fail]', op.type, e.message);
          fail++;
        }
      }
      _flushing = false;
      _uiBadge();

      if (ok > 0 && fail === 0) {
        try { toast(ok + ' operasi berhasil tersimpan ke Supabase \u2713'); } catch (e) {}
        if (typeof _sbStatusOk === 'function') _sbStatusOk();
      } else if (fail > 0) {
        try { toast(fail + ' operasi gagal \u2014 klik badge untuk coba lagi', 'error'); } catch (e) {}
      }
    }

    // ── Eksekusi satu operasi queue → langsung ke Supabase ───
    async function _execOp(op, client) {
      if (!client) throw new Error('No Supabase client');
      var p = op.payload;
      switch (op.type) {

        case 'patch': {
          var payload = Object.assign({}, p.fields, { updated_at: new Date().toISOString() });
          var r = await client.from(p.table).update(payload).eq('id', p.id);
          if (r.error) throw r.error;
          break;
        }
        case 'upsert': {
          var r2 = await client.from(p.table).upsert(p.row, { onConflict: 'id' });
          if (r2.error) throw r2.error;
          break;
        }
        case 'manpower': {
          var r3 = await client.from('manpower_logs').upsert(
            typeof unmapManpower === 'function' ? unmapManpower(p.entry) : p.entry,
            { onConflict: 'id' }
          );
          if (r3.error) throw r3.error;
          break;
        }
        case 'issue': {
          var r4 = await client.from('issues').upsert(
            typeof unmapIssue === 'function' ? unmapIssue(p.iss) : p.iss,
            { onConflict: 'id' }
          );
          if (r4.error) throw r4.error;
          break;
        }
        case 'procurement': {
          var r5 = await client.from('procurement').upsert(
            typeof unmapProcurement === 'function' ? unmapProcurement(p.proc) : p.proc,
            { onConflict: 'id' }
          );
          if (r5.error) throw r5.error;
          break;
        }
        case 'cost': {
          var r6 = await client.from('costs').upsert(
            typeof unmapCost === 'function' ? unmapCost(p.cost) : p.cost,
            { onConflict: 'id' }
          );
          if (r6.error) throw r6.error;
          break;
        }
        default:
          throw new Error('Unknown op type: ' + op.type);
      }
    }

    // ── Re-override save functions paling penting ─────────────

    // saveUpdate (progress — paling kritis)
    var _migSaveUpdate = window.saveUpdate;
    window.saveUpdate = async function () {
      var proj = P.find(function (x) { return x.id === selId; });
      var snap = proj ? {
        id: proj.id, plan: proj.plan, actual: proj.actual,
        status: proj.status, notes: proj.notes, mpActual: proj.mpActual
      } : null;
      await _withQueue(
        { key: 'upd|' + (snap && snap.id), type: 'patch',
          payload: snap ? { table: 'projects', id: snap.id, fields: {
            plan: snap.plan, actual: snap.actual, mp_actual: snap.mpActual || 0,
            status: snap.status, notes: snap.notes || null
          }} : null },
        function () { return _migSaveUpdate.apply(this, arguments); }.bind(this)
      );
    };

    // saveProj (project metadata)
    var _migSaveProj = window.saveProj;
    window.saveProj = async function () {
      await _withQueue(
        { key: 'proj|' + (typeof editProjId !== 'undefined' ? editProjId : '_new'),
          type: 'upsert',
          payload: null }, // payload di-capture setelah original berjalan di flush
        function () { return _migSaveProj.apply(this, arguments); }.bind(this)
      );
    };

    // saveMp (manpower — sering dipakai)
    var _migSaveMp = window.saveMp;
    window.saveMp = async function () {
      var projId = document.getElementById('mpProj') && document.getElementById('mpProj').value || '';
      var date = document.getElementById('mpDate') && document.getElementById('mpDate').value
                 || new Date().toISOString().slice(0, 10);
      await _withQueue(
        { key: 'mp|' + projId + '|' + date, type: 'manpower', payload: null },
        async function () {
          await _migSaveMp.apply(this, arguments);
          // Capture entry setelah original memprosesnya
          var entry = MPLOGS.find(function (m) {
            return String(m.projId) === String(projId) && m.date === date;
          });
          if (entry) {
            var q = _qLoad();
            var key = 'mp|' + projId + '|' + date;
            var item = q.find(function (x) { return x.key === key; });
            if (item && !item.payload.entry) {
              item.payload = { entry: entry };
              _qSave(q);
            }
          }
        }.bind(this)
      );
    };

    // saveIss (issues)
    var _migSaveIss = window.saveIss;
    window.saveIss = async function () {
      var prevId = typeof editIssId !== 'undefined' ? editIssId : null;
      await _withQueue(
        { key: 'iss|' + (prevId || '_new'), type: 'issue', payload: null },
        async function () {
          await _migSaveIss.apply(this, arguments);
          var iss = prevId ? ISS.find(function (x) { return String(x.id) === String(prevId); })
                           : ISS[ISS.length - 1];
          if (iss) {
            var q2 = _qLoad();
            var key2 = 'iss|' + (prevId || '_new');
            var item2 = q2.find(function (x) { return x.key === key2; });
            if (item2) { item2.payload = { iss: iss }; _qSave(q2); }
          }
        }.bind(this)
      );
    };

    // saveProc (procurement)
    var _migSaveProc = window.saveProc;
    window.saveProc = async function () {
      var prevId = typeof editProcId !== 'undefined' ? editProcId : null;
      await _withQueue(
        { key: 'proc|' + (prevId || '_new'), type: 'procurement', payload: null },
        async function () {
          await _migSaveProc.apply(this, arguments);
          var proc = prevId ? PROC.find(function (x) { return String(x.id) === String(prevId); })
                            : PROC[PROC.length - 1];
          if (proc) {
            var q3 = _qLoad();
            var key3 = 'proc|' + (prevId || '_new');
            var item3 = q3.find(function (x) { return x.key === key3; });
            if (item3) { item3.payload = { proc: proc }; _qSave(q3); }
          }
        }.bind(this)
      );
    };

    // saveCost (biaya)
    var _migSaveCost = window.saveCost;
    window.saveCost = async function () {
      var prevId = typeof editCostId !== 'undefined' ? editCostId : null;
      await _withQueue(
        { key: 'cost|' + (prevId || '_new'), type: 'cost', payload: null },
        async function () {
          await _migSaveCost.apply(this, arguments);
          var cost = prevId ? COSTS.find(function (x) { return String(x.id) === String(prevId); })
                            : COSTS[COSTS.length - 1];
          if (cost) {
            var q4 = _qLoad();
            var key4 = 'cost|' + (prevId || '_new');
            var item4 = q4.find(function (x) { return x.key === key4; });
            if (item4) { item4.payload = { cost: cost }; _qSave(q4); }
          }
        }.bind(this)
      );
    };

    // ── Online / offline events ───────────────────────────────
    window.addEventListener('offline', function () { _setOfflineUI(true); });
    window.addEventListener('online', function () {
      _setOfflineUI(false);
      setTimeout(_flush, 1000); // delay kecil agar koneksi stabil
    });

    // Saat halaman dimuat: cek status & flush jika ada pending
    if (!navigator.onLine) { _setOfflineUI(true); }
    setTimeout(function () {
      _uiBadge();
      if (navigator.onLine && _qLoad().length > 0) {
        var smsg = document.getElementById('smsg');
        if (smsg) smsg.textContent = 'Ditemukan ' + _qLoad().length + ' operasi tertunda dari sesi sebelumnya...';
        setTimeout(_flush, 1500);
      }
    }, 2500);

    // Expose untuk debugging via console
    window._sbQueue = {
      flush: _flush,
      list: _qLoad,
      clear: function () { _qClear(); toast('Queue dibersihkan'); }
    };

    console.log('\u2705 Retry queue + offline mode aktif');
  })();

})();
