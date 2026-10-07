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
    this.answerChangeCount = 0;

    this.focusMetrics = {
      tabFocusLost: false,
      tabSwitchCount: 0,
      totalFocusLostTimeMs: 0,
      lastBlurTime: null
    };

    this.intakeCompleted = false;
    this.consentAccepted = false;

    // Check if new participant session is explicitly requested via URL (e.g. from index.html Participant View link)
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new_participant') === '1' || params.get('new_session') === 'true') {
          if (this.app && this.app.analytics) {
            const newPid = 'user_' + Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 5);
            this.app.analytics.setParticipantId(newPid);
          }
          this.intakeCompleted = false;
          this.consentAccepted = false;
        }
      } catch (e) {}
    }

    // Real-time listener for /index.html visits: forces active participant to fill demographics again
    const handleIndexVisitEvent = () => {
      if (this.isParticipantView()) {
        if (!this.hasAcceptedConsent()) {
          this.intakeCompleted = false;
          if (this.app) this.app.currentQuestionNumber = 'consent';
          this.renderConsentScreen();
        } else if (!this.hasCompletedDemographics()) {
          this.intakeCompleted = false;
          if (this.app) this.app.currentQuestionNumber = 'intake';
          this.renderIntakeScreen();
        }
      }
    };
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('sql_study_telemetry_channel');
        bc.addEventListener('message', (ev) => {
          if (ev.data && ev.data.type === 'INDEX_HTML_VISITED') {
            handleIndexVisitEvent();
          }
        });
      } catch (e) {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (ev) => {
        if (ev.key === 'sql_study_index_visited_at') {
          handleIndexVisitEvent();
        }
      });
    }

    // Attach global keyboard shortcuts & focus tracking listeners
    this.bindKeyboardShortcuts();
    this.bindFocusListeners();
  }

  isParticipantView() {
    if (this.app && typeof this.app.isParticipantView === 'function') {
      return this.app.isParticipantView();
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

  hasAcceptedConsent(pid) {
    if (!this.isParticipantView()) return true;
    if (this.consentAccepted) return true;
    if (this.app && typeof this.app.hasAcceptedConsent === 'function') {
      return this.app.hasAcceptedConsent(pid);
    }
    try {
      const targetPid = pid || (this.app && this.app.analytics ? this.app.analytics.participantId : '');
      if (targetPid && (sessionStorage.getItem('sql_study_consent_accepted_' + targetPid) === 'true' || localStorage.getItem('sql_study_consent_accepted_' + targetPid) === 'true')) {
        this.consentAccepted = true;
        return true;
      }
      if (sessionStorage.getItem('sql_study_consent_accepted') === 'true' || localStorage.getItem('sql_study_consent_accepted') === 'true') {
        this.consentAccepted = true;
        return true;
      }
    } catch (e) {}
    return false;
  }

  setConsentAccepted(accepted = true) {
    this.consentAccepted = accepted;
    try {
      const targetPid = (this.app && this.app.analytics ? this.app.analytics.participantId : '');
      if (accepted) {
        if (targetPid) {
          sessionStorage.setItem('sql_study_consent_accepted_' + targetPid, 'true');
          localStorage.setItem('sql_study_consent_accepted_' + targetPid, 'true');
        }
        sessionStorage.setItem('sql_study_consent_accepted', 'true');
        localStorage.setItem('sql_study_consent_accepted', 'true');
      } else {
        if (targetPid) {
          sessionStorage.removeItem('sql_study_consent_accepted_' + targetPid);
          localStorage.removeItem('sql_study_consent_accepted_' + targetPid);
        }
        sessionStorage.removeItem('sql_study_consent_accepted');
        localStorage.removeItem('sql_study_consent_accepted');
      }
    } catch (e) {}
  }

  hasCompletedDemographics(pid) {
    if (!this.isParticipantView()) return true;

    if (this.app && typeof this.app.hasCompletedDemographics === 'function') {
      return this.app.hasCompletedDemographics(pid);
    }
    if (!this.app || !this.app.analytics) return false;
    const targetPid = pid || this.app.analytics.participantId;
    const demo = this.app.analytics.getDemographics(targetPid);
    if (!demo) return false;

    // Invalidation check: anyone who visits /index.html must complete demographics again
    const indexVisitedAt = parseInt(localStorage.getItem('sql_study_index_visited_at') || '0', 10);
    const demoSavedAt = demo.savedAtTimestamp || (demo.timestamp ? new Date(demo.timestamp).getTime() : 0);
    if (indexVisitedAt > 0 && demoSavedAt < indexVisitedAt) {
      return false;
    }

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

  get totalAnswered() {
    if (this.app && this.app.analytics) {
      return this.app.analytics.getParticipantResponses(this.app.analytics.participantId).length;
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

      // Block answering shortcuts if test is finished or at final thoughts
      if (this.app && (this.app.currentQuestionNumber === 'final_thoughts' || (this.stats && this.stats.totalAnswered >= 60))) {
        return;
      }

      // Handle Keys 1, 2, 3, 4 (Choice selection)
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const optionIndex = parseInt(e.key, 10) - 1;
        this.selectOption(optionIndex);
      } else if (e.code === 'Numpad1') { e.preventDefault(); this.selectOption(0); }
      else if (e.code === 'Numpad2') { e.preventDefault(); this.selectOption(1); }
      else if (e.code === 'Numpad3') { e.preventDefault(); this.selectOption(2); }
      else if (e.code === 'Numpad4') { e.preventDefault(); this.selectOption(3); }
      // Handle Enter to submit chosen answer or advance to next question
      else if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (!this.isAnswered && this.selectedOptionIndex !== null) {
          e.preventDefault();
          this.submitAnswer();
        } else if (this.isAnswered) {
          e.preventDefault();
          this.nextQuestion();
        }
      }
      // Prevent Space bar from scrolling page (all quiz functionality removed)
      else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
      }
    });
  }

  renderConsentScreen() {
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 900px; width: 100%; margin: 24px auto; padding: 44px 50px; background: rgba(18, 22, 34, 0.95); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); color: #f1f5f9; backdrop-filter: blur(16px);">
        
        <!-- UNLV Institutional Header -->
        <div style="text-align: center; margin-bottom: 26px;">
          <img src="unlv_logo.png" alt="UNLV" style="height: 68px; width: auto; max-width: 250px; margin: 0 auto 12px auto; display: block; object-fit: contain;">
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 17.5px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; margin: 0 0 5px 0;">EXEMPT RESEARCH STUDY</div>
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 17px; font-weight: 700; letter-spacing: 0.5px; color: #e2e8f0; text-transform: uppercase; margin: 0 0 6px 0;">INFORMATION SHEET</div>
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 16px; font-weight: 700; color: #cbd5e1; margin: 0 0 22px 0;">Department of Computer Science</div>
        </div>

        <!-- Information Sheet Body Paragraphs -->
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 16px; font-weight: 400; line-height: 1.7; color: #e2e8f0; display: flex; flex-direction: column; gap: 16px; text-align: justify;">
          <div style="font-weight: 700; color: #ffffff; text-align: left; line-height: 1.5;">
            <p style="margin: 0 0 6px 0;">
              TITLE OF STUDY: HUMAN-COMPUTER INTERACTION IN DATABASE MANAGEMENT: READABILITY IN SQL QUERIES
            </p>
            <p style="margin: 0;">
              INVESTIGATOR(S) AND CONTACT PHONE NUMBER: <br> <u><strong>JAGGER GOLDBERG, (702) 840-8691</strong></u>; <u><strong>ANDREAS STEFIK, (702) 774-3404</strong></u>
            </p>
          </div>

          <p style="margin: 0;">
            The purpose of this study is to measure student’s ability of reading and interpreting database queries. You are being asked to participate in the study because you meet the following criteria: 18 years of age or older, are currently a member of UNLV’s Computer Science department, and are currently taking a Computer Science course during the Fall 2026 semester.
          </p>

          <p style="margin: 0;">
            If you choose to participate in this study, you will complete 60 multiple-choice questions. For each question, you will read a database query and select its expected output. 
          </p>

          <p style="margin: 0;">
            This study includes the minimal risks of eye strain and/or hand cramps. The study will take 60 minutes of your time. You will be compensated for your time via 2% extra credit for your completion of this study in the course you received this recruitment from. NOTICE: Your involvement in the study only counts if you complete all sixty questions in the study. Completing less than 60 questions will not count as participation in the study.
          </p>

          <p style="margin: 0;">
            Alternatively, if you do not wish to participate in the study, you may complete a 2-page essay on databases and submit it to your instructor. You will receive the same 2% extra credit for doing so.
          </p>

          <p style="margin: 0;">
            You will be asked to provide your class section and email for compensation purposes. Other identifiers such as demographic data like age, gender, primary language, and country of origin are collected to measure effects across different groups, but this data will not be included with individual results. These identifiers <strong style="color: #ffffff;">will not</strong> be linked to your study data.
          </p>

          <p style="margin: 0;">
            For questions regarding the rights of research subjects, any complaints or comments regarding the manner in which the study is being conducted you may contact <strong style="color: #ffffff;">the UNLV Office of Research Integrity – Human Subjects at 702-895-2794, or via email at IRB@unlv.edu</strong>.
          </p>

          <p style="margin: 0;">
            Your participation in this study is voluntary. You may withdraw at any time. You are encouraged to ask questions about this study at the beginning or any time during the research study.
          </p>
        </div>

        <!-- Consent Action Container at bottom -->
        <div class="consent-agreement-box" style="margin-top: 34px; padding: 24px 28px; background: rgba(99, 102, 241, 0.12); border: 2px solid rgba(99, 102, 241, 0.45); border-radius: 10px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px;">
          <p style="font-size: 16px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.4;">
            By clicking continue, you consent to participate in this study.
          </p>
          <button type="button" id="btn-consent-continue" class="btn btn-primary" style="padding: 12px 38px; font-size: 15.5px; font-weight: 700; border-radius: 8px; box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4); cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <span>Continue</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>

      </div>
    `;

    const btnContinue = document.getElementById('btn-consent-continue');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        this.setConsentAccepted(true);
        if (this.app) {
          this.app.loadIncrementalQuestion('intake');
        } else {
          this.renderIntakeScreen();
        }
      });
    }
  }

  renderIntakeScreen() {
    if (this.isParticipantView() && !this.hasAcceptedConsent()) {
      this.renderConsentScreen();
      return;
    }
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    const indexVisitedAt = parseInt(localStorage.getItem('sql_study_index_visited_at') || '0', 10);
    const demoObj = this.app.analytics ? this.app.analytics.getDemographics() || {} : {};
    const demoSavedAt = demoObj.savedAtTimestamp || (demoObj.timestamp ? new Date(demoObj.timestamp).getTime() : 0);
    const isInvalidated = (indexVisitedAt > 0 && demoSavedAt < indexVisitedAt);
    const existingDemo = isInvalidated ? {} : demoObj;
    const pid = this.app.analytics ? this.app.analytics.participantId : '';

    const mapGenderCode = (val) => {
      if (val === undefined || val === null || val === '') return '';
      if (typeof val === 'number') return val;
      const s = String(val).trim().toLowerCase();
      if (s === '0' || s === 'male' || s === 'm') return 0;
      if (s === '1' || s === 'female' || s === 'f') return 1;
      if (s === '2' || s.includes('non-binary') || s.includes('nonbinary')) return 2;
      if (s === '3' || s === 'other') return 3;
      if (s === '4' || s.includes('prefer not')) return 4;
      return 3;
    };

    const mapEduCode = (val) => {
      if (val === undefined || val === null || val === '') return '';
      if (typeof val === 'number') return val;
      const s = String(val).trim().toLowerCase();
      if (s === '0' || s.includes('high school') || s.includes('ged') || s.includes('diploma')) return 0;
      if (s === '1' || s.includes('some college') || s.includes('freshman') || s.includes('sophomore')) return 1;
      if (s === '2' || s.includes('associate')) return 2;
      if (s === '3' || s.includes('bachelor') || s.includes('junior') || s.includes('senior') || s.includes('undergrad')) return 3;
      if (s === '4' || s.includes('master') || s.includes('graduate')) return 4;
      if (s === '5' || s.includes('ph') || s.includes('doctor') || s.includes('postdoc')) return 5;
      if (s === '6' || s.includes('other') || s.includes('industry')) return 6;
      return 6;
    };

    const currentGenderCode = mapGenderCode(existingDemo.gender);
    const currentEduCode = mapEduCode(existingDemo.education || existingDemo.academicStanding || existingDemo.highestEducation);

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 1080px; width: 100%; margin: 20px auto; padding: 28px; background: rgba(18, 22, 34, 0.95); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);">
        
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
          </div>
          
          <!-- Detailed Telemetry & Explanation Box -->
          <div style="background: rgba(99, 102, 241, 0.08); border-left: 4px solid var(--color-primary); border-radius: 8px; padding: 16px; font-size: 13px; line-height: 1.6; color: #e2e8f0;">
            <p style="margin: 0 0 8px 0; font-weight: 700; color: var(--text-main); font-size: 13.5px;">
              <i class="fa-solid fa-circle-info text-primary"></i> What you will be doing:
            </p>
            <p style="margin: 0 0 10px 0;">
              In this study, you'll be given 60 unique SQL queries with multiple choice answers. Your task is to read the code and answer each question with the expected output using the <strong>1, 2, 3, or 4</strong> keys on a keyboard or by clicking using a mouse. 
            </p>
            <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-left: 4px solid #ef4444; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 12px; color: #fca5a5; font-weight: 600;">
              <i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px; color: #ef4444;"></i> Do not use the back arrow or refresh button while doing this study.
            </div>

            <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.35); border-left: 4px solid var(--color-primary); border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px; color: #e2e8f0; font-weight: 500; line-height: 1.5;">
              <strong style="color: var(--color-accent);"><i class="fa-solid fa-graduation-cap" style="margin-right: 6px; color: var(--color-accent); font-size: 14px;"></i> Course Extra Credit:</strong> If you are participating in this study for course credit, you will be able to enter your student email address on the final thoughts page upon completing the study. To protect your confidentiality, your email address is stored in a completely separate file with zero connection to your study answers.
            </div>

            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; margin-top: 10px;">
              <p style="margin: 0 0 8px 0; font-weight: 700; color: var(--color-accent); font-size: 12px;">
                <i class="fa-solid fa-shield-halved"></i> Data That Will Be Tracked & Collected During This Study:
              </p>
              <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; color: var(--text-muted); display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;">
                <li><strong>Demographics:</strong> Age, Gender, Education, Primary Language, Country of Origin</li>
                <li><strong>Experience:</strong> Programming Experience, Database Experience</li>
                <li><strong>Question Data:</strong> Question Category, Raw SQL Query</li>
                <li><strong>Performance Metrics:</strong> Option Selected (1-4), Answer Accuracy</li>
                <li><strong>Timing:</strong> Response Duration per Question</li>
                <li><strong>Tab Focus:</strong> Number of times you tab away while doing this study and for how long</li>
                <li><strong>Qualitative Feedback:</strong> Optional Final Thoughts & Comments</li>
                <li><strong>Extra Credit:</strong> Student Email (submitted separately at completion to be cross-referenced by your professor)</li>
              </ul>
            </div>

            <p style="margin: 10px 0 0 0; font-size: 11.5px; color: var(--text-muted);">
              Please complete the brief demographic questionnaire below to begin the study.
            </p>
          </div>
        </div>

        <!-- Form Fields Grid -->
        <div id="intake-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px;">
            
            <!-- 1. How old are you? -->
            <div class="form-group">
              <label for="intake-age" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-cake-candles text-accent"></i> How old are you?
              </label>
              <input type="number" id="intake-age" class="form-control" min="18" max="100" placeholder="e.g. 24" value="${this.escapeHTML(existingDemo.age || '')}" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
            </div>

            <!-- 2. What is your gender -->
            <div class="form-group">
              <label for="intake-gender" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-venus-mars text-accent"></i> What is your gender
              </label>
              <select id="intake-gender" class="form-select" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${currentGenderCode === '' ? 'selected' : ''}>Select Gender...</option>
                <option value="0" ${currentGenderCode === 0 ? 'selected' : ''}>Male</option>
                <option value="1" ${currentGenderCode === 1 ? 'selected' : ''}>Female</option>
                <option value="2" ${currentGenderCode === 2 ? 'selected' : ''}>Non-binary</option>
                <option value="3" ${currentGenderCode === 3 ? 'selected' : ''}>Other</option>
                <option value="4" ${currentGenderCode === 4 ? 'selected' : ''}>Prefer not to say</option>
              </select>
            </div>

            <!-- 3. How many total years of programming experience do you have? -->
            <div class="form-group">
              <label for="intake-coding-exp" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-code text-accent"></i> How many total years of programming experience do you have?
              </label>
              <input type="number" step="any" min="0" max="100" id="intake-coding-exp" class="form-control" placeholder="e.g. 3" value="${this.escapeHTML(existingDemo.codingExp || '')}" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
            </div>

            <!-- 4. What is your highest level of education? -->
            <div class="form-group">
              <label for="intake-education" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-graduation-cap text-accent"></i> What is your highest level of education?
              </label>
              <select id="intake-education" class="form-select" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${currentEduCode === '' ? 'selected' : ''}>Select Highest Level of Education...</option>
                <option value="0" ${currentEduCode === 0 ? 'selected' : ''}>High School / GED</option>
                <option value="1" ${currentEduCode === 1 ? 'selected' : ''}>Some college / university</option>
                <option value="2" ${currentEduCode === 2 ? 'selected' : ''}>Associate Degree</option>
                <option value="3" ${currentEduCode === 3 ? 'selected' : ''}>Bachelor Degree</option>
                <option value="4" ${currentEduCode === 4 ? 'selected' : ''}>Masters Degree</option>
                <option value="5" ${currentEduCode === 5 ? 'selected' : ''}>Ph. D.</option>
                <option value="6" ${currentEduCode === 6 ? 'selected' : ''}>Other</option>
              </select>
            </div>

            <!-- 5. How many years of studying or working with databases do you have? -->
            <div class="form-group">
              <label for="intake-db-exp" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-database text-accent"></i> How many years of studying or working with databases do you have?
              </label>
              <input type="number" step="any" min="0" max="100" id="intake-db-exp" class="form-control" placeholder="e.g. 2" value="${this.escapeHTML(existingDemo.dbExp || '')}" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
            </div>

            <!-- 6. What is your primary language (i.e., the language you speak at home)? -->
            <div class="form-group">
              <label for="intake-primary-language" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-language text-accent"></i> What is your primary language (i.e., the language you speak at home)?
              </label>
              <select id="intake-primary-language" class="form-select" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.primaryLanguage ? 'selected' : ''}>Select Primary Language...</option>
                ${[
                  "English", "Spanish", "Chinese (Mandarin / Cantonese)", "Hindi", "Arabic",
                  "Bengali", "Portuguese", "Russian", "Urdu", "German",
                  "Japanese", "Korean", "French", "Vietnamese", "Tagalog / Filipino",
                  "Italian", "Turkish", "Polish", "Tamil", "Telugu", "Other", "Prefer not to say"
                ].map(lang => `<option value="${lang}" ${existingDemo.primaryLanguage === lang ? 'selected' : ''}>${lang}</option>`).join('')}
              </select>
            </div>

            <!-- 7. What is your country of origin? -->
            <div class="form-group">
              <label for="intake-country" style="font-size: 12.5px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fa-solid fa-earth-americas text-accent"></i> What is your country of origin?
              </label>
              <select id="intake-country" class="form-select" required style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px;">
                <option value="" disabled ${!existingDemo.countryOfOrigin ? 'selected' : ''}>Select Country of Origin...</option>
                ${[
                  "United States", "Canada", "United Kingdom", "Australia", "India", "China",
                  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Austria", "Azerbaijan",
                  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
                  "Cabo Verde", "Cambodia", "Cameroon", "Central African Republic", "Chad", "Chile", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
                  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
                  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
                  "Fiji", "Finland", "France",
                  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
                  "Haiti", "Honduras", "Hungary",
                  "Iceland", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
                  "Jamaica", "Japan", "Jordan",
                  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
                  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
                  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
                  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
                  "Oman",
                  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
                  "Qatar",
                  "Romania", "Russia", "Rwanda",
                  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
                  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
                  "Uganda", "Ukraine", "United Arab Emirates", "Uruguay", "Uzbekistan",
                  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
                  "Yemen", "Zambia", "Zimbabwe", "Other", "Prefer not to say"
                ].map(c => `<option value="${c}" ${existingDemo.countryOfOrigin === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>



          </div>

          <div id="intake-validation-msg" style="display: none; margin-top: 12px; padding: 10px; border-radius: 6px; font-size: 12px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171;"></div>

          <!-- Submit Action Button -->
          <div class="mt-4 pt-3 border-top d-flex justify-between align-center" style="border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
            <span class="text-muted fs-xs" style="font-size: 11px;"><i class="fa-solid fa-shield-halved text-success"></i> Demographic telemetry is stored completely anonymously.</span>
            <button type="button" id="btn-start-experiment" class="btn btn-primary" style="padding: 9px 24px; font-weight: 700; font-size: 13.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4); cursor: pointer;">
              Begin Experiment <i class="fa-solid fa-arrow-right" style="margin-left: 4px;"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    // Backward compatibility helper for legacy scripts
    if (typeof document !== 'undefined' && !document._intakeAliasInstalled) {
      document._intakeAliasInstalled = true;
      const origGet = document.getElementById.bind(document);
      document.getElementById = function(id) {
        if (id === 'intake-academic-standing') {
          return origGet('intake-education') || origGet('intake-academic-standing');
        }
        return origGet(id);
      };
    }

    const handleIntakeSubmit = () => {
      const ageElem = document.getElementById('intake-age');
      const genderElem = document.getElementById('intake-gender');
      const educationElem = document.getElementById('intake-education') || document.getElementById('intake-academic-standing');
      const codingElem = document.getElementById('intake-coding-exp');
      const dbElem = document.getElementById('intake-db-exp');
      const langElem = document.getElementById('intake-primary-language');
      const countryElem = document.getElementById('intake-country');

      const ageVal = ageElem ? ageElem.value.trim() : '';
      const genderVal = genderElem ? genderElem.value : '';
      const educationVal = educationElem ? educationElem.value : '';
      const codingVal = codingElem ? codingElem.value.trim() : '';
      const dbVal = dbElem ? dbElem.value.trim() : '';
      const langVal = langElem ? langElem.value : '';
      const countryVal = countryElem ? countryElem.value : '';

      const valMsg = document.getElementById('intake-validation-msg');

      if (!ageVal || !genderVal || !educationVal || codingVal === '' || dbVal === '' || !langVal || !countryVal) {
        if (valMsg) {
          valMsg.style.display = 'block';
          valMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Please complete all required demographic fields to begin the experiment.';
        }
        return;
      }

      if (parseInt(ageVal, 10) < 18) {
        if (valMsg) {
          valMsg.style.display = 'block';
          valMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> You must be at least 18 years old to participate in this study.';
        }
        return;
      }

      const numCoding = parseFloat(codingVal);
      const numDb = parseFloat(dbVal);
      if (isNaN(numCoding) || numCoding < 0 || isNaN(numDb) || numDb < 0) {
        if (valMsg) {
          valMsg.style.display = 'block';
          valMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Please enter a valid number of years (&ge; 0) for programming and database experience.';
        }
        return;
      }

      if (valMsg) valMsg.style.display = 'none';

      const genderNum = parseInt(genderVal, 10);
      const eduNum = parseInt(educationVal, 10);
      const genderLabels = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];
      const eduLabels = ['High School / GED', 'Some college / university', 'Associate Degree', 'Bachelor Degree', 'Masters Degree', 'Ph. D.', 'Other'];

      const data = {
        age: ageVal,
        gender: isNaN(genderNum) ? genderVal : genderNum,
        genderLabel: genderLabels[genderNum] || 'Other',
        education: isNaN(eduNum) ? educationVal : eduNum,
        educationLabel: eduLabels[eduNum] || 'Other',
        highestEducation: isNaN(eduNum) ? educationVal : eduNum,
        academicStanding: isNaN(eduNum) ? educationVal : eduNum, // backwards compatibility
        codingExp: codingVal,
        dbExp: dbVal,
        primaryLanguage: langVal,
        countryOfOrigin: countryVal,
        queryExp: 'Completed via updated survey', // backwards compatibility
        savedAtTimestamp: Date.now(),
        timestamp: new Date().toISOString()
      };

      if (this.app.analytics) {
        this.app.analytics.saveDemographics(data, pid);
      }

      this.intakeCompleted = true;
      this.app.loadIncrementalQuestion(1);
    };

    const btnStart = document.getElementById('btn-start-experiment');
    if (btnStart) {
      btnStart.addEventListener('click', handleIntakeSubmit);
    }
  }

  renderFinalThoughtsScreen() {
    this.currentQuestion = null;
    this.isAnswered = true;
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    const existingThoughtsObj = this.app.analytics ? this.app.analytics.getFinalThoughts() || {} : {};

    const pid = this.app.analytics ? this.app.analytics.participantId : 'user';

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 840px; margin: 15px auto; padding: 24px; background: rgba(18, 22, 34, 0.95); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div class="border-bottom pb-3 mb-3" style="border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 16px; margin-bottom: 20px;">
          <div class="logo-icon mb-2" style="width: 50px; height: 50px; font-size: 24px; margin: 0 0 10px 0; background: linear-gradient(135deg, #10b981, #06b6d4); box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); display: flex; align-items: center; justify-content: center; border-radius: 12px; color: #fff;">
            <i class="fa-solid fa-award"></i>
          </div>
          <h2 style="font-family: var(--font-title); font-size: 24px; color: #fff; margin: 0 0 4px 0;">Experiment Completed!</h2>
          <p class="text-muted fs-sm" style="font-size: 13px; margin: 4px 0 0 0; color: var(--text-muted);">Thank you for participating in this study! Your responses have been recorded successfully.</p>
        </div>

        <!-- Extra Credit Email Section (Stored in a totally separate file) -->
        <div id="extra-credit-card" class="card p-3 mb-4" style="background: rgba(99, 102, 241, 0.08); border: 1.5px solid rgba(99, 102, 241, 0.35); border-radius: 10px; margin-bottom: 24px; padding: 18px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(99, 102, 241, 0.2); display: flex; align-items: center; justify-content: center; color: var(--color-accent); font-size: 16px;">
              <i class="fa-solid fa-graduation-cap"></i>
            </div>
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: #fff; margin: 0;">Course Extra Credit</h3>
              <span style="font-size: 12px; color: var(--color-accent);">Enter your email address and course identifier to receive credit from your professor</span>
            </div>
          </div>

          <p style="font-size: 12.5px; color: var(--text-muted); margin: 0 0 14px 0; line-height: 1.5;">
            The email and course identifier you provide will be cross-referenced by your professor to receive your extra credit. To protect your confidentiality, <strong style="color: #fff;">this information is stored in a totally separate file and cannot be linked to your answers or study results</strong>.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-bottom: 12px;">
            <div>
              <label for="extra-credit-email-input" style="display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
                <i class="fa-solid fa-envelope text-accent"></i> Student Email
              </label>
              <input type="email" id="extra-credit-email-input" class="form-control" placeholder="student@university.edu" style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #fff; font-size: 13px;">
            </div>
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
                <i class="fa-solid fa-book-bookmark text-accent"></i> Course Number &amp; Identifier
              </label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1.1; min-width: 0;">
                  <input type="text" id="extra-credit-course-dept" class="form-control" placeholder="CS302" maxlength="12" style="width: 100%; padding: 10px 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #fff; font-size: 13.5px; font-family: monospace; font-weight: 700; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;" autocomplete="off" spellcheck="false" title="Course Code (e.g. CS302)">
                </div>
                <span style="font-size: 18px; font-weight: 700; color: #94a3b8; user-select: none; line-height: 1;">&minus;</span>
                <div style="flex: 1; min-width: 0;">
                  <input type="text" id="extra-credit-course-sec" class="form-control" placeholder="456" maxlength="12" style="width: 100%; padding: 10px 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #fff; font-size: 13.5px; font-family: monospace; font-weight: 700; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;" autocomplete="off" spellcheck="false" title="Identifier or Section (e.g. 456)">
                </div>
                <input type="hidden" id="extra-credit-course-input" value="">
              </div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 5px; display: flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-circle-info" style="font-size: 10px; color: var(--color-accent);"></i>
                <span>Examples: <strong style="color: #e2e8f0; font-family: monospace;">CS302-456</strong>, <strong style="color: #e2e8f0; font-family: monospace;">CS789-2341</strong>, <strong style="color: #e2e8f0; font-family: monospace;">CS130-1001</strong></span>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="button" id="btn-submit-extra-credit-email" class="btn btn-primary" style="padding: 10px 24px; font-weight: 700; font-size: 13px; border-radius: 8px; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35); cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-paper-plane"></i> Submit for Extra Credit
            </button>
          </div>

          <div id="extra-credit-email-feedback-msg" style="display: none; margin-top: 10px; padding: 10px 14px; border-radius: 6px; font-size: 12px;"></div>
        </div>


        <!-- Final Thoughts Form -->
        <div id="final-thoughts-form">
          <div class="form-group mb-3">
            <label for="final-thoughts-input" style="font-size: 13px; font-weight: 700; margin-bottom: 8px; display: block; color: var(--text-main);">
              <i class="fa-solid fa-comment-dots text-accent"></i> Share any final thoughts
            </label>
            <textarea id="final-thoughts-input" class="form-control" rows="4" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #fff; font-size: 13px; font-family: var(--font-sans); line-height: 1.5; resize: vertical;" placeholder="Add any feedback, observations, or reflections on the queries...">${this.escapeHTML(existingThoughtsObj.thoughts || '')}</textarea>
          </div>

          <div id="final-thoughts-feedback-msg" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 12px;"></div>

          <div class="d-flex justify-end align-center pt-3 border-top" style="border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end; align-items: center;">
            <button type="button" id="btn-submit-final-thoughts" class="btn btn-success" style="padding: 9px 22px; font-weight: 700; font-size: 13.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4); cursor: pointer;">
              <i class="fa-solid fa-paper-plane"></i> Save Thoughts
            </button>
          </div>
        </div>
      </div>
    `;


    const handleFinalThoughtsSave = () => {
      const inputElem = document.getElementById('final-thoughts-input');
      const thoughtsVal = inputElem ? inputElem.value.trim() : '';

      if (this.app.analytics) {
        this.app.analytics.saveFinalThoughts(thoughtsVal);
        if (typeof this.app.renderAnalyticsDashboard === 'function') {
          this.app.renderAnalyticsDashboard();
        }
      }

      const msgBox = document.getElementById('final-thoughts-feedback-msg');
      if (msgBox) {
        msgBox.style.display = 'block';
        msgBox.style.background = 'rgba(16, 185, 129, 0.15)';
        msgBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        msgBox.style.color = '#34d399';
        msgBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> Thank you! Your final thoughts have been saved successfully.';
      }
    };

    const btnSaveThoughts = document.getElementById('btn-submit-final-thoughts');
    if (btnSaveThoughts) {
      btnSaveThoughts.addEventListener('click', handleFinalThoughtsSave);
    }

    const emailInput = document.getElementById('extra-credit-email-input');
    const deptInput = document.getElementById('extra-credit-course-dept');
    const secInput = document.getElementById('extra-credit-course-sec');
    const courseInput = document.getElementById('extra-credit-course-input');

    const syncCourseValue = () => {
      const d = deptInput ? deptInput.value.trim().toUpperCase() : '';
      const s = secInput ? secInput.value.trim().toUpperCase() : '';
      const combined = (d && s) ? `${d}-${s}` : (d || s);
      if (courseInput) courseInput.value = combined;
      return combined;
    };

    if (emailInput && deptInput) {
      emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          deptInput.focus();
        }
      });
    }

    if (deptInput && secInput) {
      // Auto-jump to second box on hyphen, space, or enter
      deptInput.addEventListener('keydown', (e) => {
        if (e.key === '-' || e.key === ' ' || (e.key === 'Enter' && deptInput.value.trim())) {
          e.preventDefault();
          secInput.focus();
          secInput.select();
        }
      });

      // Split pasted full identifier (e.g. CS302-456 or CS789 2341)
      deptInput.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData)?.getData('text')?.trim();
        if (text && (text.includes('-') || text.includes(' '))) {
          e.preventDefault();
          const delim = text.includes('-') ? '-' : ' ';
          const parts = text.split(delim);
          deptInput.value = (parts[0] || '').trim().toUpperCase();
          secInput.value = parts.slice(1).join('-').trim().toUpperCase();
          syncCourseValue();
          secInput.focus();
        }
      });

      // Catch typing/IME hyphen in deptInput
      deptInput.addEventListener('input', () => {
        let val = deptInput.value;
        if (val.includes('-')) {
          const parts = val.split('-');
          deptInput.value = parts[0].trim().toUpperCase();
          if (parts[1]) {
            secInput.value = parts.slice(1).join('-').trim().toUpperCase();
          }
          syncCourseValue();
          secInput.focus();
        } else {
          deptInput.value = val.toUpperCase();
          syncCourseValue();
        }
      });

      // Navigate back to deptInput on backspace if secInput is empty
      secInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && secInput.selectionStart === 0 && secInput.selectionEnd === 0) {
          if (!secInput.value || secInput.value.length === 0) {
            e.preventDefault();
            deptInput.focus();
          }
        } else if (e.key === 'ArrowLeft' && secInput.selectionStart === 0 && secInput.selectionEnd === 0) {
          e.preventDefault();
          deptInput.focus();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleExtraCreditEmailSubmit();
        }
      });

      // Split pasted full identifier into both if pasted in secInput while dept is empty
      secInput.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData)?.getData('text')?.trim();
        if (text && text.includes('-')) {
          e.preventDefault();
          const parts = text.split('-');
          if (!deptInput.value.trim()) {
            deptInput.value = (parts[0] || '').trim().toUpperCase();
            secInput.value = parts.slice(1).join('-').trim().toUpperCase();
          } else {
            secInput.value = text.replace(/-/g, '').trim().toUpperCase();
          }
          syncCourseValue();
          secInput.focus();
        }
      });

      // Prevent hyphen in secInput
      secInput.addEventListener('input', () => {
        let val = secInput.value;
        if (val.includes('-')) {
          secInput.value = val.replace(/-/g, '').toUpperCase();
        } else {
          secInput.value = val.toUpperCase();
        }
        syncCourseValue();
      });
    }

    const handleExtraCreditEmailSubmit = async () => {
      const email = emailInput ? emailInput.value.trim() : '';
      const deptVal = deptInput ? deptInput.value.trim().toUpperCase() : '';
      const secVal = secInput ? secInput.value.trim().toUpperCase() : '';
      const course = (deptVal && secVal) ? `${deptVal}-${secVal}` : (courseInput ? courseInput.value.trim() : (deptVal || secVal));
      const feedbackMsg = document.getElementById('extra-credit-email-feedback-msg');

      if (!email || !email.includes('@') || !email.includes('.')) {
        if (feedbackMsg) {
          feedbackMsg.style.display = 'block';
          feedbackMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          feedbackMsg.style.color = '#f87171';
          feedbackMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Please enter a valid email address (e.g. student@university.edu).';
        }
        if (emailInput) emailInput.focus();
        return;
      }

      if (!deptVal || !secVal) {
        if (feedbackMsg) {
          feedbackMsg.style.display = 'block';
          feedbackMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          feedbackMsg.style.color = '#f87171';
          feedbackMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Please enter both the course number and identifier (e.g. CS302-456).';
        }
        if (!deptVal && deptInput) deptInput.focus();
        else if (!secVal && secInput) secInput.focus();
        return;
      }

      const btnSubmit = document.getElementById('btn-submit-extra-credit-email');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
      }

      try {
        const resp = await fetch('/api/save-extra-credit-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, course: course })
        });
        const result = await resp.json();
        if (resp.ok && result.status === 'success') {
          if (feedbackMsg) {
            feedbackMsg.style.display = 'block';
            feedbackMsg.style.background = 'rgba(16, 185, 129, 0.15)';
            feedbackMsg.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            feedbackMsg.style.color = '#34d399';
            feedbackMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> Thank you! Your email and course (${this.escapeHTML(course)}) have been recorded in the extra credit roster.`;
          }
          if (emailInput) emailInput.disabled = true;
          if (deptInput) deptInput.disabled = true;
          if (secInput) secInput.disabled = true;
          if (courseInput) courseInput.disabled = true;
          if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Submitted';
          try { localStorage.setItem('sql_study_extra_credit_submitted', 'true'); } catch(e) {}
          this.extraCreditSubmitted = true;
          if (typeof this.cleanupExtraCreditExitPrompt === 'function') {
            this.cleanupExtraCreditExitPrompt();
          }
        } else {
          throw new Error(result.message || 'Failed to submit extra credit details');
        }
      } catch (err) {
        // Fallback for offline or Google Apps Script sync
        if (this.app && this.app.analytics && this.app.analytics.cloudSyncUrl) {
          try {
            await fetch(this.app.analytics.cloudSyncUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'saveExtraCreditEmail', email: email, course: course })
            });
          } catch(e) {}
        }
        if (feedbackMsg) {
          feedbackMsg.style.display = 'block';
          feedbackMsg.style.background = 'rgba(16, 185, 129, 0.15)';
          feedbackMsg.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          feedbackMsg.style.color = '#34d399';
          feedbackMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> Thank you! Your email and course (${this.escapeHTML(course)}) have been recorded for extra credit.`;
        }
        if (emailInput) emailInput.disabled = true;
        if (deptInput) deptInput.disabled = true;
        if (secInput) secInput.disabled = true;
        if (courseInput) courseInput.disabled = true;
        if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Submitted';
        try { localStorage.setItem('sql_study_extra_credit_submitted', 'true'); } catch(e) {}
        this.extraCreditSubmitted = true;
        if (typeof this.cleanupExtraCreditExitPrompt === 'function') {
          this.cleanupExtraCreditExitPrompt();
        }
      }
    };

    const btnSubmitEmail = document.getElementById('btn-submit-extra-credit-email');
    if (btnSubmitEmail) {
      btnSubmitEmail.addEventListener('click', handleExtraCreditEmailSubmit);
    }

    this.setupExtraCreditExitPrompt();
  }

  setupExtraCreditExitPrompt() {
    if (typeof this.cleanupExtraCreditExitPrompt === 'function') {
      this.cleanupExtraCreditExitPrompt();
    }

    const isSubmitted = () => {
      try {
        if (localStorage.getItem('sql_study_extra_credit_submitted') === 'true') return true;
      } catch (e) {}
      return !!this.extraCreditSubmitted;
    };

    if (isSubmitted()) return;

    let exitPromptDismissed = false;

    // Create exit-intent reminder modal if it doesn't already exist
    let modalOverlay = document.getElementById('extra-credit-exit-modal');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'extra-credit-exit-modal';
      modalOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 16px;
      `;
      modalOverlay.innerHTML = `
        <div style="background: #181d2f; border: 1.5px solid rgba(99, 102, 241, 0.55); border-radius: 16px; max-width: 500px; width: 100%; padding: 28px 24px; box-shadow: 0 25px 60px rgba(0,0,0,0.85); text-align: center; position: relative;">
          <button type="button" id="btn-close-exit-modal-x" style="position: absolute; top: 12px; right: 16px; background: transparent; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 4px 8px; line-height: 1;" title="Close reminder">&times;</button>
          
          <div style="width: 58px; height: 58px; border-radius: 50%; background: rgba(99, 102, 241, 0.2); border: 2px solid rgba(99, 102, 241, 0.5); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #a5b4fc; font-size: 26px; box-shadow: 0 0 25px rgba(99, 102, 241, 0.4);">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          
          <h3 style="font-family: var(--font-title, sans-serif); font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 10px;">Don't Miss Your Course Extra Credit!</h3>
          
          <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.6; margin: 0 0 22px;">
            You haven't submitted your <strong>email and course identifier</strong> for extra credit yet. If you are completing this experiment for a course, please fill it out before closing this page so your instructor can grant you credit.
          </p>
          
          <div style="display: flex; flex-direction: column; gap: 10px; justify-content: center;">
            <button type="button" id="btn-modal-fill-credit" class="btn btn-primary" style="padding: 12px 22px; font-weight: 700; font-size: 14px; border-radius: 8px; box-shadow: 0 4px 18px rgba(99, 102, 241, 0.45); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
              <i class="fa-solid fa-pen-to-square"></i> Fill Out Extra Credit Form
            </button>
            <button type="button" id="btn-modal-dismiss-credit" class="btn" style="padding: 9px 18px; font-weight: 600; font-size: 12.5px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; cursor: pointer;">
              I Don't Need Credit / Close Anyway
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modalOverlay);
    }

    const showModal = () => {
      if (isSubmitted() || exitPromptDismissed) return;
      if (modalOverlay) {
        modalOverlay.style.display = 'flex';
      }
    };

    const hideModal = () => {
      if (modalOverlay) {
        modalOverlay.style.display = 'none';
      }
    };

    const btnFill = document.getElementById('btn-modal-fill-credit');
    if (btnFill) {
      btnFill.onclick = () => {
        hideModal();
        const card = document.getElementById('extra-credit-card');
        const emailInput = document.getElementById('extra-credit-email-input');
        const deptInput = document.getElementById('extra-credit-course-dept');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
          card.style.boxShadow = '0 0 30px rgba(99, 102, 241, 0.7)';
          card.style.borderColor = 'rgba(99, 102, 241, 0.8)';
          setTimeout(() => {
            if (card) {
              card.style.boxShadow = '';
              card.style.borderColor = 'rgba(99, 102, 241, 0.35)';
            }
          }, 2500);
        }
        if (emailInput && !emailInput.value.trim()) {
          setTimeout(() => emailInput.focus(), 350);
        } else if (deptInput) {
          setTimeout(() => deptInput.focus(), 350);
        }
      };
    }

    const btnDismiss = document.getElementById('btn-modal-dismiss-credit');
    if (btnDismiss) {
      btnDismiss.onclick = () => {
        exitPromptDismissed = true;
        hideModal();
      };
    }

    const btnX = document.getElementById('btn-close-exit-modal-x');
    if (btnX) {
      btnX.onclick = () => {
        hideModal();
      };
    }

    if (modalOverlay) {
      modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
          hideModal();
        }
      };
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        hideModal();
      }
    };

    // Exit intent: cursor moving towards browser tabs / window top to close
    const handleMouseLeave = (e) => {
      if (e.clientY <= 20 && !isSubmitted() && !exitPromptDismissed) {
        showModal();
      }
    };

    // Native browser tab/window close interception
    const handleBeforeUnload = (e) => {
      if (!isSubmitted() && !exitPromptDismissed) {
        e.preventDefault();
        e.returnValue = 'You have not submitted your course extra credit information yet. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    this.cleanupExtraCreditExitPrompt = () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      hideModal();
      if (modalOverlay && modalOverlay.parentNode) {
        modalOverlay.parentNode.removeChild(modalOverlay);
      }
      this.cleanupExtraCreditExitPrompt = null;
    };
  }

  startNewChallenge(schema, query, groundTruthResult, targetQNum) {
    if (!this.app.syntaxDialects || !this.app.quizGenerator) return;

    if (typeof this.cleanupExtraCreditExitPrompt === 'function' && targetQNum !== 'final_thoughts' && targetQNum <= 60) {
      this.cleanupExtraCreditExitPrompt();
    }

    const isParticipantPage = this.isParticipantView();

    if (targetQNum === 'consent') {
      this.renderConsentScreen();
      return;
    }

    if (this.isParticipantView() && !this.hasAcceptedConsent()) {
      this.renderConsentScreen();
      return;
    }

    if (targetQNum === 'intake') {
      this.intakeCompleted = false;
      this.renderIntakeScreen();
      return;
    }

    if (targetQNum === 'final_thoughts' || targetQNum > 60 || (this.stats && this.stats.totalAnswered >= 60 && !this.adminPreviewGroup)) {
      this.renderFinalThoughtsScreen();
      return;
    }

    if (this.isParticipantView() && !this.hasCompletedDemographics()) {
      this.intakeCompleted = false;
      this.renderIntakeScreen();
      return;
    } else {
      this.intakeCompleted = true;
    }

    const qNum = Math.min(60, Math.max(1, parseInt(targetQNum, 10) || (this.stats ? this.stats.totalAnswered + 1 : 1)));

    this.currentSchema = schema;
    this.currentRawQuery = query;
    if (groundTruthResult) {
      this.currentGroundTruth = groundTruthResult;
    }

    const assignedGroup = this.adminPreviewGroup || ((this.app.analytics && typeof this.app.analytics.getAssignedGroup === 'function')
      ? this.app.analytics.getAssignedGroup()
      : null);

    this.currentQuestion = this.app.quizGenerator.generateQuestion(
      query,
      schema,
      this.app.syntaxDialects,
      this.currentGroundTruth,
      assignedGroup
    );

    if (!this.currentQuestion) {
      console.warn('QuizGenerator returned null for query:', query);
      return;
    }

    this.currentQuestion.qNum = qNum;
    this.currentQuestion.startTime = Date.now();
    this.isAnswered = false;
    this.selectedOptionIndex = null;
    this.answerChangeCount = 0;
    const isFocused = document.hasFocus() && document.visibilityState !== 'hidden';
    this.focusMetrics = {
      tabFocusLost: !isFocused,
      tabSwitchCount: isFocused ? 0 : 1,
      totalFocusLostTimeMs: 0,
      lastBlurTime: isFocused ? null : Date.now()
    };

    this.renderQuizUI();
  }

  resetToFirstQuestion() {
    this.stats.totalAnswered = 0;
    this.isAnswered = false;
    this.selectedOptionIndex = null;
    this.answerChangeCount = 0;
    this.currentQuestion = null;
    this.intakeCompleted = false;
    this.setConsentAccepted(false);
    this.adminPreviewGroup = null;
    this.updateNavCounter();
  }

  switchDialect(dialectIdx) {
    if (!this.currentQuestion || !this.app.syntaxDialects || !this.app.quizGenerator) return;

    this.app.syntaxDialects.setCurrentDialectIndex(dialectIdx);
    const currentDialect = this.app.syntaxDialects.getCurrentDialect();
    const dialectSql = this.app.syntaxDialects.formatQueryToDialect(this.currentRawQuery, currentDialect.id);
    const hostLang = this.currentQuestion.hostLanguage || 'javascript';
    const code = this.app.quizGenerator.generateCodeSnippet(this.currentRawQuery, this.currentSchema, dialectSql, hostLang);

    this.currentQuestion.dialect = currentDialect;
    this.currentQuestion.dialectSql = dialectSql;
    this.currentQuestion.codeSnippet = code;
    this.currentQuestion.jsCode = code;

    this.renderQuizUI();
  }

  switchGroup(groupId) {
    if (!this.currentQuestion || !this.app.quizGenerator || !this.app.syntaxDialects) return;
    const group = (this.app.analytics && typeof this.app.analytics.getGroupById === 'function')
      ? this.app.analytics.getGroupById(groupId)
      : null;
    if (!group) return;

    this.adminPreviewGroup = group;
    if (this.app) this.app._adminPreviewGroupId = groupId;
    const dialect = this.app.syntaxDialects.availableDialects[group.sqlDialect] || this.app.syntaxDialects.availableDialects.pipe;
    const dialectSql = this.app.syntaxDialects.formatQueryToDialect(this.currentRawQuery, dialect.id);
    const code = this.app.quizGenerator.generateCodeSnippet(this.currentRawQuery, this.currentSchema, dialectSql, group.hostLanguage);

    this.currentQuestion.dialect = dialect;
    this.currentQuestion.dialectSql = dialectSql;
    this.currentQuestion.hostLanguage = group.hostLanguage;
    this.currentQuestion.assignedGroup = group.name;
    this.currentQuestion.assignedGroupId = group.id;
    this.currentQuestion.codeSnippet = code;
    this.currentQuestion.jsCode = code;

    this.renderQuizUI();
  }

  updateNavCounter() {
    const navElem = document.getElementById('nav-questions-counter');
    if (navElem) {
      const qNum = this.app.currentQuestionNumber;
      if (qNum === 'consent') {
        navElem.textContent = 'Information Sheet';
      } else if (qNum === 'intake') {
        navElem.textContent = 'Intake';
      } else if (qNum === 'final_thoughts') {
        navElem.textContent = 'Completed (60 / 60)';
      } else {
        navElem.textContent = `${qNum || 1} / 60`;
      }
    }
  }

  renderQuizUI() {
    const container = document.getElementById('human-challenge-container');
    if (!container || !this.currentQuestion) return;

    const q = this.currentQuestion;
    const qNum = (q && q.qNum) || this.app.currentQuestionNumber || 1;
    const bIdx = Math.floor((parseInt(qNum, 10) - 1) / 6) + 1;
    const vIdx = ((parseInt(qNum, 10) - 1) % 6) + 1;
    const activeDialects = this.app.syntaxDialects.getActiveDialects();
    const currentDialectIdx = this.app.syntaxDialects.currentSelectedDialectIndex;
    const isParticipantPage = this.isParticipantView();

    // Update navbar questions counter badge in Participant ID box
    this.updateNavCounter();

    container.innerHTML = `
      <div class="card quiz-card glow-card compact-view" style="padding: 0;">
        <div class="card-body p-2" style="display: flex; flex-direction: column; gap: 8px;">

          <!-- Instructions Banner Above Input Schema -->
          <div class="quiz-instructions-banner" style="padding: 10px 16px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-left: 4px solid var(--color-primary); border-radius: 6px; font-size: 11.5px; line-height: 1.6; color: #e2e8f0; display: flex; align-items: flex-start; gap: 10px; box-sizing: border-box;">
            <i class="fa-solid fa-circle-info text-accent" style="font-size: 13px; margin-top: 3px; flex-shrink: 0;"></i>
            <div style="flex: 1; min-width: 0;">
              Please read the query and choose what you believe the resulting table would look like using hotkeys <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 10.5px;">1</kbd>–<kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 10.5px;">4</kbd>, push <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 10.5px;">ENTER</kbd> to submit your answer, then push <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 10.5px;">ENTER</kbd> again to move to the next question. Alternatively, use your mouse to click between the four choices to answer.
              <span style="color: #fca5a5; font-weight: 600; margin-left: 6px; display: inline-block;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 4px;"></i>Do not use the back arrow or refresh button while doing this study.
              </span>
            </div>
          </div>
          
          <!-- 1. TOP FULL-WIDTH ROW: Input Schema Reference with Distinct Divider Line -->
          <div class="quiz-schema-top-bar p-2" style="border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 2px solid var(--color-accent); border-radius: 6px; background: rgba(14, 18, 28, 0.8); width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div class="d-flex justify-between align-center mb-1 pb-1" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
              <div class="d-flex align-center gap-2">
                <span class="badge" style="font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 4px; background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(99, 102, 241, 0.55); color: #c7d2fe; letter-spacing: 0.3px;">
                  <i class="fa-solid fa-cube"></i> Question ${qNum} / 60 <span style="opacity: 0.65; font-weight: 500;">(Block ${bIdx}.${vIdx})</span>
                </span>
                <strong style="color: var(--color-accent); font-size: 11px;"><i class="fa-solid fa-table-cells text-accent"></i> Input Schema Reference (${this.app.currentSchema ? this.app.currentSchema.tables.length : 0} Tables)</strong>
              </div>
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
                  <div class="group-tabs d-flex align-center gap-1 flex-wrap">
                    <span class="text-muted" style="font-size: 10px; margin-right: 2px;"><i class="fa-solid fa-layer-group"></i> Preview Group:</span>
                    ${(this.app.analytics && typeof this.app.analytics.getAllGroups === 'function' ? this.app.analytics.getAllGroups() : []).map(g => `
                      <button class="btn btn-sm group-tab ${((this.adminPreviewGroup && this.adminPreviewGroup.id === g.id) || (!this.adminPreviewGroup && q.assignedGroupId === g.id)) ? 'active' : ''}" data-group-id="${g.id}" style="padding: 1px 7px; font-size: 10px; border-radius: 4px;">
                        ${g.name}
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Coding Window: Displays all code lines at once with no scrolling required -->
              <div class="query-code-preview p-2" style="border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; background: rgba(10, 14, 26, 0.95); flex: 1; min-height: 350px; max-height: 380px; overflow: visible;">
                <pre style="margin: 0; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.45; color: #e2e8f0; white-space: pre-wrap; overflow: visible;"><code>${this.escapeHTML(q.codeSnippet || q.jsCode)}</code></pre>
              </div>
            </div>

            <!-- RIGHT COLUMN: Prompt + Answers (2x2 Grid) + Action Footer -->
            <div class="quiz-right-column" style="display: flex; flex-direction: column; gap: 8px;">
              
              <!-- Prompt Banner -->
              <div class="prompt-bar p-1 px-2 d-flex justify-between align-center" style="background: rgba(0,0,0,0.25); border-radius: 5px; border-left: 3px solid var(--color-accent);">
                <div class="d-flex align-center gap-2">
                  <span class="badge" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; font-weight: 700; font-size: 11px; padding: 1px 7px; border-radius: 4px;">
                    Q${qNum}
                  </span>
                  <span class="font-weight-bold fs-xs" style="color: var(--text-main); font-size: 11.5px;">
                    <i class="fa-solid fa-circle-question text-accent"></i> ${q.prompt}
                  </span>
                </div>
                <span class="text-muted fs-xs" style="font-size: 10.5px;">Select <strong>1–4</strong>, then press <kbd style="font-size: 9.5px; padding: 1px 4px;">ENTER</kbd></span>
              </div>

              <!-- 4 Candidate Output Tables (2x2 Grid Capped to NOT exceed Coding Box height) -->
              <div class="quiz-options-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 340px;">
                ${q.options.map((opt, idx) => `
                  <div class="quiz-option-card table-option-card" id="opt-btn-${idx}" data-idx="${idx}" style="cursor: pointer; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(18, 24, 38, 0.7); overflow: hidden; display: flex; flex-direction: column; max-height: 165px; transition: border-color 0.15s ease, background 0.15s ease;">
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

              <div class="quiz-footer" style="padding-top: 4px; margin-top: auto; display: flex; flex-direction: row; justify-content: space-between; align-items: center; flex-wrap: nowrap; gap: 8px; width: 100%; box-sizing: border-box;">
                <span class="text-muted fs-xs" style="font-size: 10px; white-space: nowrap; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">
                  <i class="fa-solid fa-circle-info"></i> Hotkeys: <strong>1–4</strong> | <kbd style="font-size: 9px; padding: 1px 4px;">ENTER</kbd> Submit / Next
                </span>
                <div style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap;">
                  <button id="btn-submit-answer" class="btn btn-primary btn-sm" disabled style="padding: 3px 10px; font-size: 11px; white-space: nowrap; margin: 0; display: inline-flex; align-items: center; gap: 4px;">
                    Submit Answer <i class="fa-solid fa-check"></i>
                  </button>
                  <button id="btn-next-question" class="btn btn-primary btn-sm" style="display: none; padding: 3px 10px; font-size: 11px; white-space: nowrap; margin: 0; align-items: center; gap: 4px;">
                    Next Question <i class="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
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

    // Submit answer button
    const btnSubmit = document.getElementById('btn-submit-answer');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => this.submitAnswer());
    }

    // Group preview selector buttons in Admin Mode
    document.querySelectorAll('.group-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const gid = e.currentTarget.dataset.groupId;
        if (this.app && typeof this.app.applyAdminGroup === 'function') {
          this.app.applyAdminGroup(gid);
        } else {
          this.switchGroup(gid);
        }
      });
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
    if (this.isParticipantView() && !this.hasCompletedDemographics()) {
      this.intakeCompleted = false;
      this.renderIntakeScreen();
      return;
    }
    if (this.isAnswered || !this.currentQuestion) return;
    if (this.app && (this.app.currentQuestionNumber === 'final_thoughts' || (this.stats && this.stats.totalAnswered >= 60))) {
      return;
    }

    if (this.selectedOptionIndex !== null && this.selectedOptionIndex !== index) {
      this.answerChangeCount = (this.answerChangeCount || 0) + 1;
    }

    this.selectedOptionIndex = index;
    const q = this.currentQuestion;

    // Highlight the selected option card, reset others, keep all interactive
    q.options.forEach((opt, idx) => {
      const card = document.getElementById(`opt-btn-${idx}`);
      const icon = document.getElementById(`opt-icon-${idx}`);
      if (!card) return;

      if (idx === index) {
        card.style.border = '2px solid var(--color-accent)';
        card.style.background = 'rgba(99, 102, 241, 0.2)';
        card.style.opacity = '1';
        if (icon) icon.innerHTML = '';
      } else {
        card.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        card.style.background = 'rgba(18, 24, 38, 0.7)';
        card.style.opacity = '1';
        if (icon) icon.innerHTML = '';
      }
    });

    // Enable the Submit button
    const btnSubmit = document.getElementById('btn-submit-answer');
    if (btnSubmit) {
      btnSubmit.removeAttribute('disabled');
    }

    // Update feedback box to indicate current selection & instructions to push ENTER or click Submit
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      feedbackBox.className = 'quiz-feedback-box p-1 px-2';
      feedbackBox.style.background = 'rgba(99, 102, 241, 0.12)';
      feedbackBox.style.border = '1px solid rgba(99, 102, 241, 0.3)';
      feedbackBox.style.color = '#e2e8f0';
      feedbackBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">
          <i class="fa-solid fa-hand-pointer text-accent" style="flex-shrink: 0; font-size: 11px;"></i>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            Selected: <strong>Option ${String.fromCharCode(65 + index)}</strong> &mdash; Push <kbd style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); border-radius: 3px; padding: 1px 5px; color: #fff; font-size: 10px;">ENTER</kbd> or click 'Submit Answer' to confirm.
          </span>
        </div>
      `;
    }
  }

  submitAnswer() {
    if (this.isAnswered || this.selectedOptionIndex === null || !this.currentQuestion) return;
    if (this.app && (this.app.currentQuestionNumber === 'final_thoughts' || (this.stats && this.stats.totalAnswered >= 60))) {
      return;
    }

    this.isAnswered = true;
    const index = this.selectedOptionIndex;
    const q = this.currentQuestion;
    const isCorrect = (index === q.correctIndex);
    const chosenOpt = q.options[index];
    const correctOpt = q.options[q.correctIndex];

    // Finalize focus loss duration
    if (this.focusMetrics.lastBlurTime) {
      const awayMs = Date.now() - this.focusMetrics.lastBlurTime;
      this.focusMetrics.totalFocusLostTimeMs += awayMs;
      this.focusMetrics.lastBlurTime = null;
    }

    // Log telemetry to analytics storage (stored persistently in localStorage)
    if (this.app.analytics) {
      const responseTimeMs = q.startTime ? (Date.now() - q.startTime) : 0;
      const curQ = this.app.currentQuestionNumber;
      const parsedQ = (typeof curQ === 'number') ? curQ : parseInt(curQ, 10);
      const currentQNum = (!isNaN(parsedQ) && parsedQ >= 1 && parsedQ <= 60)
        ? parsedQ
        : Math.min(60, (this.stats ? this.stats.totalAnswered + 1 : 1));

      const assignedGroup = (this.app.analytics && typeof this.app.analytics.getAssignedGroup === 'function')
        ? this.app.analytics.getAssignedGroup()
        : null;

      this.app.analytics.logResponse({
        questionNumber: currentQNum,
        questionCategory: q.type,
        assignedGroup: q.assignedGroup || (assignedGroup ? assignedGroup.name : 'Unknown'),
        assignedGroupId: q.assignedGroupId || (assignedGroup ? assignedGroup.id : 'unknown'),
        assignedGroupName: q.assignedGroup || (assignedGroup ? assignedGroup.name : 'Unknown'),
        hostLanguage: q.hostLanguage || (assignedGroup ? assignedGroup.hostLanguage : 'javascript'),
        activeDialect: q.dialect ? q.dialect.id : (assignedGroup ? assignedGroup.sqlDialect : 'pipe'),
        activeDialectName: q.dialect ? q.dialect.name : (assignedGroup && assignedGroup.sqlDialect === 'quorum' ? 'Quorum Syntax' : 'Google SQL (Pipe Syntax)'),
        codeSnippet: q.codeSnippet || q.jsCode || '',
        jsCode: q.codeSnippet || q.jsCode || '',
        dialectSql: q.dialectSql || q.rawQuery || '',
        rawQuery: q.rawQuery || '',
        selectedKey: index + 1,
        selectedOptionText: `Option ${String.fromCharCode(65 + index)} (${chosenOpt.rows.length} rows)`,
        correctOptionText: `Option ${String.fromCharCode(65 + q.correctIndex)} (${correctOpt.rows.length} rows)`,
        isCorrect: isCorrect ? 1 : 0,
        responseTimeMs: responseTimeMs,
        tabFocusLost: this.focusMetrics.tabFocusLost ? 1 : 0,
        tabSwitchCount: this.focusMetrics.tabSwitchCount,
        focusLostDurationMs: Math.round(this.focusMetrics.totalFocusLostTimeMs),
        answerChangeCount: this.answerChangeCount || 0
      });

      if (typeof this.app.renderAnalyticsDashboard === 'function') {
        this.app.renderAnalyticsDashboard();
      }
    }

    // Update stats counter & navbar counter AFTER logging response
    this.stats.totalAnswered++;
    this.updateNavCounter();

    // Lock option cards visually
    q.options.forEach((opt, idx) => {
      const card = document.getElementById(`opt-btn-${idx}`);
      const icon = document.getElementById(`opt-icon-${idx}`);
      if (!card) return;

      if (idx === index) {
        card.style.border = '2px solid #94a3b8';
        card.style.background = 'rgba(255, 255, 255, 0.1)';
        card.style.opacity = '1';
        if (icon) icon.innerHTML = '';
      } else {
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.background = 'rgba(18, 24, 38, 0.4)';
        card.style.opacity = '0.45';
        if (icon) icon.innerHTML = '';
      }
      card.style.cursor = 'default';
    });

    // Hide Submit button, show & enable Next Question button
    const btnSubmit = document.getElementById('btn-submit-answer');
    if (btnSubmit) {
      btnSubmit.style.display = 'none';
    }

    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) {
      btnNext.style.display = 'inline-flex';
      btnNext.removeAttribute('disabled');
      btnNext.focus();
    }

    // Show Feedback Box confirming answer submission
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) {
      feedbackBox.style.display = 'block';
      feedbackBox.className = 'quiz-feedback-box p-1 px-2';
      feedbackBox.style.background = 'rgba(255, 255, 255, 0.1)';
      feedbackBox.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      feedbackBox.style.color = '#cbd5e1';
      feedbackBox.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; white-space: nowrap; gap: 8px; line-height: 1.4;">
          <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
            <div class="fb-icon" style="font-size: 12px; color: #94a3b8;"><i class="fa-solid fa-circle-check"></i></div>
            <h4 class="m-0" style="font-size: 11px; color: #cbd5e1; white-space: nowrap; font-weight: 600;">Answer Recorded: Option ${String.fromCharCode(65 + index)}</h4>
          </div>
          <span class="text-muted" style="font-size: 10px; white-space: nowrap;">Push <kbd style="font-size: 9px; padding: 1px 4px; background: rgba(255,255,255,0.15); border-radius: 3px;">ENTER</kbd> to move to the next question</span>
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
        const rowVals = Array.isArray(row) ? row : columns.map(c => (row && row[c] !== undefined ? row[c] : null));
        rowVals.forEach(val => {
          const dispVal = (val === null || val === undefined) ? '<span class="text-muted">NULL</span>' : this.escapeHTML(val);
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
            <div class="d-flex justify-between align-center mb-1 pb-1" style="font-size: 10.5px; border-bottom: 1px solid rgba(255,255,255,0.06);">
              <strong style="color: var(--color-accent); font-family: var(--font-mono);">
                <i class="fa-solid fa-table text-primary"></i> ${tbl.name}
              </strong>
              <span class="text-muted" style="font-size: 9px;">(${tbl.rows.length} rows, ${tbl.columns.length} cols)</span>
            </div>
            <div class="col-badges mt-1" style="display: flex; flex-direction: column; gap: 3px; font-family: var(--font-mono);">
              ${tbl.columns.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.07); font-size: 9.5px;">
                  <span>${c.pk ? '🔑 ' : ''}<strong>${c.name}</strong></span>
                  <span style="color: var(--color-primary); font-size: 8.5px; margin-left: 6px;">${c.type}</span>
                </div>
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
