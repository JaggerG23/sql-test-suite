/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: Free Serverless Backend for SQL Study on GitHub Pages
 * ==============================================================================
 * 
 * Instructions to set up in 2 minutes:
 * 1. Open Google Sheets (https://sheets.new) and create a new blank spreadsheet.
 * 2. In the menu, click: Extensions > Apps Script.
 * 3. Delete any code in the editor and PASTE this entire file.
 * 4. Click the blue "Deploy" button (top right) > "New deployment".
 * 5. Select type: "Web app".
 * 6. Under "Execute as", select: "Me".
 * 7. Under "Who has access", select: "Anyone" (allows study participants to submit).
 * 8. Click "Deploy", authorize access, and COPY the "Web app URL" (ends in /exec).
 * 9. Paste that URL into your Admin Dashboard (Cloud Sync Settings) or in js/config.js!
 * ==============================================================================
 */

const CSV_HEADERS = [
  'response_id', 'participant_id', 'session_id', 'timestamp_iso',
  'question_number', 'trial_block', 'question_category',
  'code_structure', 'operator_count',
  'assigned_group', 'host_language', 'syntax_dialect_id',
  'is_correct', 'response_time_ms', 'response_time_s', 'log_response_time',
  'time_to_first_select_ms', 'decision_confirm_ms', 'input_method',
  'tab_focus_lost', 'valid_trial', 'tab_switch_count', 'focus_lost_duration_ms',
  'answer_change_count',
  'selected_key', 'correct_option',
  'training_accuracy', 'training_total_time_s',
  'age', 'gender', 'gender_label', 'gender_male', 'gender_female',
  'education', 'education_label', 'has_college_degree',
  'coding_exp_years', 'has_coding_exp',
  'db_exp_years', 'has_db_exp',
  'primary_language', 'is_english_primary',
  'country_of_origin', 'is_country_us',
  'likert_clarity', 'likert_difficulty', 'likert_interface', 'likert_experience',
  'duration_expectation',
  'final_thoughts'
];

const STRUCTURE_BY_QUESTION = [2, 3, 4, 5, 1, 2, 4, 5, 1, 3, 5, 2, 3, 4, 1, 4, 1, 2, 3, 5, 3, 2, 5, 4, 1];
const OPERATOR_COUNT_BY_QUESTION = [5, 3, 3, 6, 4, 5, 3, 6, 4, 3, 16, 13, 3, 8, 6, 5, 7, 9, 7, 7, 10, 11, 23, 9, 10];

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Study Responses');
  if (!sheet) {
    sheet = ss.insertSheet('Study Responses');
    sheet.appendRow(CSV_HEADERS);
    sheet.getRange(1, 1, 1, CSV_HEADERS.length).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function setupBackupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let backupSheet = ss.getSheetByName('Telemetry JSON Backup');
  if (!backupSheet) {
    backupSheet = ss.insertSheet('Telemetry JSON Backup');
    backupSheet.appendRow(['Type', 'Key', 'JSON_Payload', 'Updated_At']);
    backupSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    backupSheet.setFrozenRows(1);
  }
  return backupSheet;
}

function loadBackupState() {
  const backupSheet = setupBackupSheet();
  const db = { responses: [], demographics: {}, finalThoughts: {} };
  const lastRow = backupSheet.getLastRow();
  if (lastRow <= 1) return db;

  const rows = backupSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const respMap = new Map();
  for (let i = 0; i < rows.length; i++) {
    const type = rows[i][0];
    const key = rows[i][1];
    const rawJson = rows[i][2];
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      if (type === 'RESPONSE' && key) {
        respMap.set(key, parsed);
      } else if (type === 'DEMOGRAPHICS' && key) {
        db.demographics[key] = parsed;
      } else if (type === 'FINAL_THOUGHT' && key) {
        db.finalThoughts[key] = parsed;
      }
    } catch (e) {}
  }
  db.responses = Array.from(respMap.values());
  return db;
}

function appendBackupRecord(type, key, obj) {
  const backupSheet = setupBackupSheet();
  backupSheet.appendRow([type, key, JSON.stringify(obj), new Date().toISOString()]);
}

function doPost(e) {
  try {
    const contents = e.postData.contents;
    const payload = JSON.parse(contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Handle extra credit email independently in a separate sheet with zero linkage to responses
    if (
      payload.action === 'saveExtraCreditEmail' ||
      payload.action === 'extra_credit_submission' ||
      (payload.email && !payload.responses && !payload.newResponse && !payload.record)
    ) {
      let emailSheet = ss.getSheetByName('Extra Credit Emails');
      if (!emailSheet) {
        emailSheet = ss.insertSheet('Extra Credit Emails');
        emailSheet.appendRow(['Email', 'Course']);
        emailSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
        emailSheet.setFrozenRows(1);
      }
      const cleanEmail = String(payload.email || '').trim().toLowerCase();
      const cleanCourse = String(payload.course || '').trim().toUpperCase();
      if (cleanEmail) {
        emailSheet.appendRow([cleanEmail, cleanCourse]);
        const lastRow = emailSheet.getLastRow();
        if (lastRow > 2) {
          emailSheet.getRange(2, 1, lastRow - 1, 2).sort([
            { column: 1, ascending: true },
            { column: 2, ascending: true }
          ]);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Email and course saved' })).setMimeType(ContentService.MimeType.JSON);
    }

    let sheet = ss.getSheetByName('Study Responses');
    if (!sheet) {
      sheet = setupSheet();
    }

    const rawResponses = payload.newResponse
      ? [payload.newResponse]
      : (payload.record ? [payload.record] : (payload.action === 'adminImport' && Array.isArray(payload.responses) ? payload.responses : []));
    const incomingResponses = rawResponses.filter(r => {
      if (!r || typeof r !== 'object') return false;
      const qn = parseInt(r.questionNumber, 10);
      if (isNaN(qn) || qn < 1 || qn > 25) return false;
      const rq = String(r.rawQuery || '');
      if (rq.indexOf('agg_val') !== -1) return false;
      return true;
    });

    const incomingDemographics = Object.assign(
      {},
      payload.action === 'adminImport' ? (payload.demographics || {}) : {},
      payload.newDemographic ? { [payload.newDemographic.participantId]: payload.newDemographic } : {},
      payload.newDemographics ? { [payload.newDemographics.participantId]: payload.newDemographics } : {}
    );

    const incomingFinalThoughts = Object.assign(
      {},
      payload.action === 'adminImport' ? (payload.finalThoughts || {}) : {},
      payload.newFinalThought ? { [payload.newFinalThought.participantId]: payload.newFinalThought } : {}
    );

    const db = loadBackupState();
    const existingIds = new Set(db.responses.map(r => r.id).filter(Boolean));

    // Also check sheet column A for existing response_ids to prevent duplicate sheet rows
    const sheetLastRow = sheet.getLastRow();
    if (sheetLastRow > 1) {
      const idVals = sheet.getRange(2, 1, sheetLastRow - 1, 1).getValues();
      for (let i = 0; i < idVals.length; i++) {
        if (idVals[i][0]) existingIds.add(String(idVals[i][0]));
      }
    }

    Object.keys(incomingDemographics).forEach(pid => {
      if (pid && incomingDemographics[pid]) {
        db.demographics[pid] = incomingDemographics[pid];
        appendBackupRecord('DEMOGRAPHICS', pid, incomingDemographics[pid]);
      }
    });

    Object.keys(incomingFinalThoughts).forEach(pid => {
      if (pid && incomingFinalThoughts[pid]) {
        db.finalThoughts[pid] = incomingFinalThoughts[pid];
        appendBackupRecord('FINAL_THOUGHT', pid, incomingFinalThoughts[pid]);
      }
    });

    // Helper parser for Google Sheets row formatting
    const parseNum = (val) => {
      if (val === null || val === undefined || val === '') return 0.0;
      if (typeof val === 'number') return val;
      const s = String(val).trim().toLowerCase();
      if (s.indexOf('none') !== -1 || s.indexOf('no ') === 0) return 0.0;
      if (s.indexOf('< 1') !== -1 || s.indexOf('<1') !== -1) return 0.5;
      const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
      if (rangeMatch) {
        return Math.round(((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2.0) * 100) / 100;
      }
      const match = s.match(/(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : 0.0;
    };

    const toBinary = (val) => {
      if (val === true || val === 1 || String(val).trim().toUpperCase() === 'TRUE' || String(val).trim() === '1') return 1;
      return 0;
    };

    const parseEdu = (val) => {
      const labels = { 0: 'High School / GED', 1: 'Some college / university', 2: 'Associate Degree', 3: 'Bachelor Degree', 4: 'Masters Degree', 5: 'Ph. D.', 6: 'Other' };
      if (val === null || val === undefined || val === '') return { code: '', label: '', degree: 0 };
      const s = String(val).trim().toLowerCase();
      if (/^\d+$/.test(s)) {
        const c = parseInt(s, 10);
        return { code: c, label: labels[c] || 'Other', degree: (c >= 3 && c <= 5) ? 1 : 0 };
      }
      let c = 6;
      if (s.indexOf('ph') !== -1 || s.indexOf('doctor') !== -1) c = 5;
      else if (s.indexOf('master') !== -1) c = 4;
      else if (s.indexOf('bachelor') !== -1 || s.indexOf('junior') !== -1 || s.indexOf('senior') !== -1) c = 3;
      else if (s.indexOf('associate') !== -1) c = 2;
      else if (s.indexOf('some college') !== -1 || s.indexOf('freshman') !== -1 || s.indexOf('undergrad') !== -1) c = 1;
      else if (s.indexOf('high school') !== -1 || s.indexOf('ged') !== -1) c = 0;
      return { code: c, label: labels[c] || 'Other', degree: (c >= 3 && c <= 5) ? 1 : 0 };
    };

    const parseGender = (val) => {
      const labels = { 0: 'Male', 1: 'Female', 2: 'Non-binary', 3: 'Other', 4: 'Prefer not to say' };
      if (val === null || val === undefined || val === '') return { code: '', label: '', isMale: 0, isFemale: 0 };
      const s = String(val).trim().toLowerCase();
      if (/^\d+$/.test(s)) {
        const c = parseInt(s, 10);
        return { code: c, label: labels[c] || 'Other', isMale: c === 0 ? 1 : 0, isFemale: c === 1 ? 1 : 0 };
      }
      let c = 3;
      if (s === 'male' || s === 'm') c = 0;
      else if (s === 'female' || s === 'f') c = 1;
      else if (s.indexOf('non-binary') !== -1 || s.indexOf('nonbinary') !== -1) c = 2;
      else if (s.indexOf('prefer not') !== -1) c = 4;
      return { code: c, label: labels[c] || 'Other', isMale: c === 0 ? 1 : 0, isFemale: c === 1 ? 1 : 0 };
    };

    let appendedCount = 0;
    incomingResponses.forEach(r => {
      if (!r || typeof r !== 'object') return;
      const rId = r.id || ('resp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
      if (existingIds.has(String(rId))) return;
      existingIds.add(String(rId));
      r.id = rId;
      db.responses.push(r);
      appendBackupRecord('RESPONSE', String(rId), r);

      const pid = r.participantId || '';
      const demo = db.demographics[pid] || {};
      const thoughts = db.finalThoughts[pid] || {};
      const lr = thoughts.likertRatings || {};

      const isCorrectVal = toBinary(r.isCorrect);
      const rtMs = parseInt(r.responseTimeMs, 10) || 0;
      const rtS = Math.round((rtMs / 1000.0) * 1000) / 1000;
      const logRt = Math.round(Math.log(Math.max(rtMs, 1.0)) * 10000) / 10000;
      const tabFocusLostVal = toBinary(r.tabFocusLost);
      const validTrialVal = tabFocusLostVal === 0 ? 1 : 0;
      const qNum = parseInt(r.questionNumber, 10) || 1;
      const trialBlock = Math.floor((Math.max(1, qNum) - 1) / 5) + 1;
      const qIdx = qNum - 1;
      const codeStructure = r.codeStructure || r.code_structure || ((qIdx >= 0 && qIdx < STRUCTURE_BY_QUESTION.length) ? STRUCTURE_BY_QUESTION[qIdx] : '');
      const operatorCount = (r.operatorCount !== undefined && r.operatorCount !== null && r.operatorCount !== '')
        ? r.operatorCount
        : ((r.operator_count !== undefined && r.operator_count !== null && r.operator_count !== '')
          ? r.operator_count
          : ((qIdx >= 0 && qIdx < OPERATOR_COUNT_BY_QUESTION.length) ? OPERATOR_COUNT_BY_QUESTION[qIdx] : ''));
      const firstSelectMs = (r.timeToFirstSelectMs !== undefined && r.timeToFirstSelectMs !== null && r.timeToFirstSelectMs !== '')
        ? r.timeToFirstSelectMs
        : (r.time_to_first_select_ms !== undefined && r.time_to_first_select_ms !== null ? r.time_to_first_select_ms : '');
      const confirmMs = (r.decisionConfirmMs !== undefined && r.decisionConfirmMs !== null && r.decisionConfirmMs !== '')
        ? r.decisionConfirmMs
        : (r.decision_confirm_ms !== undefined && r.decision_confirm_ms !== null ? r.decision_confirm_ms : '');
      const inputMethod = r.inputMethod || r.input_method || '';
      const trainingAcc = (r.trainingAccuracy !== undefined && r.trainingAccuracy !== null)
        ? r.trainingAccuracy
        : (r.training_accuracy !== undefined && r.training_accuracy !== null ? r.training_accuracy : '');
      const trainingTimeS = (r.trainingTotalTimeS !== undefined && r.trainingTotalTimeS !== null)
        ? r.trainingTotalTimeS
        : (r.training_total_time_s !== undefined && r.training_total_time_s !== null ? r.training_total_time_s : '');

      const assignedGroupName = r.assignedGroupName || r.assignedGroup || demo.assignedGroupName || demo.assignedGroup || '';

      const resolveCorrectKey = (respObj) => {
        if (!respObj) return '';
        if (respObj.correctKey !== undefined && respObj.correctKey !== null && respObj.correctKey !== '') {
          const k = parseInt(respObj.correctKey, 10);
          if (!isNaN(k) && k >= 1 && k <= 4) return k;
        }
        const rawOpt = String(respObj.correctOptionText || respObj.correct_option || '').trim();
        if (/^[1-4]$/.test(rawOpt)) return parseInt(rawOpt, 10);
        const letterMatch = rawOpt.match(/Option\s+([A-D])/i) || rawOpt.match(/^([A-D])$/i);
        if (letterMatch) return letterMatch[1].toUpperCase().charCodeAt(0) - 64;
        if (isCorrectVal === 1 && respObj.selectedKey !== undefined && respObj.selectedKey !== null && respObj.selectedKey !== '') {
          const sk = parseInt(respObj.selectedKey, 10);
          if (!isNaN(sk) && sk >= 1 && sk <= 4) return sk;
        }
        return '';
      };

      const resolveLikert = (tObj, shortKey) => {
        if (!tObj) return '';
        const fullKey = 'likert_' + shortKey;
        const ratingsObj = tObj.likertRatings || {};
        const candidates = [tObj[fullKey], tObj[shortKey], ratingsObj[fullKey], ratingsObj[shortKey]];
        for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
          if (candidates[cIdx] !== undefined && candidates[cIdx] !== null && candidates[cIdx] !== '') {
            return candidates[cIdx];
          }
        }
        return '';
      };

      const genderInfo = parseGender(demo.gender);
      const eduInfo = parseEdu(demo.education || demo.highestEducation || demo.academicStanding);
      const codingYears = parseNum(demo.codingExp);
      const dbYears = parseNum(demo.dbExp);
      const langStr = String(demo.primaryLanguage || '').trim();
      const isEnglish = langStr.toLowerCase().indexOf('english') !== -1 ? 1 : 0;
      const countryStr = String(demo.countryOfOrigin || '').trim();
      const isUs = (countryStr.toLowerCase().indexOf('united states') !== -1 || countryStr.toLowerCase() === 'usa' || countryStr.toLowerCase() === 'us') ? 1 : 0;

      const row = [
        rId,
        pid,
        r.sessionId || '',
        r.timestamp || '',
        qNum,
        trialBlock,
        r.questionCategory || '',
        codeStructure,
        operatorCount,
        assignedGroupName,
        r.hostLanguage || demo.hostLanguage || '',
        r.activeDialect || '',
        isCorrectVal,
        rtMs,
        rtS,
        logRt,
        firstSelectMs,
        confirmMs,
        inputMethod,
        tabFocusLostVal,
        validTrialVal,
        r.tabSwitchCount !== undefined ? r.tabSwitchCount : 0,
        r.focusLostDurationMs !== undefined ? r.focusLostDurationMs : 0,
        r.answerChangeCount !== undefined ? r.answerChangeCount : 0,
        r.selectedKey !== undefined && r.selectedKey !== null ? r.selectedKey : '',
        resolveCorrectKey(r),
        trainingAcc,
        trainingTimeS,
        demo.age || '',
        genderInfo.code,
        genderInfo.label,
        genderInfo.isMale,
        genderInfo.isFemale,
        eduInfo.code,
        eduInfo.label,
        eduInfo.degree,
        codingYears,
        codingYears > 0 ? 1 : 0,
        dbYears,
        dbYears > 0 ? 1 : 0,
        langStr,
        isEnglish,
        countryStr,
        isUs,
        resolveLikert(thoughts, 'clarity'),
        resolveLikert(thoughts, 'difficulty'),
        resolveLikert(thoughts, 'interface'),
        resolveLikert(thoughts, 'experience'),
        thoughts.durationExpectation || thoughts.duration_expectation || '',
        thoughts.thoughts || ''
      ];
      sheet.appendRow(row);
      appendedCount++;
    });

    // If newFinalThought arrived after responses were already appended, backfill the participant's rows in Study Responses
    if (Object.keys(incomingFinalThoughts).length > 0 && sheet.getLastRow() > 1) {
      const totalRows = sheet.getLastRow() - 1;
      const pidCol = sheet.getRange(2, 2, totalRows, 1).getValues();
      const likertStartCol = CSV_HEADERS.indexOf('likert_clarity') + 1;
      Object.keys(incomingFinalThoughts).forEach(pid => {
        const t = incomingFinalThoughts[pid] || {};
        const lr = t.likertRatings || {};
        const pickL = (sKey) => {
          const fKey = 'likert_' + sKey;
          const cands = [t[fKey], t[sKey], lr[fKey], lr[sKey]];
          for (let k = 0; k < cands.length; k++) {
            if (cands[k] !== undefined && cands[k] !== null && cands[k] !== '') return cands[k];
          }
          return '';
        };
        const vals = [
          pickL('clarity'),
          pickL('difficulty'),
          pickL('interface'),
          pickL('experience'),
          t.durationExpectation || t.duration_expectation || '',
          t.thoughts || ''
        ];
        for (let i = 0; i < pidCol.length; i++) {
          if (String(pidCol[i][0]) === String(pid)) {
            sheet.getRange(i + 2, likertStartCol, 1, 6).setValues([vals]);
          }
        }
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      receivedResponses: appendedCount,
      totalStored: db.responses.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const db = loadBackupState();
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      responses: db.responses,
      demographics: db.demographics,
      finalThoughts: db.finalThoughts
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
