/**
 * Participant Analytics & Telemetry Manager
 * Logs participant responses, unique user IDs, response times, accuracy, and exports data to CSV/JSON.
 */
class ParticipantAnalytics {
  constructor() {
    this.storageKey = 'sql_test_suite_participant_responses';
    this.participantIdKey = 'sql_test_suite_participant_id';
    this.sessionIdKey = 'sql_test_suite_session_id';
    this.demographicsKeyPrefix = 'sql_test_suite_demographics_';
    this.finalThoughtsKeyPrefix = 'sql_test_suite_final_thoughts_';

    this.participantId = this.initParticipantId();
    this.sessionId = this.initSessionId();
    this.responses = this.loadResponses();
    this.updateCallbacks = [];

    this.initRealtimeSync();
    this.syncWithDiskStorage();
  }

  initRealtimeSync() {
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('sql_matrix_telemetry_channel');
        this.channel.onmessage = (event) => {
          if (event.data) {
            this.responses = this.loadResponses();
            this.notifyCallbacks(event.data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey) {
        this.responses = this.loadResponses();
        this.notifyCallbacks({ type: 'STORAGE_UPDATE' });
      }
    });
  }

  async syncWithDiskStorage() {
    try {
      const resp = await fetch('/api/load-telemetry');
      if (resp.ok) {
        const diskData = await resp.json();
        let updated = false;

        if (diskData.responses && Array.isArray(diskData.responses)) {
          const existingIds = new Set(this.responses.map(r => r.id));
          diskData.responses.forEach(r => {
            if (r.id && !existingIds.has(r.id)) {
              this.responses.push(r);
              existingIds.add(r.id);
              updated = true;
            }
          });
        }

        if (diskData.demographics && typeof diskData.demographics === 'object') {
          Object.keys(diskData.demographics).forEach(pid => {
            if (!localStorage.getItem(this.demographicsKeyPrefix + pid)) {
              localStorage.setItem(this.demographicsKeyPrefix + pid, JSON.stringify(diskData.demographics[pid]));
            }
          });
        }

        if (diskData.finalThoughts && typeof diskData.finalThoughts === 'object') {
          Object.keys(diskData.finalThoughts).forEach(pid => {
            if (!localStorage.getItem(this.finalThoughtsKeyPrefix + pid)) {
              localStorage.setItem(this.finalThoughtsKeyPrefix + pid, JSON.stringify(diskData.finalThoughts[pid]));
            }
          });
        }

        if (updated) {
          this.saveResponses();
          this.notifyCallbacks({ type: 'DISK_SYNC' });
        }

        this.pushToDiskStorage();
      }
    } catch (e) {
      console.log('Disk telemetry server sync unavailable, using localStorage fallback.');
    }
  }

  async pushToDiskStorage(newDemographicsData = null, newFinalThoughtsData = null) {
    try {
      const allDemos = {};
      const allThoughts = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.demographicsKeyPrefix)) {
          const pid = key.replace(this.demographicsKeyPrefix, '');
          try { allDemos[pid] = JSON.parse(localStorage.getItem(key)); } catch(e){}
        } else if (key && key.startsWith(this.finalThoughtsKeyPrefix)) {
          const pid = key.replace(this.finalThoughtsKeyPrefix, '');
          try { allThoughts[pid] = JSON.parse(localStorage.getItem(key)); } catch(e){}
        }
      }

      const payload = {
        responses: this.responses,
        demographics: allDemos,
        finalThoughts: allThoughts,
        newDemographic: newDemographicsData ? { ...newDemographicsData, participantId: this.participantId } : null,
        newFinalThought: newFinalThoughtsData ? { thoughts: newFinalThoughtsData, participantId: this.participantId } : null
      };

      await fetch('/api/save-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Offline mode
    }
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.updateCallbacks.push(callback);
    }
  }

  notifyCallbacks(payload) {
    this.updateCallbacks.forEach(cb => {
      try { cb(payload); } catch (err) { console.error('Callback error:', err); }
    });
  }

  initParticipantId() {
    let pid = localStorage.getItem(this.participantIdKey);
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
  }

  saveDemographics(data, pid = this.participantId) {
    if (!pid) return null;
    const record = {
      age: data.age || '',
      gender: data.gender || '',
      academicStanding: data.academicStanding || '',
      codingExp: data.codingExp || '',
      dbExp: data.dbExp || '',
      queryExp: data.queryExp || '',
      timestamp: new Date().toISOString()
    };
    try {
      localStorage.setItem(this.demographicsKeyPrefix + pid, JSON.stringify(record));
    } catch (e) {
      console.error('Failed to save demographics:', e);
    }
    this.pushToDiskStorage(record);
    return record;
  }

  getDemographics(pid = this.participantId) {
    if (!pid) return null;
    try {
      const data = localStorage.getItem(this.demographicsKeyPrefix + pid);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  saveFinalThoughts(thoughtsText, pid = this.participantId) {
    if (!pid) return null;
    const record = {
      thoughts: thoughtsText || '',
      timestamp: new Date().toISOString()
    };
    try {
      localStorage.setItem(this.finalThoughtsKeyPrefix + pid, JSON.stringify(record));
    } catch (e) {
      console.error('Failed to save final thoughts:', e);
    }
    this.pushToDiskStorage(null, thoughtsText);
    return record;
  }

  getFinalThoughts(pid = this.participantId) {
    if (!pid) return null;
    try {
      const data = localStorage.getItem(this.finalThoughtsKeyPrefix + pid);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  initSessionId() {
    const sid = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    return sid;
  }

  loadResponses() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load participant responses from localStorage:', e);
      return [];
    }
  }

  saveResponses() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.responses));
    } catch (e) {
      console.error('Failed to save participant responses to localStorage:', e);
    }
  }

  logResponse(entry) {
    const fullRecord = {
      id: 'resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      participantId: this.participantId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      questionCategory: entry.questionCategory || 'General',
      activeDialect: entry.activeDialect || 'ansi',
      activeDialectName: entry.activeDialectName || 'ANSI SQL',
      incompleteQuery: entry.incompleteQuery || '',
      rawQuery: entry.rawQuery || '',
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

    this.responses.push(fullRecord);
    this.saveResponses();
    this.pushToDiskStorage();

    if (this.channel) {
      this.channel.postMessage({ type: 'NEW_RESPONSE', record: fullRecord });
    }
    this.notifyCallbacks({ type: 'NEW_RESPONSE', record: fullRecord });
    return fullRecord;
  }

  getAllResponses() {
    return this.responses;
  }

  getParticipantResponses(participantId = this.participantId) {
    return this.responses.filter(r => r.participantId === participantId);
  }

  getAnalyticsSummary() {
    const total = this.responses.length;
    if (total === 0) {
      return {
        totalResponses: 0,
        uniqueParticipants: 0,
        overallAccuracy: 0,
        avgResponseTimeMs: 0,
        dialectStats: {},
        categoryStats: {}
      };
    }

    const uniqueParticipants = new Set(this.responses.map(r => r.participantId)).size;
    const correctCount = this.responses.filter(r => r.isCorrect).length;
    const overallAccuracy = Math.round((correctCount / total) * 100);
    const avgResponseTimeMs = Math.round(this.responses.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / total);

    const dialectStats = {};
    const categoryStats = {};

    this.responses.forEach(r => {
      // Dialect Stats
      const dKey = r.activeDialectName || r.activeDialect;
      if (!dialectStats[dKey]) dialectStats[dKey] = { total: 0, correct: 0, totalTime: 0 };
      dialectStats[dKey].total++;
      if (r.isCorrect) dialectStats[dKey].correct++;
      dialectStats[dKey].totalTime += (r.responseTimeMs || 0);

      // Category Stats
      const cKey = r.questionCategory;
      if (!categoryStats[cKey]) categoryStats[cKey] = { total: 0, correct: 0, totalTime: 0 };
      categoryStats[cKey].total++;
      if (r.isCorrect) categoryStats[cKey].correct++;
      categoryStats[cKey].totalTime += (r.responseTimeMs || 0);
    });

    Object.keys(dialectStats).forEach(k => {
      dialectStats[k].accuracy = Math.round((dialectStats[k].correct / dialectStats[k].total) * 100);
      dialectStats[k].avgTimeMs = Math.round(dialectStats[k].totalTime / dialectStats[k].total);
    });

    Object.keys(categoryStats).forEach(k => {
      categoryStats[k].accuracy = Math.round((categoryStats[k].correct / categoryStats[k].total) * 100);
      categoryStats[k].avgTimeMs = Math.round(categoryStats[k].totalTime / categoryStats[k].total);
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

  exportToCSV() {
    if (this.responses.length === 0) {
      alert('No participant responses logged yet to export!');
      return;
    }

    const headers = [
      'Response ID',
      'Participant ID',
      'Age',
      'Gender',
      'Academic Standing',
      'Coding Experience',
      'Database Experience',
      'Query Writing Experience',
      'Final Thoughts',
      'Session ID',
      'Timestamp (ISO)',
      'Question Category',
      'Active Dialect ID',
      'Active Dialect Name',
      'Selected Key (1-4)',
      'Selected Option',
      'Correct Option',
      'Is Correct',
      'Response Time (ms)',
      'Random Seed',
      'Tab Focus Lost',
      'Tab Switch Count',
      'Focus Lost Duration (ms)',
      'Incomplete Query',
      'Raw Complete Query'
    ];

    const escapeCsvCell = cell => {
      if (cell === null || cell === undefined) return '""';
      const str = String(cell).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = this.responses.map(r => {
      const demo = this.getDemographics(r.participantId) || {};
      const thoughtsObj = this.getFinalThoughts(r.participantId) || {};
      return [
        r.id,
        r.participantId,
        demo.age || '',
        demo.gender || '',
        demo.academicStanding || '',
        demo.codingExp || '',
        demo.dbExp || '',
        demo.queryExp || '',
        thoughtsObj.thoughts || '',
        r.sessionId,
        r.timestamp,
        r.questionCategory,
        r.activeDialect,
        r.activeDialectName,
        r.selectedKey,
        r.selectedOptionText,
        r.correctOptionText,
        r.isCorrect ? 'TRUE' : 'FALSE',
        r.responseTimeMs,
        r.seed,
        r.tabFocusLost ? 'TRUE' : 'FALSE',
        r.tabSwitchCount || 0,
        r.focusLostDurationMs || 0,
        r.incompleteQuery,
        r.rawQuery
      ].map(escapeCsvCell).join(',');
    });

    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `participant_responses_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getResponsesGroupedByParticipant() {
    const groups = {};
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
      if (new Date(r.timestamp) > new Date(groups[uid].lastActive)) {
        groups[uid].lastActive = r.timestamp;
      }
    });

    Object.keys(groups).forEach(uid => {
      const g = groups[uid];
      g.accuracy = g.totalAnswers > 0 ? Math.round((g.correctCount / g.totalAnswers) * 100) : 0;
      g.avgTimeMs = g.totalAnswers > 0 ? Math.round(g.totalTimeMs / g.totalAnswers) : 0;
      g.demographics = this.getDemographics(uid);
      g.finalThoughts = this.getFinalThoughts(uid);
    });

    return groups;
  }

  exportUserCSV(participantId) {
    const userResponses = this.responses.filter(r => (r.participantId || 'Anonymous') === participantId);
    if (userResponses.length === 0) {
      alert(`No responses logged for User ID: ${participantId}`);
      return;
    }

    const headers = [
      'Response ID',
      'Participant ID',
      'Age',
      'Gender',
      'Academic Standing',
      'Coding Experience',
      'Database Experience',
      'Query Writing Experience',
      'Final Thoughts',
      'Session ID',
      'Timestamp (ISO)',
      'Question Category',
      'Active Dialect ID',
      'Active Dialect Name',
      'Selected Key (1-4)',
      'Selected Option',
      'Correct Option',
      'Is Correct',
      'Response Time (ms)',
      'Random Seed',
      'Tab Focus Lost',
      'Tab Switch Count',
      'Focus Lost Duration (ms)',
      'Incomplete Query',
      'Raw Complete Query'
    ];

    const escapeCsvCell = cell => {
      if (cell === null || cell === undefined) return '""';
      const str = String(cell).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = userResponses.map(r => {
      const demo = this.getDemographics(r.participantId) || {};
      const thoughtsObj = this.getFinalThoughts(r.participantId) || {};
      return [
        r.id,
        r.participantId,
        demo.age || '',
        demo.gender || '',
        demo.academicStanding || '',
        demo.codingExp || '',
        demo.dbExp || '',
        demo.queryExp || '',
        thoughtsObj.thoughts || '',
        r.sessionId,
        r.timestamp,
        r.questionCategory,
        r.activeDialect,
        r.activeDialectName,
        r.selectedKey,
        r.selectedOptionText,
        r.correctOptionText,
        r.isCorrect ? 'TRUE' : 'FALSE',
        r.responseTimeMs,
        r.seed,
        r.tabFocusLost ? 'TRUE' : 'FALSE',
        r.tabSwitchCount || 0,
        r.focusLostDurationMs || 0,
        r.incompleteQuery,
        r.rawQuery
      ].map(escapeCsvCell).join(',');
    });

    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `responses_${participantId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  deleteUserResponses(participantId) {
    if (confirm(`Are you sure you want to delete all response logs for User ID: ${participantId}?`)) {
      this.responses = this.responses.filter(r => (r.participantId || 'Anonymous') !== participantId);
      this.saveResponses();
      if (this.channel) {
        this.channel.postMessage({ type: 'DELETE_USER', participantId });
      }
      this.notifyCallbacks({ type: 'DELETE_USER', participantId });
    }
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
      responses: this.responses
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `participant_responses_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async clearAllResponsesWithoutConfirm() {
    this.responses = [];
    localStorage.removeItem(this.storageKey);
    try {
      await fetch('/api/clear-telemetry', { method: 'POST' });
    } catch (e) {}
    if (this.channel) {
      this.channel.postMessage({ type: 'CLEAR_LOGS' });
    }
    this.notifyCallbacks({ type: 'CLEAR_LOGS' });
  }

  clearAllResponses() {
    if (confirm('Are you sure you want to delete all stored participant response logs? This action cannot be undone.')) {
      this.clearAllResponsesWithoutConfirm();
      alert('All response logs cleared.');
    }
  }
}

window.ParticipantAnalytics = ParticipantAnalytics;
