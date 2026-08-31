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
  'Response ID', 'Participant ID', 'Session ID', 'Timestamp (ISO)', 'Question Number',
  'Question Category', 'Syntax Dialect ID', 'Syntax Dialect Name', 'Selected Key (1-4)',
  'Selected Option', 'Correct Option', 'Is Correct', 'Response Time (ms)', 'Random Seed',
  'Tab Focus Lost', 'Tab Switch Count', 'Focus Lost Duration (ms)', 'Age', 'Gender',
  'Academic Standing', 'Coding Experience', 'Database Experience',
  'Query Writing Experience', 'Final Thoughts', 'Raw SQL Query', 'Dialect SQL Query',
  'JS Code Snippet'
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

    // Append response rows to sheet
    responses.forEach(r => {
      const pid = r.participantId || '';
      const demo = demographics[pid] || db.demographics[pid] || {};
      const thoughts = finalThoughts[pid] || db.finalThoughts[pid] || {};

      const row = [
        r.id || '',
        r.participantId || '',
        r.sessionId || '',
        r.timestamp || '',
        r.questionNumber || '',
        r.questionCategory || '',
        r.activeDialect || '',
        r.activeDialectName || '',
        r.selectedKey !== undefined && r.selectedKey !== null ? r.selectedKey : '',
        r.selectedOptionText || '',
        r.correctOptionText || '',
        r.isCorrect !== undefined ? (r.isCorrect ? 'TRUE' : 'FALSE') : '',
        r.responseTimeMs !== undefined ? r.responseTimeMs : '',
        r.seed !== undefined ? r.seed : '',
        r.tabFocusLost ? 'TRUE' : 'FALSE',
        r.tabSwitchCount !== undefined ? r.tabSwitchCount : 0,
        r.focusLostDurationMs !== undefined ? r.focusLostDurationMs : 0,
        demo.age || '',
        demo.gender || '',
        demo.academicStanding || '',
        demo.codingExp || '',
        demo.dbExp || '',
        demo.queryExp || '',
        thoughts.thoughts || '',
        r.rawQuery || '',
        r.dialectSql || '',
        r.jsCode || ''
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
