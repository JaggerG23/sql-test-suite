/**
 * Main Application Orchestrator
 */
window.ENABLE_DEV_RESET = true;

class SQLMatrixApp {
  constructor() {
    // Fixed deterministic seed (randomization disabled for un-randomized questions)
    this.seed = 42;
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

    this.init();
  }

  randomizeSeed() {
    // Keep seed fixed to 42 while randomization is disabled
    this.seed = 42;
    const seedInput = document.getElementById('seed-input');
    if (seedInput) seedInput.value = this.seed;
  }

  async init() {
    this.seed = 42;
    const seedInput = document.getElementById('seed-input');
    if (seedInput) {
      seedInput.value = 42;
      seedInput.setAttribute('disabled', 'disabled');
      seedInput.setAttribute('title', 'Seed randomization disabled');
    }
    this.bindEvents();
    this.initParticipantUI();
    try {
      await Promise.race([
        this.sqliteEngine.init(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (e) {
      console.warn('SQLite WASM init deferred:', e);
    }
    await this.generateAll();
    this.renderAnalyticsDashboard();
  }

  bindEvents() {
    // Top Bar Seed
    const seedInput = document.getElementById('seed-input');
    if (seedInput) {
      seedInput.addEventListener('change', (e) => {
        this.seed = parseInt(e.target.value, 10) || 42;
        this.generateAll();
      });
    }

    const btnRandSeed = document.getElementById('btn-randomize-seed');
    if (btnRandSeed) {
      btnRandSeed.setAttribute('disabled', 'disabled');
      btnRandSeed.setAttribute('title', 'Seed randomization disabled');
    }

    const btnGenAll = document.getElementById('btn-generate-all');
    if (btnGenAll) {
      btnGenAll.addEventListener('click', () => {
        this.generateAll();
      });
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

    const btnRegenQuery = document.getElementById('btn-regen-query');
    if (btnRegenQuery) {
      btnRegenQuery.addEventListener('click', () => {
        this.generateQueryOnly();
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

    // Nav Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById(targetTab).classList.add('active');

        if (targetTab === 'tab-analytics') {
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

  async generateAll() {
    await this.generateSchemaOnly();
    this.generateQueryOnly();
  }

  async generateSchemaOnly() {
    const numTablesElem = document.getElementById('cfg-tables');
    const numTables = numTablesElem ? parseInt(numTablesElem.value, 10) : 3;

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

  async generateNextIncrementalQuestion() {
    const qIndex = this.humanResolver.stats.totalAnswered;
    const blockIndex = Math.floor(qIndex / 6);
    const blockSeed = this.seed + blockIndex * 137;
    const variationIndex = qIndex % 6;

    if (!this.currentSchema || this.lastBlockIndex !== blockIndex) {
      this.lastBlockIndex = blockIndex;
      this.schemaGenerator = new SchemaGenerator(blockSeed);
      this.currentSchema = this.schemaGenerator.generateSchema(3, 4, 30, true);

      await this.sqliteEngine.loadSchemaAndData(this.currentSchema);
      this.customJsEngine.loadSchemaAndData(this.currentSchema);
      this.optimizerEngine.loadSchemaAndData(this.currentSchema);
      this.renderSchemaPreview();
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

    this.humanResolver.startNewChallenge(this.currentSchema, this.currentQuery, r1);
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
    this.humanResolver.startNewChallenge(this.currentSchema, sqlText, r1);
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
      const schema = sGen.generateSchema(3, 4, 30, true);

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
                  ${col.pk ? '<span title="Primary Key" style="color: #f59e0b; margin-right: 4px;">🔑</span>' : col.fk ? '<span title="Foreign Key" style="color: #06b6d4; margin-right: 4px;">🔗</span>' : ''}${col.name}
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
    if (input) {
      input.value = this.analytics.participantId;
      input.addEventListener('change', (e) => {
        this.analytics.setParticipantId(e.target.value);
        this.renderAnalyticsDashboard();
      });
    }

    // Dev Reset Test button binding (controlled by window.ENABLE_DEV_RESET)
    const btnResetTest = document.getElementById('btn-reset-test');
    if (btnResetTest) {
      if (!window.ENABLE_DEV_RESET) {
        btnResetTest.style.display = 'none';
      } else {
        btnResetTest.style.display = 'inline-flex';
        btnResetTest.addEventListener('click', () => this.resetParticipantTest());
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
  }

  async resetParticipantTest() {
    if (confirm('Reset experiment progress and return to Question 1? All dev response progress will be wiped.')) {
      if (this.analytics) {
        this.analytics.clearAllResponsesWithoutConfirm();
      }
      if (this.humanResolver) {
        this.humanResolver.resetToFirstQuestion();
      }
      await this.generateAll();
    }
  }

  renderAnalyticsDashboard(payload) {
    const summary = this.analytics.getAnalyticsSummary();
    const responses = this.analytics.getAllResponses();

    // Badges & stat cards
    const totalBadge = document.getElementById('analytics-total-badge');
    if (totalBadge) totalBadge.textContent = `${summary.totalResponses} Responses Stored`;

    const countBadge = document.getElementById('resp-count-badge');
    if (countBadge) countBadge.textContent = summary.totalResponses;

    const statTotal = document.getElementById('astat-total');
    if (statTotal) statTotal.textContent = summary.totalResponses;

    const statUsers = document.getElementById('astat-users');
    if (statUsers) statUsers.textContent = summary.uniqueParticipants;

    const statAcc = document.getElementById('astat-accuracy');
    if (statAcc) statAcc.textContent = `${summary.overallAccuracy}%`;

    const statAvgTime = document.getElementById('astat-avgtime');
    if (statAvgTime) statAvgTime.textContent = `${summary.avgResponseTimeMs} ms`;

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
              <span><strong>${k}</strong> (${s.total} answers)</span>
              <span>Accuracy: <strong class="${s.accuracy >= 70 ? 'text-success' : 'text-warning'}">${s.accuracy}%</strong> | Avg Time: <strong>${s.avgTimeMs}ms</strong></span>
            </div>
          `;
        }).join('');
      }
    }

    // Category Breakdown
    const categoryContainer = document.getElementById('analytics-category-breakdown');
    if (categoryContainer) {
      const keys = Object.keys(summary.categoryStats);
      if (keys.length === 0) {
        categoryContainer.innerHTML = '<p class="text-muted">No data logged yet.</p>';
      } else {
        categoryContainer.innerHTML = keys.map(k => {
          const s = summary.categoryStats[k];
          return `
            <div class="d-flex justify-between align-center mb-1 pb-1" style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span><strong>${k}</strong> (${s.total} answers)</span>
              <span>Accuracy: <strong class="${s.accuracy >= 70 ? 'text-success' : 'text-warning'}">${s.accuracy}%</strong> | Avg Time: <strong>${s.avgTimeMs}ms</strong></span>
            </div>
          `;
        }).join('');
      }
    }

    // Raw Event Logs Table
    const tbody = document.getElementById('analytics-logs-tbody');
    if (tbody) {
      if (responses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted p-4">No participant answers logged yet. Take tests in the Participant Test Suite tab!</td></tr>`;
      } else {
        tbody.innerHTML = responses.slice().reverse().map((r, idx) => {
          const timeFormatted = new Date(r.timestamp).toLocaleTimeString();
          const isLatest = payload && payload.type === 'NEW_RESPONSE' && idx === 0;
          return `
            <tr class="${isLatest ? 'row-highlight' : ''}">
              <td>${responses.length - idx}</td>
              <td class="fs-xs text-muted">${timeFormatted}</td>
              <td><span class="badge badge-accent">${r.participantId}</span></td>
              <td class="fs-xs text-dim">${r.sessionId ? r.sessionId.slice(-8) : '-'}</td>
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
        }).join('');
      }
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

window.SQLMatrixApp = SQLMatrixApp;

document.addEventListener('DOMContentLoaded', () => {
  window.app = new SQLMatrixApp();
});
