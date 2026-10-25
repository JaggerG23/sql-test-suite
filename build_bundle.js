#!/usr/bin/env node
/**
 * Build Script: Packs, minifies, and obfuscates the SQL Study JS modules into
 * single-file bundles:
 *   - js/study.bundle.min.js (for participant.html, with private IIFE scope hiding)
 *   - js/admin.bundle.min.js (for index.html)
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const PARTICIPANT_FILES = [
  'js/config.js',
  'js/schemaGenerator.js',
  'js/queryGenerator.js',
  'js/syntaxDialects.js',
  'js/quizGenerator.js',
  'js/participantAnalytics.js',
  'js/engines/sqliteEngine.js',
  'js/engines/customJsEngine.js',
  'js/engines/optimizerEngine.js',
  'js/humanResolver.js',
  'js/app.js'
];

const ADMIN_FILES = [
  'js/config.js',
  'js/adminAuth.js',
  'js/schemaGenerator.js',
  'js/queryGenerator.js',
  'js/syntaxDialects.js',
  'js/quizGenerator.js',
  'js/participantAnalytics.js',
  'js/engines/sqliteEngine.js',
  'js/engines/customJsEngine.js',
  'js/engines/optimizerEngine.js',
  'js/humanResolver.js',
  'js/app.js'
];

// Sensitive internal identifiers to mangle across the bundle so DevTools inspection cannot identify correct vs distractor logic
const IDENTIFIER_MANGLE_MAP = {
  correctIndex: '_0x7b2c',
  correctRows: '_0x9d3e',
  correctColumns: '_0x2a8f',
  chosenDistractors: '_0x5c1b',
  distractorPool: '_0x8e4d',
  rawOptions: '_0x3f6a',
  questionDefs: '_0x6b9e',
  finalSql: '_0x1d7c',
  initialSql: '_0x4a2e',
  executedQuery: '_0x8c5f',
  setupSql: '_0x2f9b',
  generateTableOptions: '_0x7e3a',
  getStudyQuestionSpec: '_0x5a8c',
  shuffleAndAssignKeys: '_0x9b4e',
  generateFallbackOptions: '_0x3c7d',
  getCanonicalCorrectKey: '_0x6d1f'
};

const GENERATOR_ONLY_MANGLE_MAP = {
  isCorrect: '_0x4f1a',
  explanation: '_0x1e5c'
};

/**
 * Strips comments and encodes single/double-quoted string literals in sensitive generator files
 * while preserving template literals, regexes, and code structure.
 */
function transformAndMinifyJS(sourceCode, encodeStrings = false, stringTable = [], stringMap = new Map()) {
  let out = '';
  const len = sourceCode.length;
  let i = 0;

  const registerString = (rawVal) => {
    if (stringMap.has(rawVal)) {
      return `_0xstr(${stringMap.get(rawVal)})`;
    }
    const idx = stringTable.length;
    stringTable.push(rawVal);
    stringMap.set(rawVal, idx);
    return `_0xstr(${idx})`;
  };

  // Track last non-whitespace token character to distinguish regex literals from division
  let lastSigChar = '';
  let lastWord = '';

  const isRegexAllowedAfter = (ch, word) => {
    if (!ch) return true;
    if (['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'].includes(ch)) {
      return true;
    }
    if (['return', 'case', 'throw', 'in', 'of', 'typeof', 'instanceof', 'void', 'delete', 'new', 'await', 'yield'].includes(word)) {
      return true;
    }
    return false;
  };

  while (i < len) {
    const ch = sourceCode[i];
    const next = sourceCode[i + 1];

    // 1. Single-line comment //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && sourceCode[i] !== '\n') i++;
      continue;
    }

    // 2. Multi-line comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(sourceCode[i] === '*' && sourceCode[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // 3. Single or double quoted string literal
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let rawLiteral = quote;
      i++;
      while (i < len) {
        const c = sourceCode[i];
        rawLiteral += c;
        i++;
        if (c === '\\' && i < len) {
          rawLiteral += sourceCode[i];
          i++;
        } else if (c === quote) {
          break;
        }
      }
      // Check if this string is followed by ':' (object property key) - keep object keys valid or computed
      let lookahead = i;
      while (lookahead < len && /\s/.test(sourceCode[lookahead])) lookahead++;
      const isObjectKey = sourceCode[lookahead] === ':';

      if (encodeStrings && !isObjectKey) {
        try {
          // Safely parse string value
          const parsedVal = Function('"use strict"; return (' + rawLiteral + ');')();
          if (typeof parsedVal === 'string' && parsedVal.length > 0) {
            out += registerString(parsedVal);
            lastSigChar = ')';
            lastWord = '';
            continue;
          }
        } catch (e) {}
      }
      out += rawLiteral;
      lastSigChar = quote;
      lastWord = '';
      continue;
    }

    // 4. Template literal `...`
    if (ch === '`') {
      let tmpl = '`';
      i++;
      let depth = 0;
      let hasInterpolation = false;
      while (i < len) {
        const c = sourceCode[i];
        if (c === '\\') {
          tmpl += c + (sourceCode[i + 1] || '');
          i += 2;
          continue;
        }
        if (c === '$' && sourceCode[i + 1] === '{') {
          hasInterpolation = true;
          depth++;
          tmpl += '${';
          i += 2;
          continue;
        }
        if (depth > 0 && /[A-Za-z_$]/.test(c)) {
          let tid = c;
          i++;
          while (i < len && /[A-Za-z0-9_$]/.test(sourceCode[i])) {
            tid += sourceCode[i];
            i++;
          }
          if (Object.prototype.hasOwnProperty.call(IDENTIFIER_MANGLE_MAP, tid)) {
            tid = IDENTIFIER_MANGLE_MAP[tid];
          } else if (encodeStrings && Object.prototype.hasOwnProperty.call(GENERATOR_ONLY_MANGLE_MAP, tid)) {
            tid = GENERATOR_ONLY_MANGLE_MAP[tid];
          }
          tmpl += tid;
          continue;
        }
        if (c === '}' && depth > 0) {
          depth--;
          tmpl += '}';
          i++;
          continue;
        }
        if (c === '`' && depth === 0) {
          tmpl += '`';
          i++;
          break;
        }
        tmpl += c;
        i++;
      }
      if (encodeStrings && !hasInterpolation) {
        try {
          const parsedVal = Function('"use strict"; return (' + tmpl + ');')();
          if (typeof parsedVal === 'string' && parsedVal.length > 0) {
            out += registerString(parsedVal);
            lastSigChar = ')';
            lastWord = '';
            continue;
          }
        } catch (e) {}
      }
      out += tmpl;
      lastSigChar = '`';
      lastWord = '';
      continue;
    }

    // 5. Regex literal /.../
    if (ch === '/' && isRegexAllowedAfter(lastSigChar, lastWord)) {
      let regex = '/';
      i++;
      let inCharClass = false;
      while (i < len) {
        const c = sourceCode[i];
        regex += c;
        i++;
        if (c === '\\' && i < len) {
          regex += sourceCode[i];
          i++;
        } else if (c === '[') {
          inCharClass = true;
        } else if (c === ']') {
          inCharClass = false;
        } else if (c === '/' && !inCharClass) {
          while (i < len && /[gimsuy]/.test(sourceCode[i])) {
            regex += sourceCode[i];
            i++;
          }
          break;
        }
      }
      out += regex;
      lastSigChar = '/';
      lastWord = '';
      continue;
    }

    // 6. Identifiers
    if (/[A-Za-z_$]/.test(ch)) {
      let id = ch;
      i++;
      while (i < len && /[A-Za-z0-9_$]/.test(sourceCode[i])) {
        id += sourceCode[i];
        i++;
      }
      if (Object.prototype.hasOwnProperty.call(IDENTIFIER_MANGLE_MAP, id)) {
        id = IDENTIFIER_MANGLE_MAP[id];
      } else if (encodeStrings && Object.prototype.hasOwnProperty.call(GENERATOR_ONLY_MANGLE_MAP, id)) {
        id = GENERATOR_ONLY_MANGLE_MAP[id];
      }
      out += id;
      lastSigChar = id[id.length - 1];
      lastWord = id;
      continue;
    }

    // 7. Whitespace collapsing (preserve newlines where needed for ASI safety, collapse horizontal spaces)
    if (/\s/.test(ch)) {
      let hasNewline = (ch === '\n' || ch === '\r');
      i++;
      while (i < len && /\s/.test(sourceCode[i])) {
        if (sourceCode[i] === '\n' || sourceCode[i] === '\r') hasNewline = true;
        i++;
      }
      if (hasNewline) {
        if (out.length > 0 && out[out.length - 1] !== '\n') {
          out += '\n';
        }
      } else {
        const prevChar = out[out.length - 1] || '';
        const nextChar = sourceCode[i] || '';
        if (/[A-Za-z0-9_$]/.test(prevChar) && /[A-Za-z0-9_$]/.test(nextChar)) {
          out += ' ';
        } else if ((prevChar === '+' && nextChar === '+') || (prevChar === '-' && nextChar === '-')) {
          out += ' ';
        }
      }
      continue;
    }

    out += ch;
    lastSigChar = ch;
    lastWord = '';
    i++;
  }

  return out;
}

function stripExplanationLines(code) {
  // Remove explanation: '...' / "..." properties from quizGenerator.js before bundling
  return code.replace(/,\s*explanation\s*:\s*(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g, '');
}

function buildBundle(fileList, outputRelPath, hideGlobalsInProxy) {
  const stringTable = [];
  const stringMap = new Map();
  const chunks = [];

  for (const relPath of fileList) {
    const fullPath = path.join(ROOT, relPath);
    let raw = fs.readFileSync(fullPath, 'utf8');
    const isSensitiveGenerator = relPath.includes('quizGenerator.js') || relPath.includes('queryGenerator.js');
    if (isSensitiveGenerator) {
      raw = stripExplanationLines(raw);
    }
    const transformed = transformAndMinifyJS(raw, isSensitiveGenerator, stringTable, stringMap);
    chunks.push(transformed);
  }

  // XOR-encode the stringTable so strings are not searchable in DevTools Sources
  const xorKey = 0x5A;
  const encodedTable = stringTable.map(str => {
    const b64 = Buffer.from(str, 'utf8').toString('base64');
    let scrambled = '';
    for (let i = 0; i < b64.length; i++) {
      scrambled += String.fromCharCode(b64.charCodeAt(i) ^ ((xorKey + (i % 17)) & 0x7F));
    }
    return Buffer.from(scrambled, 'utf8').toString('base64');
  });

  const decoderHeader = `
const _0xrawTbl=${JSON.stringify(encodedTable)};
const _0xstrCache=new Array(_0xrawTbl.length);
function _0xstr(idx){
  if(_0xstrCache[idx]!==undefined)return _0xstrCache[idx];
  const raw=atob(_0xrawTbl[idx]);
  let b64='';
  for(let i=0;i<raw.length;i++){
    b64+=String.fromCharCode(raw.charCodeAt(i)^((0x5A+(i%17))&0x7F));
  }
  const bin=atob(b64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  const val=new TextDecoder('utf-8').decode(bytes);
  _0xstrCache[idx]=val;
  return val;
}
`.trim();

  const proxyHeader = hideGlobalsInProxy ? `
const _realWin=globalThis.window;
const _privScope=Object.create(null);
const _hiddenKeys=new Set(['app','QueryExperimentApp','HumanResolver','QuizGenerator','QueryGenerator','SchemaGenerator','RandomGenerator','SyntaxDialectManager','ParticipantAnalytics','SQLiteEngine','CustomJsEngine','OptimizerEngine','studyConfig','ENABLE_DEV_RESET']);
const window=new Proxy(_realWin,{
  get(t,p){
    if(_hiddenKeys.has(p)&&p in _privScope)return _privScope[p];
    const v=Reflect.get(t,p,t);
    return typeof v==='function'?v.bind(t):v;
  },
  set(t,p,v){
    if(_hiddenKeys.has(p)){_privScope[p]=v;return true;}
    return Reflect.set(t,p,v,t);
  }
});
`.trim() : '';

  const fullBundle = `(function(){\n${decoderHeader}\n${proxyHeader}\n${chunks.join('\n')}\n})();\n`;
  const outPath = path.join(ROOT, outputRelPath);
  fs.writeFileSync(outPath, fullBundle, 'utf8');
  console.log(`Built ${outputRelPath} (${Math.round(fullBundle.length / 1024)} KB, ${stringTable.length} encoded strings)`);
}

buildBundle(PARTICIPANT_FILES, 'js/study.bundle.min.js', true);
buildBundle(ADMIN_FILES, 'js/admin.bundle.min.js', false);

// Ensure participant.html and index.html reference the packed bundles
const pHtmlPath = path.join(ROOT, 'participant.html');
if (fs.existsSync(pHtmlPath)) {
  let pHtml = fs.readFileSync(pHtmlPath, 'utf8');
  pHtml = pHtml.replace(
    /<!-- JS (?:Module Scripts|Bundle) -->[\s\S]*?<\/body>/,
    '<!-- JS Bundle -->\r\n  <script src="js/study.bundle.min.js?v=1"></script>\r\n</body>'
  );
  fs.writeFileSync(pHtmlPath, pHtml, 'utf8');
}

const iHtmlPath = path.join(ROOT, 'index.html');
if (fs.existsSync(iHtmlPath)) {
  let iHtml = fs.readFileSync(iHtmlPath, 'utf8');
  iHtml = iHtml.replace(
    /<!-- JS (?:Module Scripts|Bundle) -->[\s\S]*?<\/body>/,
    '<!-- JS Bundle -->\r\n  <script src="js/admin.bundle.min.js?v=1"></script>\r\n</body>'
  );
  fs.writeFileSync(iHtmlPath, iHtml, 'utf8');
}
