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

  generateQuestion(rawSql, schema, dialectManager, groundTruthResult, targetGroup = null, qNum = null) {
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

    const isQuestion1 = (qNum === 1 || (rawSql && rawSql.includes('FROM orders JOIN users ON orders.user_id = users.id')));
    const isStudy2to30 = (!isQuestion1 && qNum !== null && qNum !== undefined && parseInt(qNum, 10) >= 2 && parseInt(qNum, 10) <= 30);

    let codeSnippet;
    let shuffled;
    let questionSpec = null;

    if (isQuestion1) {
      const isPython = (hostLanguage === 'python');
      codeSnippet = isPython
        ? `counter = 0\nfor i in range(6):\n    counter += 1\n\nquery = """\n${dialectSql}\n"""\n\nresult_table = db.execute(query)`
        : `let counter = 0;\nfor (let i = 0; i < 6; i++) {\n  counter++;\n}\n\nconst query = \`\n${dialectSql}\n\`;\n\nconst resultTable = db.execute(query);`;

      const options = this.generateTableOptions(groundTruthResult, schema, rawSql, null, 1, hostLanguage);
      shuffled = this.shuffleAndAssignKeys(options);
    } else if (isStudy2to30) {
      const qGenerator = (typeof window !== 'undefined' && window.app && window.app.queryGenerator)
        ? window.app.queryGenerator
        : new QueryGenerator();
      questionSpec = qGenerator.getStudyQuestionSpec(schema, parseInt(qNum, 10));

      codeSnippet = this.generateStudyCodeSnippet(questionSpec, schema, dialectManager, currentDialect, hostLanguage);
      const options = this.generateTableOptions(groundTruthResult, schema, rawSql, questionSpec, parseInt(qNum, 10), hostLanguage);
      shuffled = this.shuffleAndAssignKeys(options);
    } else {
      codeSnippet = this.generateCodeSnippet(rawSql, schema, dialectSql, hostLanguage, qNum, dialectManager, currentDialect);
      const options = this.generateTableOptions(groundTruthResult, schema, rawSql, null, qNum, hostLanguage);
      shuffled = this.shuffleAndAssignKeys(options);
    }

    const questionType = questionSpec
      ? `Embedded Query (${(questionSpec.operators || []).join(', ')})`
      : (rawSql.includes('GROUP BY') 
        ? 'Group & Aggregate Transformation'
        : rawSql.includes('JOIN')
          ? 'Relational Join Transformation'
          : 'Filter & Projection Transformation');

    return {
      type: questionType,
      title: isStudy2to30 ? `Embedded Query (Study Question ${qNum} / 30)` : 'Embedded Query Execution Question',
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
      correctKey: shuffled.correctIndex + 1,
      isTraining: false,
      qNum: qNum || 1,
      structureType: questionSpec ? questionSpec.structureType : null,
      operatorsUsed: questionSpec ? questionSpec.operators : null
    };
  }

  /**
   * Generates custom instructional practice/training questions (T1, T2, T3, T4)
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

    return null;
  }

  /**
   * Routes code generation to Python or JavaScript based on hostLanguage and structure.
   */
  generateCodeSnippet(sql, schema, dialectSql, hostLanguage = 'javascript', qNum = null, dialectManager = null, dialect = null) {
    if (qNum === 1 || (sql && sql.includes('FROM orders JOIN users ON orders.user_id = users.id'))) {
      return (hostLanguage === 'python')
        ? `counter = 0\nfor i in range(6):\n    counter += 1\n\nquery = """\n${dialectSql}\n"""\n\nresult_table = db.execute(query)`
        : `let counter = 0;\nfor (let i = 0; i < 6; i++) {\n  counter++;\n}\n\nconst query = \`\n${dialectSql}\n\`;\n\nconst resultTable = db.execute(query);`;
    }

    if (qNum !== null && qNum !== undefined && parseInt(qNum, 10) >= 2 && parseInt(qNum, 10) <= 30) {
      const qGenerator = (typeof window !== 'undefined' && window.app && window.app.queryGenerator)
        ? window.app.queryGenerator
        : new QueryGenerator();
      const spec = qGenerator.getStudyQuestionSpec(schema, parseInt(qNum, 10));
      return this.generateStudyCodeSnippet(spec, schema, dialectManager, dialect, hostLanguage);
    }

    if (hostLanguage === 'python') {
      return this.generatePythonCodeFromSql(sql, schema, dialectSql);
    }
    return this.generateJsCodeFromSql(sql, schema, dialectSql);
  }

  /**
   * Generates code for the 5 randomized structures:
   * 1- [Python/JavaScript], [Query], [Execute]
   * 2- [Query], [Python/JavaScript], [Query], [Execute]
   * 3- [Python/JavaScript], [Query], [Python/JavaScript], [Execute]
   * 4- [Query], [Python/JavaScript], [Execute]
   * 5- [Query], [Execute], [Python/JavaScript], [Query], [Execute]
   */
  generateStudyCodeSnippet(spec, schema, dialectManager, dialect, hostLanguage = 'javascript') {
    const isPython = (hostLanguage === 'python');
    const dialectId = dialect ? dialect.id : (dialectManager ? dialectManager.getCurrentDialect().id : 'pipe');

    const finalDialectSql = dialectManager
      ? dialectManager.formatQueryToDialect(spec.finalSql, dialectId)
      : spec.finalSql;

    const initialDialectSql = (spec.initialSql && dialectManager)
      ? dialectManager.formatQueryToDialect(spec.initialSql, dialectId)
      : (spec.initialSql || finalDialectSql);

    const setupDialectSql = (spec.setupSql && dialectManager)
      ? dialectManager.formatQueryToDialect(spec.setupSql, dialectId)
      : (spec.setupSql || '');

    const structureType = spec.structureType || 1;
    const blocks = [];

    // Study Question 2: Simple query, use python/javascript to delete it, new query, execute
    if (spec.manipulation === 'delete_query' || spec.qNum === 2) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`del query`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`delete query;`);
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 8: Function related to appending to query that doesn't affect query, query, call function saved to variable, execute
    if (spec.manipulation === 'append_function' || spec.qNum === 8) {
      if (isPython) {
        blocks.push(`def append_to_query(clause):\n    log_buffer = ["audit_marker"]\n    log_buffer.append(clause)\n    return len(log_buffer)`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`append_status = append_to_query("ORDER BY id DESC")`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`function appendToQuery(clause) {\n  let logBuffer = ["audit_marker"];\n  logBuffer.push(clause);\n  return logBuffer.length;\n}`);
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`const appendStatus = appendToQuery("ORDER BY id DESC");`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 4: [Query], conduct a string operation on the query that looks like it makes a change but doesn't, [Execute]
    if (spec.manipulation === 'noop_replace' || spec.qNum === 4) {
      if (isPython) {
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`query.replace("A%", "B%")`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`query.replace("A%", "B%");`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 9 (Structure 4: [Query], [HostLang], [Execute]): Initial query conducts aggregate using SUM and AVG, HLL rewrites order to DESC
    if (spec.manipulation === 'rewrite_order_desc' || spec.qNum === 9) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`query = query.replace("ASC", "DESC")`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`query = query.replace("ASC", "DESC");`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 10: COUNT ids in order, count ids in reviews, compare the two, output bigger of two JOINed with average
    if (spec.manipulation === 'compare_counts_join_avg' || spec.qNum === 10) {
      const altSql = `SELECT COUNT(reviews.id) AS total_count, ROUND(AVG(reviews.score), 2) AS avg_val FROM reviews JOIN orders ON reviews.order_id = orders.id;`;
      const altDialectSql = dialectManager
        ? dialectManager.formatQueryToDialect(altSql, dialectId)
        : altSql;

      if (isPython) {
        blocks.push(`order_ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]\nreview_ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]\n\norder_count = len(order_ids)\nreview_count = len(review_ids)`);
        blocks.push(`if order_count >= review_count:\n    query = """\n${finalDialectSql}\n"""\nelse:\n    query = """\n${altDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let orderIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];\nlet reviewIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];\n\nlet orderCount = orderIds.length;\nlet reviewCount = reviewIds.length;`);
        blocks.push(`let query = "";\nif (orderCount >= reviewCount) {\n  query = \`\n${finalDialectSql}\n\`;\n} else {\n  query = \`\n${altDialectSql}\n\`;\n}`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 11 (Structure 4: [Query], [HostLang], [Execute]): JOIN query, HLL defines 4 strings: 2 column names from the correct answer and 2 irrelevant strings (used for nothing)
    if (spec.manipulation === 'unused_column_strings' || spec.qNum === 11) {
      if (isPython) {
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`col_title = "title"\ncol_category = "category_name"\ncol_status = "status"\ncol_notes = "notes"`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`let colTitle = "title";\nlet colCategory = "category_name";\nlet colStatus = "status";\nlet colNotes = "notes";`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 15: First execution of undefined variable, complex string manipulation on query 1, query 2 overwrites query, execute query 2
    if (spec.manipulation === 'overwrite_query' || spec.qNum === 15) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`db.execute(pending_query)`);
        blocks.push(`filters = ["status = 'COMPLETED'", "amount > 20"]\nquery = query.replace("WHERE amount > 50", "WHERE " + " AND ".join(filters))\nquery = query + " ORDER BY amount DESC"`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`db.execute(pendingQuery);`);
        blocks.push(`let filters = ["status = 'COMPLETED'", "amount > 20"];\nquery = query.replace("WHERE amount > 50", "WHERE " + filters.join(" AND "));\nquery = query + " ORDER BY amount DESC";`);
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 6: Query 1, Execute Query 1, HostLang, Query 2, Delete Query 2
    if (spec.manipulation === 'delete_second_query' || spec.qNum === 6) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
        blocks.push(`sync_checkpoints = ["checkpoint_1", "checkpoint_2"]\nsync_progress = 0\nfor cp in sync_checkpoints:\n    sync_progress += 1`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`del query`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
        blocks.push(`let syncCheckpoints = ["checkpoint_1", "checkpoint_2"];\nlet syncProgress = 0;\nfor (let cp of syncCheckpoints) {\n  syncProgress++;\n}`);
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`delete query;`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 7: Make second query the first query, inspect query in host lang, delete second execute
    if (spec.manipulation === 'delete_second_execute' || spec.qNum === 7) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
        blocks.push(`query_clauses = ["SELECT", "WHERE", "GROUP BY"]\nactive_clauses = [c for c in query_clauses if c in query]`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
        blocks.push(`let queryClauses = ["SELECT", "WHERE", "GROUP BY"];\nlet activeClauses = queryClauses.filter(c => query.includes(c));`);
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 3 (Structure 3): String manipulation on undefined query, query AVG(amount) on orders, irrelevant math expression, execute
    if (spec.manipulation === 'undefined_query_string' || spec.qNum === 3) {
      if (isPython) {
        blocks.push(`formatted_sql = query.replace("WHERE", "").strip()`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`total_score = (100 * 2) + 50`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let formattedSql = query.replace("WHERE", "").trim();`);
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`let totalScore = (100 * 2) + 50;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 5 (Structure 5): Query 1 AVG on orders, omit execute 1, HLL string concatenation, Query 2 MIN on reviews, execute 2
    if (spec.manipulation === 'omit_first_execute' || spec.qNum === 5) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`str1 = "Review"\nstr2 = "Score"\ncombined_text = str1 + str2`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`let str1 = "Review";\nlet str2 = "Score";\nlet combinedText = str1 + str2;`);
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Structure 2 manipulation: typo_second_query
    if (spec.manipulation === 'typo_second_query') {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`clean_sql = query.strip()\nif "GROUP BY" in clean_sql:\n    active_filter = "valid query criteria"`);
        blocks.push(`quey = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`let cleanSql = query.trim();\nlet activeFilter = "";\nif (cleanSql.includes("GROUP BY")) {\n  activeFilter = "valid query criteria";\n}`);
        blocks.push(`let quey = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    switch (structureType) {
      case 1:
        // Structure 1: [Python/JavaScript], [Query], [Execute]
        if (isPython) {
          blocks.push(`status_codes = [200, 201, 204]\nvalid_count = 0\nfor code in status_codes:\n    valid_count += 1`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let statusCodes = [200, 201, 204];\nlet validCount = 0;\nfor (let code of statusCodes) {\n  validCount++;\n}`);
          blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        break;

      case 2:
        // Structure 2: [Query], [Python/JavaScript], [Query], [Execute]
        if (isPython) {
          blocks.push(`query = """\n${initialDialectSql}\n"""`);
          blocks.push(`clean_sql = query.strip()\nif "WHERE" in clean_sql:\n    active_filter = "valid query criteria"`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
          blocks.push(`let cleanSql = query.trim();\nlet activeFilter = "";\nif (cleanSql.includes("WHERE")) {\n  activeFilter = "valid query criteria";\n}`);
          blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        break;

      case 3:
        // Structure 3: [Python/JavaScript], [Query], [Python/JavaScript], [Execute]
        if (isPython) {
          blocks.push(`retry_counter = 0\nwhile retry_counter < 2:\n    retry_counter += 1`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`audit_trail = []\naudit_trail.append(f"Attempt {retry_counter} successfully parsed")`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let retryCounter = 0;\nwhile (retryCounter < 2) {\n  retryCounter++;\n}`);
          blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`let auditTrail = [];\nauditTrail.push(\`Attempt \${retryCounter} successfully parsed\`);`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        break;

      case 4:
        // Structure 4: [Query], [Python/JavaScript], [Execute]
        if (isPython) {
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`batch_records = ["batch_a", "batch_b", "batch_c"]\nprocessed_count = 0\nfor record in batch_records:\n    processed_count += 1`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`let batchRecords = ["batch_a", "batch_b", "batch_c"];\nlet processedCount = 0;\nfor (let record of batchRecords) {\n  processedCount++;\n}`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        break;

      case 5:
        // Structure 5: [Query], [Execute], [Python/JavaScript], [Query], [Execute]
        if (isPython) {
          blocks.push(`query = """\n${setupDialectSql}\n"""`);
          blocks.push(`db.execute(query)`);
          blocks.push(`sync_checkpoints = ["checkpoint_1", "checkpoint_2"]\nsync_progress = 0\nfor cp in sync_checkpoints:\n    sync_progress += 1`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let query = \`\n${setupDialectSql}\n\`;`);
          blocks.push(`db.execute(query);`);
          blocks.push(`let syncCheckpoints = ["checkpoint_1", "checkpoint_2"];\nlet syncProgress = 0;\nfor (let cp of syncCheckpoints) {\n  syncProgress++;\n}`);
          blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        break;

      default:
        if (isPython) {
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        break;
    }

    return blocks.join('\n\n');
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

    const outputVarNames = ['result_table', 'table_data', 'query_output', 'summary_rows'];
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

  generateTableOptions(groundTruthResult, schema, rawSql, questionSpec = null, qNum = null, hostLanguage = 'javascript') {
    if (!groundTruthResult || !groundTruthResult.columns || groundTruthResult.columns.length === 0 || !groundTruthResult.rows || groundTruthResult.rows.length === 0) {
      return this.generateFallbackOptions(schema);
    }

    const correctColumns = [...groundTruthResult.columns];
    const correctRows = groundTruthResult.rows.map(r => Array.isArray(r) ? [...r] : [r]);

    const areRowsEqual = (r1, r2) => {
      if (!r1 || !r2 || r1.length !== r2.length) return false;
      return JSON.stringify(r1) === JSON.stringify(r2);
    };

    const options = [
      {
        columns: correctColumns,
        rows: correctRows,
        isCorrect: true,
        explanation: 'Matches exact query output.'
      }
    ];

    const distractorCandidates = [];

    // Helper to run query against SQLite engine if available
    const runSql = (queryStr) => {
      if (!queryStr) return null;
      try {
        if (typeof window !== 'undefined' && window.app && window.app.sqliteEngine && typeof window.app.sqliteEngine.executeQuery === 'function') {
          const res = window.app.sqliteEngine.executeQuery(queryStr);
          if (res && res.success && res.rows && res.rows.length > 0) {
            return res.rows.map(r => Array.isArray(r) ? [...r] : [r]);
          }
        }
      } catch (e) {}
      return null;
    };

    const runSqlWithMeta = (queryStr) => {
      if (!queryStr) return null;
      try {
        if (typeof window !== 'undefined' && window.app && window.app.sqliteEngine && typeof window.app.sqliteEngine.executeQuery === 'function') {
          const res = window.app.sqliteEngine.executeQuery(queryStr);
          if (res && res.success && res.rows && res.rows.length > 0) {
            return {
              columns: res.columns,
              rows: res.rows.map(r => Array.isArray(r) ? [...r] : [r])
            };
          }
        }
      } catch (e) {}
      return null;
    };

    // Candidate 1: Result of initialSql (Structure 2 / manipulation distractor)
    if (questionSpec && questionSpec.initialSql && questionSpec.initialSql !== questionSpec.finalSql && qNum !== 5 && questionSpec.qNum !== 5 && questionSpec.manipulation !== 'omit_first_execute') {
      const initRows = runSql(questionSpec.initialSql);
      if (initRows && initRows.length > 0 && !areRowsEqual(initRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: initRows.slice(0, 30),
          isCorrect: false,
          explanation: questionSpec.manipulation === 'delete_query'
            ? 'Evaluates the first query which was deleted prior to execution.'
            : 'Evaluates the first query before modification.'
        });
      }
    }

    // Question 1 specific distractors (tests sorting expectation vs natural order after removing ORDER BY)
    const isQ1 = (qNum === 1 || (rawSql && rawSql.includes('FROM orders JOIN users ON orders.user_id = users.id')));
    if (isQ1) {
      const descSql = rawSql.replace(/;?\s*$/, '') + ' ORDER BY orders.id DESC;';
      const descRows = runSql(descSql);
      if (descRows && descRows.length > 0 && !areRowsEqual(descRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: descRows.slice(0, 30),
          isCorrect: false,
          explanation: 'Assumes rows are sorted by orders.id in descending order.'
        });
      }
      const amountDescSql = rawSql.replace(/;?\s*$/, '') + ' ORDER BY orders.amount DESC;';
      const amountDescRows = runSql(amountDescSql);
      if (amountDescRows && amountDescRows.length > 0 && !areRowsEqual(amountDescRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: amountDescRows.slice(0, 30),
          isCorrect: false,
          explanation: 'Assumes rows are sorted by orders.amount in descending order.'
        });
      }
    }

    // Question 8 specific distractors (distinct, non-overlapping options)
    if (qNum === 8 || (questionSpec && (questionSpec.manipulation === 'append_function' || questionSpec.qNum === 8))) {
      const uTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'users') || schema.tables[0]) : null;
      const uTableName = uTable ? uTable.name : 'users';

      // Distractor 1: Assumes append_to_query("ORDER BY id DESC") modified the query
      const descSql = `SELECT id, name FROM ${uTableName} WHERE id <= 5 ORDER BY id DESC;`;
      let descRows = runSql(descSql);
      if ((!descRows || descRows.length === 0) && uTable && uTable.rows) {
        descRows = uTable.rows.filter(r => r.id <= 5).sort((a, b) => b.id - a.id).map(r => [r.id, r.name]);
      }
      if (descRows && descRows.length > 0 && !areRowsEqual(descRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: descRows,
          isCorrect: false,
          explanation: 'Assumes the append function call modified the query to sort by id DESC.'
        });
      }

      // Distractor 2: Assumes default table order (id ASC) without applying ORDER BY name ASC
      const idAscSql = `SELECT id, name FROM ${uTableName} WHERE id <= 5 ORDER BY id ASC;`;
      let idAscRows = runSql(idAscSql);
      if ((!idAscRows || idAscRows.length === 0) && uTable && uTable.rows) {
        idAscRows = uTable.rows.filter(r => r.id <= 5).sort((a, b) => a.id - b.id).map(r => [r.id, r.name]);
      }
      if (idAscRows && idAscRows.length > 0 && !areRowsEqual(idAscRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: idAscRows,
          isCorrect: false,
          explanation: 'Assumes rows are sorted by id ASC instead of name ASC.'
        });
      }

      // Distractor 3: Inverted filter range (WHERE id > 5 AND id <= 10 ORDER BY name ASC)
      const altRangeSql = `SELECT id, name FROM ${uTableName} WHERE id > 5 AND id <= 10 ORDER BY name ASC;`;
      let altRangeRows = runSql(altRangeSql);
      if ((!altRangeRows || altRangeRows.length === 0) && uTable && uTable.rows) {
        altRangeRows = uTable.rows.filter(r => r.id > 5 && r.id <= 10).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(r => [r.id, r.name]);
      }
      if (altRangeRows && altRangeRows.length > 0 && !areRowsEqual(altRangeRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: altRangeRows,
          isCorrect: false,
          explanation: 'Evaluates an alternative filter range (ids 6 to 10).'
        });
      }
    }

    // Question 4 specific distractors (tests misconception that query.replace mutated the string)
    if (qNum === 4 || (questionSpec && (questionSpec.manipulation === 'noop_replace' || questionSpec.qNum === 4))) {
      const uTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'users') || schema.tables[0]) : null;
      const uTableName = uTable ? uTable.name : 'users';

      // Distractor 1: Result if replace("A%", "B%") had mutated query
      const bSql = `SELECT id, name FROM ${uTableName} WHERE name LIKE 'B%';`;
      let bRows = runSql(bSql);
      if ((!bRows || bRows.length === 0) && uTable && uTable.rows) {
        bRows = uTable.rows.filter(r => (r.name || '').startsWith('B')).map(r => [r.id, r.name]);
      }
      if (bRows && bRows.length > 0 && !areRowsEqual(bRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: bRows,
          isCorrect: false,
          explanation: 'Assumes query.replace("A%", "B%") mutated the query in-place.'
        });
      }

      // Distractor 2: Result if replace matched 'C%'
      const cSql = `SELECT id, name FROM ${uTableName} WHERE name LIKE 'C%';`;
      let cRows = runSql(cSql);
      if ((!cRows || cRows.length === 0) && uTable && uTable.rows) {
        cRows = uTable.rows.filter(r => (r.name || '').startsWith('C')).map(r => [r.id, r.name]);
      }
      if (cRows && cRows.length > 0 && !areRowsEqual(cRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: cRows.slice(0, 5),
          isCorrect: false,
          explanation: 'Evaluates an alternative LIKE pattern (names starting with C).'
        });
      }

      // Distractor 3: Unfiltered users projection (first 4 users)
      if (uTable && uTable.rows) {
        const sampleRows = uTable.rows.slice(0, 4).map(r => [r.id, r.name]);
        if (!areRowsEqual(sampleRows, correctRows)) {
          distractorCandidates.push({
            columns: correctColumns,
            rows: sampleRows,
            isCorrect: false,
            explanation: 'Unfiltered table rows without applying the LIKE filter.'
          });
        }
      }
    }

    // Question 9 specific distractors (tests aggregate with SUM and AVG rewritten by HLL to order by order_id DESC)
    if (qNum === 9 || (questionSpec && (questionSpec.manipulation === 'rewrite_order_desc' || questionSpec.qNum === 9))) {
      const rTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'reviews') || schema.tables[0]) : null;
      const rTableName = rTable ? rTable.name : 'reviews';
      const q9Distractors = [];

      // Distractor 1: Initial query output before HLL rewrite (maintains ORDER BY order_id ASC)
      const ascSql = `SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM ${rTableName} GROUP BY order_id ORDER BY order_id ASC;`;
      let ascRes = runSqlWithMeta(ascSql);
      let ascCols = (ascRes && ascRes.columns) ? ascRes.columns : ['order_id', 'total_score', 'avg_score'];
      let ascRows = ascRes ? ascRes.rows : null;
      if (!ascRows && rTable && rTable.rows) {
        const groups = {};
        rTable.rows.forEach(r => {
          const oid = r.order_id || 1;
          if (!groups[oid]) groups[oid] = [];
          groups[oid].push(Number(r.score) || 0);
        });
        const oids = Object.keys(groups).map(Number).sort((a, b) => a - b);
        ascRows = oids.map(oid => {
          const scores = groups[oid];
          const tot = scores.reduce((a, b) => a + b, 0);
          const avg = Number((tot / scores.length).toFixed(2));
          return [oid, tot, avg];
        });
      }
      if (ascRows && ascRows.length > 0 && !areRowsEqual(ascRows, correctRows)) {
        q9Distractors.push({
          columns: ascCols,
          rows: ascRows,
          isCorrect: false,
          explanation: 'Evaluates the initial query (ordered by order_id ASC), assuming the HLL string rewrite to DESC was not applied.'
        });
      }

      // Distractor 2: Evaluates with item_count and max_score sorted by item_count DESC (differs from Option A)
      const countSql = `SELECT order_id, COUNT(*) AS item_count, ROUND(AVG(score), 2) AS avg_score, MAX(score) AS max_score FROM ${rTableName} GROUP BY order_id ORDER BY item_count DESC;`;
      let countRes = runSqlWithMeta(countSql);
      let countCols = (countRes && countRes.columns) ? countRes.columns : ['order_id', 'item_count', 'avg_score', 'max_score'];
      let countRows = countRes ? countRes.rows : null;
      if (!countRows && rTable && rTable.rows) {
        const groups = {};
        rTable.rows.forEach(r => {
          const oid = r.order_id || 1;
          if (!groups[oid]) groups[oid] = [];
          groups[oid].push(Number(r.score) || 0);
        });
        const oids = Object.keys(groups).map(Number);
        countRows = oids.map(oid => {
          const scores = groups[oid];
          const cnt = scores.length;
          const tot = scores.reduce((a, b) => a + b, 0);
          const avg = Number((tot / cnt).toFixed(2));
          const max = Math.max(...scores);
          return [oid, cnt, avg, max];
        }).sort((a, b) => b[1] - a[1]);
      }
      if (countRows && countRows.length > 0 && !areRowsEqual(countRows, correctRows)) {
        q9Distractors.push({
          columns: countCols,
          rows: countRows,
          isCorrect: false,
          explanation: 'Evaluates item_count and max_score sorted by item_count DESC.'
        });
      }

      // Distractor 3: Sorted by total_score DESC with extra min_score column
      const scoreSortSql = `SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score, MIN(score) AS min_score FROM ${rTableName} GROUP BY order_id ORDER BY total_score DESC;`;
      let scoreSortRes = runSqlWithMeta(scoreSortSql);
      let scoreSortCols = (scoreSortRes && scoreSortRes.columns) ? scoreSortRes.columns : ['order_id', 'total_score', 'avg_score', 'min_score'];
      let scoreSortRows = scoreSortRes ? scoreSortRes.rows : null;
      if (!scoreSortRows && rTable && rTable.rows) {
        const groups = {};
        rTable.rows.forEach(r => {
          const oid = r.order_id || 1;
          if (!groups[oid]) groups[oid] = [];
          groups[oid].push(Number(r.score) || 0);
        });
        const oids = Object.keys(groups).map(Number);
        scoreSortRows = oids.map(oid => {
          const scores = groups[oid];
          const tot = scores.reduce((a, b) => a + b, 0);
          const avg = Number((tot / scores.length).toFixed(2));
          const min = Math.min(...scores);
          return [oid, tot, avg, min];
        }).sort((a, b) => b[1] - a[1]);
      }
      if (scoreSortRows && scoreSortRows.length > 0 && !areRowsEqual(scoreSortRows, correctRows)) {
        q9Distractors.push({
          columns: scoreSortCols,
          rows: scoreSortRows,
          isCorrect: false,
          explanation: 'Assumes the query was sorted by total_score DESC with an extra min_score column.'
        });
      }

      if (q9Distractors.length >= 3) {
        options.push(...q9Distractors.slice(0, 3));
        return options;
      }
    }

    // Question 10 specific distractors (tests comparing order count vs review count and evaluating JOIN with AVG)
    if (qNum === 10 || (questionSpec && (questionSpec.manipulation === 'compare_counts_join_avg' || questionSpec.qNum === 10))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const rTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'reviews') || schema.tables[1]) : null;
      const oTableName = oTable ? oTable.name : 'orders';
      const rTableName = rTable ? rTable.name : 'reviews';
      const q10Distractors = [];

      // Distractor 1: Evaluates the alternate branch (reviews joined with orders, using AVG(reviews.score))
      const altSql = `SELECT COUNT(${rTableName}.id) AS total_count, ROUND(AVG(${rTableName}.score), 2) AS avg_val FROM ${rTableName} JOIN ${oTableName} ON ${rTableName}.order_id = ${oTableName}.id;`;
      let altRes = runSqlWithMeta(altSql);
      let altCols = (altRes && altRes.columns) ? altRes.columns : ['total_count', 'avg_val'];
      let altRows = altRes ? altRes.rows : null;
      if (altRows && altRows.length > 0 && !areRowsEqual(altRows, correctRows)) {
        q10Distractors.push({
          columns: altCols,
          rows: altRows,
          isCorrect: false,
          explanation: 'Evaluates the alternative branch assuming reviews had the higher count and computes AVG(score).'
        });
      }

      // Distractor 2: Evaluates orders count and AVG(amount) without the JOIN
      const noJoinSql = `SELECT COUNT(id) AS total_count, ROUND(AVG(amount), 2) AS avg_val FROM ${oTableName};`;
      let noJoinRes = runSqlWithMeta(noJoinSql);
      let noJoinCols = (noJoinRes && noJoinRes.columns) ? noJoinRes.columns : ['total_count', 'avg_val'];
      let noJoinRows = noJoinRes ? noJoinRes.rows : null;
      if (noJoinRows && noJoinRows.length > 0 && !areRowsEqual(noJoinRows, correctRows)) {
        q10Distractors.push({
          columns: noJoinCols,
          rows: noJoinRows,
          isCorrect: false,
          explanation: 'Evaluates COUNT and AVG on orders without joining the reviews table.'
        });
      }

      // Distractor 3: Evaluates SUM(amount) instead of AVG(amount) on the joined tables
      const sumSql = `SELECT COUNT(${oTableName}.id) AS total_count, ROUND(SUM(${oTableName}.amount), 2) AS avg_val FROM ${oTableName} JOIN ${rTableName} ON ${oTableName}.id = ${rTableName}.order_id;`;
      let sumRes = runSqlWithMeta(sumSql);
      let sumCols = (sumRes && sumRes.columns) ? sumRes.columns : ['total_count', 'avg_val'];
      let sumRows = sumRes ? sumRes.rows : null;
      if (sumRows && sumRows.length > 0 && !areRowsEqual(sumRows, correctRows)) {
        q10Distractors.push({
          columns: sumCols,
          rows: sumRows,
          isCorrect: false,
          explanation: 'Computes SUM(amount) instead of AVG(amount) across joined records.'
        });
      }

      if (q10Distractors.length >= 3) {
        options.push(...q10Distractors.slice(0, 3));
        return options;
      }
    }

    // Question 11 specific distractors (tests JOIN on products & categories with wrong column projections)
    if (qNum === 11 || (questionSpec && (questionSpec.qNum === 11 || (questionSpec.operators && questionSpec.operators.includes('JOIN') && questionSpec.structure === 4)))) {
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[0]) : null;
      const cTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'categories') || schema.tables[1]) : null;
      const pTableName = pTable ? pTable.name : 'products';
      const cTableName = cTable ? cTable.name : 'categories';
      const q11Distractors = [];

      // Distractor 1: Same JOIN, but includes unnecessary category_id foreign key column (5 columns)
      const d1Sql = `SELECT ${pTableName}.id, ${pTableName}.title, ${pTableName}.category_id, ${cTableName}.name AS category_name, ${pTableName}.price FROM ${pTableName} JOIN ${cTableName} ON ${pTableName}.category_id = ${cTableName}.id WHERE ${pTableName}.id <= 5 ORDER BY ${pTableName}.id ASC;`;
      let d1Res = runSqlWithMeta(d1Sql);
      let d1Cols = (d1Res && d1Res.columns) ? d1Res.columns : ['id', 'title', 'category_id', 'category_name', 'price'];
      let d1Rows = d1Res ? d1Res.rows : null;
      if (!d1Rows && correctRows) {
        d1Rows = correctRows.map((r, i) => [r[0], r[1], (pTable && pTable.rows && pTable.rows[i]) ? pTable.rows[i].category_id || 1 : 1, r[2], r[3]]);
      }
      if (d1Rows && d1Rows.length > 0 && !areRowsEqual(d1Rows, correctRows)) {
        q11Distractors.push({
          columns: d1Cols,
          rows: d1Rows,
          isCorrect: false,
          explanation: 'Evaluates the JOIN result with an extra category_id foreign key column.'
        });
      }

      // Distractor 2: Same JOIN, but omits the joined category_name column (3 columns)
      const d2Sql = `SELECT ${pTableName}.id, ${pTableName}.title, ${pTableName}.price FROM ${pTableName} JOIN ${cTableName} ON ${pTableName}.category_id = ${cTableName}.id WHERE ${pTableName}.id <= 5 ORDER BY ${pTableName}.id ASC;`;
      let d2Res = runSqlWithMeta(d2Sql);
      let d2Cols = (d2Res && d2Res.columns) ? d2Res.columns : ['id', 'title', 'price'];
      let d2Rows = d2Res ? d2Res.rows : null;
      if (!d2Rows && correctRows) {
        d2Rows = correctRows.map(r => [r[0], r[1], r[3]]);
      }
      if (d2Rows && d2Rows.length > 0 && !areRowsEqual(d2Rows, correctRows)) {
        q11Distractors.push({
          columns: d2Cols,
          rows: d2Rows,
          isCorrect: false,
          explanation: 'Evaluates the JOIN result but omits the joined category_name column.'
        });
      }

      // Distractor 3: Same JOIN, but includes extra stock inventory column (5 columns)
      const d3Sql = `SELECT ${pTableName}.id, ${pTableName}.title, ${cTableName}.name AS category_name, ${pTableName}.stock, ${pTableName}.price FROM ${pTableName} JOIN ${cTableName} ON ${pTableName}.category_id = ${cTableName}.id WHERE ${pTableName}.id <= 5 ORDER BY ${pTableName}.id ASC;`;
      let d3Res = runSqlWithMeta(d3Sql);
      let d3Cols = (d3Res && d3Res.columns) ? d3Res.columns : ['id', 'title', 'category_name', 'stock', 'price'];
      let d3Rows = d3Res ? d3Res.rows : null;
      if (!d3Rows && correctRows) {
        d3Rows = correctRows.map((r, i) => [r[0], r[1], r[2], (pTable && pTable.rows && pTable.rows[i]) ? pTable.rows[i].stock || 50 : 50, r[3]]);
      }
      if (d3Rows && d3Rows.length > 0 && !areRowsEqual(d3Rows, correctRows)) {
        q11Distractors.push({
          columns: d3Cols,
          rows: d3Rows,
          isCorrect: false,
          explanation: 'Evaluates the JOIN result with an extra stock inventory column.'
        });
      }

      // Distractor 4 fallback: Same JOIN, but includes extra priority column (5 columns)
      const d4Sql = `SELECT ${pTableName}.id, ${pTableName}.title, ${cTableName}.name AS category_name, ${cTableName}.priority, ${pTableName}.price FROM ${pTableName} JOIN ${cTableName} ON ${pTableName}.category_id = ${cTableName}.id WHERE ${pTableName}.id <= 5 ORDER BY ${pTableName}.id ASC;`;
      let d4Res = runSqlWithMeta(d4Sql);
      let d4Cols = (d4Res && d4Res.columns) ? d4Res.columns : ['id', 'title', 'category_name', 'priority', 'price'];
      let d4Rows = d4Res ? d4Res.rows : null;
      if (!d4Rows && correctRows) {
        d4Rows = correctRows.map((r, i) => [r[0], r[1], r[2], 3, r[3]]);
      }
      if (d4Rows && d4Rows.length > 0 && !areRowsEqual(d4Rows, correctRows)) {
        q11Distractors.push({
          columns: d4Cols,
          rows: d4Rows,
          isCorrect: false,
          explanation: 'Evaluates the JOIN result with an extra categories.priority column.'
        });
      }

      if (q11Distractors.length >= 3) {
        options.push(...q11Distractors.slice(0, 3));
        return options;
      }
    }

    // Question 12 specific distractors (tests JOIN + UNION across orders and users)
    if (qNum === 12 || (questionSpec && (questionSpec.qNum === 12 || questionSpec.manipulation === 'join_union'))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const uTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'users') || schema.tables[1]) : null;
      const oTableName = oTable ? oTable.name : 'orders';
      const uTableName = uTable ? uTable.name : 'users';
      const q12Distractors = [];

      // Distractor 1: Evaluates only the first branch of the UNION (amount > 100)
      const b1Sql = `SELECT ${oTableName}.id, ${uTableName}.name, ${oTableName}.amount FROM ${oTableName} JOIN ${uTableName} ON ${oTableName}.user_id = ${uTableName}.id WHERE ${oTableName}.amount > 100;`;
      let b1Res = runSqlWithMeta(b1Sql);
      let b1Cols = (b1Res && b1Res.columns) ? b1Res.columns : correctColumns;
      let b1Rows = b1Res ? b1Res.rows : null;
      if (b1Rows && b1Rows.length > 0 && !areRowsEqual(b1Rows, correctRows)) {
        q12Distractors.push({
          columns: b1Cols,
          rows: b1Rows,
          isCorrect: false,
          explanation: 'Evaluates only the first query in the compound UNION statement (orders with amount > 100).'
        });
      }

      // Distractor 2: Evaluates only the second branch of the UNION (status = 'COMPLETED')
      const b2Sql = `SELECT ${oTableName}.id, ${uTableName}.name, ${oTableName}.amount FROM ${oTableName} JOIN ${uTableName} ON ${oTableName}.user_id = ${uTableName}.id WHERE ${oTableName}.status = 'COMPLETED';`;
      let b2Res = runSqlWithMeta(b2Sql);
      let b2Cols = (b2Res && b2Res.columns) ? b2Res.columns : correctColumns;
      let b2Rows = b2Res ? b2Res.rows : null;
      if (b2Rows && b2Rows.length > 0 && !areRowsEqual(b2Rows, correctRows)) {
        q12Distractors.push({
          columns: b2Cols,
          rows: b2Rows,
          isCorrect: false,
          explanation: "Evaluates only the second query in the compound UNION statement (orders with status = 'COMPLETED')."
        });
      }

      // Distractor 3: Evaluates the joined UNION statement with an additional status column included in the projection
      const statusSql = `SELECT ${oTableName}.id, ${uTableName}.name, ${oTableName}.amount, ${oTableName}.status FROM ${oTableName} JOIN ${uTableName} ON ${oTableName}.user_id = ${uTableName}.id WHERE ${oTableName}.amount > 100 UNION SELECT ${oTableName}.id, ${uTableName}.name, ${oTableName}.amount, ${oTableName}.status FROM ${oTableName} JOIN ${uTableName} ON ${oTableName}.user_id = ${uTableName}.id WHERE ${oTableName}.status = 'COMPLETED';`;
      let statusRes = runSqlWithMeta(statusSql);
      let statusCols = (statusRes && statusRes.columns) ? statusRes.columns : ['id', 'name', 'amount', 'status'];
      let statusRows = statusRes ? statusRes.rows : null;
      if (statusRows && statusRows.length > 0 && !areRowsEqual(statusRows, correctRows)) {
        q12Distractors.push({
          columns: statusCols,
          rows: statusRows,
          isCorrect: false,
          explanation: 'Evaluates the joined UNION statement with an additional status column included in the projection.'
        });
      }

      if (q12Distractors.length >= 3) {
        options.push(...q12Distractors.slice(0, 3));
        return options;
      }
    }

    // Question 15 specific distractors (tests tracking the modified query 1 instead of overwritten query 2)
    if (qNum === 15 || (questionSpec && (questionSpec.manipulation === 'overwrite_query' || questionSpec.qNum === 15))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const oTableName = oTable ? oTable.name : 'orders';

      // Distractor 1: Inverted sort order of query 2 (ORDER BY order_count ASC)
      const invSortSql = `SELECT status, COUNT(*) AS order_count FROM ${oTableName} GROUP BY status ORDER BY order_count ASC;`;
      let invSortRows = runSql(invSortSql);
      if (invSortRows && invSortRows.length > 0 && !areRowsEqual(invSortRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: invSortRows,
          isCorrect: false,
          explanation: 'Inverted sort order for the executed query (ASC instead of DESC).'
        });
      }

      // Distractor 2: Evaluates the query using SUM(amount) instead of COUNT(*)
      const sumSql = `SELECT status, ROUND(SUM(amount), 1) AS order_count FROM ${oTableName} GROUP BY status ORDER BY order_count DESC;`;
      let sumRows = runSql(sumSql);
      if (sumRows && sumRows.length > 0 && !areRowsEqual(sumRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: sumRows,
          isCorrect: false,
          explanation: 'Evaluates SUM(amount) instead of COUNT(*).'
        });
      }

      // Distractor 3: Unfiltered group counts (without ORDER BY)
      const unfiltGroupSql = `SELECT status, COUNT(*) AS order_count FROM ${oTableName} GROUP BY status;`;
      let unfiltGroupRows = runSql(unfiltGroupSql);
      if (unfiltGroupRows && unfiltGroupRows.length > 0 && !areRowsEqual(unfiltGroupRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: unfiltGroupRows,
          isCorrect: false,
          explanation: 'Evaluates group count without applying sort order.'
        });
      }
    }

    // Question 6 specific distractors (tests if participant assumed query 2 was executed instead of deleted)
    // Wrong solutions include extra columns (4-5 columns) and shuffled sort orders to easily distinguish them from correct answer
    if (qNum === 6 || (questionSpec && (questionSpec.manipulation === 'delete_second_query' || questionSpec.qNum === 6))) {
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[0]) : null;
      const pTableName = pTable ? pTable.name : 'products';

      // Distractor 1: 5 columns (category_id, max_price, min_price, item_count, avg_price) shuffled by category_id DESC
      const q2Sql = `SELECT category_id, MAX(price) AS max_price, MIN(price) AS min_price, COUNT(*) AS item_count, ROUND(AVG(price), 2) AS avg_price FROM ${pTableName} WHERE price > 35 GROUP BY category_id ORDER BY category_id DESC;`;
      let q2Res = runSqlWithMeta(q2Sql);
      let q2Cols = (q2Res && q2Res.columns) ? q2Res.columns : ['category_id', 'max_price', 'min_price', 'item_count', 'avg_price'];
      let q2Rows = q2Res ? q2Res.rows : null;
      if (!q2Rows && pTable && pTable.rows) {
        const groups = {};
        pTable.rows.filter(r => (Number(r.price) || 0) > 35).forEach(r => {
          const cid = r.category_id || 1;
          if (!groups[cid]) groups[cid] = [];
          groups[cid].push(Number(r.price) || 0);
        });
        const cids = Object.keys(groups).map(Number);
        q2Rows = cids.map(cid => {
          const prices = groups[cid];
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const cnt = prices.length;
          const avgP = Number((prices.reduce((a, b) => a + b, 0) / cnt).toFixed(2));
          return [cid, maxP, minP, cnt, avgP];
        }).sort((a, b) => b[0] - a[0]);
      }

      // Distractor 2: 5 columns (category_id, min_price, max_price, total_stock, avg_rating) shuffled by total_stock DESC
      const stockSql = `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price, SUM(stock) AS total_stock, ROUND(AVG(rating), 1) AS avg_rating FROM ${pTableName} WHERE price > 20 GROUP BY category_id ORDER BY total_stock DESC;`;
      let stockRes = runSqlWithMeta(stockSql);
      let stockCols = (stockRes && stockRes.columns) ? stockRes.columns : ['category_id', 'min_price', 'max_price', 'total_stock', 'avg_rating'];
      let stockRows = stockRes ? stockRes.rows : null;
      if (!stockRows && pTable && pTable.rows) {
        const groups = {};
        pTable.rows.filter(r => (Number(r.price) || 0) > 20).forEach(r => {
          const cid = r.category_id || 1;
          if (!groups[cid]) groups[cid] = { prices: [], stocks: [], ratings: [] };
          groups[cid].prices.push(Number(r.price) || 0);
          groups[cid].stocks.push(Number(r.stock) || 0);
          groups[cid].ratings.push(Number(r.rating) || 0);
        });
        const cids = Object.keys(groups).map(Number);
        stockRows = cids.map(cid => {
          const g = groups[cid];
          const minP = Math.min(...g.prices);
          const maxP = Math.max(...g.prices);
          const totStock = g.stocks.reduce((a, b) => a + b, 0);
          const avgRat = Number((g.ratings.reduce((a, b) => a + b, 0) / (g.ratings.length || 1)).toFixed(1));
          return [cid, minP, maxP, totStock, avgRat];
        }).sort((a, b) => b[3] - a[3]);
      }

      // Distractor 3: 4 columns (category_id, min_price, max_price, product_count) shuffled by min_price DESC
      const unfiltSql = `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price, COUNT(*) AS product_count FROM ${pTableName} GROUP BY category_id ORDER BY min_price DESC;`;
      let unfiltRes = runSqlWithMeta(unfiltSql);
      let unfiltCols = (unfiltRes && unfiltRes.columns) ? unfiltRes.columns : ['category_id', 'min_price', 'max_price', 'product_count'];
      let unfiltRows = unfiltRes ? unfiltRes.rows : null;
      if (!unfiltRows && pTable && pTable.rows) {
        const groups = {};
        pTable.rows.forEach(r => {
          const cid = r.category_id || 1;
          if (!groups[cid]) groups[cid] = [];
          groups[cid].push(Number(r.price) || 0);
        });
        const cids = Object.keys(groups).map(Number);
        unfiltRows = cids.map(cid => {
          const prices = groups[cid];
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const cnt = prices.length;
          return [cid, minP, maxP, cnt];
        }).sort((a, b) => b[1] - a[1]);
      }

      // Distractor 4 fallback: 4 columns (category_id, min_price, max_price, total_value) shuffled by total_value DESC
      const valSql = `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price, ROUND(SUM(price), 2) AS total_value FROM ${pTableName} WHERE price > 20 GROUP BY category_id ORDER BY total_value DESC;`;
      let valRes = runSqlWithMeta(valSql);
      let valCols = (valRes && valRes.columns) ? valRes.columns : ['category_id', 'min_price', 'max_price', 'total_value'];
      let valRows = valRes ? valRes.rows : null;

      const q6Distractors = [];
      if (q2Rows && q2Rows.length > 0 && !areRowsEqual(q2Rows, correctRows)) {
        q6Distractors.push({
          columns: q2Cols,
          rows: q2Rows,
          isCorrect: false,
          explanation: 'Evaluates query 2 with extra aggregate summary columns (item_count, avg_price) sorted by category_id DESC.'
        });
      }
      if (stockRows && stockRows.length > 0 && !areRowsEqual(stockRows, correctRows)) {
        q6Distractors.push({
          columns: stockCols,
          rows: stockRows,
          isCorrect: false,
          explanation: 'Evaluates query 1 with extra inventory and rating columns (total_stock, avg_rating) sorted by total_stock DESC.'
        });
      }
      if (unfiltRows && unfiltRows.length > 0 && !areRowsEqual(unfiltRows, correctRows)) {
        q6Distractors.push({
          columns: unfiltCols,
          rows: unfiltRows,
          isCorrect: false,
          explanation: 'Evaluates unfiltered MIN/MAX with an extra product_count column sorted by min_price DESC.'
        });
      }
      if (q6Distractors.length < 3 && valRows && valRows.length > 0 && !areRowsEqual(valRows, correctRows)) {
        q6Distractors.push({
          columns: valCols,
          rows: valRows,
          isCorrect: false,
          explanation: 'Evaluates MIN/MAX with an extra total_value column sorted by total_value DESC.'
        });
      }

      options.push(...q6Distractors.slice(0, 3));
      return options;
    }

    // Question 7 specific distractors
    if (qNum === 7 || (questionSpec && (questionSpec.manipulation === 'delete_second_execute' || questionSpec.qNum === 7))) {
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[0]) : null;
      const pTableName = pTable ? pTable.name : 'products';

      // Distractor 1 (Unnecessary columns): 4 columns with item_count and avg_price
      const unnecSql = `SELECT category_id, ROUND(SUM(price), 2) AS sum_price, COUNT(*) AS item_count, ROUND(AVG(price), 2) AS avg_price FROM ${pTableName} WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;`;
      let unnecRes = runSqlWithMeta(unnecSql);
      let unnecCols = (unnecRes && unnecRes.columns) ? unnecRes.columns : ['category_id', 'sum_price', 'item_count', 'avg_price'];
      let unnecRows = unnecRes ? unnecRes.rows : null;

      if (!unnecRows && pTable && pTable.rows) {
        const groups = {};
        pTable.rows.filter(r => (Number(r.price) || 0) > 20).forEach(r => {
          const cid = r.category_id || 1;
          if (!groups[cid]) groups[cid] = [];
          groups[cid].push(Number(r.price) || 0);
        });
        const sortedCids = Object.keys(groups).map(Number).sort((a, b) => a - b);
        unnecRows = sortedCids.map(cid => {
          const prices = groups[cid];
          const sum = Number(prices.reduce((a, b) => a + b, 0).toFixed(2));
          const count = prices.length;
          const avg = Number((sum / count).toFixed(2));
          return [cid, sum, count, avg];
        });
      }

      // Distractor 2 (Opposite order): Ordered in opposite way (category_id DESC instead of ASC)
      const invSql = `SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM ${pTableName} WHERE price > 20 GROUP BY category_id ORDER BY category_id DESC;`;
      let invRows = runSql(invSql);
      if ((!invRows || invRows.length === 0) && correctRows.length > 1) {
        invRows = [...correctRows].reverse();
      }

      // Distractor 3 (Alternative Aggregate: Item count instead of sum_price)
      // Visibly and conceptually distinct (integers 1-4 vs sum amounts > $60, with column item_count)
      const countSql = `SELECT category_id, COUNT(*) AS item_count FROM ${pTableName} WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;`;
      let countRes = runSqlWithMeta(countSql);
      let countCols = (countRes && countRes.columns) ? countRes.columns : ['category_id', 'item_count'];
      let countRows = countRes ? countRes.rows : null;

      if (!countRows && pTable && pTable.rows) {
        const groups = {};
        pTable.rows.filter(r => (Number(r.price) || 0) > 20).forEach(r => {
          const cid = r.category_id || 1;
          if (!groups[cid]) groups[cid] = 0;
          groups[cid]++;
        });
        const sortedCids = Object.keys(groups).map(Number).sort((a, b) => a - b);
        countRows = sortedCids.map(cid => [cid, groups[cid]]);
      }

      // Distractor 4 fallback (Single grand total row without GROUP BY)
      const grandTotalSql = `SELECT ROUND(SUM(price), 2) AS sum_price FROM ${pTableName} WHERE price > 20;`;
      let grandTotalRes = runSqlWithMeta(grandTotalSql);
      let grandTotalCols = (grandTotalRes && grandTotalRes.columns) ? grandTotalRes.columns : ['sum_price'];
      let grandTotalRows = grandTotalRes ? grandTotalRes.rows : null;
      if (!grandTotalRows && correctRows && correctRows.length > 0) {
        const total = correctRows.reduce((acc, r) => acc + (Number(r[1]) || 0), 0);
        grandTotalRows = [[parseFloat(total.toFixed(2))]];
      }

      const q7Distractors = [];
      if (unnecRows && unnecRows.length > 0) {
        q7Distractors.push({
          columns: unnecCols,
          rows: unnecRows,
          isCorrect: false,
          explanation: 'Evaluates unnecessary additional columns (item_count, avg_price).'
        });
      }
      if (invRows && invRows.length > 0 && !areRowsEqual(invRows, correctRows)) {
        q7Distractors.push({
          columns: correctColumns,
          rows: invRows,
          isCorrect: false,
          explanation: 'Inverted sort order for query 1 (DESC instead of ASC).'
        });
      }
      if (countRows && countRows.length > 0 && !areRowsEqual(countRows, correctRows)) {
        q7Distractors.push({
          columns: countCols,
          rows: countRows,
          isCorrect: false,
          explanation: 'Evaluates the item count (COUNT) instead of the total price (SUM).'
        });
      }
      if (q7Distractors.length < 3 && grandTotalRows && grandTotalRows.length > 0) {
        q7Distractors.push({
          columns: grandTotalCols,
          rows: grandTotalRows,
          isCorrect: false,
          explanation: 'Evaluates the grand total sum without grouping by category.'
        });
      }

      options.push(...q7Distractors.slice(0, 3));
      return options;
    }

    // Question 3 specific distractors (only 1 numerical choice for average, 1 choice for 250, 2 text-based solutions)
    if (qNum === 3 || (questionSpec && (questionSpec.manipulation === 'undefined_query_string' || questionSpec.qNum === 3))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const oTableName = oTable ? oTable.name : 'orders';
      const assignedGrp = (typeof window !== 'undefined' && window.app && window.app.analytics && typeof window.app.analytics.getAssignedGroup === 'function') ? window.app.analytics.getAssignedGroup() : null;
      const isPython = (hostLanguage === 'python') || (assignedGrp && assignedGrp.hostLanguage === 'python');

      // Distractor 1: Host-language math calculation (total_score = (100 * 2) + 50 -> 250)
      const mathVal = 250;
      const mathRows = [[mathVal]];
      if (!areRowsEqual(mathRows, correctRows)) {
        distractorCandidates.push({
          columns: ['avg_amount'],
          rows: mathRows,
          isCorrect: false,
          explanation: 'Assumes the second host-language arithmetic calculation ((100 * 2) + 50 = 250) is returned.'
        });
      }

      // Distractor 2 (Text-based): Runtime error from referencing undefined query on line 1
      const errorMsg = isPython
        ? "NameError: name 'query' is not defined"
        : "ReferenceError: query is not defined";
      const errorRows = [[errorMsg]];
      if (!areRowsEqual(errorRows, correctRows)) {
        distractorCandidates.push({
          columns: ['error'],
          rows: errorRows,
          isCorrect: false,
          explanation: 'Assumes referencing the undefined variable "query" on line 1 causes a runtime error.'
        });
      }

      // Distractor 3 (Text-based): Unexecuted query text string
      const queryStr = `SELECT AVG(amount) AS avg_amount FROM ${oTableName};`;
      const queryRows = [[queryStr]];
      if (!areRowsEqual(queryRows, correctRows)) {
        distractorCandidates.push({
          columns: ['query'],
          rows: queryRows,
          isCorrect: false,
          explanation: 'Assumes the unexecuted SQL query string is returned as text output.'
        });
      }

      // Distractor 4 (Text-based fallback): Aggregate function name literal string
      const aggRows = [['AVG(amount)']];
      if (!areRowsEqual(aggRows, correctRows)) {
        distractorCandidates.push({
          columns: ['avg_amount'],
          rows: aggRows,
          isCorrect: false,
          explanation: 'Assumes the aggregate expression string "AVG(amount)" is returned instead of being calculated.'
        });
      }

      options.push(...distractorCandidates.slice(0, 3));
      return options;
    }

    // Question 5 specific distractors (tests Structure 5: only correct answer is numeric, all distractors are text)
    if (qNum === 5 || (questionSpec && (questionSpec.manipulation === 'omit_first_execute' || questionSpec.qNum === 5))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const oTableName = oTable ? oTable.name : 'orders';
      const q5Distractors = [];

      // Distractor 1 (Text-based): Host-language string concatenation result ("ReviewScore")
      const strRows = [['ReviewScore']];
      if (!areRowsEqual(strRows, correctRows)) {
        q5Distractors.push({
          columns: ['combined_text'],
          rows: strRows,
          isCorrect: false,
          explanation: 'Assumes the host-language string concatenation ("ReviewScore") is returned as the table output.'
        });
      }

      // Distractor 2 (Text-based): String literal of the aggregate expression ("MIN(score)")
      const aggRows = [['MIN(score)']];
      if (!areRowsEqual(aggRows, correctRows)) {
        q5Distractors.push({
          columns: ['min_score'],
          rows: aggRows,
          isCorrect: false,
          explanation: 'Assumes the aggregate expression string "MIN(score)" is returned instead of the evaluated minimum numeric score.'
        });
      }

      // Distractor 3 (Text-based): First unexecuted SQL query string
      const q1Str = `SELECT AVG(amount) AS avg_amount FROM ${oTableName};`;
      const q1Rows = [[q1Str]];
      if (!areRowsEqual(q1Rows, correctRows)) {
        q5Distractors.push({
          columns: ['query'],
          rows: q1Rows,
          isCorrect: false,
          explanation: 'Assumes the first unexecuted SQL query string is returned as text output.'
        });
      }

      // Distractor 4 (Text-based fallback): Individual string variable
      const textVarRows = [['Review']];
      if (!areRowsEqual(textVarRows, correctRows)) {
        q5Distractors.push({
          columns: ['str1'],
          rows: textVarRows,
          isCorrect: false,
          explanation: 'Assumes the initial string variable ("Review") is returned.'
        });
      }

      options.push(...q5Distractors.slice(0, 3));
      return options;
    }

    // Candidate 2a: UNION query handlers (evaluates only first or second branch)
    if (rawSql && /\bUNION\b/i.test(rawSql)) {
      const isUnionAll = /\bUNION\s+ALL\b/i.test(rawSql);
      const parts = rawSql.split(isUnionAll ? /\bUNION\s+ALL\b/i : /\bUNION(?:\s+DISTINCT)?\b/i);
      if (parts.length >= 2) {
        const p1Sql = parts[0].trim() + (parts[0].trim().endsWith(';') ? '' : ';');
        const p1Rows = runSql(p1Sql);
        if (p1Rows && p1Rows.length > 0 && !areRowsEqual(p1Rows, correctRows)) {
          distractorCandidates.push({
            columns: correctColumns,
            rows: p1Rows.slice(0, 30),
            isCorrect: false,
            explanation: isUnionAll
              ? 'Evaluates only the first query in the compound UNION ALL statement.'
              : 'Evaluates only the first query in the compound UNION statement.'
          });
        }
        const p2Sql = parts[1].trim() + (parts[1].trim().endsWith(';') ? '' : ';');
        const p2Rows = runSql(p2Sql);
        if (p2Rows && p2Rows.length > 0 && !areRowsEqual(p2Rows, correctRows)) {
          distractorCandidates.push({
            columns: correctColumns,
            rows: p2Rows.slice(0, 30),
            isCorrect: false,
            explanation: isUnionAll
              ? 'Evaluates only the second query in the compound UNION ALL statement.'
              : 'Evaluates only the second query in the compound UNION statement.'
          });
        }
      }
    }

    // Candidate 2b: Inverted ORDER BY (tests sorting understanding)
    if (rawSql && /ORDER BY/i.test(rawSql)) {
      let invSql = rawSql;
      if (/\bASC\b/i.test(invSql)) {
        invSql = invSql.replace(/\bASC\b/i, 'DESC');
      } else if (/\bDESC\b/i.test(invSql)) {
        invSql = invSql.replace(/\bDESC\b/i, 'ASC');
      } else {
        invSql = invSql.replace(/ORDER BY\s+([a-zA-Z0-9_.]+)/i, 'ORDER BY $1 DESC');
      }
      const invRows = runSql(invSql);
      if (invRows && invRows.length > 0 && !areRowsEqual(invRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: invRows.slice(0, 30),
          isCorrect: false,
          explanation: 'Inverted sort order.'
        });
      } else if (correctRows.length > 1) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: [...correctRows].reverse(),
          isCorrect: false,
          explanation: 'Inverted row order.'
        });
      }
    } else if (correctRows.length > 1) {
      distractorCandidates.push({
        columns: correctColumns,
        rows: [...correctRows].reverse(),
        isCorrect: false,
        explanation: 'Inverted row order.'
      });
    }

    // Candidate 3: Unfiltered WHERE (omits WHERE clause)
    if (rawSql && /\bWHERE\b/i.test(rawSql) && !/\bUNION\b/i.test(rawSql)) {
      const unfiltSql = rawSql.replace(/\bWHERE\s+[\s\S]+?(?=\s+GROUP BY|\s+HAVING|\s+ORDER BY|\s+LIMIT|$)/i, '');
      const unfiltRows = runSql(unfiltSql);
      if (unfiltRows && unfiltRows.length > 0 && !areRowsEqual(unfiltRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: unfiltRows.slice(0, Math.min(30, unfiltRows.length)),
          isCorrect: false,
          explanation: 'Unfiltered data (WHERE clause conditions were not applied).'
        });
      }
    }

    // Candidate 4: Inverted Filter condition (> to <=, < to >=, = to !=)
    if (rawSql && /\bWHERE\b/i.test(rawSql)) {
      let invCondSql = rawSql;
      if (/\s+>\s+/.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\s+>\s+/, ' <= ');
      } else if (/\s+<\s+/.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\s+<\s+/, ' >= ');
      } else if (/\s+>=\s+/.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\s+>=\s+/, ' < ');
      } else if (/\s+<=\s+/.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\s+<=\s+/, ' > ');
      } else if (/\s+=\s+/.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\s+=\s+/, ' != ');
      } else if (/\bLIKE\s+'A%'/i.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\bLIKE\s+'A%'/i, "LIKE 'B%'");
      } else if (/\bLIKE\s+/i.test(invCondSql)) {
        invCondSql = invCondSql.replace(/\bLIKE\s+/i, 'NOT LIKE ');
      }
      if (invCondSql !== rawSql) {
        const condRows = runSql(invCondSql);
        if (condRows && condRows.length > 0 && !areRowsEqual(condRows, correctRows)) {
          distractorCandidates.push({
            columns: correctColumns,
            rows: condRows.slice(0, Math.min(30, condRows.length)),
            isCorrect: false,
            explanation: 'Inverted filter boundary condition.'
          });
        }
      }
    }

    // Candidate 5: Alternative Aggregate calculation (COUNT vs SUM vs AVG vs MIN vs MAX)
    if (rawSql && /\b(COUNT|SUM|AVG|MIN|MAX)\b/i.test(rawSql)) {
      let altAggSql = rawSql;
      if (/\bCOUNT\b/i.test(altAggSql)) {
        altAggSql = altAggSql.replace(/\bCOUNT\(\s*\*\s*\)/i, 'SUM(id)').replace(/\bCOUNT\(([^)]+)\)/i, 'SUM($1)');
      } else if (/\bAVG\b/i.test(altAggSql)) {
        altAggSql = altAggSql.replace(/\bAVG\b/i, 'SUM');
      } else if (/\bMIN\b/i.test(altAggSql)) {
        altAggSql = altAggSql.replace(/\bMIN\b/i, 'MAX');
      } else if (/\bMAX\b/i.test(altAggSql)) {
        altAggSql = altAggSql.replace(/\bMAX\b/i, 'MIN');
      } else if (/\bSUM\b/i.test(altAggSql)) {
        altAggSql = altAggSql.replace(/\bSUM\b/i, 'AVG');
      }
      const aggRows = runSql(altAggSql);
      if (aggRows && aggRows.length > 0 && !areRowsEqual(aggRows, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: aggRows.slice(0, 30),
          isCorrect: false,
          explanation: 'Evaluates an alternative aggregation function.'
        });
      }
    }

    // Fallback A: Base Table projection using the exact same columns
    if (distractorCandidates.length < 3 && schema && schema.tables) {
      const targetTable = schema.tables.find(t => rawSql && rawSql.includes(t.name)) || schema.tables[0];
      if (targetTable && targetTable.rows) {
        const colNames = correctColumns;
        const availableCols = colNames.filter(c => targetTable.columns.some(tc => tc.name === c));
        if (availableCols.length === colNames.length) {
          const projectedRows = targetTable.rows.slice(0, Math.min(20, targetTable.rows.length)).map(r => colNames.map(c => r[c]));
          if (projectedRows.length > 0 && !areRowsEqual(projectedRows, correctRows)) {
            distractorCandidates.push({
              columns: correctColumns,
              rows: projectedRows,
              isCorrect: false,
              explanation: 'Unfiltered base table rows with target column projection.'
            });
          }
        }
      }
    }

    // Fallback B: Row-shifted partition or boundary offset
    if (distractorCandidates.length < 3) {
      if (correctRows.length > 3) {
        const mid = Math.floor(correctRows.length / 2);
        const altRows = [...correctRows.slice(mid), ...correctRows.slice(0, mid)];
        if (!areRowsEqual(altRows, correctRows)) {
          distractorCandidates.push({
            columns: correctColumns,
            rows: altRows,
            isCorrect: false,
            explanation: 'Re-ordered row partition.'
          });
        }
      } else if (correctRows.length === 1 && typeof correctRows[0][0] === 'number') {
        const val = correctRows[0][0];
        const alt1 = Math.round(val * 1.5 + 4);
        const alt2 = Math.max(1, Math.round(val * 0.5));
        distractorCandidates.push({
          columns: correctColumns,
          rows: [[alt1, ...correctRows[0].slice(1)]],
          isCorrect: false,
          explanation: 'Alternative aggregate estimation.'
        });
        distractorCandidates.push({
          columns: correctColumns,
          rows: [[alt2, ...correctRows[0].slice(1)]],
          isCorrect: false,
          explanation: 'Alternative aggregate estimation.'
        });
      }
    }

    // Fallback C: Mutated values with realistic domain variation
    if (distractorCandidates.length < 3) {
      const mutated = correctRows.map((r, rIdx) => {
        return r.map((cell, cIdx) => {
          if (typeof cell === 'number') {
            return Number.isInteger(cell) ? cell + (rIdx % 2 === 0 ? 5 : -2) : parseFloat((cell * 1.25).toFixed(2));
          }
          if (typeof cell === 'string') {
            return cell === 'COMPLETED' ? 'PENDING' : (cell === 'PENDING' ? 'COMPLETED' : cell);
          }
          return cell;
        });
      });
      if (!areRowsEqual(mutated, correctRows)) {
        distractorCandidates.push({
          columns: correctColumns,
          rows: mutated,
          isCorrect: false,
          explanation: 'Perturbed calculation outputs.'
        });
      }
    }

    // Deduplicate and select exactly 3 unique distractors
    const chosenDistractors = [];
    for (const cand of distractorCandidates) {
      if (chosenDistractors.length >= 3) break;
      if (!cand.rows || cand.rows.length === 0) continue;
      const candCols = cand.columns || correctColumns;
      if (areRowsEqual(cand.rows, correctRows) && JSON.stringify(candCols) === JSON.stringify(correctColumns)) continue;
      const isDuplicateOfChosen = chosenDistractors.some(d =>
        areRowsEqual(d.rows, cand.rows) &&
        JSON.stringify(d.columns) === JSON.stringify(candCols)
      );
      if (!isDuplicateOfChosen) {
        chosenDistractors.push({
          columns: candCols,
          rows: cand.rows,
          isCorrect: false,
          explanation: cand.explanation || 'Incorrect SQL execution result.'
        });
      }
    }

    // Safety guarantee: if still less than 3, add distinct structured variants
    let safetyCounter = 1;
    while (chosenDistractors.length < 3 && safetyCounter <= 10) {
      let fallbackRows = null;
      if (correctRows.length > 1 && safetyCounter === 1) {
        fallbackRows = correctRows.slice(1);
      } else if (correctRows.length > 1 && safetyCounter === 2) {
        fallbackRows = correctRows.slice(0, -1);
      } else if (correctRows.length > 2 && safetyCounter === 3) {
        fallbackRows = [...correctRows].reverse();
      } else {
        fallbackRows = correctRows.map(r => {
          return r.map(cell => {
            if (typeof cell === 'number') {
              return Number.isInteger(cell) ? cell + (safetyCounter * 10) : parseFloat((cell * 1.5 + safetyCounter * 5).toFixed(2));
            }
            if (typeof cell === 'string') {
              return `${cell} (Alt ${safetyCounter})`;
            }
            return cell;
          });
        });
      }

      if (fallbackRows && fallbackRows.length > 0 && !areRowsEqual(fallbackRows, correctRows)) {
        const isDuplicate = chosenDistractors.some(d =>
          areRowsEqual(d.rows, fallbackRows) &&
          JSON.stringify(d.columns) === JSON.stringify(correctColumns)
        );
        if (!isDuplicate) {
          chosenDistractors.push({
            columns: correctColumns,
            rows: fallbackRows,
            isCorrect: false,
            explanation: 'Alternative output calculation.'
          });
        }
      }
      safetyCounter++;
    }

    options.push(...chosenDistractors.slice(0, 3));
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
