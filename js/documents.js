// ================================================================
// js/documents.js — ATW Solar Dashboard
// Tab Master Dokumen List: CRUD, filter, summary, export PDF
// Load order: setelah gantt.js, sebelum core.js
// Depends on: utils.js ($ gv cm genId safeStr show toast showConfirm dirty)
//             supabase.js (_initSb)
//             core.js (render) — di-patch dengan setTimeout agar aman
// ================================================================

// ── GLOBAL STATE ──────────────────────────────────────────────────
// Polyfill: deklarasi var agar aman jika core.js belum load
if (typeof DOCS === 'undefined') var DOCS = [];

// ── CONSTANTS ─────────────────────────────────────────────────────
var _DOC_STATUS_CFG = {
  'Submitted': { c: 'var(--bl)', bg: 'rgba(59,130,246,.15)',  bd: 'rgba(59,130,246,.3)'  },
  'On Review': { c: 'var(--yw)', bg: 'rgba(245,158,11,.15)',  bd: 'rgba(245,158,11,.3)'  },
  'Approved':  { c: 'var(--gn)', bg: 'rgba(16,185,129,.15)',  bd: 'rgba(16,185,129,.3)'  },
  'Rejected':  { c: 'var(--rd)', bg: 'rgba(239,68,68,.15)',   bd: 'rgba(239,68,68,.3)'   },
  'IFC':       { c: 'var(--pu)', bg: 'rgba(139,92,246,.15)',  bd: 'rgba(139,92,246,.3)'  },
};
var _DOC_STATUS_KEYS = Object.keys(_DOC_STATUS_CFG);
var _DOC_KATEGORI = [
  'Gambar Teknis','Izin','Kontrak','Shop Drawing',
  'As-Built','Laporan','Spesifikasi','Dokumen Lainnya'
];

var _editDocId = null;  // ID dokumen yang sedang diedit (null = tambah baru)

// ── SAFE SHOW HELPER (jika show() belum ada di utils.js) ──────────
if (typeof show !== 'function') {
  window.show = function(id) {
    var el = typeof $ === 'function' ? $(id) : document.getElementById(id);
    if (el) el.classList.add('open');
  };
}

// ── VALUE SET HELPER ──────────────────────────────────────────────
function _sv(id, val) {
  var el = typeof $ === 'function' ? $(id) : document.getElementById(id);
  if (el) el.value = (val !== undefined && val !== null) ? val : '';
}

// ── SUPABASE: MAP (row → JS object) ──────────────────────────────
function mapDocument(r) {
  return {
    id:          r.id,
    projId:      r.proj_id,
    namaDoc:     r.nama_doc,
    nomorDoc:    r.nomor_doc    || '',
    kategori:    r.kategori     || '',
    revisi:      r.revisi       || '',
    tglDoc:      r.tgl_doc      || null,
    status:      r.status       || 'Submitted',
    submittedBy: r.submitted_by || '',
    approvedBy:  r.approved_by  || '',
    catatan:     r.catatan      || '',
    linkDoc:     r.link_doc     || '',
  };
}

// ── SUPABASE: UNMAP (JS object → row) ────────────────────────────
function unmapDocument(d) {
  return {
    id:           d.id,
    proj_id:      d.projId,
    nama_doc:     d.namaDoc,
    nomor_doc:    d.nomorDoc    || null,
    kategori:     d.kategori    || null,
    revisi:       d.revisi      || null,
    tgl_doc:      d.tglDoc      || null,
    status:       d.status      || 'Submitted',
    submitted_by: d.submittedBy || null,
    approved_by:  d.approvedBy  || null,
    catatan:      d.catatan     || null,
    link_doc:     d.linkDoc     || null,
  };
}

// ── SUPABASE: SAVE (upsert) ───────────────────────────────────────
async function sbSaveDocument(doc) {
  var client = _initSb();
  if (!client) return;
  var res = await client.from('documents').upsert(unmapDocument(doc), { onConflict: 'id' });
  if (res.error) throw res.error;
}

// ── SUPABASE: DELETE ──────────────────────────────────────────────
async function sbDeleteDocument(id) {
  var client = _initSb();
  if (!client) return;
  var res = await client.from('documents').delete().eq('id', id);
  if (res.error) throw res.error;
}

// ── LOAD DOCS FROM SUPABASE ───────────────────────────────────────
async function loadDocsFromSupabase() {
  try {
    var client = _initSb();
    if (!client) return;
    var res = await client.from('documents').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    DOCS = (res.data || []).map(mapDocument);
  } catch (e) {
    console.warn('[documents.js] loadDocsFromSupabase:', e.message);
  }
}

// ── PATCH render() & loadFromSupabase() ──────────────────────────
// Menggunakan polling agar aman terhadap urutan load script
(function _patchGlobals() {
  var _renderPatched = false;
  var _loadPatched   = false;

  function _tryPatch() {
    // Patch render()
    if (!_renderPatched && typeof window.render === 'function') {
      var _origRender = window.render;
      window.render = function() {
        _origRender.apply(this, arguments);
        _syncDocProjDropdown();
        var tp = document.getElementById('tp-documents');
        if (tp && tp.classList.contains('active')) renderDocs();
      };
      _renderPatched = true;
    }

    // Patch loadFromSupabase()
    if (!_loadPatched && typeof window.loadFromSupabase === 'function') {
      var _origLoad = window.loadFromSupabase;
      window.loadFromSupabase = async function() {
        await _origLoad.apply(this, arguments);
        await loadDocsFromSupabase();
      };
      _loadPatched = true;
    }

    if (!_renderPatched || !_loadPatched) setTimeout(_tryPatch, 150);
  }

  setTimeout(_tryPatch, 0);
})();

// ── SYNC PROJECT DROPDOWN (filter bar) ───────────────────────────
function _syncDocProjDropdown() {
  var sel = document.getElementById('docFiltProj');
  if (!sel || sel.dataset.synced === '1') return;
  var projects = typeof P !== 'undefined' ? P : [];
  projects.forEach(function(p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p.kode ? p.kode + ' — ' : '') + (p.nama || '');
    sel.appendChild(o);
  });
  sel.dataset.synced = '1';
}

// ── STATUS BADGE ─────────────────────────────────────────────────
function _docBadge(status) {
  var cfg = _DOC_STATUS_CFG[status] || { c:'var(--mt)', bg:'rgba(100,116,139,.1)', bd:'rgba(100,116,139,.25)' };
  return '<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:.3px;background:' +
    cfg.bg + ';color:' + cfg.c + ';border:1px solid ' + cfg.bd + '">' + (status || '—') + '</span>';
}

// ── PROJECT NAME LOOKUP ───────────────────────────────────────────
function _docProjName(projId) {
  var projects = typeof P !== 'undefined' ? P : [];
  var p = projects.find(function(x) { return String(x.id) === String(projId); });
  return p ? (p.kode || p.nama || String(projId)) : String(projId || '—');
}

// ── FORMAT DATE ───────────────────────────────────────────────────
function _fmtDocDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); }
  catch(e) { return d; }
}

// ================================================================
//  RENDER TAB DOKUMEN
// ================================================================
function renderDocs() {
  _syncDocProjDropdown();

  var projFilt = (document.getElementById('docFiltProj')?.value || '');
  var katFilt  = (document.getElementById('docFiltKat')?.value  || '');
  var statFilt = (document.getElementById('docFiltStatus')?.value || '');
  var srch     = (document.getElementById('docSearch')?.value || '').toLowerCase().trim();

  // ── Filter ──
  var docs = (DOCS || []).filter(function(d) {
    if (projFilt && String(d.projId) !== String(projFilt)) return false;
    if (katFilt  && d.kategori !== katFilt)   return false;
    if (statFilt && d.status   !== statFilt)  return false;
    if (srch) {
      var txt = [d.namaDoc, d.nomorDoc, d.kategori, d.status, d.submittedBy, d.approvedBy, d.catatan]
                .join(' ').toLowerCase();
      if (txt.indexOf(srch) === -1) return false;
    }
    return true;
  });

  // ── Summary badges ──
  var summaryEl = document.getElementById('docSummary');
  if (summaryEl) {
    var base = projFilt
      ? (DOCS||[]).filter(function(d){ return String(d.projId) === String(projFilt); })
      : (DOCS||[]);
    var cnt = {};
    _DOC_STATUS_KEYS.forEach(function(s){ cnt[s] = 0; });
    base.forEach(function(d){ if (cnt[d.status] !== undefined) cnt[d.status]++; });

    summaryEl.innerHTML = _DOC_STATUS_KEYS.map(function(s) {
      var cfg = _DOC_STATUS_CFG[s];
      var active = statFilt === s ? 'box-shadow:0 0 0 2px ' + cfg.c + ';' : '';
      return '<div onclick="document.getElementById(\'docFiltStatus\').value=(\'' + s + '\'===document.getElementById(\'docFiltStatus\').value?\'\':\'' + s + '\');renderDocs()" ' +
        'style="background:' + cfg.bg + ';border:1px solid ' + cfg.bd + ';border-radius:8px;padding:9px 16px;text-align:center;cursor:pointer;min-width:95px;' + active + '">' +
        '<div style="font-family:var(--fd);font-size:24px;letter-spacing:1px;color:' + cfg.c + ';line-height:1">' + cnt[s] + '</div>' +
        '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:' + cfg.c + ';opacity:.85;margin-top:3px">' + s + '</div>' +
        '</div>';
    }).join('');
  }

  // ── Table ──
  var tableEl = document.getElementById('docTable');
  if (!tableEl) return;

  if (!docs.length) {
    tableEl.innerHTML = '<div class="empty" style="padding:36px">' +
      '<div style="font-size:32px;opacity:.2;margin-bottom:10px">📄</div>' +
      '<div style="font-size:13px;margin-bottom:5px">Belum ada dokumen' +
      (projFilt || katFilt || statFilt || srch ? ' yang sesuai filter.' : '.') + '</div>' +
      (!projFilt && !katFilt && !statFilt && !srch
        ? '<div style="font-size:11px;color:var(--mt)">Klik <b>＋ Tambah Dokumen</b> untuk mulai.</div>' : '') +
      '</div>';
    return;
  }

  var rows = docs.map(function(d) {
    var linkHtml = d.linkDoc
      ? '<a href="' + safeStr(d.linkDoc) + '" target="_blank" rel="noopener noreferrer" ' +
        'style="color:var(--bl);font-size:18px;text-decoration:none" title="' + safeStr(d.linkDoc) + '">🔗</a>'
      : '<span style="color:var(--bd)">—</span>';

    return '<tr>' +
      '<td style="color:var(--mt);font-size:10px;white-space:nowrap">' + safeStr(_docProjName(d.projId)) + '</td>' +
      '<td style="font-weight:600;max-width:210px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px" title="' + safeStr(d.namaDoc) + '">' + safeStr(d.namaDoc) + '</div></td>' +
      '<td style="font-family:var(--fm);font-size:10px;color:var(--mt);white-space:nowrap">' + safeStr(d.nomorDoc || '—') + '</td>' +
      '<td><span style="background:rgba(59,130,246,.1);color:var(--bl);border-radius:4px;padding:2px 8px;font-size:9px;font-weight:600;white-space:nowrap">' + safeStr(d.kategori || '—') + '</span></td>' +
      '<td style="text-align:center;font-size:10px;color:var(--mt)">' + safeStr(d.revisi || '—') + '</td>' +
      '<td style="font-size:10px;white-space:nowrap;color:var(--mt)">' + _fmtDocDate(d.tglDoc) + '</td>' +
      '<td>' + _docBadge(d.status) + '</td>' +
      '<td style="font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.submittedBy || '') + '">' + safeStr(d.submittedBy || '—') + '</td>' +
      '<td style="font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.approvedBy || '') + '">' + safeStr(d.approvedBy || '—') + '</td>' +
      '<td style="font-size:10px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.catatan || '') + '">' + safeStr(d.catatan || '—') + '</td>' +
      '<td style="text-align:center">' + linkHtml + '</td>' +
      '<td><button class="btn btn-sm edit-only" style="padding:2px 7px" onclick="openDocModal(\'' + d.id + '\')">✏</button></td>' +
      '</tr>';
  }).join('');

  tableEl.innerHTML =
    '<table class="tbl" style="min-width:1150px;table-layout:auto">' +
    '<thead><tr>' +
    '<th>Project</th>' +
    '<th>Nama Dokumen</th>' +
    '<th>No. Dokumen</th>' +
    '<th>Kategori</th>' +
    '<th style="text-align:center">Rev</th>' +
    '<th>Tanggal</th>' +
    '<th>Status</th>' +
    '<th>Submitted By</th>' +
    '<th>Approved By</th>' +
    '<th>Catatan</th>' +
    '<th style="text-align:center">Link</th>' +
    '<th></th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>';
}

// ================================================================
//  OPEN MODAL (add / edit)
// ================================================================
function openDocModal(id) {
  id = id || null;
  _editDocId = id;
  var isEdit = !!id;
  var d = isEdit ? (DOCS || []).find(function(x) { return x.id === id; }) : null;

  // Title & buttons
  document.getElementById('docMT').textContent = isEdit ? 'EDIT DOKUMEN' : 'TAMBAH DOKUMEN';
  document.getElementById('btnDelDoc').style.display = isEdit ? 'inline-flex' : 'none';
  document.getElementById('btnSaveDoc').textContent  = isEdit ? '💾 Simpan' : '＋ Tambah';

  // Populate project select
  var pSel = document.getElementById('docModalProj');
  pSel.innerHTML = '<option value="">— Pilih Project —</option>';
  var projects = typeof P !== 'undefined' ? P : [];
  projects.forEach(function(p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p.kode ? p.kode + ' — ' : '') + (p.nama || '');
    if (d && String(p.id) === String(d.projId)) o.selected = true;
    pSel.appendChild(o);
  });

  // Fill fields
  if (d) {
    _sv('docModalNama',      d.namaDoc);
    _sv('docModalNomor',     d.nomorDoc);
    _sv('docModalKat',       d.kategori    || _DOC_KATEGORI[0]);
    _sv('docModalRevisi',    d.revisi);
    _sv('docModalTgl',       d.tglDoc      || '');
    _sv('docModalStatus',    d.status      || 'Submitted');
    _sv('docModalSubmitBy',  d.submittedBy);
    _sv('docModalApproveBy', d.approvedBy);
    _sv('docModalCatatan',   d.catatan);
    _sv('docModalLink',      d.linkDoc);
  } else {
    _sv('docModalNama',      '');
    _sv('docModalNomor',     '');
    _sv('docModalKat',       _DOC_KATEGORI[0]);
    _sv('docModalRevisi',    'Rev 0');
    _sv('docModalTgl',       new Date().toISOString().slice(0, 10));
    _sv('docModalStatus',    'Submitted');
    _sv('docModalSubmitBy',  '');
    _sv('docModalApproveBy', '');
    _sv('docModalCatatan',   '');
    _sv('docModalLink',      '');
  }

  show('ov-addDoc');
}

// ================================================================
//  SAVE DOCUMENT
// ================================================================
async function saveDoc() {
  var projId = (document.getElementById('docModalProj')?.value || '').trim();
  var nama   = (document.getElementById('docModalNama')?.value  || '').trim();

  if (!projId) { toast('Pilih project terlebih dahulu', 'error'); return; }
  if (!nama)   { toast('Nama dokumen wajib diisi', 'error'); return; }

  var d = {
    id:          _editDocId || genId(),
    projId:      projId,
    namaDoc:     nama,
    nomorDoc:    (document.getElementById('docModalNomor')?.value     || '').trim(),
    kategori:    (document.getElementById('docModalKat')?.value       || ''),
    revisi:      (document.getElementById('docModalRevisi')?.value    || '').trim(),
    tglDoc:      (document.getElementById('docModalTgl')?.value       || null),
    status:      (document.getElementById('docModalStatus')?.value    || 'Submitted'),
    submittedBy: (document.getElementById('docModalSubmitBy')?.value  || '').trim(),
    approvedBy:  (document.getElementById('docModalApproveBy')?.value || '').trim(),
    catatan:     (document.getElementById('docModalCatatan')?.value   || '').trim(),
    linkDoc:     (document.getElementById('docModalLink')?.value      || '').trim(),
  };
  if (!d.tglDoc) d.tglDoc = null;

  if (_editDocId) {
    var idx = (DOCS || []).findIndex(function(x) { return x.id === _editDocId; });
    if (idx >= 0) DOCS[idx] = d; else DOCS.push(d);
    toast('Dokumen diupdate ✓');
  } else {
    if (typeof DOCS === 'undefined') window.DOCS = [];
    DOCS.push(d);
    toast('Dokumen ditambahkan ✓');
  }

  // Sync Supabase (non-blocking)
  sbSaveDocument(d).catch(function(e) {
    toast('Supabase sync gagal: ' + (e.message || e), 'warn');
  });

  if (typeof dirty === 'function') dirty();
  cm('addDoc');
  renderDocs();
}

// ================================================================
//  DELETE DOCUMENT
// ================================================================
function delDoc() {
  if (!_editDocId) return;
  var idToDelete = _editDocId;
  showConfirm('Hapus dokumen ini? Tindakan ini tidak bisa dibatalkan.', function() {
    var idx = (DOCS || []).findIndex(function(x) { return x.id === idToDelete; });
    if (idx >= 0) DOCS.splice(idx, 1);

    sbDeleteDocument(idToDelete).catch(function(e) {
      toast('Supabase sync gagal: ' + (e.message || e), 'warn');
    });

    if (typeof dirty === 'function') dirty();
    cm('addDoc');
    renderDocs();
    toast('Dokumen dihapus', 'warn');
  });
}

// ================================================================
//  EXPORT PDF (landscape A4)
// ================================================================
function exportDocsPDF() {
  var projFilt = (document.getElementById('docFiltProj')?.value  || '');
  var katFilt  = (document.getElementById('docFiltKat')?.value   || '');
  var statFilt = (document.getElementById('docFiltStatus')?.value || '');
  var srch     = (document.getElementById('docSearch')?.value    || '').toLowerCase().trim();

  var docs = (DOCS || []).filter(function(d) {
    if (projFilt && String(d.projId) !== String(projFilt)) return false;
    if (katFilt  && d.kategori !== katFilt)   return false;
    if (statFilt && d.status   !== statFilt)  return false;
    if (srch) {
      var txt = [d.namaDoc, d.nomorDoc, d.kategori, d.status, d.submittedBy, d.approvedBy, d.catatan]
                .join(' ').toLowerCase();
      if (txt.indexOf(srch) === -1) return false;
    }
    return true;
  });

  if (!docs.length) {
    toast('Tidak ada dokumen untuk diekspor', 'warn');
    return;
  }

  var now       = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
  var titleProj = projFilt ? _docProjName(projFilt) : 'Semua Project';
  var logoB64   = (typeof ATW_LOGO_B64 !== 'undefined') ? ATW_LOGO_B64 : '';

  // Print-safe status badge (no CSS vars)
  var _pBadge = function(s) {
    var clr = { Approved:['#dcfce7','#16a34a'], Rejected:['#fee2e2','#dc2626'],
                'On Review':['#fef3c7','#d97706'], Submitted:['#dbeafe','#2563eb'],
                IFC:['#ede9fe','#7c3aed'] };
    var v = clr[s] || ['#f1f5f9','#64748b'];
    return '<span style="background:' + v[0] + ';color:' + v[1] + ';padding:2px 10px;border-radius:12px;font-size:9px;font-weight:700">' + (s || '—') + '</span>';
  };

  var rows = docs.map(function(d) {
    return '<tr>' +
      '<td>' + safeStr(_docProjName(d.projId)) + '</td>' +
      '<td><b>' + safeStr(d.namaDoc) + '</b></td>' +
      '<td style="font-family:monospace;font-size:10px">' + safeStr(d.nomorDoc || '—') + '</td>' +
      '<td>' + safeStr(d.kategori || '—') + '</td>' +
      '<td style="text-align:center">' + safeStr(d.revisi || '—') + '</td>' +
      '<td style="white-space:nowrap">' + _fmtDocDate(d.tglDoc) + '</td>' +
      '<td>' + _pBadge(d.status) + '</td>' +
      '<td>' + safeStr(d.submittedBy || '—') + '</td>' +
      '<td>' + safeStr(d.approvedBy  || '—') + '</td>' +
      '<td>' + (d.linkDoc
        ? '<a href="' + safeStr(d.linkDoc) + '" style="color:#2563eb">🔗 Buka</a>'
        : '—') + '</td>' +
      '<td style="font-size:10px">' + safeStr(d.catatan || '—') + '</td>' +
      '</tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>Master Dokumen — ATW Solar</title><style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:"Segoe UI",Arial,sans-serif;color:#1e293b;font-size:11px;padding:16px 24px}' +
    '.hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #f97316;padding-bottom:12px;margin-bottom:16px}' +
    '.hdr-l{display:flex;align-items:center;gap:12px}' +
    '.hdr-l img{height:38px;object-fit:contain}' +
    '.company{font-size:16px;font-weight:800;color:#f97316;letter-spacing:1px}' +
    '.subtitle{font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:1.5px}' +
    '.meta{text-align:right;font-size:10px;color:#64748b;line-height:2}' +
    '.meta b{color:#1e293b}' +
    '.sec{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f97316;border-bottom:1px solid #fed7aa;padding-bottom:4px;margin:12px 0 9px}' +
    'table{width:100%;border-collapse:collapse;font-size:10px}' +
    'th{background:#f1f5f9;color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.5px;padding:5px 7px;border-bottom:2px solid #e2e8f0;text-align:left;white-space:nowrap}' +
    'td{padding:4px 7px;border-bottom:1px solid #f1f5f9;vertical-align:top}' +
    'tr:nth-child(even) td{background:#f8fafc}' +
    '.footer{margin-top:10px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:7px}' +
    '@page{size:A4 landscape;margin:12mm}' +
    '</style></head><body>' +
    '<div class="hdr">' +
    '<div class="hdr-l">' +
    (logoB64 ? '<img src="' + logoB64 + '" onerror="this.style.display=\'none\'">' : '') +
    '<div><div class="company">ATW SOLAR</div><div class="subtitle">Master Dokumen List</div></div>' +
    '</div>' +
    '<div class="meta">' +
    '<b>Project:</b> ' + safeStr(titleProj) + '<br>' +
    '<b>Tanggal Cetak:</b> ' + now + '<br>' +
    '<b>Total Dokumen:</b> ' + docs.length +
    '</div>' +
    '</div>' +
    '<div class="sec">Daftar Dokumen</div>' +
    '<table><thead><tr>' +
    '<th>Project</th><th>Nama Dokumen</th><th>No. Dokumen</th>' +
    '<th>Kategori</th><th>Rev</th><th>Tanggal</th>' +
    '<th>Status</th><th>Submitted By</th><th>Approved By</th>' +
    '<th>Link</th><th>Catatan</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="footer">ATW Solar Dashboard · Dicetak ' + now + ' · Hanya untuk penggunaan internal</div>' +
    '</body></html>';

  var w = window.open('', '_blank');
  if (!w) {
    toast('Pop-up diblokir browser. Izinkan pop-up dari halaman ini untuk ekspor PDF.', 'warn');
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(function() {
    try { w.focus(); w.print(); } catch(e) {}
  }, 500);
}
