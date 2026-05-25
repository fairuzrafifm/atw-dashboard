// ============================================================
//  ATW Solar Dashboard — js/supabase.js
//  Supabase client, data loading, realtime, save helpers,
//  field mappers (map/unmap), presence, photos
//  Dipanggil setelah: supabase CDN, utils.js
//  Bergantung pada global: P, ISS, PROC, MPLOGS, ACCLOGS,
//    SCURVE, WBS, COSTS, RAB, genId, sanitize*, toast, render
// ============================================================
// ============================================================
//  ATW Solar Dashboard — Supabase Client
//  Ganti bagian GAS sync di index.html dengan kode ini
//  Versi: 1.0.0
// ============================================================

// ── 0. CONFIG — isi setelah buat project di supabase.com ──
// SUPABASE_URL sudah dideklarasikan di atas (var)
    var _SB_URL = 'https://mbdhnrhoqwljhtkavsrr.supabase.co';
var _SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZGhucmhvcXdsamh0a2F2c3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNjIzMDgsImV4cCI6MjA5NDczODMwOH0.N2mTpEcOkzPHYkLJMf9L5vIwZTjvZXUaOeMXcX9sJ_o';

// ── 1. INIT CLIENT ──
// Tambahkan di <head>:
// supabase-js@2 sudah dimuat di atas (lihat <head>)
let sb = null;
function _initSb(){
  if(sb) return sb;
  try{
    const { createClient } = supabase;
    var sbUrl = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : _SB_URL);
    var sbAnon = (typeof SUPABASE_ANON !== 'undefined' ? SUPABASE_ANON : _SB_ANON);
    sb = createClient(sbUrl, sbAnon);
  }catch(e){ console.warn('Supabase init error:',e); }
  return sb;
}
// init segera jika supabase sudah tersedia, jika tidak tunggu window load
if(typeof supabase !== 'undefined'){ _initSb(); }
else{ window.addEventListener('load', _initSb); }

// ── 2. AUTH ──────────────────────────────────────────────────

/** Login dengan email + password */
async function sbLogin(email, password) {
  const client = _initSb();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Logout */
async function sbLogout() {
  const client = _initSb();
  await client.auth.signOut();
}

/** Get role user yang sedang login */
async function sbGetRole() {
  const client = _initSb();
  const { data } = await client.from('user_profiles')
    .select('role')
    .eq('id', (await client.auth.getUser()).data.user?.id)
    .single();
  return data?.role || 'viewer';
}

/** Listen perubahan auth state */
function _initAuthListener(){
  const client = _initSb();
  if(!client) return;
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      loadFromSupabase();
    } else if (event === 'SIGNED_OUT') {
      document.getElementById('auth-screen')?.classList.remove('hidden');
    }
  });
}
window.addEventListener('load', _initAuthListener);

// ── 3. LOAD ALL DATA ─────────────────────────────────────────

async function loadFromSupabase() {
  const client = _initSb();
  if(!client){ toast('Supabase belum siap, coba lagi','error'); return; }
  try {
    toast('Memuat data dari server...', 'info');

    const [
      { data: projects },
      { data: history },
      { data: issues },
      { data: procurement },
      { data: manpowerLogs },
      { data: accidentLogs },
      { data: costs },
      { data: rab },
      { data: wbs },
      { data: scurve },
    ] = await Promise.all([
      (_initSb()).from('projects').select('*').order('created_at'),
      (_initSb()).from('project_history').select('*').order('date'),
      (_initSb()).from('issues').select('*').order('created_at', { ascending: false }),
      (_initSb()).from('procurement').select('*').order('created_at', { ascending: false }),
      (_initSb()).from('manpower_logs').select('*').order('date', { ascending: false }),
      (_initSb()).from('accident_logs').select('*').order('date', { ascending: false }),
      (_initSb()).from('costs').select('*').eq('_deleted', false).order('date', { ascending: false }),
      (_initSb()).from('rab').select('*').order('urutan'),
      (_initSb()).from('wbs').select('*').order('order'),
      (_initSb()).from('scurve').select('*').order('week'),
    ]);

    // Map dari snake_case Supabase → camelCase dashboard
    P       = (projects || []).map(mapProject);
    ISS     = (issues || []).map(mapIssue);
    PROC    = (procurement || []).map(mapProcurement);
    MPLOGS  = (manpowerLogs || []).map(mapManpower);
    ACCLOGS = (accidentLogs || []).map(mapAccident);
    COSTS   = (costs || []).map(mapCost);
    RAB     = (rab || []).map(mapRab);
    WBS     = (wbs || []).map(mapWbs);
    SCURVE  = (scurve || []).map(mapScurve);

    // Merge history ke masing-masing project
    (history || []).forEach(h => {
      const p = P.find(x => x.id === h.proj_id);
      if (p) {
        p.history = p.history || [];
        p.history.push({
          date: h.date, actual: h.actual, plan: h.plan,
          mp: h.mp, notes: h.notes, status: h.status
        });
      }
    });

    render();
    toast('Data berhasil dimuat ✓');
    sbSubscribeRealtime();           // start listening perubahan realtime

  } catch (err) {
    toast('Gagal load data: ' + err.message, 'error');
    console.error(err);
  }
}

// ── 4. REALTIME SUBSCRIPTION ─────────────────────────────────

let _realtimeChannel = null;

function sbSubscribeRealtime() {
  if (_realtimeChannel) _initSb().removeChannel(_realtimeChannel);

  _realtimeChannel = (_initSb()).channel('atw-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },
      payload => _handleRealtimeChange('projects', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' },
      payload => _handleRealtimeChange('issues', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'procurement' },
      payload => _handleRealtimeChange('procurement', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'costs' },
      payload => _handleRealtimeChange('costs', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manpower_logs' },
      payload => _handleRealtimeChange('manpower_logs', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accident_logs' },
      payload => _handleRealtimeChange('accident_logs', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wbs' },
      payload => _handleRealtimeChange('wbs', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scurve' },
      payload => _handleRealtimeChange('scurve', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' },
      payload => _handleRealtimeChange('photos', payload))
    .subscribe();
}

/** Handle perubahan realtime — update array lokal + re-render */
function _handleRealtimeChange(table, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  const tableMap = {
    projects:      { arr: () => P,       mapper: mapProject,     key: 'id' },
    issues:        { arr: () => ISS,      mapper: mapIssue,       key: 'id' },
    procurement:   { arr: () => PROC,     mapper: mapProcurement, key: 'id' },
    costs:         { arr: () => COSTS,    mapper: mapCost,        key: 'id' },
    manpower_logs: { arr: () => MPLOGS,   mapper: mapManpower,    key: 'id' },
    accident_logs: { arr: () => ACCLOGS,  mapper: mapAccident,    key: 'id' },
    wbs:           { arr: () => WBS,      mapper: mapWbs,         key: 'id' },
    scurve:        { arr: () => SCURVE,   mapper: mapScurve,      key: 'id' },
  };

  const cfg = tableMap[table];
  if (!cfg) return;

  const arr = cfg.arr();
  const mapped = cfg.mapper(newRow);

  if (eventType === 'INSERT') {
    if (!arr.find(x => x[cfg.key] === mapped[cfg.key])) {
      arr.push(mapped);
    }
  } else if (eventType === 'UPDATE') {
    const idx = arr.findIndex(x => x[cfg.key] === mapped[cfg.key]);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...mapped };
  } else if (eventType === 'DELETE') {
    const idx = arr.findIndex(x => x[cfg.key] === oldRow[cfg.key]);
    if (idx >= 0) arr.splice(idx, 1);
  }

  // Debounce render agar tidak flicker jika banyak event bersamaan
  clearTimeout(_realtimeRenderTimer);
  _realtimeRenderTimer = setTimeout(() => render(), 200);
}
let _realtimeRenderTimer = null;

// ── 5. UPSERT HELPERS (ganti gsSync / syncAllGS) ─────────────

/** Simpan/update satu project */
async function sbSaveProject(proj) {
  const row = unmapProject(proj);
  const { error } = await (_initSb()).from('projects').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

/** Simpan/update project_history entries */
async function sbSaveHistory(projId, historyArr) {
  if (!historyArr?.length) return;
  const rows = historyArr.map(h => ({
    proj_id: projId,
    date:    h.date,
    actual:  h.actual,
    plan:    h.plan,
    mp:      h.mp || 0,
    notes:   h.notes || '',
    status:  h.status || null,
  }));
  const { error } = await (_initSb()).from('project_history')
    .upsert(rows, { onConflict: 'proj_id,date', ignoreDuplicates: false });
  if (error) console.warn('history upsert:', error.message);
}

/** Simpan issue */
async function sbSaveIssue(iss) {
  const { error } = await (_initSb()).from('issues').upsert(unmapIssue(iss), { onConflict: 'id' });
  if (error) throw error;
}

/** Hapus issue */
async function sbDeleteIssue(id) {
  const { error } = await (_initSb()).from('issues').delete().eq('id', id);
  if (error) throw error;
}

/** Simpan procurement */
async function sbSaveProcurement(proc) {
  const { error } = await (_initSb()).from('procurement').upsert(unmapProcurement(proc), { onConflict: 'id' });
  if (error) throw error;
}

/** Simpan cost */
async function sbSaveCost(cost) {
  const { error } = await (_initSb()).from('costs').upsert(unmapCost(cost), { onConflict: 'id' });
  if (error) throw error;
}

/** Soft-delete cost */
async function sbDeleteCost(id) {
  const { error } = await (_initSb()).from('costs').update({ _deleted: true }).eq('id', id);
  if (error) throw error;
}

/** Simpan manpower log */
async function sbSaveManpower(mp) {
  const { error } = await (_initSb()).from('manpower_logs').upsert(unmapManpower(mp), { onConflict: 'id' });
  if (error) throw error;
}

/** Simpan accident log */
async function sbSaveAccident(acc) {
  const { error } = await (_initSb()).from('accident_logs').upsert(unmapAccident(acc), { onConflict: 'id' });
  if (error) throw error;
}

/** Simpan RAB (batch) */
async function sbSaveRab(rabArr) {
  if (!rabArr?.length) return;
  const { error } = await (_initSb()).from('rab').upsert(rabArr.map(unmapRab), { onConflict: 'id' });
  if (error) throw error;
}

/** Simpan WBS node */
async function sbSaveWbs(node) {
  const { error } = await (_initSb()).from('wbs').upsert(unmapWbs(node), { onConflict: 'id' });
  if (error) throw error;
}

/** Simpan S-Curve entry */
async function sbSaveScurve(entry) {
  const { error } = await (_initSb()).from('scurve').upsert(unmapScurve(entry), { onConflict: 'proj_id,week' });
  if (error) throw error;
}

// ── 6. PHOTOS ─────────────────────────────────────────────────

/** Upload foto ke Supabase Storage */
async function sbUploadPhoto(projId, file, caption = '') {
  const ext = file.name.split('.').pop();
  const path = `${projId}/${Date.now()}.${ext}`;

  const { error: upErr } = await (_initSb()).storage
    .from('project-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;

  const { data: { publicUrl } } = (_initSb()).storage
    .from('project-photos')
    .getPublicUrl(path);

  const { error: dbErr } = await (_initSb()).from('photos').insert({
    id: genId(), proj_id: projId, url: publicUrl, caption
  });
  if (dbErr) throw dbErr;

  return publicUrl;
}

/** Hapus foto */
async function sbDeletePhoto(photoId, url) {
  const path = url.split('/project-photos/')[1];
  await (_initSb()).storage.from('project-photos').remove([path]);
  await (_initSb()).from('photos').delete().eq('id', photoId);
}

// ── 7. PRESENCE (siapa sedang online/edit) ───────────────────

let _presenceChannel = null;
let _currentUser = null;

async function sbInitPresence() {
  const { data: { user } } = await (_initSb()).auth.getUser();
  _currentUser = user;

  const { data: profile } = await (_initSb()).from('user_profiles')
    .select('full_name, role').eq('id', user.id).single();

  _presenceChannel = (_initSb()).channel('presence-atw', {
    config: { presence: { key: user.id } }
  });

  _presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = _presenceChannel.presenceState();
      _renderOnlineUsers(Object.values(state).flat());
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _presenceChannel.track({
          userId:   user.id,
          name:     profile?.full_name || user.email,
          role:     profile?.role || 'viewer',
          editingProjId: null,        // update saat user buka project
        });
      }
    });
}

/** Update status "sedang edit project X" */
async function sbSetEditing(projId) {
  await _presenceChannel?.track({
    userId: _currentUser?.id,
    editingProjId: projId
  });
}

/** Render badge user online di UI */
function _renderOnlineUsers(users) {
  const el = document.getElementById('online-users');
  if (!el) return;
  el.innerHTML = users.map(u =>
    `<span class="online-badge" title="${u.name} (${u.role})"
      style="background:var(--bl);color:#fff;padding:2px 8px;
             border-radius:12px;font-size:11px;margin-right:4px">
      ${u.name?.split(' ')[0] || 'User'}
    </span>`
  ).join('');
}

// ── 8. FIELD MAPPERS (Supabase snake_case ↔ Dashboard camelCase) ──

function mapProject(r) {
  return {
    id: r.id, kode: r.kode, nama: r.nama, lokasi: r.lokasi,
    client: r.client, mulai: r.mulai, selesai: r.selesai,
    status: r.status, plan: r.plan, actual: r.actual,
    mpPlan: r.mp_plan, mdPlan: r.mp_plan, mhPlan: r.mh_plan,
    mpActual: r.mp_actual, weather: r.weather, notes: r.notes,
    logo: r.logo, picPm: r.pic_pm, picSm: r.pic_sm,
    picEng: r.pic_eng, picProc: r.pic_proc, history: []
  };
}
function unmapProject(p) {
  return {
    id: p.id, kode: p.kode, nama: p.nama, lokasi: p.lokasi,
    client: p.client, mulai: p.mulai || null, selesai: p.selesai || null,
    status: p.status, plan: p.plan, actual: p.actual,
    mp_plan: p.mpPlan || p.mdPlan || 0, mh_plan: p.mhPlan || 0,
    mp_actual: p.mpActual || 0, weather: p.weather, notes: p.notes,
    logo: p.logo, pic_pm: p.picPm, pic_sm: p.picSm,
    pic_eng: p.picEng, pic_proc: p.picProc
  };
}

function mapIssue(r) {
  return {
    id: r.id, projId: r.proj_id, tgl: r.tgl, uraian: r.uraian,
    prioritas: r.prioritas, kategori: r.kategori, pj: r.pj,
    due: r.due, status: r.status, done: r.done, action: r.action
  };
}
function unmapIssue(i) {
  return {
    id: i.id, proj_id: i.projId, tgl: i.tgl || null,
    uraian: i.uraian, prioritas: i.prioritas, kategori: i.kategori,
    pj: i.pj, due: i.due || null, status: i.status,
    done: i.done, action: i.action
  };
}

function mapProcurement(r) {
  return {
    id: r.id, projId: r.proj_id, item: r.item, kategori: r.kategori,
    qty: r.qty, satuan: r.satuan, due: r.due, supplier: r.supplier,
    harga: r.harga, status: r.status, notes: r.notes,
    rabKatId: r.rab_kat_id, rabItemId: r.rab_item_id
  };
}
function unmapProcurement(p) {
  return {
    id: p.id, proj_id: p.projId, item: p.item, kategori: p.kategori,
    qty: p.qty || 0, satuan: p.satuan, due: p.due || null,
    supplier: p.supplier, harga: p.harga || 0, status: p.status,
    notes: p.notes, rab_kat_id: p.rabKatId || null,
    rab_item_id: p.rabItemId || null
  };
}

function mapManpower(r) {
  return {
    id: r.id, projId: r.proj_id, date: r.date,
    activities: r.activities || [], spv: r.spv, mandor: r.mandor,
    installer: r.installer, tukang: r.tukang, helper: r.helper,
    safety: r.safety, total: r.total
  };
}
function unmapManpower(m) {
  return {
    id: m.id, proj_id: m.projId, date: m.date,
    activities: m.activities || [],
    spv: m.spv || 0, mandor: m.mandor || 0, installer: m.installer || 0,
    tukang: m.tukang || 0, helper: m.helper || 0,
    safety: m.safety || 0, total: m.total || 0
  };
}

function mapAccident(r) {
  return {
    id: r.id, projId: r.proj_id, date: r.date,
    fatality: r.fatality, lti: r.lti, minorInjury: r.minor_injury,
    medTreatment: r.med_treatment, propertyDamage: r.property_damage,
    fire: r.fire, traffic: r.traffic, environment: r.environment,
    nearMiss: r.near_miss, timeLost: r.time_lost, notes: r.notes
  };
}
function unmapAccident(a) {
  return {
    id: a.id, proj_id: a.projId, date: a.date,
    fatality: a.fatality || 0, lti: a.lti || 0,
    minor_injury: a.minorInjury || 0, med_treatment: a.medTreatment || 0,
    property_damage: a.propertyDamage || 0, fire: a.fire || 0,
    traffic: a.traffic || 0, environment: a.environment || 0,
    near_miss: a.nearMiss || 0, time_lost: a.timeLost || 0, notes: a.notes
  };
}

function mapCost(r) {
  return {
    id: r.id, projId: r.proj_id, date: r.date, type: r.type,
    kategori: r.kategori, deskripsi: r.deskripsi, amount: r.amount,
    paidBy: r.paid_by, notes: r.notes, ref: r.ref, status: r.status,
    rabKatId: r.rab_kat_id, rabItemId: r.rab_item_id, _deleted: r._deleted
  };
}
function unmapCost(c) {
  return {
    id: c.id, proj_id: c.projId, date: c.date, type: c.type,
    kategori: c.kategori, deskripsi: c.deskripsi, amount: c.amount,
    paid_by: c.paidBy, notes: c.notes, ref: c.ref, status: c.status,
    rab_kat_id: c.rabKatId || null, rab_item_id: c.rabItemId || null,
    _deleted: c._deleted || false
  };
}

function mapRab(r) {
  return {
    id: r.id, projId: r.proj_id, type: r.type, katId: r.kat_id,
    name: r.name, deskripsi: r.deskripsi, satuan: r.satuan,
    volume: r.volume, hargaSatuan: r.harga_satuan, total: r.total,
    notes: r.notes, urutan: r.urutan, isCustom: r.is_custom
  };
}
function unmapRab(r) {
  return {
    id: r.id, proj_id: r.projId, type: r.type, kat_id: r.katId || null,
    // Items (type='item') tidak punya field 'name' di JS — fallback ke deskripsi
    name: (r.name || r.deskripsi || '').slice(0,200),
    deskripsi: r.deskripsi || '', satuan: r.satuan || '',
    volume: r.volume || 0, harga_satuan: r.hargaSatuan || 0,
    notes: r.notes || '', urutan: r.urutan || 1, is_custom: r.isCustom !== false
  };
}

function mapWbs(r) {
  return {
    id: r.id, projId: r.proj_id, type: r.type,
    parentId: r.parent_id, name: r.name, bobot: r.bobot,
    order: r.order, cumPlan: r.cum_plan, cumActual: r.cum_actual,
    startDate: r.start_date, finishDate: r.finish_date,
    weeklyData: r.weekly_data || {}, weeklyPlan: r.weekly_plan || {},
    // Daily Report fields
    qtyPlan:   r.qty_plan   != null ? +r.qty_plan : 0,
    satuan:    r.satuan     || '',
    qtySatuan: r.satuan     || '',   // alias agar daily.js & wbs.js kompatibel
    dailyLogs: Array.isArray(r.daily_logs) ? r.daily_logs : (r.daily_logs ? JSON.parse(r.daily_logs) : [])
  };
}
function unmapWbs(w) {
  return {
    id: w.id, proj_id: w.projId, type: w.type,
    parent_id: w.parentId || null,
    name: (w.name || '(unnamed)').slice(0, 200),  // NOT NULL guard
    bobot: w.bobot || 0,
    order: w.order || 0, cum_plan: w.cumPlan || 0, cum_actual: w.cumActual || 0,
    start_date: w.startDate || null, finish_date: w.finishDate || null,
    weekly_data: w.weeklyData || {}, weekly_plan: w.weeklyPlan || {},
    // Daily Report fields — simpan ke Supabase
    qty_plan:   w.qtyPlan   != null ? +w.qtyPlan  : 0,
    satuan:     w.satuan    || w.qtySatuan || '',   // support dua alias
    daily_logs: w.dailyLogs || []
  };
}

function mapScurve(r) {
  return {
    id: r.id, projId: r.proj_id, week: r.week,
    wPlan: r.w_plan, wAct: r.w_act,
    cPlan: r.c_plan, cAct: r.c_act, dateStart: r.date_start
  };
}
function unmapScurve(s) {
  return {
    proj_id: s.projId, week: s.week,
    w_plan: s.wPlan, w_act: s.wAct,
    c_plan: s.cPlan, c_act: s.cAct, date_start: s.dateStart
  };
}

// ── 9. MIGRATION HELPER — import dari GSheet JSON ────────────
//  Panggil sekali dari console browser setelah login admin:
//  await migrateFromGSheet(window._gsExportData);

async function migrateFromGSheet(gsData) {
  console.log('🚀 Starting migration from GSheet data...');
  const errors = [];

  // Projects
  for (const p of gsData.projects || []) {
    try {
      await sbSaveProject(p);
      await sbSaveHistory(p.id, p.history || []);
    } catch (e) { errors.push(`project ${p.id}: ${e.message}`); }
  }
  console.log(`✓ Projects: ${gsData.projects?.length || 0}`);

  // Issues
  for (const x of gsData.issues || []) {
    try { await sbSaveIssue(x); } catch (e) { errors.push(`issue ${x.id}: ${e.message}`); }
  }
  console.log(`✓ Issues: ${gsData.issues?.length || 0}`);

  // Procurement
  for (const x of gsData.procurement || []) {
    try { await sbSaveProcurement(x); } catch (e) { errors.push(`proc ${x.id}: ${e.message}`); }
  }
  console.log(`✓ Procurement: ${gsData.procurement?.length || 0}`);

  // Manpower
  for (const x of gsData.manpowerLogs || []) {
    try { await sbSaveManpower(x); } catch (e) { errors.push(`mp ${x.id}: ${e.message}`); }
  }
  console.log(`✓ Manpower: ${gsData.manpowerLogs?.length || 0}`);

  // Accidents
  for (const x of gsData.accidentLogs || []) {
    try { await sbSaveAccident(x); } catch (e) { errors.push(`acc ${x.id}: ${e.message}`); }
  }
  console.log(`✓ Accidents: ${gsData.accidentLogs?.length || 0}`);

  // Costs
  for (const x of gsData.costs || []) {
    try { await sbSaveCost(x); } catch (e) { errors.push(`cost ${x.id}: ${e.message}`); }
  }
  console.log(`✓ Costs: ${gsData.costs?.length || 0}`);

  // RAB (batch)
  try { await sbSaveRab(gsData.rab || []); }
  catch (e) { errors.push(`rab: ${e.message}`); }
  console.log(`✓ RAB: ${gsData.rab?.length || 0}`);

  // WBS
  for (const x of gsData.wbs || []) {
    try { await sbSaveWbs(x); } catch (e) { errors.push(`wbs ${x.id}: ${e.message}`); }
  }
  console.log(`✓ WBS: ${gsData.wbs?.length || 0}`);

  // S-Curve
  for (const x of gsData.scurve || []) {
    try { await sbSaveScurve(x); } catch (e) { errors.push(`scurve ${x.id}: ${e.message}`); }
  }
  console.log(`✓ S-Curve: ${gsData.scurve?.length || 0}`);

  if (errors.length) {
    console.warn('⚠ Errors during migration:', errors);
  } else {
    console.log('🎉 Migration complete — no errors!');
  }
  return errors;
}
