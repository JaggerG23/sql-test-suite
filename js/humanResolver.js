/**
 * Human & Participant Test Suite Resolver Module
 * Manages participant test sessions, 3 syntax dialect displays, and keyboard navigation (Keys 1, 2, 3, 4).
 */
class HumanResolver {
  constructor(app) {
    this.app = app;
    this.currentQuestion = null;
    this.stats = {
      totalAnswered: 0,
      correctCount: 0,
      streak: 0,
      maxStreak: 0,
      totalTimeMs: 0
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

    this.currentQuestion = this.app.quizGenerator.generateQuestion(query, schema, this.app.syntaxDialects);
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

  renderQuizUI() {
    const container = document.getElementById('human-challenge-container');
    if (!container || !this.currentQuestion) return;

    const q = this.currentQuestion;
    const activeDialects = this.app.syntaxDialects.getActiveDialects();
    const currentDialectIdx = this.app.syntaxDialects.currentSelectedDialectIndex;

    const accuracyRate = this.stats.totalAnswered > 0 
      ? Math.round((this.stats.correctCount / this.stats.totalAnswered) * 100) 
      : 0;

    container.innerHTML = `
      <div class="card quiz-card glow-card">
        <!-- Card Header: Stats & Dialect Selector -->
        <div class="card-header quiz-header">
          <div class="quiz-title-box">
            <h3><i class="fa-solid fa-keyboard text-primary"></i> Participant Test Suite</h3>
            <span class="badge badge-accent"><i class="fa-solid fa-bolt"></i> Key 1, 2, 3, 4 Interactive</span>
          </div>

          <!-- Live Session Stats -->
          <div class="quiz-stats-bar">
            <div class="stat-pill"><i class="fa-solid fa-bullseye text-success"></i> Score: <strong>${this.stats.correctCount}/${this.stats.totalAnswered}</strong> (${accuracyRate}%)</div>
          </div>
        </div>

        <div class="card-body">
          <!-- 3 Customizable Syntax Dialects Bar -->
          <div class="dialect-config-bar">
            <div class="dialect-label">
              <i class="fa-solid fa-sliders"></i> Active Syntax Dialect:
            </div>
            <div class="dialect-tabs">
              ${activeDialects.map((d, idx) => `
                <button class="btn btn-sm dialect-tab ${idx === currentDialectIdx ? 'active' : ''}" data-idx="${idx}">
                  <span class="dialect-num">${idx + 1}</span> ${d.name}
                </button>
              `).join('')}
            </div>
            <button id="btn-configure-syntaxes" class="btn btn-sm btn-ghost" title="Configure 3 Syntax Dialects">
              <i class="fa-solid fa-gear"></i> Settings
            </button>
          </div>

          <!-- Incomplete Query Display Box -->
          <div class="quiz-question-box mt-3">
            <div class="q-meta">
              <span class="q-badge"><i class="fa-solid fa-layer-group"></i> ${q.type}</span>
              <span class="q-dialect-badge"><i class="fa-solid fa-code"></i> ${q.dialect.name}</span>
            </div>
            <p class="q-prompt">${q.prompt}</p>

            <div class="query-code-preview">
              <pre><code>${this.escapeHTML(q.incompleteQuery)}</code></pre>
            </div>
          </div>

          <!-- Inanimate Schema & Data Preview Card -->
          ${this.renderSchemaBoxesHTML(this.app.currentSchema)}

          <!-- 4 Options Grid (Keys 1, 2, 3, 4) -->
          <div class="quiz-options-grid mt-4">
            ${q.options.map((opt, idx) => `
              <button class="quiz-option-card" id="opt-btn-${idx}" data-idx="${idx}">
                <div class="opt-key-badge"><kbd>${idx + 1}</kbd></div>
                <div class="opt-text"><code>${this.escapeHTML(opt.text)}</code></div>
                <div class="opt-status-icon" id="opt-icon-${idx}"></div>
              </button>
            `).join('')}
          </div>

          <!-- Bottom Action & Feedback Area -->
          <div id="quiz-feedback-box" class="quiz-feedback-box mt-4" style="display: none;"></div>

          <div class="quiz-footer mt-3 d-flex justify-between align-center">
            <span class="text-muted fs-xs"><i class="fa-solid fa-circle-info"></i> Press <strong>1, 2, 3, or 4</strong> on your keyboard to select an answer.</span>
            <button id="btn-next-question" class="btn btn-primary" ${!this.isAnswered ? 'disabled' : ''}>
              Next Question <i class="fa-solid fa-arrow-right"></i> <kbd class="ml-1">Space</kbd>
            </button>
          </div>
        </div>
      </div>

      <!-- Syntax Config Modal / Drawer (Inline expander) -->
      <div id="syntax-config-panel" class="card mt-3" style="display: none; border-top: 3px solid var(--color-accent);">
        <div class="card-header">
          <h4><i class="fa-solid fa-sliders"></i> Configure 3 Active Test Syntaxes</h4>
        </div>
        <div class="card-body">
          <p class="fs-xs text-muted">Select 3 SQL syntaxes from the available dialects to test participants on:</p>
          <div class="syntax-select-grid">
            <div class="form-group">
              <label><strong>Syntax Dialect 1:</strong></label>
              <select id="sel-syntax-1" class="form-select"></select>
            </div>
            <div class="form-group">
              <label><strong>Syntax Dialect 2:</strong></label>
              <select id="sel-syntax-2" class="form-select"></select>
            </div>
            <div class="form-group">
              <label><strong>Syntax Dialect 3:</strong></label>
              <select id="sel-syntax-3" class="form-select"></select>
            </div>
          </div>
          <button id="btn-save-syntaxes" class="btn btn-accent btn-sm mt-2"><i class="fa-solid fa-check"></i> Apply Dialect Selection</button>
        </div>
      </div>
    `;

    this.bindQuizEvents();
  }

  bindQuizEvents() {
    // Click option buttons
    this.currentQuestion.options.forEach((_, idx) => {
      const btn = document.getElementById(`opt-btn-${idx}`);
      if (btn) {
        btn.addEventListener('click', () => this.selectOption(idx));
      }
    });

    // Dialect selector buttons
    document.querySelectorAll('.dialect-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        this.app.syntaxDialects.setCurrentDialectIndex(idx);
        // Regenerate query display for chosen dialect
        this.startNewChallenge(this.app.currentSchema, this.app.currentQuery, null);
      });
    });

    // Next question button
    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) {
      btnNext.addEventListener('click', () => this.nextQuestion());
    }

    // Configure syntaxes panel toggle
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
        document.getElementById('syntax-config-panel').style.display = 'none';
        this.startNewChallenge(this.app.currentSchema, this.app.currentQuery, null);
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

    // Stats update
    this.stats.totalAnswered++;
    if (isCorrect) {
      this.stats.correctCount++;
      this.stats.streak++;
      if (this.stats.streak > this.stats.maxStreak) {
        this.stats.maxStreak = this.stats.streak;
      }
    } else {
      this.stats.streak = 0;
    }

    // Finalize focus loss duration if user was away when selecting
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
        activeDialect: q.dialect.id,
        activeDialectName: q.dialect.name,
        incompleteQuery: q.incompleteQuery,
        rawQuery: q.rawQuery,
        selectedKey: index + 1,
        selectedOptionText: chosenOpt.text,
        correctOptionText: q.options[q.correctIndex].text,
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
      const btn = document.getElementById(`opt-btn-${idx}`);
      const icon = document.getElementById(`opt-icon-${idx}`);
      if (!btn) return;

      if (idx === q.correctIndex) {
        btn.classList.add('opt-correct');
        if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i>';
      } else if (idx === index) {
        btn.classList.add('opt-incorrect');
        if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-xmark text-danger"></i>';
      } else {
        btn.classList.add('opt-disabled');
      }
    });

    // Enable next question button
    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) btnNext.removeAttribute('disabled');

    // Show Feedback Box
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      const resolvedQuery = q.incompleteQuery.replace('[ ??? ]', chosenOpt.text);

      feedbackBox.className = `quiz-feedback-box mt-4 ${isCorrect ? 'fb-correct' : 'fb-incorrect'}`;
      feedbackBox.innerHTML = `
        <div class="d-flex align-center gap-3">
          <div class="fb-icon">${isCorrect ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-circle-xmark"></i>'}</div>
          <div>
            <h4 class="m-0">${isCorrect ? 'Correct Answer! Key [' + (index + 1) + ']' : 'Incorrect Selection'}</h4>
            <p class="m-0 fs-xs mt-1">${chosenOpt.explanation}</p>
          </div>
        </div>

        <div class="resolved-preview-box mt-3 p-2">
          <span class="fs-xs text-muted">Resolved Query Preview:</span>
          <pre class="m-0 mt-1"><code>${this.escapeHTML(resolvedQuery)}</code></pre>
        </div>
      `;
    }
  }

  nextQuestion() {
    this.app.seed = Math.floor(Math.random() * 10000);
    this.app.generateAll();
  }

  renderSchemaBoxesHTML(schema) {
    if (!schema || !schema.tables || schema.tables.length === 0) {
      return '';
    }

    return `
      <details open class="card schema-preview-box mt-2" style="background: rgba(14, 18, 28, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-md);">
        <summary class="p-2 px-3 text-muted fs-xs font-weight-bold" style="cursor: pointer; background: rgba(255, 255, 255, 0.02); display: flex; justify-content: space-between; align-items: center; user-select: none;">
          <span style="color: var(--color-accent);"><i class="fa-solid fa-table-cells text-accent"></i> Schema Reference (${schema.tables.length} Tables)</span>
          <span class="fs-xs text-dim" style="font-size: 10px;"><i class="fa-solid fa-chevron-down"></i> Click to Toggle</span>
        </summary>
        <div class="card-body p-2">
          <div class="schema-tables-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px;">
            ${schema.tables.map(tbl => `
              <div class="table-schema-card p-2" style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px;">
                <div class="d-flex align-center justify-between mb-1" style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 4px;">
                  <strong style="color: var(--color-accent); font-family: var(--font-mono); font-size: 12px;">
                    <i class="fa-solid fa-table text-primary"></i> ${tbl.name}
                  </strong>
                  <span class="badge badge-outline" style="font-size:9px; padding: 1px 4px;">${tbl.columns.length} attributes</span>
                </div>
                <!-- Compact Column Badges (Name & Attributes Only) -->
                <div class="col-list" style="font-family: var(--font-mono); font-size: 10px; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0;">
                  ${tbl.columns.map(c => `
                    <span style="background: rgba(255,255,255,0.05); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); font-size: 11px;">
                      ${c.pk ? '🔑 ' : c.fk ? '🔗 ' : ''}<strong>${c.name}</strong> <span style="color:var(--color-primary); font-size:10px;">(${c.type})</span>
                    </span>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </details>
    `;
  }

  escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.HumanResolver = HumanResolver;
