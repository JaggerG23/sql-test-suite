/**
 * Experiment & Telemetry Configuration (25-Question SQL Readability Study)
 * 
 * Supports AWS Lightsail / Python backend (server.py behind Nginx) as well as
 * static hosting (GitHub Pages, Live Server) with optional Google Apps Script
 * or REST webhook telemetry synchronization.
 */
(function() {
  const LOCAL_STORAGE_KEY_CLOUD = 'sql_study_cloud_webhook_url';
  const LOCAL_STORAGE_KEY_BACKEND = 'sql_study_backend_api_url';
  const LOCAL_STORAGE_KEY_RESET_BTN = 'sql_study_participant_reset_btn_enabled';
  const LOCAL_STORAGE_KEY_Q21_30 = 'sql_study_questions_21_30_enabled';

  // Default configuration (can be customized here or via the Admin Dashboard UI)
  const defaultConfig = {
    // Current application release version
    VERSION: 'v1.0.15',

    // Optional central backend (e.g. 'https://my-study-backend.onrender.com' or '' for auto)
    BACKEND_API_URL: '',
    
    // Optional Google Apps Script Web App URL or REST Webhook for 100% free serverless logging
    // e.g. 'https://script.google.com/macros/s/AKfycby.../exec'
    CLOUD_WEBHOOK_URL: '',

    // Toggle participant view "Reset Test" button visibility
    PARTICIPANT_RESET_BTN_ENABLED: true,

    // Official study has 25 questions (Questions 1-25)
    TOTAL_QUESTIONS: 25,
    QUESTIONS_21_30_ENABLED: true
  };

  class StudyConfigManager {
    constructor() {
      this.config = { ...defaultConfig };
      this.loadPersistedConfig();
      this.fetchRemoteConfig();

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('storage', (e) => {
          if (e.key === LOCAL_STORAGE_KEY_RESET_BTN || e.key === LOCAL_STORAGE_KEY_CLOUD || e.key === LOCAL_STORAGE_KEY_BACKEND || e.key === LOCAL_STORAGE_KEY_Q21_30) {
            this.loadPersistedConfig();
            window.dispatchEvent(new CustomEvent('study-config-updated', {
              detail: { key: e.key, config: this.config }
            }));
          }
        });

        if ('BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('sql_study_telemetry_channel');
            bc.addEventListener('message', (ev) => {
              if (ev.data && ev.data.type === 'CONFIG_UPDATED') {
                if (ev.data.key === 'QUESTIONS_21_30_ENABLED') {
                  this.config.QUESTIONS_21_30_ENABLED = Boolean(ev.data.value);
                  try {
                    localStorage.setItem(LOCAL_STORAGE_KEY_Q21_30, String(this.config.QUESTIONS_21_30_ENABLED));
                  } catch (err) {}
                  window.dispatchEvent(new CustomEvent('study-config-updated', {
                    detail: { key: 'QUESTIONS_21_30_ENABLED', value: this.config.QUESTIONS_21_30_ENABLED }
                  }));
                } else if (ev.data.key === 'PARTICIPANT_RESET_BTN_ENABLED') {
                  this.config.PARTICIPANT_RESET_BTN_ENABLED = Boolean(ev.data.value);
                  try {
                    localStorage.setItem(LOCAL_STORAGE_KEY_RESET_BTN, String(this.config.PARTICIPANT_RESET_BTN_ENABLED));
                  } catch (err) {}
                  window.dispatchEvent(new CustomEvent('study-config-updated', {
                    detail: { key: 'PARTICIPANT_RESET_BTN_ENABLED', value: this.config.PARTICIPANT_RESET_BTN_ENABLED }
                  }));
                }
              }
            });
          } catch (err) {}
        }
      }
    }

    loadPersistedConfig() {
      try {
        const savedCloud = localStorage.getItem(LOCAL_STORAGE_KEY_CLOUD);
        if (savedCloud) this.config.CLOUD_WEBHOOK_URL = savedCloud.trim();

        const savedBackend = localStorage.getItem(LOCAL_STORAGE_KEY_BACKEND);
        if (savedBackend) this.config.BACKEND_API_URL = savedBackend.trim();

        const savedResetBtn = localStorage.getItem(LOCAL_STORAGE_KEY_RESET_BTN);
        if (savedResetBtn !== null) {
          this.config.PARTICIPANT_RESET_BTN_ENABLED = savedResetBtn === 'true';
        }

        this.config.QUESTIONS_21_30_ENABLED = true;
      } catch (e) {}
    }

    async fetchRemoteConfig() {
      try {
        const endpoint = this.getEndpoint('/api/study-config');
        const resp = await fetch(endpoint);
        if (resp.ok) {
          await resp.json();
        }
      } catch (e) {}
    }

    getVersion() {
      return this.config.VERSION || 'v1.0.15';
    }

    isQuestions21to30Enabled() {
      return true;
    }

    getMaxQuestions() {
      return 25;
    }

    async setQuestions21to30Enabled(enabled) {
      this.config.QUESTIONS_21_30_ENABLED = true;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_Q21_30, 'true');
      } catch (e) {}

      // Sync to backend server with admin auth token if available
      try {
        const endpoint = this.getEndpoint('/api/admin/study-config');
        const token = (window.adminAuth && typeof window.adminAuth.getToken === 'function')
          ? window.adminAuth.getToken()
          : (sessionStorage.getItem('sql_study_admin_token') || '');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ questions_21_30_enabled: true, total_questions: 25 })
        });
      } catch (e) {}

      return true;
    }

    isParticipantResetButtonEnabled() {
      return this.config.PARTICIPANT_RESET_BTN_ENABLED !== false;
    }

    setParticipantResetButtonEnabled(enabled) {
      this.config.PARTICIPANT_RESET_BTN_ENABLED = Boolean(enabled);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_RESET_BTN, String(this.config.PARTICIPANT_RESET_BTN_ENABLED));
        if ('BroadcastChannel' in window) {
          try {
            const ch = new BroadcastChannel('sql_study_telemetry_channel');
            ch.postMessage({
              type: 'CONFIG_UPDATED',
              key: 'PARTICIPANT_RESET_BTN_ENABLED',
              value: this.config.PARTICIPANT_RESET_BTN_ENABLED
            });
          } catch (err) {}
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('study-config-updated', {
            detail: { key: 'PARTICIPANT_RESET_BTN_ENABLED', value: this.config.PARTICIPANT_RESET_BTN_ENABLED }
          }));
        }
      } catch (e) {}
    }

    getCloudWebhookUrl() {
      return this.config.CLOUD_WEBHOOK_URL || '';
    }

    setCloudWebhookUrl(url) {
      this.config.CLOUD_WEBHOOK_URL = (url || '').trim();
      try {
        if (this.config.CLOUD_WEBHOOK_URL) {
          localStorage.setItem(LOCAL_STORAGE_KEY_CLOUD, this.config.CLOUD_WEBHOOK_URL);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEY_CLOUD);
        }
      } catch (e) {}
    }

    getBackendApiUrl() {
      if (this.config.BACKEND_API_URL) return this.config.BACKEND_API_URL.replace(/\/+$/, '');
      if (this.isLocalhost()) return '';
      return '';
    }

    setBackendApiUrl(url) {
      this.config.BACKEND_API_URL = (url || '').trim();
      try {
        if (this.config.BACKEND_API_URL) {
          localStorage.setItem(LOCAL_STORAGE_KEY_BACKEND, this.config.BACKEND_API_URL);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEY_BACKEND);
        }
      } catch (e) {}
    }

    isLocalhost() {
      if (typeof window === 'undefined' || !window.location) return false;
      const hostname = window.location.hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]';
    }

    isStaticHosting() {
      return !this.isLocalhost() && !this.config.BACKEND_API_URL;
    }

    getEndpoint(path) {
      const base = this.getBackendApiUrl();
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return base ? `${base}${cleanPath}` : cleanPath;
    }
  }

  window.studyConfig = new StudyConfigManager();
})();
