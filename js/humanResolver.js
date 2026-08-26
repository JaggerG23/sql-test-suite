/**
 * Human & Participant Test Suite Resolver Module
 * Manages participant test sessions, top full-width schema bar with distinct divider line,
 * navbar Questions Answered counter integration synced to persistent telemetry logs,
 * vertically extended coding window (all code visible), candidate answer cards capped to not exceed coding box height,
 * and keyboard navigation (Keys 1, 2, 3, 4).
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

    this.intakeCompleted = false;

    // Attach global keyboard shortcuts & focus tracking listeners
    this.bindKeyboardShortcuts();
    this.bindFocusListeners();
  }

  get totalAnswered() {
    if (this.app && this.app.analytics) {
      return this.app.analytics.getAllResponses().length;
    }
    return this.stats.totalAnswered;
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

  renderIntakeScreen() {
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    const existingDemo = this.app.analytics ? this.app.analytics.getDemographics() || {} : {};
    const pid = this.app.analytics ? this.app.analytics.participantId : '';

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 860px; margin: 20px auto; padding: 28px; background: rgba(18, 22, 34, 0.95); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);">
        
        <!-- Header & Explanation Box -->
        <div class="card-header border-bottom pb-4 mb-4" style="border-bottom: 1px solid rgba(255,255,255,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 280px;">
              <div class="logo-icon" style="width: 46px; height: 46px; font-size: 22px; background: linear-gradient(135deg, var(--color-primary), var(--color-accent)); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 0 18px rgba(99, 102, 241, 0.4); flex-shrink: 0;">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div>
                <h2 style="font-family: var(--font-title); font-size: 21px; font-weight: 700; color: #fff; margin: 0; line-height: 1.25;">
                  Database Language Study
                </h2>
                <span class="text-accent fs-xs" style="font-size: 12px; margin-top: 3px; display: inline-block;">
                  <i class="fa-solid fa-clipboard-list"></i> Pre-Experiment Registration & Overview
                </span>
              </div>
            </div>
            
            <div style="background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.35); padding: 6px 14px; border-radius: 8px; font-size: 12px; color: var(--color-accent); white-space: nowrap; flex-shrink: 0; align-self: flex-start;">
              <i class="fa-solid fa-fingerprint"></i> Participant User ID: <strong style="color: #fff; font-family: var(--font-mono); font-weight: 700; margin-left: 4px;">${this.escapeHTML(pid)}</strong>
            </div>
          </div>
          
          <!-- Detailed Telemetry & Explanation Box -->
          <div style="background: rgba(99, 102, 241, 0.08); border-left: 4px solid var(--color-primary); border-radius: 8px; padding: 16px; font-size: 13px; line-height: 1.6; color: #e2e8f0;">
            <p style="margin: 0 0 8px 0; font-weight: 700; color: var(--text-main); font-size: 13.5px;">
              <i class="fa-solid fa-circle-info text-primary"></i> What you will be doing:
            </p>
            <p style="margin: 0 0 12px 0;">
              In this study, you'll be given 60 unique SQL queries with multiple choice answers. Your task is to read the code and answer each question with the expected output using the <strong><strong>1, 2, 3, or 4</strong></strong> keys on a keyboard or by clicking using a mouse. 
            </p>

            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; margin-top: 10px;">
              <p style="margin: 0 0 8px 0; font-weight: 700; color: var(--color-accent); font-size: 12px;">
                <i class="fa-solid fa-shield-halved"></i> Data That Will Be Tracked & Collected During This Study:
              </p>
              <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--text-muted); display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;">
                <li><strong>Demographics:</strong> Age, Gender, Academic Standing</li>
                <li><strong>Experience:</strong> Coding Experience, Database Experience</li>
                <li><strong>Identifiers:</strong> Immutable User ID</li>
                <li><strong>Question Data:</strong> Question Category, Raw SQL Query</li>
                <li><strong>Performance Metrics:</strong> Option Selected (1-4), Answer Accuracy</li>
                <li><strong>Timing:</strong> Response Duration per Question</li>
                <li><strong>Tab Focus:</strong> Number of times you tab away while taking the study and for how long</li>
                <li><strong>Qualitative Feedback:</strong> Optional Final Thoughts & Comments</li>
              </ul>
            </div>

            <p style="margin: 10px 0 0 0; font-size: 11.5px; color: var(--text-muted);">
              Please complete the brief demographic questionnaire below to begin the study.
            </p>
          </div>
        </div>

        <!-- Form Fields Grid -->
        <form id="intake-form" onsubmit="return false;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            
            <!-- Age -->
            <div class="form-group">
              <label for="intake-age" style="font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; color: var(--text-main);">
                <i class="fa-solid fa-cake-candles text-accent"></i> Age <span style="color: var(--color-danger)">*</span>
              </label>
              <input type="number" id="intake-age" class="form-control" min="15" max="100" placeholder="e.g. 24" value="${this.escapeHTML(existingDemo.age || '')}" required style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
            </div>

            <!-- Gender -->
            <div class="form-group">
              <label for="intake-gender" style="font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; color: var(--text-main);">
                <i class="fa-solid fa-venus-mars text-accent"></i> Gender <span style="color: var(--color-danger)">*</span>
              </label>
              <select id="intake-gender" class="form-select" required style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.gender ? 'selected' : ''}>Select Gender...</option>
                <option value="Male" ${existingDemo.gender === 'Male' ? 'selected' : ''}>Male</option>
                <option value="Female" ${existingDemo.gender === 'Female' ? 'selected' : ''}>Female</option>
                <option value="Non-binary" ${existingDemo.gender === 'Non-binary' ? 'selected' : ''}>Non-binary / Third gender</option>
                <option value="Prefer not to say" ${existingDemo.gender === 'Prefer not to say' ? 'selected' : ''}>Prefer not to say</option>
                <option value="Other" ${existingDemo.gender === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>

            <!-- Academic Standing -->
            <div class="form-group">
              <label for="intake-academic-standing" style="font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; color: var(--text-main);">
                <i class="fa-solid fa-graduation-cap text-accent"></i> Academic Standing <span style="color: var(--color-danger)">*</span>
              </label>
              <select id="intake-academic-standing" class="form-select" required style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.academicStanding ? 'selected' : ''}>Select Academic Standing...</option>
                <option value="Undergraduate (Freshman / Sophomore)" ${existingDemo.academicStanding === 'Undergraduate (Freshman / Sophomore)' ? 'selected' : ''}>Undergraduate (Freshman / Sophomore)</option>
                <option value="Undergraduate (Junior / Senior)" ${existingDemo.academicStanding === 'Undergraduate (Junior / Senior)' ? 'selected' : ''}>Undergraduate (Junior / Senior)</option>
                <option value="Master's Student" ${existingDemo.academicStanding === "Master's Student" ? 'selected' : ''}>Master's Student</option>
                <option value="Ph.D. Student / Doctoral Candidate" ${existingDemo.academicStanding === 'Ph.D. Student / Doctoral Candidate' ? 'selected' : ''}>Ph.D. Student / Doctoral Candidate</option>
                <option value="Postdoctoral Researcher / Faculty" ${existingDemo.academicStanding === 'Postdoctoral Researcher / Faculty' ? 'selected' : ''}>Postdoctoral Researcher / Faculty</option>
                <option value="Industry Professional / Engineer" ${existingDemo.academicStanding === 'Industry Professional / Engineer' ? 'selected' : ''}>Industry Professional / Engineer</option>
                <option value="Other" ${existingDemo.academicStanding === 'Other' ? 'selected' : ''}>Other</option>
              </select>
            </div>

            <!-- Coding Experience -->
            <div class="form-group">
              <label for="intake-coding-exp" style="font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; color: var(--text-main);">
                <i class="fa-solid fa-code text-accent"></i> Coding Experience <span style="color: var(--color-danger)">*</span>
              </label>
              <select id="intake-coding-exp" class="form-select" required style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.codingExp ? 'selected' : ''}>Select Coding Experience...</option>
                <option value="None (< 1 year)" ${existingDemo.codingExp === 'None (< 1 year)' ? 'selected' : ''}>None (< 1 year)</option>
                <option value="1–2 years" ${existingDemo.codingExp === '1–2 years' ? 'selected' : ''}>1–2 years</option>
                <option value="3–5 years" ${existingDemo.codingExp === '3–5 years' ? 'selected' : ''}>3–5 years</option>
                <option value="5+ years" ${existingDemo.codingExp === '5+ years' ? 'selected' : ''}>5+ years</option>
              </select>
            </div>

            <!-- Database Experience -->
            <div class="form-group" style="grid-column: span 2;">
              <label for="intake-db-exp" style="font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; color: var(--text-main);">
                <i class="fa-solid fa-database text-accent"></i> Database Experience <span style="color: var(--color-danger)">*</span>
              </label>
              <select id="intake-db-exp" class="form-select" required style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.dbExp ? 'selected' : ''}>Select Database Experience...</option>
                <option value="No database experience" ${existingDemo.dbExp === 'No database experience' ? 'selected' : ''}>No database experience</option>
                <option value="Beginner (< 1 year)" ${existingDemo.dbExp === 'Beginner (< 1 year)' ? 'selected' : ''}>Beginner (< 1 year)</option>
                <option value="Intermediate (1–3 years)" ${existingDemo.dbExp === 'Intermediate (1–3 years)' ? 'selected' : ''}>Intermediate (1–3 years)</option>
                <option value="Advanced (3+ years)" ${existingDemo.dbExp === 'Advanced (3+ years)' ? 'selected' : ''}>Advanced (3+ years)</option>
              </select>
            </div>

            <!-- Do they have experience writing queries? -->
            <div class="form-group" style="grid-column: span 2;">
              <label for="intake-query-exp" style="font-size: 12px; font-weight: 600; margin-bottom: 5px; display: block; color: var(--text-main);">
                <i class="fa-solid fa-terminal text-accent"></i> Do you have experience with writing queries? <span style="color: var(--color-danger)">*</span>
              </label>
              <select id="intake-query-exp" class="form-select" required style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.queryExp ? 'selected' : ''}>Select Query Writing Experience...</option>
                <option value="Yes - Frequently write SQL / database queries" ${existingDemo.queryExp && existingDemo.queryExp.includes('Frequently') ? 'selected' : ''}>Yes — Frequently write SQL / database queries</option>
                <option value="Yes - Occasionally write queries" ${existingDemo.queryExp && existingDemo.queryExp.includes('Occasionally') ? 'selected' : ''}>Yes — Occasionally write queries</option>
                <option value="Basic classroom / coursework knowledge only" ${existingDemo.queryExp && existingDemo.queryExp.includes('classroom') ? 'selected' : ''}>Basic classroom / coursework knowledge only</option>
                <option value="No - Never written queries before" ${existingDemo.queryExp && existingDemo.queryExp.includes('Never') ? 'selected' : ''}>No — Never written queries before</option>
              </select>
            </div>

          </div>

          <!-- Submit Action Button -->
          <div class="mt-4 pt-3 border-top d-flex justify-between align-center" style="border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
            <span class="text-muted fs-xs" style="font-size: 11px;"><i class="fa-solid fa-shield-halved text-success"></i> Demographic telemetry stored anonymously for User <strong>${this.escapeHTML(pid)}</strong>.</span>
            <button type="submit" id="btn-start-experiment" class="btn btn-primary" style="padding: 9px 24px; font-weight: 700; font-size: 13.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4); cursor: pointer;">
              Begin Experiment <i class="fa-solid fa-arrow-right" style="margin-left: 4px;"></i>
            </button>
          </div>
        </form>
      </div>
    `;

    const form = document.getElementById('intake-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ageVal = document.getElementById('intake-age').value.trim();
        const genderVal = document.getElementById('intake-gender').value;
        const academicVal = document.getElementById('intake-academic-standing').value;
        const codingVal = document.getElementById('intake-coding-exp').value;
        const dbVal = document.getElementById('intake-db-exp').value;
        const queryVal = document.getElementById('intake-query-exp').value;

        if (!ageVal || !genderVal || !academicVal || !codingVal || !dbVal || !queryVal) {
          alert('Please fill in all required demographic fields to begin the experiment.');
          return;
        }

        const data = {
          age: ageVal,
          gender: genderVal,
          academicStanding: academicVal,
          codingExp: codingVal,
          dbExp: dbVal,
          queryExp: queryVal
        };

        if (this.app.analytics) {
          this.app.analytics.saveDemographics(data, pid);
        }

        this.intakeCompleted = true;
        this.app.loadIncrementalQuestion(1);
      });
    }
  }

  renderFinalThoughtsScreen() {
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    const existingThoughtsObj = this.app.analytics ? this.app.analytics.getFinalThoughts() || {} : {};

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 820px; margin: 15px auto; padding: 24px; background: rgba(18, 22, 34, 0.95); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div class="border-bottom pb-3 mb-3" style="border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 16px; margin-bottom: 20px;">
          <div class="logo-icon mb-2" style="width: 50px; height: 50px; font-size: 24px; margin: 0 0 10px 0; background: linear-gradient(135deg, #10b981, #06b6d4); box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); display: flex; align-items: center; justify-content: center; border-radius: 12px; color: #fff;">
            <i class="fa-solid fa-award"></i>
          </div>
          <h2 style="font-family: var(--font-title); font-size: 24px; color: #fff; margin: 0 0 4px 0;">Experiment Completed!</h2>
          <p class="text-muted fs-sm" style="font-size: 13px; margin: 4px 0 0 0; color: var(--text-muted);">Thank you for participating in my study! If you have any further questions, contact your professor or email me.</p>
        </div>

        <!-- Final Thoughts Form -->
        <form id="final-thoughts-form" onsubmit="return false;">
          <div class="form-group mb-3">
            <label for="final-thoughts-input" style="font-size: 13px; font-weight: 700; margin-bottom: 8px; display: block; color: var(--text-main);">
              <i class="fa-solid fa-comment-dots text-accent"></i> Share any final thoughts (OPTIONAL)
            </label>
            <textarea id="final-thoughts-input" class="form-control" rows="5" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #fff; font-size: 13px; font-family: var(--font-sans); line-height: 1.5; resize: vertical;">${this.escapeHTML(existingThoughtsObj.thoughts || '')}</textarea>
          </div>

          <div id="final-thoughts-feedback-msg" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 12px;"></div>

          <div class="d-flex justify-end align-center pt-3 border-top" style="border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end; align-items: center;">
            <button type="submit" id="btn-submit-final-thoughts" class="btn btn-success" style="padding: 9px 22px; font-weight: 700; font-size: 13.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4); cursor: pointer;">
              <i class="fa-solid fa-paper-plane"></i> Submit
            </button>
          </div>
        </form>
      </div>
    `;

    const form = document.getElementById('final-thoughts-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const thoughtsVal = document.getElementById('final-thoughts-input').value.trim();

        if (this.app.analytics) {
          this.app.analytics.saveFinalThoughts(thoughtsVal);
          this.app.renderAnalyticsDashboard();
        }

        const msgBox = document.getElementById('final-thoughts-feedback-msg');
        if (msgBox) {
          msgBox.style.display = 'block';
          msgBox.style.background = 'rgba(16, 185, 129, 0.15)';
          msgBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          msgBox.style.color = '#34d399';
          msgBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> Thank you! Your final thoughts and experiment telemetry have been saved successfully.';
        }
      });
    }
  }

  startNewChallenge(schema, query, groundTruthResult, targetQNum) {
    if (!this.app.syntaxDialects || !this.app.quizGenerator) return;

    const isParticipantPage = window.location && window.location.pathname ? window.location.pathname.includes('participant.html') : false;

    if (targetQNum === 'intake') {
      this.renderIntakeScreen();
      return;
    }

    if (targetQNum === 'final_thoughts' || targetQNum > 60) {
      this.renderFinalThoughtsScreen();
      return;
    }

    if (isParticipantPage && !this.intakeCompleted) {
      const demo = this.app.analytics ? this.app.analytics.getDemographics() : null;
      if (!demo) {
        this.renderIntakeScreen();
        return;
      } else {
        this.intakeCompleted = true;
      }
    }

    const qNum = targetQNum || (this.stats ? this.stats.totalAnswered + 1 : 1);

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

  resetToFirstQuestion() {
    this.stats.totalAnswered = 0;
    this.isAnswered = false;
    this.selectedOptionIndex = null;
    this.currentQuestion = null;
    this.intakeCompleted = false;
    this.updateNavCounter();
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

  updateNavCounter() {
    const navElem = document.getElementById('nav-questions-counter');
    if (navElem) {
      navElem.textContent = `${this.totalAnswered} / 60`;
    }
  }

  renderQuizUI() {
    const container = document.getElementById('human-challenge-container');
    if (!container || !this.currentQuestion) return;

    const q = this.currentQuestion;
    const activeDialects = this.app.syntaxDialects.getActiveDialects();
    const currentDialectIdx = this.app.syntaxDialects.currentSelectedDialectIndex;
    const isParticipantPage = window.location && window.location.pathname ? window.location.pathname.includes('participant.html') : false;

    // Update navbar questions counter badge in Participant ID box
    this.updateNavCounter();

    container.innerHTML = `
      <div class="card quiz-card glow-card compact-view" style="padding: 0;">
        <div class="card-body p-2" style="display: flex; flex-direction: column; gap: 8px;">
          
          <!-- 1. TOP FULL-WIDTH ROW: Input Schema Reference with Distinct Divider Line -->
          <div class="quiz-schema-top-bar p-2" style="border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 2px solid var(--color-accent); border-radius: 6px; background: rgba(14, 18, 28, 0.8); width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div class="d-flex justify-between align-center mb-1 pb-1" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
              <strong style="color: var(--color-accent); font-size: 11px;"><i class="fa-solid fa-table-cells text-accent"></i> Input Schema Reference (${this.app.currentSchema ? this.app.currentSchema.tables.length : 0} Tables)</strong>
            </div>
            ${this.renderCompactSchemaHTML(this.app.currentSchema)}
          </div>

          <!-- DISTINCT SEPARATION LINE -->
          <div style="height: 1px; background: linear-gradient(90deg, transparent, var(--color-accent), transparent); margin: 2px 0 6px 0; opacity: 0.7;"></div>

          <!-- 2. MAIN 2-COLUMN SPLIT ROW (Left: Fully Extended Coding Window, Right: Prompt + Answers) -->
          <div class="quiz-main-split" style="display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 12px; align-items: flex-start;">
            
            <!-- LEFT COLUMN: Fully Extended Coding Window (All Code Lines Visible at Once) -->
            <div class="quiz-left-column" style="display: flex; flex-direction: column; gap: 4px;">
              ${!isParticipantPage ? `
                <div class="dialect-config-bar p-1 px-2 d-flex justify-between align-center" style="background: rgba(0, 0, 0, 0.3); border-radius: 5px; font-size: 10.5px;">
                  <div class="dialect-tabs d-flex align-center gap-1">
                    <span class="text-muted" style="font-size: 10px; margin-right: 2px;"><i class="fa-solid fa-sliders"></i> Dialect:</span>
                    ${activeDialects.map((d, idx) => `
                      <button class="btn btn-sm dialect-tab ${(currentDialectIdx === idx || (currentDialectIdx === null && q.dialect && d.id === q.dialect.id)) ? 'active' : ''}" data-idx="${idx}" style="padding: 1px 7px; font-size: 10px; border-radius: 4px;">
                        ${d.name}
                      </button>
                    `).join('')}
                  </div>
                  <button id="btn-configure-syntaxes" class="btn btn-sm btn-ghost p-0 px-1" title="Configure Dialects" style="font-size: 10.5px;">
                    <i class="fa-solid fa-gear"></i> Settings
                  </button>
                </div>
              ` : ''}

              <!-- Coding Window: Displays all code lines at once with no scrolling required -->
              <div class="query-code-preview p-2" style="border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; background: rgba(10, 14, 26, 0.95); flex: 1; min-height: 350px; max-height: 380px; overflow: visible;">
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

              <!-- 4 Candidate Output Tables (2x2 Grid Capped to NOT exceed Coding Box height) -->
              <div class="quiz-options-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 340px;">
                ${q.options.map((opt, idx) => `
                  <div class="quiz-option-card table-option-card" id="opt-btn-${idx}" data-idx="${idx}" style="cursor: pointer; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(18, 24, 38, 0.7); overflow: hidden; display: flex; flex-direction: column; max-height: 165px;">
                    <div class="opt-header p-1 px-2 d-flex justify-between align-center" style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); font-size: 10.5px; min-height: 26px;">
                      <div class="d-flex align-center gap-1" style="width: 100%; justify-content: center;">
                        <kbd style="background: var(--color-primary); color: #fff; padding: 1px 5px; font-size: 9.5px; font-weight: 700; border-radius: 3px;">${idx + 1}</kbd>
                        <strong style="color: var(--text-main); font-size: 10.5px;">Opt ${String.fromCharCode(65 + idx)}</strong>
                        <span class="text-muted" style="font-size: 9px;">(${opt.rows.length} rows)</span>
                      </div>
                      <div class="opt-status-icon" id="opt-icon-${idx}"></div>
                    </div>
                    <!-- Data Preview Table: Capped height under title bar with 0 top gap -->
                    <div class="opt-body" style="display: flex; justify-content: center; align-items: flex-start; overflow-x: auto; overflow-y: auto; width: 100%; flex: 1; padding: 2px 4px 4px 4px; margin: 0; max-height: 135px;">
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

    [1, 2].forEach((num, i) => {
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
        const s1Elem = document.getElementById('sel-syntax-1');
        const s2Elem = document.getElementById('sel-syntax-2');
        const s1 = s1Elem ? s1Elem.value : 'pipe';
        const s2 = s2Elem ? s2Elem.value : 'quorum';
        this.app.syntaxDialects.setActiveDialects(s1, s2);
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
    this.updateNavCounter();

    // Finalize focus loss duration
    if (this.focusMetrics.lastBlurTime) {
      const awayMs = Date.now() - this.focusMetrics.lastBlurTime;
      this.focusMetrics.totalFocusLostTimeMs += awayMs;
      this.focusMetrics.lastBlurTime = null;
    }

    // Log telemetry to analytics storage (stored persistently in localStorage)
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
            <h4 class="m-0" style="font-size: 11.5px;">${isCorrect ? 'Correct Choice! (Key [' + (index + 1) + '])' : 'Incorrect Choice (Key [' + (index + 1) + '])'}</h4>
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
      return `<div class="p-1 text-muted fs-xs text-center">Empty Dataset</div>`;
    }

    let html = `
      <div style="display: flex; justify-content: center; width: 100%; margin: 0;">
        <table class="data-table opt-table" style="margin: 0 auto; border-collapse: collapse; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12); font-size: 11px; background: rgba(10, 14, 26, 0.65);">
          <thead>
            <tr>
    `;

    columns.forEach(col => {
      html += `<th style="padding: 4px 12px; background: rgba(0,0,0,0.6); text-transform: none; font-size: 10.5px; border-bottom: 1px solid rgba(255,255,255,0.15); color: var(--color-accent); font-weight: 600; text-align: center;">${this.escapeHTML(col)}</th>`;
    });

    html += `</tr></thead><tbody>`;

    if (!rows || rows.length === 0) {
      html += `<tr><td colspan="${columns.length}" class="text-center text-muted p-2" style="font-size:10px;">(0 rows returned)</td></tr>`;
    } else {
      rows.forEach(row => {
        html += `<tr>`;
        row.forEach(val => {
          const dispVal = val === null ? '<span class="text-muted">NULL</span>' : this.escapeHTML(val);
          html += `<td style="padding: 3px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; font-family: var(--font-mono); text-align: center;">${dispVal}</td>`;
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
      <div class="compact-schema-grid" style="display: grid; grid-template-columns: repeat(${Math.min(schema.tables.length, 5)}, 1fr); gap: 10px;">
        ${schema.tables.map(tbl => `
          <div class="schema-tbl-card p-1 px-2" style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px;">
            <div class="d-flex justify-between align-center" style="font-size: 10.5px;">
              <strong style="color: var(--color-accent); font-family: var(--font-mono);">
                <i class="fa-solid fa-table text-primary"></i> ${tbl.name}
              </strong>
              <span class="text-muted" style="font-size: 9px;">(${tbl.rows.length} rows, ${tbl.columns.length} cols)</span>
            </div>
            <div class="col-badges mt-1" style="display: flex; flex-wrap: wrap; gap: 2px; font-family: var(--font-mono);">
              ${tbl.columns.map(c => `
                <span style="background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.07); font-size: 9px;">
                  ${c.pk ? '🔑 ' : ''}<strong>${c.name}</strong> <span style="color:var(--color-primary);">${c.type}</span>
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
