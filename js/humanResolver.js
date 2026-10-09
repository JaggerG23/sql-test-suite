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

      // Block answering shortcuts if test is finished or at static info/survey pages
      const staticPages = ['consent', 'intake', 'training_intro', 'training_complete', 'final_thoughts', 'extra_credit', 'thank_you'];
      if (!this.currentQuestion || (this.app && staticPages.includes(this.app.currentQuestionNumber))) {
        return;
      }
      if (!this.isTrainingChallenge && this.stats && this.stats.totalAnswered >= 60) {
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
              <i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px; color: #ef4444;"></i> 1. Do not use the back arrow or refresh button while doing this study. <br> 2. This study should be completed on a desktop or laptop computer as it is not optimized for phones or tablets.
            </div>

            <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.35); border-left: 4px solid var(--color-primary); border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px; color: #e2e8f0; font-weight: 500; line-height: 1.5;">
              <strong style="color: var(--color-accent);"><i class="fa-solid fa-graduation-cap" style="margin-right: 6px; color: var(--color-accent); font-size: 14px;"></i> Course Extra Credit:</strong> You will be able to enter your student email address and course section ID at the end of this study. To protect your confidentiality, your email address is stored in a completely separate file with zero connection to your study answers.
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
      this.app.loadIncrementalQuestion('training_intro');
    };

    const btnStart = document.getElementById('btn-start-experiment');
    if (btnStart) {
      btnStart.addEventListener('click', handleIntakeSubmit);
    }
  }

  renderTrainingIntroScreen() {
    this.currentQuestion = null;
    this.isAnswered = true;
    this.isTrainingChallenge = false;
    this.trainingQuestionNumber = null;
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 820px; margin: 20px auto; padding: 32px 28px; background: rgba(18, 22, 34, 0.96); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 14px; box-shadow: 0 16px 50px rgba(0,0,0,0.6);">
        
        <!-- Header -->
        <div class="border-bottom pb-3 mb-3" style="border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 18px; margin-bottom: 22px;">
          <div class="logo-icon mb-2" style="width: 54px; height: 54px; font-size: 26px; margin: 0 0 12px 0; background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 0 25px rgba(245, 158, 11, 0.45); display: flex; align-items: center; justify-content: center; border-radius: 14px; color: #fff;">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <span class="badge-training mb-2"><i class="fa-solid fa-graduation-cap"></i> Practice Phase</span>
          <h2 style="font-family: var(--font-title); font-size: 26px; color: #fff; margin: 6px 0 6px 0;">Get Ready for Training!</h2>
          <p class="text-muted fs-sm" style="font-size: 13.5px; margin: 0; color: #cbd5e1; max-width: 620px; line-height: 1.5;">
            Before you begin, you will complete a <strong>10-question practice phase</strong> to familiarize yourself with the layout of the study.
          </p>
        </div>

        <!-- Highlight cards -->
        <div class="training-info-grid">
          <div class="training-info-box">
            <h4><i class="fa-solid fa-list-ol text-accent"></i> 10 Practice Questions</h4>
            <p>You will see 10 questions with the same structure as the official study: database schema tables, code snippet, and four candidate output tables.</p>
          </div>
          <div class="training-info-box">
            <h4><i class="fa-solid fa-keyboard text-accent"></i> Easy Controls</h4>
            <p>Use keys <kbd>1</kbd>–<kbd>4</kbd> (or click) to choose your answer, press <kbd>ENTER</kbd> to submit, then press <kbd>ENTER</kbd> again to move to the next question.</p>
          </div>
        </div>

        <!-- Notice banner -->
        <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 12.5px; color: #cbd5e1; display: flex; align-items: center; gap: 10px;">
          <i class="fa-solid fa-circle-info text-accent" style="font-size: 16px; flex-shrink: 0;"></i>
          <span>Once you finish the training questions, you will see a screen before you begin the 60-question study.</span>
        </div>

        <div style="text-align: center;">
          <button type="button" id="btn-start-training" class="btn btn-primary" style="padding: 12px 36px; font-weight: 700; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 20px rgba(99, 102, 241, 0.45); cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <span>Start Training Phase (10 Questions)</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;

    const btnStart = document.getElementById('btn-start-training');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        this.app.loadIncrementalQuestion('training:1');
      });
    }
  }

  renderTrainingCompleteScreen() {
    this.currentQuestion = null;
    this.isAnswered = true;
    this.isTrainingChallenge = false;
    this.trainingQuestionNumber = null;
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 820px; margin: 20px auto; padding: 34px 28px; background: rgba(18, 22, 34, 0.96); border: 1.5px solid rgba(16, 185, 129, 0.45); border-radius: 14px; box-shadow: 0 16px 50px rgba(0,0,0,0.6);">
        
        <!-- Header -->
        <div class="border-bottom pb-3 mb-3" style="border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 18px; margin-bottom: 22px;">
          <div class="logo-icon mb-2" style="width: 58px; height: 58px; font-size: 28px; margin: 0 0 12px 0; background: linear-gradient(135deg, #10b981, #06b6d4); box-shadow: 0 0 25px rgba(16, 185, 129, 0.45); display: flex; align-items: center; justify-content: center; border-radius: 14px; color: #fff;">
            <i class="fa-solid fa-flag-checkered"></i>
          </div>
          <span class="badge" style="background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.45); color: #34d399; font-weight: 700; font-size: 11px; padding: 2px 9px; border-radius: 4px; margin-bottom: 8px;">
            <i class="fa-solid fa-circle-check"></i> Practice Completed
          </span>
          <h2 style="font-family: var(--font-title); font-size: 26px; color: #fff; margin: 4px 0 6px 0;">Training Finished!</h2>
          <p class="text-muted fs-sm" style="font-size: 14px; margin: 0; color: #cbd5e1; max-width: 620px; line-height: 1.55;">
            You have successfully completed all 10 practice questions. You are now familiar with the interface and are ready to begin the official study.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-bottom: 24px;">
          <div style="background: rgba(14, 18, 28, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 16px;">
            <h4 style="font-size: 13px; font-weight: 700; color: #34d399; margin: 0 0 6px; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-list-check"></i> Official Study: 60 Questions
            </h4>
            <p style="font-size: 12.5px; color: #94a3b8; line-height: 1.5; margin: 0;">
              The study consists of 60 questions following the exact same format as the practice questions. Your progress is displayed in the top bar as you answer each question.
            </p>
          </div>
          <div style="background: rgba(14, 18, 28, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 16px;">
            <h4 style="font-size: 13px; font-weight: 700; color: #f59e0b; margin: 0 0 6px; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-triangle-exclamation"></i> Important Reminder
            </h4>
            <p style="font-size: 12.5px; color: #94a3b8; line-height: 1.5; margin: 0;">
              Take your time on each question. Please do not refresh the page or use the browser back button while completing the study.
            </p>
          </div>
        </div>

        <div style="text-align: center;">
          <button type="button" id="btn-start-study" class="btn btn-success" style="padding: 13px 40px; font-weight: 700; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 22px rgba(16, 185, 129, 0.45); cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <span>Begin Official Study (Question 1)</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;

    const btnStartStudy = document.getElementById('btn-start-study');
    if (btnStartStudy) {
      btnStartStudy.addEventListener('click', () => {
        this.app.loadIncrementalQuestion(1);
      });
    }
  }

  renderFinalThoughtsScreen() {
    this.currentQuestion = null;
    this.isAnswered = true;
    this.isTrainingChallenge = false;
    this.trainingQuestionNumber = null;
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    const existingThoughtsObj = this.app.analytics ? this.app.analytics.getFinalThoughts() || {} : {};
    const existingRatings = existingThoughtsObj.likertRatings || {};
    const pid = this.app.analytics ? this.app.analytics.participantId : 'user';

    const likertQuestions = [
      { id: 'likert_clarity', num: 1, text: 'The instructions and question prompts were clear and easy to understand.' },
      { id: 'likert_difficulty', num: 2, text: 'The study required a lot of mental thinking to complete.' },
      { id: 'likert_interface', num: 3, text: 'The user interface was easy to use.' },
      { id: 'likert_experience', num: 4, text: 'Overall, I had a positive experience participating in this study.' }
    ];

    const scaleOptions = [
      { val: 1, label: 'Strongly Disagree' },
      { val: 2, label: 'Disagree' },
      { val: 3, label: 'Neutral' },
      { val: 4, label: 'Agree' },
      { val: 5, label: 'Strongly Agree' }
    ];

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 860px; margin: 15px auto; padding: 26px 28px; background: rgba(18, 22, 34, 0.95); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div class="border-bottom pb-3 mb-3" style="border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 16px; margin-bottom: 22px;">
          <div class="logo-icon mb-2" style="width: 50px; height: 50px; font-size: 24px; margin: 0 0 10px 0; background: linear-gradient(135deg, #10b981, #06b6d4); box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); display: flex; align-items: center; justify-content: center; border-radius: 12px; color: #fff;">
            <i class="fa-solid fa-award"></i>
          </div>
          <h2 style="font-family: var(--font-title); font-size: 24px; color: #fff; margin: 0 0 4px 0;">Study Completed &mdash; Final Thoughts</h2>
          <p class="text-muted fs-sm" style="font-size: 13.5px; margin: 4px 0 0 0; color: #cbd5e1;">
            Thank you for completing all 60 questions! Please let us know what you thought of the study by rating the statements below.
          </p>
        </div>

        <!-- Likert Questions -->
        <div class="likert-group">
          ${likertQuestions.map(q => `
            <div class="likert-card" id="card-${q.id}">
              <div class="likert-statement">
                <span class="likert-statement-num">${q.num}</span>
                <span>${q.text} <span style="color: #f87171;">*</span></span>
              </div>
              <div class="likert-scale">
                ${scaleOptions.map(opt => `
                  <label class="likert-option-wrapper" style="position: relative; display: block; margin: 0;">
                    <input type="radio" name="${q.id}" value="${opt.val}" class="likert-option-input" ${existingRatings[q.id] == opt.val ? 'checked' : ''}>
                    <div class="likert-option-label">
                      <span class="likert-option-num">${opt.val}</span>
                      <span class="likert-option-text">${opt.label}</span>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Additional Thoughts & Comments Textarea -->
        <div class="form-group mb-4" style="margin-bottom: 22px;">
          <label for="final-thoughts-input" style="font-size: 13px; font-weight: 700; margin-bottom: 8px; display: block; color: var(--text-main);">
            <i class="fa-solid fa-comment-dots text-accent"></i> Additional Comments &amp; Reflections (Optional)
          </label>
          <textarea id="final-thoughts-input" class="form-control" rows="3" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #fff; font-size: 13px; font-family: var(--font-sans); line-height: 1.5; resize: vertical;" placeholder="Add any feedback, observations, or reflections on the queries or study...">${this.escapeHTML(existingThoughtsObj.thoughts || '')}</textarea>
        </div>

        <!-- Validation message -->
        <div id="likert-val-msg" style="display: none; padding: 10px 14px; border-radius: 6px; font-size: 12.5px; margin-bottom: 16px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171;"></div>

        <!-- Actions -->
        <div class="d-flex justify-between align-center pt-3 border-top" style="border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <span style="font-size: 12px; color: #94a3b8;">
            <i class="fa-solid fa-circle-info text-accent"></i> All Likert items above are required to proceed to extra credit.
          </span>
          <button type="button" id="btn-submit-final-thoughts" class="btn btn-primary" style="padding: 11px 28px; font-weight: 700; font-size: 14px; border-radius: 8px; box-shadow: 0 4px 18px rgba(99, 102, 241, 0.45); cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <span>Continue to Extra Credit</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;

    // Clear error border on radio selection
    likertQuestions.forEach(q => {
      const inputs = document.querySelectorAll(`input[name="${q.id}"]`);
      inputs.forEach(inp => {
        inp.addEventListener('change', () => {
          const card = document.getElementById(`card-${q.id}`);
          if (card) card.classList.remove('has-error');
          const valMsg = document.getElementById('likert-val-msg');
          if (valMsg) valMsg.style.display = 'none';
        });
      });
    });

    const btnSubmit = document.getElementById('btn-submit-final-thoughts');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        const valMsg = document.getElementById('likert-val-msg');
        let hasMissing = false;
        const ratings = {};

        likertQuestions.forEach(q => {
          const selected = document.querySelector(`input[name="${q.id}"]:checked`);
          const card = document.getElementById(`card-${q.id}`);
          if (!selected) {
            hasMissing = true;
            if (card) card.classList.add('has-error');
          } else {
            ratings[q.id] = parseInt(selected.value, 10);
            if (card) card.classList.remove('has-error');
          }
        });

        if (hasMissing) {
          if (valMsg) {
            valMsg.style.display = 'block';
            valMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Please answer all Likert scale statements above to continue.';
          }
          const firstErr = document.querySelector('.likert-card.has-error');
          if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        if (valMsg) valMsg.style.display = 'none';

        const thoughtsInput = document.getElementById('final-thoughts-input');
        const thoughtsVal = thoughtsInput ? thoughtsInput.value.trim() : '';

        if (this.app && this.app.analytics) {
          this.app.analytics.saveFinalThoughts({ ratings, thoughts: thoughtsVal });
          if (typeof this.app.renderAnalyticsDashboard === 'function') {
            this.app.renderAnalyticsDashboard();
          }
        }

        try {
          localStorage.setItem('sql_study_final_thoughts_done_' + pid, 'true');
        } catch (e) {}

        this.app.loadIncrementalQuestion('extra_credit');
      });
    }
  }

  renderExtraCreditScreen() {
    this.currentQuestion = null;
    this.isAnswered = true;
    this.isTrainingChallenge = false;
    this.trainingQuestionNumber = null;
    this.updateNavCounter();
    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 800px; margin: 20px auto; padding: 32px 28px; background: rgba(18, 22, 34, 0.96); border: 1.5px solid rgba(99, 102, 241, 0.45); border-radius: 14px; box-shadow: 0 16px 50px rgba(0,0,0,0.6);">
        
        <!-- Header -->
        <div class="border-bottom pb-3 mb-3" style="border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 16px; margin-bottom: 22px;">
          <div class="logo-icon mb-2" style="width: 52px; height: 52px; font-size: 26px; margin: 0 0 10px 0; background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 0 25px rgba(99, 102, 241, 0.5); display: flex; align-items: center; justify-content: center; border-radius: 12px; color: #fff;">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <h2 style="font-family: var(--font-title); font-size: 24px; color: #fff; margin: 0 0 4px 0;">Course Extra Credit</h2>
          <p class="text-muted fs-sm" style="font-size: 13.5px; margin: 4px 0 0 0; color: #cbd5e1;">
            Enter your student email and course identifier to receive extra credit from your professor.
          </p>
        </div>

        <!-- Confidentiality Notice -->
        <div style="background: rgba(99, 102, 241, 0.1); border: 1.5px solid rgba(99, 102, 241, 0.35); border-radius: 10px; padding: 14px 18px; margin-bottom: 22px; font-size: 12.5px; color: #cbd5e1; line-height: 1.5;">
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <i class="fa-solid fa-shield-halved text-accent" style="font-size: 16px; margin-top: 2px; flex-shrink: 0;"></i>
            <div>
              <strong style="color: #fff;">Confidentiality Protection:</strong>
              The email and course identifier you provide will be cross-referenced by your professor to grant credit. To protect your confidentiality, <strong style="color: #a5b4fc;">this information is stored in a completely separate file with zero linkage to your answers or study results</strong>.
            </div>
          </div>
        </div>

        <!-- Input Fields -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 16px;">
          <div>
            <label for="extra-credit-email-input" style="display: block; font-size: 12.5px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
              <i class="fa-solid fa-envelope text-accent"></i> Student University Email
            </label>
            <input type="email" id="extra-credit-email-input" class="form-control" placeholder="student@university.edu" style="width: 100%; padding: 11px 14px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #fff; font-size: 13.5px;">
          </div>
          <div>
            <label style="display: block; font-size: 12.5px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px;">
              <i class="fa-solid fa-book-bookmark text-accent"></i> Course Number &amp; Section / Identifier
            </label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1.1; min-width: 0;">
                <input type="text" id="extra-credit-course-dept" class="form-control" placeholder="CS302" maxlength="12" style="width: 100%; padding: 11px 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #fff; font-size: 13.5px; font-family: monospace; font-weight: 700; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;" autocomplete="off" spellcheck="false" title="Course Code (e.g. CS302)">
              </div>
              <span style="font-size: 18px; font-weight: 700; color: #94a3b8; user-select: none; line-height: 1;">&minus;</span>
              <div style="flex: 1; min-width: 0;">
                <input type="text" id="extra-credit-course-sec" class="form-control" placeholder="456" maxlength="12" style="width: 100%; padding: 11px 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #fff; font-size: 13.5px; font-family: monospace; font-weight: 700; text-transform: uppercase; text-align: center; letter-spacing: 0.5px;" autocomplete="off" spellcheck="false" title="Identifier or Section (e.g. 456)">
              </div>
              <input type="hidden" id="extra-credit-course-input" value="">
            </div>
            <div style="font-size: 11.5px; color: #94a3b8; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-circle-info" style="font-size: 10.5px; color: var(--color-accent);"></i>
              <span>Examples: <strong style="color: #e2e8f0; font-family: monospace;">CS302-456</strong>, <strong style="color: #e2e8f0; font-family: monospace;">CS789-2341</strong>, <strong style="color: #e2e8f0; font-family: monospace;">CS130-1001</strong></span>
            </div>
          </div>
        </div>

        <div id="finish-validation-hint" style="font-size: 12.5px; color: #f59e0b; display: flex; align-items: center; gap: 6px; margin-bottom: 22px; padding: 8px 12px; background: rgba(245, 158, 11, 0.1); border-radius: 6px;">
          <i class="fa-solid fa-lock" style="font-size: 11px;"></i>
          <span>Enter your email, course number, and section above to enable Finish.</span>
        </div>

        <!-- Action Buttons -->
        <div class="pt-3 border-top" style="border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end; align-items: center; gap: 12px;">
          <button type="button" id="btn-finish-study" class="btn btn-success" disabled style="padding: 11px 32px; font-weight: 700; font-size: 14px; border-radius: 8px; box-shadow: 0 4px 18px rgba(16, 185, 129, 0.25); cursor: not-allowed; opacity: 0.55; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease;">
            <span>Submit Extra Credit &amp; Finish</span>
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    `;

    const emailInput = document.getElementById('extra-credit-email-input');
    const deptInput = document.getElementById('extra-credit-course-dept');
    const secInput = document.getElementById('extra-credit-course-sec');
    const courseInput = document.getElementById('extra-credit-course-input');
    const btnFinish = document.getElementById('btn-finish-study');
    const finishHint = document.getElementById('finish-validation-hint');

    const isValidEmail = (str) => {
      if (!str) return false;
      const s = str.trim();
      return s.length >= 5 && s.includes('@') && s.includes('.') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    };

    const validateFinishFields = () => {
      const email = emailInput ? emailInput.value.trim() : '';
      const dept = deptInput ? deptInput.value.trim() : '';
      const sec = secInput ? secInput.value.trim() : '';

      const emailValid = isValidEmail(email);
      const deptValid = dept.length > 0;
      const secValid = sec.length > 0;
      const isAllValid = emailValid && deptValid && secValid;

      if (btnFinish) {
        btnFinish.disabled = !isAllValid;
        if (isAllValid) {
          btnFinish.style.opacity = '1';
          btnFinish.style.cursor = 'pointer';
          btnFinish.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.5)';
        } else {
          btnFinish.style.opacity = '0.55';
          btnFinish.style.cursor = 'not-allowed';
          btnFinish.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.25)';
        }
      }

      if (finishHint) {
        if (isAllValid) {
          finishHint.style.color = '#34d399';
          finishHint.style.background = 'rgba(16, 185, 129, 0.1)';
          finishHint.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Ready to submit. Click button below to complete.</span>';
        } else {
          const missing = [];
          if (!emailValid) missing.push('email');
          if (!deptValid) missing.push('course number');
          if (!secValid) missing.push('section');
          finishHint.style.color = '#f59e0b';
          finishHint.style.background = 'rgba(245, 158, 11, 0.1)';
          finishHint.innerHTML = `<i class="fa-solid fa-lock" style="font-size: 11px;"></i> <span>Please fill out your ${missing.join(', ')} above to finish.</span>`;
        }
      }

      return isAllValid;
    };

    const syncCourseValue = () => {
      const d = deptInput ? deptInput.value.trim().toUpperCase() : '';
      const s = secInput ? secInput.value.trim().toUpperCase() : '';
      const combined = (d && s) ? `${d}-${s}` : (d || s);
      if (courseInput) courseInput.value = combined;
      return combined;
    };

    if (emailInput) {
      emailInput.addEventListener('input', validateFinishFields);
      if (deptInput) {
        emailInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            deptInput.focus();
          }
        });
      }
    }

    if (deptInput && secInput) {
      deptInput.addEventListener('keydown', (e) => {
        if (e.key === '-' || e.key === ' ' || (e.key === 'Enter' && deptInput.value.trim())) {
          e.preventDefault();
          secInput.focus();
          secInput.select();
        }
      });

      deptInput.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData)?.getData('text')?.trim();
        if (text && (text.includes('-') || text.includes(' '))) {
          e.preventDefault();
          const delim = text.includes('-') ? '-' : ' ';
          const parts = text.split(delim);
          deptInput.value = (parts[0] || '').trim().toUpperCase();
          secInput.value = parts.slice(1).join('-').trim().toUpperCase();
          syncCourseValue();
          validateFinishFields();
          secInput.focus();
        }
      });

      deptInput.addEventListener('input', () => {
        let val = deptInput.value;
        if (val.includes('-')) {
          const parts = val.split('-');
          deptInput.value = parts[0].trim().toUpperCase();
          if (parts[1]) {
            secInput.value = parts.slice(1).join('-').trim().toUpperCase();
          }
          syncCourseValue();
          validateFinishFields();
          secInput.focus();
        } else {
          deptInput.value = val.toUpperCase();
          syncCourseValue();
          validateFinishFields();
        }
      });

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
          if (validateFinishFields()) {
            handleFinishClick();
          }
        }
      });

      secInput.addEventListener('input', () => {
        let val = secInput.value;
        if (val.includes('-')) {
          secInput.value = val.replace(/-/g, '').toUpperCase();
        } else {
          secInput.value = val.toUpperCase();
        }
        syncCourseValue();
        validateFinishFields();
      });
    }

    const handleFinishClick = async () => {
      if (!validateFinishFields()) return;

      const email = emailInput ? emailInput.value.trim() : '';
      const deptVal = deptInput ? deptInput.value.trim().toUpperCase() : '';
      const secVal = secInput ? secInput.value.trim().toUpperCase() : '';
      const course = `${deptVal}-${secVal}`;

      if (btnFinish) {
        btnFinish.disabled = true;
        btnFinish.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
      }

      try {
        const resp = await fetch('/api/save-extra-credit-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, course: course })
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok && result.status !== 'success') {
          throw new Error(result.message || 'Failed to submit extra credit details');
        }
      } catch (err) {
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
      }

      try {
        localStorage.setItem('sql_study_extra_credit_submitted', 'true');
        localStorage.setItem('sql_study_completed_finished', 'true');
        localStorage.setItem('sql_study_final_email', email);
        localStorage.setItem('sql_study_final_course', course);
      } catch(e) {}

      this.extraCreditSubmitted = true;
      this.studyCompletedSuccessfully = true;

      if (this.app && typeof this.app.loadIncrementalQuestion === 'function') {
        this.app.loadIncrementalQuestion('thank_you');
      } else {
        this.renderThankYouScreen(email, course);
      }
    };

    if (btnFinish) {
      btnFinish.addEventListener('click', handleFinishClick);
    }

    validateFinishFields();
  }

  renderThankYouScreen(emailParam, courseParam) {
    if (this.app) {
      this.app.currentQuestionNumber = 'thank_you';
    }
    this.currentQuestion = null;
    this.isAnswered = true;
    this.isTrainingChallenge = false;
    this.trainingQuestionNumber = null;
    this.studyCompletedSuccessfully = true;
    this.extraCreditSubmitted = true;
    this.updateNavCounter();

    const container = document.getElementById('human-challenge-container');
    if (!container) return;

    let email = emailParam;
    let course = courseParam;
    try {
      if (!email) email = localStorage.getItem('sql_study_final_email') || '';
      if (!course) course = localStorage.getItem('sql_study_final_course') || '';
    } catch(e) {}

    container.innerHTML = `
      <div class="card quiz-card glow-card" style="max-width: 760px; margin: 30px auto; padding: 44px 36px; background: rgba(18, 22, 34, 0.96); border: 2px solid rgba(16, 185, 129, 0.45); border-radius: 16px; box-shadow: 0 16px 50px rgba(0, 0, 0, 0.65); text-align: center; color: #f1f5f9; backdrop-filter: blur(16px);">
        
        <!-- Big celebration badge -->
        <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2)); border: 2px solid rgba(16, 185, 129, 0.65); display: flex; align-items: center; justify-content: center; margin: 0 auto 22px; color: #34d399; font-size: 40px; box-shadow: 0 0 35px rgba(16, 185, 129, 0.45);">
          <i class="fa-solid fa-circle-check"></i>
        </div>

        <h2 style="font-family: var(--font-title, sans-serif); font-size: 30px; font-weight: 700; color: #ffffff; margin: 0 0 10px 0; letter-spacing: -0.5px;">
          Thank You!
        </h2>

        <p style="font-size: 15.5px; color: #cbd5e1; margin: 0 0 28px 0; line-height: 1.6;">
          Thank you for participating in this research study. Your responses and feedback have been recorded successfully.
        </p>

        ${email ? `
        <!-- Extra credit confirmation box -->
        <div style="background: rgba(16, 185, 129, 0.08); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 18px 22px; margin-bottom: 26px; text-align: left;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: #34d399; font-weight: 700; font-size: 13.5px;">
            <i class="fa-solid fa-graduation-cap"></i> Extra Credit Information Recorded
          </div>
          <p style="font-size: 13px; color: #e2e8f0; margin: 0 0 6px 0; line-height: 1.5;">
            <strong>Email:</strong> ${this.escapeHTML(email)} &nbsp;&bull;&nbsp; <strong>Course Identifier:</strong> ${this.escapeHTML(course || 'N/A')}
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.4;">
            This information has been saved for your instructor. In accordance with UNLV research guidelines, it is stored separately from your experimental answers.
          </p>
        </div>
        ` : ''}

        <!-- Instruction to close the study -->
        <div style="background: rgba(99, 102, 241, 0.12); border: 1.5px solid rgba(99, 102, 241, 0.35); border-radius: 12px; padding: 22px 24px; margin-bottom: 28px; text-align: center;">
          <p style="font-size: 18px; font-weight: 700; color: #ffffff; margin: 0 0 6px 0; line-height: 1.4;">
            <i class="fa-solid fa-circle-xmark" style="color: var(--color-accent); margin-right: 8px;"></i>
            You can now close the study.
          </p>
          <p style="font-size: 13.5px; color: #cbd5e1; margin: 0; line-height: 1.5;">
            You may now safely close this browser window or tab.
          </p>
        </div>

        <div>
          <button type="button" id="btn-close-study-tab" class="btn" style="padding: 11px 30px; font-size: 14px; font-weight: 600; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #f1f5f9; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease;">
            <i class="fa-solid fa-xmark"></i> Close Study Window
          </button>
        </div>
      </div>
    `;

    const btnClose = document.getElementById('btn-close-study-tab');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        window.close();
        setTimeout(() => {
          btnClose.innerHTML = '<i class="fa-solid fa-circle-info"></i> Please close this browser tab manually';
          btnClose.style.opacity = '0.7';
          btnClose.disabled = true;
        }, 300);
      });
    }
  }

  setupExtraCreditExitPrompt() {
    // All exit modal popup reminder functionality removed as requested
  }

  cleanupExtraCreditExitPrompt() {
    // Safe no-op
  }

  startNewChallenge(schema, query, groundTruthResult, targetQNum) {
    if (!this.app.syntaxDialects || !this.app.quizGenerator) return;

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

    if (this.isParticipantView() && !this.hasCompletedDemographics()) {
      this.intakeCompleted = false;
      this.renderIntakeScreen();
      return;
    } else {
      this.intakeCompleted = true;
    }

    if (targetQNum === 'training_intro') {
      this.renderTrainingIntroScreen();
      return;
    }

    if (targetQNum === 'training_complete') {
      this.renderTrainingCompleteScreen();
      return;
    }

    if (targetQNum === 'extra_credit') {
      this.renderExtraCreditScreen();
      return;
    }

    if (targetQNum === 'thank_you') {
      this.renderThankYouScreen();
      return;
    }

    const isTraining = typeof targetQNum === 'string' && targetQNum.startsWith('training:');
    let trainingQNum = 1;
    if (isTraining) {
      this.isTrainingChallenge = true;
      trainingQNum = parseInt(targetQNum.split(':')[1], 10) || 1;
      this.trainingQuestionNumber = trainingQNum;
    } else {
      this.isTrainingChallenge = false;
      this.trainingQuestionNumber = null;
    }

    if (!isTraining && (targetQNum === 'final_thoughts' || targetQNum > 60 || (this.stats && this.stats.totalAnswered >= 60 && !this.adminPreviewGroup))) {
      if (this.studyCompletedSuccessfully || (typeof localStorage !== 'undefined' && localStorage.getItem('sql_study_completed_finished') === 'true')) {
        this.renderThankYouScreen();
        return;
      }
      this.renderFinalThoughtsScreen();
      return;
    }

    const qNum = isTraining
      ? trainingQNum
      : Math.min(60, Math.max(1, parseInt(targetQNum, 10) || (this.stats ? this.stats.totalAnswered + 1 : 1)));

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

    this.currentQuestion.isTraining = isTraining;
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
    this.isTrainingChallenge = false;
    this.trainingQuestionNumber = null;
    this.setConsentAccepted(false);
    if (this.app && this.app.analytics && typeof this.app.analytics.setTrainingCompleted === 'function') {
      this.app.analytics.setTrainingCompleted(false);
    }
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
        navElem.textContent = 'Intake Survey';
      } else if (qNum === 'training_intro') {
        navElem.textContent = 'Training: Intro';
      } else if (typeof qNum === 'string' && qNum.startsWith('training:')) {
        const t = qNum.split(':')[1] || '1';
        navElem.textContent = `Training: ${t} / 10`;
      } else if (qNum === 'training_complete') {
        navElem.textContent = 'Training: Complete';
      } else if (qNum === 'final_thoughts') {
        navElem.textContent = 'Final Thoughts (60 / 60)';
      } else if (qNum === 'extra_credit') {
        navElem.textContent = 'Extra Credit';
      } else if (qNum === 'thank_you') {
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
    const isTraining = Boolean(this.isTrainingChallenge);
    const trainQNum = this.trainingQuestionNumber || 1;

    // Update navbar questions counter badge in Participant ID box
    this.updateNavCounter();

    container.innerHTML = `
      <div class="card quiz-card glow-card compact-view" style="padding: 0;">
        <div class="card-body p-2" style="display: flex; flex-direction: column; gap: 6px; padding: 6px 12px;">

          <!-- Instructions Banner Above Input Schema -->
          ${isTraining ? `
            <div class="quiz-instructions-banner" style="padding: 6px 12px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); border-left: 4px solid #f59e0b; border-radius: 6px; font-size: 13.5px; line-height: 1.45; color: #e2e8f0; display: flex; align-items: flex-start; gap: 8px; box-sizing: border-box;">
              <i class="fa-solid fa-graduation-cap" style="color: #f59e0b; font-size: 16px; margin-top: 2px; flex-shrink: 0;"></i>
              <div style="flex: 1; min-width: 0;">
                <strong style="color: #fde68a;">Practice Question ${trainQNum} of 10:</strong> Read the query and choose what you believe the resulting table would look like using hotkeys <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">1</kbd>–<kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">4</kbd>, push <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">ENTER</kbd> to submit your answer, then push <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">ENTER</kbd> again to move to the next question.
                <span style="color: #fca5a5; font-weight: 600; margin-left: 6px; display: inline-block;">
                  <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 4px;"></i>Do not use the back arrow or refresh button while doing this study.
                </span>
              </div>
            </div>
          ` : `
            <div class="quiz-instructions-banner" style="padding: 6px 12px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-left: 4px solid var(--color-primary); border-radius: 6px; font-size: 13.5px; line-height: 1.45; color: #e2e8f0; display: flex; align-items: flex-start; gap: 8px; box-sizing: border-box;">
              <i class="fa-solid fa-circle-info text-accent" style="font-size: 15px; margin-top: 2px; flex-shrink: 0;"></i>
              <div style="flex: 1; min-width: 0;">
                Please read the query and choose what you believe the resulting table would look like using hotkeys <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">1</kbd>–<kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">4</kbd>, push <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">ENTER</kbd> to submit your answer, then push <kbd style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 1px 5px; font-weight: 700; font-size: 12.5px;">ENTER</kbd> again to move to the next question. Alternatively, use your mouse to click between the four choices to answer.
                <span style="color: #fca5a5; font-weight: 600; margin-left: 6px; display: inline-block;">
                  <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 4px;"></i>Do not use the back arrow or refresh button while doing this study.
                </span>
              </div>
            </div>
          `}
          
          <!-- 1. TOP FULL-WIDTH ROW: Input Schema Reference with Distinct Divider Line -->
          <div class="quiz-schema-top-bar" style="padding: 4px 10px; border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 2px solid var(--color-accent); border-radius: 6px; background: rgba(14, 18, 28, 0.8); width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div class="d-flex justify-between align-center mb-1 pb-1" style="border-bottom: 1px solid rgba(255,255,255,0.06);">
              <div class="d-flex align-center gap-2">
                ${isTraining ? `
                  <span class="badge badge-training" style="font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 4px; background: rgba(245, 158, 11, 0.25); border: 1px solid rgba(245, 158, 11, 0.6); color: #fde68a; letter-spacing: 0.3px;">
                    <i class="fa-solid fa-graduation-cap"></i> Practice Question ${trainQNum} / 10
                  </span>
                ` : `
                  <span class="badge" style="font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 4px; background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(99, 102, 241, 0.55); color: #c7d2fe; letter-spacing: 0.3px;">
                    <i class="fa-solid fa-cube"></i> Question ${qNum} / 60
                  </span>
                `}
                <strong style="color: var(--color-accent); font-size: 11px;"><i class="fa-solid fa-table-cells text-accent"></i> Input Schema Reference (${this.app.currentSchema ? this.app.currentSchema.tables.length : 0} Tables)</strong>
              </div>
            </div>
            ${this.renderCompactSchemaHTML(this.app.currentSchema)}
          </div>

          <!-- DISTINCT SEPARATION LINE -->
          <div style="height: 1px; background: linear-gradient(90deg, transparent, var(--color-accent), transparent); margin: 1px 0 4px 0; opacity: 0.7;"></div>

          <!-- 2. MAIN 2-COLUMN SPLIT ROW (Left: Shrunk Coding Window, Right: Expanded Solution Boxes) -->
          <div class="quiz-main-split" style="display: grid; grid-template-columns: 0.7fr 1.3fr; gap: 12px; align-items: flex-start;">
            
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
              <div class="query-code-preview p-2" style="border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; background: rgba(10, 14, 26, 0.95); flex: 1; min-height: 320px; max-height: 350px; overflow: visible;">
                <pre style="margin: 0; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.45; color: #e2e8f0; white-space: pre-wrap; overflow: visible;"><code>${this.escapeHTML(q.codeSnippet || q.jsCode)}</code></pre>
              </div>
            </div>

            <!-- RIGHT COLUMN: Prompt + Answers (2x2 Grid) + Action Footer -->
            <div class="quiz-right-column" style="display: flex; flex-direction: column; gap: 6px;">
              
              <!-- Prompt Banner -->
              <div class="prompt-bar p-1 px-2 d-flex justify-between align-center" style="background: rgba(0,0,0,0.25); border-radius: 5px; border-left: 3px solid var(--color-accent);">
                <div class="d-flex align-center gap-2">
                  <span class="badge" style="${isTraining ? 'background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); color: #fde68a;' : 'background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7;'} font-weight: 700; font-size: 11px; padding: 1px 7px; border-radius: 4px;">
                    ${isTraining ? `Practice Q${trainQNum}` : `Q${qNum}`}
                  </span>
                  <span class="font-weight-bold fs-xs" style="color: var(--text-main); font-size: 11.5px;">
                    <i class="fa-solid fa-circle-question text-accent"></i> ${q.prompt}
                  </span>
                </div>
                <span class="text-muted fs-xs" style="font-size: 10.5px;">Select <strong>1–4</strong>, then press <kbd style="font-size: 9.5px; padding: 1px 4px;">ENTER</kbd></span>
              </div>

              <!-- 4 Candidate Output Tables (2x2 Grid Capped to NOT exceed Coding Box height) -->
              <div class="quiz-options-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; max-height: 315px;">
                ${q.options.map((opt, idx) => `
                  <div class="quiz-option-card table-option-card" id="opt-btn-${idx}" data-idx="${idx}" style="cursor: pointer; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(18, 24, 38, 0.7); overflow: hidden; display: flex; flex-direction: column; max-height: 153px; transition: border-color 0.15s ease, background 0.15s ease;">
                    <div class="opt-header p-1 px-2 d-flex justify-between align-center" style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.3); font-size: 10.5px; min-height: 25px;">
                      <div class="d-flex align-center gap-1" style="width: 100%; justify-content: center;">
                        <kbd style="background: var(--color-primary); color: #fff; padding: 1px 5px; font-size: 9.5px; font-weight: 700; border-radius: 3px;">${idx + 1}</kbd>
                        <strong style="color: var(--text-main); font-size: 10.5px;">Opt ${String.fromCharCode(65 + idx)}</strong>
                        <span class="text-muted" style="font-size: 9px;">(${opt.rows.length} rows)</span>
                      </div>
                      <div class="opt-status-icon" id="opt-icon-${idx}"></div>
                    </div>
                    <!-- Data Preview Table: Capped height under title bar with 0 top gap -->
                    <div class="opt-body" style="display: flex; justify-content: center; align-items: flex-start; overflow-x: auto; overflow-y: auto; width: 100%; flex: 1; padding: 2px 4px 4px 4px; margin: 0; max-height: 123px;">
                      ${this.renderOptionTableHTML(opt.columns, opt.rows)}
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Bottom Feedback & Action Button -->
              <div id="quiz-feedback-box" class="quiz-feedback-box p-1 px-2" style="display: none; font-size: 11px; border-radius: 5px;"></div>

              <div class="quiz-footer" style="padding-top: 2px; margin-top: auto; display: flex; flex-direction: row; justify-content: space-between; align-items: center; flex-wrap: nowrap; gap: 8px; width: 100%; box-sizing: border-box;">
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
    if (this.app && (this.app.currentQuestionNumber === 'final_thoughts' || (!this.isTrainingChallenge && this.stats && this.stats.totalAnswered >= 60))) {
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
      const assignedGroup = (this.app.analytics && typeof this.app.analytics.getAssignedGroup === 'function')
        ? this.app.analytics.getAssignedGroup()
        : null;

      if (this.isTrainingChallenge) {
        if (typeof this.app.analytics.logTrainingResponse === 'function') {
          this.app.analytics.logTrainingResponse({
            questionNumber: this.trainingQuestionNumber || 1,
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
        }
      } else {
        const curQ = this.app.currentQuestionNumber;
        const parsedQ = (typeof curQ === 'number') ? curQ : parseInt(curQ, 10);
        const currentQNum = (!isNaN(parsedQ) && parsedQ >= 1 && parsedQ <= 60)
          ? parsedQ
          : Math.min(60, (this.stats ? this.stats.totalAnswered + 1 : 1));

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
    }

    // Update stats counter & navbar counter AFTER logging response
    if (!this.isTrainingChallenge) {
      this.stats.totalAnswered++;
    }
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
      if (this.isTrainingChallenge) {
        feedbackBox.style.background = 'rgba(245, 158, 11, 0.12)';
        feedbackBox.style.border = '1px solid rgba(245, 158, 11, 0.35)';
        feedbackBox.style.color = '#fde68a';
        const isLastPractice = ((this.trainingQuestionNumber || 1) >= 10);
        feedbackBox.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; white-space: nowrap; gap: 8px; line-height: 1.4;">
            <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
              <div class="fb-icon" style="font-size: 12px; color: #f59e0b;"><i class="fa-solid fa-graduation-cap"></i></div>
              <h4 class="m-0" style="font-size: 11px; color: #fde68a; white-space: nowrap; font-weight: 600;">Practice Answer Recorded: Option ${String.fromCharCode(65 + index)}</h4>
            </div>
            <span class="text-muted" style="font-size: 10px; white-space: nowrap;">Push <kbd style="font-size: 9px; padding: 1px 4px; background: rgba(255,255,255,0.15); border-radius: 3px;">ENTER</kbd> to ${isLastPractice ? 'complete training' : 'move to next practice question'}</span>
          </div>
        `;
      } else {
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
  }

  nextQuestion() {
    if (this.isTrainingChallenge) {
      const curT = this.trainingQuestionNumber || 1;
      if (curT < 10) {
        this.app.loadIncrementalQuestion(`training:${curT + 1}`);
      } else {
        if (this.app && this.app.analytics && typeof this.app.analytics.setTrainingCompleted === 'function') {
          this.app.analytics.setTrainingCompleted(true);
        }
        this.app.loadIncrementalQuestion('training_complete');
      }
      return;
    }
    this.app.generateNextIncrementalQuestion();
  }

  renderOptionTableHTML(columns, rows) {
    if (!columns || columns.length === 0) {
      return `<div class="p-1 text-muted fs-xs text-center">Empty Dataset</div>`;
    }

    let html = `
      <div style="display: flex; justify-content: center; width: 100%; margin: 0;">
        <table class="data-table opt-table" style="width: 100%; margin: 0 auto; border-collapse: collapse; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12); font-size: 11px; background: rgba(10, 14, 26, 0.65);">
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
      <div class="compact-schema-grid" style="display: grid; grid-template-columns: repeat(${Math.min(schema.tables.length, 5)}, 1fr); gap: 8px;">
        ${schema.tables.map(tbl => `
          <div class="schema-tbl-card p-1 px-2" style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px;">
            <div class="d-flex justify-between align-center mb-1 pb-1" style="font-size: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
              <strong style="color: var(--color-accent); font-family: var(--font-mono);">
                <i class="fa-solid fa-table text-primary"></i> ${tbl.name}
              </strong>
              <span class="text-muted" style="font-size: 8.5px;">(${tbl.rows.length} rows, ${tbl.columns.length} cols)</span>
            </div>
            <div class="col-badges mt-1" style="display: flex; flex-direction: column; gap: 2px; font-family: var(--font-mono);">
              ${tbl.columns.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 1.5px 5px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.07); font-size: 9px;">
                  <span>${c.pk ? '🔑 ' : ''}<strong>${c.name}</strong></span>
                  <span style="color: var(--color-primary); font-size: 8px; margin-left: 6px;">${c.type}</span>
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
