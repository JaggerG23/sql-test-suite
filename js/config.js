/**
 * Experiment & Telemetry Configuration
 * 
 * Supports both local Python backend and static hosting (GitHub Pages, Vercel, Netlify).
 * For static sites (GitHub Pages), telemetry can sync automatically to a free Google Sheet
 * via Google Apps Script Webhook or any Cloud REST API.
 */
(function() {
  const LOCAL_STORAGE_KEY_CLOUD = 'sql_study_cloud_webhook_url';
  const LOCAL_STORAGE_KEY_BACKEND = 'sql_study_backend_api_url';
  const LOCAL_STORAGE_KEY_RESET_BTN = 'sql_study_participant_reset_btn_enabled';

  // Default configuration (can be customized here or via the Admin Dashboard UI)
  const defaultConfig = {
    // Optional central backend (e.g. 'https://my-study-backend.onrender.com' or '' for auto)
    BACKEND_API_URL: '',
    
    // Optional Google Apps Script Web App URL or REST Webhook for 100% free serverless logging
    // e.g. 'https://script.google.com/macros/s/AKfycby.../exec'
    CLOUD_WEBHOOK_URL: '',

    // Toggle participant view "Reset Test" button visibility
    PARTICIPANT_RESET_BTN_ENABLED: true
  };

  class StudyConfigManager {
    constructor() {
      this.config = { ...defaultConfig };
      this.loadPersistedConfig();

      if (typeof window !== 'undefined') {
        window.addEventListener('storage', (e) => {
          if (e.key === LOCAL_STORAGE_KEY_RESET_BTN || e.key === LOCAL_STORAGE_KEY_CLOUD || e.key === LOCAL_STORAGE_KEY_BACKEND) {
            this.loadPersistedConfig();
          }
        });
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
      } catch (e) {}
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
