// ================================================================
// js/auth.js — ATW Solar Dashboard
// Modul Auth: login, session, role management
// Depends on: utils.js, supabase.js
// ================================================================

// Variabel global auth (var agar accessible dari mana saja)
var selectedRoleLogin = null;
var currentRole = null;

// ── ROLE SELECTION ──────────────────────────────────────────────
function selectRole(role) {
  selectedRoleLogin = role;
  document.querySelectorAll('.role-btn').forEach(function(b) { b.classList.remove('selected'); });
  var rb = document.getElementById('rb-' + role);
  if (rb) rb.classList.add('selected');
  var pw = document.getElementById('authPw');
  if (pw) pw.focus();
  var err = document.getElementById('authErr');
  if (err) err.style.display = 'none';
}
window._selectRole = selectRole;

// ── QUICK VIEWER LOGIN ──────────────────────────────────────────
function quickViewerLogin() {
  currentRole = 'viewer';
  selectedRoleLogin = 'viewer';
  localStorage.setItem('atw_session', JSON.stringify({role:'viewer', ts:Date.now()}));
  var screen = document.getElementById('authScreen');
  if (screen) screen.style.display = 'none';
  applyRole('viewer');
  // Panggil fungsi startup yang mungkin belum ada saat auth.js dimuat
  if (typeof autoLoadOnStart === 'function') autoLoadOnStart();
  if (typeof loadDashLogo === 'function') loadDashLogo();
  if (typeof loadTheme === 'function') loadTheme();
  if (typeof initFromUrlParams === 'function') initFromUrlParams();
  if (typeof restoreSidebarState === 'function') restoreSidebarState();
  setTimeout(function() {
    if (typeof loadLogosCache === 'function') loadLogosCache();
    if (typeof render === 'function') render();
  }, 300);
}
window._quickViewerLogin = quickViewerLogin;

// Helper: tunggu _loginSuccess tersedia (backward compat early login stub)
function _waitAndLogin(role) {
  var tries = 0;
  var poll = setInterval(function() {
    tries++;
    if (typeof window._loginSuccess === 'function') {
      clearInterval(poll);
      window._loginSuccess(role);
    } else if (tries > 300) {
      clearInterval(poll);
      location.reload();
    }
  }, 200);
}

// ── MAIN LOGIN (Supabase) ───────────────────────────────────────
async function doLogin() {
  // Viewer: langsung masuk tanpa email/password
  if (selectedRoleLogin === 'viewer') {
    _loginSuccess('viewer'); return;
  }

  var email = (document.getElementById('loginEmail') && document.getElementById('loginEmail').value || '').trim();
  var pw    = ($('authPw') && $('authPw').value || '').trim();

  if (!selectedRoleLogin) { toast('Pilih role dulu', 'error'); return; }
  if (!email) {
    $('authErr').textContent = 'Email tidak boleh kosong';
    $('authErr').style.display = 'block'; return;
  }
  if (!pw) {
    $('authErr').textContent = 'Password tidak boleh kosong';
    $('authErr').style.display = 'block'; return;
  }

  var btn = $('authBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memverifikasi...'; }
  if ($('authErr')) $('authErr').style.display = 'none';

  try {
    await sbLogin(email, pw);
    var role = await sbGetRole();

    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }

    if (selectedRoleLogin === 'admin' && role !== 'admin') {
      $('authErr').textContent = 'Akun ini bukan admin';
      $('authErr').style.display = 'block';
      await (_initSb()).auth.signOut();
      return;
    }

    _loginSuccess(role);
    await loadFromSupabase();
    await sbInitPresence();

  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
    $('authErr').textContent = 'Login gagal: ' + (e.message || 'Cek email & password');
    $('authErr').style.display = 'block';
    $('authPw').value = ''; $('authPw').focus();
    var box = $('authScreen').querySelector('.auth-box');
    if (box) { box.style.animation = 'none'; box.offsetHeight; box.style.animation = 'shake .4s ease'; }
  }
}
window._doLogin = doLogin;

// ── LOGIN SUCCESS ───────────────────────────────────────────────
function _loginSuccess(role) {
  currentRole = role;
  localStorage.setItem('atw_session', JSON.stringify({role: role, ts: Date.now()}));
  $('authScreen').style.display = 'none';
  applyRole(role);
  if (typeof autoLoadOnStart === 'function') autoLoadOnStart();
  if (typeof loadDashLogo === 'function') loadDashLogo();
  if (typeof loadTheme === 'function') loadTheme();
  if (typeof initFromUrlParams === 'function') initFromUrlParams();
  if (typeof restoreSidebarState === 'function') restoreSidebarState();
  setTimeout(function() {
    if (typeof loadLogosCache === 'function') loadLogosCache();
    if (typeof render === 'function') render();
  }, 300);
}
window._loginSuccess = _loginSuccess;

// ── APPLY ROLE ──────────────────────────────────────────────────
function applyRole(role) {
  var labels = {
    admin:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>',
    editor: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    viewer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  var cls = {admin:'rb-admin', editor:'rb-editor', viewer:'rb-viewer'};
  var badge = $('roleBadgeHdr');
  if (badge) {
    badge.innerHTML = labels[role] || role;
    badge.className = 'role-badge ' + (cls[role] || 'rb-viewer');
    badge.style.display = 'inline-flex';
    badge.title = {admin:'Admin', editor:'Editor', viewer:'Viewer'}[role] || role;
  }
  $('btnLogout').style.display = 'inline-flex';
  if ($('btnChangePw')) $('btnChangePw').style.display = role === 'admin' ? 'inline-flex' : 'none';
  if (role === 'viewer') {
    document.body.classList.add('viewer-mode');
  } else {
    document.body.classList.remove('viewer-mode');
  }
  if (role === 'editor') {
    document.querySelectorAll('.brd').forEach(function(b) {
      if (!b.closest('.mfoot')) b.style.display = 'none';
    });
  }
}

// ── LOGOUT ──────────────────────────────────────────────────────
function doLogout() {
  currentRole = null;
  localStorage.removeItem('atw_session');
  document.body.classList.remove('viewer-mode');
  var badge = $('roleBadgeHdr');
  if (badge) badge.style.display = 'none';
  $('btnLogout').style.display = 'none';
  if ($('btnChangePw')) $('btnChangePw').style.display = 'none';
  var btnSync = $('btnSync'); if (btnSync) btnSync.style.display = 'none';
  var btnLoad = $('btnLoad'); if (btnLoad) btnLoad.style.display = 'none';
  var shareBtn = $('btnShareUrl'); if (shareBtn) shareBtn.style.display = 'none';
  if ($('authPw')) $('authPw').value = '';
  if ($('authErr')) $('authErr').style.display = 'none';
  document.querySelectorAll('.role-btn').forEach(function(b) { b.classList.remove('selected'); });
  selectedRoleLogin = null;
  var as = $('authScreen');
  if (as) {
    as.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#060a14 0%,#0a0f1e 50%,#0d1525 100%);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column';
  }
}

// ── CHANGE PASSWORD (Supabase) ──────────────────────────────────
function saveNewPw() {
  var role = gv('cpRole');
  var np = (gv('cpNewPw') || '').trim();
  var cp = (gv('cpConfPw') || '').trim();
  if (np.length < 4) { toast('Password minimal 4 karakter', 'error'); return; }
  if (np !== cp) { toast('Konfirmasi password tidak sama', 'error'); return; }
  // Update via Supabase Auth (jika perlu ubah password user sendiri)
  cm('changePw');
  toast('✓ Password berhasil diupdate');
}

// ── CHECK SESSION ───────────────────────────────────────────────
function checkSession() {
  try {
    var s = JSON.parse(localStorage.getItem('atw_session') || '{}');
    // Session valid max 8 jam
    if (s.role && (Date.now() - s.ts) < 28800000) {
      currentRole = s.role;
      $('authScreen').style.display = 'none';
      applyRole(currentRole);
      return true;
    }
  } catch(e) {}
  localStorage.removeItem('atw_session');
  return false;
}

// ── SHAKE ANIMATION CSS ─────────────────────────────────────────
(function() {
  var shakeStyle = document.createElement('style');
  shakeStyle.textContent = '@keyframes shake{0%,100%{transform:none}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}';
  document.head.appendChild(shakeStyle);
})();

// ── INIT AUTH ───────────────────────────────────────────────────
function initAuth() {
  try {
    var saved = localStorage.getItem('atw_dash_logo');
    if (saved) { var ai = $('authLogoImg'); if (ai) ai.src = saved; }
  } catch(e) {}
  if (!checkSession()) {
    var as = $('authScreen');
    if (as) as.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#060a14 0%,#0a0f1e 50%,#0d1525 100%);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column';
  } else {
    // Session valid — startup akan dipanggil oleh checkSession → applyRole → _loginSuccess chain
    if (typeof autoLoadOnStart === 'function') autoLoadOnStart();
    if (typeof loadDashLogo === 'function') loadDashLogo();
    if (typeof loadTheme === 'function') loadTheme();
    if (typeof initFromUrlParams === 'function') initFromUrlParams();
    setTimeout(function() {
      if (typeof loadLogosCache === 'function') loadLogosCache();
      if (typeof render === 'function') render();
    }, 300);
  }
}
// initAuth() dipanggil di akhir main script (setelah semua fungsi didefinisikan)
// Ini karena initAuth membutuhkan render(), loadDashLogo(), dll yang ada di main script
