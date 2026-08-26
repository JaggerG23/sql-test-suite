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
    // Intercept fetch to attach X-Admin-Token header if token exists in sessionStorage
    this.patchFetch();

    // Setup Logout listener if button exists
    document.addEventListener('DOMContentLoaded', () => {
      this.bindLogoutButton();
      this.checkAuthStatus();
    });

    // Run check immediately in case DOM is already parsed
    if (document.readyState !== 'loading') {
      this.bindLogoutButton();
      this.checkAuthStatus();
    }
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

    // Check if token exists locally
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

      // Bind login submit event
      const form = modal.querySelector('#admin-login-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });

      // Bind eye toggle
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
        // If App is initialized, refresh telemetry
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
      // Fallback for static client hosting / file:// when server.py is not running
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

// Global instance
window.adminAuth = new AdminAuthManager();
