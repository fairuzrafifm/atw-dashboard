// ============================================================
// ATW Dashboard — patch6.js
// Fitur: Clone Dokumen (Bulk — semua dokumen satu project)
//
// Pola identik dengan Clone RAB di cost-rab.js:
//   • Tombol "Clone Dokumen" di toolbar tab Dokumen
//   • Modal: pilih project SUMBER → preview → eksekusi
//   • Project TUJUAN = project yang aktif di filter docFiltProj
//   • Opsi: merge/replace + pertahankan/reset status
//
// HTML ditambahkan di index.html (ov-cloneDoc + tombol toolbar)
// Load order: SETELAH documents.js dan patch1-patch5
// ============================================================
(function () {
  'use strict';

  // ── OPEN MODAL ─────────────────────────────────────────────
  // Dibaca dari docFiltProj (project yang aktif di filter tab Dokumen)
  // Sama persis dengan openCloneRabModal() membaca rabFiltProj
  window.openCloneDocModal = function () {
    var destProjId = (document.getElementById('docFiltProj')?.value || '').trim();
    if (!destProjId) {
      if (typeof toast === 'function') toast('Pilih project tujuan di filter terlebih dahulu', 'warn');
      return;
    }

    var projects = typeof P !== 'undefined' ? P : [];
    var destProj = projects.find(function (p) { return String(p.id) === String(destProjId); });

    // Tampilkan nama project tujuan
    var destInfoEl = document.getElementById('cloneDocDestInfo');
    if (destInfoEl) {
      destInfoEl.textContent = destProj
        ? (destProj.kode ? destProj.kode + ' — ' : '') + (destProj.nama || '')
        : destProjId;
    }

    // Isi dropdown project SUMBER (kecuali project tujuan)
    var srcSel = document.getElementById('cloneDocSrc');
    if (srcSel) {
      srcSel.innerHTML = '<option value="">— Pilih Project Sumber —</option>' +
        projects
          .filter(function (p) { return String(p.id) !== String(destProjId); })
          .map(function (p) {
            return '<option value="' + p.id + '">' +
              (p.kode ? p.kode + ' — ' : '') + (p.nama || '') + '</option>';
          }).join('');
      srcSel.value = '';
    }

    // Reset opsi & preview
    var mergeEl = document.getElementById('cloneDocMerge');
    if (mergeEl) mergeEl.checked = false;
    var resetEl = document.getElementById('cloneDocResetStatus');
    if (resetEl) resetEl.checked = false;

    var prevEl = document.getElementById('cloneDocPreview');
    if (prevEl) prevEl.innerHTML = '<div style="color:var(--mt);font-style:italic">Pilih project sumber untuk melihat preview dokumen...</div>';

    // Simpan destId di modal
    var modal = document.getElementById('ov-cloneDoc');
    if (modal) modal.dataset.destId = destProjId;

    // Buka modal
    if (typeof show === 'function') show('ov-cloneDoc');
  };

  // ── PREVIEW saat project sumber berubah ────────────────────
  window._onCloneDocSrcChange = function () {
    var srcId = (document.getElementById('cloneDocSrc')?.value || '');
    var prevEl = document.getElementById('cloneDocPreview');
    if (!prevEl) return;

    if (!srcId) {
      prevEl.innerHTML = '<div style="color:var(--mt);font-style:italic">Pilih project sumber untuk melihat preview dokumen...</div>';
      return;
    }

    var docs = (typeof DOCS !== 'undefined' ? DOCS : [])
      .filter(function (d) { return String(d.projId) === String(srcId); });

    if (!docs.length) {
      prevEl.innerHTML = '<div style="color:var(--mt);font-style:italic">Belum ada dokumen di project ini.</div>';
      return;
    }

    // Hitung per status
    var statusCount = {};
    docs.forEach(function (d) {
      statusCount[d.status] = (statusCount[d.status] || 0) + 1;
    });

    var statusColors = {
      'Submitted': 'var(--bl)', 'On Review': 'var(--yw)', 'Approved': 'var(--gn)',
      'Approved with Note': '#10b981', 'Rejected': 'var(--rd)', 'WIP': 'var(--or)',
    };

    // Summary
    var summary = '<div style="color:var(--pu);font-weight:600;margin-bottom:8px">' +
      docs.length + ' dokumen akan di-clone:</div>';

    // Status breakdown chips
    var chips = Object.keys(statusCount).map(function (s) {
      var c = statusColors[s] || 'var(--mt)';
      return '<span style="background:rgba(0,0,0,.15);color:' + c + ';border:1px solid currentColor;' +
        'border-radius:4px;padding:1px 8px;font-size:9px;margin-right:4px">' +
        statusCount[s] + ' ' + s + '</span>';
    }).join('');

    // Doc list (max 8, lalu "dan X lainnya")
    var LIMIT = 8;
    var listItems = docs.slice(0, LIMIT).map(function (d) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px">' +
          (typeof safeStr === 'function' ? safeStr(d.namaDoc) : d.namaDoc) + '</span>' +
        '<span style="font-size:9px;color:var(--mt);flex-shrink:0">' + (d.kategori || '—') + '</span>' +
        '<span style="font-size:9px;flex-shrink:0;color:' + (statusColors[d.status] || 'var(--mt)') + '">' + (d.status || '') + '</span>' +
        '</div>';
    }).join('');

    var more = docs.length > LIMIT
      ? '<div style="color:var(--mt);font-size:10px;margin-top:4px">... dan ' + (docs.length - LIMIT) + ' dokumen lainnya</div>'
      : '';

    prevEl.innerHTML = summary +
      '<div style="margin-bottom:8px">' + chips + '</div>' +
      '<div style="font-size:10px">' + listItems + more + '</div>';
  };

  // ── EKSEKUSI CLONE ─────────────────────────────────────────
  window.executeCloneDocAll = async function () {
    var modal = document.getElementById('ov-cloneDoc');
    var destId = modal ? modal.dataset.destId : '';
    var srcId  = (document.getElementById('cloneDocSrc')?.value || '').trim();

    if (!srcId)  { if (typeof toast === 'function') toast('Pilih project sumber', 'error'); return; }
    if (!destId) { if (typeof toast === 'function') toast('Project tujuan tidak ditemukan', 'error'); return; }
    if (srcId === destId) { if (typeof toast === 'function') toast('Sumber dan tujuan tidak boleh sama', 'error'); return; }

    var merge       = !!document.getElementById('cloneDocMerge')?.checked;
    var resetStatus = !!document.getElementById('cloneDocResetStatus')?.checked;

    var srcDocs = (typeof DOCS !== 'undefined' ? DOCS : [])
      .filter(function (d) { return String(d.projId) === String(srcId); });

    if (!srcDocs.length) {
      if (typeof toast === 'function') toast('Tidak ada dokumen di project sumber', 'warn');
      return;
    }

    // Jika tidak merge → hapus dokumen lama di project tujuan
    if (!merge) {
      var existCount = (typeof DOCS !== 'undefined' ? DOCS : [])
        .filter(function (d) { return String(d.projId) === String(destId); }).length;
      if (existCount > 0) {
        var projects = typeof P !== 'undefined' ? P : [];
        var destProj = projects.find(function (p) { return String(p.id) === String(destId); });
        var destName = destProj ? (destProj.kode || destProj.nama) : destId;
        if (!confirm(existCount + ' dokumen existing di ' + destName + ' akan dihapus dan diganti.\nLanjutkan?')) return;
      }
    }

    // Disable tombol
    var btn = document.getElementById('btnExecCloneDoc');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyalin...'; }

    var newDocs = [];
    var errors  = [];

    try {
      // 1. Hapus dokumen lama di tujuan (jika bukan merge)
      if (!merge && typeof DOCS !== 'undefined') {
        var toDelete = DOCS.filter(function (d) { return String(d.projId) === String(destId); });
        // Hapus dari Supabase (fire-and-forget, jangan block UI)
        toDelete.forEach(function (d) {
          if (typeof sbDeleteDocument === 'function') {
            sbDeleteDocument(d.id).catch(function (e) {
              console.warn('[cloneDoc] delete error:', e.message);
            });
          }
        });
        // Hapus dari memory
        DOCS = DOCS.filter(function (d) { return String(d.projId) !== String(destId); });
      }

      // 2. Buat salinan dokumen
      srcDocs.forEach(function (src) {
        var newDoc = {
          id:          typeof genId === 'function' ? genId() : ('doc_' + Date.now() + Math.random()),
          projId:      destId,
          namaDoc:     src.namaDoc,
          nomorDoc:    src.nomorDoc    || '',
          kategori:    src.kategori    || '',
          revisi:      src.revisi      || '',
          tglDoc:      src.tglDoc      || null,
          status:      resetStatus ? 'Submitted' : (src.status || 'Submitted'),
          submittedBy: src.submittedBy || '',
          approvedBy:  resetStatus ? '' : (src.approvedBy || ''),
          catatan:     src.catatan     || '',
          linkDoc:     src.linkDoc     || '',
        };
        newDocs.push(newDoc);
      });

      // 3. Tambah ke memory sekaligus
      if (typeof DOCS !== 'undefined') {
        newDocs.forEach(function (d) { DOCS.push(d); });
      }

      // 4. Save ke Supabase (paralel, non-blocking per item)
      if (typeof sbSaveDocument === 'function') {
        var savePromises = newDocs.map(function (d) {
          return sbSaveDocument(d).catch(function (e) {
            errors.push(d.namaDoc + ': ' + e.message);
          });
        });
        await Promise.all(savePromises);
      }

      if (typeof dirty === 'function') dirty();

      // 5. Tutup modal
      if (typeof cm === 'function') cm('cloneDoc');

      // 6. Re-render tab dokumen
      if (typeof renderDocs === 'function') {
        // Set filter ke project tujuan agar hasil clone langsung terlihat
        var docFilt = document.getElementById('docFiltProj');
        if (docFilt) { docFilt.value = destId; docFilt._docFiltManual = true; }
        renderDocs();
      }

      // 7. Feedback
      var msg = '✓ ' + newDocs.length + ' dokumen berhasil di-clone';
      if (errors.length) msg += ' (' + errors.length + ' gagal disimpan ke server)';
      if (typeof toast === 'function') toast(msg, errors.length ? 'warn' : 'ok');
      if (errors.length) console.warn('[cloneDoc] Errors:', errors);

    } catch (err) {
      // Rollback memory jika ada error fatal
      if (newDocs.length && typeof DOCS !== 'undefined') {
        var newIds = new Set(newDocs.map(function (d) { return d.id; }));
        DOCS = DOCS.filter(function (d) { return !newIds.has(d.id); });
      }
      if (typeof toast === 'function') toast('Gagal clone: ' + (err.message || err), 'error');
      console.error('[cloneDoc]', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Clone Dokumen'; }
    }
  };

  // ── LOG ────────────────────────────────────────────────────
  console.log('[Patch6] Clone Dokumen (bulk) loaded ✓ — openCloneDocModal(), executeCloneDocAll()');

})();
