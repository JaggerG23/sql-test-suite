/**
 * Participant Analytics & Telemetry Manager
 * Handles persistent storage, server synchronization, real-time cross-tab updates,
 * demographic profiling, accuracy & timing telemetry, cloud webhook sync (Google Sheets),
 * file/token import, and unified CSV/JSON exports.
 */

class ParticipantAnalytics {
  constructor() {
    this.studySchemaVersion = 'v2026_10_24_final_25q';
    this.schemaVersionKey = 'sql_study_schema_version';
    this.storageKey = 'sql_study_responses';
    this.trainingStorageKey = 'sql_study_training_responses';
    this.demographicsKey = 'sql_study_demographics';
    this.finalThoughtsKey = 'sql_study_final_thoughts';
    this.participantIdKey = 'sql_study_participant_id';
    this.sessionIdKey = 'sql_study_session_id';
    this.outboxStorageKey = 'sql_study_pending_outbox_v1';

    this._groupPrefetchPromises = {};
    this._isFlushingOutbox = false;
    this._outboxRetryTimer = null;

    this.enforceStudySchemaVersion();

    this.participantId = this.initParticipantId();
    this.sessionId = this.initSessionId();
    this.callbacks = [];

    this.responses = this.loadResponses();
    this.trainingResponses = this.loadTrainingResponses();
    this.demographics = this.loadDemographics();
    this.finalThoughts = this.loadFinalThoughts();
    this.pendingOutbox = this.loadPendingOutbox();

    this.assignedGroup = this.initAssignedGroup(this.participantId);

    this.initRealtimeChannel();
    if (this.isParticipantView()) {
      this.prefetchRotatingGroupIndex(this.participantId);
      if (this.pendingOutbox.length > 0) {
        this.flushPendingOutbox();
      }
    } else {
      this.syncWithDiskStorage(true);
    }
  }

  generateRandomHex(byteCount = 8) {
    try {
      if (typeof window !== 'undefined' && window.crypto) {
        if (typeof window.crypto.randomUUID === 'function' && byteCount >= 8) {
          return window.crypto.randomUUID().replace(/-/g, '').substring(0, byteCount * 2);
        }
        if (typeof window.crypto.getRandomValues === 'function') {
          const bytes = new Uint8Array(byteCount);
          window.crypto.getRandomValues(bytes);
          return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }
      }
    } catch (e) {}
    let fallback = '';
    while (fallback.length < byteCount * 2) {
      fallback += Math.random().toString(16).substring(2);
    }
    return fallback.substring(0, byteCount * 2);
  }

  generateUniqueId(prefix = 'id') {
    ParticipantAnalytics._idSeq = ((ParticipantAnalytics._idSeq || 0) + 1) & 0xffff;
    const tsPart = Date.now().toString(36);
    const seqPart = ParticipantAnalytics._idSeq.toString(36);
    const randPart = this.generateRandomHex(6);
    return `${prefix}_${tsPart}${seqPart}_${randPart}`;
  }

  // Purge any legacy prototype keys and invalidate stale localStorage if the study schema version changed
  enforceStudySchemaVersion() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sql_test_suite_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      const storedVersion = localStorage.getItem(this.schemaVersionKey);
      if (storedVersion !== this.studySchemaVersion) {
        const staleStudyKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sql_study_') && k !== 'sql_study_admin_config' && k !== 'sql_study_admin_token') {
            staleStudyKeys.push(k);
          }
        }
        staleStudyKeys.forEach(k => localStorage.removeItem(k));
        try {
          const sessionKeys = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const sk = sessionStorage.key(i);
            if (sk && sk.startsWith('sql_study_') && sk !== 'sql_study_admin_token') {
              sessionKeys.push(sk);
            }
          }
          sessionKeys.forEach(sk => sessionStorage.removeItem(sk));
        } catch (e) {}
        localStorage.setItem(this.schemaVersionKey, this.studySchemaVersion);
      }
    } catch (e) {
      console.warn('Schema version check:', e);
    }
  }

  // Reset attempt state when a participant begins a new session from the Consent / Intake screen
  resetParticipantAttemptState(forceNewParticipantId = false) {
    try {
      const oldPid = this.participantId;
      const existingResps = this.getParticipantResponses(oldPid);
      const hasFinishedPrior = localStorage.getItem('sql_study_completed_finished') === 'true';
      if (forceNewParticipantId || existingResps.length > 0 || hasFinishedPrior) {
        const newPid = this.generateUniqueId('user');
        this.participantId = newPid;
        localStorage.setItem(this.participantIdKey, newPid);
        this.sessionId = this.generateUniqueId('session');
        try { sessionStorage.setItem(this.sessionIdKey, this.sessionId); } catch (e) {}
      }
      const pid = this.participantId;
      this.responses = (this.responses || []).filter(r => r && r.participantId !== pid && r.participantId !== oldPid);
      this.trainingResponses = (this.trainingResponses || []).filter(r => r && r.participantId !== pid && r.participantId !== oldPid);
      if (this.demographics) {
        delete this.demographics[pid];
        if (oldPid && oldPid !== pid) delete this.demographics[oldPid];
      }
      if (this.finalThoughts) {
        delete this.finalThoughts[pid];
        if (oldPid && oldPid !== pid) delete this.finalThoughts[oldPid];
      }
      if (Array.isArray(this.pendingOutbox)) {
        this.pendingOutbox = this.pendingOutbox.filter(item => item && item.participantId !== pid && item.participantId !== oldPid);
        this.savePendingOutbox();
      }
      this.saveResponsesLocally();
      localStorage.setItem(this.trainingStorageKey, JSON.stringify(this.trainingResponses));
      localStorage.setItem(this.demographicsKey, JSON.stringify(this.demographics || {}));
      localStorage.setItem(this.finalThoughtsKey, JSON.stringify(this.finalThoughts || {}));
      localStorage.removeItem('sql_study_completed_finished');
      localStorage.removeItem('sql_study_training_completed_' + pid);
      localStorage.removeItem('sql_study_final_thoughts_done_' + pid);
      try {
        sessionStorage.removeItem('sql_study_training_completed_' + pid);
      } catch (e) {}
      if (this.isParticipantView()) {
        this.prefetchRotatingGroupIndex(pid);
      }
    } catch (e) {
      console.warn('Reset participant attempt state error:', e);
    }
    return this.participantId;
  }

  initParticipantId() {
    let isExplicitNew = false;
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new_participant') === '1' || params.get('new_session') === 'true') {
          isExplicitNew = true;
        }
      } catch (e) {}
    }

    let pid = null;
    if (!isExplicitNew) {
      pid = localStorage.getItem(this.participantIdKey);
    }

    if (!pid || isExplicitNew) {
      pid = this.generateUniqueId('user');
      localStorage.setItem(this.participantIdKey, pid);
      localStorage.removeItem('sql_study_completed_finished');
      try {
        sessionStorage.removeItem('sql_study_consent_accepted');
        localStorage.removeItem('sql_study_consent_accepted');
        sessionStorage.removeItem('sql_study_consent_accepted_' + pid);
        localStorage.removeItem('sql_study_consent_accepted_' + pid);
      } catch (e) {}
    }
    return pid;
  }

  setParticipantId(newId) {
    if (!newId || !newId.trim()) return;
    this.participantId = newId.trim();
    localStorage.setItem(this.participantIdKey, this.participantId);
    this.assignedGroup = this.initAssignedGroup(this.participantId);
    this.notify({ type: 'USER_ID_CHANGE', participantId: this.participantId, assignedGroup: this.assignedGroup });
  }

  // --- 4 Experimental Study Groups Configuration & Random Assignment ---

  static get STUDY_GROUPS() {
    return [
      { id: 'google_sql_python', name: 'Google SQL with Python', sqlDialect: 'pipe', hostLanguage: 'python' },
      { id: 'google_sql_javascript', name: 'Google SQL with Javascript', sqlDialect: 'pipe', hostLanguage: 'javascript' },
      { id: 'quorum_python', name: 'Quorum with Python', sqlDialect: 'quorum', hostLanguage: 'python' },
      { id: 'quorum_javascript', name: 'Quorum with Javascript', sqlDialect: 'quorum', hostLanguage: 'javascript' }
    ];
  }

  getAllGroups() {
    return ParticipantAnalytics.STUDY_GROUPS;
  }

  getGroupById(id) {
    if (!id) return null;
    return ParticipantAnalytics.STUDY_GROUPS.find(g => g.id === id || g.name.toLowerCase() === String(id).toLowerCase()) || null;
  }

  isParticipantView() {
    if (typeof window !== 'undefined' && window.app && typeof window.app.isParticipantView === 'function') {
      return window.app.isParticipantView();
    }
    if (typeof document !== 'undefined') {
      if (document.getElementById('admin-interactive-menu') || document.getElementById('admin-sidebar-panel') || document.getElementById('btn-admin-logout')) {
        return false;
      }
      if (document.title && document.title.toLowerCase().includes('admin')) {
        return false;
      }
      if (document.title && document.title.toLowerCase().includes('participant')) {
        return true;
      }
    }
    if (typeof window !== 'undefined' && window.location && window.location.pathname) {
      const p = window.location.pathname.toLowerCase();
      if (p.includes('participant')) return true;
    }
    return false;
  }

  hasCompletedDemographics(pid = this.participantId) {
    const targetPid = pid || this.participantId;
    if (!targetPid) return false;
    if (!this.demographics) {
      this.demographics = this.loadDemographics();
    }
    const demo = this.demographics[targetPid];
    if (!demo) return false;

    const age = parseInt(demo.age, 10);
    if (isNaN(age) || age < 18) return false;
    const hasGender = demo.gender !== undefined && demo.gender !== null && demo.gender !== '';
    const hasEdu = (demo.education !== undefined && demo.education !== null && demo.education !== '') ||
                   (demo.academicStanding !== undefined && demo.academicStanding !== null && demo.academicStanding !== '') ||
                   (demo.highestEducation !== undefined && demo.highestEducation !== null && demo.highestEducation !== '');
    if (!hasGender || !hasEdu || demo.codingExp === undefined || demo.codingExp === '' || demo.dbExp === undefined || demo.dbExp === '') {
      return false;
    }
    if (demo.primaryLanguage !== undefined || demo.countryOfOrigin !== undefined) {
      if (!demo.primaryLanguage || !demo.countryOfOrigin) {
        return false;
      }
    }
    return true;
  }

  initAssignedGroup(pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    const groupStorageKey = `sql_study_assigned_group_${targetPid}`;

    // Optional query parameter override for testing/admin validation: ?group=google_sql_python
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('group') || params.get('study_group');
        if (forced) {
          const match = this.getGroupById(forced);
          if (match) {
            try { localStorage.setItem(groupStorageKey, JSON.stringify(match)); } catch (e) {}
            return match;
          }
        }
      } catch (e) {}
    }

    // In participant view: group is strictly decided AFTER demographics submission
    if (this.isParticipantView()) {
      if (this.hasCompletedDemographics(targetPid)) {
        try {
          const saved = localStorage.getItem(groupStorageKey);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.id && ParticipantAnalytics.STUDY_GROUPS.some(g => g.id === parsed.id)) {
              return parsed;
            }
          }
        } catch (e) {}

        const demo = (this.demographics && this.demographics[targetPid]) || this.getDemographics(targetPid);
        if (demo && (demo.assignedGroupId || demo.assignedGroup)) {
          const match = this.getGroupById(demo.assignedGroupId || demo.assignedGroup);
          if (match) {
            try { localStorage.setItem(groupStorageKey, JSON.stringify(match)); } catch (e) {}
            return match;
          }
        }

        return this.decideAssignedGroupAfterDemographics(targetPid);
      }

      // Demographics not completed yet: clear any premature group and return null
      try {
        localStorage.removeItem(groupStorageKey);
      } catch (e) {}
      return null;
    }

    // In admin view: return saved group or default to first group
    try {
      const saved = localStorage.getItem(groupStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && ParticipantAnalytics.STUDY_GROUPS.some(g => g.id === parsed.id)) {
          return parsed;
        }
      }
    } catch (e) {}

    return ParticipantAnalytics.STUDY_GROUPS[0];
  }

  getAssignedGroup(pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    const groupStorageKey = `sql_study_assigned_group_${targetPid}`;

    // Optional query parameter override for testing/admin validation: ?group=google_sql_python
    if (targetPid === this.participantId && typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('group') || params.get('study_group');
        if (forced) {
          const match = this.getGroupById(forced);
          if (match) return match;
        }
      } catch (e) {}
    }

    // 1. Check if recorded in demographics for targetPid
    try {
      const demo = (this.demographics && this.demographics[targetPid]) || this.getDemographics(targetPid);
      if (demo && (demo.assignedGroupId || demo.assignedGroup)) {
        const match = this.getGroupById(demo.assignedGroupId || demo.assignedGroup);
        if (match) return match;
      }
    } catch (e) {}

    // 2. Check saved in localStorage
    try {
      const saved = localStorage.getItem(groupStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && ParticipantAnalytics.STUDY_GROUPS.some(g => g.id === parsed.id)) {
          if (this.isParticipantView() && targetPid === this.participantId && !this.hasCompletedDemographics(targetPid)) {
            try { localStorage.removeItem(groupStorageKey); } catch (e) {}
            return null;
          }
          return parsed;
        }
      }
    } catch (e) {}

    // 3. In participant view for current participant:
    if (this.isParticipantView() && targetPid === this.participantId) {
      if (this.hasCompletedDemographics(targetPid)) {
        return this.decideAssignedGroupAfterDemographics(targetPid);
      }
      return null;
    }

    // 4. In admin view:
    if (!this.isParticipantView()) {
      return ParticipantAnalytics.STUDY_GROUPS[0];
    }

    return null;
  }

  decideAssignedGroupAfterDemographics(pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    const groupStorageKey = `sql_study_assigned_group_${targetPid}`;

    // 1. Check query parameter override (?group=...)
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('group') || params.get('study_group');
        if (forced) {
          const match = this.getGroupById(forced);
          if (match) {
            try { localStorage.setItem(groupStorageKey, JSON.stringify(match)); } catch (e) {}
            if (targetPid === this.participantId) this.assignedGroup = match;
            this.notify({ type: 'GROUP_CHANGE', participantId: targetPid, assignedGroup: match });
            return match;
          }
        }
      } catch (e) {}
    }

    // 2. Check if already decided for this participant
    try {
      const saved = localStorage.getItem(groupStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && ParticipantAnalytics.STUDY_GROUPS.some(g => g.id === parsed.id)) {
          if (targetPid === this.participantId) this.assignedGroup = parsed;
          return parsed;
        }
      }
    } catch (e) {}

    // 3. Round-robin assignment across the 4 groups.
    //    The server keeps a shared counter: the first participant gets a random
    //    group (1-4), each following participant gets the next group, wrapping 4 -> 1.
    const groups = ParticipantAnalytics.STUDY_GROUPS;
    let assignedIdx = this.requestRotatingGroupIndex(targetPid);

    if (assignedIdx === null) {
      // Fallback (backend unreachable / static hosting): per-browser rotation
      // using the same random-start + cycle rule.
      const rotationKey = 'sql_study_group_rotation_next_index';
      let nextIdx = NaN;
      try { nextIdx = parseInt(localStorage.getItem(rotationKey), 10); } catch (e) {}
      if (isNaN(nextIdx) || nextIdx < 0 || nextIdx >= groups.length) {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
          const array = new Uint32Array(1);
          window.crypto.getRandomValues(array);
          nextIdx = array[0] % groups.length;
        } else {
          nextIdx = Math.floor(Math.random() * groups.length);
        }
      }
      assignedIdx = nextIdx;
      try { localStorage.setItem(rotationKey, String((nextIdx + 1) % groups.length)); } catch (e) {}
    }

    const assigned = groups[assignedIdx];
    try {
      localStorage.setItem(groupStorageKey, JSON.stringify(assigned));
    } catch (e) {}

    if (targetPid === this.participantId) {
      this.assignedGroup = assigned;
    }
    this.notify({ type: 'GROUP_CHANGE', participantId: targetPid, assignedGroup: assigned });
    return assigned;
  }

  /**
   * Asynchronously prefetches this participant's round-robin group index (0-3)
   * from the backend so decideAssignedGroupAfterDemographics never blocks the main thread.
   */
  async prefetchRotatingGroupIndex(pid = this.participantId) {
    if (!pid || typeof fetch === 'undefined') return null;
    const cacheKey = `sql_study_prefetched_group_idx_${pid}`;
    try {
      const cached = sessionStorage.getItem(cacheKey) ?? localStorage.getItem(cacheKey);
      if (cached !== null && cached !== undefined) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < ParticipantAnalytics.STUDY_GROUPS.length) {
          return parsed;
        }
      }
    } catch (e) {}

    if (this._groupPrefetchPromises && this._groupPrefetchPromises[pid]) {
      return this._groupPrefetchPromises[pid];
    }

    const fetchPromise = (async () => {
      try {
        const res = await fetch(this.getApiUrl('/api/assign-group'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId: pid })
        });
        if (res.ok) {
          const data = await res.json();
          const idx = parseInt(data && data.groupIndex, 10);
          if (!isNaN(idx) && idx >= 0 && idx < ParticipantAnalytics.STUDY_GROUPS.length) {
            try {
              sessionStorage.setItem(cacheKey, String(idx));
              localStorage.setItem(cacheKey, String(idx));
            } catch (e) {}
            return idx;
          }
        }
      } catch (e) {
        // Backend offline or static hosting
      } finally {
        if (this._groupPrefetchPromises) {
          delete this._groupPrefetchPromises[pid];
        }
      }
      return null;
    })();

    if (this._groupPrefetchPromises) {
      this._groupPrefetchPromises[pid] = fetchPromise;
    }
    return fetchPromise;
  }

  /**
   * Ensures the server-assigned round-robin group index is resolved (with a bounded timeout)
   * before demographics are finalized, preventing fallback group drift on fast submissions.
   */
  async ensureGroupAssigned(pid = this.participantId, timeoutMs = 1500) {
    const targetPid = pid || this.participantId;
    if (!targetPid) return null;
    const existing = this.requestRotatingGroupIndex(targetPid);
    if (existing !== null) return existing;
    try {
      await Promise.race([
        this.prefetchRotatingGroupIndex(targetPid),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
      ]);
    } catch (e) {}
    return this.requestRotatingGroupIndex(targetPid);
  }

  /**
   * Returns the prefetched round-robin group index (0-3) without blocking the UI thread,
   * and triggers an async background sync if not yet cached.
   */
  requestRotatingGroupIndex(pid) {
    if (!pid) return null;
    const cacheKey = `sql_study_prefetched_group_idx_${pid}`;
    try {
      const cached = sessionStorage.getItem(cacheKey) ?? localStorage.getItem(cacheKey);
      if (cached !== null && cached !== undefined) {
        const idx = parseInt(cached, 10);
        if (!isNaN(idx) && idx >= 0 && idx < ParticipantAnalytics.STUDY_GROUPS.length) {
          return idx;
        }
      }
    } catch (e) {}
    // Kick off non-blocking fetch for future lookups
    this.prefetchRotatingGroupIndex(pid);
    return null;
  }

  setAssignedGroup(groupOrId, pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    const groupStorageKey = `sql_study_assigned_group_${targetPid}`;
    let match = typeof groupOrId === 'object' ? groupOrId : this.getGroupById(groupOrId);
    if (!match) match = ParticipantAnalytics.STUDY_GROUPS[0];

    try {
      localStorage.setItem(groupStorageKey, JSON.stringify(match));
    } catch (e) {}
    if (targetPid === this.participantId) {
      this.assignedGroup = match;
    }
    this.notify({ type: 'GROUP_CHANGE', participantId: targetPid, assignedGroup: match });
    return match;
  }

  initSessionId() {
    let sid = null;
    try { sid = sessionStorage.getItem(this.sessionIdKey); } catch (e) {}
    if (!sid) {
      sid = this.generateUniqueId('session');
      try { sessionStorage.setItem(this.sessionIdKey, sid); } catch (e) {}
    }
    return sid;
  }

  initRealtimeChannel() {
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('sql_study_telemetry_channel');
        this.channel.onmessage = (event) => {
          if (event.data) {
            this.responses = this.loadResponses();
            this.demographics = this.loadDemographics();
            this.finalThoughts = this.loadFinalThoughts();
            this.notify(event.data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey || e.key === this.demographicsKey || e.key === this.finalThoughtsKey) {
        this.responses = this.loadResponses();
        this.demographics = this.loadDemographics();
        this.finalThoughts = this.loadFinalThoughts();
        this.notify({ type: 'EXTERNAL_SYNC' });
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushPendingOutbox();
      });
      window.addEventListener('pagehide', () => {
        this.flushPendingOutbox(true);
      });
    }

    // Cross-device synchronization (polling) for the Admin Dashboard
    setInterval(() => {
      // Only poll if we are logged in as admin to avoid spamming 401s from normal participants
      if (window.adminAuth && window.adminAuth.getToken()) {
        this.syncWithDiskStorage(true);
      } else if (this.isParticipantView() && Array.isArray(this.pendingOutbox) && this.pendingOutbox.length > 0) {
        this.flushPendingOutbox();
      }
    }, 5000); // Check for new data or pending retries every 5 seconds
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  notify(payload) {
    this.callbacks.forEach(cb => {
      try { cb(payload); } catch (e) { console.error('Telemetry callback error:', e); }
    });
  }

  loadResponses() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveResponsesLocally() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.responses));
    } catch (e) {
      console.error('Failed to save responses to localStorage:', e);
    }
  }

  loadDemographics() {
    try {
      const data = localStorage.getItem(this.demographicsKey);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  loadFinalThoughts() {
    try {
      const data = localStorage.getItem(this.finalThoughtsKey);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  loadTrainingResponses() {
    try {
      const data = localStorage.getItem(this.trainingStorageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  loadPendingOutbox() {
    try {
      const raw = localStorage.getItem(this.outboxStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && item.studyVersion === this.studySchemaVersion && item.payload);
    } catch (e) {
      return [];
    }
  }

  savePendingOutbox() {
    try {
      localStorage.setItem(this.outboxStorageKey, JSON.stringify(this.pendingOutbox || []));
    } catch (e) {}
  }

  getApiUrl(path) {
    if (window.studyConfig && typeof window.studyConfig.getEndpoint === 'function') {
      return window.studyConfig.getEndpoint(path);
    }
    return path.startsWith('/') ? path : `/${path}`;
  }

  async syncWithDiskStorage(pullOnly = false) {
    if (this.isParticipantView()) {
      return;
    }
    try {
      const endpoint = this.getApiUrl('/api/load-telemetry');
      const token = (typeof window !== 'undefined' && window.adminAuth && typeof window.adminAuth.getToken === 'function')
        ? window.adminAuth.getToken()
        : '';
      const headers = token ? { 'X-Admin-Token': token, 'Authorization': 'Bearer ' + token } : {};
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const text = await res.text();
        let diskData = null;
        try { diskData = JSON.parse(text); } catch (e) {}

        if (diskData && typeof diskData === 'object') {
          let changed = false;

          if (diskData.responses && Array.isArray(diskData.responses)) {
            const map = new Map();
            this.responses.forEach(r => { if (r.id) map.set(r.id, r); });
            diskData.responses.forEach(r => {
              if (r.id && !map.has(r.id)) {
                map.set(r.id, r);
                changed = true;
              }
            });
            this.responses = Array.from(map.values());
          }

          if (diskData.demographics && typeof diskData.demographics === 'object') {
            Object.assign(this.demographics, diskData.demographics);
            localStorage.setItem(this.demographicsKey, JSON.stringify(this.demographics));
          }

          if (diskData.finalThoughts && typeof diskData.finalThoughts === 'object') {
            Object.assign(this.finalThoughts, diskData.finalThoughts);
            localStorage.setItem(this.finalThoughtsKey, JSON.stringify(this.finalThoughts));
          }

          if (diskData.demographics && Object.keys(diskData.demographics).length > 0) changed = true;
          if (diskData.finalThoughts && Object.keys(diskData.finalThoughts).length > 0) changed = true;

          if (changed) {
            this.saveResponsesLocally();
            this.notify({ type: 'DISK_SYNC' });
          }
        }
      }
    } catch (e) {
      // Backend offline or static hosting
    }
  }

  async pushToDiskStorage(incrementalData = null) {
    try {
      const payload = incrementalData ? { ...incrementalData, studyVersion: this.studySchemaVersion } : {};

      // If there's no incremental data to push, don't ping the server
      if (Object.keys(payload).length === 0) return;

      // Determine deterministic event key for deduplication & retry queue
      let eventKey = null;
      let eventPid = this.participantId;
      if (payload.newResponse && payload.newResponse.participantId) {
        eventPid = payload.newResponse.participantId;
        eventKey = `resp_${eventPid}_q${payload.newResponse.questionNumber}`;
      } else if (payload.newDemographic && payload.newDemographic.participantId) {
        eventPid = payload.newDemographic.participantId;
        eventKey = `demo_${eventPid}`;
      } else if (payload.newFinalThought && payload.newFinalThought.participantId) {
        eventPid = payload.newFinalThought.participantId;
        eventKey = `ft_${eventPid}`;
      }

      if (eventKey) {
        if (!Array.isArray(this.pendingOutbox)) {
          this.pendingOutbox = [];
        }
        const existingIdx = this.pendingOutbox.findIndex(item => item && item.eventKey === eventKey);
        const queueItem = {
          eventKey,
          participantId: eventPid,
          studyVersion: this.studySchemaVersion,
          payload,
          attempts: 0,
          queuedAt: Date.now()
        };
        if (existingIdx !== -1) {
          this.pendingOutbox[existingIdx] = queueItem;
        } else {
          this.pendingOutbox.push(queueItem);
        }
        this.savePendingOutbox();
        await this.flushPendingOutbox();
        return;
      }

      // Admin batch import or direct payload
      const endpoint = this.getApiUrl('/api/save-telemetry');
      const token = (typeof window !== 'undefined' && window.adminAuth && typeof window.adminAuth.getToken === 'function')
        ? window.adminAuth.getToken()
        : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['X-Admin-Token'] = token;
        headers['Authorization'] = 'Bearer ' + token;
      }
      await fetch(endpoint, {
        method: 'POST',
        headers,
        keepalive: true,
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Server offline fallback
    }
  }

  async flushPendingOutbox(useBeaconFallback = false) {
    if (!Array.isArray(this.pendingOutbox) || this.pendingOutbox.length === 0) return true;
    if (typeof fetch === 'undefined') return false;

    const endpoint = this.getApiUrl('/api/save-telemetry');

    // On pagehide/unload, attempt sendBeacon or keepalive fetch for any remaining items
    if (useBeaconFallback) {
      for (const item of this.pendingOutbox) {
        if (!item || !item.payload || item.studyVersion !== this.studySchemaVersion) continue;
        try {
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify(item.payload)
          }).catch(() => {});
        } catch (e) {}
      }
      return true;
    }

    if (this._isFlushingOutbox) return false;
    this._isFlushingOutbox = true;
    if (this._outboxRetryTimer) {
      clearTimeout(this._outboxRetryTimer);
      this._outboxRetryTimer = null;
    }

    let allSucceeded = true;
    let maxAttemptsSeen = 0;

    try {
      const token = (typeof window !== 'undefined' && window.adminAuth && typeof window.adminAuth.getToken === 'function')
        ? window.adminAuth.getToken()
        : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['X-Admin-Token'] = token;
        headers['Authorization'] = 'Bearer ' + token;
      }

      const snapshot = [...this.pendingOutbox];
      for (const item of snapshot) {
        if (!item || !item.payload || item.studyVersion !== this.studySchemaVersion) {
          this.pendingOutbox = this.pendingOutbox.filter(x => x !== item);
          continue;
        }
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            keepalive: true,
            body: JSON.stringify(item.payload)
          });
          if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
            this.pendingOutbox = this.pendingOutbox.filter(x => x && x.eventKey !== item.eventKey);
            this.savePendingOutbox();
          } else {
            item.attempts = (item.attempts || 0) + 1;
            maxAttemptsSeen = Math.max(maxAttemptsSeen, item.attempts);
            allSucceeded = false;
            this.savePendingOutbox();
          }
        } catch (err) {
          item.attempts = (item.attempts || 0) + 1;
          maxAttemptsSeen = Math.max(maxAttemptsSeen, item.attempts);
          allSucceeded = false;
          this.savePendingOutbox();
          break; // Stop sequential loop on network disconnect, retry later
        }
      }
    } finally {
      this._isFlushingOutbox = false;
    }

    if (!allSucceeded && this.pendingOutbox.length > 0) {
      const delayMs = Math.min(15000, Math.round(1500 * Math.pow(1.5, Math.min(6, maxAttemptsSeen))));
      this._outboxRetryTimer = setTimeout(() => {
        this._outboxRetryTimer = null;
        this.flushPendingOutbox();
      }, delayMs);
    }
    return allSucceeded;
  }

  async pushToCloudWebhook(incrementalData = null) {
    if (!incrementalData || Object.keys(incrementalData).length === 0) return;
    const webhookUrl = window.studyConfig ? window.studyConfig.getCloudWebhookUrl() : '';
    if (!webhookUrl) return;

    try {
      // Only send incremental telemetry events, never full localStorage state
      const payload = {
        ...incrementalData,
        studyVersion: this.studySchemaVersion
      };

      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Cloud webhook push:', e);
    }
  }

  async syncWithCloudWebhook() {
    const webhookUrl = window.studyConfig ? window.studyConfig.getCloudWebhookUrl() : '';
    if (!webhookUrl) return { success: false, message: 'No Cloud Webhook URL configured.' };

    try {
      const res = await fetch(webhookUrl);
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        if (data && (data.responses || data.status === 'success')) {
          const importResult = this.importTelemetryData(data);
          return { success: true, ...importResult };
        }
      }
      return { success: false, message: 'Cloud webhook returned invalid format.' };
    } catch (e) {
      return { success: false, message: e.message || 'Error connecting to cloud webhook.' };
    }
  }

  getPSTDateTime(date = new Date()) {
    const d = (typeof date === 'string' || typeof date === 'number') ? new Date(date) : date;
    const datePST = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
    const timePST = d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: true });
    return {
      datePST,
      timePST,
      dateTimePST: `${datePST} ${timePST} PST`
    };
  }

  logResponse(entry) {
    let existingResponses = this.getParticipantResponses(this.participantId);
    const maxQ = (typeof window !== 'undefined' && window.studyConfig && typeof window.studyConfig.getMaxQuestions === 'function')
      ? window.studyConfig.getMaxQuestions()
      : 25;

    const rawQ = parseInt(entry.questionNumber, 10);
    const resolvedQNum = (!isNaN(rawQ) && rawQ >= 1 && rawQ <= maxQ)
      ? rawQ
      : Math.min(maxQ, existingResponses.length + 1);

    // If participant is starting at Q1 and stale responses exist for this ID, purge stale responses so new answers are never dropped
    if (resolvedQNum === 1 && existingResponses.length >= maxQ) {
      this.responses = (this.responses || []).filter(r => r && r.participantId !== this.participantId);
      existingResponses = [];
    }

    const pst = this.getPSTDateTime();
    const assignedGroup = this.getAssignedGroup(this.participantId);
    const groupName = entry.assignedGroupName || entry.assignedGroup || (assignedGroup ? assignedGroup.name : 'Unknown');
    const groupId = entry.assignedGroupId || (assignedGroup ? assignedGroup.id : 'unknown');
    const hostLang = entry.hostLanguage || (assignedGroup ? assignedGroup.hostLanguage : 'javascript');
    const activeDialectKey = entry.activeDialect || (assignedGroup ? assignedGroup.sqlDialect : 'pipe');
    const activeDialectLabel = entry.activeDialectName || (activeDialectKey === 'quorum' ? 'Quorum Syntax' : 'Google SQL (Pipe Syntax)');

    const trainingSummary = this.getTrainingSummary(this.participantId, entry);
    const rtMsVal = Math.max(0, Math.round(entry.responseTimeMs || 0));
    const firstSelectMsVal = (entry.timeToFirstSelectMs !== undefined && entry.timeToFirstSelectMs !== null && entry.timeToFirstSelectMs !== '')
      ? Math.max(0, Math.round(Number(entry.timeToFirstSelectMs)))
      : rtMsVal;
    const confirmMsVal = (entry.decisionConfirmMs !== undefined && entry.decisionConfirmMs !== null && entry.decisionConfirmMs !== '')
      ? Math.max(0, Math.round(Number(entry.decisionConfirmMs)))
      : Math.max(0, rtMsVal - firstSelectMsVal);

    const canonicalCorrectKey = entry.correctKey || this.getCanonicalCorrectKey(resolvedQNum, false) || this.resolveCorrectKey(entry) || null;
    const isCorrectVal = (entry.isCorrect !== undefined && entry.isCorrect !== null)
      ? (entry.isCorrect ? 1 : 0)
      : ((canonicalCorrectKey && Number(entry.selectedKey) === Number(canonicalCorrectKey)) ? 1 : 0);

    const record = {
      id: `resp_${this.participantId}_q${resolvedQNum}_${Date.now().toString(36)}_${this.generateRandomHex(4)}`,
      studyVersion: this.studySchemaVersion,
      participantId: this.participantId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      timestampPST: pst.dateTimePST,
      datePST: pst.datePST,
      timePST: pst.timePST,
      assignedGroup: groupName,
      assignedGroupId: groupId,
      assignedGroupName: groupName,
      hostLanguage: hostLang,
      questionNumber: resolvedQNum,
      questionCategory: entry.questionCategory || 'General',
      codeStructure: entry.codeStructure || this.getStructureForQuestion(resolvedQNum),
      operatorCount: (entry.operatorCount !== undefined && entry.operatorCount !== null && entry.operatorCount !== '')
        ? Number(entry.operatorCount)
        : this.getOperatorCountForQuestion(resolvedQNum),
      activeDialect: activeDialectKey,
      activeDialectName: activeDialectLabel,
      rawQuery: entry.rawQuery || '',
      dialectSql: entry.dialectSql || entry.rawQuery || '',
      codeSnippet: entry.codeSnippet || entry.jsCode || entry.incompleteQuery || '',
      jsCode: entry.codeSnippet || entry.jsCode || entry.incompleteQuery || '',
      selectedKey: entry.selectedKey || null,
      correctKey: canonicalCorrectKey,
      selectedOptionText: entry.selectedOptionText || '',
      correctOptionText: entry.correctOptionText || '',
      isCorrect: isCorrectVal,
      responseTimeMs: rtMsVal,
      timeToFirstSelectMs: firstSelectMsVal,
      decisionConfirmMs: confirmMsVal,
      inputMethod: entry.inputMethod || 'mouse',
      tabFocusLost: entry.tabFocusLost ? 1 : 0,
      tabSwitchCount: entry.tabSwitchCount || 0,
      focusLostDurationMs: Math.max(0, Math.round(entry.focusLostDurationMs || 0)),
      answerChangeCount: Math.max(0, parseInt(entry.answerChangeCount, 10) || 0),
      trainingAccuracy: trainingSummary.trainingAccuracy,
      trainingTotalTimeS: trainingSummary.trainingTotalTimeS
    };

    // Replace any existing response for the same (participantId, questionNumber) rather than dropping new answers
    const existingIdx = this.responses.findIndex(
      r => r && r.participantId === this.participantId && Number(r.questionNumber) === resolvedQNum
    );
    if (existingIdx !== -1) {
      this.responses[existingIdx] = record;
    } else {
      this.responses.push(record);
    }
    this.saveResponsesLocally();

    this.pushToDiskStorage({ newResponse: record });
    this.pushToCloudWebhook({ newResponse: record });

    if (this.channel) {
      this.channel.postMessage({ type: 'NEW_RESPONSE', record });
    }
    this.notify({ type: 'NEW_RESPONSE', record });

    return record;
  }

  saveDemographics(demographicsData, pid = this.participantId) {
    if (!pid) return null;
    // Submitting demographics happens before training and Q1-Q25; purge any leftover responses for this pid
    this.responses = (this.responses || []).filter(r => r && r.participantId !== pid);
    this.trainingResponses = (this.trainingResponses || []).filter(r => r && r.participantId !== pid);
    this.saveResponsesLocally();
    try {
      localStorage.setItem(this.trainingStorageKey, JSON.stringify(this.trainingResponses));
      localStorage.removeItem('sql_study_completed_finished');
    } catch (e) {}

    const pst = this.getPSTDateTime();
    const assignedGroup = this.decideAssignedGroupAfterDemographics(pid);
    const record = {
      participantId: pid,
      sessionId: this.sessionId,
      studyVersion: this.studySchemaVersion,
      assignedGroup: assignedGroup ? assignedGroup.name : '',
      assignedGroupId: assignedGroup ? assignedGroup.id : '',
      assignedGroupName: assignedGroup ? assignedGroup.name : '',
      hostLanguage: assignedGroup ? assignedGroup.hostLanguage : '',
      sqlDialect: assignedGroup ? assignedGroup.sqlDialect : '',
      ...demographicsData,
      savedAtTimestamp: Date.now(),
      timestamp: new Date().toISOString(),
      timestampPST: pst.dateTimePST,
      datePST: pst.datePST,
      timePST: pst.timePST
    };

    this.demographics[pid] = record;
    try {
      localStorage.setItem(this.demographicsKey, JSON.stringify(this.demographics));
    } catch (e) {}

    this.pushToDiskStorage({ newDemographic: record });
    this.pushToCloudWebhook({ newDemographic: record });

    if (this.channel) {
      this.channel.postMessage({ type: 'DEMOGRAPHICS_UPDATE', demographics: record });
    }
    this.notify({ type: 'DEMOGRAPHICS_UPDATE', demographics: record });
    return record;
  }

  getDemographics(pid = this.participantId) {
    return (pid && this.demographics[pid]) ? this.demographics[pid] : null;
  }

  saveFinalThoughts(thoughtsData, pid = this.participantId) {
    if (!pid) return null;
    const pst = this.getPSTDateTime();
    const assignedGroup = this.getAssignedGroup(pid);

    let thoughtsText = '';
    let likertRatings = null;
    let durationExpectation = '';
    if (typeof thoughtsData === 'object' && thoughtsData !== null) {
      thoughtsText = thoughtsData.thoughts || '';
      likertRatings = thoughtsData.ratings || thoughtsData.likertRatings || null;
      durationExpectation = thoughtsData.durationExpectation || thoughtsData.durationExpected || thoughtsData.tookLongerThanExpected || '';
    } else {
      thoughtsText = String(thoughtsData || '');
    }

    const lr = likertRatings || {};
    const pickLikert = (shortKey, fullKey) => {
      for (const candidate of [lr[fullKey], lr[shortKey], thoughtsData && thoughtsData[fullKey], thoughtsData && thoughtsData[shortKey]]) {
        if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
      }
      return '';
    };
    const record = {
      participantId: pid,
      sessionId: this.sessionId,
      studyVersion: this.studySchemaVersion,
      assignedGroup: assignedGroup ? assignedGroup.name : '',
      assignedGroupId: assignedGroup ? assignedGroup.id : '',
      assignedGroupName: assignedGroup ? assignedGroup.name : '',
      thoughts: thoughtsText,
      likertRatings: likertRatings,
      likert_clarity: pickLikert('clarity', 'likert_clarity'),
      likert_difficulty: pickLikert('difficulty', 'likert_difficulty'),
      likert_interface: pickLikert('interface', 'likert_interface'),
      likert_experience: pickLikert('experience', 'likert_experience'),
      durationExpectation: durationExpectation,
      savedAtTimestamp: Date.now(),
      timestamp: new Date().toISOString(),
      timestampPST: pst.dateTimePST,
      datePST: pst.datePST,
      timePST: pst.timePST
    };

    this.finalThoughts[pid] = record;
    try {
      localStorage.setItem(this.finalThoughtsKey, JSON.stringify(this.finalThoughts));
    } catch (e) {}

    this.pushToDiskStorage({ newFinalThought: record });
    this.pushToCloudWebhook({ newFinalThought: record });

    if (this.channel) {
      this.channel.postMessage({ type: 'FINAL_THOUGHTS_UPDATE', finalThought: record });
    }
    this.notify({ type: 'FINAL_THOUGHTS_UPDATE', finalThought: record });
    return record;
  }

  getFinalThoughts(pid = this.participantId) {
    return (pid && this.finalThoughts[pid]) ? this.finalThoughts[pid] : null;
  }

  logTrainingResponse(data) {
    const pid = data.participantId || this.participantId;
    const tQNum = parseInt(data.questionNumber, 10) || 1;
    const canonicalKey = data.correctKey || this.getCanonicalCorrectKey(tQNum, true) || null;
    const isCorrectVal = (data.isCorrect !== undefined && data.isCorrect !== null)
      ? (data.isCorrect ? 1 : 0)
      : ((canonicalKey && Number(data.selectedKey) === Number(canonicalKey)) ? 1 : 0);
    const record = Object.assign({
      id: `train_${pid}_t${tQNum}_${Date.now().toString(36)}_${this.generateRandomHex(4)}`,
      participantId: pid,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      isTraining: true
    }, data, {
      correctKey: canonicalKey,
      isCorrect: isCorrectVal
    });

    if (!Array.isArray(this.trainingResponses)) {
      this.trainingResponses = [];
    }
    const qNum = parseInt(record.questionNumber, 10);
    const existingIdx = !isNaN(qNum)
      ? this.trainingResponses.findIndex(r => r.participantId === pid && parseInt(r.questionNumber, 10) === qNum)
      : -1;
    if (existingIdx >= 0) {
      this.trainingResponses[existingIdx] = record;
    } else {
      this.trainingResponses.push(record);
    }
    try {
      localStorage.setItem(this.trainingStorageKey, JSON.stringify(this.trainingResponses));
    } catch (e) {}
    return record;
  }

  getTrainingResponses(participantId = this.participantId) {
    if (!Array.isArray(this.trainingResponses)) {
      this.trainingResponses = this.loadTrainingResponses();
    }
    return this.trainingResponses.filter(r => r.participantId === participantId);
  }

  getTrainingSummary(participantId = this.participantId, fallbackResponse = null) {
    if (fallbackResponse) {
      const acc = fallbackResponse.trainingAccuracy ?? fallbackResponse.training_accuracy;
      const timeS = fallbackResponse.trainingTotalTimeS ?? fallbackResponse.training_total_time_s;
      if (acc !== undefined && acc !== null && acc !== '' && timeS !== undefined && timeS !== null && timeS !== '') {
        return { trainingAccuracy: acc, trainingTotalTimeS: timeS };
      }
    }
    const tResps = this.getTrainingResponses(participantId);
    if (tResps && tResps.length > 0) {
      const correctCount = tResps.filter(r => this.toBinary(r.isCorrect) === 1).length;
      const totalMs = tResps.reduce((sum, r) => sum + (parseInt(r.responseTimeMs, 10) || 0), 0);
      return {
        trainingAccuracy: Math.round((correctCount / tResps.length) * 10000) / 100,
        trainingTotalTimeS: Math.round((totalMs / 1000.0) * 1000) / 1000
      };
    }
    if (Array.isArray(this.responses)) {
      const userResps = this.responses.filter(r => r.participantId === participantId);
      for (const r of userResps) {
        const acc = r.trainingAccuracy ?? r.training_accuracy;
        const timeS = r.trainingTotalTimeS ?? r.training_total_time_s;
        if (acc !== undefined && acc !== null && acc !== '') {
          return { trainingAccuracy: acc, trainingTotalTimeS: timeS ?? '' };
        }
      }
    }
    return { trainingAccuracy: '', trainingTotalTimeS: '' };
  }

  hasCompletedTraining(pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    try {
      return localStorage.getItem('sql_study_training_completed_' + targetPid) === 'true';
    } catch (e) {
      return false;
    }
  }

  setTrainingCompleted(completed = true, pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    try {
      if (completed) {
        localStorage.setItem('sql_study_training_completed_' + targetPid, 'true');
      } else {
        localStorage.removeItem('sql_study_training_completed_' + targetPid);
      }
    } catch (e) {}
  }

  getAllResponses() {
    return this.responses;
  }

  getParticipantResponses(participantId = this.participantId) {
    return this.responses.filter(r => r.participantId === participantId && !r.isTraining && r.questionNumber !== 'consent' && r.questionNumber !== 'intake' && !String(r.questionNumber).startsWith('training'));
  }

  getAnalyticsSummary() {
    const total = this.responses.length;
    const allUserIds = new Set();
    this.responses.forEach(r => { if (r.participantId) allUserIds.add(r.participantId); });
    Object.keys(this.demographics || {}).forEach(pid => { if (pid) allUserIds.add(pid); });
    Object.keys(this.finalThoughts || {}).forEach(pid => { if (pid) allUserIds.add(pid); });

    const uniqueParticipants = allUserIds.size;

    if (total === 0) {
      return {
        totalResponses: 0,
        uniqueParticipants: uniqueParticipants,
        overallAccuracy: 0,
        avgResponseTimeMs: 0,
        totalAnswerChanges: 0,
        avgAnswerChanges: '0.00',
        dialectStats: {},
        categoryStats: {}
      };
    }

    let totalAnswerChanges = 0;
    const correctCount = this.responses.filter(r => r.isCorrect).length;
    const overallAccuracy = Math.round((correctCount / total) * 100);
    const avgResponseTimeMs = Math.round(this.responses.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / total);

    const dialectStats = {};
    const categoryStats = {};
    const groupStats = {
      'Google SQL with Python': { total: 0, correct: 0, totalTime: 0 },
      'Google SQL with Javascript': { total: 0, correct: 0, totalTime: 0 },
      'Quorum with Python': { total: 0, correct: 0, totalTime: 0 },
      'Quorum with Javascript': { total: 0, correct: 0, totalTime: 0 }
    };

    this.responses.forEach(r => {
      const dKey = r.activeDialectName || r.activeDialect || 'Unknown';
      if (!dialectStats[dKey]) dialectStats[dKey] = { total: 0, correct: 0, totalTime: 0 };
      dialectStats[dKey].total++;
      if (r.isCorrect) dialectStats[dKey].correct++;
      dialectStats[dKey].totalTime += (r.responseTimeMs || 0);

      const cKey = r.questionCategory || 'General';
      if (!categoryStats[cKey]) categoryStats[cKey] = { total: 0, correct: 0, totalTime: 0 };
      categoryStats[cKey].total++;
      if (r.isCorrect) categoryStats[cKey].correct++;
      categoryStats[cKey].totalTime += (r.responseTimeMs || 0);

      const gKey = r.assignedGroupName || r.assignedGroup || (this.getAssignedGroup(r.participantId) ? this.getAssignedGroup(r.participantId).name : 'Unknown');
      if (!groupStats[gKey]) groupStats[gKey] = { total: 0, correct: 0, totalTime: 0 };
      groupStats[gKey].total++;
      if (r.isCorrect) groupStats[gKey].correct++;
      groupStats[gKey].totalTime += (r.responseTimeMs || 0);

      totalAnswerChanges += (r.answerChangeCount || 0);
    });

    Object.keys(dialectStats).forEach(k => {
      const s = dialectStats[k];
      s.accuracy = Math.round((s.correct / s.total) * 100);
      s.avgTimeMs = Math.round(s.totalTime / s.total);
    });

    Object.keys(categoryStats).forEach(k => {
      const s = categoryStats[k];
      s.accuracy = Math.round((s.correct / s.total) * 100);
      s.avgTimeMs = Math.round(s.totalTime / s.total);
    });

    Object.keys(groupStats).forEach(k => {
      const s = groupStats[k];
      s.accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      s.avgTimeMs = s.total > 0 ? Math.round(s.totalTime / s.total) : 0;
    });

    const avgAnswerChanges = total > 0 ? (totalAnswerChanges / total).toFixed(2) : '0.00';

    return {
      totalResponses: total,
      uniqueParticipants,
      overallAccuracy,
      avgResponseTimeMs,
      totalAnswerChanges,
      avgAnswerChanges,
      dialectStats,
      categoryStats,
      groupStats
    };
  }

  getResponsesGroupedByParticipant() {
    const groups = {};
    const allUserIds = new Set();
    this.responses.forEach(r => { if (r.participantId) allUserIds.add(r.participantId); });
    Object.keys(this.demographics || {}).forEach(pid => { if (pid) allUserIds.add(pid); });
    Object.keys(this.finalThoughts || {}).forEach(pid => { if (pid) allUserIds.add(pid); });

    allUserIds.forEach(uid => {
      const assigned = this.getAssignedGroup(uid);
      const demo = (this.demographics && this.demographics[uid]) || {};
      groups[uid] = {
        participantId: uid,
        assignedGroup: assigned ? assigned.name : (demo.assignedGroupName || demo.assignedGroup || 'Unassigned'),
        assignedGroupId: assigned ? assigned.id : (demo.assignedGroupId || 'unassigned'),
        assignedGroupName: assigned ? assigned.name : (demo.assignedGroupName || demo.assignedGroup || 'Unassigned'),
        hostLanguage: assigned ? assigned.hostLanguage : (demo.hostLanguage || ''),
        sqlDialect: assigned ? assigned.sqlDialect : (demo.sqlDialect || ''),
        responses: [],
        totalAnswers: 0,
        correctCount: 0,
        totalTimeMs: 0,
        focusLostCount: 0,
        totalAnswerChanges: 0,
        lastActive: null
      };
    });

    this.responses.forEach(r => {
      const uid = r.participantId || 'Anonymous';
      if (!groups[uid]) {
        const assigned = this.getAssignedGroup(uid);
        const demo = (this.demographics && this.demographics[uid]) || {};
        groups[uid] = {
          participantId: uid,
          assignedGroup: assigned ? assigned.name : (demo.assignedGroupName || demo.assignedGroup || 'Unassigned'),
          assignedGroupId: assigned ? assigned.id : (demo.assignedGroupId || 'unassigned'),
          assignedGroupName: assigned ? assigned.name : (demo.assignedGroupName || demo.assignedGroup || 'Unassigned'),
          hostLanguage: assigned ? assigned.hostLanguage : (demo.hostLanguage || ''),
          sqlDialect: assigned ? assigned.sqlDialect : (demo.sqlDialect || ''),
          responses: [],
          totalAnswers: 0,
          correctCount: 0,
          totalTimeMs: 0,
          focusLostCount: 0,
          totalAnswerChanges: 0,
          lastActive: r.timestamp
        };
      }
      groups[uid].responses.push(r);
      groups[uid].totalAnswers++;
      if (r.isCorrect) groups[uid].correctCount++;
      groups[uid].totalTimeMs += (r.responseTimeMs || 0);
      if (r.tabFocusLost) groups[uid].focusLostCount++;
      groups[uid].totalAnswerChanges = (groups[uid].totalAnswerChanges || 0) + (r.answerChangeCount || 0);
      if (!groups[uid].lastActive || new Date(r.timestamp) > new Date(groups[uid].lastActive)) {
        groups[uid].lastActive = r.timestamp;
      }
    });

    Object.keys(groups).forEach(uid => {
      const g = groups[uid];
      g.accuracy = g.totalAnswers > 0 ? Math.round((g.correctCount / g.totalAnswers) * 100) : 0;
      g.avgTimeMs = g.totalAnswers > 0 ? Math.round(g.totalTimeMs / g.totalAnswers) : 0;
      g.totalAnswerChanges = g.totalAnswerChanges || 0;
      g.avgAnswerChanges = g.totalAnswers > 0 ? (g.totalAnswerChanges / g.totalAnswers).toFixed(2) : '0.00';
      g.demographics = this.getDemographics(uid);
      g.finalThoughts = this.getFinalThoughts(uid);
      if (!g.lastActive && g.demographics && g.demographics.timestamp) {
        g.lastActive = g.demographics.timestamp;
      }
      if (g.demographics && g.demographics.assignedGroupName) {
        g.assignedGroupName = g.demographics.assignedGroupName;
        g.assignedGroup = g.demographics.assignedGroupName;
      }
      // Sort responses by the time they were taken, with newest entries at the top
      g.responses.sort((a, b) => {
        const parseTime = (item) => {
          if (!item) return 0;
          if (typeof item === 'number') return item;
          if (typeof item === 'string') {
            const d = new Date(item).getTime();
            return isNaN(d) ? 0 : d;
          }
          if (item.timestamp) {
            const d = new Date(item.timestamp).getTime();
            if (!isNaN(d)) return d;
          }
          if (item.timestampPST) {
            const d = new Date(item.timestampPST).getTime();
            if (!isNaN(d)) return d;
          }
          if (item.datePST && item.timePST) {
            const d = new Date(`${item.datePST} ${item.timePST}`).getTime();
            if (!isNaN(d)) return d;
          }
          if (typeof item.id === 'string' && item.id.startsWith('resp_')) {
            const parts = item.id.split('_');
            const num = parseInt(parts[1], 10);
            if (!isNaN(num) && num > 1000000000000) return num;
          }
          return 0;
        };
        const diff = parseTime(b) - parseTime(a);
        if (diff !== 0) return diff;
        return (b.questionNumber || 0) - (a.questionNumber || 0);
      });
    });

    return groups;
  }

  getParticipantAverageResponseTime(participantId = this.participantId) {
    if (!participantId) return 0;
    const userResponses = this.responses.filter(r => r.participantId === participantId);
    if (!userResponses || userResponses.length === 0) return 0;
    const totalTime = userResponses.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0);
    return Math.round(totalTime / userResponses.length);
  }

  // --- Telemetry Import Pipeline ---

  importTelemetryData(data) {
    if (!data) return { importedCount: 0, newUsers: 0 };
    let importedCount = 0;
    const initialUsers = new Set(this.responses.map(r => r.participantId)).size;

    const incomingResponses = data.responses || (Array.isArray(data) ? data : []);
    const incomingDemos = data.demographics || {};
    const incomingThoughts = data.finalThoughts || {};

    const map = new Map();
    this.responses.forEach(r => { if (r.id) map.set(r.id, r); });

    incomingResponses.forEach(r => {
      if (r && typeof r === 'object') {
        const id = r.id || ('resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        if (!map.has(id)) {
          r.id = id;
          map.set(id, r);
          importedCount++;
        }
      }
    });

    this.responses = Array.from(map.values());
    Object.assign(this.demographics, incomingDemos);
    Object.assign(this.finalThoughts, incomingThoughts);

    this.saveResponsesLocally();
    try {
      localStorage.setItem(this.demographicsKey, JSON.stringify(this.demographics));
      localStorage.setItem(this.finalThoughtsKey, JSON.stringify(this.finalThoughts));
    } catch (e) {}

    const finalUsers = new Set(this.responses.map(r => r.participantId)).size;
    const newUsers = Math.max(0, finalUsers - initialUsers);

    if (!this.isParticipantView()) {
      this.pushToDiskStorage({
        responses: incomingResponses,
        demographics: incomingDemos,
        finalThoughts: incomingThoughts
      });
    }
    if (this.channel) {
      this.channel.postMessage({ type: 'IMPORT_SYNC', importedCount, newUsers });
    }
    this.notify({ type: 'IMPORT_SYNC', importedCount, newUsers });

    return { importedCount, newUsers };
  }

  importFromJSON(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      return this.importTelemetryData(data);
    } catch (e) {
      throw new Error('Invalid JSON: ' + e.message);
    }
  }

  importFromCSV(csvText) {
    try {
      const lines = csvText.trim().split(/\r?\n/);
      if (lines.length <= 1) return { importedCount: 0, newUsers: 0 };

      // Helper to parse standard CSV line with quotes
      const parseCSVLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (c === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
          } else {
            cur += c;
          }
        }
        result.push(cur);
        return result;
      };

      const headers = parseCSVLine(lines[0]);
      const headerMap = {};
      headers.forEach((h, idx) => {
        const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        headerMap[clean] = idx;
      });

      const getVal = (row, names, fallbackIdx) => {
        for (const name of names) {
          const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (headerMap[clean] !== undefined && row[headerMap[clean]] !== undefined) {
            return row[headerMap[clean]];
          }
        }
        return (fallbackIdx !== undefined && row[fallbackIdx] !== undefined) ? row[fallbackIdx] : '';
      };

      const responses = [];
      const demographics = {};
      const finalThoughts = {};

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCSVLine(lines[i]);
        if (row.length < 5) continue;

        const pid = getVal(row, ['participant_id', 'Participant ID', 'participantId'], 1) || 'user_imported';
        const assignedGroupVal = getVal(row, ['assigned_group', 'Assigned Group', 'assignedGroup', 'assignedGroupName'], undefined);
        const assignedGroupIdVal = getVal(row, ['assigned_group_id', 'Assigned Group ID', 'assignedGroupId'], undefined);
        const hostLangVal = getVal(row, ['host_language', 'Host Language', 'hostLanguage'], undefined);
        const codeVal = getVal(row, ['code_snippet', 'Code Snippet', 'codeSnippet', 'JS Code Snippet', 'jsCode'], undefined);

        const rawCorrect = getVal(row, ['is_correct', 'Is Correct', 'isCorrect'], undefined);
        const isCorrectParsed = (rawCorrect === 1 || rawCorrect === '1' || String(rawCorrect).trim().toUpperCase() === 'TRUE');

        const rawFocus = getVal(row, ['tab_focus_lost', 'Tab Focus Lost', 'tabFocusLost'], undefined);
        const focusLostParsed = (rawFocus === 1 || rawFocus === '1' || String(rawFocus).trim().toUpperCase() === 'TRUE');

        const activeDialectVal = getVal(row, ['syntax_dialect_id', 'Syntax Dialect ID', 'activeDialect'], undefined) || 'pipe';
        const activeDialectNameVal = getVal(row, ['syntax_dialect_name', 'Syntax Dialect Name', 'activeDialectName'], undefined)
          || (activeDialectVal === 'quorum' ? 'Quorum Syntax' : 'Google SQL (Pipe Syntax)');

        const rawSelectedKey = getVal(row, ['selected_key', 'Selected Key (1-4)', 'selectedKey'], undefined);
        const parsedSelectedKey = rawSelectedKey ? parseInt(rawSelectedKey, 10) : null;
        const rawSelectedOpt = getVal(row, ['selected_option', 'Selected Option', 'selectedOptionText'], undefined);
        const selectedOptionTextVal = rawSelectedOpt || (parsedSelectedKey >= 1 && parsedSelectedKey <= 4 ? `Option ${String.fromCharCode(64 + parsedSelectedKey)}` : '');

        const rawCorrectOpt = getVal(row, ['correct_option', 'Correct Option', 'correctOptionText', 'correct_key', 'correctKey'], undefined);
        const parsedCorrectKey = this.resolveCorrectKey({ correctKey: rawCorrectOpt, correctOptionText: rawCorrectOpt });
        const correctOptionTextVal = (rawCorrectOpt && isNaN(Number(rawCorrectOpt)))
          ? rawCorrectOpt
          : (parsedCorrectKey >= 1 && parsedCorrectKey <= 4 ? `Option ${String.fromCharCode(64 + Number(parsedCorrectKey))}` : '');

        const qNumParsed = parseInt(getVal(row, ['question_number', 'Question Number', 'questionNumber'], 4), 10) || 1;
        const rawCodeStruct = getVal(row, ['code_structure', 'Code Structure', 'codeStructure'], undefined);
        const rawOpCount = getVal(row, ['operator_count', 'Operator Count', 'operatorCount'], undefined);
        const rawFirstSelectMs = getVal(row, ['time_to_first_select_ms', 'Time to First Select (ms)', 'timeToFirstSelectMs'], undefined);
        const rawConfirmMs = getVal(row, ['decision_confirm_ms', 'Decision Confirm (ms)', 'decisionConfirmMs'], undefined);
        const rawInputMethod = getVal(row, ['input_method', 'Input Method', 'inputMethod'], undefined);
        const rawTrainAcc = getVal(row, ['training_accuracy', 'Training Accuracy', 'trainingAccuracy'], undefined);
        const rawTrainTimeS = getVal(row, ['training_total_time_s', 'Training Total Time (s)', 'trainingTotalTimeS'], undefined);

        const resp = {
          id: getVal(row, ['response_id', 'Response ID', 'id'], 0) || ('resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
          participantId: pid,
          sessionId: getVal(row, ['session_id', 'Session ID', 'sessionId'], 2) || '',
          timestamp: getVal(row, ['timestamp_iso', 'Timestamp (ISO)', 'timestamp'], 3) || new Date().toISOString(),
          questionNumber: qNumParsed,
          questionCategory: getVal(row, ['question_category', 'Question Category', 'questionCategory'], 6) || 'General',
          codeStructure: rawCodeStruct ? parseInt(rawCodeStruct, 10) : this.getStructureForQuestion(qNumParsed),
          operatorCount: rawOpCount ? parseInt(rawOpCount, 10) : this.getOperatorCountForQuestion(qNumParsed),
          assignedGroup: assignedGroupVal || '',
          assignedGroupId: assignedGroupIdVal || '',
          assignedGroupName: assignedGroupVal || '',
          hostLanguage: hostLangVal || '',
          activeDialect: activeDialectVal,
          activeDialectName: activeDialectNameVal,
          selectedKey: parsedSelectedKey,
          correctKey: parsedCorrectKey || null,
          selectedOptionText: selectedOptionTextVal,
          correctOptionText: correctOptionTextVal,
          isCorrect: isCorrectParsed ? 1 : 0,
          responseTimeMs: parseInt(getVal(row, ['response_time_ms', 'Response Time (ms)', 'responseTimeMs'], undefined), 10) || 0,
          timeToFirstSelectMs: rawFirstSelectMs !== '' && rawFirstSelectMs !== undefined ? parseInt(rawFirstSelectMs, 10) : '',
          decisionConfirmMs: rawConfirmMs !== '' && rawConfirmMs !== undefined ? parseInt(rawConfirmMs, 10) : '',
          inputMethod: rawInputMethod || '',
          tabFocusLost: focusLostParsed ? 1 : 0,
          tabSwitchCount: parseInt(getVal(row, ['tab_switch_count', 'Tab Switch Count', 'tabSwitchCount'], undefined), 10) || 0,
          focusLostDurationMs: parseInt(getVal(row, ['focus_lost_duration_ms', 'Focus Lost Duration (ms)', 'focusLostDurationMs'], undefined), 10) || 0,
          answerChangeCount: parseInt(getVal(row, ['answer_change_count', 'Answer Change Count', 'Answer Changes', 'answerChangeCount'], undefined), 10) || 0,
          trainingAccuracy: rawTrainAcc !== '' && rawTrainAcc !== undefined ? Number(rawTrainAcc) : '',
          trainingTotalTimeS: rawTrainTimeS !== '' && rawTrainTimeS !== undefined ? Number(rawTrainTimeS) : '',
          rawQuery: getVal(row, ['raw_query', 'Raw SQL Query', 'rawQuery'], undefined) || '',
          dialectSql: getVal(row, ['dialect_sql', 'Dialect SQL Query', 'dialectSql'], undefined) || '',
          codeSnippet: codeVal || '',
          jsCode: codeVal || ''
        };
        responses.push(resp);

        const age = getVal(row, ['age', 'Age'], undefined);
        const gender = getVal(row, ['gender_label', 'gender', 'Gender'], undefined);
        const education = getVal(row, ['education_label', 'education', 'highest_education', 'Highest Level of Education', 'Education', 'Academic Standing', 'academicStanding'], undefined);

        if (!demographics[pid] && (age || gender || education)) {
          demographics[pid] = {
            participantId: pid,
            assignedGroup: assignedGroupVal || '',
            assignedGroupId: assignedGroupIdVal || '',
            assignedGroupName: assignedGroupVal || '',
            hostLanguage: hostLangVal || '',
            age: age || '',
            gender: gender || '',
            education: education || '',
            highestEducation: education || '',
            academicStanding: education || '',
            codingExp: getVal(row, ['coding_exp_years', 'Programming Experience', 'Coding Experience', 'codingExp'], undefined) || '',
            dbExp: getVal(row, ['db_exp_years', 'Database Experience', 'dbExp'], undefined) || '',
            primaryLanguage: getVal(row, ['primary_language', 'Primary Language', 'primaryLanguage'], undefined) || '',
            countryOfOrigin: getVal(row, ['country_of_origin', 'Country of Origin', 'countryOfOrigin'], undefined) || '',
            disability: getVal(row, ['disability_status', 'Disability Status', 'disability'], undefined) || '',
            queryExp: getVal(row, ['Query Writing Experience', 'queryExp'], undefined) || 'Completed via updated survey',
            timestamp: resp.timestamp || new Date().toISOString()
          };
        }

        const likertClarity = getVal(row, ['likert_clarity', 'Likert Clarity'], undefined);
        const likertDifficulty = getVal(row, ['likert_difficulty', 'Likert Difficulty'], undefined);
        const likertInterface = getVal(row, ['likert_interface', 'Likert Interface'], undefined);
        const likertExperience = getVal(row, ['likert_experience', 'Likert Experience'], undefined);
        const durationExpectation = getVal(row, ['duration_expectation', 'Duration Expectation', 'durationExpectation'], undefined);
        const thoughts = getVal(row, ['final_thoughts', 'Final Thoughts', 'finalThoughts'], undefined);

        if (!finalThoughts[pid] && (thoughts || durationExpectation || likertClarity || likertDifficulty || likertInterface || likertExperience)) {
          finalThoughts[pid] = {
            participantId: pid,
            thoughts: thoughts || '',
            durationExpectation: durationExpectation || '',
            likert_clarity: likertClarity !== '' ? Number(likertClarity) : '',
            likert_difficulty: likertDifficulty !== '' ? Number(likertDifficulty) : '',
            likert_interface: likertInterface !== '' ? Number(likertInterface) : '',
            likert_experience: likertExperience !== '' ? Number(likertExperience) : '',
            likertRatings: {
              clarity: likertClarity !== '' ? Number(likertClarity) : undefined,
              difficulty: likertDifficulty !== '' ? Number(likertDifficulty) : undefined,
              interface: likertInterface !== '' ? Number(likertInterface) : undefined,
              experience: likertExperience !== '' ? Number(likertExperience) : undefined
            },
            timestamp: resp.timestamp || new Date().toISOString()
          };
        }
      }

      return this.importTelemetryData({ responses, demographics, finalThoughts });
    } catch (e) {
      throw new Error('Invalid CSV: ' + e.message);
    }
  }

  importFromToken(tokenText) {
    try {
      const clean = tokenText.trim();
      const decoded = decodeURIComponent(escape(atob(clean)));
      const data = JSON.parse(decoded);
      return this.importTelemetryData(data);
    } catch (e) {
      throw new Error('Invalid submission token code: ' + e.message);
    }
  }

  getParticipantToken(participantId = this.participantId) {
    const userResponses = this.getParticipantResponses(participantId);
    const demo = this.getDemographics(participantId);
    const thoughts = this.getFinalThoughts(participantId);

    const payload = {
      participantId,
      responses: userResponses,
      demographics: demo ? { [participantId]: demo } : {},
      finalThoughts: thoughts ? { [participantId]: thoughts } : {}
    };

    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  downloadParticipantJSON(participantId = this.participantId) {
    const userResponses = this.getParticipantResponses(participantId);
    const demo = this.getDemographics(participantId);
    const thoughts = this.getFinalThoughts(participantId);

    const payload = {
      participantId,
      exportedAt: new Date().toISOString(),
      responses: userResponses,
      demographics: demo ? { [participantId]: demo } : {},
      finalThoughts: thoughts ? { [participantId]: thoughts } : {}
    };

    this.downloadBlob(JSON.stringify(payload, null, 2), `study_submission_${participantId}.json`, 'application/json');
  }

  // --- Statistical / ANOVA Data Helpers ---

  parseNum(val, defaultVal = 0.0) {
    if (val === null || val === undefined || val === '') return defaultVal;
    if (typeof val === 'number') return val;
    const s = String(val).trim().toLowerCase();
    if (s.includes('none') || s.startsWith('no ')) return 0.0;
    if (s.includes('< 1') || s.includes('<1')) return 0.5;
    const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
      return Math.round(((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2.0) * 100) / 100;
    }
    const match = s.match(/(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
    return defaultVal;
  }

  parseAge(val) {
    if (val === null || val === undefined || val === '') return '';
    const match = String(val).match(/\d+/);
    return match ? parseInt(match[0], 10) : '';
  }

  parseEducationInfo(val) {
    const EDUCATION_LABELS = {
      0: 'High School / GED',
      1: 'Some college / university',
      2: 'Associate Degree',
      3: 'Bachelor Degree',
      4: 'Masters Degree',
      5: 'Ph. D.',
      6: 'Other'
    };
    if (val === null || val === undefined || val === '') {
      return { code: '', label: '', has_degree: 0 };
    }
    const s = String(val).trim().toLowerCase();
    if (/^\d+$/.test(s)) {
      const code = parseInt(s, 10);
      const label = EDUCATION_LABELS[code] || 'Other';
      return { code, label, has_degree: (code >= 3 && code <= 5) ? 1 : 0 };
    }
    let code = 6;
    if (s.includes('ph') || s.includes('doctor') || s.includes('postdoc')) {
      code = 5;
    } else if (s.includes('master') || s.includes('graduate')) {
      code = 4;
    } else if (s.includes('bachelor') || s.includes('junior') || s.includes('senior')) {
      code = 3;
    } else if (s.includes('associate')) {
      code = 2;
    } else if (s.includes('some college') || s.includes('freshman') || s.includes('sophomore') || s.includes('undergrad')) {
      code = 1;
    } else if (s.includes('high school') || s.includes('ged') || s.includes('diploma')) {
      code = 0;
    }
    return {
      code,
      label: EDUCATION_LABELS[code] || 'Other',
      has_degree: (code >= 3 && code <= 5) ? 1 : 0
    };
  }

  parseGenderInfo(val) {
    const GENDER_LABELS = {
      0: 'Male',
      1: 'Female',
      2: 'Non-binary',
      3: 'Other',
      4: 'Prefer not to say'
    };
    if (val === null || val === undefined || val === '') {
      return { code: '', label: '', is_male: 0, is_female: 0 };
    }
    const s = String(val).trim().toLowerCase();
    if (/^\d+$/.test(s)) {
      const code = parseInt(s, 10);
      const label = GENDER_LABELS[code] || 'Other';
      return {
        code,
        label,
        is_male: code === 0 ? 1 : 0,
        is_female: code === 1 ? 1 : 0
      };
    }
    let code = 3;
    if (s === 'male' || s === 'm') {
      code = 0;
    } else if (s === 'female' || s === 'f') {
      code = 1;
    } else if (s.includes('non-binary') || s.includes('nonbinary') || s.includes('third')) {
      code = 2;
    } else if (s.includes('prefer not')) {
      code = 4;
    }
    return {
      code,
      label: GENDER_LABELS[code] || 'Other',
      is_male: code === 0 ? 1 : 0,
      is_female: code === 1 ? 1 : 0
    };
  }

  parseLanguageInfo(val) {
    const s = String(val || '').trim().toLowerCase();
    const isEng = s.includes('english') ? 1 : 0;
    return { language: val || '', is_english: isEng };
  }

  parseCountryInfo(val) {
    const s = String(val || '').trim().toLowerCase();
    const isUs = (s.includes('united states') || s === 'usa' || s === 'us' || s.includes('u.s.')) ? 1 : 0;
    return { country: val || '', is_us: isUs };
  }

  parseDisabilityInfo(val) {
    const s = String(val || '').trim().toLowerCase();
    const hasDis = (s && !s.includes('none') && s !== 'no' && !s.includes('prefer not')) ? 1 : 0;
    return { disability: val || '', has_disability: hasDis };
  }

  toBinary(val) {
    if (val === true || val === 1 || String(val).trim().toUpperCase() === 'TRUE' || String(val).trim() === '1') {
      return 1;
    }
    return 0;
  }

  getTrialBlock(qNum) {
    const q = Math.max(1, parseInt(qNum, 10) || 1);
    return Math.floor((q - 1) / 5) + 1;
  }

  getStructureForQuestion(qNum) {
    const structures = [2, 3, 4, 5, 1, 2, 4, 5, 1, 3, 5, 2, 3, 4, 1, 4, 1, 2, 3, 5, 3, 2, 5, 4, 1];
    const idx = (parseInt(qNum, 10) || 1) - 1;
    return (idx >= 0 && idx < structures.length) ? structures[idx] : '';
  }

  getOperatorCountForQuestion(qNum) {
    const counts = [5, 3, 3, 6, 4, 5, 3, 6, 4, 3, 16, 13, 3, 8, 6, 5, 7, 9, 7, 7, 10, 11, 23, 9, 10];
    const idx = (parseInt(qNum, 10) || 1) - 1;
    return (idx >= 0 && idx < counts.length) ? counts[idx] : '';
  }

  calcLogRT(rtMs) {
    const ms = parseFloat(rtMs) || 0;
    return Math.round(Math.log(Math.max(ms, 1.0)) * 10000) / 10000;
  }

  // --- Export Routines ---

  getCanonicalCorrectKey(qNum, isTraining = false) {
    const idx = (parseInt(qNum, 10) || 1) - 1;
    if (isTraining) {
      const tk = [12, 19, 31, 37];
      return (idx >= 0 && idx < tk.length) ? (tk[idx] ^ ((idx * 7 + 13) & 0xFF)) : '';
    }
    const sk = [9, 24, 24, 33, 42, 51, 52, 60, 71, 77, 87, 94, 97, 106, 113, 114, 127, 133, 138, 149, 155, 164, 165, 173, 182];
    return (idx >= 0 && idx < sk.length) ? (sk[idx] ^ ((idx * 7 + 13) & 0xFF)) : '';
  }

  resolveCorrectKey(r) {
    if (!r) return '';
    if (r.correctKey !== undefined && r.correctKey !== null && r.correctKey !== '') {
      const k = parseInt(r.correctKey, 10);
      if (!isNaN(k) && k >= 1 && k <= 4) return k;
    }
    const qn = parseInt(r.questionNumber ?? r.question_number, 10);
    if (!isNaN(qn) && qn >= 1 && qn <= 25 && !r.isTraining) {
      const ck = this.getCanonicalCorrectKey(qn, false);
      if (ck) return ck;
    }
    const rawOpt = String(r.correctOptionText ?? r.correct_option ?? '').trim();
    if (/^[1-4]$/.test(rawOpt)) {
      return parseInt(rawOpt, 10);
    }
    const letterMatch = rawOpt.match(/Option\s+([A-D])/i) || rawOpt.match(/^([A-D])$/i);
    if (letterMatch) {
      return letterMatch[1].toUpperCase().charCodeAt(0) - 64;
    }
    if (r.isCorrect && r.selectedKey !== undefined && r.selectedKey !== null && r.selectedKey !== '') {
      const sk = parseInt(r.selectedKey, 10);
      if (!isNaN(sk) && sk >= 1 && sk <= 4) return sk;
    }
    return '';
  }

  resolveLikertVal(thoughtsObj, shortKey) {
    if (!thoughtsObj) return '';
    const fullKey = `likert_${shortKey}`;
    const lr = thoughtsObj.likertRatings || {};
    for (const candidate of [thoughtsObj[fullKey], thoughtsObj[shortKey], lr[fullKey], lr[shortKey]]) {
      if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
    }
    return '';
  }

  getCSVHeaders() {
    return [
      'response_id',
      'participant_id',
      'session_id',
      'timestamp_iso',
      'question_number',
      'trial_block',
      'question_category',
      'code_structure',
      'operator_count',
      'assigned_group',
      'host_language',
      'syntax_dialect_id',
      'is_correct',
      'response_time_ms',
      'response_time_s',
      'log_response_time',
      'time_to_first_select_ms',
      'decision_confirm_ms',
      'input_method',
      'tab_focus_lost',
      'valid_trial',
      'tab_switch_count',
      'focus_lost_duration_ms',
      'answer_change_count',
      'selected_key',
      'correct_option',
      'training_accuracy',
      'training_total_time_s',
      'age',
      'gender',
      'gender_label',
      'gender_male',
      'gender_female',
      'education',
      'education_label',
      'has_college_degree',
      'coding_exp_years',
      'has_coding_exp',
      'db_exp_years',
      'has_db_exp',
      'primary_language',
      'is_english_primary',
      'country_of_origin',
      'is_country_us',
      'likert_clarity',
      'likert_difficulty',
      'likert_interface',
      'likert_experience',
      'duration_expectation',
      'final_thoughts'
    ];
  }

  formatCSVRow(r) {
    const demo = this.getDemographics(r.participantId) || {};
    const thoughtsObj = this.getFinalThoughts(r.participantId) || {};
    const assigned = this.getAssignedGroup(r.participantId);

    const isCorrectVal = this.toBinary(r.isCorrect);
    const rtMs = parseInt(r.responseTimeMs, 10) || 0;
    const rtS = Math.round((rtMs / 1000.0) * 1000) / 1000;
    const logRt = this.calcLogRT(rtMs);
    const tabFocusLostVal = this.toBinary(r.tabFocusLost);
    const validTrialVal = tabFocusLostVal === 0 ? 1 : 0;
    const qNum = parseInt(r.questionNumber, 10) || 1;
    const trialBlock = this.getTrialBlock(qNum);
    const codeStructure = r.codeStructure || r.code_structure || this.getStructureForQuestion(qNum);
    const operatorCount = (r.operatorCount !== undefined && r.operatorCount !== null && r.operatorCount !== '')
      ? r.operatorCount
      : ((r.operator_count !== undefined && r.operator_count !== null && r.operator_count !== '') ? r.operator_count : this.getOperatorCountForQuestion(qNum));

    const firstSelectMs = (r.timeToFirstSelectMs !== undefined && r.timeToFirstSelectMs !== null && r.timeToFirstSelectMs !== '')
      ? r.timeToFirstSelectMs
      : (r.time_to_first_select_ms ?? '');
    const confirmMs = (r.decisionConfirmMs !== undefined && r.decisionConfirmMs !== null && r.decisionConfirmMs !== '')
      ? r.decisionConfirmMs
      : (r.decision_confirm_ms ?? '');
    const inputMethod = r.inputMethod || r.input_method || '';
    const trainingSummary = this.getTrainingSummary(r.participantId, r);

    const assignedGroupName = r.assignedGroupName || r.assignedGroup || (assigned ? assigned.name : (demo.assignedGroupName || demo.assignedGroup || ''));

    const ageVal = this.parseAge(demo.age);
    const genderInfo = this.parseGenderInfo(demo.gender);
    const eduInfo = this.parseEducationInfo(demo.education || demo.highestEducation || demo.academicStanding);
    const codingYears = this.parseNum(demo.codingExp);
    const dbYears = this.parseNum(demo.dbExp);
    const langInfo = this.parseLanguageInfo(demo.primaryLanguage);
    const countryInfo = this.parseCountryInfo(demo.countryOfOrigin);

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    return [
      r.id || '',
      r.participantId || '',
      r.sessionId || '',
      r.timestamp || '',
      qNum,
      trialBlock,
      r.questionCategory || '',
      codeStructure,
      operatorCount,
      assignedGroupName,
      r.hostLanguage || (assigned ? assigned.hostLanguage : (demo.hostLanguage || '')),
      r.activeDialect || '',
      isCorrectVal,
      rtMs,
      rtS,
      logRt,
      firstSelectMs,
      confirmMs,
      inputMethod,
      tabFocusLostVal,
      validTrialVal,
      r.tabSwitchCount || 0,
      r.focusLostDurationMs || 0,
      r.answerChangeCount || 0,
      r.selectedKey !== null && r.selectedKey !== undefined ? r.selectedKey : '',
      this.resolveCorrectKey(r),
      trainingSummary.trainingAccuracy,
      trainingSummary.trainingTotalTimeS,
      ageVal,
      genderInfo.code,
      genderInfo.label,
      genderInfo.is_male,
      genderInfo.is_female,
      eduInfo.code,
      eduInfo.label,
      eduInfo.has_degree,
      codingYears,
      codingYears > 0 ? 1 : 0,
      dbYears,
      dbYears > 0 ? 1 : 0,
      langInfo.language,
      langInfo.is_english,
      countryInfo.country,
      countryInfo.is_us,
      this.resolveLikertVal(thoughtsObj, 'clarity'),
      this.resolveLikertVal(thoughtsObj, 'difficulty'),
      this.resolveLikertVal(thoughtsObj, 'interface'),
      this.resolveLikertVal(thoughtsObj, 'experience'),
      thoughtsObj.durationExpectation || thoughtsObj.duration_expectation || '',
      thoughtsObj.thoughts || ''
    ].map(escapeCsv).join(',');
  }

  downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportToCSV() {
    if (this.responses.length === 0) {
      alert('No participant responses logged yet to export!');
      return;
    }

    const headers = this.getCSVHeaders().map(h => `"${h}"`).join(',');
    const rows = this.responses.map(r => this.formatCSVRow(r));
    const csvContent = [headers, ...rows].join('\n');
    this.downloadBlob(csvContent, `participant_responses_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  }

  exportUserCSV(participantId) {
    const userResponses = this.responses.filter(r => (r.participantId || 'Anonymous') === participantId);
    if (userResponses.length === 0) {
      alert(`No responses logged for User ID: ${participantId}`);
      return;
    }

    const headers = this.getCSVHeaders().map(h => `"${h}"`).join(',');
    const rows = userResponses.map(r => this.formatCSVRow(r));
    const csvContent = [headers, ...rows].join('\n');
    this.downloadBlob(csvContent, `responses_${participantId}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  }

  exportToJSON() {
    if (this.responses.length === 0) {
      alert('No participant responses logged yet to export!');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalRecords: this.responses.length,
      summary: this.getAnalyticsSummary(),
      demographics: this.demographics,
      finalThoughts: this.finalThoughts,
      responses: this.responses
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    this.downloadBlob(jsonString, `participant_responses_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  }

  async deleteUserResponses(participantId) {
    if (!participantId) return;
    if (confirm(`Are you sure you want to permanently delete all telemetry records for User ID: ${participantId}?`)) {
      this.responses = this.responses.filter(r => (r.participantId || 'Anonymous') !== participantId);
      delete this.demographics[participantId];
      delete this.finalThoughts[participantId];

      this.saveResponsesLocally();
      try {
        localStorage.setItem(this.demographicsKey, JSON.stringify(this.demographics));
        localStorage.setItem(this.finalThoughtsKey, JSON.stringify(this.finalThoughts));
      } catch (e) {}

      try {
        const endpoint = this.getApiUrl('/api/delete-user-telemetry');
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId })
        });
      } catch (e) {}

      if (this.channel) {
        this.channel.postMessage({ type: 'DELETE_USER', participantId });
      }
      this.notify({ type: 'DELETE_USER', participantId });
    }
  }

  async clearAllResponsesWithoutConfirm() {
    this.responses = [];
    this.demographics = {};
    this.finalThoughts = {};

    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.demographicsKey);
      localStorage.removeItem(this.finalThoughtsKey);
    } catch (e) {}

    try {
      const endpoint = this.getApiUrl('/api/clear-telemetry');
      await fetch(endpoint, { method: 'POST' });
    } catch (e) {}

    if (this.channel) {
      this.channel.postMessage({ type: 'CLEAR_LOGS' });
    }
    this.notify({ type: 'CLEAR_LOGS' });
  }

  clearAllResponses() {
    if (confirm('Are you sure you want to delete all stored participant response logs and demographics? This action cannot be undone.')) {
      this.clearAllResponsesWithoutConfirm();
      alert('All response logs and study telemetry cleared.');
    }
  }
}

window.ParticipantAnalytics = ParticipantAnalytics;
