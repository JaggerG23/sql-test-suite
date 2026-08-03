/**
 * Syntax Dialect Manager
 * Handles translation, formatting, and dialect-specific rules for SQL syntaxes.
 * Dialects configured:
 * 1. Dialect 1: Standard MySQL Syntax
 * 2. Dialect 2: Google SQL (Pipe Syntax)
 * 3. Dialect 3: PostgreSQL Syntax
 */
class SyntaxDialectManager {
  constructor() {
    this.availableDialects = {
      mysql: {
        id: 'mysql',
        name: 'MySQL Syntax',
        badge: 'MySQL',
        identifierQuote: '`',
        limitStyle: 'LIMIT',
        castStyle: 'CAST',
        concatStyle: 'CONCAT',
        nullCheck: 'IFNULL',
        description: 'Standard MySQL dialect using backticks `table`.`column`, CONCAT(), and IFNULL().'
      },
      pipe: {
        id: 'pipe',
        name: 'Google SQL (Pipe Syntax)',
        badge: 'Google Pipe SQL',
        identifierQuote: '',
        limitStyle: 'LIMIT',
        castStyle: 'CAST',
        concatStyle: 'CONCAT',
        nullCheck: 'COALESCE',
        description: 'Google SQL Pipe Syntax starting with FROM table and chaining operations with |>.'
      },
      postgres: {
        id: 'postgres',
        name: 'PostgreSQL Syntax',
        badge: 'PostgreSQL',
        identifierQuote: '"',
        limitStyle: 'LIMIT',
        castStyle: 'TYPECAST', // col::type
        concatStyle: 'PIPE', // ||
        nullCheck: 'COALESCE',
        description: 'Postgres dialect using double quotes "table"."column", ::type casting, and COALESCE().'
      },
      ansi: {
        id: 'ansi',
        name: 'ANSI Standard SQL',
        badge: 'ANSI SQL',
        identifierQuote: '"',
        limitStyle: 'LIMIT',
        castStyle: 'CAST',
        concatStyle: 'CONCAT',
        nullCheck: 'COALESCE',
        description: 'Standard ANSI/ISO SQL syntax with double quotes and standard CAST expressions.'
      },
      sqlite: {
        id: 'sqlite',
        name: 'SQLite / T-SQL',
        badge: 'SQLite',
        identifierQuote: '[',
        limitStyle: 'LIMIT',
        castStyle: 'CAST',
        concatStyle: 'PIPE',
        nullCheck: 'IFNULL',
        description: 'SQLite & T-SQL flavor using brackets [table].[col] and IFNULL/COALESCE.'
      }
    };

    // Defaults requested by user:
    // Dialect 1: MySQL
    // Dialect 2: Google SQL Pipe Syntax
    // Dialect 3: PostgreSQL
    this.activeDialectKeys = ['mysql', 'pipe', 'postgres'];
    this.currentSelectedDialectIndex = 0; // 0 (MySQL), 1 (Pipe), or 2 (Postgres)
  }

  getActiveDialects() {
    return this.activeDialectKeys.map(key => this.availableDialects[key] || this.availableDialects.mysql);
  }

  getCurrentDialect() {
    const key = this.activeDialectKeys[this.currentSelectedDialectIndex] || 'mysql';
    return this.availableDialects[key];
  }

  setActiveDialects(d1Key, d2Key, d3Key) {
    this.activeDialectKeys = [d1Key, d2Key, d3Key];
  }

  setCurrentDialectIndex(idx) {
    if (idx >= 0 && idx < 3) {
      this.currentSelectedDialectIndex = idx;
    }
  }

  /**
   * Translates a standard query string into a specific target dialect format
   */
  formatQueryToDialect(sqlQuery, dialectKey) {
    const dialect = this.availableDialects[dialectKey] || this.getCurrentDialect();
    let formatted = sqlQuery;

    // Handle Google SQL Pipe Syntax
    if (dialect.id === 'pipe') {
      return this.formatToPipeSyntax(sqlQuery);
    }

    // Apply identifier quotes
    if (dialect.identifierQuote === '`') {
      formatted = formatted.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '`$1`.`$2`');
    } else if (dialect.identifierQuote === '[') {
      formatted = formatted.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '[$1].[$2]');
    } else if (dialect.identifierQuote === '"') {
      formatted = formatted.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '"$1"."$2"');
    }

    // Dialect specific NULL check functions
    if (dialect.nullCheck === 'IFNULL') {
      formatted = formatted.replace(/\bCOALESCE\b/gi, 'IFNULL');
    } else if (dialect.nullCheck === 'NVL') {
      formatted = formatted.replace(/\bCOALESCE\b/gi, 'NVL');
    }

    // Dialect specific CAST format (e.g. Postgres ::type)
    if (dialect.castStyle === 'TYPECAST') {
      formatted = formatted.replace(/CAST\((.*?)\s+AS\s+([a-zA-Z]+)\)/gi, '$1::$2');
    }

    return formatted;
  }

  formatToPipeSyntax(sql) {
    let selectClause = '';
    let fromClause = '';
    let whereClause = '';
    let groupByClause = '';
    let havingClause = '';
    let orderByClause = '';
    let limitClause = '';

    const lines = sql.split('\n');
    let currentKey = 'SELECT';

    lines.forEach(line => {
      const l = line.trim();
      if (/^SELECT\b/i.test(l)) { 
        currentKey = 'SELECT'; 
        selectClause += l.replace(/^SELECT\s+/i, '') + ' '; 
      }
      else if (/^FROM\b/i.test(l) || /^INNER JOIN\b/i.test(l) || /^LEFT JOIN\b/i.test(l) || /^JOIN\b/i.test(l)) {
        currentKey = 'FROM';
        fromClause += l + '\n';
      }
      else if (/^WHERE\b/i.test(l)) { currentKey = 'WHERE'; whereClause = l.replace(/^WHERE\s+/i, ''); }
      else if (/^GROUP BY\b/i.test(l)) { currentKey = 'GROUP_BY'; groupByClause = l.replace(/^GROUP BY\s+/i, ''); }
      else if (/^HAVING\b/i.test(l)) { currentKey = 'HAVING'; havingClause = l.replace(/^HAVING\s+/i, ''); }
      else if (/^ORDER BY\b/i.test(l)) { currentKey = 'ORDER_BY'; orderByClause = l.replace(/^ORDER BY\s+/i, ''); }
      else if (/^LIMIT\b/i.test(l)) { currentKey = 'LIMIT'; limitClause = l.replace(/^LIMIT\s+/i, ''); }
      else {
        if (currentKey === 'SELECT') selectClause += l + ' ';
        else if (currentKey === 'FROM') fromClause += l + '\n';
      }
    });

    let pipeSql = fromClause.trim();
    if (whereClause) pipeSql += `\n|> WHERE ${whereClause}`;
    if (groupByClause) {
      pipeSql += `\n|> AGGREGATE ${selectClause.trim()} GROUP BY ${groupByClause}`;
    } else if (selectClause) {
      pipeSql += `\n|> SELECT ${selectClause.trim()}`;
    }
    if (havingClause) pipeSql += `\n|> HAVING ${havingClause}`;
    if (orderByClause) pipeSql += `\n|> ORDER BY ${orderByClause}`;
    if (limitClause) pipeSql += `\n|> LIMIT ${limitClause}`;

    return pipeSql;
  }
}

window.SyntaxDialectManager = SyntaxDialectManager;
