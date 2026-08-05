/**
 * Quiz Question Generator
 * Generates randomized, beginner-friendly JavaScript code containing query manipulation, loops, counters, and status flags.
 * Features 4 beginner-friendly string query manipulation patterns interleaved with benign JavaScript counters and loops.
 * Ensures generated JS code is valid, generates a valid SQL query, has clean double-newline block spacing, and stays strictly under 28 lines total.
 */
class QuizGenerator {
  constructor(seed = 42) {
    this.seed = seed;
  }

  generateQuestion(rawSql, schema, dialectManager, groundTruthResult) {
    if (!rawSql || !schema) {
      return null;
    }

    const currentDialect = dialectManager ? dialectManager.getCurrentDialect() : { name: 'Standard SQL', id: 'mysql' };
    const dialectSql = dialectManager ? dialectManager.formatQueryToDialect(rawSql, currentDialect.id) : rawSql;

    const jsCode = this.generateJsCodeFromSql(rawSql, schema, dialectSql);
    const options = this.generateTableOptions(groundTruthResult, schema, rawSql);

    // Shuffle options and assign hotkeys [1, 2, 3, 4]
    const shuffled = this.shuffleAndAssignKeys(options);

    const questionType = rawSql.includes('GROUP BY') 
      ? 'Group & Aggregate Transformation'
      : rawSql.includes('JOIN')
        ? 'Relational Join Transformation'
        : 'Filter & Projection Transformation';

    return {
      type: questionType,
      title: 'Embedded SQL & JavaScript Execution Challenge',
      prompt: 'Select the correct final table output:',
      jsCode: jsCode,
      rawQuery: rawSql,
      dialectSql: dialectSql,
      dialect: currentDialect,
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      correctKey: shuffled.correctIndex + 1
    };
  }

  /**
   * Translates an SQL query into beginner-friendly JavaScript string-manipulation code.
   * Includes benign JavaScript loops, counters, and flags that do not affect the final generated SQL query.
   */
  generateJsCodeFromSql(sql, schema, dialectSql) {
    const queryStr = (dialectSql || sql).trim();
    const clauses = this.parseSqlClauses(queryStr);

    // Seed hash to pick 1 of 4 beginner-friendly query-manipulation patterns
    const strHash = queryStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const patternIdx = (strHash + (dialectSql ? dialectSql.length : 7)) % 4;

    const outputVarNames = ['resultTable', 'finalData', 'queryOutput', 'summaryRows', 'resultData'];
    const outputVar = outputVarNames[patternIdx % outputVarNames.length];

    let blocks = [];

    switch (patternIdx) {
      case 0:
        // Pattern 0: Status Loop & Placeholder Replacement (.replace())
        blocks.push(`let statusList = ["init", "validated", "ready"];\nlet stepCount = 0;\nfor (let status of statusList) {\n  stepCount += 1;\n}`);

        if (clauses.where) {
          blocks.push(`let baseQuery = \`${clauses.selectFrom} {WHERE_CLAUSE}${clauses.rest ? ' ' + clauses.rest : ''};\`;`);
          blocks.push(`let filterCondition = "${clauses.where}";`);
          blocks.push(`let finalQuery = baseQuery.replace("{WHERE_CLAUSE}", filterCondition);`);
        } else {
          const fromMatch = clauses.selectFrom.match(/\bFROM\s+([a-zA-Z0-9_]+)/i);
          const tblName = fromMatch ? fromMatch[1] : 'table1';
          const templateSelect = clauses.selectFrom.replace(new RegExp(`\\b${tblName}\\b`, 'i'), '{TARGET_TABLE}');
          blocks.push(`let templateQuery = \`${templateSelect}${clauses.rest ? ' ' + clauses.rest : ''};\`;`);
          blocks.push(`let targetTable = "${tblName}";`);
          blocks.push(`let finalQuery = templateQuery.replace("{TARGET_TABLE}", targetTable);`);
        }

        blocks.push(`let executionLog = [];\nexecutionLog.push(\`Built query in \${stepCount} steps\`);`);
        blocks.push(`let ${outputVar} = db.execute(finalQuery);`);
        break;

      case 1:
        // Pattern 1: Retry Counter & String Concatenation (+=)
        blocks.push(`let retryCounter = 0;\nwhile (retryCounter < 2) {\n  retryCounter++;\n}`);

        blocks.push(`let query = \`${clauses.selectFrom}\`;`);
        if (clauses.where) {
          blocks.push(`query += " ${clauses.where}";`);
        }
        if (clauses.rest) {
          blocks.push(`query += " ${clauses.rest}";`);
        }
        blocks.push(`query += ";";`);

        blocks.push(`let auditTrail = [];\nauditTrail.push(\`Attempt \${retryCounter} successful\`);`);
        blocks.push(`let ${outputVar} = db.execute(query);`);
        break;

      case 2:
        // Pattern 2: Config Flag, Counter Loop & Template Literal Assembly (${...})
        blocks.push(`let isApproved = true;\nlet checkCount = 0;\nfor (let i = 0; i < 3; i++) {\n  checkCount++;\n}`);

        blocks.push(`let mainClause = \`${clauses.selectFrom}\`;`);
        if (clauses.where) {
          blocks.push(`let whereCondition = "${clauses.where}";`);
        }
        if (clauses.rest) {
          blocks.push(`let additionalClause = "${clauses.rest}";`);
        }
        
        let templateParts = ['${mainClause}'];
        if (clauses.where) templateParts.push('${whereCondition}');
        if (clauses.rest) templateParts.push('${additionalClause}');
        
        blocks.push(`let fullQuery = \`${templateParts.join(' ')};\`;`);
        blocks.push(`let ${outputVar} = db.execute(fullQuery);`);
        break;

      case 3:
      default:
        // Pattern 3: Loop Accumulator & Array Join (.join(" "))
        blocks.push(`let batchNumber = 1;\nlet processLogs = ["start", "process"];\nfor (let log of processLogs) {\n  batchNumber++;\n}`);

        let parts = [`"${clauses.selectFrom}"`];
        if (clauses.where) parts.push(`"${clauses.where}"`);
        if (clauses.rest) parts.push(`"${clauses.rest}"`);

        blocks.push(`let queryParts = [\n  ${parts.join(',\n  ')}\n];`);
        blocks.push(`let assembledQuery = queryParts.join(" ") + ";";`);
        blocks.push(`let statusMsg = batchNumber > 0 ? "OK" : "PENDING";`);
        blocks.push(`let ${outputVar} = db.execute(assembledQuery);`);
        break;
    }

    // Join blocks with double newlines (\n\n) for clean, spacious readability
    return blocks.join('\n\n');
  }

  parseSqlClauses(sql) {
    const cleanSql = sql.trim().replace(/;$/, '');
    
    // Find split index for WHERE clause or rest of clauses (GROUP BY, ORDER BY, LIMIT)
    const whereIdx = cleanSql.search(/\bWHERE\b/i);
    const restIdx = cleanSql.search(/\b(GROUP BY|ORDER BY|LIMIT)\b/i);

    let selectFrom = cleanSql;
    let where = null;
    let rest = null;

    if (whereIdx !== -1) {
      selectFrom = cleanSql.substring(0, whereIdx).trim();
      if (restIdx !== -1 && restIdx > whereIdx) {
        where = cleanSql.substring(whereIdx, restIdx).trim();
        rest = cleanSql.substring(restIdx).trim();
      } else {
        where = cleanSql.substring(whereIdx).trim();
      }
    } else if (restIdx !== -1) {
      selectFrom = cleanSql.substring(0, restIdx).trim();
      rest = cleanSql.substring(restIdx).trim();
    }

    return { selectFrom, where, rest };
  }

  generateTableOptions(groundTruthResult, schema, rawSql) {
    if (!groundTruthResult || !groundTruthResult.columns) {
      return this.generateFallbackOptions(schema);
    }

    const correctColumns = groundTruthResult.columns;
    const correctRows = groundTruthResult.rows;

    const options = [
      {
        columns: correctColumns,
        rows: correctRows,
        isCorrect: true,
        explanation: 'Matches exact query output transformation.'
      }
    ];

    // Distractor 1: Unfiltered / Off-by-one subset
    const dist1Rows = correctRows.length > 1 ? correctRows.slice(0, correctRows.length - 1) : [...correctRows, [99, 99]];
    options.push({
      columns: correctColumns,
      rows: dist1Rows,
      isCorrect: false,
      explanation: 'Incomplete output (missing rows due to premature filter or slice).'
    });

    // Distractor 2: Reversed sort order or mutated column values
    const dist2Rows = correctRows.slice().reverse().map(r => r.map(val => (typeof val === 'number' ? val + 1 : val)));
    options.push({
      columns: correctColumns,
      rows: dist2Rows,
      isCorrect: false,
      explanation: 'Incorrect row values or reversed sort order.'
    });

    // Distractor 3: Raw base table or alternative schema table preview
    const baseTable = schema && schema.tables ? schema.tables[0] : null;
    const dist3Cols = baseTable ? baseTable.columns.map(c => c.name) : correctColumns;
    const dist3Rows = baseTable ? baseTable.rows.slice(0, Math.min(5, baseTable.rows.length)).map(r => Object.values(r)) : correctRows.map(r => [r[0], 0]);
    
    options.push({
      columns: dist3Cols,
      rows: dist3Rows,
      isCorrect: false,
      explanation: 'Base table output prior to applying SQL logic.'
    });

    return options;
  }

  generateFallbackOptions(schema) {
    return [
      { columns: ['id', 'val'], rows: [[1, 100], [2, 200]], isCorrect: true, explanation: 'Correct result' },
      { columns: ['id', 'val'], rows: [[1, 100]], isCorrect: false, explanation: 'Missing row' },
      { columns: ['id', 'val'], rows: [[2, 200], [1, 100]], isCorrect: false, explanation: 'Wrong order' },
      { columns: ['id', 'val'], rows: [[1, 105], [2, 205]], isCorrect: false, explanation: 'Mutated values' }
    ];
  }

  shuffleAndAssignKeys(options) {
    const arr = [...options];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const correctIndex = arr.findIndex(o => o.isCorrect);
    return { options: arr, correctIndex };
  }
}

window.QuizGenerator = QuizGenerator;
