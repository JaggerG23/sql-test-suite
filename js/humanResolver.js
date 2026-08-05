/**
 * Human & Participant Test Suite Resolver Module
 * Manages participant test sessions, top full-width schema bar, vertically extended coding window (all code visible),
 * 2x2 candidate answer table cards on right, and keyboard navigation (Keys 1, 2, 3, 4).
 */
class HumanResolver {
  constructor(app) {
    this.app = app;
    this.currentQuestion = null;
    this.currentSchema = null;
    this.currentRawQuery = '';
    this.currentGroundTruth = null;

    this.stats = {
      totalAnswered: 0
    };

    this.isAnswered = false;
    this.selectedOptionIndex = null;

    this.focusMetrics = {
      tabFocusLost: false,
      tabSwitchCount: 0,
      totalFocusLostTimeMs: 0,
      lastBlurTime: null
    };

    // Attach global keyboard shortcuts & focus tracking listeners
    this.bindKeyboardShortcuts();
    this.bindFocusListeners();
  }

  bindFocusListeners() {
    const handleBlur = () => {
      if (this.isAnswered || !this.currentQuestion) return;
      if (!this.focusMetrics.lastBlurTime) {
        this.focusMetrics.lastBlurTime = Date.now();
        this.focusMetrics.tabFocusLost = true;
        this.focusMetrics.tabSwitchCount++;
      }
    };

    const handleFocus = () => {
      if (this.focusMetrics.lastBlurTime) {
        const awayMs = Date.now() - this.focusMetrics.lastBlurTime;
        this.focusMetrics.totalFocusLostTimeMs += awayMs;
        this.focusMetrics.lastBlurTime = null;
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleBlur();
      else if (document.visibilityState === 'visible') handleFocus();
    });
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Check if participant tab or challenge container is visible
      const quizTab = document.getElementById('tab-human');
      if (quizTab && !quizTab.classList.contains('active')) return;

      // Avoid capturing input if user is typing in text input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      // Handle Keys 1, 2, 3, 4
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const optionIndex = parseInt(e.key, 10) - 1;
        this.selectOption(optionIndex);
      } else if (e.code === 'Numpad1') { this.selectOption(0); }
      else if (e.code === 'Numpad2') { this.selectOption(1); }
      else if (e.code === 'Numpad3') { this.selectOption(2); }
      else if (e.code === 'Numpad4') { this.selectOption(3); }
      // Handle Space to advance to next question if answered
      else if (e.code === 'Space' || e.key === ' ') {
        if (this.isAnswered) {
          e.preventDefault();
          this.nextQuestion();
        }
      }
    });
  }

  startNewChallenge(schema, query, groundTruthResult) {
    if (!this.app.syntaxDialects || !this.app.quizGenerator) return;

    this.currentSchema = schema;
    this.currentRawQuery = query;
    if (groundTruthResult) {
      this.currentGroundTruth = groundTruthResult;
    }

    this.currentQuestion = this.app.quizGenerator.generateQuestion(
      query, 
      schema, 
      this.app.syntaxDialects,
      this.currentGroundTruth
    );

    if (!this.currentQuestion) {
      console.warn('QuizGenerator returned null for query:', query);
      return;
    }

    this.currentQuestion.startTime = Date.now();
    this.isAnswered = false;
    this.selectedOptionIndex = null;
    this.focusMetrics = {
      tabFocusLost: false,
      tabSwitchCount: 0,
      totalFocusLostTimeMs: 0,
      lastBlurTime: null
    };

    this.renderQuizUI();
  }

  switchDialect(dialectIdx) {
    if (!this.currentQuestion || !this.app.syntaxDialects || !this.app.quizGenerator) return;

    this.app.syntaxDialects.setCurrentDialectIndex(dialectIdx);
    const currentDialect = this.app.syntaxDialects.getCurrentDialect();
    const dialectSql = this.app.syntaxDialects.formatQueryToDialect(this.currentRawQuery, currentDialect.id);

    // Update embedded SQL string in JS code without changing candidate options
    this.currentQuestion.dialect = currentDialect;
    this.currentQuestion.dialectSql = dialectSql;
    this.currentQuestion.jsCode = this.app.quizGenerator.generateJsCodeFromSql(this.currentRawQuery, this.currentSchema, dialectSql);

    this.renderQuizUI();
  }

  renderQuizUI() {
    const container = document.getElementById('human-challenge-container');
    if (!container || !this.currentQuestion) return;

    const q = this.currentQuestion;
    const activeDialects = this.app.syntaxDialects.getActiveDialects();
    const currentDialectIdx = this.app.syntaxDialects.currentSelectedDialectIndex;
    const isParticipantPage = window.location.pathname.includes('participant.html');

    container.innerHTML = `
      <div class="card quiz-card glow-card compact-view" style="padding: 0;">
        <!-- Compact Header Bar: Questions Answered Counter (out of 60) -->
        <div class="card-header quiz-header p-2 px-3" style="min-height: 38px;">
          <div class="quiz-title-box">
            <h3 style="font-size: 13.5px; margin: 0;"><i class="fa-solid fa-code text-primary"></i> Embedded SQL & JavaScript Test Suite</h3>
          </div>

          <!-- Live Session Questions Answered Counter (Out of 60) -->
          <div class="quiz-stats-bar">
            <div class="stat-pill" style="padding: 2px 10px; font-size: 11.5px;">
              <i class="fa-solid fa-list-check text-primary"></i> Questions Answered: <strong style="color: var(--color-primary); font-size: 12.5px; margin-left: 4px;">${this.stats.totalAnswered} / 60</strong>
            </div>
          </div>
        </div>

        <div class="card-body p-2" style="display: flex; flex-direction: column; gap: 8px;">
          
          <!-- 1. TOP FULL-WIDTH ROW: Input Schema Reference (3 Tables Across Top Width) -->
          <div class="quiz-schema-top-bar p-2" style="border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; background: rgba(14, 18, 28, 0.65); width: 100%;">
            <div class="d-flex justify-between align-center mb-1 pb-1" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
              <strong style="color: var(--color-accent); font-size: 10.5px;"><i class="fa-solid fa-table-cells text-accent"></i> Input Schema Reference (${this.app.currentSchema ? this.app.currentSchema.tables.length : 0} Tables)</strong>
            </div>
            ${this.renderCompactSchemaHTML(this.app.currentSchema)}
          </div>

          <!-- 2. MAIN 2-COLUMN SPLIT ROW (Left: Fully Extended Coding Window, Right: Prompt + Answers) -->
          <div class="quiz-main-split" style="display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 12px;">
            
            <!-- LEFT COLUMN: Fully Extended Coding Window (All Code Lines Visible at Once) -->
            <div class="quiz-left-column" style="display: flex; flex-direction: column; gap: 4px;">
              <div class="dialect-config-bar p-1 px-2 d-flex justify-between align-center" style="background: rgba(0, 0, 0, 0.3); border-radius: 5px; font-size: 10.5px;">
                <div class="dialect-tabs d-flex align-center gap-1">
                  <span class="text-muted" style="font-size: 10px; margin-right: 2px;"><i class="fa-solid fa-sliders"></i> Dialect:</span>
                  ${activeDialects.map((d, idx) => `
                    <button class="btn btn-sm dialect-tab ${idx === currentDialectIdx ? 'active' : ''}" data-idx="${idx}" style="padding: 1px 7px; font-size: 10px; border-radius: 4px;">
                      ${d.name}
                    </button>
                  `).join('')}
                </div>
                ${!isParticipantPage ? `
                  <button id="btn-configure-syntaxes" class="btn btn-sm btn-ghost p-0 px-1" title="Configure Dialects" style="font-size: 10.5px;">
                    <i class="fa-solid fa-gear"></i> Settings
                  </button>
                ` : ''}
              </div>

              <!-- Coding Window: Displays all code lines at once with no scrolling required -->
              <div class="query-code-preview p-2" style="border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; background: rgba(10, 14, 26, 0.95); flex: 1; min-height: 350px; overflow: visible;">
                <div class="d-flex justify-between align-center mb-1" style="font-size: 10px; color: var(--color-success); border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 3px;">
                  <span><i class="fa-brands fa-js text-warning"></i> <strong>JavaScript Code (with Embedded SQL):</strong></span>
                  <span class="badge badge-accent" style="font-size: 9px; padding: 1px 4px;">${q.dialect ? q.dialect.name : 'SQL'}</span>
                </div>
                <pre style="margin: 0; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.45; color: #e2e8f0; white-space: pre-wrap; overflow: visible;"><code>${this.escapeHTML(q.jsCode)}</code></pre>
              </div>
            </div>

            <!-- RIGHT COLUMN: Prompt + Answers (2x2 Grid) + Action Footer -->
            <div class="quiz-right-column" style="display: flex; flex-direction: column; gap: 8px;">
              
              <!-- Prompt Banner -->
              <div class="prompt-bar p-1 px-2 d-flex justify-between align-center" style="background: rgba(0,0,0,0.25); border-radius: 5px; border-left: 3px solid var(--color-accent);">
                <span class="font-weight-bold fs-xs" style="color: var(--text-main); font-size: 11.5px;">
                  <i class="fa-solid fa-circle-question text-accent"></i> ${q.prompt}
                </span>
                <span class="text-muted fs-xs" style="font-size: 10.5px;">Press <strong>1, 2, 3, or 4</strong></span>
              </div>

              <!-- 4 Candidate Output Tables (2x2 Grid on Right Side) -->
              <div class="quiz-options-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; flex: 1;">
                ${q.options.map((opt, idx) => `
                  <div class="quiz-option-card table-option-card" id="opt-btn-${idx}" data-idx="${idx}" style="cursor: pointer; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(18, 24, 38, 0.7); overflow: hidden; display: flex; flex-direction: column;">
                    <div class="opt-header p-1 px-2 d-flex justify-between align-center" style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); font-size: 10.5px;">
                      <div class="d-flex align-center gap-1">
                        <kbd style="background: var(--color-primary); color: #fff; padding: 1px 5px; font-size: 9.5px; font-weight: 700; border-radius: 3px;">${idx + 1}</kbd>
                        <strong style="color: var(--text-main); font-size: 10.5px;">Opt ${String.fromCharCode(65 + idx)}</strong>
                        <span class="text-muted" style="font-size: 9px;">(${opt.rows.length}r)</span>
                      </div>
                      <div class="opt-status-icon" id="opt-icon-${idx}"></div>
                    </div>
                    <div class="opt-body p-1" style="max-height: 145px; overflow-x: auto; overflow-y: auto; flex: 1;">
                      ${this.renderOptionTableHTML(opt.columns, opt.rows)}
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Bottom Feedback & Action Button -->
              <div id="quiz-feedback-box" class="quiz-feedback-box p-1 px-2" style="display: none; font-size: 11px; border-radius: 5px;"></div>

              <div class="quiz-footer d-flex justify-between align-center mt-auto" style="padding-top: 2px;">
                <span class="text-muted fs-xs" style="font-size: 10px;"><i class="fa-solid fa-circle-info"></i> Hotkeys: <strong>1, 2, 3, 4</strong> | <kbd style="font-size: 9px; padding: 1px 4px;">Space</kbd> Next</span>
                <button id="btn-next-question" class="btn btn-primary btn-sm" ${!this.isAnswered ? 'disabled' : ''} style="padding: 3px 10px; font-size: 11.5px;">
                  Next Challenge <i class="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Syntax Config Modal / Drawer (Admin Mode Only) -->
      ${!isParticipantPage ? `
        <div id="syntax-config-panel" class="card mt-2" style="display: none; border-top: 3px solid var(--color-accent);">
          <div class="card-header p-2">
            <h4 style="font-size: 13px; margin: 0;"><i class="fa-solid fa-sliders"></i> Configure 3 Active Test Syntaxes</h4>
          </div>
          <div class="card-body p-2">
            <div class="syntax-select-grid">
              <div class="form-group mb-1">
                <label style="font-size: 11px;"><strong>Syntax Dialect 1:</strong></label>
                <select id="sel-syntax-1" class="form-select p-1" style="font-size: 11px;"></select>
              </div>
              <div class="form-group mb-1">
                <label style="font-size: 11px;"><strong>Syntax Dialect 2:</strong></label>
                <select id="sel-syntax-2" class="form-select p-1" style="font-size: 11px;"></select>
              </div>
              <div class="form-group mb-1">
                <label style="font-size: 11px;"><strong>Syntax Dialect 3:</strong></label>
                <select id="sel-syntax-3" class="form-select p-1" style="font-size: 11px;"></select>
              </div>
            </div>
            <button id="btn-save-syntaxes" class="btn btn-accent btn-sm mt-1 p-1 px-3" style="font-size: 11px;"><i class="fa-solid fa-check"></i> Apply Dialects</button>
          </div>
        </div>
      ` : ''}
    `;

    this.bindQuizEvents();
  }

  bindQuizEvents() {
    // Click option buttons/cards
    this.currentQuestion.options.forEach((_, idx) => {
      const btn = document.getElementById(`opt-btn-${idx}`);
      if (btn) {
        btn.addEventListener('click', () => this.selectOption(idx));
      }
    });

    // Dialect selector buttons - update SQL snippet without altering answer options!
    document.querySelectorAll('.dialect-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        this.switchDialect(idx);
      });
    });

    // Next question button
    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) {
      btnNext.addEventListener('click', () => this.nextQuestion());
    }

    // Configure syntaxes panel toggle (if present)
    const btnCfg = document.getElementById('btn-configure-syntaxes');
    const cfgPanel = document.getElementById('syntax-config-panel');
    if (btnCfg && cfgPanel) {
      btnCfg.addEventListener('click', () => {
        cfgPanel.style.display = cfgPanel.style.display === 'none' ? 'block' : 'none';
        if (cfgPanel.style.display === 'block') {
          this.populateSyntaxDropdowns();
        }
      });
    }
  }

  populateSyntaxDropdowns() {
    const all = this.app.syntaxDialects.availableDialects;
    const activeKeys = this.app.syntaxDialects.activeDialectKeys;

    [1, 2, 3].forEach((num, i) => {
      const select = document.getElementById(`sel-syntax-${num}`);
      if (select) {
        select.innerHTML = Object.values(all).map(d => `
          <option value="${d.id}" ${d.id === activeKeys[i] ? 'selected' : ''}>${d.name} (${d.description})</option>
        `).join('');
      }
    });

    const btnSave = document.getElementById('btn-save-syntaxes');
    if (btnSave) {
      btnSave.onclick = () => {
        const s1 = document.getElementById('sel-syntax-1').value;
        const s2 = document.getElementById('sel-syntax-2').value;
        const s3 = document.getElementById('sel-syntax-3').value;
        this.app.syntaxDialects.setActiveDialects(s1, s2, s3);
        const cfgPanel = document.getElementById('syntax-config-panel');
        if (cfgPanel) cfgPanel.style.display = 'none';
        this.switchDialect(0);
      };
    }
  }

  selectOption(index) {
    if (this.isAnswered || !this.currentQuestion) return;

    this.isAnswered = true;
    this.selectedOptionIndex = index;

    const q = this.currentQuestion;
    const isCorrect = (index === q.correctIndex);
    const chosenOpt = q.options[index];
    const correctOpt = q.options[q.correctIndex];

    // Stats update: Only track questions answered counter
    this.stats.totalAnswered++;

    // Finalize focus loss duration
    if (this.focusMetrics.lastBlurTime) {
      const awayMs = Date.now() - this.focusMetrics.lastBlurTime;
      this.focusMetrics.totalFocusLostTimeMs += awayMs;
      this.focusMetrics.lastBlurTime = null;
    }

    // Log telemetry to analytics storage
    if (this.app.analytics) {
      const responseTimeMs = q.startTime ? (Date.now() - q.startTime) : 0;
      this.app.analytics.logResponse({
        questionCategory: q.type,
        activeDialect: q.dialect ? q.dialect.id : 'javascript',
        activeDialectName: q.dialect ? q.dialect.name : 'JavaScript with Embedded SQL',
        incompleteQuery: q.jsCode,
        rawQuery: q.rawQuery,
        selectedKey: index + 1,
        selectedOptionText: `Option ${String.fromCharCode(65 + index)} (${chosenOpt.rows.length} rows)`,
        correctOptionText: `Option ${String.fromCharCode(65 + q.correctIndex)} (${correctOpt.rows.length} rows)`,
        isCorrect: isCorrect,
        responseTimeMs: responseTimeMs,
        seed: this.app.seed,
        tabFocusLost: this.focusMetrics.tabFocusLost,
        tabSwitchCount: this.focusMetrics.tabSwitchCount,
        focusLostDurationMs: Math.round(this.focusMetrics.totalFocusLostTimeMs)
      });

      this.app.renderAnalyticsDashboard();
    }

    // Update Option UI cards
    q.options.forEach((opt, idx) => {
      const card = document.getElementById(`opt-btn-${idx}`);
      const icon = document.getElementById(`opt-icon-${idx}`);
      if (!card) return;

      if (idx === q.correctIndex) {
        card.style.border = '2px solid var(--color-success)';
        card.style.background = 'rgba(16, 185, 129, 0.15)';
        if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i>';
      } else if (idx === index) {
        card.style.border = '2px solid var(--color-danger)';
        card.style.background = 'rgba(239, 68, 68, 0.15)';
        if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-xmark text-danger"></i>';
      } else {
        card.style.opacity = '0.5';
      }
    });

    // Enable next question button
    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) btnNext.removeAttribute('disabled');

    // Show Feedback Box
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) {
      feedbackBox.style.display = 'block';

      feedbackBox.className = `quiz-feedback-box p-1 px-2 ${isCorrect ? 'fb-correct' : 'fb-incorrect'}`;
      feedbackBox.innerHTML = `
        <div class="d-flex align-center gap-2">
          <div class="fb-icon" style="font-size: 14px;">${isCorrect ? '<i class="fa-solid fa-circle-check text-success"></i>' : '<i class="fa-solid fa-circle-xmark text-danger"></i>'}</div>
          <div>
            <h4 class="m-0" style="font-size: 11.5px;">${isCorrect ? 'Correct Table Selected! (Key [' + (index + 1) + '])' : 'Incorrect Table Selection (Key [' + (index + 1) + '])'}</h4>
            <p class="m-0 fs-xs mt-1" style="font-size: 10px;">${chosenOpt.explanation}</p>
          </div>
        </div>
      `;
    }
  }

  nextQuestion() {
    this.app.generateNextIncrementalQuestion();
  }

  renderOptionTableHTML(columns, rows) {
    if (!columns || columns.length === 0) {
      return `<div class="p-1 text-muted fs-xs">Empty Dataset</div>`;
    }

    let html = `<div style="overflow-x: auto; max-width: 100%; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);"><table class="data-table opt-table" style="width: 100%; min-width: max-content; font-size: 11px; border-collapse: collapse;"><thead><tr>`;
    columns.forEach(col => { 
      html += `<th style="padding: 5px 10px; background: rgba(0,0,0,0.5); text-transform: none; font-size: 10.5px; border-bottom: 1px solid rgba(255,255,255,0.12); color: var(--color-accent); font-weight: 600;">${this.escapeHTML(col)}</th>`; 
    });
    html += `</tr></thead><tbody>`;

    if (!rows || rows.length === 0) {
      html += `<tr><td colspan="${columns.length}" class="text-center text-muted p-2" style="font-size:10px;">(0 rows returned)</td></tr>`;
    } else {
      rows.forEach(row => {
        html += `<tr>`;
        row.forEach(val => {
          const dispVal = val === null ? '<span class="text-muted">NULL</span>' : this.escapeHTML(val);
          html += `<td style="padding: 4px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); white-space: nowrap; font-family: var(--font-mono);">${dispVal}</td>`;
        });
        html += `</tr>`;
      });
    }

    html += `</tbody></table></div>`;
    return html;
  }

  renderCompactSchemaHTML(schema) {
    if (!schema || !schema.tables || schema.tables.length === 0) return '<div class="text-muted fs-xs p-1">No schema tables loaded</div>';
    
    return `
      <div class="compact-schema-grid" style="display: grid; grid-template-columns: repeat(${Math.min(schema.tables.length, 3)}, 1fr); gap: 10px;">
        ${schema.tables.map(tbl => `
          <div class="schema-tbl-card p-1 px-2" style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px;">
            <div class="d-flex justify-between align-center" style="font-size: 10.5px;">
              <strong style="color: var(--color-accent); font-family: var(--font-mono);">
                <i class="fa-solid fa-table text-primary"></i> ${tbl.name}
              </strong>
              <span class="text-muted" style="font-size: 9px;">(${tbl.rows.length}r, ${tbl.columns.length}c)</span>
            </div>
            <div class="col-badges mt-1" style="display: flex; flex-wrap: wrap; gap: 2px; font-family: var(--font-mono);">
              ${tbl.columns.map(c => `
                <span style="background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.07); font-size: 9px;">
                  ${c.pk ? '🔑 ' : c.fk ? '🔗 ' : ''}<strong>${c.name}</strong> <span style="color:var(--color-primary);">${c.type}</span>
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.HumanResolver = HumanResolver;
