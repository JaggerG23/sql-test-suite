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
      title: isStudy2to30 ? `Embedded Query (Study Question ${qNum} / ${(typeof window !== 'undefined' && window.studyConfig && typeof window.studyConfig.getMaxQuestions === 'function') ? window.studyConfig.getMaxQuestions() : 20})` : 'Embedded Query Execution Question',
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

    // Study Question 2 & 21 (Structure 2): Simple query, use python/javascript to delete it, new query, execute
    if (spec.manipulation === 'delete_query' || spec.qNum === 2 || spec.qNum === 21) {
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

    // Study Question 8 & 25 (Structure 3): Function related to appending to query that doesn't affect query, query, call function saved to variable, execute
    if (spec.manipulation === 'append_function' || spec.qNum === 8 || spec.qNum === 25) {
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

    // Study Question 9 & 22 (Structure 4: [Query], [HostLang], [Execute]): Initial query conducts aggregate, HLL rewrites order to DESC
    if (spec.manipulation === 'rewrite_order_desc' || spec.qNum === 9 || spec.qNum === 22) {
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

    // Study Question 10 & 24 (Structure 1: [HostLang], [Query], [Execute]):
    // Host language counts and compares arrays, and conditionally assigns query
    if (spec.manipulation === 'compare_counts_select_output' || spec.manipulation === 'compare_counts_join_avg' || spec.qNum === 10 || spec.qNum === 24) {
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[1]) : null;
      const pTableName = pTable ? pTable.name : 'products';
      const altSql = spec.initialSql || `SELECT ${pTableName}.title AS product_name FROM ${pTableName} ORDER BY ${pTableName}.id ASC;`;
      const altDialectSql = dialectManager ? dialectManager.formatQueryToDialect(altSql, dialectId) : (initialDialectSql || altSql);

      if (isPython) {
        blocks.push(`orders_quantity = [15, 8, 22, 5, 12, 30]\nproducts_id = [1, 2, 3]\norders_count = len(orders_quantity)\nproducts_count = len(products_id)`);
        blocks.push(`if orders_count >= products_count:\n    query = """\n${finalDialectSql}\n"""\nelse:\n    query = """\n${altDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let ordersQuantity = [15, 8, 22, 5, 12, 30];\nlet productsId = [1, 2, 3];\nlet ordersCount = ordersQuantity.length;\nlet productsCount = productsId.length;`);
        blocks.push(`let query = "";\nif (ordersCount >= productsCount) {\n  query = \`\n${finalDialectSql}\n\`;\n} else {\n  query = \`\n${altDialectSql}\n\`;\n}`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 11 & 27 (Structure 4: [Query], [HostLang], [Execute]): JOIN query, HLL defines 4 strings
    if (spec.manipulation === 'unused_column_strings' || spec.qNum === 11 || spec.qNum === 27) {
      if (isPython) {
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        if (spec.qNum === 27) {
          blocks.push(`col_amount = "amount"\ncol_customer = "customer_name"\ncol_status = "status"\ncol_notes = "notes"`);
        } else {
          blocks.push(`col_title = "title"\ncol_category = "category_name"\ncol_status = "status"\ncol_notes = "notes"`);
        }
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        if (spec.qNum === 27) {
          blocks.push(`let colAmount = "amount";\nlet colCustomer = "customer_name";\nlet colStatus = "status";\nlet colNotes = "notes";`);
        } else {
          blocks.push(`let colTitle = "title";\nlet colCategory = "category_name";\nlet colStatus = "status";\nlet colNotes = "notes";`);
        }
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 13 & 30 (Structure 2: [Query], [HostLang], [Query], [Execute]):
    // Initial query; HLL string manipulation modifies query;
    // but Query 2 completely overwrites query, and is executed.
    if (spec.manipulation === 'severe_query_override' || spec.qNum === 13 || spec.qNum === 30) {
      const isQuorum = (dialectId === 'quorum');
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        if (spec.qNum === 30) {
          blocks.push(`query = query.replace("reviews", "products")\nquery = query.replace("score", "rating")\nquery = query.replace("COUNT(*) AS review_count", "title, price")`);
        } else if (isQuorum) {
          blocks.push(`query = query.replace('"orders"', '"users"')\nquery = query.replace('"amount > 15"', '"id <= 3"')\nquery = query.replace('query:AddColumn("SUM(amount)", "sum_amt")', 'query:AddColumn("id")\\nquery:AddColumn("name")')\nquery = query.replace('query:AddColumn("AVG(amount)", "avg_amt")', 'query:AddColumn("rating")')`);
        } else {
          blocks.push(`query = query.replace("orders", "users")\nquery = query.replace("amount > 15", "id <= 3")\nquery = query.replace("SUM(amount) AS sum_amt, AVG(amount) AS avg_amt", "id, name, rating")`);
        }
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        if (spec.qNum === 30) {
          blocks.push(`query = query.replace("reviews", "products");\nquery = query.replace("score", "rating");\nquery = query.replace("COUNT(*) AS review_count", "title, price");`);
        } else if (isQuorum) {
          blocks.push(`query = query.replace('"orders"', '"users"');\nquery = query.replace('"amount > 15"', '"id <= 3"');\nquery = query.replace('query:AddColumn("SUM(amount)", "sum_amt")', 'query:AddColumn("id")\\nquery:AddColumn("name")');\nquery = query.replace('query:AddColumn("AVG(amount)", "avg_amt")', 'query:AddColumn("rating")');`);
        } else {
          blocks.push(`query = query.replace("orders", "users");\nquery = query.replace("amount > 15", "id <= 3");\nquery = query.replace("SUM(amount) AS sum_amt, AVG(amount) AS avg_amt", "id, name, rating");`);
        }
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
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

    // Study Question 6 & 23 (Structure 5): Query 1, Execute Query 1, HostLang, Query 2, Delete Query 2
    if (spec.manipulation === 'delete_second_query' || spec.qNum === 6 || spec.qNum === 23) {
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

    // Study Question 7 & 29 (Structure 5): Make second query the first query, inspect query in host lang, delete second execute
    if (spec.manipulation === 'delete_second_execute' || spec.qNum === 7 || spec.qNum === 29) {
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

    // Study Question 18 (Structure 2: [Query], [HostLang], [Query], [Execute]):
    // Query 1 (named query) outputs product title, price, stock (aggregate on products).
    // HLL does something that looks like it's applying to query 1, but isn't.
    // Query 2 (named queryy) outputs user_id, order_count, total_spent, avg_amount, max_order (complex filter & aggregate on orders).
    // Result table executes queryy: result_table = db.execute(queryy).
    if (spec.manipulation === 'q18_typo_queryy' || spec.qNum === 18) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`if "price" in query:\n    query.replace("price", "category_id")\n    query_audit = query + " -- verified filter"`);
        blocks.push(`queryy = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(queryy)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`if (query.includes("price")) {\n  query.replace("price", "category_id");\n  let queryAudit = query + " -- verified filter";\n}`);
        blocks.push(`let queryy = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`const resultTable = db.execute(queryy);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 19 (Structure 4: [Query], [HostLang], [Execute]):
    // Initial query on products grouped by category_id.
    // Host language checks if WHERE exists and injects extra filter stock > 20 (single rewrite in IF, single in ELSE).
    if (spec.manipulation === 'q19_filter_sort_hll' || spec.qNum === 19) {
      const isQuorum = (dialectId === 'quorum');
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        if (isQuorum) {
          blocks.push(`extra_filter = "stock > 20"\n\nif "Filter" in query:\n    query = query.replace('"price > 15"', f'"price > 15 and {extra_filter}"')\nelse:\n    query = query + f'\\nquery:Filter("{extra_filter}")'`);
        } else {
          blocks.push(`extra_filter = "stock > 20"\n\nif "WHERE" in query:\n    query = query.replace("price > 15", f"price > 15 AND {extra_filter}")\nelse:\n    query = query.replace("GROUP BY", f"WHERE {extra_filter} GROUP BY")`);
        }
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        if (isQuorum) {
          blocks.push(`let extraFilter = "stock > 20";\n\nif (query.includes("Filter")) {\n  query = query.replace('"price > 15"', \`"price > 15 and \${extraFilter}"\`);\n} else {\n  query = query + \`\\nquery:Filter("\${extraFilter}")\`;\n}`);
        } else {
          blocks.push(`let extraFilter = "stock > 20";\n\nif (query.includes("WHERE")) {\n  query = query.replace("price > 15", \`price > 15 AND \${extraFilter}\`);\n} else {\n  query = query.replace("GROUP BY", \`WHERE \${extraFilter} GROUP BY\`);\n}`);
        }
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 20 (Structure 1: [HostLang], [Query], [Execute]):
    // Host language defines threshold min_amount = 180 interpolated into single query.
    if (spec.manipulation === 'q20_compute_threshold_hll' || spec.qNum === 20) {
      const isQuorum = (dialectId === 'quorum');
      if (isPython) {
        const queryWithVar = isQuorum
          ? finalDialectSql.replace('"amount >= 180"', 'f"amount >= {min_amount}"')
          : finalDialectSql.replace('amount >= 180', 'amount >= {min_amount}');
        blocks.push(`min_amount = 180`);
        blocks.push(`query = f"""\n${queryWithVar}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        const queryWithVar = isQuorum
          ? finalDialectSql.replace('"amount >= 180"', '`amount >= ${minAmount}`')
          : finalDialectSql.replace('amount >= 180', 'amount >= ${minAmount}');
        blocks.push(`let minAmount = 180;`);
        blocks.push(`let query = \`\n${queryWithVar}\n\`;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 14 & 28 (Structure 3: [HostLang], [Query], [HostLang], [Execute]):
    // Uses keywords from the query in the surrounding HLL code
    if (spec.manipulation === 'keywords_hll_confuse' || spec.qNum === 14 || spec.qNum === 28) {
      if (spec.qNum === 28) {
        if (isPython) {
          blocks.push(`category_filter = [1, 2, 3]\nprice_floor = 25\navg_benchmark = round(sum([30.5, 45.2]) / 2, 2)`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`group_key = "category_id"\nprice_sum = sum([26.0, 34.0])\navg_price = round(price_sum / 2, 2)`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let categoryFilter = [1, 2, 3];\nlet priceFloor = 25;\nlet avgBenchmark = Math.round((30.5 + 45.2) / 2);`);
          blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
          blocks.push(`let groupKey = "category_id";\nlet priceSum = [26.0, 34.0].reduce((s, p) => s + p, 0);\nlet avgPrice = Math.round(priceSum / 2);`);
          blocks.push(`const resultTable = db.execute(query);`);
        }
        return blocks.join('\n\n');
      }
      if (isPython) {
        blocks.push(`status_checks = ["PENDING", "COMPLETED"]\nlike_match = "status LIKE 'COMP%'"\nsum_amount = sum([120.45, 80.55])\nround_target = round(sum_amount, 2)`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`group_status = "PENDING"\namount_sum = sum([45.20, 54.80])\nrounded_total = round(amount_sum, 2)`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let statusChecks = ["PENDING", "COMPLETED"];\nlet likeMatch = "status LIKE 'COMP%'";\nlet sumAmount = [120.45, 80.55].reduce((sum, amount) => sum + amount, 0);\nlet roundTarget = Math.round(sumAmount);`);
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`let groupStatus = "PENDING";\nlet amountSum = [45.20, 54.80].reduce((sum, amount) => sum + amount, 0);\nlet roundedTotal = Math.round(amountSum);`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 16 (Structure 3: [HostLang], [Query], [HostLang], [Execute]):
    // Users name, age, is_active joined with SUM of orders amount and COUNT of reviews.
    // Host language creates a function that takes the string query and appends order quantity to it, but is never called.
    if (spec.manipulation === 'unused_append_quantity' || spec.qNum === 16) {
      const isQuorum = (dialectId === 'quorum');
      if (isPython) {
        if (isQuorum) {
          blocks.push(`def append_order_quantity(q):\n    return q + '\\nquery:AddColumn("SUM(orders:quantity)", "total_quantity")'`);
        } else {
          blocks.push(`def append_order_quantity(q):\n    return q.replace("review_count", "review_count, SUM(orders.quantity) AS total_quantity")`);
        }
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`audit_trail = ["orders_joined", "reviews_joined"]\nverified_joins = len(audit_trail)`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        if (isQuorum) {
          blocks.push(`function appendOrderQuantity(q) {\n  return q + '\\nquery:AddColumn("SUM(orders:quantity)", "total_quantity")';\n}`);
        } else {
          blocks.push(`function appendOrderQuantity(q) {\n  return q.replace("review_count", "review_count, SUM(orders.quantity) AS total_quantity");\n}`);
        }
        blocks.push(`const query = \`\n${finalDialectSql}\n\`;`);
        blocks.push(`let auditTrail = ["orders_joined", "reviews_joined"];\nlet verifiedJoins = auditTrail.length;`);
        blocks.push(`const resultTable = db.execute(query);`);
      }
      return blocks.join('\n\n');
    }

    // Study Question 17 (Structure 2: [Query], [HostLang], [Query], [Execute]):
    // Initial query groups orders by user_id. Host language checks query properties.
    // Query 2 defines nested query grouping by order_count to aggregate user_count, and is executed.
    if (spec.manipulation === 'nested_group_by' || spec.qNum === 17) {
      if (isPython) {
        blocks.push(`query = """\n${initialDialectSql}\n"""`);
        blocks.push(`group_passes = query.count("GROUP BY")\nrequires_nested_agg = "subquery" in query or "sub" in query`);
        blocks.push(`query = """\n${finalDialectSql}\n"""`);
        blocks.push(`result_table = db.execute(query)`);
      } else {
        blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
        blocks.push(`let groupPasses = (query.match(/GROUP BY/g) || []).length;\nlet requiresNestedAgg = query.includes("subquery") || query.includes("sub");`);
        blocks.push(`query = \`\n${finalDialectSql}\n\`;`);
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
          blocks.push(`if "WHERE" in query:\n    active_filter = "valid query criteria"`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let query = \`\n${initialDialectSql}\n\`;`);
          blocks.push(`let activeFilter = "";\nif (query.includes("WHERE")) {\n  activeFilter = "valid query criteria";\n}`);
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
        const firstDialectSql = setupDialectSql || initialDialectSql;
        if (isPython) {
          blocks.push(`query = """\n${firstDialectSql}\n"""`);
          blocks.push(`db.execute(query)`);
          blocks.push(`sync_checkpoints = ["checkpoint_1", "checkpoint_2"]\nsync_progress = 0\nfor cp in sync_checkpoints:\n    sync_progress += 1`);
          blocks.push(`query = """\n${finalDialectSql}\n"""`);
          blocks.push(`result_table = db.execute(query)`);
        } else {
          blocks.push(`let query = \`\n${firstDialectSql}\n\`;`);
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

    // Questions 21-30 specific distractors (Structures: 21->2, 22->4, 23->5, 24->1, 25->3, 26->1, 27->4, 28->3, 29->5, 30->2)
    if (qNum >= 21 && qNum <= 30) {
      const qDistractors = [];

      const uTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'users') || schema.tables[0]) : null;
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[1]) : null;
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[2]) : null;
      const rTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'reviews') || schema.tables[4]) : null;

      const uName = uTable ? uTable.name : 'users';
      const pName = pTable ? pTable.name : 'products';
      const oName = oTable ? oTable.name : 'orders';
      const rName = rTable ? rTable.name : 'reviews';

      const addOption = (cols, rows, explanation) => {
        if (!cols || !rows || rows.length === 0) return false;
        if (areRowsEqual(rows, correctRows)) return false;
        for (const existing of qDistractors) {
          if (areRowsEqual(rows, existing.rows)) return false;
        }
        qDistractors.push({ columns: cols, rows, isCorrect: false, explanation });
        return true;
      };

      if (qNum === 21) {
        // Distractor 1: Evaluates deleted Query 1 (price < 40 ORDER BY price ASC)
        const d1Sql = `SELECT id, title, price, stock FROM ${pName} WHERE price < 40 ORDER BY price ASC LIMIT 4;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Evaluates the first query (price < 40) before it was deleted.');

        // Distractor 2: Evaluates Query 2 sorted ASC instead of DESC
        const d2Sql = `SELECT id, title, price, stock FROM ${pName} WHERE price >= 40 AND stock > 10 ORDER BY price ASC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Evaluates query 2 sorted in ascending order (ORDER BY price ASC) instead of descending order.');

        // Distractor 3: Evaluates stock <= 20
        const d3Sql = `SELECT id, title, price, stock FROM ${pName} WHERE stock <= 20 ORDER BY price ASC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Applies an alternate filter condition (stock <= 20).');
      } else if (qNum === 22) {
        // Distractor 1: Initial query before string replacement (ordered ASC)
        const d1Sql = `SELECT user_id, COUNT(*) AS order_count, ROUND(AVG(amount), 2) AS avg_spent FROM ${oName} GROUP BY user_id ORDER BY avg_spent ASC LIMIT 4;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Assumes the string replacement ASC to DESC was not applied.');

        // Distractor 2: Evaluates with ORDER BY order_count ASC
        const d2Sql = `SELECT user_id, COUNT(*) AS order_count, ROUND(AVG(amount), 2) AS avg_spent FROM ${oName} GROUP BY user_id ORDER BY order_count ASC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Orders by order count ascending (ORDER BY order_count ASC) instead of average spent.');

        // Distractor 3: Total amount spent (SUM) instead of average (AVG)
        const d3Sql = `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS avg_spent FROM ${oName} GROUP BY user_id ORDER BY avg_spent DESC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Computes total spent (SUM) instead of average spent (AVG).');
      } else if (qNum === 23) {
        // Distractor 1: Assumes Query 2 was executed instead of Query 1
        const d1Sql = `SELECT id, name, age, rating FROM ${uName} WHERE age < 35 ORDER BY age DESC LIMIT 4;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Assumes the second query was executed instead of the first query.');

        // Distractor 2: Inverted active flag (is_active = 0)
        const d2Sql = `SELECT id, name, age, is_active FROM ${uName} WHERE age >= 25 AND is_active = 0 ORDER BY age ASC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Assumes inactive users (is_active = 0) were selected.');

        // Distractor 3: Sorted age DESC instead of ASC
        const d3Sql = `SELECT id, name, age, is_active FROM ${uName} WHERE age >= 25 AND is_active = 1 ORDER BY age DESC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Sorts users by age descending (ORDER BY age DESC) instead of ascending.');
      } else if (qNum === 24) {
        // Distractor 1: Assumes else branch was executed (score <= 2)
        const d1Sql = `SELECT id, score, rating, title FROM ${rName} WHERE score <= 2 ORDER BY id ASC LIMIT 4;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Assumes the else branch query (score <= 2) was executed.');

        // Distractor 2: Evaluates with score = 3
        const d2Sql = `SELECT id, score, rating, title FROM ${rName} WHERE score = 3 ORDER BY id ASC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Selects moderate review scores (score = 3) instead of high scores.');

        // Distractor 3: Evaluates Query with ORDER BY id DESC LIMIT 4
        const d3Sql = `SELECT id, score, rating, title FROM ${rName} WHERE score >= 4 ORDER BY id DESC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Sorts reviews by id descending (ORDER BY id DESC) instead of ascending.');
      } else if (qNum === 25) {
        // Distractor 1: Assumes append function modified query to ORDER BY id DESC
        const d1Sql = `SELECT id, title, price, stock FROM ${pName} WHERE stock > 15 ORDER BY id DESC LIMIT 4;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Assumes the append function call modified the query to sort by id DESC.');

        // Distractor 2: Evaluates with ORDER BY price DESC
        const d2Sql = `SELECT id, title, price, stock FROM ${pName} WHERE stock > 15 ORDER BY price DESC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Sorts products by price descending (ORDER BY price DESC) instead of ascending.');

        // Distractor 3: High price filter (price >= 60)
        const d3Sql = `SELECT id, title, price, stock FROM ${pName} WHERE price >= 60 AND stock > 15 ORDER BY price ASC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Applies an additional price filter (price >= 60).');
      } else if (qNum === 26) {
        // Distractor 1: Evaluates only the High tier branch
        const d1Sql = `SELECT id, title, price, 'High' AS tier FROM ${pName} WHERE price >= 120;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Evaluates only the first SELECT branch (High tier) without the UNION.');

        // Distractor 2: Evaluates only the Low tier branch
        const d2Sql = `SELECT id, title, price, 'Low' AS tier FROM ${pName} WHERE price <= 40;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Evaluates only the second SELECT branch (Low tier) without the UNION.');

        // Distractor 3: Evaluates Mid tier
        const d3Sql = `SELECT id, title, price, 'Mid' AS tier FROM ${pName} WHERE price > 40 AND price < 120 LIMIT 10;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Filters for mid-range products (Mid tier) rather than combining High and Low tiers.');
      } else if (qNum === 27) {
        // Distractor 1: Sorted by amount DESC instead of id ASC
        const d1Sql = `SELECT ${oName}.id, ${oName}.amount, ${oName}.status, ${uName}.name AS customer_name FROM ${oName} JOIN ${uName} ON ${oName}.user_id = ${uName}.id WHERE ${oName}.amount > 80 ORDER BY ${oName}.amount DESC LIMIT 4;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Sorts orders by amount descending (ORDER BY amount DESC) instead of id ASC.');

        // Distractor 2: Inverted amount condition (amount <= 80)
        const d2Sql = `SELECT ${oName}.id, ${oName}.amount, ${oName}.status, ${uName}.name AS customer_name FROM ${oName} JOIN ${uName} ON ${oName}.user_id = ${uName}.id WHERE ${oName}.amount <= 80 ORDER BY ${oName}.id ASC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Inverts the filter condition to select orders with amount <= 80.');

        // Distractor 3: Filter by status = 'COMPLETED'
        const d3Sql = `SELECT ${oName}.id, ${oName}.amount, ${oName}.status, ${uName}.name AS customer_name FROM ${oName} JOIN ${uName} ON ${oName}.user_id = ${uName}.id WHERE ${oName}.status = 'COMPLETED' ORDER BY ${oName}.id ASC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Filters orders by status = "COMPLETED" instead of amount threshold.');
      } else if (qNum === 28) {
        // Distractor 1: SUM(price) instead of AVG(price) due to HLL price_sum
        const d1Sql = `SELECT category_id, ROUND(SUM(price), 2) AS avg_price FROM ${pName} WHERE price > 25 GROUP BY category_id ORDER BY avg_price DESC;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Computes total price sum (SUM) instead of average (AVG), influenced by host language variable names.');

        // Distractor 2: MIN(price) instead of AVG(price)
        const d2Sql = `SELECT category_id, ROUND(MIN(price), 2) AS avg_price FROM ${pName} WHERE price > 25 GROUP BY category_id ORDER BY avg_price DESC;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Computes minimum category price (MIN) instead of average (AVG).');

        // Distractor 3: Sorted by avg_price ASC instead of DESC
        const d3Sql = `SELECT category_id, ROUND(AVG(price), 2) AS avg_price FROM ${pName} WHERE price > 25 GROUP BY category_id ORDER BY avg_price ASC;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Sorts categories in ascending order of average price (ORDER BY avg_price ASC).');
      } else if (qNum === 29) {
        // Distractor 1: Assumes second query was executed (amount > 100)
        const d1Sql = `SELECT status, COUNT(*) AS count_orders, ROUND(AVG(amount), 2) AS avg_amount FROM ${oName} WHERE amount > 100 GROUP BY status ORDER BY count_orders DESC;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Assumes the second query (with amount > 100) was executed.');

        // Distractor 2: Total amount (SUM) instead of AVG
        const d2Sql = `SELECT status, COUNT(*) AS count_orders, ROUND(SUM(amount), 2) AS avg_amount FROM ${oName} GROUP BY status ORDER BY count_orders DESC;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Computes total amount (SUM) instead of average amount (AVG).');

        // Distractor 3: Sorted by avg_amount ASC
        const d3Sql = `SELECT status, COUNT(*) AS count_orders, ROUND(AVG(amount), 2) AS avg_amount FROM ${oName} GROUP BY status ORDER BY count_orders ASC;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Sorts status groups by average amount ascending (ORDER BY avg_amount ASC).');
      } else if (qNum === 30) {
        // Distractor 1: Evaluates Query 1 on reviews
        const d1Sql = `SELECT score, COUNT(*) AS review_count FROM ${rName} GROUP BY score ORDER BY score DESC;`;
        const d1Res = runSqlWithMeta(d1Sql);
        if (d1Res) addOption(d1Res.columns, d1Res.rows, 'Assumes the first query on reviews was executed before being overwritten.');

        // Distractor 2: Evaluates inactive users (is_active = 0)
        const d2Sql = `SELECT id, name, age FROM ${uName} WHERE is_active = 0 ORDER BY age ASC LIMIT 4;`;
        const d2Res = runSqlWithMeta(d2Sql);
        if (d2Res) addOption(d2Res.columns, d2Res.rows, 'Assumes inactive users (is_active = 0) were queried.');

        // Distractor 3: Sorted by age DESC
        const d3Sql = `SELECT id, name, age FROM ${uName} WHERE is_active = 1 ORDER BY age DESC LIMIT 4;`;
        const d3Res = runSqlWithMeta(d3Sql);
        if (d3Res) addOption(d3Res.columns, d3Res.rows, 'Sorts users by age descending (ORDER BY age DESC) instead of ascending.');
      }

      // Safe fallback if any distractor was somehow missed
      while (qDistractors.length < 3) {
        const fallbackRows = (qDistractors.length > 0 ? qDistractors[qDistractors.length - 1].rows : correctRows).slice();
        const mutatedRows = fallbackRows.map(r => Array.isArray(r) ? [r[0], typeof r[1] === 'number' ? r[1] + 1 : `${r[1]}*`, ...r.slice(2)] : [r]);
        qDistractors.push({
          columns: correctColumns,
          rows: mutatedRows,
          isCorrect: false,
          explanation: 'Alternative execution output.'
        });
      }

      options.push(...qDistractors.slice(0, 3));
      return options;
    }

    // Question 19 specific distractors (tests Structure 4 with HLL filter injection)
    if (qNum === 19 || (questionSpec && (questionSpec.qNum === 19 || questionSpec.manipulation === 'q19_filter_sort_hll'))) {
      const q19Distractors = [];

      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[0]) : null;
      const pName = pTable ? pTable.name : 'products';

      // Distractor 1 (Initial query trap: ignored HLL & omitted stock column): Evaluates initial query before HLL manipulation
      const d1Sql = `SELECT category_id, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM ${pName} WHERE price > 15 GROUP BY category_id ORDER BY avg_price DESC;`;
      let d1Res = runSqlWithMeta(d1Sql);
      if (d1Res && d1Res.rows && d1Res.rows.length > 0 && !areRowsEqual(d1Res.rows, correctRows)) {
        q19Distractors.push({
          columns: d1Res.columns,
          rows: d1Res.rows,
          isCorrect: false,
          explanation: 'Evaluates the initial query grouped by category_id (ordered by avg_price DESC), omitting the stock column and assuming the host language filter injection was not applied.'
        });
      }

      // Distractor 2 (Sort column trap: sorted by stock DESC instead of avg_price DESC)
      const d2Sql = `SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM ${pName} WHERE price > 15 AND stock > 20 GROUP BY category_id, stock ORDER BY stock DESC;`;
      let d2Res = runSqlWithMeta(d2Sql);
      if (d2Res && d2Res.rows && d2Res.rows.length > 0 && !areRowsEqual(d2Res.rows, correctRows)) {
        q19Distractors.push({
          columns: d2Res.columns,
          rows: d2Res.rows,
          isCorrect: false,
          explanation: 'Orders rows by stock descending (ORDER BY stock DESC) instead of average price descending.'
        });
      }

      // Distractor 3 (Sort direction trap: ASC instead of DESC)
      const d3Sql = `SELECT category_id, stock, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM ${pName} WHERE price > 15 AND stock > 20 GROUP BY category_id, stock ORDER BY avg_price ASC;`;
      let d3Res = runSqlWithMeta(d3Sql);
      if (d3Res && d3Res.rows && d3Res.rows.length > 0 && !areRowsEqual(d3Res.rows, correctRows)) {
        q19Distractors.push({
          columns: d3Res.columns,
          rows: d3Res.rows,
          isCorrect: false,
          explanation: 'Orders category groups in ascending order (ORDER BY avg_price ASC) instead of descending order.'
        });
      }

      // Safe fallback
      while (q19Distractors.length < 3) {
        const fallbackRows = (q19Distractors.length > 0 ? q19Distractors[q19Distractors.length - 1].rows : correctRows).slice();
        const mutatedRows = fallbackRows.map(r => Array.isArray(r) ? [r[0], r[1] !== undefined ? r[1] : 0, r[2] !== undefined ? r[2] + 1 : 1, ...r.slice(3)] : [r]);
        q19Distractors.push({
          columns: correctColumns,
          rows: mutatedRows,
          isCorrect: false,
          explanation: 'Alternative execution output.'
        });
      }

      options.push(...q19Distractors.slice(0, 3));
      return options;
    }

    // Question 20 specific distractors (tests Structure 1 with HLL threshold filter)
    if (qNum === 20 || (questionSpec && (questionSpec.qNum === 20 || questionSpec.manipulation === 'q20_compute_threshold_hll'))) {
      const q20Distractors = [];

      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const oName = oTable ? oTable.name : 'orders';

      // Distractor 1 (Grouping column trap: GROUP BY status across all orders instead of user_id)
      const d1Sql = `SELECT status, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM ${oName} GROUP BY status ORDER BY total_spent DESC LIMIT 4;`;
      let d1Res = runSqlWithMeta(d1Sql);
      if (d1Res && d1Res.rows && d1Res.rows.length > 0 && !areRowsEqual(d1Res.rows, correctRows)) {
        q20Distractors.push({
          columns: d1Res.columns,
          rows: d1Res.rows,
          isCorrect: false,
          explanation: 'Groups results by order status (GROUP BY status) instead of user_id.'
        });
      }

      // Distractor 2 (Omitted order_count column & threshold filter trap: calculates totals without order_count and without WHERE amount >= 180)
      const d2Sql = `SELECT user_id, ROUND(SUM(amount), 2) AS total_spent FROM ${oName} GROUP BY user_id ORDER BY total_spent DESC LIMIT 4;`;
      let d2Res = runSqlWithMeta(d2Sql);
      if (d2Res && d2Res.rows && d2Res.rows.length > 0 && !areRowsEqual(d2Res.rows, correctRows) && !q20Distractors.some(d => areRowsEqual(d.rows, d2Res.rows))) {
        q20Distractors.push({
          columns: d2Res.columns,
          rows: d2Res.rows,
          isCorrect: false,
          explanation: 'Calculates total spent across all orders without applying the threshold filter (WHERE amount >= 180), and omits the order_count column.'
        });
      }

      // Distractor 3 (Sort direction trap: ORDER BY total_spent ASC across all orders instead of DESC)
      const d3Sql = `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM ${oName} GROUP BY user_id ORDER BY total_spent ASC LIMIT 4;`;
      let d3Res = runSqlWithMeta(d3Sql);
      if (d3Res && d3Res.rows && d3Res.rows.length > 0 && !areRowsEqual(d3Res.rows, correctRows) && !q20Distractors.some(d => areRowsEqual(d.rows, d3Res.rows))) {
        q20Distractors.push({
          columns: d3Res.columns,
          rows: d3Res.rows,
          isCorrect: false,
          explanation: 'Orders results by total_spent ascending (ORDER BY total_spent ASC) instead of descending.'
        });
      }

      // Safe fallback with distinct IDs, columns, and values if needed
      while (q20Distractors.length < 3) {
        const fallbackIndex = q20Distractors.length;
        if (fallbackIndex === 0) {
          q20Distractors.push({
            columns: ['status', 'order_count', 'total_spent'],
            rows: [['REFUNDED', 11, 1542.12], ['CANCELLED', 6, 536.55], ['COMPLETED', 5, 526.26], ['PENDING', 5, 525.63]],
            isCorrect: false,
            explanation: 'Groups results by order status (GROUP BY status) instead of user_id.'
          });
        } else if (fallbackIndex === 1) {
          q20Distractors.push({
            columns: ['user_id', 'total_spent'],
            rows: [[16, 406.9], [12, 295.45], [18, 273.99], [28, 273.09]],
            isCorrect: false,
            explanation: 'Calculates total spent across all orders without applying the threshold filter (WHERE amount >= 180), and omits the order_count column.'
          });
        } else {
          q20Distractors.push({
            columns: ['user_id', 'order_count', 'total_spent'],
            rows: [[9, 1, 19.35], [14, 1, 54.03], [10, 1, 78.59], [20, 1, 93.11]],
            isCorrect: false,
            explanation: 'Orders results by total_spent ascending (ORDER BY total_spent ASC) instead of descending.'
          });
        }
      }

      options.push(...q20Distractors.slice(0, 3));
      return options;
    }

    // Question 18 specific distractors (tests Structure 2 with Query 1 aggregate vs Query 2 typo variable queryy)
    if (qNum === 18 || (questionSpec && (questionSpec.qNum === 18 || questionSpec.manipulation === 'q18_typo_queryy' || questionSpec.manipulation === 'typo_second_query' || questionSpec.manipulation === 'execute_second_query'))) {
      const q18Distractors = [];

      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[0]) : null;
      const pName = pTable ? pTable.name : 'products';

      // Distractor 1 (Query 1 / Aggregate Trap): Assumes query was executed instead of queryy (title, price, stock)
      const d1Sql = `SELECT title, MAX(price) AS price, SUM(stock) AS stock FROM ${pName} GROUP BY title ORDER BY title ASC LIMIT 3;`;
      let d1Res = runSqlWithMeta(d1Sql);
      let d1Cols = (d1Res && d1Res.columns) ? d1Res.columns : ['title', 'price', 'stock'];
      let d1Rows = (d1Res && d1Res.rows) ? d1Res.rows : [["Camera", 133.63, 355], ["Headphones", 163.12, 99], ["Keyboard", 193.9, 6]];
      if (d1Rows && d1Rows.length > 0 && !areRowsEqual(d1Rows, correctRows)) {
        q18Distractors.push({
          columns: d1Cols,
          rows: d1Rows,
          isCorrect: false,
          explanation: 'Assumes query was executed instead of queryy, producing the aggregated price and stock grouped by title.'
        });
      }

      // Distractor 2 (HLL Mutation Trap): Assumes query.replace("price", "category_id") mutated query in-place (title, category_id, stock)
      const d2Cols = ['title', 'category_id', 'stock'];
      const d2Rows = [["Camera", 18, 355], ["Headphones", 5, 99], ["Keyboard", 12, 6]];
      if (!areRowsEqual(d2Rows, correctRows)) {
        q18Distractors.push({
          columns: d2Cols,
          rows: d2Rows,
          isCorrect: false,
          explanation: 'Assumes the string replacement query.replace("price", "category_id") mutated query in-place.'
        });
      }

      // Distractor 3 (Sort Direction Trap): Evaluates queryy with ORDER BY total_spent ASC instead of DESC
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const oName = oTable ? oTable.name : 'orders';
      const d3Sql = `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order FROM ${oName} WHERE amount >= 25 AND status != 'CANCELLED' GROUP BY user_id ORDER BY total_spent ASC LIMIT 3;`;
      let d3Res = runSqlWithMeta(d3Sql);
      let d3Cols = (d3Res && d3Res.columns) ? d3Res.columns : ['user_id', 'order_count', 'total_spent', 'avg_amount', 'max_order'];
      let d3Rows = (d3Res && d3Res.rows) ? d3Res.rows : [[12, 1, 28.52, 28.52, 28.52], [15, 1, 42.83, 42.83, 42.83], [22, 1, 67.05, 67.05, 67.05]];
      if (d3Rows && d3Rows.length > 0 && !areRowsEqual(d3Rows, correctRows)) {
        q18Distractors.push({
          columns: d3Cols,
          rows: d3Rows,
          isCorrect: false,
          explanation: 'Assumes ascending sort order (ORDER BY total_spent ASC) instead of descending (DESC), returning the lowest spenders first.'
        });
      }

      options.push(...q18Distractors.slice(0, 3));
      return options;
    }

    // Question 17 specific distractors (tests Structure 2 with nested subquery containing two distinct GROUP BYs and ORDER BY)
    if (qNum === 17 || (questionSpec && (questionSpec.qNum === 17 || questionSpec.manipulation === 'nested_group_by'))) {
      const q17Distractors = [];
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const oName = oTable ? oTable.name : 'orders';

      // Distractor 1 (Query 1 / Inner query trap): Evaluates the first query (orders per user) before override
      const d1Sql = `SELECT ${oName}.user_id, COUNT(*) AS order_count FROM ${oName} GROUP BY ${oName}.user_id ORDER BY order_count DESC LIMIT 4;`;
      let d1Res = runSqlWithMeta(d1Sql);
      let d1Cols = (d1Res && d1Res.columns) ? d1Res.columns : ['user_id', 'order_count'];
      let d1Rows = (d1Res && d1Res.rows) ? d1Res.rows.slice(0, 4) : [[7, 5], [20, 3], [24, 2], [22, 2]];
      if (d1Rows && d1Rows.length > 0 && !areRowsEqual(d1Rows, correctRows)) {
        q17Distractors.push({
          columns: d1Cols,
          rows: d1Rows,
          isCorrect: false,
          explanation: 'Evaluates the first query before it was overwritten, grouping orders by user_id instead of the nested aggregation.'
        });
      }

      // Distractor 2 (Aggregation trap: SUM instead of COUNT): Sums the order counts instead of counting users
      const d2Sql = `SELECT order_count, SUM(order_count) AS total_orders FROM (SELECT ${oName}.user_id, COUNT(*) AS order_count FROM ${oName} GROUP BY ${oName}.user_id) sub GROUP BY order_count ORDER BY order_count ASC;`;
      let d2Res = runSqlWithMeta(d2Sql);
      let d2Cols = (d2Res && d2Res.columns) ? d2Res.columns : ['order_count', 'total_orders'];
      let d2Rows = (d2Res && d2Res.rows) ? d2Res.rows : [[1, 12], [2, 10], [3, 3], [5, 5]];
      if (d2Rows && d2Rows.length > 0 && !areRowsEqual(d2Rows, correctRows)) {
        q17Distractors.push({
          columns: d2Cols,
          rows: d2Rows,
          isCorrect: false,
          explanation: 'Sums the order counts (SUM(order_count)) rather than counting distinct users having each order count.'
        });
      }

      // Distractor 3 (Column projection trap): Projects user_id with user_count instead of outer group column order_count
      const d3Cols = ['user_id', 'user_count'];
      const d3Rows = [[1, 12], [2, 5], [3, 1], [4, 1]];
      q17Distractors.push({
        columns: d3Cols,
        rows: d3Rows,
        isCorrect: false,
        explanation: 'Projects user_id instead of the outer group column order_count with user_count.'
      });

      options.push(...q17Distractors.slice(0, 3));
      return options;
    }

    // Question 16 specific distractors (tests Structure 3 with unused append_order_quantity function)
    if (qNum === 16 || (questionSpec && (questionSpec.qNum === 16 || questionSpec.manipulation === 'unused_append_quantity'))) {
      const q16Distractors = [];
      const isPython = (hostLanguage === 'python');

      const uTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'users') || schema.tables[0]) : null;
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[1]) : null;
      const rTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'reviews') || schema.tables[2]) : null;
      const uName = uTable ? uTable.name : 'users';
      const oName = oTable ? oTable.name : 'orders';
      const rName = rTable ? rTable.name : 'reviews';

      // Distractor 1 (Function trap): Assumes append_order_quantity was executed, adding total_quantity
      const d1Sql = `SELECT ${uName}.name, ${uName}.age, ${uName}.is_active, SUM(${oName}.amount) AS total_spent, COUNT(${rName}.id) AS review_count, SUM(${oName}.quantity) AS total_quantity FROM ${uName} JOIN ${oName} ON ${oName}.user_id = ${uName}.id JOIN ${rName} ON ${rName}.order_id = ${oName}.id GROUP BY ${uName}.name, ${uName}.age, ${uName}.is_active ORDER BY ${uName}.name ASC LIMIT 3;`;
      let d1Res = runSqlWithMeta(d1Sql);
      let d1Cols = (d1Res && d1Res.columns) ? d1Res.columns : ['name', 'age', 'is_active', 'total_spent', 'review_count', 'total_quantity'];
      let d1Rows = d1Res ? d1Res.rows : null;
      if (!d1Rows && correctRows) {
        d1Rows = correctRows.map(r => [...r, 180]);
      }
      if (d1Rows && d1Rows.length > 0 && !areRowsEqual(d1Rows, correctRows)) {
        q16Distractors.push({
          columns: d1Cols,
          rows: d1Rows,
          isCorrect: false,
          explanation: isPython
            ? 'Assumes append_order_quantity(q) was executed, adding total_quantity to the output.'
            : 'Assumes appendOrderQuantity(q) was executed, adding total_quantity to the output.'
        });
      }

      // Distractor 2 (Missing reviews join): Omits reviews join and review_count column
      const d2Sql = `SELECT ${uName}.name, ${uName}.age, ${uName}.is_active, SUM(${oName}.amount) AS total_spent FROM ${uName} JOIN ${oName} ON ${oName}.user_id = ${uName}.id GROUP BY ${uName}.name, ${uName}.age, ${uName}.is_active ORDER BY ${uName}.name ASC LIMIT 3;`;
      let d2Res = runSqlWithMeta(d2Sql);
      let d2Cols = (d2Res && d2Res.columns) ? d2Res.columns : ['name', 'age', 'is_active', 'total_spent'];
      let d2Rows = d2Res ? d2Res.rows : null;
      if (!d2Rows && correctRows) {
        d2Rows = correctRows.map(r => r.slice(0, 4));
      }
      if (d2Rows && d2Rows.length > 0 && !areRowsEqual(d2Rows, correctRows)) {
        q16Distractors.push({
          columns: d2Cols,
          rows: d2Rows,
          isCorrect: false,
          explanation: 'Omits the reviews table join and review_count aggregate column.'
        });
      }

      // Distractor 3 (Average instead of Sum): Computes avg_spent instead of total_spent
      const d3Sql = `SELECT ${uName}.name, ${uName}.age, ${uName}.is_active, ROUND(AVG(${oName}.amount), 2) AS avg_spent, COUNT(${rName}.id) AS review_count FROM ${uName} JOIN ${oName} ON ${oName}.user_id = ${uName}.id JOIN ${rName} ON ${rName}.order_id = ${oName}.id GROUP BY ${uName}.name, ${uName}.age, ${uName}.is_active ORDER BY ${uName}.name ASC LIMIT 3;`;
      let d3Res = runSqlWithMeta(d3Sql);
      let d3Cols = (d3Res && d3Res.columns) ? d3Res.columns : ['name', 'age', 'is_active', 'avg_spent', 'review_count'];
      let d3Rows = d3Res ? d3Res.rows : null;
      if (!d3Rows && correctRows) {
        d3Rows = correctRows.map(r => [r[0], r[1], r[2], Number((r[3] / (r[4] || 1)).toFixed(2)), r[4]]);
      }
      if (d3Rows && d3Rows.length > 0 && !areRowsEqual(d3Rows, correctRows)) {
        q16Distractors.push({
          columns: d3Cols,
          rows: d3Rows,
          isCorrect: false,
          explanation: 'Computes the average order amount (avg_spent) instead of the total spent (total_spent).'
        });
      }

      options.push(...q16Distractors.slice(0, 3));
      return options;
    }

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

    // Question 8 & 23 specific distractors (distinct, non-overlapping options)
    if (qNum === 8 || qNum === 23 || (questionSpec && (questionSpec.manipulation === 'append_function' || questionSpec.qNum === 8 || questionSpec.qNum === 23))) {
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

    // Question 9 & 24 specific distractors (tests aggregate with SUM and AVG rewritten by HLL to order by order_id DESC)
    if (qNum === 9 || qNum === 24 || (questionSpec && (questionSpec.manipulation === 'rewrite_order_desc' || questionSpec.qNum === 9 || questionSpec.qNum === 24))) {
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

    // Question 10 & 25 specific distractors (tests comparing orders quantity count vs products ID count)
    if (qNum === 10 || qNum === 25 || (questionSpec && (questionSpec.manipulation === 'compare_counts_select_output' || questionSpec.manipulation === 'compare_counts_join_avg' || questionSpec.qNum === 10 || questionSpec.qNum === 25))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[1]) : null;
      const oTableName = oTable ? oTable.name : 'orders';
      const pTableName = pTable ? pTable.name : 'products';
      const q10Distractors = [];

      // Distractor 1: Evaluates the alternate branch (All product names / titles)
      const altSql = `SELECT title AS product_name FROM ${pTableName} ORDER BY id ASC;`;
      let altRes = runSqlWithMeta(altSql);
      let altCols = (altRes && altRes.columns) ? altRes.columns : ['product_name'];
      let altRows = altRes ? altRes.rows : null;
      if ((!altRows || altRows.length === 0) && pTable && pTable.rows) {
        altRows = pTable.rows.map(r => [r.title || 'Product']);
      }
      if (altRows && altRows.length > 0 && !areRowsEqual(altRows, correctRows)) {
        q10Distractors.push({
          columns: altCols,
          rows: altRows,
          isCorrect: false,
          explanation: 'Assumes the count of products ID was strictly greater than orders quantity, which would output all product names.'
        });
      }

      // Distractor 2: Evaluates order quantities instead of order IDs
      const qtySql = `SELECT quantity FROM ${oTableName} ORDER BY id ASC;`;
      let qtyRes = runSqlWithMeta(qtySql);
      let qtyCols = (qtyRes && qtyRes.columns) ? qtyRes.columns : ['quantity'];
      let qtyRows = qtyRes ? qtyRes.rows : null;
      if ((!qtyRows || qtyRows.length === 0) && oTable && oTable.rows) {
        qtyRows = oTable.rows.map(r => [r.quantity || 1]);
      }
      if (qtyRows && qtyRows.length > 0 && !areRowsEqual(qtyRows, correctRows)) {
        q10Distractors.push({
          columns: qtyCols,
          rows: qtyRows,
          isCorrect: false,
          explanation: 'Outputs the order quantities instead of the order IDs.'
        });
      }

      // Distractor 3: Evaluates total count scalar instead of table rows
      const cntSql = `SELECT COUNT(id) AS total_count FROM ${oTableName};`;
      let cntRes = runSqlWithMeta(cntSql);
      let cntCols = (cntRes && cntRes.columns) ? cntRes.columns : ['total_count'];
      let cntRows = cntRes ? cntRes.rows : null;
      if (!cntRows || cntRows.length === 0) {
        cntRows = [[(oTable && oTable.rows) ? oTable.rows.length : 30]];
      }
      if (cntRows && cntRows.length > 0 && !areRowsEqual(cntRows, correctRows)) {
        q10Distractors.push({
          columns: cntCols,
          rows: cntRows,
          isCorrect: false,
          explanation: 'Outputs the numeric count value instead of selecting the table rows.'
        });
      }

      if (q10Distractors.length >= 3) {
        options.push(...q10Distractors.slice(0, 3));
        return options;
      }
    }

    // Question 11 & 26 specific distractors (tests JOIN on products & categories with wrong column projections)
    if (qNum === 11 || qNum === 26 || (questionSpec && (questionSpec.qNum === 11 || questionSpec.qNum === 26 || questionSpec.manipulation === 'unused_column_strings' || (questionSpec.operators && questionSpec.operators.includes('JOIN') && questionSpec.structure === 4)))) {
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

    // Question 12 & 27 specific distractors (tests JOIN + UNION across orders and users)
    if (qNum === 12 || qNum === 27 || (questionSpec && (questionSpec.qNum === 12 || questionSpec.qNum === 27 || questionSpec.manipulation === 'join_union'))) {
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

    // Question 13 & 28 specific distractors (tests Structure 2 override: Query 1 vs HLL modified query vs Query 2 products)
    if (qNum === 13 || qNum === 28 || (questionSpec && (questionSpec.manipulation === 'severe_query_override' || questionSpec.qNum === 13 || questionSpec.qNum === 28))) {
      const oTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'orders') || schema.tables[0]) : null;
      const uTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'users') || schema.tables[1]) : null;
      const pTable = (schema && schema.tables) ? (schema.tables.find(t => t.name === 'products') || schema.tables[2] || schema.tables[0]) : null;
      const oTableName = oTable ? oTable.name : 'orders';
      const uTableName = uTable ? uTable.name : 'users';
      const pTableName = pTable ? pTable.name : 'products';
      const q13Distractors = [];

      // Distractor 1 (Query 1 result): Evaluates initial aggregate query on orders (sum_amt, avg_amt)
      const q1Sql = `SELECT SUM(amount) AS sum_amt, AVG(amount) AS avg_amt FROM ${oTableName} WHERE amount > 15;`;
      let q1Res = runSqlWithMeta(q1Sql);
      let q1Cols = (q1Res && q1Res.columns) ? q1Res.columns : ['sum_amt', 'avg_amt'];
      let q1Rows = q1Res ? q1Res.rows : null;
      if (!q1Rows && oTable && oTable.rows) {
        const filtered = oTable.rows.filter(r => (Number(r.amount) || 0) > 15);
        const sum = Number(filtered.reduce((a, b) => a + (Number(b.amount) || 0), 0).toFixed(2));
        const avg = filtered.length ? Number((sum / filtered.length).toFixed(2)) : 0;
        q1Rows = [[sum, avg]];
      }
      if (q1Rows && q1Rows.length > 0 && !areRowsEqual(q1Rows, correctRows)) {
        q13Distractors.push({
          columns: q1Cols,
          rows: q1Rows,
          isCorrect: false,
          explanation: 'Assumes the initial aggregation query on orders was executed before it was modified and overridden.'
        });
      }

      // Distractor 2 (HLL result): Evaluates the user records query created by HLL string manipulation (id, name, rating)
      const uSql = `SELECT id, name, rating FROM ${uTableName} WHERE id <= 3 ORDER BY id ASC;`;
      let uRes = runSqlWithMeta(uSql);
      let uCols = (uRes && uRes.columns) ? uRes.columns : ['id', 'name', 'rating'];
      let uRows = uRes ? uRes.rows : null;
      if (!uRows && uTable && uTable.rows) {
        uRows = uTable.rows.slice(0, 3).map(r => [r.id, r.name, r.rating || 4.5]);
      }
      if (uRows && uRows.length > 0 && !areRowsEqual(uRows, correctRows)) {
        q13Distractors.push({
          columns: uCols,
          rows: uRows,
          isCorrect: false,
          explanation: 'Assumes the host language string manipulation on query was executed instead of the second query.'
        });
      }

      // Distractor 3: Evaluates an alternative product ID range (IDs 4 to 6 instead of 1 to 3)
      const altPSql = `SELECT id, title, price FROM ${pTableName} WHERE id > 3 AND id <= 6 ORDER BY id ASC;`;
      let altPRes = runSqlWithMeta(altPSql);
      let altPCols = (altPRes && altPRes.columns) ? altPRes.columns : ['id', 'title', 'price'];
      let altPRows = altPRes ? altPRes.rows : null;
      if (!altPRows && pTable && pTable.rows) {
        altPRows = pTable.rows.slice(3, 6).map(r => [r.id, r.title, r.price]);
      }
      if (altPRows && altPRows.length > 0 && !areRowsEqual(altPRows, correctRows)) {
        q13Distractors.push({
          columns: altPCols,
          rows: altPRows,
          isCorrect: false,
          explanation: 'Evaluates an alternative product ID range (IDs 4 to 6 instead of 1 to 3).'
        });
      }

      if (q13Distractors.length >= 3) {
        options.push(...q13Distractors.slice(0, 3));
        return options;
      }
    }

    // Question 14 & 29 specific distractors (tests LIKE, ROUND, and SUM on orders)
    if (qNum === 14 || qNum === 29 || (questionSpec && (questionSpec.qNum === 14 || questionSpec.qNum === 29 || questionSpec.manipulation === 'keywords_hll_confuse' || (questionSpec.operators && questionSpec.operators.includes('ROUND'))))) {
      const q14Distractors = [];

      // Distractor 1 (Incorrect LIKE match): Assumes LIKE 'COMP%' matched non-matching status 'PENDING'
      const pendingSql = `SELECT 'PENDING' AS status, ROUND(SUM(amount), 2) AS rounded_total FROM orders WHERE status = 'PENDING';`;
      let pRes = runSqlWithMeta(pendingSql);
      let pCols = (pRes && pRes.columns) ? pRes.columns : ['status', 'rounded_total'];
      let pRows = pRes ? pRes.rows : null;
      if (!pRows && schema && schema.tables) {
        const oT = schema.tables.find(t => t.name === 'orders');
        if (oT) {
          const sumP = oT.rows.filter(r => r.status === 'PENDING').reduce((a, b) => a + (Number(b.amount) || 0), 0);
          pRows = [['PENDING', Number(sumP.toFixed(2))]];
        }
      }
      if (pRows && pRows.length > 0 && !areRowsEqual(pRows, correctRows)) {
        q14Distractors.push({
          columns: pCols,
          rows: pRows,
          isCorrect: false,
          explanation: (hostLanguage === 'python')
            ? "Assumes the host language variable group_status = 'PENDING' or status LIKE 'COMP%' matched 'PENDING'."
            : "Assumes the host language variable groupStatus = 'PENDING' or status LIKE 'COMP%' matched 'PENDING'."
        });
      }

      // Distractor 2 (Incorrect Aggregate: AVG instead of SUM): Computes AVG(amount)
      const avgSql = `SELECT status, ROUND(AVG(amount), 2) AS avg_amount FROM orders WHERE status LIKE 'COMP%' GROUP BY status;`;
      let avgRes = runSqlWithMeta(avgSql);
      let avgCols = (avgRes && avgRes.columns) ? avgRes.columns : ['status', 'avg_amount'];
      let avgRows = avgRes ? avgRes.rows : null;
      if (!avgRows && schema && schema.tables) {
        const oT = schema.tables.find(t => t.name === 'orders');
        if (oT) {
          const compRows = oT.rows.filter(r => r.status && r.status.startsWith('COMP'));
          const sumA = compRows.reduce((a, b) => a + (Number(b.amount) || 0), 0);
          const avgA = compRows.length ? Number((sumA / compRows.length).toFixed(2)) : 0;
          avgRows = [['COMPLETED', avgA]];
        }
      }
      if (avgRows && avgRows.length > 0 && !areRowsEqual(avgRows, correctRows)) {
        q14Distractors.push({
          columns: avgCols,
          rows: avgRows,
          isCorrect: false,
          explanation: 'Computes the average (AVG) per order instead of the total rounded sum (SUM).'
        });
      }

      // Distractor 3 (Incorrect projection column: user_id instead of status)
      const uidSql = `SELECT user_id, ROUND(SUM(amount), 2) AS rounded_total FROM orders WHERE status LIKE 'COMP%' GROUP BY user_id LIMIT 1;`;
      let uidRes = runSqlWithMeta(uidSql);
      let uidCols = (uidRes && uidRes.columns) ? uidRes.columns : ['user_id', 'rounded_total'];
      let uidRows = uidRes ? uidRes.rows : null;
      if (!uidRows && correctRows && correctRows[0]) {
        uidRows = [[1, correctRows[0][1]]];
      }
      if (uidRows && uidRows.length > 0 && !areRowsEqual(uidRows, correctRows)) {
        q14Distractors.push({
          columns: uidCols,
          rows: uidRows,
          isCorrect: false,
          explanation: 'Projects user_id instead of the grouped status column.'
        });
      }

      options.push(...q14Distractors.slice(0, 3));
      return options;
    }

    // Question 15 & 30 specific distractors (tests tracking the modified query 1 instead of overwritten query 2)
    if (qNum === 15 || qNum === 30 || (questionSpec && (questionSpec.manipulation === 'overwrite_query' || questionSpec.qNum === 15 || questionSpec.qNum === 30))) {
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

    // Question 6 & 21 specific distractors (tests if participant assumed query 2 was executed instead of deleted)
    // Wrong solutions include extra columns (4-5 columns) and shuffled sort orders to easily distinguish them from correct answer
    if (qNum === 6 || qNum === 21 || (questionSpec && (questionSpec.manipulation === 'delete_second_query' || questionSpec.qNum === 6 || questionSpec.qNum === 21))) {
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

    // Question 7 & 22 specific distractors
    if (qNum === 7 || qNum === 22 || (questionSpec && (questionSpec.manipulation === 'delete_second_execute' || questionSpec.qNum === 7 || questionSpec.qNum === 22))) {
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
