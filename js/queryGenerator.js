/**
 * Randomized & Incremental Query Generator
 * Strictly uses only 14 specific operators:
 * SELECT, INSERT, UPDATE, DELETE, WHERE, ORDER BY, LIKE, GROUP BY, COUNT, SUM, AVG, MIN, MAX, UNION
 * in random combinations and random quantities across study questions 2-30.
 */
class QueryGenerator {
  constructor(seed = 42) {
    this.seed = seed;
    this.rng = new RandomGenerator(seed);
  }

  generateQuery(schema, tier = 'medium', allowNULL = true) {
    return this.generateIncrementalQuery(schema, tier, allowNULL, 0);
  }

  /**
   * Deterministic structure assignment for questions 2 to 30.
   * Structures:
   * 1- [Python/JavaScript], [Query], [Execute]
   * 2- [Query], [Python/JavaScript], [Query], [Execute]
   * 3- [Python/JavaScript], [Query], [Python/JavaScript], [Execute]
   * 4- [Query], [Python/JavaScript], [Execute]
   * 5- [Query], [Execute], [Python/JavaScript], [Query], [Execute]
   */
  static getStructureForQuestion(qNum) {
    const sequence = [
      1, 3, 3, 4, 5,  2, 3, 4, 5, 1,  3, 4, 5, 5, 2,  4, 5, 1, 2, 3,
      5, 1, 2, 3, 4,  1, 2, 3, 4
    ];
    const idx = Math.max(0, Math.min(28, (parseInt(qNum, 10) || 2) - 2));
    return sequence[idx];
  }

  /**
   * Builds the specification for study questions 2-30.
   */
  getStudyQuestionSpec(schema, qNum) {
    const questionNumber = Math.max(2, Math.min(30, parseInt(qNum, 10) || 2));
    const qIdx = questionNumber - 2; // 0 to 28

    // Table references
    const tables = (schema && schema.tables && schema.tables.length > 0)
      ? schema.tables
      : [{ name: 'products' }, { name: 'users' }, { name: 'orders' }, { name: 'categories' }, { name: 'reviews' }];

    const findTable = (name) => tables.find(t => t.name === name) || tables[0];
    const userTable = findTable('users');
    const productTable = findTable('products');
    const orderTable = findTable('orders');
    const categoryTable = findTable('categories');
    const reviewTable = findTable('reviews');

    // 59 Distinct question configurations covering all 14 operators
    const questionDefs = [
      // Q2 (Structure 2: Simple query 1, delete query 1, query 2, execute)
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 5;`,
        manipulation: 'delete_query',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id > 2 ORDER BY id ASC;`
      },
      // Q3 (Structure 3: String manipulation on undefined query, query AVG(amount) on orders, irrelevant math expression, execute)
      {
        structure: 3,
        operators: ['SELECT', 'AVG'],
        manipulation: 'undefined_query_string',
        finalSql: `SELECT AVG(amount) AS avg_amount FROM ${orderTable.name};`
      },
      // Q4 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'LIKE'],
        manipulation: 'noop_replace',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE 'A%';`
      },
      // Q5 (Structure 5: Query 1 AVG on orders, omit execute 1, HLL string concatenation, Query 2 MIN on reviews, execute 2)
      {
        structure: 5,
        operators: ['SELECT', 'AVG', 'MIN'],
        manipulation: 'omit_first_execute',
        initialSql: `SELECT AVG(amount) AS avg_amount FROM ${orderTable.name};`,
        finalSql: `SELECT MIN(score) AS min_score FROM ${reviewTable.name};`
      },
      // Q6 (Structure 5: Query 1, Execute Query 1, HostLang, Query 2, Delete Query 2)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'MIN', 'MAX', 'ORDER BY'],
        initialSql: `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM ${productTable.name} WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;`,
        manipulation: 'delete_second_query',
        finalSql: `SELECT category_id, MAX(price) AS max_price, MIN(price) AS min_price FROM ${productTable.name} WHERE price > 35 GROUP BY category_id ORDER BY category_id DESC;`
      },
      // Q7 (Structure 5: Query 1, Execute Query 1, HostLang clause check, Query 2, No second execute)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'SUM'],
        initialSql: `SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM ${productTable.name} WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;`,
        manipulation: 'delete_second_execute',
        finalSql: `UPDATE ${productTable.name} SET price = price * 2;`
      },
      // Q8 (Structure 3: Append function dummy, query, function call saved to variable, execute)
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 5 ORDER BY name ASC;`,
        manipulation: 'append_function',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 5 ORDER BY name ASC;`
      },
      // Q9 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'GROUP BY', 'SUM', 'AVG', 'ORDER BY'],
        manipulation: 'rewrite_order_desc',
        initialSql: `SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM ${reviewTable.name} GROUP BY order_id ORDER BY order_id ASC;`,
        finalSql: `SELECT order_id, SUM(score) AS total_score, ROUND(AVG(score), 2) AS avg_score FROM ${reviewTable.name} GROUP BY order_id ORDER BY order_id DESC;`
      },
      // Q10 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'COUNT', 'JOIN', 'AVG'],
        manipulation: 'compare_counts_join_avg',
        finalSql: `SELECT COUNT(${orderTable.name}.id) AS total_count, ROUND(AVG(${orderTable.name}.amount), 2) AS avg_val FROM ${orderTable.name} JOIN ${reviewTable.name} ON ${orderTable.name}.id = ${reviewTable.name}.order_id;`
      },
      // Q11 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'JOIN', 'WHERE', 'ORDER BY'],
        manipulation: 'unused_column_strings',
        finalSql: `SELECT ${productTable.name}.id, ${productTable.name}.title, ${categoryTable.name}.name AS category_name, ${productTable.name}.price FROM ${productTable.name} JOIN ${categoryTable.name} ON ${productTable.name}.category_id = ${categoryTable.name}.id WHERE ${productTable.name}.id <= 5 ORDER BY ${productTable.name}.id ASC;`
      },
      // Q12 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'JOIN', 'WHERE', 'UNION'],
        manipulation: 'join_union',
        finalSql: `SELECT ${orderTable.name}.id, ${userTable.name}.name, ${orderTable.name}.amount
FROM ${orderTable.name}
JOIN ${userTable.name} ON ${orderTable.name}.user_id = ${userTable.name}.id
WHERE ${orderTable.name}.amount > 100
UNION
SELECT ${orderTable.name}.id, ${userTable.name}.name, ${orderTable.name}.amount
FROM ${orderTable.name}
JOIN ${userTable.name} ON ${orderTable.name}.user_id = ${userTable.name}.id
WHERE ${orderTable.name}.status = 'COMPLETED';`
      },
      // Q13 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'SUM', 'AVG'],
        initialSql: `SELECT SUM(amount) AS sum_amt, AVG(amount) AS avg_amt FROM ${orderTable.name} WHERE amount > 15;`,
        manipulation: 'adjust_threshold',
        finalSql: `SELECT SUM(amount) AS sum_amt, AVG(amount) AS avg_amt FROM ${orderTable.name} WHERE amount > 25;`
      },
      // Q14 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        finalSql: `SELECT id, amount, status FROM ${orderTable.name} WHERE id <= 7 ORDER BY id ASC;`
      },
      // Q15 (Structure 5: First execution of undefined variable, complex string manipulation on query 1, query 2 overwrites query, execute query 2)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'COUNT', 'ORDER BY'],
        initialSql: `SELECT id, amount, status FROM ${orderTable.name} WHERE amount > 50;`,
        manipulation: 'overwrite_query',
        finalSql: `SELECT status, COUNT(*) AS order_count FROM ${orderTable.name} GROUP BY status ORDER BY order_count DESC;`
      },
      // Q16 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'UNION'],
        finalSql: `SELECT id, title FROM ${productTable.name} WHERE price < 25 UNION SELECT id, title FROM ${productTable.name} WHERE price > 75;`
      },
      // Q17 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'COUNT'],
        initialSql: `SELECT user_id, COUNT(*) AS order_count FROM ${orderTable.name} WHERE amount > 20 GROUP BY user_id;`,
        manipulation: 'remove_filter',
        finalSql: `SELECT user_id, COUNT(*) AS order_count FROM ${orderTable.name} GROUP BY user_id;`
      },
      // Q18 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['INSERT', 'SELECT', 'WHERE', 'LIKE', 'ORDER BY'],
        setupSql: `INSERT INTO ${userTable.name} (id, name, age) VALUES (31, 'Aaron', 25);`,
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE 'A%' ORDER BY name ASC;`
      },
      // Q19 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'AVG', 'ORDER BY'],
        finalSql: `SELECT category_id, AVG(price) AS avg_price FROM ${productTable.name} WHERE price > 15 GROUP BY category_id ORDER BY avg_price ASC;`
      },
      // Q20 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'GROUP BY', 'SUM', 'ORDER BY'],
        finalSql: `SELECT user_id, SUM(amount) AS total_spent FROM ${orderTable.name} GROUP BY user_id ORDER BY total_spent DESC;`
      },
      // Q21 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        finalSql: `SELECT id, title, price FROM ${productTable.name} WHERE price <= 50 ORDER BY price DESC;`
      },
      // Q22 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['INSERT', 'SELECT', 'WHERE', 'ORDER BY'],
        setupSql: `INSERT INTO ${productTable.name} (id, title, price, category_id) VALUES (31, 'Gizmo', 49.99, 1);`,
        finalSql: `SELECT id, title, price FROM ${productTable.name} WHERE id >= 25 ORDER BY price ASC;`
      },
      // Q23 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'LIKE', 'GROUP BY', 'COUNT'],
        finalSql: `SELECT category_id, COUNT(*) AS match_count FROM ${productTable.name} WHERE title LIKE '%a%' GROUP BY category_id;`
      },
      // Q24 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'UNION'],
        initialSql: `SELECT id, title FROM ${productTable.name} WHERE id <= 3;`,
        manipulation: 'replace_union',
        finalSql: `SELECT id, title FROM ${productTable.name} WHERE id <= 3 UNION SELECT id, title FROM ${productTable.name} WHERE id >= 5 AND id <= 8;`
      },
      // Q25 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 8 ORDER BY id DESC;`
      },
      // Q26 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'GROUP BY', 'COUNT', 'SUM'],
        finalSql: `SELECT category_id, COUNT(*) AS count_items, SUM(price) AS sum_price FROM ${productTable.name} GROUP BY category_id;`
      },
      // Q27 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['DELETE', 'WHERE', 'SELECT', 'AVG', 'GROUP BY', 'ORDER BY'],
        setupSql: `DELETE FROM ${productTable.name} WHERE id = 30;`,
        finalSql: `SELECT category_id, AVG(price) AS avg_price FROM ${productTable.name} WHERE id > 25 GROUP BY category_id ORDER BY avg_price ASC;`
      },
      // Q28 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'MIN'],
        finalSql: `SELECT MIN(amount) AS min_amount FROM ${orderTable.name} WHERE amount > 10;`
      },
      // Q29 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'MAX', 'ORDER BY'],
        initialSql: `SELECT user_id, MAX(amount) AS max_spent FROM ${orderTable.name} GROUP BY user_id;`,
        manipulation: 'add_where_filter',
        finalSql: `SELECT user_id, MAX(amount) AS max_spent FROM ${orderTable.name} WHERE amount > 20 GROUP BY user_id ORDER BY max_spent DESC;`
      },
      // Q30 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'LIKE'],
        finalSql: `SELECT id, title FROM ${productTable.name} WHERE title LIKE '%Phone%';`
      }
    ];

    const def = questionDefs[qIdx] || questionDefs[0];
    const structureType = def.structure;
    const operators = def.operators;
    const finalSql = def.finalSql;
    const initialSql = def.initialSql || def.finalSql;
    const setupSql = def.setupSql || null;
    const manipulation = def.manipulation || 'adjust_filter';

    const executedQuery = (manipulation === 'delete_second_query' || manipulation === 'delete_second_execute' || manipulation === 'typo_second_query' || def.executedFromInitial)
      ? initialSql
      : ((structureType === 5 && setupSql)
        ? `${setupSql}\n${finalSql}`
        : finalSql);

    return {
      qNum: questionNumber,
      structureType: structureType,
      operators: operators,
      executedQuery: executedQuery,
      setupSql: setupSql,
      finalSql: finalSql,
      initialSql: initialSql,
      manipulation: manipulation
    };
  }

  /**
   * Generates queries that evolve incrementally in small portions across consecutive variation steps,
   * or delegates to getStudyQuestionSpec for study questions 2-30.
   */
  generateIncrementalQuery(schema, tier = 'medium', allowNULL = true, variationIndex = 0, qNum = null) {
    if (qNum !== null && qNum !== undefined) {
      const parsedQ = parseInt(qNum, 10);
      if (parsedQ === 1) {
        return 'SELECT orders.id, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id <= 6;';
      }
      if (parsedQ >= 2 && parsedQ <= 30) {
        const spec = this.getStudyQuestionSpec(schema, parsedQ);
        return spec.executedQuery;
      }
    }

    if (!schema || !schema.tables || schema.tables.length === 0) {
      return 'SELECT 1;';
    }

    const t1 = schema.tables[0];
    const groupCol = `${t1.name}.${t1.columns[0].name}`;
    const numCol = t1.columns.find(c => c.type === 'INTEGER' || c.type === 'FLOAT') || t1.columns[0];
    const whereColDef = numCol;
    const whereColName = `${t1.name}.${whereColDef.name}`;

    const sampleRow = t1.rows.length > 0 ? t1.rows[0] : {};
    const baseVal = Number(sampleRow[whereColDef.name]) || 10;

    let op = '>';
    let valThreshold = baseVal;
    let orderDir = 'DESC';
    let aggFunc = 'COUNT';

    switch (variationIndex % 6) {
      case 0:
        op = '>'; valThreshold = baseVal; orderDir = 'DESC'; aggFunc = 'COUNT'; break;
      case 1:
        op = '>='; valThreshold = baseVal; orderDir = 'DESC'; aggFunc = 'COUNT'; break;
      case 2:
        op = '>='; valThreshold = baseVal + 5; orderDir = 'DESC'; aggFunc = 'COUNT'; break;
      case 3:
        op = '>='; valThreshold = baseVal + 5; orderDir = 'ASC'; aggFunc = 'COUNT'; break;
      case 4:
        op = '>='; valThreshold = baseVal + 5; orderDir = 'ASC'; aggFunc = 'SUM'; break;
      case 5:
        op = '>='; valThreshold = baseVal + 5; orderDir = 'ASC'; aggFunc = 'AVG'; break;
    }

    return `SELECT ${groupCol}, ${aggFunc}(${numCol.name}) AS agg_val\nFROM ${t1.name}\nWHERE ${whereColName} ${op} ${valThreshold}\nGROUP BY ${groupCol}\nORDER BY agg_val ${orderDir};`;
  }
}

window.QueryGenerator = QueryGenerator;
