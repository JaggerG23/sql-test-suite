/**
 * Participant Analytics & Telemetry Manager
 * Handles persistent storage, server synchronization, real-time cross-tab updates,
 * demographic profiling, accuracy & timing telemetry, and unified CSV/JSON exports.
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
      pid = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem(this.participantIdKey, pid);
    }
    return pid;
  }

  setParticipantId(newId) {
    if (!newId || !newId.trim()) return;
    this.participantId = newId.trim();
    localStorage.setItem(this.participantIdKey, this.participantId);
    this.notify({ type: 'USER_ID_CHANGE', participantId: this.participantId });
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
      if ([this.storageKey, this.demographicsKey, this.finalThoughtsKey].includes(e.key)) {
        this.responses = this.loadResponses();
        this.demographics = this.loadDemographics();
        this.finalThoughts = this.loadFinalThoughts();
        this.notify({ type: 'STORAGE_UPDATE' });
      }
    });
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

  async syncWithDiskStorage() {
    try {
      const res = await fetch('/api/load-telemetry');
      if (res.ok) {
        const diskData = await res.json();
        let changed = false;

        if (diskData.responses && Array.isArray(diskData.responses)) {
          const map = new Map();
          // Keep newer or deduplicate by ID
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

        if (changed) {
          this.saveResponsesLocally();
          this.notify({ type: 'DISK_SYNC' });
        }
      }
    } catch (e) {
      // Backend offline or non-admin mode
    }

    // Always push current local data to server
    this.pushToDiskStorage();
  }

  async pushToDiskStorage(incrementalData = null) {
    try {
      const payload = {
        responses: this.responses,
        demographics: this.demographics,
        finalThoughts: this.finalThoughts,
        ...incrementalData
      };

      await fetch('/api/save-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Server offline fallback
    }
  }

  logResponse(entry) {
    const record = {
      id: 'resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      participantId: this.participantId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      questionNumber: entry.questionNumber || (this.getParticipantResponses(this.participantId).length + 1),
      questionCategory: entry.questionCategory || 'General',
      activeDialect: entry.activeDialect || 'ansi',
      activeDialectName: entry.activeDialectName || 'ANSI SQL',
      rawQuery: entry.rawQuery || '',
      dialectSql: entry.dialectSql || entry.rawQuery || '',
      jsCode: entry.jsCode || entry.incompleteQuery || '',
      selectedKey: entry.selectedKey || null,
      selectedOptionText: entry.selectedOptionText || '',
      correctOptionText: entry.correctOptionText || '',
      isCorrect: Boolean(entry.isCorrect),
      responseTimeMs: entry.responseTimeMs || 0,
      seed: entry.seed || 42,
      tabFocusLost: Boolean(entry.tabFocusLost),
      tabSwitchCount: entry.tabSwitchCount || 0,
      focusLostDurationMs: entry.focusLostDurationMs || 0
    };

    this.responses.push(record);
    this.saveResponsesLocally();
    this.pushToDiskStorage({ newResponse: record });

    if (this.channel) {
      this.channel.postMessage({ type: 'NEW_RESPONSE', record: record });
    }
    this.notify({ type: 'NEW_RESPONSE', record: record });
    return record;
  }

  saveDemographics(data, pid = this.participantId) {
    if (!pid) return null;
    const record = {
      participantId: pid,
      age: data.age || '',
      gender: data.gender || '',
      academicStanding: data.academicStanding || '',
      codingExp: data.codingExp || '',
      dbExp: data.dbExp || '',
      queryExp: data.queryExp || '',
      timestamp: new Date().toISOString()
    };

    this.demographics[pid] = record;
    try {
      localStorage.setItem(this.demographicsKey, JSON.stringify(this.demographics));
    } catch (e) {}

    this.pushToDiskStorage({ newDemographic: record });
    if (this.channel) {
      this.channel.postMessage({ type: 'DEMOGRAPHICS_UPDATE', demographic: record });
    }
    this.notify({ type: 'DEMOGRAPHICS_UPDATE', demographic: record });
    return record;
  }

  getDemographics(pid = this.participantId) {
    return (pid && this.demographics[pid]) ? this.demographics[pid] : null;
  }

  saveFinalThoughts(thoughtsText, pid = this.participantId) {
    if (!pid) return null;
    const record = {
      participantId: pid,
      thoughts: thoughtsText || '',
      timestamp: new Date().toISOString()
    };

    this.finalThoughts[pid] = record;
    try {
      localStorage.setItem(this.finalThoughtsKey, JSON.stringify(this.finalThoughts));
    } catch (e) {}

    this.pushToDiskStorage({ newFinalThought: record });
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

    return {
      totalResponses: total,
      uniqueParticipants,
      overallAccuracy,
      avgResponseTimeMs,
      dialectStats,
      categoryStats
    };
  }

  getResponsesGroupedByParticipant() {
    const groups = {};
    const allUserIds = new Set();
    this.responses.forEach(r => { if (r.participantId) allUserIds.add(r.participantId); });
    Object.keys(this.demographics || {}).forEach(pid => { if (pid) allUserIds.add(pid); });
    Object.keys(this.finalThoughts || {}).forEach(pid => { if (pid) allUserIds.add(pid); });

    allUserIds.forEach(uid => {
      groups[uid] = {
        participantId: uid,
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
        groups[uid] = {
          participantId: uid,
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
    });

    return groups;
  }

  getCSVHeaders() {
    return [
      'Response ID',
      'Participant ID',
      'Session ID',
      'Timestamp (ISO)',
      'Question Number',
      'Question Category',
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
      'Academic Standing',
      'Coding Experience',
      'Database Experience',
      'Query Writing Experience',
      'Final Thoughts',
      'Raw SQL Query',
      'Dialect SQL Query',
      'JS Code Snippet'
    ];
  }

  formatCSVRow(r) {
    const demo = this.getDemographics(r.participantId) || {};
    const thoughtsObj = this.getFinalThoughts(r.participantId) || {};
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
      demo.academicStanding || '',
      demo.codingExp || '',
      demo.dbExp || '',
      demo.queryExp || '',
      thoughtsObj.thoughts || '',
      r.rawQuery || '',
      r.dialectSql || r.rawQuery || '',
      r.jsCode || r.incompleteQuery || ''
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
        await fetch('/api/delete-user-telemetry', {
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
      await fetch('/api/clear-telemetry', { method: 'POST' });
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
