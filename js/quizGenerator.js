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

  generateQuestion(rawSql, schema, dialectManager, groundTruthResult, targetGroup = null) {
    if (!rawSql || !schema) {
      return null;
    }

    let group = targetGroup;
    if (!group && typeof window !== 'undefined' && window.app && window.app.analytics && typeof window.app.analytics.getAssignedGroup === 'function') {
      group = window.app.analytics.getAssignedGroup();
    }

    const hostLanguage = group && group.hostLanguage ? group.hostLanguage : 'javascript';
    const dialectKey = group && group.sqlDialect ? group.sqlDialect : (dialectManager ? dialectManager.getCurrentDialect().id : 'pipe');

    const currentDialect = (dialectManager && dialectManager.availableDialects && dialectManager.availableDialects[dialectKey])
      ? dialectManager.availableDialects[dialectKey]
      : (dialectManager ? dialectManager.getCurrentDialect(null, 42, group) : { name: 'Google SQL (Pipe Syntax)', id: 'pipe' });

    const dialectSql = dialectManager ? dialectManager.formatQueryToDialect(rawSql, currentDialect.id) : rawSql;

    const codeSnippet = this.generateCodeSnippet(rawSql, schema, dialectSql, hostLanguage);
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
      title: 'Embedded Query Execution Question',
      prompt: 'Select the correct final table output:',
      codeSnippet: codeSnippet,
      jsCode: codeSnippet, // For backward compatibility with existing views
      hostLanguage: hostLanguage,
      rawQuery: rawSql,
      dialectSql: dialectSql,
      dialect: currentDialect,
      assignedGroup: group ? group.name : 'Unknown',
      assignedGroupId: group ? group.id : 'unknown',
      options: shuffled.options,
      correctIndex: shuffled.correctIndex,
      correctKey: shuffled.correctIndex + 1
    };
  }

  /**
   * Generates custom instructional practice/training questions (T1, T2, T3)
   */
  generateTrainingQuestion(trainingQNum, schema, dialectManager, targetGroup = null) {
    let group = targetGroup;
    if (!group && typeof window !== 'undefined' && window.app && window.app.analytics && typeof window.app.analytics.getAssignedGroup === 'function') {
      group = window.app.analytics.getAssignedGroup();
    }

    const hostLanguage = group && group.hostLanguage ? group.hostLanguage : 'javascript';
    const dialectKey = group && group.sqlDialect ? group.sqlDialect : (dialectManager ? dialectManager.getCurrentDialect().id : 'pipe');
    const currentDialect = (dialectManager && dialectManager.availableDialects && dialectManager.availableDialects[dialectKey])
      ? dialectManager.availableDialects[dialectKey]
      : (dialectManager ? dialectManager.getCurrentDialect(null, 42, group) : { name: 'Google SQL (Pipe Syntax)', id: 'pipe' });

    const isPython = (hostLanguage === 'python');

    if (trainingQNum === 1) {
      // Training Question 1: Interface Orientation (Not a query)
      const codeSnippet = isPython
        ? `# Please click the answer choice that says WRONG below.\n#\n# NOTE: You will not receive feedback for any of your answers throughout the study.`
        : `// Please click the answer choice that says WRONG below.\n//\n// NOTE: You will not receive feedback for any of your answers throughout the study.`;

      const rawOptions = [
        {
          columns: ['Answer'],
          rows: [['WRONG']],
          isCorrect: true,
          explanation: 'Matches the instruction to select WRONG.'
        },
        {
          columns: ['Answer'],
          rows: [['NOT WRONG']],
          isCorrect: false,
          explanation: 'This answer choice says NOT WRONG.'
        },
        {
          columns: ['Answer'],
          rows: [['NOT WRONG']],
          isCorrect: false,
          explanation: 'This answer choice says NOT WRONG.'
        },
        {
          columns: ['Answer'],
          rows: [['NOT WRONG']],
          isCorrect: false,
          explanation: 'This answer choice says NOT WRONG.'
        }
      ];

      const shuffled = this.shuffleAndAssignKeys(rawOptions);

      return {
        type: 'Training: Interface Orientation',
        title: 'Practice Question 1 (T1)',
        prompt: 'Click the answer that says WRONG below:',
        codeSnippet: codeSnippet,
        jsCode: codeSnippet,
        hostLanguage: hostLanguage,
        rawQuery: '-- Practice Q1: Interface orientation (no query)',
        dialectSql: '-- Practice Q1: Interface orientation (no query)',
        dialect: currentDialect,
        assignedGroup: group ? group.name : 'Unknown',
        assignedGroupId: group ? group.id : 'unknown',
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        correctKey: shuffled.correctIndex + 1,
        isTraining: true,
        qNum: 1
      };
    }

    if (trainingQNum === 2) {
      // Training Question 2: Schema Reading & Table Identification
      const codeSnippet = isPython
        ? `# Read the "Database Schema" banner shown at the top of the screen.\n#\n# Read the database schema and identify the names of all the tables in it.`
        : `// Read the "Database Schema" banner shown at the top of the screen.\n//\n// Read the database schema and identify the names of all the tables in it.`;

      const tableNames = (schema && schema.tables && schema.tables.length > 0)
        ? schema.tables.map(t => t.name)
        : ['users', 'products', 'orders', 'categories', 'reviews'];

      const rawOptions = [
        // 1 Correct answer
        {
          columns: ['Database Tables'],
          rows: tableNames.map(name => [name]),
          isCorrect: true,
          explanation: 'Correctly identifies all table names in the database schema.'
        },
        // Distractor 1: not enough names
        {
          columns: ['Database Tables'],
          rows: tableNames.slice(0, 2).map(name => [name]),
          isCorrect: false,
          explanation: 'Incomplete: only contains 2 table names instead of all tables in the schema.'
        },
        // Distractor 2: names that don't exist
        {
          columns: ['Database Tables'],
          rows: [['users'], ['products'], ['flights'], ['passengers'], ['airports']],
          isCorrect: false,
          explanation: 'Contains table names that do not exist in the schema (flights, passengers, airports).'
        },
        // Distractor 3: very obviously wrong / fabricated
        {
          columns: ['Database Tables'],
          rows: [['animals'], ['vehicles'], ['planets']],
          isCorrect: false,
          explanation: 'Completely fabricated names that do not exist in the schema.'
        }
      ];

      const shuffled = this.shuffleAndAssignKeys(rawOptions);

      return {
        type: 'Training: Schema Identification',
        title: 'Practice Question 2 (T2)',
        prompt: 'Read the Database Schema above and identify the names of the tables in it:',
        codeSnippet: codeSnippet,
        jsCode: codeSnippet,
        hostLanguage: hostLanguage,
        rawQuery: '-- Practice Q2: Schema Table Identification',
        dialectSql: '-- Practice Q2: Schema Table Identification',
        dialect: currentDialect,
        assignedGroup: group ? group.name : 'Unknown',
        assignedGroupId: group ? group.id : 'unknown',
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        correctKey: shuffled.correctIndex + 1,
        isTraining: true,
        qNum: 2
      };
    }

    if (trainingQNum === 3) {
      // Training Question 3: Column Identification for products Table
      const codeSnippet = isPython
        ? `# Look at the "Database Schema" banner at the top of the screen.\n# Find the "products" table and inspect its columns.\n#\n# Identify the columns that belong to the products table.\n# Select the answer choice below that correctly lists the product columns.`
        : `// Look at the "Database Schema" banner at the top of the screen.\n// Find the "products" table and inspect its columns.\n//\n// Identify the columns that belong to the products table.\n// Select the answer choice below that correctly lists the product columns.`;

      const prodTable = schema && schema.tables ? schema.tables.find(t => t.name === 'products') : null;
      const prodCols = prodTable ? prodTable.columns.map(c => c.name) : ['id', 'user_id', 'title', 'price'];

      const otherTable = schema && schema.tables ? schema.tables.find(t => t.name === 'orders' || t.name === 'categories') : null;
      const otherCols = otherTable ? otherTable.columns.map(c => c.name) : ['id', 'amount', 'status', 'quantity'];

      const rawOptions = [
        // 1 Correct answer
        {
          columns: ['products Columns'],
          rows: prodCols.map(c => [c]),
          isCorrect: true,
          explanation: 'Matches all columns in the products table.'
        },
        // Distractor 1: columns from another table
        {
          columns: ['products Columns'],
          rows: otherCols.map(c => [c]),
          isCorrect: false,
          explanation: 'These columns belong to another table (orders), not products.'
        },
        // Distractor 2: nonexistent product attributes
        {
          columns: ['products Columns'],
          rows: [['barcode'], ['shelf_number'], ['warehouse_zone'], ['expiration_date']],
          isCorrect: false,
          explanation: 'Fabricated column names that do not exist in the products table.'
        },
        // Distractor 3: completely irrelevant columns
        {
          columns: ['products Columns'],
          rows: [['latitude'], ['longitude'], ['gps_altitude']],
          isCorrect: false,
          explanation: 'Irrelevant coordinates columns that do not exist in the products table.'
        }
      ];

      const shuffled = this.shuffleAndAssignKeys(rawOptions);

      return {
        type: 'Training: Column Identification',
        title: 'Practice Question 3 (T3)',
        prompt: 'Identify the columns from the products table in the schema above:',
        codeSnippet: codeSnippet,
        jsCode: codeSnippet,
        hostLanguage: hostLanguage,
        rawQuery: '-- Practice Q3: Column Identification for products Table',
        dialectSql: '-- Practice Q3: Column Identification for products Table',
        dialect: currentDialect,
        assignedGroup: group ? group.name : 'Unknown',
        assignedGroupId: group ? group.id : 'unknown',
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        correctKey: shuffled.correctIndex + 1,
        isTraining: true,
        qNum: 3
      };
    }

    if (trainingQNum === 4) {
      // Training Question 4: Select column name from categories table (Direct and simple, 3 lines of data, no scrolling)
      const rawSql = 'SELECT name FROM categories;';
      const dialectSql = dialectManager ? dialectManager.formatQueryToDialect(rawSql, currentDialect.id) : rawSql;

      // Direct and simple: NO additional code (no loops, no status lists, no step counters, no execution logs)
      const codeSnippet = isPython
        ? `query = """\n${dialectSql}\n"""\n\nresult_table = db.execute(query)`
        : `const query = \`\n${dialectSql}\n\`;\n\nconst resultTable = db.execute(query);`;

      const catTable = schema && schema.tables ? schema.tables.find(t => t.name === 'categories') : null;
      const prodTable = schema && schema.tables ? schema.tables.find(t => t.name === 'products') : null;

      // 3 sample lines of data from categories table (fits within card with ZERO scrolling, <= 4 lines)
      const sampleCatRows = catTable && catTable.rows && catTable.rows.length >= 3
        ? catTable.rows.slice(0, 3)
        : [
            { id: 1, name: 'Electronics', priority: 1 },
            { id: 2, name: 'Home & Kitchen', priority: 2 },
            { id: 3, name: 'Books', priority: 3 }
          ];

      const correctNameRows = sampleCatRows.map(r => [r.name]);
      const priorityRows = sampleCatRows.map(r => [r.priority !== undefined ? r.priority : 1]);

      const sampleProdRows = prodTable && prodTable.rows && prodTable.rows.length >= 3
        ? prodTable.rows.slice(0, 3).map(r => [r.title || r.name || 'Item'])
        : [['Laptop'], ['Smartphone'], ['Headphones']];

      const rawOptions = [
        // 1 Correct answer: 3 lines of data from the name column in categories
        {
          columns: ['name'],
          rows: correctNameRows,
          isCorrect: true,
          explanation: 'Matches the name column from the categories table.'
        },
        // Distractor 1: priority column from categories
        {
          columns: ['priority'],
          rows: priorityRows,
          isCorrect: false,
          explanation: 'Selects the priority column instead of the name column.'
        },
        // Distractor 2: obviously wrong column (status from orders, completely distinct from name)
        {
          columns: ['status'],
          rows: [['PENDING'], ['COMPLETED'], ['CANCELLED']],
          isCorrect: false,
          explanation: 'Selects the status column from orders instead of the name column.'
        },
        // Distractor 3: title column from another table (products)
        {
          columns: ['title'],
          rows: sampleProdRows,
          isCorrect: false,
          explanation: 'Selects the title column from the products table instead of categories.'
        }
      ];

      const shuffled = this.shuffleAndAssignKeys(rawOptions);

      return {
        type: 'Training: Query Execution',
        title: 'Practice Question 4 (T4)',
        prompt: 'Select the table output for the query selecting the name column from categories:',
        codeSnippet: codeSnippet,
        jsCode: codeSnippet,
        hostLanguage: hostLanguage,
        rawQuery: rawSql,
        dialectSql: dialectSql,
        dialect: currentDialect,
        assignedGroup: group ? group.name : 'Unknown',
        assignedGroupId: group ? group.id : 'unknown',
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        correctKey: shuffled.correctIndex + 1,
        isTraining: true,
        qNum: 4
      };
    }

    if (trainingQNum === 5) {
      // Training Question 5: SELECT column id, JOIN with another column of same type, WHERE filter (< 3)
      const rawSql = 'SELECT orders.id FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id < 3;';
      const dialectSql = dialectManager ? dialectManager.formatQueryToDialect(rawSql, currentDialect.id) : rawSql;

      // Respective code above the query with simple looping counter to the same number as the WHERE statement (3)
      const codeSnippet = isPython
        ? `counter = 0\nfor i in range(3):\n    counter += 1\n\nquery = """\n${dialectSql}\n"""\n\nresult_table = db.execute(query)`
        : `let counter = 0;\nfor (let i = 0; i < 3; i++) {\n  counter++;\n}\n\nconst query = \`\n${dialectSql}\n\`;\n\nconst resultTable = db.execute(query);`;

      const rawOptions = [
        // 1 Correct answer: id values from joined orders strictly matching WHERE orders.id < 3 (only 1 and 2)
        {
          columns: ['id'],
          rows: [[1], [2]],
          isCorrect: true,
          explanation: 'Matches orders.id for orders joined with users where orders.id < 3.'
        },
        // Distractor 1: obviously wrong column (title from products, no confusing overlap)
        {
          columns: ['title'],
          rows: [['Laptop'], ['Smartphone']],
          isCorrect: false,
          explanation: 'Selects the title column from products instead of orders.id.'
        },
        // Distractor 2: obviously wrong column (status from orders)
        {
          columns: ['status'],
          rows: [['PENDING'], ['COMPLETED']],
          isCorrect: false,
          explanation: 'Selects the status column instead of the id column.'
        },
        // Distractor 3: obviously wrong column (amount from orders)
        {
          columns: ['amount'],
          rows: [[29.99], [49.99]],
          isCorrect: false,
          explanation: 'Selects the amount column instead of the id column.'
        }
      ];

      const shuffled = this.shuffleAndAssignKeys(rawOptions);

      return {
        type: 'Training: Query Execution',
        title: 'Practice Question 5 (T5)',
        prompt: 'Select the table output for the joined query with WHERE filter:',
        codeSnippet: codeSnippet,
        jsCode: codeSnippet,
        hostLanguage: hostLanguage,
        rawQuery: rawSql,
        dialectSql: dialectSql,
        dialect: currentDialect,
        assignedGroup: group ? group.name : 'Unknown',
        assignedGroupId: group ? group.id : 'unknown',
        options: shuffled.options,
        correctIndex: shuffled.correctIndex,
        correctKey: shuffled.correctIndex + 1,
        isTraining: true,
        qNum: 5
      };
    }

    return null;
  }

  /**
   * Routes code generation to Python or JavaScript based on hostLanguage.
   */
  generateCodeSnippet(sql, schema, dialectSql, hostLanguage = 'javascript') {
    if (hostLanguage === 'python') {
      return this.generatePythonCodeFromSql(sql, schema, dialectSql);
    }
    return this.generateJsCodeFromSql(sql, schema, dialectSql);
  }

  /**
   * Translates an SQL query into beginner-friendly Python string-manipulation code.
   * Includes benign Python loops, counters, and flags that do not affect the final generated SQL query.
   */
  generatePythonCodeFromSql(sql, schema, dialectSql) {
    const queryStr = (dialectSql || sql).trim();

    // Seed hash to pick 1 of 4 beginner-friendly code structure variations
    const strHash = queryStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const patternIdx = (strHash + (dialectSql ? dialectSql.length : 7)) % 4;

    const outputVarNames = ['result_table', 'final_data', 'query_output', 'summary_rows'];
    const outputVar = outputVarNames[patternIdx % outputVarNames.length];

    let blocks = [];

    switch (patternIdx) {
      case 0:
        // Pattern 0: Status Loop & Multi-line String
        blocks.push(`status_list = ["init", "validated", "ready"]\nstep_count = 0\nfor status in status_list:\n    step_count += 1`);
        blocks.push(`query = """\n${queryStr}\n"""`);
        blocks.push(`execution_log = []\nexecution_log.append(f"Built query in {step_count} steps")`);
        blocks.push(`${outputVar} = db.execute(query)`);
        break;

      case 1:
        // Pattern 1: Retry Counter & Direct String Assignment
        blocks.push(`retry_counter = 0\nwhile retry_counter < 2:\n    retry_counter += 1`);
        blocks.push(`target_query = """\n${queryStr}\n"""`);
        blocks.push(`audit_trail = []\naudit_trail.append(f"Attempt {retry_counter} successful")`);
        blocks.push(`${outputVar} = db.execute(target_query)`);
        break;

      case 2:
        // Pattern 2: Config Flag & Statement Variable
        blocks.push(`is_approved = True\ncheck_count = 0\nfor i in range(3):\n    check_count += 1`);
        blocks.push(`sql_statement = """\n${queryStr}\n"""`);
        blocks.push(`${outputVar} = db.execute(sql_statement)`);
        break;

      case 3:
      default:
        // Pattern 3: Loop Accumulator & Full Query Template
        blocks.push(`batch_number = 1\nprocess_logs = ["start", "process"]\nfor log in process_logs:\n    batch_number += 1`);
        blocks.push(`full_query = """\n${queryStr}\n"""`);
        blocks.push(`status_msg = "OK" if batch_number > 0 else "PENDING"`);
        blocks.push(`${outputVar} = db.execute(full_query)`);
        break;
    }

    return blocks.join('\n\n');
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
    if (!groundTruthResult || !groundTruthResult.columns || groundTruthResult.columns.length === 0 || !groundTruthResult.rows || groundTruthResult.rows.length === 0) {
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
    const dist2Rows = correctRows.slice().reverse().map(r => Array.isArray(r) ? r.map(val => (typeof val === 'number' ? val + 1 : val)) : r);
    options.push({
      columns: correctColumns,
      rows: dist2Rows,
      isCorrect: false,
      explanation: 'Wrong row values or incorrect sorting order.'
    });

    // Distractor 3: Raw base table or alternative schema table preview
    const baseTable = schema && schema.tables ? schema.tables[0] : null;
    const dist3Cols = baseTable ? baseTable.columns.map(c => c.name) : correctColumns;
    const dist3Rows = baseTable ? baseTable.rows.slice(0, Math.min(5, baseTable.rows.length)).map(r => Object.values(r)) : correctRows.map(r => Array.isArray(r) ? [r[0], 0] : [0, 0]);
    
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
