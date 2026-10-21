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
      5, 5, 3, 4, 1,  4, 1, 2, 3, 5
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
        operators: ['SELECT', 'ORDER BY'],
        manipulation: 'compare_counts_select_output',
        initialSql: `SELECT ${productTable.name}.title AS product_name FROM ${productTable.name} ORDER BY ${productTable.name}.id ASC;`,
        finalSql: `SELECT ${orderTable.name}.id AS order_id FROM ${orderTable.name} ORDER BY ${orderTable.name}.id ASC;`
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
        manipulation: 'severe_query_override',
        finalSql: `SELECT ${productTable.name}.id, ${productTable.name}.title, ${productTable.name}.price FROM ${productTable.name} WHERE ${productTable.name}.id <= 3 ORDER BY ${productTable.name}.id ASC;`
      },
      // Q14 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'LIKE', 'ROUND', 'SUM', 'GROUP BY'],
        manipulation: 'keywords_hll_confuse',
        finalSql: `SELECT ${orderTable.name}.status, ROUND(SUM(${orderTable.name}.amount), 2) AS rounded_total FROM ${orderTable.name} WHERE ${orderTable.name}.status LIKE 'COMP%' GROUP BY ${orderTable.name}.status;`
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
        operators: ['SELECT', 'JOIN', 'GROUP BY', 'SUM', 'COUNT', 'ORDER BY'],
        manipulation: 'unused_append_quantity',
        finalSql: `SELECT ${userTable.name}.name, ${userTable.name}.age, ${userTable.name}.is_active, SUM(${orderTable.name}.amount) AS total_spent, COUNT(${reviewTable.name}.id) AS review_count FROM ${userTable.name} JOIN ${orderTable.name} ON ${orderTable.name}.user_id = ${userTable.name}.id JOIN ${reviewTable.name} ON ${reviewTable.name}.order_id = ${orderTable.name}.id GROUP BY ${userTable.name}.name, ${userTable.name}.age, ${userTable.name}.is_active ORDER BY ${userTable.name}.name ASC LIMIT 3;`
      },
      // Q17 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'GROUP BY', 'COUNT', 'ORDER BY'],
        initialSql: `SELECT ${orderTable.name}.user_id, COUNT(*) AS order_count FROM ${orderTable.name} GROUP BY ${orderTable.name}.user_id;`,
        manipulation: 'nested_group_by',
        finalSql: `SELECT order_count, COUNT(*) AS user_count FROM (SELECT ${orderTable.name}.user_id, COUNT(*) AS order_count FROM ${orderTable.name} GROUP BY ${orderTable.name}.user_id) sub GROUP BY order_count ORDER BY order_count ASC;`
      },
      // Q18 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'COUNT', 'SUM', 'AVG', 'MAX', 'ORDER BY', 'LIMIT'],
        initialSql: `SELECT title, MAX(price) AS price, SUM(stock) AS stock FROM ${productTable.name} GROUP BY title ORDER BY title ASC LIMIT 3;`,
        manipulation: 'q18_typo_queryy',
        finalSql: `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent, ROUND(AVG(amount), 2) AS avg_amount, MAX(amount) AS max_order FROM ${orderTable.name} WHERE amount >= 25 AND status != 'CANCELLED' GROUP BY user_id ORDER BY total_spent DESC LIMIT 3;`
      },
      // Q19 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'AVG', 'ROUND', 'ORDER BY'],
        manipulation: 'q19_filter_sort_hll',
        initialSql: `SELECT category_id, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM ${productTable.name} WHERE price > 15 GROUP BY category_id ORDER BY count_items DESC;`,
        finalSql: `SELECT category_id, COUNT(*) AS count_items, ROUND(AVG(price), 2) AS avg_price FROM ${productTable.name} WHERE price > 15 AND stock > 20 GROUP BY category_id ORDER BY avg_price DESC;`
      },
      // Q20 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'SUM', 'ROUND', 'ORDER BY', 'LIMIT'],
        manipulation: 'q20_compute_threshold_hll',
        initialSql: `SELECT user_id, COUNT(*) AS order_count, ROUND(AVG(amount), 2) AS total_spent FROM ${orderTable.name} WHERE amount < 50 GROUP BY user_id ORDER BY total_spent ASC LIMIT 4;`,
        finalSql: `SELECT user_id, COUNT(*) AS order_count, ROUND(SUM(amount), 2) AS total_spent FROM ${orderTable.name} WHERE amount >= 75 GROUP BY user_id ORDER BY total_spent DESC LIMIT 4;`
      },
      // Q21 (Structure 2: [Query], [HostLang], [Query], [Execute] - inspired by Q2)
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT'],
        initialSql: `SELECT id, title, price, stock FROM ${productTable.name} WHERE price < 40 ORDER BY price ASC LIMIT 4;`,
        manipulation: 'delete_query',
        finalSql: `SELECT id, title, price, stock FROM ${productTable.name} WHERE price >= 40 AND stock > 10 ORDER BY price DESC LIMIT 4;`
      },
      // Q22 (Structure 4: [Query], [HostLang], [Execute] - inspired by Q9)
      {
        structure: 4,
        operators: ['SELECT', 'GROUP BY', 'COUNT', 'AVG', 'ROUND', 'ORDER BY', 'LIMIT'],
        manipulation: 'rewrite_order_desc',
        initialSql: `SELECT user_id, COUNT(*) AS order_count, ROUND(AVG(amount), 2) AS avg_spent FROM ${orderTable.name} GROUP BY user_id ORDER BY avg_spent ASC LIMIT 4;`,
        finalSql: `SELECT user_id, COUNT(*) AS order_count, ROUND(AVG(amount), 2) AS avg_spent FROM ${orderTable.name} GROUP BY user_id ORDER BY avg_spent DESC LIMIT 4;`
      },
      // Q23 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute] - inspired by Q6)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT'],
        initialSql: `SELECT id, name, age, is_active FROM ${userTable.name} WHERE age >= 25 AND is_active = 1 ORDER BY age ASC LIMIT 4;`,
        manipulation: 'delete_second_query',
        finalSql: `SELECT id, name, age, rating FROM ${userTable.name} WHERE age < 35 ORDER BY age DESC LIMIT 4;`
      },
      // Q24 (Structure 1: [HostLang], [Query], [Execute] - inspired by Q10)
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT'],
        manipulation: 'compare_counts_select_output',
        initialSql: `SELECT id, score, rating, title FROM ${reviewTable.name} WHERE score <= 2 ORDER BY id ASC LIMIT 4;`,
        finalSql: `SELECT id, score, rating, title FROM ${reviewTable.name} WHERE score >= 4 ORDER BY id ASC LIMIT 4;`
      },
      // Q25 (Structure 3: [HostLang], [Query], [HostLang], [Execute] - inspired by Q8)
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT'],
        initialSql: `SELECT id, title, price, stock FROM ${productTable.name} WHERE stock > 15 ORDER BY price ASC LIMIT 4;`,
        manipulation: 'append_function',
        finalSql: `SELECT id, title, price, stock FROM ${productTable.name} WHERE stock > 15 ORDER BY price ASC LIMIT 4;`
      },
      // Q26 (Structure 1: [HostLang], [Query], [Execute] - inspired by Q12)
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'UNION'],
        manipulation: 'join_union',
        finalSql: `SELECT id, title, price, 'High' AS tier FROM ${productTable.name} WHERE price >= 120
UNION
SELECT id, title, price, 'Low' AS tier FROM ${productTable.name} WHERE price <= 40;`
      },
      // Q27 (Structure 4: [Query], [HostLang], [Execute] - inspired by Q11)
      {
        structure: 4,
        operators: ['SELECT', 'JOIN', 'WHERE', 'ORDER BY', 'LIMIT'],
        manipulation: 'unused_column_strings',
        finalSql: `SELECT ${orderTable.name}.id, ${orderTable.name}.amount, ${orderTable.name}.status, ${userTable.name}.name AS customer_name FROM ${orderTable.name} JOIN ${userTable.name} ON ${orderTable.name}.user_id = ${userTable.name}.id WHERE ${orderTable.name}.amount > 80 ORDER BY ${orderTable.name}.id ASC LIMIT 4;`
      },
      // Q28 (Structure 3: [HostLang], [Query], [HostLang], [Execute] - inspired by Q14)
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'AVG', 'ROUND', 'ORDER BY'],
        manipulation: 'keywords_hll_confuse',
        finalSql: `SELECT ${productTable.name}.category_id, ROUND(AVG(${productTable.name}.price), 2) AS avg_price FROM ${productTable.name} WHERE ${productTable.name}.price > 25 GROUP BY ${productTable.name}.category_id ORDER BY avg_price DESC;`
      },
      // Q29 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute] - inspired by Q7)
      {
        structure: 5,
        operators: ['SELECT', 'GROUP BY', 'COUNT', 'AVG', 'ROUND', 'ORDER BY'],
        initialSql: `SELECT status, COUNT(*) AS count_orders, ROUND(AVG(amount), 2) AS avg_amount FROM ${orderTable.name} GROUP BY status ORDER BY count_orders DESC;`,
        manipulation: 'delete_second_execute',
        finalSql: `SELECT status, COUNT(*) AS count_orders, ROUND(AVG(amount), 2) AS avg_amount FROM ${orderTable.name} WHERE amount > 100 GROUP BY status ORDER BY count_orders DESC;`
      },
      // Q30 (Structure 2: [Query], [HostLang], [Query], [Execute] - inspired by Q13)
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT'],
        initialSql: `SELECT score, COUNT(*) AS review_count FROM ${reviewTable.name} GROUP BY score ORDER BY score DESC;`,
        manipulation: 'severe_query_override',
        finalSql: `SELECT id, name, age FROM ${userTable.name} WHERE is_active = 1 ORDER BY age ASC LIMIT 4;`
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
