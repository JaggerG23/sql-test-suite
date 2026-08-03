/**
 * Quiz Question Generator
 * Transforms generated SQL queries into randomized multiple-choice participant challenges.
 * Generates 4 options (Keys 1, 2, 3, 4) with 1 correct resolution and 3 realistic distractors.
 */
class QuizGenerator {
  constructor(seed = 42) {
    this.seed = seed;
  }

  generateQuestion(rawSql, schema, dialectManager) {
    if (!rawSql || !schema) {
      return null;
    }

    const currentDialect = dialectManager.getCurrentDialect();
    const dialectSql = dialectManager.formatQueryToDialect(rawSql, currentDialect.id);

    // Identify candidates for removal (Keywords, Functions, Joins, Operators, Clauses)
    const questionTypes = [
      this.createClauseQuestion.bind(this),
      this.createAggregateQuestion.bind(this),
      this.createJoinQuestion.bind(this),
      this.createOperatorQuestion.bind(this),
      this.createDialectSyntaxQuestion.bind(this)
    ];

    // Pick a question generator strategy
    const choiceIdx = Math.floor(Math.random() * questionTypes.length);
    let questionObj = questionTypes[choiceIdx](dialectSql, rawSql, schema, currentDialect);

    // Fallback if strategy returns null
    if (!questionObj) {
      questionObj = this.createClauseQuestion(dialectSql, rawSql, schema, currentDialect) || 
                    this.createGenericQuestion(dialectSql, currentDialect);
    }

    // Shuffle options and assign hotkeys [1, 2, 3, 4]
    const shuffledOptions = this.shuffleAndAssignKeys(questionObj.options);
    questionObj.options = shuffledOptions.options;
    questionObj.correctIndex = shuffledOptions.correctIndex;
    questionObj.correctKey = shuffledOptions.correctIndex + 1; // 1, 2, 3, or 4

    return questionObj;
  }

  createClauseQuestion(dialectSql, rawSql, schema, dialect) {
    const clauses = [
      { regex: /\bGROUP BY\b/gi, token: 'GROUP BY', distractors: ['ORDER BY', 'PARTITION BY', 'CLUSTER BY'], explanation: 'GROUP BY aggregates rows that have the same values into summary rows.' },
      { regex: /\bHAVING\b/gi, token: 'HAVING', distractors: ['WHERE', 'FILTER', 'QUALIFY'], explanation: 'HAVING filters aggregate values after GROUP BY, whereas WHERE filters individual rows before aggregation.' },
      { regex: /\bWHERE\b/gi, token: 'WHERE', distractors: ['HAVING', 'FILTER BY', 'MATCHING'], explanation: 'WHERE specifies filter conditions for rows before any grouping or aggregation takes place.' },
      { regex: /\bORDER BY\b/gi, token: 'ORDER BY', distractors: ['SORT BY', 'ARRANGE BY', 'GROUP BY'], explanation: 'ORDER BY specifies the sequence in which query result rows are sorted.' },
      { regex: /\bLIMIT\b/gi, token: 'LIMIT', distractors: ['TOP', 'TAKE', 'FETCH'], explanation: 'LIMIT restricts the maximum number of result rows returned.' }
    ];

    const match = clauses.find(c => c.regex.test(dialectSql));
    if (!match) return null;

    const incompleteSql = dialectSql.replace(match.regex, '[ ??? ]');

    const options = [
      { text: match.token, isCorrect: true, explanation: match.explanation },
      ...match.distractors.map(d => ({
        text: d,
        isCorrect: false,
        explanation: `'${d}' is invalid or semantically incorrect in this context.`
      }))
    ];

    return {
      type: 'SQL Clause & Logic',
      title: 'Complete the SQL Clause',
      prompt: 'Select the correct keyword to complete the missing SQL clause:',
      incompleteQuery: incompleteSql,
      rawQuery: rawSql,
      dialect: dialect,
      options: options
    };
  }

  createAggregateQuestion(dialectSql, rawSql, schema, dialect) {
    const aggs = [
      { token: 'COUNT', distractors: ['SUM', 'AVG', 'TOTAL'], explanation: 'COUNT() calculates the total number of non-null items or rows.' },
      { token: 'SUM', distractors: ['COUNT', 'AVG', 'TOTAL'], explanation: 'SUM() calculates the numeric total of column values.' },
      { token: 'AVG', distractors: ['MEAN', 'SUM', 'MEDIAN'], explanation: 'AVG() calculates the mathematical average of numeric column values.' },
      { token: 'MAX', distractors: ['HIGH', 'GREATEST', 'TOP'], explanation: 'MAX() returns the maximum value in a set of values.' }
    ];

    const match = aggs.find(a => new RegExp(`\\b${a.token}\\b`, 'gi').test(dialectSql));
    if (!match) return null;

    const incompleteSql = dialectSql.replace(new RegExp(`\\b${match.token}\\b`, 'gi'), '[ ??? ]');

    const options = [
      { text: match.token, isCorrect: true, explanation: match.explanation },
      ...match.distractors.map(d => ({
        text: d,
        isCorrect: false,
        explanation: `'${d}' does not match the aggregate output requirement.`
      }))
    ];

    return {
      type: 'Aggregate Function',
      title: 'Identify the Aggregate Function',
      prompt: 'Which aggregate function resolves the query expression correctly?',
      incompleteQuery: incompleteSql,
      rawQuery: rawSql,
      dialect: dialect,
      options: options
    };
  }

  createJoinQuestion(dialectSql, rawSql, schema, dialect) {
    if (!/\bJOIN\b/i.test(dialectSql)) return null;

    const joinTypes = [
      { regex: /\bINNER JOIN\b/gi, token: 'INNER JOIN', distractors: ['OUTER JOIN', 'CROSS JOIN', 'UNION JOIN'], explanation: 'INNER JOIN returns records that have matching values in both tables.' },
      { regex: /\bLEFT JOIN\b/gi, token: 'LEFT JOIN', distractors: ['RIGHT JOIN', 'INNER JOIN', 'FULL JOIN'], explanation: 'LEFT JOIN returns all records from the left table, and matched records from the right table.' },
      { regex: /\bJOIN\b/gi, token: 'JOIN', distractors: ['MERGE', 'LINK', 'CONNECT'], explanation: 'JOIN combines rows from two or more tables based on a related column.' }
    ];

    const match = joinTypes.find(j => j.regex.test(dialectSql));
    if (!match) return null;

    const incompleteSql = dialectSql.replace(match.regex, '[ ??? ]');

    const options = [
      { text: match.token, isCorrect: true, explanation: match.explanation },
      ...match.distractors.map(d => ({
        text: d,
        isCorrect: false,
        explanation: `'${d}' produces an incorrect join relationship or invalid SQL.`
      }))
    ];

    return {
      type: 'Relational Join',
      title: 'Complete the Relational Join',
      prompt: 'Choose the appropriate JOIN keyword to connect the schema tables:',
      incompleteQuery: incompleteSql,
      rawQuery: rawSql,
      dialect: dialect,
      options: options
    };
  }

  createOperatorQuestion(dialectSql, rawSql, schema, dialect) {
    const operators = [
      { regex: /\s=\s/gi, token: '=', distractors: ['==', ':=', 'IS EQUAL'], explanation: 'In standard SQL, = is the equality comparison operator.' },
      { regex: /\s>\s/gi, token: '>', distractors: ['=>', '>>', 'ABOVE'], explanation: '> filters rows strictly greater than the threshold value.' },
      { regex: /\s<\s/gi, token: '<', distractors: ['<=', '<<', 'BELOW'], explanation: '< filters rows strictly less than the threshold value.' }
    ];

    const match = operators.find(op => op.regex.test(dialectSql));
    if (!match) return null;

    const incompleteSql = dialectSql.replace(match.regex, ' [ ??? ] ');

    const options = [
      { text: match.token, isCorrect: true, explanation: match.explanation },
      ...match.distractors.map(d => ({
        text: d,
        isCorrect: false,
        explanation: `'${d}' is an invalid or unsupported SQL comparison operator.`
      }))
    ];

    return {
      type: 'Comparison Operator',
      title: 'Select the Comparison Operator',
      prompt: 'Which comparison operator correctly completes the WHERE condition filter?',
      incompleteQuery: incompleteSql,
      rawQuery: rawSql,
      dialect: dialect,
      options: options
    };
  }

  createDialectSyntaxQuestion(dialectSql, rawSql, schema, dialect) {
    let incompleteSql = dialectSql;
    let correctToken = 'COALESCE';
    let distractors = ['IFNULL', 'NVL', 'ISNULL'];

    if (dialect.id === 'postgres') {
      correctToken = 'COALESCE';
      distractors = ['IFNULL', 'NVL', 'ISNULL'];
    } else if (dialect.id === 'mysql') {
      correctToken = 'IFNULL';
      distractors = ['NVL', 'COALESCE', 'IF_EMPTY'];
    }

    if (!/\b(COALESCE|IFNULL|NVL)\b/i.test(dialectSql)) {
      return null;
    }

    incompleteSql = dialectSql.replace(/\b(COALESCE|IFNULL|NVL)\b/gi, '[ ??? ]');

    const options = [
      { text: correctToken, isCorrect: true, explanation: `In ${dialect.name}, ${correctToken}() handles NULL values appropriately.` },
      ...distractors.map(d => ({
        text: d,
        isCorrect: false,
        explanation: `'${d}' may not be native to the active ${dialect.name} syntax dialect.`
      }))
    ];

    return {
      type: 'Dialect Specific Syntax',
      title: 'Dialect Syntax Challenge',
      prompt: `Select the proper null-handling function for ${dialect.name}:`,
      incompleteQuery: incompleteSql,
      rawQuery: rawSql,
      dialect: dialect,
      options: options
    };
  }

  createGenericQuestion(dialectSql, dialect) {
    const incompleteSql = dialectSql.replace(/\bSELECT\b/i, '[ ??? ]');
    return {
      type: 'Syntax Keyword',
      title: 'SQL Starter Keyword',
      prompt: 'Select the initial projection keyword for SQL queries:',
      incompleteQuery: incompleteSql,
      dialect: dialect,
      options: [
        { text: 'SELECT', isCorrect: true, explanation: 'SELECT specifies which columns or expressions to return.' },
        { text: 'FETCH', isCorrect: false, explanation: 'FETCH is used with row offset clauses.' },
        { text: 'QUERY', isCorrect: false, explanation: 'QUERY is not a standard SQL query starting statement.' },
        { text: 'EXTRACT', isCorrect: false, explanation: 'EXTRACT is a date/time part function.' }
      ]
    };
  }

  shuffleAndAssignKeys(options) {
    // Make deep copy
    const arr = [...options];

    // Fisher-Yates shuffle
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
