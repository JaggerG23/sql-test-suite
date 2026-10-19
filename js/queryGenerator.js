/**
 * Randomized & Incremental Query Generator
 * Strictly uses only 14 specific operators:
 * SELECT, INSERT, UPDATE, DELETE, WHERE, ORDER BY, LIKE, GROUP BY, COUNT, SUM, AVG, MIN, MAX, UNION
 * in random combinations and random quantities across study questions 2-60.
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
   * Deterministic structure assignment for questions 2 to 60.
   * Structures:
   * 1- [Python/JavaScript], [Query], [Execute]
   * 2- [Query], [Python/JavaScript], [Query], [Execute]
   * 3- [Python/JavaScript], [Query], [Python/JavaScript], [Execute]
   * 4- [Query], [Python/JavaScript], [Execute]
   * 5- [Query], [Execute], [Python/JavaScript], [Query], [Execute]
   */
  static getStructureForQuestion(qNum) {
    const sequence = [
      1, 2, 3, 4, 5,  2, 3, 4, 5, 1,  3, 4, 5, 1, 2,  4, 5, 1, 2, 3,
      5, 1, 2, 3, 4,  1, 2, 3, 4, 5,  1, 2, 3, 4, 5,  1, 2, 3, 4, 1,
      5, 2, 3, 4, 1,  5, 2, 3, 4, 1,  5, 2, 3, 4, 1,  5, 2, 3, 4
    ];
    const idx = Math.max(0, Math.min(58, (parseInt(qNum, 10) || 2) - 2));
    return sequence[idx];
  }

  /**
   * Builds the specification for study questions 2-60.
   */
  getStudyQuestionSpec(schema, qNum) {
    const questionNumber = Math.max(2, Math.min(60, parseInt(qNum, 10) || 2));
    const qIdx = questionNumber - 2; // 0 to 58

    // Table references
    const tables = (schema && schema.tables && schema.tables.length > 0)
      ? schema.tables
      : [{ name: 'products' }, { name: 'users' }, { name: 'orders' }, { name: 'categories' }];

    const findTable = (name) => tables.find(t => t.name === name) || tables[0];
    const userTable = findTable('users');
    const productTable = findTable('products');
    const orderTable = findTable('orders');
    const categoryTable = findTable('categories');

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
      // Q3 (Structure 3: Append function dummy, query, function call saved to variable, execute)
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 5 ORDER BY name ASC;`,
        manipulation: 'append_function',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 5 ORDER BY name ASC;`
      },
      // Q4 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'LIKE'],
        manipulation: 'noop_replace',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE 'A%';`
      },
      // Q5 (Structure 5: First execution of undefined variable, complex string manipulation on query 1, query 2 overwrites query, execute query 2)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'COUNT', 'ORDER BY'],
        initialSql: `SELECT id, amount, status FROM ${orderTable.name} WHERE amount > 50;`,
        manipulation: 'overwrite_query',
        finalSql: `SELECT status, COUNT(*) AS order_count FROM ${orderTable.name} GROUP BY status ORDER BY order_count DESC;`
      },
      // Q6 (Structure 5: Query 1, Execute Query 1, HostLang, Query 2, Delete Query 2)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'MIN', 'MAX', 'ORDER BY'],
        initialSql: `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM ${productTable.name} WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;`,
        manipulation: 'delete_second_query',
        finalSql: `SELECT category_id, MIN(price) AS min_price, MAX(price) AS max_price FROM ${productTable.name} WHERE price > 35 GROUP BY category_id ORDER BY category_id ASC;`
      },
      // Q7 (Structure 5: Query 1, Execute Query 1, HostLang clause check, Query 2, No second execute)
      {
        structure: 5,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'SUM'],
        initialSql: `SELECT category_id, ROUND(SUM(price), 2) AS sum_price FROM ${productTable.name} WHERE price > 20 GROUP BY category_id ORDER BY category_id ASC;`,
        manipulation: 'delete_second_execute',
        finalSql: `UPDATE ${productTable.name} SET price = price * 2;`
      },
      // Q8 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'GROUP BY', 'AVG', 'MIN', 'MAX', 'ORDER BY'],
        initialSql: `SELECT category_id, ROUND(AVG(price), 2) AS avg_price FROM ${productTable.name} GROUP BY category_id ORDER BY category_id ASC;`,
        manipulation: 'typo_second_query',
        finalSql: `SELECT category_id, ROUND(AVG(price), 2) AS avg_price, MIN(price) AS min_price, MAX(price) AS max_price FROM ${productTable.name} GROUP BY category_id ORDER BY category_id ASC;`
      },
      // Q9 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'UNION'],
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 3 UNION SELECT id, name FROM ${userTable.name} WHERE id >= 6 AND id <= 8;`
      },
      // Q10 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        finalSql: `SELECT id, name FROM ${categoryTable.name} WHERE priority >= 3 ORDER BY id ASC;`
      },
      // Q11 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'LIKE', 'ORDER BY'],
        finalSql: `SELECT id, title, price FROM ${productTable.name} WHERE title LIKE '%e%' ORDER BY price ASC;`
      },
      // Q12 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'COUNT', 'WHERE'],
        finalSql: `SELECT COUNT(*) AS total_count FROM ${orderTable.name} WHERE amount > 15;`
      },
      // Q13 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'SUM', 'AVG'],
        finalSql: `SELECT SUM(amount) AS sum_amt, AVG(amount) AS avg_amt FROM ${orderTable.name} WHERE amount > 25;`
      },
      // Q14 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        initialSql: `SELECT id, amount, status FROM ${orderTable.name} WHERE id <= 10;`,
        manipulation: 'add_limit_order',
        finalSql: `SELECT id, amount, status FROM ${orderTable.name} WHERE id <= 7 ORDER BY id ASC;`
      },
      // Q15 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'MIN', 'MAX'],
        finalSql: `SELECT MIN(price) AS lowest_price, MAX(price) AS highest_price FROM ${productTable.name} WHERE price > 10;`
      },
      // Q16 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['DELETE', 'SELECT', 'WHERE', 'UNION'],
        setupSql: `DELETE FROM ${productTable.name} WHERE id = 30;`,
        finalSql: `SELECT id, title FROM ${productTable.name} WHERE price < 25 UNION SELECT id, title FROM ${productTable.name} WHERE price > 75;`
      },
      // Q17 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'GROUP BY', 'COUNT'],
        finalSql: `SELECT user_id, COUNT(*) AS order_count FROM ${orderTable.name} GROUP BY user_id;`
      },
      // Q18 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'LIKE', 'ORDER BY'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE 'A%';`,
        manipulation: 'add_order_by',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE 'A%' ORDER BY name ASC;`
      },
      // Q19 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['UPDATE', 'SELECT', 'WHERE', 'GROUP BY', 'AVG', 'ORDER BY'],
        setupSql: `UPDATE ${productTable.name} SET price = price + 2 WHERE category_id = 2;`,
        finalSql: `SELECT category_id, AVG(price) AS avg_price FROM ${productTable.name} WHERE price > 15 GROUP BY category_id ORDER BY avg_price ASC;`
      },
      // Q20 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
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
      },
      // Q31 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['UPDATE', 'WHERE', 'SELECT', 'ORDER BY'],
        setupSql: `UPDATE ${orderTable.name} SET amount = amount + 10 WHERE id = 2;`,
        finalSql: `SELECT id, amount FROM ${orderTable.name} WHERE id <= 6 ORDER BY id ASC;`
      },
      // Q32 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'GROUP BY', 'COUNT', 'ORDER BY'],
        finalSql: `SELECT status, COUNT(*) AS count_val FROM ${orderTable.name} WHERE id > 1 GROUP BY status ORDER BY count_val ASC;`
      },
      // Q33 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE id < 3;`,
        manipulation: 'adjust_range',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id >= 4 ORDER BY id ASC;`
      },
      // Q34 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'UNION'],
        finalSql: `SELECT id, name FROM ${categoryTable.name} WHERE id <= 3 UNION SELECT id, name FROM ${categoryTable.name} WHERE id >= 5 AND id <= 7;`
      },
      // Q35 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'GROUP BY', 'AVG'],
        finalSql: `SELECT category_id, AVG(price) AS average_cost FROM ${productTable.name} GROUP BY category_id;`
      },
      // Q36 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['INSERT', 'SELECT', 'WHERE'],
        setupSql: `INSERT INTO ${userTable.name} (id, name, age) VALUES (31, 'Zachary', 29);`,
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id >= 24 ORDER BY id ASC;`
      },
      // Q37 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'SUM'],
        finalSql: `SELECT SUM(price) AS sum_price FROM ${productTable.name} WHERE category_id = 1;`
      },
      // Q38 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'LIKE', 'ORDER BY'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE 'B%';`,
        manipulation: 'expand_like_pattern',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE name LIKE '%a%' ORDER BY name ASC;`
      },
      // Q39 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'GROUP BY', 'MIN', 'MAX', 'ORDER BY'],
        finalSql: `SELECT category_id, MIN(price) AS min_val, MAX(price) AS max_val FROM ${productTable.name} GROUP BY category_id ORDER BY min_val ASC;`
      },
      // Q40 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'COUNT'],
        finalSql: `SELECT COUNT(*) AS user_count FROM ${userTable.name} WHERE age >= 25;`
      },
      // Q41 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'UNION', 'ORDER BY'],
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 3 UNION SELECT id, name FROM ${userTable.name} WHERE id >= 6 AND id <= 8;`
      },
      // Q42 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['DELETE', 'WHERE', 'SELECT', 'COUNT'],
        setupSql: `DELETE FROM ${userTable.name} WHERE id = 5;`,
        finalSql: `SELECT COUNT(*) AS active_users FROM ${userTable.name} WHERE id <= 10;`
      },
      // Q43 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        initialSql: `SELECT id, title, price FROM ${productTable.name} WHERE price < 30;`,
        manipulation: 'adjust_threshold',
        finalSql: `SELECT id, title, price FROM ${productTable.name} WHERE price >= 40 ORDER BY price ASC;`
      },
      // Q44 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'GROUP BY', 'COUNT', 'ORDER BY'],
        finalSql: `SELECT status, COUNT(*) AS count_status FROM ${orderTable.name} GROUP BY status ORDER BY count_status ASC;`
      },
      // Q45 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'LIKE'],
        finalSql: `SELECT id, name FROM ${categoryTable.name} WHERE name LIKE 'H%';`
      },
      // Q46 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'AVG'],
        finalSql: `SELECT AVG(amount) AS avg_amount FROM ${orderTable.name} WHERE amount > 20;`
      },
      // Q47 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['UPDATE', 'WHERE', 'SELECT', 'ORDER BY'],
        setupSql: `UPDATE ${productTable.name} SET stock = stock + 20 WHERE id = 2;`,
        finalSql: `SELECT id, stock FROM ${productTable.name} WHERE id <= 7 ORDER BY id ASC;`
      },
      // Q48 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'UNION'],
        initialSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 4;`,
        manipulation: 'add_union_clause',
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id <= 4 UNION SELECT id, name FROM ${userTable.name} WHERE id >= 6 AND id <= 9;`
      },
      // Q49 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'GROUP BY', 'SUM', 'ORDER BY'],
        finalSql: `SELECT category_id, SUM(stock) AS total_stock FROM ${productTable.name} GROUP BY category_id ORDER BY total_stock DESC;`
      },
      // Q50 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'MAX'],
        finalSql: `SELECT MAX(price) AS peak_price FROM ${productTable.name} WHERE price < 80;`
      },
      // Q51 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'MIN'],
        finalSql: `SELECT MIN(age) AS youngest_age FROM ${userTable.name} WHERE age > 18;`
      },
      // Q52 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['INSERT', 'SELECT', 'SUM', 'WHERE', 'GROUP BY'],
        setupSql: `INSERT INTO ${orderTable.name} (id, user_id, amount, status) VALUES (31, 1, 88.5, 'COMPLETED');`,
        finalSql: `SELECT status, SUM(amount) AS total_sum FROM ${orderTable.name} WHERE user_id <= 3 GROUP BY status ORDER BY total_sum DESC;`
      },
      // Q53 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'LIKE', 'ORDER BY'],
        initialSql: `SELECT id, title FROM ${productTable.name} WHERE title LIKE 'S%';`,
        manipulation: 'refine_filter',
        finalSql: `SELECT id, title FROM ${productTable.name} WHERE title LIKE '%e%' ORDER BY id ASC;`
      },
      // Q54 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'GROUP BY', 'COUNT'],
        finalSql: `SELECT status, COUNT(*) AS status_count FROM ${orderTable.name} GROUP BY status;`
      },
      // Q55 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        finalSql: `SELECT id, name FROM ${categoryTable.name} WHERE id > 2 ORDER BY name ASC;`
      },
      // Q56 (Structure 1: [HostLang], [Query], [Execute])
      {
        structure: 1,
        operators: ['SELECT', 'WHERE', 'UNION'],
        finalSql: `SELECT id, title FROM ${productTable.name} WHERE id <= 3 UNION SELECT id, title FROM ${productTable.name} WHERE id >= 5 AND id <= 7;`
      },
      // Q57 (Structure 5: [Query], [Execute], [HostLang], [Query], [Execute])
      {
        structure: 5,
        operators: ['DELETE', 'WHERE', 'SELECT', 'ORDER BY'],
        setupSql: `DELETE FROM ${categoryTable.name} WHERE id = 5;`,
        finalSql: `SELECT id, name FROM ${categoryTable.name} WHERE id <= 8 ORDER BY id ASC;`
      },
      // Q58 (Structure 2: [Query], [HostLang], [Query], [Execute])
      {
        structure: 2,
        operators: ['SELECT', 'WHERE', 'SUM', 'AVG'],
        initialSql: `SELECT SUM(amount) AS sum_val FROM ${orderTable.name};`,
        manipulation: 'add_avg_and_filter',
        finalSql: `SELECT SUM(amount) AS total_amount, AVG(amount) AS avg_amount FROM ${orderTable.name} WHERE amount > 15;`
      },
      // Q59 (Structure 3: [HostLang], [Query], [HostLang], [Execute])
      {
        structure: 3,
        operators: ['SELECT', 'WHERE', 'MIN', 'MAX', 'ORDER BY'],
        finalSql: `SELECT user_id, MIN(amount) AS min_spent, MAX(amount) AS max_spent FROM ${orderTable.name} WHERE user_id <= 5 GROUP BY user_id ORDER BY min_spent ASC;`
      },
      // Q60 (Structure 4: [Query], [HostLang], [Execute])
      {
        structure: 4,
        operators: ['SELECT', 'WHERE', 'ORDER BY'],
        finalSql: `SELECT id, name FROM ${userTable.name} WHERE id >= 3 ORDER BY id DESC;`
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
   * or delegates to getStudyQuestionSpec for study questions 2-60.
   */
  generateIncrementalQuery(schema, tier = 'medium', allowNULL = true, variationIndex = 0, qNum = null) {
    if (qNum !== null && qNum !== undefined) {
      const parsedQ = parseInt(qNum, 10);
      if (parsedQ === 1) {
        return 'SELECT orders.id, orders.amount FROM orders JOIN users ON orders.user_id = users.id WHERE orders.id <= 6;';
      }
      if (parsedQ >= 2 && parsedQ <= 60) {
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
