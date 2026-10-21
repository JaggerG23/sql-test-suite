/**
 * Admin Authentication & Security Manager
 * Restricts /index.html Admin Dashboard access to authorized administrators.
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
      body.admin-locked .app-container,
      body.admin-verifying .app-container {
        display: none !important;
      }

      html.admin-locked #admin-login-overlay,
      body.admin-locked #admin-login-overlay {
        display: flex !important;
      }

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
          } else if (Array.isArray(config.headers)) {
            config.headers.push(['X-Admin-Token', token]);
          } else {
            config.headers['X-Admin-Token'] = token;
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

  async checkAuthStatus() {
    try {
      const endpoint = this.getApiUrl('/api/admin/check-auth');
      const res = await fetch(endpoint);
      if (res.ok) {
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) {}
        if (data && data.authenticated) {
          this.unlockDashboard();
          // Always ensure telemetry is synced when verified
          if (window.app && window.app.analytics) {
            window.app.analytics.syncWithDiskStorage().then(() => {
              if (typeof window.app.renderAnalyticsDashboard === 'function') {
                window.app.renderAnalyticsDashboard();
              }
            });
          }
          return;
        } else if (data && data.authenticated === false) {
          // Server explicitly rejected the token (session expired or server restarted)
          this.setToken(null);
          this.lockDashboard();
          return;
        }
      }
    } catch (e) {
      // Backend auth check skipped or offline
    }

    if (this.getToken()) {
      this.unlockDashboard();
    } else {
      this.lockDashboard();
    }
  }

  lockDashboard() {
    if (document.documentElement) {
      document.documentElement.classList.add('admin-locked');
      document.documentElement.classList.remove('admin-unlocked', 'has-admin-token');
    }
    if (document.body) {
      document.body.classList.add('admin-locked');
      document.body.classList.remove('admin-unlocked', 'admin-verifying');
    }
    this.showLoginModal();
  }

  unlockDashboard() {
    if (document.documentElement) {
      document.documentElement.classList.remove('admin-locked');
      document.documentElement.classList.add('admin-unlocked');
    }
    if (document.body) {
      document.body.classList.remove('admin-locked', 'admin-verifying');
      document.body.classList.add('admin-unlocked');
    }
    this.hideLoginModal();
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
      openingView.style.display = 'block';
      loginView.style.display = 'none';
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

    const validOfflinePasswords = ['StefiksLabRootPassword', 'admin123'];

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

        if (data && data.status === 'success') {
          this.setToken(data.token || 'session_active');
          this.unlockDashboard();
          if (window.app && window.app.analytics) {
            await window.app.analytics.syncWithDiskStorage();
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

      // If static host returns 404 or backend unavailable, fallback to client passwords
      if (response.status === 404 || !response.ok) {
        if (validOfflinePasswords.includes(password)) {
          this.setToken('static_admin_token');
          this.unlockDashboard();
          if (window.app && typeof window.app.renderAnalyticsDashboard === 'function') {
            window.app.renderAnalyticsDashboard();
          }
          return;
        } else {
          if (errBadge) {
            errBadge.textContent = 'Incorrect password. Access denied.';
            errBadge.style.display = 'block';
          }
          passInput.value = '';
          passInput.focus();
          return;
        }
      }
    } catch (e) {
      if (validOfflinePasswords.includes(password)) {
        this.setToken('static_admin_token');
        this.unlockDashboard();
        if (window.app && typeof window.app.renderAnalyticsDashboard === 'function') {
          window.app.renderAnalyticsDashboard();
        }
      } else {
        if (errBadge) {
          errBadge.textContent = 'Incorrect password. Access denied.';
          errBadge.style.display = 'block';
        }
        passInput.value = '';
        passInput.focus();
      }
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
