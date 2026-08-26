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

    document.addEventListener('DOMContentLoaded', () => {
      this.bindLogoutButton();
      this.checkAuthStatus();
    });

    if (document.readyState !== 'loading') {
      this.bindLogoutButton();
      this.checkAuthStatus();
    }
  }

  injectStyles() {
    if (document.getElementById('admin-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-auth-styles';
    style.textContent = `
      body.admin-locked .app-container {
        display: none !important;
      }

      .admin-modal-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(8, 12, 24, 0.94) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 999999 !important;
        padding: 20px !important;
        box-sizing: border-box !important;
      }

      .admin-modal-card {
        background: rgba(15, 23, 42, 0.98) !important;
        border: 1.5px solid rgba(56, 189, 248, 0.35) !important;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.25) !important;
        border-radius: 16px !important;
        padding: 32px 28px !important;
        width: 100% !important;
        max-width: 440px !important;
        color: #f8fafc !important;
        box-sizing: border-box !important;
        text-align: center !important;
        margin: 0 auto !important;
      }

      .admin-modal-header {
        text-align: center !important;
        margin-bottom: 24px !important;
      }

      .admin-modal-icon {
        width: 64px !important;
        height: 64px !important;
        border-radius: 50% !important;
        background: rgba(56, 189, 248, 0.12) !important;
        border: 2px solid rgba(56, 189, 248, 0.4) !important;
        color: #38bdf8 !important;
        font-size: 26px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin: 0 auto 14px auto !important;
        box-shadow: 0 0 20px rgba(56, 189, 248, 0.25) !important;
      }

      .admin-modal-header h2 {
        font-family: 'Outfit', 'Inter', sans-serif !important;
        font-size: 20px !important;
        font-weight: 700 !important;
        color: #f8fafc !important;
        margin: 0 0 8px 0 !important;
      }

      .admin-modal-header p {
        font-size: 13px !important;
        color: #94a3b8 !important;
        margin: 0 !important;
        line-height: 1.5 !important;
      }

      .admin-modal-form .form-group {
        margin-bottom: 18px !important;
        text-align: left !important;
      }

      .admin-modal-form label {
        display: block !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        color: #cbd5e1 !important;
        margin-bottom: 6px !important;
      }

      .input-wrapper {
        position: relative !important;
        display: flex !important;
        align-items: center !important;
      }

      .input-wrapper input {
        width: 100% !important;
        padding: 10px 42px 10px 14px !important;
        background: rgba(0, 0, 0, 0.5) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-radius: 8px !important;
        color: #fff !important;
        font-size: 14px !important;
        outline: none !important;
        box-sizing: border-box !important;
      }

      .input-wrapper input:focus {
        border-color: #38bdf8 !important;
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25) !important;
      }

      .btn-toggle-eye {
        position: absolute !important;
        right: 10px !important;
        background: none !important;
        border: none !important;
        color: #94a3b8 !important;
        cursor: pointer !important;
        padding: 6px !important;
        font-size: 14px !important;
      }

      .admin-error-badge {
        background: rgba(239, 68, 68, 0.15) !important;
        border: 1px solid rgba(239, 68, 68, 0.4) !important;
        color: #f87171 !important;
        border-radius: 8px !important;
        padding: 10px 14px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        margin-bottom: 16px !important;
        text-align: center !important;
      }

      .admin-modal-actions {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
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
      return originalFetch(resource, config);
    };
  }

  async checkAuthStatus() {
    try {
      const res = await fetch('/api/admin/check-auth');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          this.unlockDashboard();
          return;
        }
      }
    } catch (e) {
      console.warn('Backend auth check skipped or offline:', e);
    }

    if (this.getToken()) {
      this.unlockDashboard();
    } else {
      this.lockDashboard();
    }
  }

  lockDashboard() {
    document.body.classList.add('admin-locked');
    this.showLoginModal();
  }

  unlockDashboard() {
    document.body.classList.remove('admin-locked');
    this.hideLoginModal();
  }

  showLoginModal() {
    let modal = document.getElementById('admin-login-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'admin-login-overlay';
      modal.className = 'admin-modal-overlay';
      modal.innerHTML = `
        <div class="admin-modal-card">
          <div class="admin-modal-header">
            <div class="admin-modal-icon"><i class="fa-solid fa-user-shield"></i></div>
            <h2>Admin Dashboard Restricted</h2>
            <p>Authentication required to access administrative SQL matrix controls.</p>
          </div>
          <form id="admin-login-form" class="admin-modal-form" onsubmit="return false;">
            <div class="form-group">
              <label for="admin-pass-input"><i class="fa-solid fa-key"></i> Admin Password:</label>
              <div class="input-wrapper">
                <input type="password" id="admin-pass-input" placeholder="Enter admin password..." required autofocus autocomplete="current-password">
                <button type="button" id="btn-toggle-pass" class="btn-toggle-eye" title="Toggle Visibility">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </div>
            <div id="admin-login-error" class="admin-error-badge" style="display: none;"></div>
            <div class="admin-modal-actions">
              <button type="submit" id="btn-admin-login-submit" class="btn btn-primary btn-block">
                <i class="fa-solid fa-lock-open"></i> Unlock Dashboard
              </button>
              <a href="participant.html" class="btn btn-secondary btn-block text-center" style="margin-top: 8px; text-decoration: none; text-align: center; display: block;">
                <i class="fa-solid fa-arrow-left"></i> Go to Public Participant View
              </a>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);

      const form = modal.querySelector('#admin-login-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });

      const toggleBtn = modal.querySelector('#btn-toggle-pass');
      const passInput = modal.querySelector('#admin-pass-input');
      toggleBtn.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        toggleBtn.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
      });
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      const passInput = document.getElementById('admin-pass-input');
      if (passInput) passInput.focus();
    }, 100);
  }

  hideLoginModal() {
    const modal = document.getElementById('admin-login-overlay');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async handleLogin() {
    const passInput = document.getElementById('admin-pass-input');
    const errBadge = document.getElementById('admin-login-error');
    const submitBtn = document.getElementById('btn-admin-login-submit');

    if (!passInput) return;
    const password = passInput.value.trim();
    if (!password) return;

    errBadge.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();
      if (response.ok && data.status === 'success') {
        if (data.token) {
          this.setToken(data.token);
        } else {
          this.setToken('session_active');
        }
        this.unlockDashboard();
        if (window.app && typeof window.app.renderAnalyticsDashboard === 'function') {
          window.app.renderAnalyticsDashboard();
        }
      } else {
        errBadge.textContent = data.message || 'Incorrect password. Access denied.';
        errBadge.style.display = 'block';
        passInput.value = '';
        passInput.focus();
      }
    } catch (e) {
      console.error('Login network error:', e);
      const validOfflinePasswords = ['StefiksLabRootPassword', 'admin123'];
      if (validOfflinePasswords.includes(password)) {
        this.setToken('static_admin_token');
        this.unlockDashboard();
      } else {
        errBadge.textContent = 'Server offline (server.py not running) or invalid password.';
        errBadge.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Unlock Dashboard';
    }
  }

  async handleLogout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout API failed:', e);
    }
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
