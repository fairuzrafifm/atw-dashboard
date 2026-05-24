
  // ============================================================
// ATW Dashboard - Feature Patch
// Tambahkan kode ini SEBELUM tag </body> di index.html
// Fitur: Registrasi + Admin Approval + Edit Lock & Notifikasi
// ============================================================
(function () {
  'use strict';

  const LOCK_MINUTES = 5;
  let _patchUserId = null;
  let _patchUserName = '';
  let _lockChannel = null;
  let _activeLocks = new Map();

  // ── HELPER ────────────────────────────────────────────────
  function toast(msg, isErr) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.cssText = 'display:block;opacity:1;background:' + (isErr ? 'var(--rd)' : 'var(--gn)');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.style.display = 'none', 300); }, 3000);
  }

  function getSb() { return (typeof sb !== 'undefined' ? sb : null) || window.sb || null; }

  // ── HALAMAN REGISTRASI ────────────────────────────────────
  function injectRegisterLink() {
    if (document.getElementById('_patchRegLink')) return;
    const authBtn = document.getElementById('authBtn');
    if (!authBtn) return;

    const wrap = document.createElement('div');
    wrap.id = '_patchRegLink';
    wrap.style.cssText = 'text-align:center;margin-top:14px;font-size:12px;color:var(--mt)';
    wrap.innerHTML = 'Belum punya akun? <a href="#" style="color:var(--or);text-decoration:none" id="_btnGoRegister">Daftar di sini</a>';
    authBtn.closest('div').appendChild(wrap);

    document.getElementById('_btnGoRegister').onclick = function (e) {
      e.preventDefault();
      showRegModal();
    };
  }

  function showRegModal() {
    if (document.getElementById('_regModal')) {
      document.getElementById('_regModal').style.display = 'flex';
      return;
    }
    const m = document.createElement('div');
    m.id = '_regModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999999';
    m.innerHTML = `
      <div style="background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:28px 24px;width:360px;max-width:92vw">
        <h3 style="font-family:var(--fd);letter-spacing:2px;font-size:15px;margin-bottom:18px">DAFTAR AKUN</h3>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:4px">Nama Lengkap</div>
          <input id="_rName" type="text" class="fi" placeholder="Nama Anda" style="width:100%">
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:4px">Email</div>
          <input id="_rEmail" type="email" class="fi" placeholder="email@perusahaan.com" style="width:100%">
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:4px">Password (min. 8 karakter)</div>
          <input id="_rPass" type="password" class="fi" placeholder="••••••••" style="width:100%">
        </div>
        <div style="margin-bottom:18px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:4px">Role yang Diminta</div>
          <select id="_rRole" class="fi" style="width:100%">
            <option value="editor">Editor — bisa tambah & edit data</option>
            <option value="viewer">Viewer — hanya lihat</option>
          </select>
        </div>
        <div id="_rErr" style="display:none;background:rgba(239,68,68,.1);border:1px solid var(--rd);border-radius:6px;padding:8px 12px;font-size:11px;color:var(--rd);margin-bottom:10px"></div>
        <div id="_rOk"  style="display:none;background:rgba(16,185,129,.1);border:1px solid var(--gn);border-radius:6px;padding:8px 12px;font-size:11px;color:var(--gn);margin-bottom:10px"></div>
        <div style="display:flex;gap:8px">
          <button id="_rBtn" class="btn bp" style="flex:1" onclick="_patchRegister()">Daftar →</button>
          <button class="btn" onclick="document.getElementById('_regModal').style.display='none'">Batal</button>
        </div>
        <p style="font-size:10px;color:var(--mt);margin-top:12px;text-align:center">Akun aktif setelah disetujui admin ✓</p>
      </div>`;
    document.body.appendChild(m);
  }

  window._patchRegister = async function () {
    const name  = (document.getElementById('_rName').value || '').trim();
    const email = (document.getElementById('_rEmail').value || '').trim();
    const pass  = document.getElementById('_rPass').value || '';
    const role  = document.getElementById('_rRole').value;
    const errEl = document.getElementById('_rErr');
    const okEl  = document.getElementById('_rOk');
    const btn   = document.getElementById('_rBtn');

    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    if (!name)        { errEl.textContent = 'Nama tidak boleh kosong';    errEl.style.display = 'block'; return; }
    if (!email)       { errEl.textContent = 'Email tidak boleh kosong';   errEl.style.display = 'block'; return; }
    if (pass.length < 8) { errEl.textContent = 'Password minimal 8 karakter'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Mendaftar...';

    try {
      const { createClient } = supabase;
      const cl = createClient(SUPABASE_URL, SUPABASE_ANON);
      const { data, error } = await cl.auth.signUp({
        email, password: pass,
        options: { data: { full_name: name, requested_role: role } }
      });
      if (error) throw error;

      // Buat user_profiles manual jika trigger belum ada
      if (data.user) {
        await cl.from('user_profiles').upsert({
          id: data.user.id, email, full_name: name,
          role: 'pending', requested_role: role
        });
      }

      okEl.textContent = '✓ Berhasil! Tunggu persetujuan admin sebelum bisa login.';
      okEl.style.display = 'block';
      btn.textContent = 'Terkirim ✓';
    } catch (e) {
      errEl.textContent = 'Gagal: ' + (e.message || 'Error tidak diketahui');
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Daftar →';
    }
  };

  // ── PANEL KELOLA USER (Admin) ─────────────────────────────
  window.showUserPanel = async function () {
    if (typeof currentRole === 'undefined' || currentRole !== 'admin') {
      toast('Hanya admin yang bisa mengakses fitur ini', true);
      return;
    }
    let m = document.getElementById('_userPanel');
    if (!m) {
      m = document.createElement('div');
      m.id = '_userPanel';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999999';
      m.innerHTML = `
        <div style="background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:24px;width:580px;max-width:95vw;max-height:85vh;overflow-y:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <h3 style="font-family:var(--fd);letter-spacing:2px;font-size:15px">KELOLA USER</h3>
            <button class="btn btn-sm" onclick="document.getElementById('_userPanel').style.display='none'">✕</button>
          </div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:8px">⏳ Menunggu Persetujuan</div>
          <div id="_pendingList" style="margin-bottom:18px">Memuat...</div>
          <hr style="border-color:var(--bd);margin:14px 0">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:8px">👥 User Aktif</div>
          <div id="_activeList">Memuat...</div>
        </div>`;
      document.body.appendChild(m);
    }
    m.style.display = 'flex';
    _loadUsers();
  };

  async function _loadUsers() {
    const client = (typeof sb !== 'undefined' ? sb : null) || window.sb;
    if (!client) {
      const pEl = document.getElementById('_pendingList');
      if (pEl) pEl.innerHTML = '<div style="color:var(--rd);font-size:12px">Error: Supabase tidak tersedia</div>';
      return;
    }
    const pEl = document.getElementById('_pendingList');
    const aEl = document.getElementById('_activeList');

    try {
      const [{ data: pending }, { data: active }] = await Promise.all([
        client.from('user_profiles').select('*').eq('role', 'pending').order('created_at', { ascending: false }),
        client.from('user_profiles').select('*').neq('role', 'pending').order('created_at', { ascending: false })
      ]);

      pEl.innerHTML = (pending && pending.length)
        ? pending.map(u => `
          <div style="background:var(--sf2);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500">${u.full_name || '—'}</div>
              <div style="font-size:11px;color:var(--mt)">${u.email} · minta: <b style="color:var(--bl)">${u.requested_role || 'editor'}</b></div>
            </div>
            <button class="btn btn-sm bg" onclick="_patchApprove('${u.id}','${u.requested_role||'editor'}')">✓ Setuju</button>
            <button class="btn btn-sm brd" onclick="_patchReject('${u.id}')">✕ Tolak</button>
          </div>`).join('')
        : '<div style="font-size:12px;color:var(--mt);padding:6px">Tidak ada pendaftaran baru ✓</div>';

      aEl.innerHTML = (active && active.length)
        ? active.map(u => `
          <div style="background:var(--sf2);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500">${u.full_name || '—'}</div>
              <div style="font-size:11px;color:var(--mt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email}</div>
            </div>
            <span style="font-size:10px;padding:2px 8px;border-radius:10px;flex-shrink:0;background:${u.role==='admin'?'rgba(139,92,246,.15)':u.role==='editor'?'rgba(59,130,246,.15)':'rgba(16,185,129,.15)'};color:${u.role==='admin'?'var(--pu)':u.role==='editor'?'var(--bl)':'var(--gn)'}">${u.role}</span>
            <select class="fi" style="font-size:11px;padding:3px 6px;flex-shrink:0" onchange="_patchChangeRole('${u.id}',this.value)">
              <option value="admin"  ${u.role==='admin' ?'selected':''}>Admin</option>
              <option value="editor" ${u.role==='editor'?'selected':''}>Editor</option>
              <option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option>
            </select>
          </div>`).join('')
        : '<div style="font-size:12px;color:var(--mt);padding:6px">Belum ada user aktif</div>';

    } catch (e) {
      pEl.innerHTML = '<div style="color:var(--rd);font-size:12px">Error: ' + e.message + '</div>';
    }
  }

  window._patchApprove = async function (uid, role) {
    const sb = getSb(); if (!sb) return;
    const { error } = await sb.from('user_profiles').update({ role }).eq('id', uid);
    if (!error) { toast('User disetujui sebagai ' + role); _loadUsers(); _checkPendingBadge(); }
    else toast('Gagal: ' + error.message, true);
  };

  window._patchReject = async function (uid) {
    if (!confirm('Yakin tolak pendaftaran ini?')) return;
    const sb = getSb(); if (!sb) return;
    const { error } = await sb.from('user_profiles').delete().eq('id', uid);
    if (!error) { toast('Pendaftaran ditolak'); _loadUsers(); _checkPendingBadge(); }
    else toast('Gagal: ' + error.message, true);
  };

  window._patchChangeRole = async function (uid, newRole) {
    const sb = getSb(); if (!sb) return;
    const { error } = await sb.from('user_profiles').update({ role: newRole }).eq('id', uid);
    if (!error) toast('Role diubah ke ' + newRole);
    else toast('Gagal mengubah role', true);
  };

  // ── BADGE NOTIF PENDING ───────────────────────────────────
  async function _checkPendingBadge() {
    const sb = getSb();
    if (!sb || typeof currentRole === 'undefined' || currentRole !== 'admin') return;
    try {
      const { count } = await sb.from('user_profiles')
        .select('*', { count: 'exact', head: true }).eq('role', 'pending');

      const badge = document.getElementById('notifBadge');
      if (!badge) return;

      if (count && count > 0) {
        // Tambah ke dropdown notif
        let ni = document.getElementById('_notifPending');
        if (!ni) {
          ni = document.createElement('div');
          ni.id = '_notifPending';
          ni.className = 'notif-item';
          ni.onclick = () => {
            showUserPanel();
            document.getElementById('notifDropdown')?.classList.remove('open');
          };
          const nl = document.getElementById('notifList');
          if (nl) {
            const empty = nl.querySelector('.notif-empty');
            if (empty) empty.remove();
            nl.prepend(ni);
          }
        }
        ni.innerHTML = `<span class="ni-ico">👤</span>
          <div class="ni-body">
            <div class="ni-title">${count} pendaftaran menunggu</div>
            <div class="ni-sub">Klik untuk kelola user</div>
          </div>`;
        badge.textContent = parseInt(badge.textContent || '0') + count;
        badge.classList.remove('hidden');
      }
    } catch (e) {}
  }

  // ── EDIT LOCK SYSTEM ──────────────────────────────────────
  window._acquireLock = async function (tbl, rid) {
    const sb = getSb();
    if (!sb || !_patchUserId) return;
    const exp = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    try {
      await sb.from('editing_locks').upsert(
        { table_name: tbl, record_id: rid, locked_by: _patchUserId, locked_by_name: _patchUserName || 'User', expires_at: exp },
        { onConflict: 'table_name,record_id' }
      );
    } catch (e) {}
  };

  window._releaseLock = async function (tbl, rid) {
    const sb = getSb();
    if (!sb || !_patchUserId) return;
    try {
      await sb.from('editing_locks').delete()
        .eq('table_name', tbl).eq('record_id', rid).eq('locked_by', _patchUserId);
    } catch (e) {}
  };

  window._checkAndWarnLock = async function (tbl, rid) {
    const sb = getSb();
    if (!sb || !_patchUserId) return false;
    try {
      const { data } = await sb.from('editing_locks').select('*')
        .eq('table_name', tbl).eq('record_id', rid)
        .gt('expires_at', new Date().toISOString())
        .neq('locked_by', _patchUserId).maybeSingle();
      if (data) {
        toast('⚠️ ' + (data.locked_by_name || 'User lain') + ' sedang mengedit data ini!', true);
        return true; // locked by someone else
      }
    } catch (e) {}
    return false;
  };

  function _subscribeLocks() {
    const sb = getSb();
    if (!sb || _lockChannel) return;
    _lockChannel = sb.channel('patch_locks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'editing_locks' }, (pl) => {
        if (pl.eventType === 'INSERT' || pl.eventType === 'UPDATE') {
          const lk = pl.new;
          if (lk.locked_by !== _patchUserId) {
            _activeLocks.set(lk.table_name + ':' + lk.record_id, lk);
            toast('🔒 ' + (lk.locked_by_name || 'User lain') + ' mulai mengedit data');
          }
        } else if (pl.eventType === 'DELETE') {
          _activeLocks.delete(pl.old.table_name + ':' + pl.old.record_id);
        }
      }).subscribe();
  }

  // ── TOMBOL "USERS" DI HEADER (Admin) ─────────────────────
  function _injectUserBtn() {
    if (document.getElementById('_btnUsers')) return;
    if (typeof currentRole === 'undefined' || currentRole !== 'admin') return;
    const hr = document.querySelector('.hdr-right');
    if (!hr) return;
    const btn = document.createElement('button');
    btn.id = '_btnUsers';
    btn.className = 'btn btn-sm bgs';
    btn.innerHTML = '👥 Users';
    btn.onclick = showUserPanel;
    hr.prepend(btn);
  }

  // ── INIT ──────────────────────────────────────────────────
  let _initDone = false;

  function _tryInit() {
    if (_initDone) return;

    // Inject register link ke auth screen
    const authScreen = document.getElementById('authScreen');
    if (authScreen) injectRegisterLink();

    // Cek apakah sudah login
    const loginDone = authScreen && authScreen.style.display === 'none';
    if (!loginDone) return;

    _initDone = true;

    const sb = getSb();
    if (sb) {
      sb.auth.getUser().then(({ data }) => {
        if (data?.user) {
          _patchUserId = data.user.id;
          sb.from('user_profiles').select('full_name,email').eq('id', _patchUserId).maybeSingle()
            .then(({ data: p }) => { if (p) _patchUserName = p.full_name || p.email; });
        }
      });
    }

    // Admin features
    setTimeout(() => {
      _injectUserBtn();
      _checkPendingBadge();
      _subscribeLocks();
    }, 1200);
  }

  setInterval(_tryInit, 600);
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_tryInit, 800);
    const authScreen = document.getElementById('authScreen');
    if (authScreen) injectRegisterLink();
  });

})();

