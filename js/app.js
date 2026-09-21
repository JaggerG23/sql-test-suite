/**
 * Main Application Orchestrator
 */
window.ENABLE_DEV_RESET = true;

class QueryExperimentApp {
  constructor() {
    // Fixed deterministic seed (randomization disabled for un-randomized questions)
    this.seed = 42;
    this._adminPreviewGroupId = 'google_sql_python';
    this.schemaGenerator = new SchemaGenerator(this.seed);
    this.queryGenerator = new QueryGenerator(this.seed);
    this.syntaxDialects = new SyntaxDialectManager();
    this.quizGenerator = new QuizGenerator(this.seed);
    this.analytics = new ParticipantAnalytics();

    this.sqliteEngine = new SQLiteEngine();
    this.customJsEngine = new CustomJsEngine();
    this.optimizerEngine = new OptimizerEngine();
    this.humanResolver = new HumanResolver(this);

    this.currentSchema = null;
    this.currentQuery = '';
    this.batchResults = [];
    this._loadQuestionCounter = 0;

    this.init();
  }

  randomizeSeed() {
    // Keep seed fixed to 42 while randomization is disabled
    this.seed = 42;
    const seedInput = document.getElementById('seed-input');
    if (seedInput) seedInput.value = this.seed;
  }

  isParticipantView() {
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

  hasCompletedDemographics(pid) {
    // In the admin dashboard, demographics are never required to preview questions
    if (!this.isParticipantView()) return true;

    if (!this.analytics) return false;
    const targetPid = pid || this.analytics.participantId;
    const demo = this.analytics.getDemographics(targetPid);
    if (!demo) return false;

    // Anyone that visits /index.html before, during, or after the study must be required to fill out demographics again
    const indexVisitedAt = parseInt(localStorage.getItem('sql_study_index_visited_at') || '0', 10);
    const demoSavedAt = demo.savedAtTimestamp || (demo.timestamp ? new Date(demo.timestamp).getTime() : 0);
    if (indexVisitedAt > 0 && demoSavedAt < indexVisitedAt) {
      return false;
    }

    const age = parseInt(demo.age, 10);
    if (isNaN(age) || age < 18) return false;
    if (!demo.gender || (!demo.education && !demo.academicStanding && !demo.highestEducation) || !demo.codingExp || !demo.dbExp) {
      return false;
    }
    if (demo.primaryLanguage !== undefined || demo.countryOfOrigin !== undefined || demo.disability !== undefined) {
      if (!demo.primaryLanguage || !demo.countryOfOrigin || !demo.disability) {
        return false;
      }
    }
    return true;
  }

  async init() {
    this.seed = 42;
    this.currentQuestionNumber = 1;
    this.bindEvents();
    this.initParticipantUI();
    this.populateQuestionJumpDropdown();
    try {
      await Promise.race([
        this.sqliteEngine.init(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (e) {
      console.warn('SQLite WASM init deferred:', e);
    }
    const isIndex = typeof window !== 'undefined' && window.location && (!window.location.pathname.toLowerCase().includes('participant'));
    if (isIndex) {
      const visitTime = Date.now();
      localStorage.setItem('sql_study_index_visited_at', visitTime.toString());
      if (this.analytics && this.analytics.channel) {
        try {
          this.analytics.channel.postMessage({ type: 'INDEX_HTML_VISITED', timestamp: visitTime });
        } catch (e) {}
      }
    }

    if (this.isParticipantView() && !this.hasCompletedDemographics()) {
      this.currentQuestionNumber = 'intake';
      await this.loadIncrementalQuestion('intake');
    } else {
      const pid = this.analytics ? this.analytics.participantId : null;
      const completedResponses = (pid && this.analytics && typeof this.analytics.getParticipantResponses === 'function')
        ? this.analytics.getParticipantResponses(pid)
        : [];
      const completedCount = completedResponses.length;

      if (this.humanResolver && this.humanResolver.stats) {
        this.humanResolver.stats.totalAnswered = Math.min(60, completedCount);
      }

      if (completedCount >= 60) {
        this.currentQuestionNumber = 'final_thoughts';
        await this.loadIncrementalQuestion('final_thoughts');
      } else {
        await this.loadIncrementalQuestion(Math.min(60, completedCount + 1));
      }
    }
    this.renderAnalyticsDashboard();
    if (!this.isParticipantView()) {
      this.bindAdminGroupControls();
      this.populateAdminQuestionGrid();
      this.applyAdminGroup(this._adminPreviewGroupId || 'google_sql_python');
    }
  }

  bindEvents() {
    // Admin Group Select dropdown
    const groupSelect = document.getElementById('admin-group-select');
    if (groupSelect) {
      groupSelect.addEventListener('change', (e) => {
        this.applyAdminGroup(e.target.value);
      });
    }

    // Question Jump Select and Step Buttons
    const jumpSelect = document.getElementById('question-jump-select');
    if (jumpSelect) {
      jumpSelect.addEventListener('change', (e) => {
        this.loadIncrementalQuestion(e.target.value);
      });
    }

    const btnPrevQ = document.getElementById('btn-prev-q');
    if (btnPrevQ) {
      btnPrevQ.addEventListener('click', () => {
        const cur = this.currentQuestionNumber;
        if (cur === 'final_thoughts') {
          this.loadIncrementalQuestion(60);
        } else if (cur === 'intake') {
          this.loadIncrementalQuestion('intake');
        } else {
          const num = parseInt(cur, 10) || 1;
          if (num <= 1) {
            this.loadIncrementalQuestion('intake');
          } else {
            this.loadIncrementalQuestion(num - 1);
          }
        }
      });
    }

    const btnNextQ = document.getElementById('btn-next-q');
    if (btnNextQ) {
      btnNextQ.addEventListener('click', () => {
        const cur = this.currentQuestionNumber;
        if (cur === 'intake') {
          this.loadIncrementalQuestion(1);
        } else if (cur === 'final_thoughts') {
          this.loadIncrementalQuestion('final_thoughts');
        } else {
          const num = parseInt(cur, 10) || 1;
          if (num >= 60) {
            this.loadIncrementalQuestion('final_thoughts');
          } else {
            this.loadIncrementalQuestion(num + 1);
          }
        }
      });
    }





    // User Folders Expand / Collapse All Buttons
    const btnExpandAll = document.getElementById('btn-expand-all-folders');
    if (btnExpandAll) {
      btnExpandAll.addEventListener('click', () => this.expandAllUserFolders());
    }

    const btnCollapseAll = document.getElementById('btn-collapse-all-folders');
    if (btnCollapseAll) {
      btnCollapseAll.addEventListener('click', () => this.collapseAllUserFolders());
    }

    // Sliders
    ['cfg-tables', 'cfg-cols', 'cfg-rows', 'cfg-batch-count'].forEach(id => {
      const input = document.getElementById(id);
      const label = document.getElementById(`val-${id}`);
      if (input && label) {
        input.addEventListener('input', () => {
          label.textContent = input.value;
        });
      }
    });

    // Generator Buttons
    const btnRegenSchema = document.getElementById('btn-regen-schema');
    if (btnRegenSchema) {
      btnRegenSchema.addEventListener('click', () => {
        this.generateSchemaOnly();
      });
    }



    const btnExecQuery = document.getElementById('btn-execute-query');
    if (btnExecQuery) {
      btnExecQuery.addEventListener('click', () => {
        this.executeAcrossEngines();
      });
    }

    // SQL Formatting & Copy
    const btnFormatSql = document.getElementById('btn-format-sql');
    if (btnFormatSql) {
      btnFormatSql.addEventListener('click', () => {
        const editor = document.getElementById('sql-editor');
        if (editor) editor.value = this.formatSQL(editor.value);
      });
    }

    const btnCopySql = document.getElementById('btn-copy-sql');
    if (btnCopySql) {
      btnCopySql.addEventListener('click', () => {
        const editor = document.getElementById('sql-editor');
        if (editor) {
          navigator.clipboard.writeText(editor.value);
          alert('SQL query copied to clipboard!');
        }
      });
    }

    const btnCopyDdl = document.getElementById('btn-copy-ddl');
    if (btnCopyDdl) {
      btnCopyDdl.addEventListener('click', () => {
        const ddl = document.getElementById('schema-ddl-output');
        if (ddl) {
          navigator.clipboard.writeText(ddl.textContent);
          alert('Schema DDL copied to clipboard!');
        }
      });
    }

    // Batch Suite (Optional)
    const btnRunBatch = document.getElementById('btn-run-batch');
    if (btnRunBatch) {
      btnRunBatch.addEventListener('click', () => {
        this.runBatchTestSuite();
      });
    }

    // Participant View button: fresh participant session and forced demographics
    const btnParticipantView = document.getElementById('btn-participant-view-link');
    if (btnParticipantView) {
      btnParticipantView.addEventListener('click', () => {
        const now = Date.now();
        localStorage.setItem('sql_study_index_visited_at', now.toString());
        if (this.analytics) {
          const newPid = 'user_' + Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 5);
          this.analytics.setParticipantId(newPid);
        }
      });
    }

    // Nav Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById(targetTab).classList.add('active');

        if (targetTab === 'tab-human') {
          this.syncChallengeContainerLocation();
          if (!this.hasCompletedDemographics()) {
            this.currentQuestionNumber = 'intake';
            this.loadIncrementalQuestion('intake');
          }
        } else if (targetTab === 'tab-analytics') {
          this.renderAnalyticsDashboard();
        }
      });
    });

    // Engine Internal Tabs
    document.querySelectorAll('.e-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const parentCard = e.currentTarget.closest('.card-body');
        const targetId = e.currentTarget.dataset.target;
        parentCard.querySelectorAll('.e-tab').forEach(t => t.classList.remove('active'));
        parentCard.querySelectorAll('.engine-tab-content').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        parentCard.querySelector(`#${targetId}`).classList.add('active');
      });
    });
  }

  // -----------------------------------------------------------------------
  //  Admin: Group & Question Preview Controls
  // -----------------------------------------------------------------------

  /**
   * Populates the 6×10 question grid in the admin sidebar.
   * Called once after the first question loads; also re-called on question change
   * to highlight the currently active cell.
   */
  populateAdminQuestionGrid() {
    const grid = document.getElementById('admin-question-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Render 10 block rows, each with a block label + 6 question buttons
    for (let blockIdx = 1; blockIdx <= 10; blockIdx++) {
      // Block label cell
      const label = document.createElement('div');
      label.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.3);font-weight:700;text-align:right;padding-right:6px;padding-top:4px;white-space:nowrap;';
      label.textContent = `Blk ${blockIdx}`;
      grid.appendChild(label);

      // 6-cell inner grid
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;';

      for (let v = 1; v <= 6; v++) {
        const qNum = (blockIdx - 1) * 6 + v;
        const btn = document.createElement('button');
        btn.id = `admin-qgrid-btn-${qNum}`;
        btn.className = 'admin-qgrid-btn';
        btn.title = `Q${qNum} — Block ${blockIdx}, variation ${v}`;
        btn.textContent = qNum;
        btn.dataset.qnum = qNum;

        const isActive = (qNum === this.currentQuestionNumber || qNum === parseInt(this.currentQuestionNumber, 10));
        if (isActive) {
          btn.classList.add('active');
        }

        // Native CSS classes handle hover (:hover:not(.active)) and active state
        row.appendChild(btn);
      }
      grid.appendChild(row);
    }

    // Ensure state is cleanly synchronized
    this.syncAdminQuestionGrid(this.currentQuestionNumber || 1);
  }

  /**
   * Ensures #human-challenge-container is mounted in the stage.
   */
  syncChallengeContainerLocation() {
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    const targetStage = document.getElementById('admin-preview-stage') || document.getElementById('human-stage');
    if (targetStage && container.parentElement !== targetStage) {
      targetStage.appendChild(container);
    }
  }

  /**
   * Updates the active highlight in the question grid to match currentQuestionNumber.
   */
  syncAdminQuestionGrid(activeQNum) {
    const targetQ = (activeQNum === 'intake' || activeQNum === 'final_thoughts')
      ? activeQNum
      : parseInt(activeQNum, 10);

    // Clear focus from any active button to avoid browser focus outlines lingering
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      const activeTag = (document.activeElement.tagName || '').toLowerCase();
      if (activeTag === 'button') {
        document.activeElement.blur();
      }
    }

    for (let q = 1; q <= 60; q++) {
      const btn = document.getElementById(`admin-qgrid-btn-${q}`);
      if (!btn) continue;
      const isActive = (q === targetQ);
      btn.classList.toggle('active', isActive);

      // Wipe out any lingering inline styles so CSS classes rule completely
      btn.style.border = '';
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }

    const btnIntake = document.getElementById('admin-qgrid-btn-intake');
    if (btnIntake) {
      const isIntake = (targetQ === 'intake');
      btnIntake.classList.toggle('active', isIntake);
      btnIntake.style.border = isIntake ? '1.5px solid rgba(99, 102, 241, 0.9)' : '1.5px solid rgba(99, 102, 241, 0.4)';
      btnIntake.style.background = isIntake ? 'rgba(99, 102, 241, 0.35)' : 'rgba(99, 102, 241, 0.15)';
      btnIntake.style.color = isIntake ? '#ffffff' : '#c7d2fe';
    }

    const btnFinal = document.getElementById('admin-qgrid-btn-final_thoughts');
    if (btnFinal) {
      const isFinal = (targetQ === 'final_thoughts');
      btnFinal.classList.toggle('active', isFinal);
      btnFinal.style.border = isFinal ? '1.5px solid rgba(245, 158, 11, 0.9)' : '1.5px solid rgba(245, 158, 11, 0.35)';
      btnFinal.style.background = isFinal ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.12)';
      btnFinal.style.color = isFinal ? '#ffffff' : '#fde68a';
    }

    const select = document.getElementById('question-jump-select');
    if (select && activeQNum !== undefined && activeQNum !== null) {
      select.value = activeQNum;
    }

    const stageBadge = document.getElementById('admin-preview-stage-badge');
    if (stageBadge) {
      if (activeQNum === 'intake') {
        stageBadge.textContent = 'Previewing: Pre-Experiment Questionnaire';
        stageBadge.style.color = '#c7d2fe';
        stageBadge.style.borderColor = 'rgba(99, 102, 241, 0.4)';
      } else if (activeQNum === 'final_thoughts') {
        stageBadge.textContent = 'Previewing: Final Thoughts & Conclusion';
        stageBadge.style.color = '#fde68a';
        stageBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      } else {
        const qNum = parseInt(activeQNum, 10) || 1;
        const bIdx = Math.floor((qNum - 1) / 6) + 1;
        const vIdx = ((qNum - 1) % 6) + 1;
        stageBadge.textContent = `Previewing: Question ${qNum} / 60 (Block ${bIdx}.${vIdx})`;
        stageBadge.style.color = '#a78bfa';
        stageBadge.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      }
    }
  }

  /**
   * Switches the admin preview group and re-renders the current question with
   * the selected group's SQL dialect + host language.
   * Keeps the header dropdown and sidebar buttons in sync.
   */
  applyAdminGroup(groupId) {
    if (!this.humanResolver) return;

    // Track currently selected group for re-application on question change
    this._adminPreviewGroupId = groupId;

    // Sync header dropdown if present
    const groupSelect = document.getElementById('admin-group-select');
    if (groupSelect) groupSelect.value = groupId;

    // Sync tab group buttons
    document.querySelectorAll('.admin-group-btn').forEach(btn => {
      const gid = btn.dataset.groupId;
      const isActive = (gid === groupId);
      btn.classList.toggle('active', isActive);

      const COLORS = {
        google_sql_python:     { border: '1.5px solid rgba(56,189,248,0.55)', bg: 'rgba(56,189,248,0.12)', color: '#93c5fd' },
        google_sql_javascript: { border: '1.5px solid rgba(56,189,248,0.55)', bg: 'rgba(56,189,248,0.12)', color: '#93c5fd' },
        quorum_python:         { border: '1.5px solid rgba(16,185,129,0.55)', bg: 'rgba(16,185,129,0.12)', color: '#6ee7b7' },
        quorum_javascript:     { border: '1.5px solid rgba(16,185,129,0.55)', bg: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }
      };
      const c = COLORS[gid] || COLORS.google_sql_python;

      if (isActive) {
        btn.style.border = c.border;
        btn.style.background = c.bg;
        btn.style.color = c.color;
      } else {
        btn.style.border = '1.5px solid rgba(255,255,255,0.1)';
        btn.style.background = 'rgba(0,0,0,0.2)';
        btn.style.color = '#94a3b8';
      }
    });

    // Update badge label
    const label = document.getElementById('admin-active-group-label');
    const GROUP_LABELS = {
      google_sql_python:     'Google SQL + Python',
      google_sql_javascript: 'Google SQL + JavaScript',
      quorum_python:         'Quorum + Python',
      quorum_javascript:     'Quorum + JavaScript'
    };
    if (label) label.textContent = GROUP_LABELS[groupId] || groupId;

    // Re-render current question with chosen group's dialect + host language
    this.syncChallengeContainerLocation();
    this.humanResolver.switchGroup(groupId);
  }

  /**
   * Binds admin group buttons via event delegation.
   * Called once from init() on the admin dashboard.
   */
  bindAdminGroupControls() {
    // Use event delegation on document — works even if buttons are inside
    // a tab-content that has display:none when this runs
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-group-btn');
      if (btn && btn.dataset.groupId) {
        this.applyAdminGroup(btn.dataset.groupId);
      }

      // Also handle question grid clicks from the admin tab
      const qBtn = e.target.closest('[id^="admin-qgrid-btn-"]');
      if (qBtn && qBtn.dataset.qnum) {
        const qNum = parseInt(qBtn.dataset.qnum, 10);
        if (qNum >= 1 && qNum <= 60) {
          this.syncAdminQuestionGrid(qNum);
          this.loadIncrementalQuestion(qNum);
        }
      }

      // Handle dedicated intake and final thoughts buttons
      if (e.target.closest('#admin-qgrid-btn-intake')) {
        this.syncAdminQuestionGrid('intake');
        this.loadIncrementalQuestion('intake');
      }
      if (e.target.closest('#admin-qgrid-btn-final_thoughts')) {
        this.syncAdminQuestionGrid('final_thoughts');
        this.loadIncrementalQuestion('final_thoughts');
      }
    });
  }

  async generateAll() {
    await this.generateSchemaOnly();
    this.generateQueryOnly();
  }

  async generateSchemaOnly() {
    const numTablesElem = document.getElementById('cfg-tables');
    const numTables = numTablesElem ? parseInt(numTablesElem.value, 10) : 5;

    const colsPerTableElem = document.getElementById('cfg-cols');
    const colsPerTable = colsPerTableElem ? parseInt(colsPerTableElem.value, 10) : 4;

    const rowsPerTableElem = document.getElementById('cfg-rows');
    const rowsPerTable = rowsPerTableElem ? parseInt(rowsPerTableElem.value, 10) : 50;

    const fkElem = document.getElementById('cfg-fk');
    const useFK = fkElem ? fkElem.checked : true;

    this.schemaGenerator = new SchemaGenerator(this.seed);
    this.currentSchema = this.schemaGenerator.generateSchema(numTables, colsPerTable, rowsPerTable, useFK);

    // Load schema into engines
    await this.sqliteEngine.loadSchemaAndData(this.currentSchema);
    this.customJsEngine.loadSchemaAndData(this.currentSchema);
    this.optimizerEngine.loadSchemaAndData(this.currentSchema);

    // Update UI Schema Preview
    this.renderSchemaPreview();
  }

  generateQueryOnly() {
    const tierElem = document.getElementById('cfg-complexity');
    const tier = tierElem ? tierElem.value : 'medium';

    const allowElem = document.getElementById('cfg-allow-nulls');
    const allowNULL = allowElem ? allowElem.checked : true;

    this.queryGenerator = new QueryGenerator(this.seed);
    this.currentQuery = this.queryGenerator.generateQuery(this.currentSchema, tier, allowNULL);

    const editor = document.getElementById('sql-editor');
    if (editor) editor.value = this.currentQuery;

    const badge = document.getElementById('query-tier-badge');
    if (badge) badge.textContent = `${tier.toUpperCase()} TIER`;

    // Automatically execute across all engines
    this.executeAcrossEngines();
  }

  populateQuestionJumpDropdown() {
    const select = document.getElementById('question-jump-select');
    if (!select) return;

    select.innerHTML = '';
    
    const optIntake = document.createElement('option');
    optIntake.value = 'intake';
    optIntake.textContent = '📋 Pre-Experiment Questionnaire';
    select.appendChild(optIntake);

    for (let qNum = 1; qNum <= 60; qNum++) {
      const bIdx = Math.floor((qNum - 1) / 6) + 1;
      const vIdx = ((qNum - 1) % 6) + 1;
      const opt = document.createElement('option');
      opt.value = qNum;
      opt.textContent = `Q ${qNum} / 60 (Block ${bIdx}.${vIdx})`;
      select.appendChild(opt);
    }

    const optFinal = document.createElement('option');
    optFinal.value = 'final_thoughts';
    optFinal.textContent = '🏁 Final Thoughts & Conclusion';
    select.appendChild(optFinal);

    select.value = this.currentQuestionNumber || 1;
  }

  async loadIncrementalQuestion(targetQNum) {
    const isParticipantPage = this.isParticipantView();
    this.syncChallengeContainerLocation();

    // Immediately update grid highlight so user gets instant visual confirmation
    // and older button highlights are immediately removed
    if (!this.isParticipantView()) {
      this.syncAdminQuestionGrid(targetQNum);
    }

    const currentReq = ++this._loadQuestionCounter;

    if (targetQNum === 'intake') {
      this.currentQuestionNumber = 'intake';
      const select = document.getElementById('question-jump-select');
      if (select) select.value = 'intake';
      this.syncAdminQuestionGrid('intake');
      if (this.humanResolver) {
        this.humanResolver.intakeCompleted = false;
        this.humanResolver.renderIntakeScreen();
      }
      return;
    }

    const isOver60 = (typeof targetQNum === 'number' && targetQNum > 60) || (parseInt(targetQNum, 10) > 60);
    if (targetQNum === 'final_thoughts' || isOver60) {
      this.currentQuestionNumber = 'final_thoughts';
      const select = document.getElementById('question-jump-select');
      if (select) select.value = 'final_thoughts';
      this.syncAdminQuestionGrid('final_thoughts');
      if (this.humanResolver) this.humanResolver.renderFinalThoughtsScreen();
      return;
    }

    // Check if intake form has been completed (Mandatory only on participant page /participants.html)
    if (this.isParticipantView() && !this.hasCompletedDemographics()) {
      this.currentQuestionNumber = 'intake';
      const select = document.getElementById('question-jump-select');
      if (select) select.value = 'intake';
      if (this.humanResolver) {
        this.humanResolver.intakeCompleted = false;
        this.humanResolver.renderIntakeScreen();
      }
      return;
    } else if (this.humanResolver) {
      this.humanResolver.intakeCompleted = true;
    }

    const qNum = Math.max(1, Math.min(60, parseInt(targetQNum, 10) || 1));
    this.currentQuestionNumber = qNum;

    const select = document.getElementById('question-jump-select');
    if (select) select.value = qNum;

    const qIndex = qNum - 1; // 0 to 59
    const blockIndex = Math.floor(qIndex / 6);
    const blockSeed = this.seed + blockIndex * 137;
    const variationIndex = qIndex % 6;

    if (!this.currentSchema || this.lastBlockIndex !== blockIndex) {
      this.lastBlockIndex = blockIndex;
      this.schemaGenerator = new SchemaGenerator(blockSeed);
      this.currentSchema = this.schemaGenerator.generateSchema(5, 4, 30, true);

      await this.sqliteEngine.loadSchemaAndData(this.currentSchema);
      this.customJsEngine.loadSchemaAndData(this.currentSchema);
      this.optimizerEngine.loadSchemaAndData(this.currentSchema);
      this.renderSchemaPreview();
    }

    // Check if a newer question request was initiated while waiting for schema loading
    if (currentReq !== this._loadQuestionCounter) {
      return;
    }

    this.queryGenerator = new QueryGenerator(blockSeed);
    this.currentQuery = this.queryGenerator.generateIncrementalQuery(this.currentSchema, 'medium', true, variationIndex);

    const editor = document.getElementById('sql-editor');
    if (editor) editor.value = this.currentQuery;

    const r1 = this.sqliteEngine.executeQuery(this.currentQuery);
    const r2 = this.customJsEngine.executeQuery(this.currentQuery);
    const r3 = this.optimizerEngine.executeQuery(this.currentQuery);

    this.updateEngineCardUI(1, r1, r1.plan);
    this.updateEngineCardUI(2, r2, r2.astTrace);
    this.updateEngineCardUI(3, r3, this.formatCostAnalysis(r3.costAnalysis));
    this.renderDifferentialComparison(r1, r2, r3);

    const groundTruth = (r1 && r1.success && r1.columns && r1.columns.length > 0) ? r1 : ((r2 && r2.success) ? r2 : r3);
    this.humanResolver.startNewChallenge(this.currentSchema, this.currentQuery, groundTruth, qNum);

    // Admin-only: sync sidebar question grid highlight
    if (!this.isParticipantView() && currentReq === this._loadQuestionCounter) {
      this.syncAdminQuestionGrid(qNum);

      // Re-apply the currently selected admin preview group (if any) so the
      // code snippet immediately shows the right dialect/language for the new Q.
      if (this._adminPreviewGroupId) {
        this.applyAdminGroup(this._adminPreviewGroupId);
      }
    }
  }

  async generateNextIncrementalQuestion() {
    const cur = this.currentQuestionNumber;
    if (cur === 'intake') {
      await this.loadIncrementalQuestion(1);
    } else if (cur === 'final_thoughts') {
      await this.loadIncrementalQuestion('final_thoughts');
    } else {
      const num = parseInt(cur, 10) || 1;
      if (num >= 60) {
        await this.loadIncrementalQuestion('final_thoughts');
      } else {
        await this.loadIncrementalQuestion(num + 1);
      }
    }
  }

  async executeAcrossEngines() {
    const editor = document.getElementById('sql-editor');
    const sqlText = editor ? editor.value.trim() : this.currentQuery;
    if (!sqlText) return;

    this.setEngineStatuses('Executing...', 'status-idle');

    // Engine 1: SQLite WASM
    const r1 = this.sqliteEngine.executeQuery(sqlText);
    this.updateEngineCardUI(1, r1, r1.plan);

    // Engine 2: Custom JS AST Engine
    const r2 = this.customJsEngine.executeQuery(sqlText);
    this.updateEngineCardUI(2, r2, r2.astTrace);

    // Engine 3: Optimizer Engine
    const r3 = this.optimizerEngine.executeQuery(sqlText);
    this.updateEngineCardUI(3, r3, this.formatCostAnalysis(r3.costAnalysis));

    // Differential Check
    this.renderDifferentialComparison(r1, r2, r3);

    // Start / Update Human Challenge Mode
    const groundTruth = (r1 && r1.success && r1.columns && r1.columns.length > 0) ? r1 : ((r2 && r2.success) ? r2 : r3);
    this.humanResolver.startNewChallenge(this.currentSchema, sqlText, groundTruth);
  }

  updateEngineCardUI(engineNum, res, detailText) {
    const rowsElem = document.getElementById(`rows-e${engineNum}`);
    const timeElem = document.getElementById(`time-e${engineNum}`);
    const statusElem = document.getElementById(`status-e${engineNum}`);
    const resultsContainer = document.getElementById(`container-e${engineNum}-results`);

    if (res.success) {
      if (rowsElem) rowsElem.textContent = `${res.rowCount} rows`;
      if (timeElem) timeElem.textContent = `${res.executionTimeMs} ms`;
      if (statusElem) {
        statusElem.textContent = 'Success';
        statusElem.className = 'status-badge status-success';
      }
      if (resultsContainer) resultsContainer.innerHTML = this.renderTableHTML(res.columns, res.rows);
    } else {
      if (rowsElem) rowsElem.textContent = '0 rows';
      if (timeElem) timeElem.textContent = '0 ms';
      if (statusElem) {
        statusElem.textContent = 'Error';
        statusElem.className = 'status-badge status-error';
      }
      if (resultsContainer) resultsContainer.innerHTML = `<div class="p-3 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${res.error}</div>`;
    }

    // Update Plan / Trace / Cost container
    const e1Plan = document.getElementById('container-e1-plan');
    if (e1Plan && engineNum === 1) e1Plan.textContent = detailText || 'No plan available';

    const e2Ast = document.getElementById('container-e2-ast');
    if (e2Ast && engineNum === 2) e2Ast.textContent = detailText || 'No trace available';

    const e3Cost = document.getElementById('container-e3-cost');
    if (e3Cost && engineNum === 3) e3Cost.innerHTML = detailText || 'No cost analysis available';
  }

  formatCostAnalysis(costAnalysis) {
    if (!costAnalysis || !costAnalysis.planSteps) {
      return '<div class="p-2 text-muted fs-xs">No cost metrics available.</div>';
    }
    return `
      <div class="cost-summary mb-2 p-1" style="background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px;">
        <strong>Total Cost Score:</strong> <span class="badge badge-accent">${costAnalysis.costScore || 0}</span>
      </div>
      <div class="cost-steps" style="font-size: 10.5px;">
        ${(costAnalysis.planSteps || []).map(step => `
          <div class="cost-step-item mb-1 p-1" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div class="d-flex justify-between"><strong>${step.phase}</strong> <span class="text-accent">${step.strategy}</span></div>
            <div class="text-muted fs-xs">${step.desc || ''}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderDifferentialComparison(r1, r2, r3) {
    const badge = document.getElementById('diff-status-badge');
    const body = document.getElementById('diff-summary-body');

    if (!badge || !body) return;

    const match12 = r1.rowCount === r2.rowCount;
    const match13 = r1.rowCount === r3.rowCount;
    const allMatch = match12 && match13 && r1.success && r2.success && r3.success;

    if (allMatch) {
      badge.textContent = 'PASSED: PERFECT MATCH';
      badge.className = 'badge badge-success';
      body.innerHTML = `
        <div class="diff-result diff-pass">
          <i class="fa-solid fa-circle-check text-success fs-lg"></i>
          <div>
            <h4 class="text-success m-0">All 3 Resolution Engines Produced Matching Results!</h4>
            <p class="text-muted m-0 fs-xs">WASM SQLite (${r1.rowCount} rows), Custom JS (${r2.rowCount} rows), Strategy Engine (${r3.rowCount} rows) agree on output cardinality.</p>
          </div>
        </div>
      `;
    } else {
      badge.textContent = 'MISMATCH / ERROR DETECTED';
      badge.className = 'badge badge-danger';
      body.innerHTML = `
        <div class="diff-result diff-fail">
          <i class="fa-solid fa-circle-exclamation text-danger fs-lg"></i>
          <div>
            <h4 class="text-danger m-0">Discrepancy Found Between Resolution Engines</h4>
            <p class="text-muted m-0 fs-xs">
              SQLite WASM: ${r1.success ? r1.rowCount + ' rows' : 'Error (' + r1.error + ')'} | 
              Custom JS: ${r2.success ? r2.rowCount + ' rows' : 'Error (' + r2.error + ')'} | 
              Optimizer: ${r3.success ? r3.rowCount + ' rows' : 'Error (' + r3.error + ')'}
            </p>
          </div>
        </div>
      `;
    }
  }

  async runBatchTestSuite() {
    const count = parseInt(document.getElementById('cfg-batch-count').value, 10) || 20;
    const progressBadge = document.getElementById('batch-progress-text');
    const tbody = document.getElementById('batch-results-tbody');

    progressBadge.textContent = `Running 0 / ${count}...`;
    tbody.innerHTML = '';

    let passedCount = 0;
    let failedCount = 0;
    let totalWasmTime = 0;
    this.batchResults = [];

    const tiers = ['simple', 'medium', 'complex'];

    for (let i = 1; i <= count; i++) {
      const iterSeed = this.seed + i * 17;
      const tier = tiers[(i - 1) % 3];

      const sGen = new SchemaGenerator(iterSeed);
      const schema = sGen.generateSchema(5, 4, 30, true);

      const qGen = new QueryGenerator(iterSeed);
      const query = qGen.generateQuery(schema, tier, true);

      // Load & Run
      await this.sqliteEngine.loadSchemaAndData(schema);
      this.customJsEngine.loadSchemaAndData(schema);
      this.optimizerEngine.loadSchemaAndData(schema);

      const r1 = this.sqliteEngine.executeQuery(query);
      const r2 = this.customJsEngine.executeQuery(query);
      const r3 = this.optimizerEngine.executeQuery(query);

      const isMatch = r1.success && r2.success && r3.success && (r1.rowCount === r2.rowCount);
      if (isMatch) passedCount++; else failedCount++;
      totalWasmTime += r1.executionTimeMs;

      const previewQuery = query.replace(/\n/g, ' ').substring(0, 45) + '...';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i}</td>
        <td><span class="badge">${tier}</span></td>
        <td class="font-mono fs-xs">${previewQuery}</td>
        <td>${r1.rowCount}</td>
        <td>${r2.rowCount}</td>
        <td>${r3.rowCount}</td>
        <td><span class="badge ${isMatch ? 'status-success' : 'status-error'}">${isMatch ? 'MATCH' : 'MISMATCH'}</span></td>
        <td>${r1.executionTimeMs} ms</td>
      `;
      tbody.appendChild(tr);

      progressBadge.textContent = `Running ${i} / ${count}...`;
      await new Promise(r => setTimeout(r, 10));
    }

    // Reset current schema/query back to active UI state
    this.sqliteEngine.loadSchemaAndData(this.currentSchema);
    this.customJsEngine.loadSchemaAndData(this.currentSchema);
    this.optimizerEngine.loadSchemaAndData(this.currentSchema);

    // Update Stats UI
    document.getElementById('bstat-total').textContent = count;
    document.getElementById('bstat-passed').textContent = passedCount;
    document.getElementById('bstat-failed').textContent = failedCount;
    document.getElementById('bstat-avgtime').textContent = `${(totalWasmTime / count).toFixed(2)} ms`;

    progressBadge.textContent = `Completed ${count} Tests`;
  }

  renderSchemaPreview() {
    const tableBadge = document.getElementById('table-count-badge');
    if (tableBadge) tableBadge.textContent = `${this.currentSchema.tables.length} Tables`;

    const ddlOutput = document.getElementById('schema-ddl-output');
    if (ddlOutput) ddlOutput.textContent = this.currentSchema.ddl;

    const container = document.getElementById('schema-tables-container');
    if (!container) return;
    container.innerHTML = '';

    this.currentSchema.tables.forEach(table => {
      const card = document.createElement('div');
      card.className = 'card';
      const cols = table.columns;

      card.innerHTML = `
        <div class="card-header">
          <h4><i class="fa-solid fa-table"></i> ${table.name}</h4>
          <span class="badge badge-accent">${cols.length} attributes</span>
        </div>
        <div class="card-body p-3">
          <div class="attribute-list" style="display: flex; flex-direction: column; gap: 8px;">
            ${cols.map(col => `
              <div class="attribute-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; font-family: var(--font-mono); font-size: 13px;">
                <span class="attr-name" style="color: var(--text-main); font-weight: 600;">
                  ${col.pk ? '<span title="Primary Key" style="color: #f59e0b; margin-right: 4px;">🔑</span>' : ''}${col.name}
                </span>
                <span class="attr-type" style="color: var(--color-primary); background: rgba(99, 102, 241, 0.12); padding: 2px 8px; border-radius: 4px; font-size: 11px; border: 1px solid rgba(99, 102, 241, 0.25);">
                  ${col.type} ${col.pk ? '(PK)' : col.fk ? '(FK)' : ''}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderTableHTML(columns, rows) {
    if (!columns || columns.length === 0) {
      return `<p class="placeholder-text">No result dataset returned</p>`;
    }

    let html = `<table class="data-table"><thead><tr>`;
    columns.forEach(col => { html += `<th>${col}</th>`; });
    html += `</tr></thead><tbody>`;

    rows.forEach(row => {
      html += `<tr>`;
      row.forEach(val => {
        const dispVal = val === null ? '<span class="text-muted">NULL</span>' : val;
        html += `<td>${dispVal}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    return html;
  }

  formatCostAnalysis(costData) {
    if (!costData || !costData.planSteps) return 'No cost analysis data';

    let html = `
      <div class="cost-score-banner mb-3">
        <span class="text-muted">Total Cost Units:</span> <strong class="fs-lg text-warning">${costData.totalCostScore} Score</strong>
        (<span class="fs-xs text-muted">${costData.ioCostPages} IO Pages, ${costData.cpuOperations} CPU Ops</span>)
      </div>
      <div class="plan-steps-list">
    `;

    costData.planSteps.forEach(step => {
      html += `
        <div class="plan-step-item mb-2 p-2" style="background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid var(--color-warning);">
          <div class="d-flex justify-content-between" style="display:flex; justify-content:space-between;">
            <strong style="color:var(--color-warning);">${step.phase}: ${step.target}</strong>
            <span class="badge">${step.strategy}</span>
          </div>
          <p class="m-0 fs-xs text-muted" style="margin-top:4px;">${step.desc}</p>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  formatSQL(sql) {
    return sql
      .replace(/\s+/g, ' ')
      .replace(/\s(FROM|JOIN|INNER JOIN|LEFT JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)\s/gi, '\n$1 ')
      .trim();
  }

  setEngineStatuses(text, className) {
    [1, 2, 3].forEach(n => {
      const elem = document.getElementById(`status-e${n}`);
      if (elem) {
        elem.textContent = text;
        elem.className = `status-badge ${className}`;
      }
    });
  }

  initParticipantUI() {
    const input = document.getElementById('participant-id-input');
    const btnCopy = document.getElementById('btn-copy-user-id');
    const copyText = document.getElementById('copy-btn-text');

    const handleCopy = () => {
      if (!input || !input.value) return;
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(input.value).then(() => {
        if (copyText) copyText.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Copied!';
        if (btnCopy) btnCopy.style.background = 'rgba(16, 185, 129, 0.3)';
        setTimeout(() => {
          if (copyText) copyText.textContent = 'Copy';
          if (btnCopy) btnCopy.style.background = 'rgba(56, 189, 248, 0.25)';
        }, 1500);
      }).catch(() => {
        try {
          document.execCommand('copy');
          if (copyText) copyText.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Copied!';
          setTimeout(() => {
            if (copyText) copyText.textContent = 'Copy';
          }, 1500);
        } catch(e){}
      });
    };

    if (input) {
      input.value = this.analytics.participantId;
      input.setAttribute('readonly', 'readonly');
      input.removeAttribute('disabled');
      input.setAttribute('title', 'Click to copy User ID to clipboard');
      input.style.cursor = 'pointer';
      input.addEventListener('click', handleCopy);
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', handleCopy);
    }

    // Dynamic app version tag synchronization
    const versionBadge = document.getElementById('app-version-tag') || document.querySelector('.brand .badge');
    if (versionBadge && window.studyConfig && typeof window.studyConfig.getVersion === 'function') {
      versionBadge.textContent = window.studyConfig.getVersion();
    }

    // Dev Reset Test button binding (controlled by studyConfig in participant view)
    const btnResetTest = document.getElementById('btn-reset-test');
    if (btnResetTest) {
      const updateResetBtnVisibility = () => {
        const isPart = this.isParticipantView();
        if (isPart) {
          const isEnabled = window.studyConfig ? window.studyConfig.isParticipantResetButtonEnabled() : true;
          btnResetTest.style.display = isEnabled ? 'inline-flex' : 'none';
        } else {
          btnResetTest.style.display = 'inline-flex';
        }
      };

      updateResetBtnVisibility();
      btnResetTest.addEventListener('click', () => this.resetParticipantTest());

      // Live updates across tabs / storage events
      window.addEventListener('storage', (e) => {
        if (e.key === 'sql_study_participant_reset_btn_enabled') {
          updateResetBtnVisibility();
        }
      });
      if (this.analytics && this.analytics.channel) {
        this.analytics.channel.addEventListener('message', (ev) => {
          if (ev.data && ev.data.type === 'CONFIG_UPDATED' && ev.data.key === 'PARTICIPANT_RESET_BTN_ENABLED') {
            updateResetBtnVisibility();
          }
        });
      }
    }

    // Subscribe to real-time telemetry updates across tabs/windows
    if (this.analytics) {
      this.analytics.subscribe((payload) => {
        this.renderAnalyticsDashboard(payload);
      });
    }

    const btnCsv = document.getElementById('btn-export-csv');
    if (btnCsv) {
      btnCsv.addEventListener('click', () => this.analytics.exportToCSV());
    }

    const btnJson = document.getElementById('btn-export-json');
    if (btnJson) {
      btnJson.addEventListener('click', () => this.analytics.exportToJSON());
    }

    const btnClear = document.getElementById('btn-clear-logs');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.analytics.clearAllResponses();
        this.renderAnalyticsDashboard();
      });
    }

    // Admin Dashboard Toggle for Participant View Reset Button
    const toggleResetBtn = document.getElementById('toggle-participant-reset-btn');
    const labelResetStatus = document.getElementById('label-participant-reset-btn-status');
    if (toggleResetBtn) {
      const updateToggleUI = () => {
        const isEnabled = window.studyConfig ? window.studyConfig.isParticipantResetButtonEnabled() : true;
        toggleResetBtn.checked = isEnabled;
        if (labelResetStatus) {
          labelResetStatus.textContent = isEnabled ? 'Visible' : 'Hidden';
          labelResetStatus.style.color = isEnabled ? '#ef4444' : '#94a3b8';
        }
      };

      updateToggleUI();

      toggleResetBtn.addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (window.studyConfig) {
          window.studyConfig.setParticipantResetButtonEnabled(checked);
        }
        if (labelResetStatus) {
          labelResetStatus.textContent = checked ? 'Visible' : 'Hidden';
          labelResetStatus.style.color = checked ? '#ef4444' : '#94a3b8';
        }
      });

      // Synchronize across open admin tabs
      window.addEventListener('storage', (e) => {
        if (e.key === 'sql_study_participant_reset_btn_enabled') {
          updateToggleUI();
        }
      });
    }

    // Modal: Import & Cloud Sync
    this.bindImportAndCloudSyncUI();
  }

  bindImportAndCloudSyncUI() {
    const modal = document.getElementById('modal-import-telemetry');
    const btnImport = document.getElementById('btn-import-telemetry');
    const btnClose = document.getElementById('btn-close-import-modal');

    const openModal = () => {
      if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        const urlInput = document.getElementById('input-cloud-webhook-url');
        if (urlInput && window.studyConfig) {
          urlInput.value = window.studyConfig.getCloudWebhookUrl();
        }
      }
    };

    const closeModal = () => {
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
    };

    if (btnImport) btnImport.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // 1. File Upload Import (JSON & CSV)
    const btnTriggerFile = document.getElementById('btn-trigger-file-import');
    const fileInput = document.getElementById('import-file-input');
    const fileStatus = document.getElementById('import-file-status');

    if (btnTriggerFile && fileInput) {
      btnTriggerFile.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        let totalImported = 0;
        let totalNewUsers = 0;
        let errors = [];

        for (const file of files) {
          try {
            const text = await file.text();
            let res = null;
            if (file.name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
              res = this.analytics.importFromJSON(text);
            } else {
              res = this.analytics.importFromCSV(text);
            }
            if (res) {
              totalImported += (res.importedCount || 0);
              totalNewUsers += (res.newUsers || 0);
            }
          } catch (err) {
            errors.push(`${file.name}: ${err.message}`);
          }
        }

        if (fileStatus) {
          fileStatus.style.display = 'block';
          if (errors.length > 0) {
            fileStatus.style.background = 'rgba(239, 68, 68, 0.15)';
            fileStatus.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            fileStatus.style.color = '#f87171';
            fileStatus.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Imported ${totalImported} records from ${files.length - errors.length} files. Errors: ${errors.join(', ')}`;
          } else {
            fileStatus.style.background = 'rgba(16, 185, 129, 0.15)';
            fileStatus.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            fileStatus.style.color = '#34d399';
            fileStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Successfully imported <strong>${totalImported}</strong> response records across <strong>${totalNewUsers}</strong> new participant(s)!`;
          }
        }

        fileInput.value = '';
        this.renderAnalyticsDashboard();
      });
    }

    // 2. Paste Submission Code Import
    const btnSubmitToken = document.getElementById('btn-submit-token-import');
    const tokenInput = document.getElementById('import-token-input');
    const tokenStatus = document.getElementById('import-token-status');

    if (btnSubmitToken && tokenInput) {
      btnSubmitToken.addEventListener('click', () => {
        const val = tokenInput.value.trim();
        if (!val) return;

        if (tokenStatus) tokenStatus.style.display = 'none';

        try {
          const res = this.analytics.importFromToken(val);
          if (tokenStatus) {
            tokenStatus.style.display = 'block';
            tokenStatus.style.background = 'rgba(16, 185, 129, 0.15)';
            tokenStatus.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            tokenStatus.style.color = '#34d399';
            tokenStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Successfully imported <strong>${res.importedCount}</strong> records for participant!`;
          }
          tokenInput.value = '';
          this.renderAnalyticsDashboard();
        } catch (err) {
          if (tokenStatus) {
            tokenStatus.style.display = 'block';
            tokenStatus.style.background = 'rgba(239, 68, 68, 0.15)';
            tokenStatus.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            tokenStatus.style.color = '#f87171';
            tokenStatus.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${err.message}`;
          }
        }
      });
    }


  }

  async resetParticipantTest() {
    if (confirm('Reset test session and return to Questionnaire & Question 1? Previous responses will be preserved.')) {
      if (this.analytics) {
        // Generate a new random Participant ID and pick a new completely random experimental group
        const newPid = 'user_' + Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 5);
        this.analytics.setParticipantId(newPid);
        this.analytics.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        try {
          sessionStorage.setItem(this.analytics.sessionIdKey, this.analytics.sessionId);
        } catch (e) {}

        const pidInput = document.getElementById('participant-id-input');
        if (pidInput) pidInput.value = this.analytics.participantId;
      }
      if (this.humanResolver) {
        this.humanResolver.resetToFirstQuestion();
        this.humanResolver.intakeCompleted = false;
      }
      await this.loadIncrementalQuestion('intake');
    }
  }

  renderAnalyticsDashboard(payload) {
    const summary = this.analytics.getAnalyticsSummary();
    const responses = this.analytics.getAllResponses();

    // Badges & stat cards
    const totalBadge = document.getElementById('analytics-total-badge');
    if (totalBadge) totalBadge.textContent = `${summary.totalResponses} Responses Stored`;

    const countBadge = document.getElementById('resp-count-badge');
    if (countBadge) countBadge.textContent = summary.uniqueParticipants;

    const statTotal = document.getElementById('astat-total');
    if (statTotal) statTotal.textContent = summary.totalResponses;

    const statUsers = document.getElementById('astat-users');
    if (statUsers) statUsers.textContent = summary.uniqueParticipants;

    const statAcc = document.getElementById('astat-accuracy');
    if (statAcc) statAcc.textContent = `${summary.overallAccuracy}%`;

    const statAvgTime = document.getElementById('astat-avgtime');
    if (statAvgTime) statAvgTime.textContent = `${summary.avgResponseTimeMs} ms`;

    // 4 Experimental Groups Breakdown
    const groupContainer = document.getElementById('analytics-group-breakdown');
    if (groupContainer && summary.groupStats) {
      const gKeys = Object.keys(summary.groupStats);
      groupContainer.innerHTML = gKeys.map(k => {
        const s = summary.groupStats[k];
        return `
          <div class="d-flex justify-between align-center mb-1 pb-1" style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span><strong>${this.escapeHTML(k)}</strong> (${s.total} answers)</span>
            <span>Accuracy: <strong class="${s.accuracy >= 70 ? 'text-success' : 'text-warning'}">${s.accuracy}%</strong> | Avg Time: <strong>${s.avgTimeMs}ms</strong></span>
          </div>
        `;
      }).join('');
    }

    // Dialect Breakdown
    const dialectContainer = document.getElementById('analytics-dialect-breakdown');
    if (dialectContainer) {
      const keys = Object.keys(summary.dialectStats);
      if (keys.length === 0) {
        dialectContainer.innerHTML = '<p class="text-muted">No data logged yet.</p>';
      } else {
        dialectContainer.innerHTML = keys.map(k => {
          const s = summary.dialectStats[k];
          return `
            <div class="d-flex justify-between align-center mb-1 pb-1" style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span><strong>${this.escapeHTML(k)}</strong> (${s.total} answers)</span>
              <span>Accuracy: <strong class="${s.accuracy >= 70 ? 'text-success' : 'text-warning'}">${s.accuracy}%</strong> | Avg Time: <strong>${s.avgTimeMs}ms</strong></span>
            </div>
          `;
        }).join('');
      }
    }

    // Raw Event Logs Grouped by User ID Folders
    const foldersContainer = document.getElementById('analytics-user-folders-container');
    if (foldersContainer) {
      // Capture currently open folders to preserve state across re-renders
      const openFolders = new Set();
      foldersContainer.querySelectorAll('.user-folder-body').forEach(body => {
        if (body.style.display === 'block') {
          openFolders.add(body.id.replace('folder-body-', ''));
        }
      });

      const userGroups = this.analytics.getResponsesGroupedByParticipant();

      const parseTime = (item) => {
        if (!item) return 0;
        if (typeof item === 'number') return item;
        if (typeof item === 'string') {
          const d = new Date(item).getTime();
          return isNaN(d) ? 0 : d;
        }
        if (typeof item === 'object') {
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
        }
        return 0;
      };

      const getGroupLatestTime = (group) => {
        let maxTime = 0;
        if (group.lastActive) {
          const t = parseTime(group.lastActive);
          if (t > maxTime) maxTime = t;
        }
        if (group.demographics && group.demographics.timestamp) {
          const t = parseTime(group.demographics.timestamp);
          if (t > maxTime) maxTime = t;
        }
        if (group.finalThoughts && group.finalThoughts.timestamp) {
          const t = parseTime(group.finalThoughts.timestamp);
          if (t > maxTime) maxTime = t;
        }
        if (group.responses && group.responses.length > 0) {
          for (const r of group.responses) {
            const t = parseTime(r);
            if (t > maxTime) maxTime = t;
          }
        }
        return maxTime;
      };

      // Sort user folders so that the participant with the newest entries is at the top
      const uids = Object.keys(userGroups).sort((a, b) => {
        const timeDiff = getGroupLatestTime(userGroups[b]) - getGroupLatestTime(userGroups[a]);
        if (timeDiff !== 0) return timeDiff;
        return a.localeCompare(b);
      });

      if (uids.length === 0) {
        foldersContainer.innerHTML = `
          <div class="card p-4 text-center text-muted fs-xs" style="background: rgba(0,0,0,0.2); border: 1px dashed rgba(255,255,255,0.1);">
            <i class="fa-solid fa-folder-open text-muted mb-2" style="font-size: 24px;"></i><br>
            No participant event logs recorded yet. Participant responses will be organized into User ID folders automatically.
          </div>
        `;
      } else {
        foldersContainer.innerHTML = uids.map(uid => {
          const group = userGroups[uid];
          const safeUidId = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
          const isLatestUser = payload && payload.type === 'NEW_RESPONSE' && (payload.record || payload.response) && (payload.record || payload.response).participantId === uid;
          
          const isOpen = openFolders.has(safeUidId);
          const displayStyle = isOpen ? 'block' : 'none';
          const folderIcon = isOpen ? 'fa-folder-open' : 'fa-folder-closed';
          const chevronIcon = isOpen ? 'fa-chevron-up' : 'fa-chevron-down';

          return `
            <div class="user-folder-card mb-2" style="border: 1px solid ${isLatestUser ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}; border-radius: 8px; background: rgba(14, 18, 28, 0.85); overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
              <!-- Folder Header Bar -->
              <div class="user-folder-header p-2 px-3 d-flex justify-between align-center" style="background: rgba(0,0,0,0.4); cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;" onclick="window.app.toggleUserFolder('${safeUidId}')">
                <div class="d-flex align-center gap-2" style="display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid ${folderIcon} text-warning" id="folder-icon-${safeUidId}" style="font-size: 16px;"></i>
                  <strong style="color: var(--color-primary); font-size: 13px;">User ID: ${this.escapeHTML(uid)}</strong>
                  <span class="badge" style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #a5b4fc; font-size: 10px;"><i class="fa-solid fa-layer-group"></i> ${this.escapeHTML(group.assignedGroupName || 'Unassigned')}</span>
                  <span class="badge badge-accent" style="font-size: 10.5px;">${group.totalAnswers} / 60 Questions</span>
                  <span class="badge ${group.accuracy >= 70 ? 'badge-success' : 'badge-warning'}" style="font-size: 10.5px;">${group.accuracy}% Accuracy</span>
                  <span class="badge badge-outline text-muted" style="font-size: 10px;">Avg: ${group.avgTimeMs}ms</span>
                  ${group.focusLostCount > 0 ? `<span class="badge badge-danger" style="font-size: 9.5px;" title="Focus lost ${group.focusLostCount} times"><i class="fa-solid fa-triangle-exclamation"></i> Focus Lost (${group.focusLostCount}x)</span>` : ''}
                </div>
                <div class="d-flex align-center gap-2" style="display: flex; align-items: center; gap: 8px;" onclick="event.stopPropagation();">
                  <button class="btn btn-sm btn-accent" style="padding: 2px 8px; font-size: 10.5px;" onclick="window.app.exportUserCSV('${this.escapeHTML(uid)}')" title="Export CSV for ${this.escapeHTML(uid)}">
                    <i class="fa-solid fa-file-csv"></i> Export CSV
                  </button>
                  <button class="btn btn-sm btn-danger" style="padding: 2px 8px; font-size: 10.5px; background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.4); color: #f87171;" onclick="window.app.deleteUserResponses('${this.escapeHTML(uid)}')" title="Delete data for ${this.escapeHTML(uid)}">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                  <i class="fa-solid ${chevronIcon} text-muted" id="folder-chevron-${safeUidId}" style="font-size: 12px; transition: transform 0.2s;"></i>
                </div>
              </div>

              <!-- Folder Body (Table of Event Logs for this User) -->
              <div class="user-folder-body p-2" id="folder-body-${safeUidId}" style="display: ${displayStyle}; background: rgba(10, 14, 26, 0.95);">
                ${group.demographics || group.finalThoughts ? `
                  <div class="user-demo-bar p-2 mb-2" style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 6px; font-size: 11px;">
                    ${group.demographics ? `
                      <div class="d-flex flex-wrap gap-3 align-center mb-1" style="display:flex; flex-wrap:wrap; gap:12px;">
                        <span><i class="fa-solid fa-cake-candles text-accent"></i> <strong>Age:</strong> ${this.escapeHTML(group.demographics.age || 'N/A')}</span>
                        <span><i class="fa-solid fa-venus-mars text-accent"></i> <strong>Gender:</strong> ${this.escapeHTML(group.demographics.gender || 'N/A')}</span>
                        <span><i class="fa-solid fa-graduation-cap text-accent"></i> <strong>Education:</strong> ${this.escapeHTML(group.demographics.education || group.demographics.highestEducation || group.demographics.academicStanding || 'N/A')}</span>
                        <span><i class="fa-solid fa-code text-success"></i> <strong>Prog Exp:</strong> ${this.escapeHTML(group.demographics.codingExp || 'N/A')}</span>
                        <span><i class="fa-solid fa-database text-warning"></i> <strong>DB Exp:</strong> ${this.escapeHTML(group.demographics.dbExp || 'N/A')}</span>
                      </div>
                      <div class="d-flex flex-wrap gap-3 align-center" style="display:flex; flex-wrap:wrap; gap:12px;">
                        <span><i class="fa-solid fa-language text-info"></i> <strong>Language:</strong> ${this.escapeHTML(group.demographics.primaryLanguage || 'N/A')}</span>
                        <span><i class="fa-solid fa-earth-americas text-accent"></i> <strong>Country:</strong> ${this.escapeHTML(group.demographics.countryOfOrigin || 'N/A')}</span>
                        <span><i class="fa-solid fa-universal-access text-secondary"></i> <strong>Disability:</strong> ${this.escapeHTML(group.demographics.disability || 'N/A')}</span>
                      </div>
                    ` : ''}
                    ${group.finalThoughts && group.finalThoughts.thoughts ? `
                      <div class="mt-2 pt-2 border-top" style="border-top: 1px solid rgba(255,255,255,0.08); margin-top: 6px; padding-top: 6px;">
                        <strong style="color: var(--color-accent);"><i class="fa-solid fa-comment-dots"></i> Final Thoughts:</strong>
                        <em class="text-main" style="display: block; margin-top: 2px;">"${this.escapeHTML(group.finalThoughts.thoughts)}"</em>
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
                <div class="table-responsive" style="max-height: 320px; overflow: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;">
                  <table class="batch-results-table" style="white-space: nowrap; font-size: 11px;">
                    <thead>
                      <tr style="position: sticky; top: 0; background: #111520; z-index: 2;">
                        <th>#</th>
                        <th>Date & Time (PST)</th>
                        <th>Session ID</th>
                        <th>Group</th>
                        <th>Dialect</th>
                        <th>Category</th>
                        <th>Key</th>
                        <th>User Answer</th>
                        <th>Correct Answer</th>
                        <th>Result</th>
                        <th>Tab Focus / Integrity</th>
                        <th>Time (ms)</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(group.responses || []).slice().sort((a, b) => {
                        const timeDiff = parseTime(b) - parseTime(a);
                        if (timeDiff !== 0) return timeDiff;
                        return (b.questionNumber || 0) - (a.questionNumber || 0);
                      }).map((r, idx) => {
                        const timeFormatted = r.timestampPST || (r.timestamp ? (() => {
                          const d = new Date(r.timestamp);
                          return `${d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })} ${d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PST`;
                        })() : '-');
                        return `
                          <tr>
                            <td><strong>Q${r.questionNumber || (group.responses.length - idx)}</strong></td>
                            <td class="fs-xs text-muted" style="white-space: nowrap;">${timeFormatted}</td>
                            <td class="fs-xs text-dim">${r.sessionId ? r.sessionId.slice(-8) : '-'}</td>
                            <td><span class="badge" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: #a5b4fc; font-size: 10px;">${this.escapeHTML(r.assignedGroupName || r.assignedGroup || group.assignedGroupName || '-')}</span></td>
                            <td><span class="badge badge-outline">${r.activeDialectName || r.activeDialect}</span></td>
                            <td><span class="badge badge-primary">${r.questionCategory}</span></td>
                            <td><kbd>${r.selectedKey}</kbd></td>
                            <td><code>${this.escapeHTML(r.selectedOptionText)}</code></td>
                            <td><code>${this.escapeHTML(r.correctOptionText)}</code></td>
                            <td>
                              ${r.isCorrect 
                                ? '<span class="status-badge status-success">Correct</span>' 
                                : '<span class="status-badge status-error">Incorrect</span>'}
                            </td>
                            <td>
                              ${r.tabFocusLost 
                                ? `<span class="badge badge-danger" style="font-size:10px;" title="Participant left tab ${r.tabSwitchCount} time(s). Total away time: ${(r.focusLostDurationMs / 1000).toFixed(1)}s"><i class="fa-solid fa-triangle-exclamation text-danger"></i> Focus Lost (${r.tabSwitchCount}x, ${(r.focusLostDurationMs / 1000).toFixed(1)}s)</span>` 
                                : '<span class="badge badge-success" style="font-size:10px;"><i class="fa-solid fa-circle-check text-success"></i> Active Focus</span>'}
                            </td>
                            <td>${r.responseTimeMs} ms</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  toggleUserFolder(safeUidId) {
    const body = document.getElementById(`folder-body-${safeUidId}`);
    const icon = document.getElementById(`folder-icon-${safeUidId}`);
    const chevron = document.getElementById(`folder-chevron-${safeUidId}`);

    if (body) {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (icon) {
        icon.className = isHidden ? 'fa-solid fa-folder-open text-warning' : 'fa-solid fa-folder-closed text-warning';
      }
      if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }
  }

  expandAllUserFolders() {
    const bodies = document.querySelectorAll('.user-folder-body');
    bodies.forEach(b => { b.style.display = 'block'; });
    const icons = document.querySelectorAll('.user-folder-header .fa-folder-closed');
    icons.forEach(i => { i.className = 'fa-solid fa-folder-open text-warning'; });
    const chevrons = document.querySelectorAll('.user-folder-header .fa-chevron-down');
    chevrons.forEach(c => { c.style.transform = 'rotate(180deg)'; });
  }

  collapseAllUserFolders() {
    const bodies = document.querySelectorAll('.user-folder-body');
    bodies.forEach(b => { b.style.display = 'none'; });
    const icons = document.querySelectorAll('.user-folder-header .fa-folder-open');
    icons.forEach(i => { i.className = 'fa-solid fa-folder-closed text-warning'; });
    const chevrons = document.querySelectorAll('.user-folder-header .fa-chevron-down');
    chevrons.forEach(c => { c.style.transform = 'rotate(0deg)'; });
  }

  exportUserCSV(userId) {
    if (this.analytics) {
      this.analytics.exportUserCSV(userId);
    }
  }

  deleteUserResponses(userId) {
    if (this.analytics) {
      this.analytics.deleteUserResponses(userId);
      this.renderAnalyticsDashboard();
    }
  }

  escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.QueryExperimentApp = QueryExperimentApp;
window.SQLMatrixApp = QueryExperimentApp;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.app) window.app = new QueryExperimentApp();
  });
} else {
  if (!window.app) window.app = new QueryExperimentApp();
}
