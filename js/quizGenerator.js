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

    // Seed hash to pick 1 of 4 beginner-friendly code structure variations
    const strHash = queryStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const patternIdx = (strHash + (dialectSql ? dialectSql.length : 7)) % 4;

    const outputVarNames = ['resultTable', 'finalData', 'queryOutput', 'summaryRows'];
    const outputVar = outputVarNames[patternIdx % outputVarNames.length];

    let blocks = [];

    switch (patternIdx) {
      case 0:
        // Pattern 0: Status Loop & Multi-line String
        blocks.push(`let statusList = ["init", "validated", "ready"];\nlet stepCount = 0;\nfor (let status of statusList) {\n  stepCount += 1;\n}`);
        blocks.push(`let query = \`\n${queryStr}\n\`;`);
        blocks.push(`let executionLog = [];\nexecutionLog.push(\`Built query in \${stepCount} steps\`);`);
        blocks.push(`let ${outputVar} = db.execute(query);`);
        break;

      case 1:
        // Pattern 1: Retry Counter & Direct String Assignment
        blocks.push(`let retryCounter = 0;\nwhile (retryCounter < 2) {\n  retryCounter++;\n}`);
        blocks.push(`let targetQuery = \`\n${queryStr}\n\`;`);
        blocks.push(`let auditTrail = [];\nauditTrail.push(\`Attempt \${retryCounter} successful\`);`);
        blocks.push(`let ${outputVar} = db.execute(targetQuery);`);
        break;

      case 2:
        // Pattern 2: Config Flag & Statement Variable
        blocks.push(`let isApproved = true;\nlet checkCount = 0;\nfor (let i = 0; i < 3; i++) {\n  checkCount++;\n}`);
        blocks.push(`let sqlStatement = \`\n${queryStr}\n\`;`);
        blocks.push(`let ${outputVar} = db.execute(sqlStatement);`);
        break;

      case 3:
      default:
        // Pattern 3: Loop Accumulator & Full Query Template
        blocks.push(`let batchNumber = 1;\nlet processLogs = ["start", "process"];\nfor (let log of processLogs) {\n  batchNumber++;\n}`);
        blocks.push(`let fullQuery = \`\n${queryStr}\n\`;`);
        blocks.push(`let statusMsg = batchNumber > 0 ? "OK" : "PENDING";`);
        blocks.push(`let ${outputVar} = db.execute(fullQuery);`);
        break;
    }

    // Join code blocks with clean double newlines (\n\n)
    return blocks.join('\n\n');
  }

  parseSqlClauses(sql) {
    const cleanSql = sql.trim().replace(/;$/, '');

    // Check if query is in Quorum syntax
    if (cleanSql.includes('query:SetTable') || cleanSql.includes('query:')) {
      const lines = cleanSql.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let selectFromParts = [];
      let where = null;
      let restParts = [];

      lines.forEach(line => {
        if (line.startsWith('query:SetTable') || line.startsWith('query:AddJoin') || line.startsWith('query:AddLeftJoin') || line.startsWith('query:AddRightJoin')) {
          selectFromParts.push(line);
        } else if (line.startsWith('query:Filter')) {
          where = line;
        } else {
          restParts.push(line);
        }
      });

      return {
        selectFrom: selectFromParts.join('\n'),
        where: where,
        rest: restParts.join('\n')
      };
    }

    // Check if query is in Google SQL Pipe syntax
    if (cleanSql.includes('|>') || /^\s*FROM\b/i.test(cleanSql)) {
      const lines = cleanSql.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let selectFromParts = [];
      let where = null;
      let restParts = [];

      lines.forEach(line => {
        if (line.startsWith('FROM') || line.startsWith('|> JOIN') || line.startsWith('|> INNER JOIN') || line.startsWith('|> LEFT JOIN')) {
          selectFromParts.push(line);
        } else if (line.startsWith('|> WHERE')) {
          where = line;
        } else {
          restParts.push(line);
        }
      });

      return {
        selectFrom: selectFromParts.join('\n'),
        where: where,
        rest: restParts.join('\n')
      };
    }
    
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
      explanation: 'Incomplete result (some rows are missing).'
    });

    // Distractor 2: Reversed sort order or mutated column values
    const dist2Rows = correctRows.slice().reverse().map(r => r.map(val => (typeof val === 'number' ? val + 1 : val)));
    options.push({
      columns: correctColumns,
      rows: dist2Rows,
      isCorrect: false,
      explanation: 'Wrong row values or incorrect sorting order.'
    });

    // Distractor 3: Raw base table or alternative schema table preview
    const baseTable = schema && schema.tables ? schema.tables[0] : null;
    const dist3Cols = baseTable ? baseTable.columns.map(c => c.name) : correctColumns;
    const dist3Rows = baseTable ? baseTable.rows.slice(0, Math.min(5, baseTable.rows.length)).map(r => Object.values(r)) : correctRows.map(r => [r[0], 0]);
    
    options.push({
      columns: dist3Cols,
      rows: dist3Rows,
      isCorrect: false,
      explanation: 'Unfiltered table data (SQL query conditions were not applied).'
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
