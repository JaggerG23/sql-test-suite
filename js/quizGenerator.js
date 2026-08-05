/**
 * Quiz Question Generator
 * Generates JavaScript implementations of SQL queries with embedded SQL strings and builds candidate table output challenges.
 * Generates 4 options (Keys 1, 2, 3, 4) with 1 correct ground-truth output table and 3 realistic distractor tables.
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
   * Translates an SQL query into concise, clean, valid JavaScript code with newlines between logical statements.
   */
  generateJsCodeFromSql(sql, schema, dialectSql) {
    const ast = this.parseSimpleAst(sql);
    const queryStr = (dialectSql || sql).trim();
    let js = '';

    // Step 1: Base scan / Join
    if (ast.joins.length === 0) {
      js += `let rows = db.${ast.mainTable};\n\n`;
    } else {
      const j = ast.joins[0];
      js += `let rows = db.${ast.mainTable}.flatMap(a => db.${j.table}.filter(b => a.${this.stripPrefix(j.onLeft)} === b.${this.stripPrefix(j.onRight)}).map(b => ({ ...a, ...b })));\n\n`;
    }

    // Embed SQL query in the middle of code
    js += `const sqlQuery = \`\n${queryStr}\n\`;\n\n`;

    // Step 2: WHERE Filter
    if (ast.whereCondition) {
      const jsCond = this.sqlWhereToJs(ast.whereCondition);
      js += `rows = rows.filter(r => ${jsCond});\n\n`;
    }

    // Step 3: Group & Aggregate OR Project
    if (ast.groupBy.length > 0 || ast.aggregates.length > 0) {
      const gCol = ast.groupBy[0] || 'id';
      const gProp = this.stripPrefix(gCol);
      const agg = ast.aggregates[0] || { func: 'COUNT', alias: 'agg_val', column: 'id' };
      const prop = this.stripPrefix(agg.column);

      js += `const groups = {};\n\n`;
      js += `rows.forEach(r => { const k = r['${gProp}'] || r['${gCol}']; (groups[k] = groups[k] || []).push(r); });\n\n`;

      if (agg.func === 'COUNT') {
        js += `let output = Object.entries(groups).map(([k, g]) => ({ '${gCol}': k, '${agg.alias}': g.length }));\n\n`;
      } else if (agg.func === 'SUM') {
        js += `let output = Object.entries(groups).map(([k, g]) => ({ '${gCol}': k, '${agg.alias}': g.reduce((acc, r) => acc + (Number(r['${prop}']) || 0), 0) }));\n\n`;
      } else {
        js += `let output = Object.entries(groups).map(([k, g]) => ({ '${gCol}': k, '${agg.alias}': g.length }));\n\n`;
      }
    } else {
      const cols = ast.selectCols.map(c => `'${c}': r['${this.stripPrefix(c)}'] !== undefined ? r['${this.stripPrefix(c)}'] : r['${c}']`).join(', ');
      js += `let output = rows.map(r => ({ ${cols} }));\n\n`;
    }

    // Step 4: Sort & Limit
    if (ast.orderBy) {
      const col = ast.orderBy.column;
      const isDesc = ast.orderBy.dir === 'DESC';
      js += `output.sort((a, b) => ${isDesc ? `(b['${col}'] || 0) - (a['${col}'] || 0)` : `(a['${col}'] || 0) - (b['${col}'] || 0)`});\n\n`;
    }

    if (ast.limit) {
      js += `output = output.slice(0, ${ast.limit});\n`;
    }

    return js.trim();
  }

  parseSimpleAst(sql) {
    const ast = {
      mainTable: 'table1',
      selectCols: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      havingCondition: null,
      orderBy: null,
      limit: null
    };

    const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) ast.mainTable = fromMatch[1];

    const joinRegex = /(INNER|LEFT|RIGHT)?\s*JOIN\s+([a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_.]+)\s*=\s*([a-zA-Z0-9_.]+)/gi;
    let match;
    while ((match = joinRegex.exec(sql)) !== null) {
      ast.joins.push({
        type: match[1] || 'INNER',
        table: match[2],
        onLeft: match[3],
        onRight: match[4]
      });
    }

    const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    if (selectMatch) {
      const parts = selectMatch[1].split(',').map(s => s.trim());
      parts.forEach(p => {
        const aggMatch = p.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
        if (aggMatch) {
          ast.aggregates.push({
            func: aggMatch[1].toUpperCase(),
            column: aggMatch[2].trim(),
            alias: aggMatch[3] ? aggMatch[3].trim() : `${aggMatch[1].toLowerCase()}_val`
          });
        } else {
          ast.selectCols.push(p.replace(/\s+AS\s+[a-zA-Z0-9_]+/i, ''));
        }
      });
    }

    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?=\s+GROUP|\s+HAVING|\s+ORDER|\s+LIMIT|;|$)/i);
    if (whereMatch) ast.whereCondition = whereMatch[1].trim();

    const groupMatch = sql.match(/GROUP BY\s+([a-zA-Z0-9_.,\s]+?)(?=\s+HAVING|\s+ORDER|\s+LIMIT|;|$)/i);
    if (groupMatch) ast.groupBy = groupMatch[1].split(',').map(s => s.trim());

    const havingMatch = sql.match(/HAVING\s+([\s\S]+?)(?=\s+ORDER|\s+LIMIT|;|$)/i);
    if (havingMatch) ast.havingCondition = havingMatch[1].trim();

    const orderMatch = sql.match(/ORDER BY\s+([a-zA-Z0-9._]+)\s*(ASC|DESC)?/i);
    if (orderMatch) {
      ast.orderBy = {
        column: orderMatch[1].trim(),
        dir: orderMatch[2] ? orderMatch[2].toUpperCase() : 'ASC'
      };
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) ast.limit = parseInt(limitMatch[1], 10);

    return ast;
  }

  sqlWhereToJs(whereStr) {
    if (!whereStr) return 'true';
    let js = whereStr;

    // Replace table prefix table.col -> r['col'] or r['table.col']
    js = js.replace(/\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g, (m, tbl, col) => `(r['${col}'] !== undefined ? r['${col}'] : r['${tbl}.${col}'])`);
    // Singular column -> r['col']
    js = js.replace(/([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*(?:=|>|<|>=|<=))/g, (m) => {
      if (m.startsWith('r[')) return m;
      return `r['${m}']`;
    });

    // Single '=' -> '==='
    js = js.replace(/([^=><!])=([^=])/g, '$1===$2');
    js = js.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||');

    return js;
  }

  stripPrefix(colStr) {
    if (!colStr) return '';
    return colStr.includes('.') ? colStr.split('.')[1] : colStr;
  }

  /**
   * Generates 1 correct table output + 3 distinct, realistic distractor tables
   */
  generateTableOptions(groundTruthResult, schema, sql) {
    const columns = (groundTruthResult && groundTruthResult.columns && groundTruthResult.columns.length > 0)
      ? groundTruthResult.columns
      : ['id', 'value'];

    const rawRows = (groundTruthResult && groundTruthResult.rows) ? groundTruthResult.rows : [];

    // Option 1: Ground Truth
    const optCorrect = {
      columns: columns,
      rows: JSON.parse(JSON.stringify(rawRows)),
      isCorrect: true,
      explanation: 'Correct! This table matches the exact output produced by executing the embedded SQL query / JavaScript logic on the schema data.'
    };

    // Option 2: Distractor A - Calculation / Aggregate Perturbation (off-by-one or value shift)
    const rowsDist1 = JSON.parse(JSON.stringify(rawRows));
    if (rowsDist1.length > 0) {
      let modified = false;
      rowsDist1.forEach(r => {
        r.forEach((val, idx) => {
          if (typeof val === 'number' && !modified) {
            r[idx] = val + (val > 0 ? 1 : 2);
            modified = true;
          }
        });
      });
      if (!modified && rowsDist1.length > 0) {
        rowsDist1[0][0] = String(rowsDist1[0][0]) + '_err';
      }
    } else {
      rowsDist1.push(columns.map((_, i) => (i === 0 ? 1 : 10)));
    }

    const optDist1 = {
      columns: columns,
      rows: rowsDist1,
      isCorrect: false,
      explanation: 'Incorrect: The aggregate or column calculation is off-by-one or evaluated incorrectly.'
    };

    // Option 3: Distractor B - Row Filtering / Inclusion Error (extra or missing row)
    const rowsDist2 = JSON.parse(JSON.stringify(rawRows));
    if (rowsDist2.length > 1) {
      rowsDist2.pop(); // omit last row
    } else if (rowsDist2.length === 1) {
      const extraRow = rowsDist2[0].map((v, i) => (typeof v === 'number' ? v + 5 : `${v}_ext`));
      rowsDist2.push(extraRow);
    } else {
      rowsDist2.push(columns.map((_, i) => (i === 0 ? 100 : 'Sample')));
    }

    const optDist2 = {
      columns: columns,
      rows: rowsDist2,
      isCorrect: false,
      explanation: 'Incorrect: The WHERE / filter predicate was mis-evaluated, resulting in missing or extra rows.'
    };

    // Option 4: Distractor C - Sorting Direction / Limit Order Perturbation
    const rowsDist3 = JSON.parse(JSON.stringify(rawRows));
    if (rowsDist3.length > 1) {
      rowsDist3.reverse(); // Reverse sort order
    } else if (rowsDist3.length === 1) {
      rowsDist3[0] = rowsDist3[0].map(v => (typeof v === 'number' ? Math.max(0, v - 3) : 'Default'));
    } else {
      rowsDist3.push(columns.map((_, i) => (i === 0 ? 999 : 'Invalid')));
    }

    const optDist3 = {
      columns: columns,
      rows: rowsDist3,
      isCorrect: false,
      explanation: 'Incorrect: The sorting order (sort direction) or row limit was applied in reverse or incorrectly.'
    };

    // Ensure all 4 options are structurally unique
    const options = [optCorrect, optDist1, optDist2, optDist3];
    this.ensureOptionsUnique(options);

    return options;
  }

  ensureOptionsUnique(options) {
    const seen = new Set();

    options.forEach((opt, idx) => {
      let key = JSON.stringify(opt.rows);
      if (seen.has(key) && idx > 0) {
        // Mutate slightly to guarantee uniqueness
        if (opt.rows.length > 0) {
          opt.rows[0][0] = (typeof opt.rows[0][0] === 'number') ? opt.rows[0][0] + (idx * 10) : `${opt.rows[0][0]}_${idx}`;
        } else {
          opt.rows.push([idx * 7]);
        }
        key = JSON.stringify(opt.rows);
      }
      seen.add(key);
    });
  }

  shuffleAndAssignKeys(options) {
    const arr = [...options];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    const correctIndex = arr.findIndex(opt => opt.isCorrect);

    return {
      options: arr,
      correctIndex: correctIndex
    };
  }
}

window.QuizGenerator = QuizGenerator;
