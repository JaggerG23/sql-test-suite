/**
 * Participant Analytics & Telemetry Manager
 * Handles persistent storage, server synchronization, real-time cross-tab updates,
 * demographic profiling, accuracy & timing telemetry, cloud webhook sync (Google Sheets),
 * file/token import, and unified CSV/JSON exports.
 */

class ParticipantAnalytics {
  constructor() {
    this.storageKey = 'sql_study_responses';
    this.demographicsKey = 'sql_study_demographics';
    this.finalThoughtsKey = 'sql_study_final_thoughts';
    this.participantIdKey = 'sql_study_participant_id';
    this.sessionIdKey = 'sql_study_session_id';

    this.participantId = this.initParticipantId();
    this.sessionId = this.initSessionId();
    this.assignedGroup = this.initAssignedGroup(this.participantId);
    this.callbacks = [];

    this.migrateLegacyData();
    this.responses = this.loadResponses();
    this.demographics = this.loadDemographics();
    this.finalThoughts = this.loadFinalThoughts();

    this.initRealtimeChannel();
    this.syncWithDiskStorage();
  }

  // Auto-migrate legacy storage keys
  migrateLegacyData() {
    try {
      const oldResponses = localStorage.getItem('sql_test_suite_participant_responses');
      if (oldResponses && !localStorage.getItem(this.storageKey)) {
        localStorage.setItem(this.storageKey, oldResponses);
      }

      const demos = this.loadDemographics();
      const thoughts = this.loadFinalThoughts();
      let migrated = false;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sql_test_suite_demographics_')) {
          const pid = key.replace('sql_test_suite_demographics_', '');
          try {
            demos[pid] = JSON.parse(localStorage.getItem(key));
            migrated = true;
          } catch (e) {}
        } else if (key && key.startsWith('sql_test_suite_final_thoughts_')) {
          const pid = key.replace('sql_test_suite_final_thoughts_', '');
          try {
            thoughts[pid] = JSON.parse(localStorage.getItem(key));
            migrated = true;
          } catch (e) {}
        }
      }

      if (migrated) {
        localStorage.setItem(this.demographicsKey, JSON.stringify(demos));
        localStorage.setItem(this.finalThoughtsKey, JSON.stringify(thoughts));
      }
    } catch (e) {
      console.warn('Telemetry migration check:', e);
    }
  }

  initParticipantId() {
    let pid = localStorage.getItem(this.participantIdKey) || localStorage.getItem('sql_test_suite_participant_id');
    if (!pid) {
      pid = 'user_' + Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 5);
      localStorage.setItem(this.participantIdKey, pid);
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

    // Check if participant was already assigned a group previously
    try {
      const saved = localStorage.getItem(groupStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && ParticipantAnalytics.STUDY_GROUPS.some(g => g.id === parsed.id)) {
          return parsed;
        }
      }
    } catch (e) {}

    // Uniformly random selection among the 4 groups (crypto-secure when available)
    const groups = ParticipantAnalytics.STUDY_GROUPS;
    let randIdx = 0;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      randIdx = array[0] % groups.length;
    } else {
      randIdx = Math.floor(Math.random() * groups.length);
    }

    const assigned = groups[randIdx];
    try {
      localStorage.setItem(groupStorageKey, JSON.stringify(assigned));
    } catch (e) {}
    return assigned;
  }

  getAssignedGroup(pid = this.participantId) {
    const targetPid = pid || this.participantId || 'user';
    const groupStorageKey = `sql_study_assigned_group_${targetPid}`;
    try {
      const saved = localStorage.getItem(groupStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) return parsed;
      }
    } catch (e) {}
    return this.initAssignedGroup(targetPid);
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
    let sid = sessionStorage.getItem(this.sessionIdKey);
    if (!sid) {
      sid = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      sessionStorage.setItem(this.sessionIdKey, sid);
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

    // Cross-device synchronization (polling) for the Admin Dashboard
    setInterval(() => {
      // Only poll if we are logged in as admin to avoid spamming 401s from normal participants
      if (window.adminAuth && window.adminAuth.getToken()) {
        this.syncWithDiskStorage(true);
      }
    }, 5000); // Check for new data every 5 seconds
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

  getApiUrl(path) {
    if (window.studyConfig && typeof window.studyConfig.getEndpoint === 'function') {
      return window.studyConfig.getEndpoint(path);
    }
    return path.startsWith('/') ? path : `/${path}`;
  }

  async syncWithDiskStorage(pullOnly = false) {
    try {
      const endpoint = this.getApiUrl('/api/load-telemetry');
      const res = await fetch(endpoint);
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

    if (!pullOnly) {
      // Push local data to server or cloud webhook
      this.pushToDiskStorage();
      this.pushToCloudWebhook();
    }
  }

  async pushToDiskStorage(incrementalData = null) {
    try {
      const payload = incrementalData || {};

      // If there's no incremental data to push, don't ping the server
      if (Object.keys(payload).length === 0) return;

      const endpoint = this.getApiUrl('/api/save-telemetry');
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Server offline fallback
    }
  }

  async pushToCloudWebhook(incrementalData = null) {
    const webhookUrl = window.studyConfig ? window.studyConfig.getCloudWebhookUrl() : '';
    if (!webhookUrl) return;

    try {
      const payload = {
        responses: this.responses,
        demographics: this.demographics,
        finalThoughts: this.finalThoughts,
        ...incrementalData
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
    const pst = this.getPSTDateTime();
    const assignedGroup = this.getAssignedGroup(this.participantId);
    const groupName = entry.assignedGroupName || entry.assignedGroup || (assignedGroup ? assignedGroup.name : 'Unknown');
    const groupId = entry.assignedGroupId || (assignedGroup ? assignedGroup.id : 'unknown');
    const hostLang = entry.hostLanguage || (assignedGroup ? assignedGroup.hostLanguage : 'javascript');
    const activeDialectKey = entry.activeDialect || (assignedGroup ? assignedGroup.sqlDialect : 'pipe');
    const activeDialectLabel = entry.activeDialectName || (activeDialectKey === 'quorum' ? 'Quorum Syntax' : 'Google SQL (Pipe Syntax)');

    const record = {
      id: 'resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
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
      questionNumber: entry.questionNumber || (this.getParticipantResponses(this.participantId).length + 1),
      questionCategory: entry.questionCategory || 'General',
      activeDialect: activeDialectKey,
      activeDialectName: activeDialectLabel,
      rawQuery: entry.rawQuery || '',
      dialectSql: entry.dialectSql || entry.rawQuery || '',
      codeSnippet: entry.codeSnippet || entry.jsCode || entry.incompleteQuery || '',
      jsCode: entry.codeSnippet || entry.jsCode || entry.incompleteQuery || '',
      selectedKey: entry.selectedKey || null,
      selectedOptionText: entry.selectedOptionText || '',
      correctOptionText: entry.correctOptionText || '',
      isCorrect: Boolean(entry.isCorrect),
      responseTimeMs: Math.max(0, Math.round(entry.responseTimeMs || 0)),
      seed: entry.seed || 0,
      tabFocusLost: Boolean(entry.tabFocusLost),
      tabSwitchCount: entry.tabSwitchCount || 0,
      focusLostDurationMs: Math.max(0, Math.round(entry.focusLostDurationMs || 0))
    };

    this.responses.push(record);
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
    const pst = this.getPSTDateTime();
    const assignedGroup = this.getAssignedGroup(pid);
    const record = {
      participantId: pid,
      assignedGroup: assignedGroup ? assignedGroup.name : '',
      assignedGroupId: assignedGroup ? assignedGroup.id : '',
      assignedGroupName: assignedGroup ? assignedGroup.name : '',
      hostLanguage: assignedGroup ? assignedGroup.hostLanguage : '',
      sqlDialect: assignedGroup ? assignedGroup.sqlDialect : '',
      ...demographicsData,
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

  saveFinalThoughts(thoughtsText, pid = this.participantId) {
    if (!pid) return null;
    const pst = this.getPSTDateTime();
    const assignedGroup = this.getAssignedGroup(pid);
    const record = {
      participantId: pid,
      assignedGroup: assignedGroup ? assignedGroup.name : '',
      assignedGroupId: assignedGroup ? assignedGroup.id : '',
      assignedGroupName: assignedGroup ? assignedGroup.name : '',
      thoughts: thoughtsText || '',
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

  getAllResponses() {
    return this.responses;
  }

  getParticipantResponses(participantId = this.participantId) {
    return this.responses.filter(r => r.participantId === participantId);
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
        dialectStats: {},
        categoryStats: {}
      };
    }

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

      const gKey = r.assignedGroupName || r.assignedGroup || (this.getAssignedGroup(r.participantId).name);
      if (!groupStats[gKey]) groupStats[gKey] = { total: 0, correct: 0, totalTime: 0 };
      groupStats[gKey].total++;
      if (r.isCorrect) groupStats[gKey].correct++;
      groupStats[gKey].totalTime += (r.responseTimeMs || 0);
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

    return {
      totalResponses: total,
      uniqueParticipants,
      overallAccuracy,
      avgResponseTimeMs,
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
      groups[uid] = {
        participantId: uid,
        assignedGroup: assigned.name,
        assignedGroupId: assigned.id,
        assignedGroupName: assigned.name,
        hostLanguage: assigned.hostLanguage,
        sqlDialect: assigned.sqlDialect,
        responses: [],
        totalAnswers: 0,
        correctCount: 0,
        totalTimeMs: 0,
        focusLostCount: 0,
        lastActive: null
      };
    });

    this.responses.forEach(r => {
      const uid = r.participantId || 'Anonymous';
      if (!groups[uid]) {
        const assigned = this.getAssignedGroup(uid);
        groups[uid] = {
          participantId: uid,
          assignedGroup: assigned.name,
          assignedGroupId: assigned.id,
          assignedGroupName: assigned.name,
          hostLanguage: assigned.hostLanguage,
          sqlDialect: assigned.sqlDialect,
          responses: [],
          totalAnswers: 0,
          correctCount: 0,
          totalTimeMs: 0,
          focusLostCount: 0,
          lastActive: r.timestamp
        };
      }
      groups[uid].responses.push(r);
      groups[uid].totalAnswers++;
      if (r.isCorrect) groups[uid].correctCount++;
      groups[uid].totalTimeMs += (r.responseTimeMs || 0);
      if (r.tabFocusLost) groups[uid].focusLostCount++;
      if (!groups[uid].lastActive || new Date(r.timestamp) > new Date(groups[uid].lastActive)) {
        groups[uid].lastActive = r.timestamp;
      }
    });

    Object.keys(groups).forEach(uid => {
      const g = groups[uid];
      g.accuracy = g.totalAnswers > 0 ? Math.round((g.correctCount / g.totalAnswers) * 100) : 0;
      g.avgTimeMs = g.totalAnswers > 0 ? Math.round(g.totalTimeMs / g.totalAnswers) : 0;
      g.demographics = this.getDemographics(uid);
      g.finalThoughts = this.getFinalThoughts(uid);
      if (!g.lastActive && g.demographics && g.demographics.timestamp) {
        g.lastActive = g.demographics.timestamp;
      }
      if (g.demographics && g.demographics.assignedGroupName) {
        g.assignedGroupName = g.demographics.assignedGroupName;
        g.assignedGroup = g.demographics.assignedGroupName;
      }
    });

    return groups;
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

    this.pushToDiskStorage();
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

        const pid = getVal(row, ['Participant ID', 'participantId'], 1) || 'user_imported';
        const assignedGroupVal = getVal(row, ['Assigned Group', 'assignedGroup', 'assignedGroupName'], undefined);
        const hostLangVal = getVal(row, ['Host Language', 'hostLanguage'], undefined);
        const codeVal = getVal(row, ['Code Snippet', 'codeSnippet', 'JS Code Snippet', 'jsCode'], undefined);

        const resp = {
          id: getVal(row, ['Response ID', 'id'], 0) || ('resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
          participantId: pid,
          sessionId: getVal(row, ['Session ID', 'sessionId'], 2) || '',
          timestamp: getVal(row, ['Timestamp (ISO)', 'timestamp'], 3) || new Date().toISOString(),
          questionNumber: parseInt(getVal(row, ['Question Number', 'questionNumber'], 4), 10) || 1,
          questionCategory: getVal(row, ['Question Category', 'questionCategory'], 5) || 'General',
          assignedGroup: assignedGroupVal || '',
          assignedGroupName: assignedGroupVal || '',
          hostLanguage: hostLangVal || '',
          activeDialect: getVal(row, ['Syntax Dialect ID', 'activeDialect'], 6) || 'ansi',
          activeDialectName: getVal(row, ['Syntax Dialect Name', 'activeDialectName'], 7) || 'ANSI SQL',
          selectedKey: getVal(row, ['Selected Key (1-4)', 'selectedKey'], 8) ? parseInt(getVal(row, ['Selected Key (1-4)', 'selectedKey'], 8), 10) : null,
          selectedOptionText: getVal(row, ['Selected Option', 'selectedOptionText'], 9) || '',
          correctOptionText: getVal(row, ['Correct Option', 'correctOptionText'], 10) || '',
          isCorrect: String(getVal(row, ['Is Correct', 'isCorrect'], 11)).toUpperCase() === 'TRUE',
          responseTimeMs: parseInt(getVal(row, ['Response Time (ms)', 'responseTimeMs'], 12), 10) || 0,
          seed: getVal(row, ['Random Seed', 'seed'], 13) || '',
          tabFocusLost: String(getVal(row, ['Tab Focus Lost', 'tabFocusLost'], 14)).toUpperCase() === 'TRUE',
          tabSwitchCount: parseInt(getVal(row, ['Tab Switch Count', 'tabSwitchCount'], 15), 10) || 0,
          focusLostDurationMs: parseInt(getVal(row, ['Focus Lost Duration (ms)', 'focusLostDurationMs'], 16), 10) || 0,
          rawQuery: getVal(row, ['Raw SQL Query', 'rawQuery'], row.length > 28 ? 26 : 24) || '',
          dialectSql: getVal(row, ['Dialect SQL Query', 'dialectSql'], row.length > 28 ? 27 : 25) || '',
          codeSnippet: codeVal || '',
          jsCode: codeVal || ''
        };
        responses.push(resp);

        const age = getVal(row, ['Age', 'age'], 17);
        const gender = getVal(row, ['Gender', 'gender'], 18);
        const education = getVal(row, ['Highest Level of Education', 'Education', 'Academic Standing', 'academicStanding', 'education'], 19);

        if (!demographics[pid] && (age || gender || education)) {
          demographics[pid] = {
            participantId: pid,
            assignedGroup: assignedGroupVal || '',
            assignedGroupName: assignedGroupVal || '',
            hostLanguage: hostLangVal || '',
            age: age || '',
            gender: gender || '',
            education: education || '',
            highestEducation: education || '',
            academicStanding: education || '',
            codingExp: getVal(row, ['Programming Experience', 'Coding Experience', 'codingExp'], 20) || '',
            dbExp: getVal(row, ['Database Experience', 'dbExp'], 21) || '',
            primaryLanguage: getVal(row, ['Primary Language', 'primaryLanguage'], 22) || '',
            countryOfOrigin: getVal(row, ['Country of Origin', 'countryOfOrigin'], 23) || '',
            disability: getVal(row, ['Disability Status', 'disability'], 24) || '',
            queryExp: getVal(row, ['Query Writing Experience', 'queryExp']) || 'Completed via updated survey',
            timestamp: resp.timestamp || new Date().toISOString()
          };
        }

        const thoughts = getVal(row, ['Final Thoughts', 'finalThoughts'], 23);
        if (!finalThoughts[pid] && thoughts) {
          finalThoughts[pid] = {
            participantId: pid,
            thoughts: thoughts,
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

  // --- Export Routines ---

  getCSVHeaders() {
    return [
      'Response ID',
      'Participant ID',
      'Session ID',
      'Timestamp (ISO)',
      'Question Number',
      'Question Category',
      'Assigned Group',
      'Host Language',
      'Syntax Dialect ID',
      'Syntax Dialect Name',
      'Selected Key (1-4)',
      'Selected Option',
      'Correct Option',
      'Is Correct',
      'Response Time (ms)',
      'Random Seed',
      'Tab Focus Lost',
      'Tab Switch Count',
      'Focus Lost Duration (ms)',
      'Age',
      'Gender',
      'Highest Level of Education',
      'Programming Experience',
      'Database Experience',
      'Primary Language',
      'Country of Origin',
      'Disability Status',
      'Final Thoughts',
      'Raw SQL Query',
      'Dialect SQL Query',
      'Code Snippet'
    ];
  }

  formatCSVRow(r) {
    const demo = this.getDemographics(r.participantId) || {};
    const thoughtsObj = this.getFinalThoughts(r.participantId) || {};
    const assigned = this.getAssignedGroup(r.participantId);
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
      r.questionNumber || '',
      r.questionCategory || '',
      r.assignedGroupName || r.assignedGroup || (assigned ? assigned.name : ''),
      r.hostLanguage || (assigned ? assigned.hostLanguage : ''),
      r.activeDialect || '',
      r.activeDialectName || '',
      r.selectedKey !== null && r.selectedKey !== undefined ? r.selectedKey : '',
      r.selectedOptionText || '',
      r.correctOptionText || '',
      r.isCorrect ? 'TRUE' : 'FALSE',
      r.responseTimeMs || 0,
      r.seed || '',
      r.tabFocusLost ? 'TRUE' : 'FALSE',
      r.tabSwitchCount || 0,
      r.focusLostDurationMs || 0,
      demo.age || '',
      demo.gender || '',
      demo.education || demo.highestEducation || demo.academicStanding || '',
      demo.codingExp || '',
      demo.dbExp || '',
      demo.primaryLanguage || '',
      demo.countryOfOrigin || '',
      demo.disability || '',
      thoughtsObj.thoughts || '',
      r.rawQuery || '',
      r.dialectSql || r.rawQuery || '',
      r.codeSnippet || r.jsCode || r.incompleteQuery || ''
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
