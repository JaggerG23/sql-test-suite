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
  'assigned_group', 'assigned_group_id', 'host_language',
  'syntax_dialect_id', 'syntax_dialect_name',
  'is_correct', 'response_time_ms', 'response_time_s', 'log_response_time',
  'tab_focus_lost', 'valid_trial', 'tab_switch_count', 'focus_lost_duration_ms',
  'answer_change_count',
  'selected_key', 'selected_option', 'correct_option',
  'age', 'gender', 'gender_label', 'gender_male', 'gender_female',
  'education', 'education_label', 'has_college_degree',
  'coding_exp_years', 'has_coding_exp',
  'db_exp_years', 'has_db_exp',
  'primary_language', 'is_english_primary',
  'country_of_origin', 'is_country_us',
  'disability_status', 'has_disability',
  'final_thoughts', 'raw_query', 'dialect_sql', 'code_snippet'
];

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

function doPost(e) {
  try {
    const contents = e.postData.contents;
    const payload = JSON.parse(contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Handle extra credit email independently in a separate sheet with zero linkage to responses
    if (payload.action === 'saveExtraCreditEmail' || (payload.email && !payload.responses && !payload.newResponse)) {
      let emailSheet = ss.getSheetByName('Extra Credit Emails');
      if (!emailSheet) {
        emailSheet = ss.insertSheet('Extra Credit Emails');
        emailSheet.appendRow(['Email', 'Course']);
        emailSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
        emailSheet.setFrozenRows(1);
      }
      emailSheet.appendRow([payload.email, payload.course || '']);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Email and course saved' })).setMimeType(ContentService.MimeType.JSON);
    }

    let sheet = ss.getSheetByName('Study Responses');
    if (!sheet) {
      sheet = setupSheet();
    }

    const responses = payload.responses || (payload.record ? [payload.record] : []);
    const demographics = payload.demographics || (payload.newDemographics ? { [payload.newDemographics.participantId]: payload.newDemographics } : {});
    const finalThoughts = payload.finalThoughts || (payload.newFinalThought ? { [payload.newFinalThought.participantId]: payload.newFinalThought } : {});

    // Store raw JSON backup in Properties Service or sheet for easy admin sync
    const prop = PropertiesService.getScriptProperties();
    let storedRaw = prop.getProperty('TELEMETRY_BACKUP_JSON');
    let db = storedRaw ? JSON.parse(storedRaw) : { responses: [], demographics: {}, finalThoughts: {} };

    // Deduplicate & merge
    const map = new Map();
    db.responses.forEach(r => { if (r.id) map.set(r.id, r); });
    responses.forEach(r => { if (r.id) map.set(r.id, r); });
    db.responses = Array.from(map.values());

    Object.assign(db.demographics, demographics);
    Object.assign(db.finalThoughts, finalThoughts);
    prop.setProperty('TELEMETRY_BACKUP_JSON', JSON.stringify(db));

    // Helper parser for Google Sheets row formatting
    const parseNum = (val) => {
      if (val === null || val === undefined || val === '') return 0.0;
      if (typeof val === 'number') return val;
      const s = String(val).trim().toLowerCase();
      if (s.indexOf('none') !== -1 || s.indexOf('no ') === 0) return 0.0;
      if (s.indexOf('< 1') !== -1 || s.indexOf('<1') !== -1) return 0.5;
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

    // Append response rows to sheet
    responses.forEach(r => {
      const pid = r.participantId || '';
      const demo = demographics[pid] || db.demographics[pid] || {};
      const thoughts = finalThoughts[pid] || db.finalThoughts[pid] || {};

      const isCorrectVal = toBinary(r.isCorrect);
      const rtMs = parseInt(r.responseTimeMs, 10) || 0;
      const rtS = Math.round((rtMs / 1000.0) * 1000) / 1000;
      const logRt = Math.round(Math.log(Math.max(rtMs, 1.0)) * 10000) / 10000;
      const tabFocusLostVal = toBinary(r.tabFocusLost);
      const validTrialVal = tabFocusLostVal === 0 ? 1 : 0;
      const qNum = parseInt(r.questionNumber, 10) || 1;
      const trialBlock = qNum <= 15 ? 1 : (qNum <= 30 ? 2 : (qNum <= 45 ? 3 : 4));

      const assignedGroupName = r.assignedGroupName || r.assignedGroup || demo.assignedGroupName || demo.assignedGroup || '';
      let assignedGroupId = r.assignedGroupId || demo.assignedGroupId || '';
      if (!assignedGroupId && assignedGroupName) {
        const agLower = String(assignedGroupName).toLowerCase();
        if (agLower.indexOf('group a') !== -1) assignedGroupId = 'group_a';
        else if (agLower.indexOf('group b') !== -1) assignedGroupId = 'group_b';
        else if (agLower.indexOf('group c') !== -1) assignedGroupId = 'group_c';
        else if (agLower.indexOf('group d') !== -1) assignedGroupId = 'group_d';
        else assignedGroupId = agLower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      }

      const genderInfo = parseGender(demo.gender);
      const eduInfo = parseEdu(demo.education || demo.highestEducation || demo.academicStanding);
      const codingYears = parseNum(demo.codingExp);
      const dbYears = parseNum(demo.dbExp);
      const langStr = String(demo.primaryLanguage || '').trim();
      const isEnglish = langStr.toLowerCase().indexOf('english') !== -1 ? 1 : 0;
      const countryStr = String(demo.countryOfOrigin || '').trim();
      const isUs = (countryStr.toLowerCase().indexOf('united states') !== -1 || countryStr.toLowerCase() === 'usa' || countryStr.toLowerCase() === 'us') ? 1 : 0;
      const disStr = String(demo.disability || '').trim().toLowerCase();
      const hasDis = (disStr && disStr.indexOf('none') === -1 && disStr !== 'no' && disStr.indexOf('prefer not') === -1) ? 1 : 0;

      const row = [
        r.id || '',
        r.participantId || '',
        r.sessionId || '',
        r.timestamp || '',
        qNum,
        trialBlock,
        r.questionCategory || '',
        assignedGroupName,
        assignedGroupId,
        r.hostLanguage || demo.hostLanguage || '',
        r.activeDialect || '',
        r.activeDialectName || '',
        isCorrectVal,
        rtMs,
        rtS,
        logRt,
        tabFocusLostVal,
        validTrialVal,
        r.tabSwitchCount !== undefined ? r.tabSwitchCount : 0,
        r.focusLostDurationMs !== undefined ? r.focusLostDurationMs : 0,
        r.answerChangeCount !== undefined ? r.answerChangeCount : 0,
        r.selectedKey !== undefined && r.selectedKey !== null ? r.selectedKey : '',
        r.selectedOptionText || '',
        r.correctOptionText || '',
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
        demo.disability || '',
        hasDis,
        thoughts.thoughts || '',
        r.rawQuery || '',
        r.dialectSql || '',
        r.codeSnippet || r.jsCode || ''
      ];
      sheet.appendRow(row);
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      receivedResponses: responses.length,
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
    const prop = PropertiesService.getScriptProperties();
    const storedRaw = prop.getProperty('TELEMETRY_BACKUP_JSON');
    const db = storedRaw ? JSON.parse(storedRaw) : { responses: [], demographics: {}, finalThoughts: {} };

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
