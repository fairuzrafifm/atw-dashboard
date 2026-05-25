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
  'Submitted':          { c: 'var(--bl)', bg: 'rgba(59,130,246,.15)',  bd: 'rgba(59,130,246,.3)'  },
  'On Review':          { c: 'var(--yw)', bg: 'rgba(245,158,11,.15)',  bd: 'rgba(245,158,11,.3)'  },
  'Approved':           { c: 'var(--gn)', bg: 'rgba(16,185,129,.15)',  bd: 'rgba(16,185,129,.3)'  },
  'Approved with Note': { c: '#10b981',   bg: 'rgba(16,185,129,.1)',   bd: 'rgba(245,158,11,.4)'  },
  'Rejected':           { c: 'var(--rd)', bg: 'rgba(239,68,68,.15)',   bd: 'rgba(239,68,68,.3)'   },
  'WIP':                { c: 'var(--or)', bg: 'rgba(249,115,22,.15)',   bd: 'rgba(249,115,22,.3)'  },
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
    // Jika tabel belum ada (migration belum dijalankan), res.error berisi kode 42P01
    if (res.error) {
      var code = res.error.code || '';
      if (code === '42P01' || (res.error.message||'').includes('does not exist')) {
        // Tabel belum ada — diam saja, jangan crash
        console.info('[documents.js] Tabel documents belum ada. Jalankan documents_migration.sql di Supabase.');
      } else {
        console.warn('[documents.js] loadDocsFromSupabase:', res.error.message);
      }
      return;
    }
    DOCS = (res.data || []).map(mapDocument);
  } catch (e) {
    // Tangkap semua error agar tidak crash dashboard
    console.info('[documents.js] loadDocsFromSupabase (ignored):', e.message);
  }
}

// ── PATCH render(), loadFromSupabase(), _syncAllProjSelectors() ──
// Menggunakan polling agar aman terhadap urutan load script
(function _patchGlobals() {
  var _renderPatched = false;
  var _loadPatched   = false;
  var _syncPatched   = false;

  function _tryPatch() {
    // Patch render()
    if (!_renderPatched && typeof window.render === 'function') {
      var _origRender = window.render;
      window.render = function() {
        _origRender.apply(this, arguments);
        _syncDocProjDropdown();
        _updateDocKPI();
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

    // Patch _syncAllProjSelectors() — supaya docFiltProj ikut ter-sync saat klik sidebar
    if (!_syncPatched && typeof window._syncAllProjSelectors === 'function') {
      var _origSync = window._syncAllProjSelectors;
      window._syncAllProjSelectors = function(id) {
        _origSync.apply(this, arguments);
        _syncDocProjDropdown(String(id));
      };
      _syncPatched = true;
    }

    if (!_renderPatched || !_loadPatched || !_syncPatched) setTimeout(_tryPatch, 150);
  }

  setTimeout(_tryPatch, 0);
})();

// ── SYNC PROJECT DROPDOWN (filter bar) ───────────────────────────
// id opsional: jika diisi, set value ke id tsb; jika kosong, hanya rebuild opsi
function _syncDocProjDropdown(id) {
  var sel = document.getElementById('docFiltProj');
  if (!sel) return;

  var projects = typeof P !== 'undefined' ? P : [];

  // Jika P[] belum terisi, retry setelah 300ms
  if (!projects.length) {
    setTimeout(function() { _syncDocProjDropdown(id); }, 300);
    return;
  }

  // Rebuild options (selalu fresh agar list up-to-date)
  sel.innerHTML = '<option value="">Semua Project</option>' +
    projects.map(function(p) {
      return '<option value="' + p.id + '">' +
        (p.kode ? p.kode + ' \u2014 ' : '') + (p.nama || '') +
        '</option>';
    }).join('');

  // Hanya auto-sync ke sidebar jika user BELUM set filter manual
  if (!sel._docFiltManual) {
    var activeId = id || (typeof selId !== 'undefined' && selId ? String(selId) : '');
    if (activeId) sel.value = activeId;
  }

  // Juga sync modal project dropdown
  var mSel = document.getElementById('docModalProj');
  if (mSel) {
    var curVal = mSel.value;
    mSel.innerHTML = projects.map(function(p) {
      return '<option value="' + p.id + '">' +
        (p.kode ? p.kode + ' \u2014 ' : '') + (p.nama || '') +
        '</option>';
    }).join('');
    mSel.value = curVal || activeId || (projects[0] ? String(projects[0].id) : '');
  }
}

// ── UPDATE KPI PORTFOLIO OVERVIEW ───────────────────────────────
function _updateDocKPI() {
  var ovDoc  = document.getElementById('ovDoc');
  var ovDocS = document.getElementById('ovDocS');
  if (!ovDoc) return;
  var docs = typeof DOCS !== 'undefined' ? DOCS : [];
  var total = docs.length;

  // Pakai _countUp agar skel class otomatis terhapus
  if (typeof _countUp === 'function') {
    ovDoc.style.color = 'var(--pu)';
    _countUp(ovDoc, total, '', 600);
  } else {
    ovDoc.classList.remove('skel');
    ovDoc.textContent = total;
    ovDoc.style.color = 'var(--pu)';
  }

  if (ovDocS) {
    // Hitung semua status dari _DOC_STATUS_CFG
    var parts = _DOC_STATUS_KEYS.map(function(s) {
      var cnt = docs.filter(function(d) { return d.status === s; }).length;
      if (!cnt) return null;
      var cfg = _DOC_STATUS_CFG[s];
      // Singkat label agar muat di KPI kecil
      var lbl = s === 'Approved with Note' ? 'ApvNote'
               : s === 'Submitted'         ? 'Sub'
               : s === 'On Review'         ? 'Review'
               : s;
      return '<span style="color:' + cfg.c + '">' + lbl + ': ' + cnt + '</span>';
    }).filter(Boolean);

    // Juga tangkap status tidak dikenal (custom)
    docs.forEach(function(d) {
      if (d.status && !_DOC_STATUS_CFG[d.status]) {
        var found = parts.some(function(p) { return p.indexOf(d.status) !== -1; });
        if (!found) parts.push('<span style="color:var(--mt)">' + d.status + ': 1</span>');
      }
    });

    ovDocS.innerHTML = parts.join(' <span style="color:var(--bd)">·</span> ') || '<span style="color:var(--mt)">Belum ada data</span>';
  }
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

// ── KATEGORI COLOR MAP ────────────────────────────────────────────
var _KAT_COLORS = [
  {c:'var(--bl)', bg:'rgba(59,130,246,.1)',   bd:'rgba(59,130,246,.25)'},
  {c:'var(--gn)', bg:'rgba(16,185,129,.1)',   bd:'rgba(16,185,129,.25)'},
  {c:'var(--pu)', bg:'rgba(139,92,246,.1)',   bd:'rgba(139,92,246,.25)'},
  {c:'var(--or)', bg:'rgba(249,115,22,.1)',   bd:'rgba(249,115,22,.25)'},
  {c:'var(--yw)', bg:'rgba(245,158,11,.1)',   bd:'rgba(245,158,11,.25)'},
  {c:'var(--rd)', bg:'rgba(239,68,68,.1)',    bd:'rgba(239,68,68,.25)'},
  {c:'#06b6d4',  bg:'rgba(6,182,212,.1)',     bd:'rgba(6,182,212,.25)'},
  {c:'#f472b6',  bg:'rgba(244,114,182,.1)',   bd:'rgba(244,114,182,.25)'},
];
var _katColorMap = {};

function _katColor(kat) {
  if (!kat) return {c:'var(--mt)', bg:'var(--sf2)', bd:'var(--bd)'};
  if (!_katColorMap[kat]) {
    var idx = Object.keys(_katColorMap).length % _KAT_COLORS.length;
    _katColorMap[kat] = _KAT_COLORS[idx];
  }
  return _katColorMap[kat];
}

// ── SYNC KATEGORI FILTER DROPDOWN ────────────────────────────────
// Rebuild otomatis dari data DOCS yang sudah ada
function _syncDocKatFilter() {
  var sel = document.getElementById('docFiltKat');
  if (!sel) return;
  var docs = typeof DOCS !== 'undefined' ? DOCS : [];
  var existing = sel.value; // simpan pilihan aktif

  // Kumpulkan kategori unik dari data
  var cats = [];
  docs.forEach(function(d) {
    if (d.kategori && cats.indexOf(d.kategori) === -1) cats.push(d.kategori);
  });
  cats.sort();

  // Rebuild options
  sel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(function(c) {
      return '<option value="' + c + '"' + (c === existing ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
}

// ================================================================
//  RENDER TAB DOKUMEN
// ================================================================
function renderDocs() {
  _syncDocProjDropdown();
  _syncDocKatFilter();

  var projEl  = document.getElementById('docFiltProj');
  var projFilt = (projEl?.value || '');
  var katFilt  = (document.getElementById('docFiltKat')?.value  || '');
  var statFilt = (document.getElementById('docFiltStatus')?.value || '');
  var srch     = (document.getElementById('docSearch')?.value || '').toLowerCase().trim();

  // ── Filter ──
  var docs = (DOCS || []).filter(function(d) {
    if (projFilt && String(d.projId) !== String(projFilt)) return false;
    if (katFilt  && !(d.kategori || '').toLowerCase().includes(katFilt.toLowerCase())) return false;
    if (statFilt && d.status   !== statFilt)  return false;
    if (srch) {
      var txt = [d.namaDoc, d.nomorDoc, d.kategori, d.status, d.submittedBy, d.approvedBy, d.catatan]
                .join(' ').toLowerCase();
      if (txt.indexOf(srch) === -1) return false;
    }
    return true;
  });

  // ── Update KPI Portfolio Overview ──
  _updateDocKPI();

  // ── Summary badges ──
  var summaryEl = document.getElementById('docSummary');
  if (summaryEl) {
    var base = projFilt
      ? (DOCS||[]).filter(function(d){ return String(d.projId) === String(projFilt); })
      : (DOCS||[]);
    var cnt = {};
    _DOC_STATUS_KEYS.forEach(function(s){ cnt[s] = 0; });
    base.forEach(function(d){ if (cnt[d.status] !== undefined) cnt[d.status]++; });

    summaryEl.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:2px">' +
      _DOC_STATUS_KEYS.map(function(s) {
        var cfg = _DOC_STATUS_CFG[s];
        var isActive = statFilt === s;
        var ring = isActive ? 'box-shadow:0 0 0 2px ' + cfg.c + ';transform:translateY(-1px);' : '';
        return '<div onclick="document.getElementById(\'docFiltStatus\').value=(\'' + s + '\'===document.getElementById(\'docFiltStatus\').value?\'\':\'' + s + '\');renderDocs()" ' +
          'style="background:' + cfg.bg + ';border:1px solid ' + cfg.bd + ';border-radius:10px;padding:10px 18px;text-align:center;cursor:pointer;min-width:100px;transition:all .15s;' + ring + '">' +
          '<div style="font-family:var(--fd);font-size:28px;letter-spacing:1px;color:' + cfg.c + ';line-height:1">' + cnt[s] + '</div>' +
          '<div style="font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:' + cfg.c + ';opacity:.9;margin-top:4px;font-weight:700">' + s + '</div>' +
          (isActive ? '<div style="width:20px;height:2px;background:' + cfg.c + ';border-radius:1px;margin:5px auto 0"></div>' : '<div style="height:7px"></div>') +
          '</div>';
      }).join('') + '</div>';
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

  var rows = docs.map(function(d, i) {
    var cfg = _DOC_STATUS_CFG[d.status] || { c:'var(--mt)', bg:'rgba(100,116,139,.08)', bd:'rgba(100,116,139,.2)' };
    var katColor = _katColor(d.kategori);
    var linkHtml = d.linkDoc
      ? '<a href="' + safeStr(d.linkDoc) + '" target="_blank" rel="noopener noreferrer" title="Buka dokumen" ' +
        'style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;background:rgba(59,130,246,.12);color:var(--bl);text-decoration:none;font-size:13px;border:1px solid rgba(59,130,246,.25)">🔗</a>'
      : '';
    var proj = _docProjName(d.projId);
    return '<tr style="border-bottom:1px solid rgba(30,45,69,.4);transition:background .12s" ' +
      'onmouseover="this.style.background=\'rgba(59,130,246,.04)\'" ' +
      'onmouseout="this.style.background=\'\'">' +
      '<td style="width:24px;text-align:center;color:var(--mt);font-size:9px;font-family:var(--fm);padding:0 4px 0 10px">' + (i+1) + '</td>' +
      '<td style="white-space:nowrap"><span style="font-size:9px;font-weight:700;letter-spacing:.3px;padding:2px 7px;border-radius:4px;background:rgba(249,115,22,.1);color:var(--or);border:1px solid rgba(249,115,22,.2)">' + safeStr(proj) + '</span></td>' +
      '<td style="font-weight:600;max-width:220px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.namaDoc) + '">' + safeStr(d.namaDoc) + '</div>' +
      (d.catatan ? '<div style="font-size:9px;color:var(--mt);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.catatan) + '">' + safeStr(d.catatan) + '</div>' : '') +
      '</td>' +
      '<td style="font-family:var(--fm);font-size:10px;color:var(--bl);white-space:nowrap">' + safeStr(d.nomorDoc || '—') + '</td>' +
      '<td><span style="background:' + katColor.bg + ';color:' + katColor.c + ';border:1px solid ' + katColor.bd + ';border-radius:5px;padding:2px 8px;font-size:9px;font-weight:600;white-space:nowrap">' + safeStr(d.kategori || '—') + '</span></td>' +
      '<td style="text-align:center"><span style="font-size:9px;font-family:var(--fm);background:var(--sf2);color:var(--mt);padding:2px 6px;border-radius:4px">' + safeStr(d.revisi || '—') + '</span></td>' +
      '<td style="font-size:10px;white-space:nowrap;color:var(--mt)">' + _fmtDocDate(d.tglDoc) + '</td>' +
      '<td>' + _docBadge(d.status) + '</td>' +
      '<td style="font-size:10px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.submittedBy||'') + '">' + (d.submittedBy ? '<span style="color:var(--tx)">' + safeStr(d.submittedBy) + '</span>' : '<span style="color:var(--bd)">—</span>') + '</td>' +
      '<td style="font-size:10px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + safeStr(d.approvedBy||'') + '">' + (d.approvedBy ? '<span style="color:var(--gn)">' + safeStr(d.approvedBy) + '</span>' : '<span style="color:var(--bd)">—</span>') + '</td>' +
      '<td style="text-align:center">' + linkHtml + '</td>' +
      '<td style="text-align:right;padding-right:10px"><button class="btn btn-sm edit-only" style="padding:2px 9px;font-size:10px;border-color:var(--bd)" onclick="openDocModal(\'' + d.id + '\')">✏ Edit</button></td>' +
      '</tr>';
  }).join('');

  tableEl.innerHTML =
    '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
    '<thead><tr style="background:var(--sf2);border-bottom:2px solid var(--bd)">' +
    '<th style="width:24px;padding:8px 4px 8px 10px"></th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700;white-space:nowrap">Project</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700">Nama Dokumen</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700;white-space:nowrap">No. Dokumen</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700">Kategori</th>' +
    '<th style="padding:8px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700">Rev</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700">Tanggal</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700">Status</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700;white-space:nowrap">Submitted By</th>' +
    '<th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700;white-space:nowrap">Approved By</th>' +
    '<th style="padding:8px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--mt);font-weight:700">Link</th>' +
    '<th style="padding:8px 10px"></th>' +
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
    if (katFilt  && !(d.kategori || '').toLowerCase().includes(katFilt.toLowerCase())) return false;
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
