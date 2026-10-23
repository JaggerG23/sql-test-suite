/**
 * Admin Authentication & Security Manager
 * Restricts /index.html Admin Dashboard access to authorized administrators.
 * Authenticates against POST /api/admin/login on the AWS Lightsail backend (server.py),
 * with a client-side SHA-256 digest fallback for static servers (e.g. Live Server / GitHub Pages)
 * so no plaintext password is ever stored in source code.
 */

class AdminAuthManager {
  constructor() {
    this.tokenKey = 'admin_session_token';
    this.init();
  }

  async init() {
    this.injectStyles();
    this.patchFetch();

    // If user has no token stored, lock immediately without any network wait
    if (!this.getToken()) {
      this.lockDashboard();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.bindLogoutButton();
        this.bindLoginForm();
        this.checkAuthStatus();
      });
    } else {
      this.bindLogoutButton();
      this.bindLoginForm();
      this.checkAuthStatus();
    }
  }

  injectStyles() {
    if (document.getElementById('admin-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-auth-styles';
    style.textContent = `
      html.admin-locked .app-container,
      html.admin-verifying .app-container,
      body.admin-locked .app-container,
      body.admin-verifying .app-container {
        display: none !important;
      }

      html.admin-locked #admin-login-overlay,
      body.admin-locked #admin-login-overlay {
        display: flex !important;
      }

      html.admin-verifying #admin-login-overlay,
      body.admin-verifying #admin-login-overlay,
      body.admin-unlocked #admin-login-overlay,
      .admin-modal-overlay.hidden {
        display: none !important;
      }

      .admin-modal-card {
        background: rgba(15, 23, 42, 0.98);
        border: 1.5px solid rgba(56, 189, 248, 0.35);
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.25);
        border-radius: 16px;
        padding: 32px 28px;
        width: 100%;
        max-width: 480px;
        color: #f8fafc;
        box-sizing: border-box;
        text-align: center;
        margin: 0 auto;
        position: relative;
      }

      #btn-portal-go-study:hover {
        transform: translateY(-2px);
        box-shadow: 0 0 35px rgba(99, 102, 241, 0.75), 0 8px 20px rgba(0, 0, 0, 0.5) !important;
        color: #fff !important;
      }

      #btn-portal-admin-dashboard:hover {
        background: rgba(255, 255, 255, 0.12) !important;
        border-color: rgba(255, 255, 255, 0.3) !important;
        color: #f8fafc !important;
      }

      .admin-modal-header {
        text-align: center;
        margin-bottom: 24px;
      }

      .admin-modal-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(56, 189, 248, 0.12);
        border: 2px solid rgba(56, 189, 248, 0.4);
        color: #38bdf8;
        font-size: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 14px auto;
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
      }

      .admin-modal-header h2 {
        font-family: 'Outfit', 'Inter', sans-serif;
        font-size: 20px;
        font-weight: 700;
        color: #f8fafc;
        margin: 0 0 8px 0;
      }

      .admin-modal-header p {
        font-size: 13px;
        color: #94a3b8;
        margin: 0;
        line-height: 1.5;
      }

      .admin-modal-form .form-group {
        margin-bottom: 18px;
        text-align: left;
      }

      .admin-modal-form label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #cbd5e1;
        margin-bottom: 6px;
      }

      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .input-wrapper input {
        width: 100%;
        padding: 10px 42px 10px 14px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        outline: none;
        box-sizing: border-box;
      }

      .input-wrapper input:focus {
        border-color: #38bdf8;
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
      }

      .btn-toggle-eye {
        position: absolute;
        right: 10px;
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 6px;
        font-size: 14px;
      }

      .admin-error-badge {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #f87171;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 16px;
        text-align: center;
      }

      .admin-modal-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  getToken() {
    return sessionStorage.getItem(this.tokenKey) || '';
  }

  setToken(token) {
    if (token) {
      sessionStorage.setItem(this.tokenKey, token);
    } else {
      sessionStorage.removeItem(this.tokenKey);
    }
  }

  patchFetch() {
    const originalFetch = window.fetch;
    const self = this;
    window.fetch = function(resource, config = {}) {
      const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
      const isExternal = urlStr.startsWith('http://') || urlStr.startsWith('https://');
      const isSameOrigin = typeof window !== 'undefined' && window.location && urlStr.startsWith(window.location.origin);

      if (!isExternal || isSameOrigin) {
        config.headers = config.headers || {};
        const token = self.getToken();
        if (token) {
          if (config.headers instanceof Headers) {
            config.headers.set('X-Admin-Token', token);
            config.headers.set('Authorization', 'Bearer ' + token);
          } else if (Array.isArray(config.headers)) {
            config.headers.push(['X-Admin-Token', token]);
            config.headers.push(['Authorization', 'Bearer ' + token]);
          } else {
            config.headers['X-Admin-Token'] = token;
            config.headers['Authorization'] = 'Bearer ' + token;
          }
        }
      }
      return originalFetch(resource, config);
    };
  }

  getApiUrl(path) {
    if (window.studyConfig && typeof window.studyConfig.getEndpoint === 'function') {
      return window.studyConfig.getEndpoint(path);
    }
    return path.startsWith('/') ? path : `/${path}`;
  }

  async sha256Hex(message) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {}
    }
    // Pure-JS SHA-256 fallback for non-HTTPS contexts
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    const bytes = unescape(encodeURIComponent(message));
    const l = bytes.length * 8;
    const words = [];
    for (let i = 0; i < bytes.length; i++) {
      words[i >> 2] |= (bytes.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    }
    words[l >> 5] |= 0x80 << (24 - (l % 32));
    words[(((l + 64) >> 9) << 4) + 15] = l;
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Array(64);
    for (let i = 0; i < words.length; i += 16) {
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        if (t < 16) {
          W[t] = words[i + t] | 0;
        } else {
          const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
          const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
          W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) | 0);
    }
    return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }

  isValidStaticToken(token) {
    const validHashes = [
      '6f6c8bbe7312706026a50495f1be8b9f17f6c74b6d9e6c7035e232f2e5ed81e9',
      '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
    ];
    return Boolean(token && validHashes.includes(token));
  }

  async checkAuthStatus() {
    const token = this.getToken();
    if (!token) {
      this.lockDashboard();
      return;
    }
    try {
      const endpoint = this.getApiUrl('/api/admin/check-auth');
      const res = await fetch(endpoint);
      if (res.ok) {
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) {}
        if (data && data.authenticated === true) {
          this.unlockDashboard();
          if (window.app && window.app.analytics) {
            window.app.analytics.syncWithDiskStorage(true).then(() => {
              if (typeof window.app.renderAnalyticsDashboard === 'function') {
                window.app.renderAnalyticsDashboard();
              }
            });
          }
          return;
        } else if (data && data.authenticated === false) {
          this.setToken(null);
          this.lockDashboard();
          return;
        }
      }
    } catch (e) {
      // Static server / offline fallback check below
    }

    if (this.isValidStaticToken(token)) {
      this.unlockDashboard();
    } else {
      this.setToken(null);
      this.lockDashboard();
    }
  }

  lockDashboard() {
    if (document.documentElement) {
      document.documentElement.classList.add('admin-locked');
      document.documentElement.classList.remove('admin-unlocked', 'admin-verifying', 'has-admin-token');
    }
    if (document.body) {
      document.body.classList.add('admin-locked');
      document.body.classList.remove('admin-unlocked', 'admin-verifying');
    }
    this.showLoginModal();
  }

  unlockDashboard() {
    if (document.documentElement) {
      document.documentElement.classList.remove('admin-locked', 'admin-verifying');
      document.documentElement.classList.add('admin-unlocked');
    }
    if (document.body) {
      document.body.classList.remove('admin-locked', 'admin-verifying');
      document.body.classList.add('admin-unlocked');
    }
    this.hideLoginModal();
    if (typeof window !== 'undefined' && window.app) {
      if (typeof window.app.populateAdminQuestionGrid === 'function') {
        window.app.populateAdminQuestionGrid();
      }
      const container = document.getElementById('human-challenge-container');
      if (container && !container.innerHTML.trim() && typeof window.app.loadIncrementalQuestion === 'function') {
        window.app.loadIncrementalQuestion(window.app.currentQuestionNumber || 1);
      }
    }
  }

  bindLoginForm(modal = document.getElementById('admin-login-overlay')) {
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';

    const openingView = modal.querySelector('#admin-opening-view');
    const loginView = modal.querySelector('#admin-login-view');
    const btnPortalAdmin = modal.querySelector('#btn-portal-admin-dashboard');
    const btnLoginBack = modal.querySelector('#btn-login-back');
    const passInput = modal.querySelector('#admin-pass-input');
    const errBadge = modal.querySelector('#admin-login-error');

    if (btnPortalAdmin && openingView && loginView) {
      btnPortalAdmin.addEventListener('click', () => {
        openingView.style.display = 'none';
        loginView.style.display = 'block';
        if (passInput) {
          passInput.value = '';
          passInput.focus();
        }
        if (errBadge) {
          errBadge.style.display = 'none';
        }
      });
    }

    if (btnLoginBack && openingView && loginView) {
      btnLoginBack.addEventListener('click', () => {
        loginView.style.display = 'none';
        openingView.style.display = 'block';
        if (passInput) passInput.value = '';
        if (errBadge) errBadge.style.display = 'none';
      });
    }

    const form = modal.querySelector('#admin-login-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    const toggleBtn = modal.querySelector('#btn-toggle-pass');
    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        toggleBtn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
      });
    }
  }

  showLoginModal() {
    let modal = document.getElementById('admin-login-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'admin-login-overlay';
      modal.className = 'admin-modal-overlay';
      modal.innerHTML = `
        <div class="admin-modal-card">
          <div id="admin-opening-view">
            <div class="admin-modal-header">
              <div class="admin-modal-icon" style="background: rgba(99, 102, 241, 0.15); border-color: rgba(99, 102, 241, 0.45); color: #818cf8; box-shadow: 0 0 25px rgba(99, 102, 241, 0.3);">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <h2>SQL Research Study Platform</h2>
              <p>Welcome to the research evaluation suite. Choose an option to proceed:</p>
            </div>
            <div style="padding: 24px 0 28px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
              <a href="participant.html?new_participant=1" id="btn-portal-go-study" class="btn btn-primary" style="font-size: 16px; font-weight: 700; padding: 14px 44px; border-radius: 12px; display: inline-flex; align-items: center; gap: 10px; text-decoration: none; box-shadow: 0 0 25px rgba(99, 102, 241, 0.55), 0 4px 15px rgba(0,0,0,0.4); letter-spacing: 0.3px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer;">
                <i class="fa-solid fa-play"></i> Go to Study
              </a>
              <span style="font-size: 11.5px; color: #64748b; margin-top: 4px;">Public participant session</span>
            </div>
            <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 12px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
              <button type="button" id="btn-portal-admin-dashboard" class="btn" style="font-size: 11.5px; font-weight: 600; padding: 7px 14px; border-radius: 7px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.16); color: #94a3b8; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.18s ease;">
                <i class="fa-solid fa-shield-halved"></i> Admin Dashboard
              </button>
            </div>
          </div>
          <div id="admin-login-view" style="display: none;">
            <div class="admin-modal-header">
              <div class="admin-modal-icon"><i class="fa-solid fa-user-shield"></i></div>
              <h2>Admin Dashboard Restricted</h2>
              <p>Authentication required to access administrative SQL matrix controls.</p>
            </div>
            <form id="admin-login-form" class="admin-modal-form" onsubmit="return false;">
              <div class="form-group">
                <label for="admin-pass-input"><i class="fa-solid fa-key"></i> Admin Password:</label>
                <div class="input-wrapper">
                  <input type="password" id="admin-pass-input" placeholder="Enter admin password..." required autocomplete="current-password">
                  <button type="button" id="btn-toggle-pass" class="btn-toggle-eye" title="Toggle Visibility" tabindex="-1">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                </div>
              </div>
              <div id="admin-login-error" class="admin-error-badge" style="display: none;"></div>
              <div class="admin-modal-actions">
                <button type="submit" id="btn-admin-login-submit" class="btn btn-primary btn-block">
                  <i class="fa-solid fa-lock-open"></i> Unlock Dashboard
                </button>
                <button type="button" id="btn-login-back" class="btn btn-secondary btn-block text-center" style="margin-top: 8px;">
                  <i class="fa-solid fa-arrow-left"></i> Back
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      if (document.body) {
        document.body.appendChild(modal);
      }
    }

    this.bindLoginForm(modal);

    const openingView = modal.querySelector('#admin-opening-view');
    const loginView = modal.querySelector('#admin-login-view');
    const passInput = modal.querySelector('#admin-pass-input');
    const errBadge = modal.querySelector('#admin-login-error');
    if (openingView && loginView) {
      const isDirectAdminUrl = typeof window !== 'undefined' && window.location && (
        window.location.pathname.toLowerCase().includes('/admin') ||
        window.location.search.toLowerCase().includes('admin=1')
      );
      if (isDirectAdminUrl) {
        openingView.style.display = 'none';
        loginView.style.display = 'block';
      } else {
        openingView.style.display = 'block';
        loginView.style.display = 'none';
      }
      if (passInput) passInput.value = '';
      if (errBadge) errBadge.style.display = 'none';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  hideLoginModal() {
    const modal = document.getElementById('admin-login-overlay');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.remove();
    }
  }

  async handleLogin() {
    const passInput = document.getElementById('admin-pass-input');
    const errBadge = document.getElementById('admin-login-error');
    const submitBtn = document.getElementById('btn-admin-login-submit');

    if (!passInput) return;
    const password = passInput.value.trim();
    if (!password) return;

    if (errBadge) errBadge.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
    }

    try {
      const endpoint = this.getApiUrl('/api/admin/login');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        const text = await response.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (data && data.status === 'success' && data.token) {
          this.setToken(data.token);
          this.unlockDashboard();
          if (window.app && window.app.analytics) {
            await window.app.analytics.syncWithDiskStorage(true);
            if (typeof window.app.renderAnalyticsDashboard === 'function') {
              window.app.renderAnalyticsDashboard();
            }
          }
          return;
        }
      }

      // If backend explicitly rejected password (401/403)
      if (response.status === 401 || response.status === 403) {
        if (errBadge) {
          errBadge.textContent = 'Incorrect password. Access denied.';
          errBadge.style.display = 'block';
        }
        passInput.value = '';
        passInput.focus();
        return;
      }

      // If running on a static file server (e.g. Live Server port 5500 or GitHub Pages returning 404/405),
      // verify against SHA-256 digest without exposing any plaintext password in source code
      const digest = await this.sha256Hex(password);
      if (this.isValidStaticToken(digest)) {
        this.setToken(digest);
        this.unlockDashboard();
        if (window.app && typeof window.app.renderAnalyticsDashboard === 'function') {
          window.app.renderAnalyticsDashboard();
        }
        return;
      }

      if (errBadge) {
        errBadge.textContent = 'Incorrect password. Access denied.';
        errBadge.style.display = 'block';
      }
      passInput.value = '';
      passInput.focus();
    } catch (e) {
      const digest = await this.sha256Hex(password);
      if (this.isValidStaticToken(digest)) {
        this.setToken(digest);
        this.unlockDashboard();
        if (window.app && typeof window.app.renderAnalyticsDashboard === 'function') {
          window.app.renderAnalyticsDashboard();
        }
        return;
      }
      if (errBadge) {
        errBadge.textContent = 'Incorrect password. Access denied.';
        errBadge.style.display = 'block';
      }
      passInput.value = '';
      passInput.focus();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Unlock Dashboard';
      }
    }
  }

  async handleLogout() {
    try {
      const endpoint = this.getApiUrl('/api/admin/logout');
      await fetch(endpoint, { method: 'POST' });
    } catch (e) {}
    this.setToken(null);
    this.lockDashboard();
  }

  bindLogoutButton() {
    const logoutBtn = document.getElementById('btn-admin-logout');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = 'true';
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    }
  }
}

window.adminAuth = new AdminAuthManager();
