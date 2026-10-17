/**
 * Syntax Dialect Manager
 * Handles translation, formatting, and dialect-specific rules for SQL syntaxes.
 * Configured Dialects:
 * 1. Google SQL (Pipe Syntax)
 * 2. Quorum Syntax
 */
class SyntaxDialectManager {
  constructor() {
    this.availableDialects = {
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
      quorum: {
        id: 'quorum',
        name: 'Quorum Syntax',
        badge: 'Quorum Syntax',
        identifierQuote: '',
        limitStyle: 'LIMIT',
        castStyle: 'CAST',
        concatStyle: 'CONCAT',
        nullCheck: 'COALESCE',
        description: 'Quorum object-oriented syntax using action calls (query:SetTable, query:Filter, query:AddColumn) and colon table:column mapping.'
      }
    };

    // Active base dialects: Google SQL (Pipe) & Quorum Syntax
    this.activeDialectKeys = ['pipe', 'quorum'];
    this.currentSelectedDialectIndex = null; // null = automatic question assignment
    this.fixedDialectKey = null;
    this.balancedSequence = null;
    this.initBalancedSequence(42);
  }

  initBalancedSequence(seed = 42) {
    const list = [];
    for (let i = 0; i < 30; i++) list.push('pipe');
    for (let i = 0; i < 30; i++) list.push('quorum');

    // Deterministic Fisher-Yates Shuffle using pseudo-RNG
    let currentSeed = seed * 10007 + 1337;
    const nextFloat = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };

    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(nextFloat() * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    this.balancedSequence = list;
  }

  getActiveDialects() {
    return this.activeDialectKeys.map(key => this.availableDialects[key] || this.availableDialects.pipe);
  }

  setFixedDialectKey(key) {
    if (key && this.availableDialects[key]) {
      this.fixedDialectKey = key;
    } else {
      this.fixedDialectKey = null;
    }
  }

  getDialectForQuestion(qNumber = 1, seed = 42, targetGroup = null) {
    if (targetGroup && targetGroup.sqlDialect) {
      const key = targetGroup.sqlDialect;
      return this.availableDialects[key] || this.availableDialects.pipe;
    }
    if (this.fixedDialectKey) {
      return this.availableDialects[this.fixedDialectKey] || this.availableDialects.pipe;
    }
    if (typeof window !== 'undefined' && window.app && window.app.analytics && typeof window.app.analytics.getAssignedGroup === 'function') {
      const g = window.app.analytics.getAssignedGroup();
      if (g && g.sqlDialect) {
        return this.availableDialects[g.sqlDialect] || this.availableDialects.pipe;
      }
    }
    if (!this.balancedSequence || this.balancedSequence.length !== 60) {
      this.initBalancedSequence(seed);
    }
    const qIdx = Math.max(0, Math.min(59, (parseInt(qNumber, 10) || 1) - 1));
    const key = this.balancedSequence[qIdx] || 'pipe';
    return this.availableDialects[key] || this.availableDialects.pipe;
  }

  getCurrentDialect(qNumber = null, seed = 42, targetGroup = null) {
    if (this.currentSelectedDialectIndex !== null && this.currentSelectedDialectIndex !== undefined) {
      const key = this.activeDialectKeys[this.currentSelectedDialectIndex] || 'pipe';
      return this.availableDialects[key] || this.availableDialects.pipe;
    }
    const targetQ = qNumber || (window.app ? window.app.currentQuestionNumber : 1);
    return this.getDialectForQuestion(targetQ, seed, targetGroup);
  }

  setActiveDialects(d1Key, d2Key) {
    this.activeDialectKeys = [d1Key, d2Key];
  }

  setCurrentDialectIndex(idx) {
    if (idx === null || idx === undefined || idx < 0 || idx >= this.activeDialectKeys.length) {
      this.currentSelectedDialectIndex = null;
    } else {
      this.currentSelectedDialectIndex = idx;
    }
  }

  /**
   * Translates a standard query string into a specific target dialect format
   */
  formatQueryToDialect(sqlQuery, dialectKey) {
    let keyToUse = dialectKey;
    if (!keyToUse) {
      keyToUse = this.getCurrentDialect().id;
    }
    const dialect = this.availableDialects[keyToUse] || this.getCurrentDialect();
    let formatted = sqlQuery;

    // Handle Google SQL Pipe Syntax
    if (dialect.id === 'pipe') {
      return this.formatToPipeSyntax(sqlQuery);
    }

    // Handle Quorum Syntax
    if (dialect.id === 'quorum') {
      return this.formatToQuorumSyntax(sqlQuery);
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

    // Dialect specific CAST format
    if (dialect.castStyle === 'TYPECAST') {
      formatted = formatted.replace(/CAST\((.*?)\s+AS\s+([a-zA-Z]+)\)/gi, '$1::$2');
    }

    return formatted;
  }

  formatToPipeSyntax(sql) {
    if (!sql) return '';
    const cleanSql = sql.trim().replace(/;$/, '');

    // Handle DML statements directly
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(cleanSql)) {
      return cleanSql + ';';
    }

    // Handle UNION
    if (/\bUNION\b/i.test(cleanSql)) {
      const parts = cleanSql.split(/\bUNION\b/i);
      const pipeParts = parts.map(p => this.formatToPipeSyntax(p.trim()));
      if (pipeParts.length > 1) {
        let res = pipeParts[0];
        for (let i = 1; i < pipeParts.length; i++) {
          const indented = pipeParts[i].split('\n').map(l => '  ' + l).join('\n');
          res += `\n|> UNION DISTINCT (\n${indented}\n)`;
        }
        return res;
      }
    }

    const selectMatch = cleanSql.match(/SELECT\s+([\s\S]+?)(?=\s+FROM\b)/i);
    const fromMatch = cleanSql.match(/FROM\s+([\s\S]+?)(?=\s+WHERE\b|\s+GROUP BY\b|\s+HAVING\b|\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const whereMatch = cleanSql.match(/\bWHERE\s+([\s\S]+?)(?=\s+GROUP BY\b|\s+HAVING\b|\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const groupMatch = cleanSql.match(/\bGROUP BY\s+([\s\S]+?)(?=\s+HAVING\b|\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const havingMatch = cleanSql.match(/\bHAVING\s+([\s\S]+?)(?=\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const orderMatch = cleanSql.match(/\bORDER BY\s+([\s\S]+?)(?=\s+LIMIT\b|$)/i);
    const limitMatch = cleanSql.match(/\bLIMIT\s+([0-9]+)/i);

    const rawSelect = selectMatch ? selectMatch[1].trim() : '';
    const rawFrom = fromMatch ? fromMatch[1].trim() : '';
    const rawWhere = whereMatch ? whereMatch[1].trim() : '';
    const rawGroup = groupMatch ? groupMatch[1].trim() : '';
    const rawHaving = havingMatch ? havingMatch[1].trim() : '';
    const rawOrder = orderMatch ? orderMatch[1].trim() : '';
    const rawLimit = limitMatch ? limitMatch[1].trim() : '';

    const pipeLines = [];

    // 1. Process FROM & JOINs
    if (rawFrom) {
      const firstJoinIdx = rawFrom.search(/(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b/i);
      if (firstJoinIdx !== -1) {
        const mainTable = rawFrom.substring(0, firstJoinIdx).trim();
        const joinString = rawFrom.substring(firstJoinIdx).trim();

        pipeLines.push(`FROM ${mainTable}`);

        const joinRegex = /(?:(INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN\s+([a-zA-Z0-9._`"\[\]]+)\s+ON\s+([^\n]+?)(?=(?:\s+(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b)|$)/gi;
        let match;
        while ((match = joinRegex.exec(joinString)) !== null) {
          const type = match[1] ? match[1].toUpperCase() + ' ' : '';
          const jTable = match[2].trim();
          const jCond = match[3].trim();
          pipeLines.push(`|> ${type}JOIN ${jTable} ON ${jCond}`);
        }
      } else {
        pipeLines.push(`FROM ${rawFrom}`);
      }
    }

    // 2. Process WHERE
    if (rawWhere) {
      pipeLines.push(`|> WHERE ${rawWhere}`);
    }

    // 3. Process AGGREGATE & GROUP BY or SELECT
    if (rawGroup) {
      const selectItems = this.splitCsvClause(rawSelect);
      const groupCols = this.splitCsvClause(rawGroup);
      const aggExpressions = [];

      selectItems.forEach(item => {
        const isGroupCol = groupCols.some(g => g.toLowerCase() === item.toLowerCase());
        if (!isGroupCol) {
          aggExpressions.push(item);
        }
      });

      if (aggExpressions.length > 0) {
        pipeLines.push(`|> AGGREGATE ${aggExpressions.join(', ')} GROUP BY ${rawGroup}`);
      } else {
        pipeLines.push(`|> AGGREGATE GROUP BY ${rawGroup}`);
      }
    } else if (rawSelect && rawSelect !== '*') {
      pipeLines.push(`|> SELECT ${rawSelect}`);
    }

    // 4. Process HAVING -> Converted to post-aggregate WHERE in Pipe SQL
    if (rawHaving) {
      pipeLines.push(`|> WHERE ${rawHaving}`);
    }

    // 5. Process ORDER BY
    if (rawOrder) {
      pipeLines.push(`|> ORDER BY ${rawOrder}`);
    }

    // 6. Process LIMIT
    if (rawLimit) {
      pipeLines.push(`|> LIMIT ${rawLimit}`);
    }

    return pipeLines.join('\n');
  }

  formatToQuorumSyntax(sql) {
    if (!sql) return '';
    const cleanSql = sql.trim().replace(/;$/, '');

    // Handle DML statements directly
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(cleanSql)) {
      return cleanSql + ';';
    }

    // Handle UNION
    if (/\bUNION\b/i.test(cleanSql)) {
      const parts = cleanSql.split(/\bUNION\b/i);
      return parts.map(p => this.formatToQuorumSyntax(p.trim())).join('\n\n');
    }

    const selectMatch = cleanSql.match(/SELECT\s+([\s\S]+?)(?=\s+FROM\b)/i);
    const fromMatch = cleanSql.match(/FROM\s+([\s\S]+?)(?=\s+WHERE\b|\s+GROUP BY\b|\s+HAVING\b|\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const whereMatch = cleanSql.match(/\bWHERE\s+([\s\S]+?)(?=\s+GROUP BY\b|\s+HAVING\b|\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const groupMatch = cleanSql.match(/\bGROUP BY\s+([\s\S]+?)(?=\s+HAVING\b|\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const havingMatch = cleanSql.match(/\bHAVING\s+([\s\S]+?)(?=\s+ORDER BY\b|\s+LIMIT\b|$)/i);
    const orderMatch = cleanSql.match(/\bORDER BY\s+([\s\S]+?)(?=\s+LIMIT\b|$)/i);
    const limitMatch = cleanSql.match(/\bLIMIT\s+([0-9]+)/i);

    const rawSelect = selectMatch ? selectMatch[1].trim() : '';
    const rawFrom = fromMatch ? fromMatch[1].trim() : '';
    const rawWhere = whereMatch ? whereMatch[1].trim() : '';
    const rawGroup = groupMatch ? groupMatch[1].trim() : '';
    const rawHaving = havingMatch ? havingMatch[1].trim() : '';
    const rawOrder = orderMatch ? orderMatch[1].trim() : '';
    const rawLimit = limitMatch ? limitMatch[1].trim() : '';

    const lines = [];

    // Helper to convert table.col to table:col
    const toQuorumCols = (str) => {
      return str.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1:$2');
    };

    // 1. SetTable & Joins
    if (rawFrom) {
      const firstJoinIdx = rawFrom.search(/(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b/i);
      let mainTable = rawFrom;
      let joinString = '';

      if (firstJoinIdx !== -1) {
        mainTable = rawFrom.substring(0, firstJoinIdx).trim();
        joinString = rawFrom.substring(firstJoinIdx).trim();
      }

      lines.push(`query:SetTable("${mainTable}")`);

      if (joinString) {
        const joinRegex = /(?:(INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN\s+([a-zA-Z0-9._`"\[\]]+)\s+ON\s+([^\n]+?)(?=(?:\s+(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b)|$)/gi;
        let match;
        while ((match = joinRegex.exec(joinString)) !== null) {
          const type = match[1] ? match[1].toUpperCase() : 'INNER';
          const jTable = match[2].trim();
          const jCond = toQuorumCols(match[3].trim());
          if (type === 'LEFT') lines.push(`query:AddLeftJoin("${jTable}", "${jCond}")`);
          else if (type === 'RIGHT') lines.push(`query:AddRightJoin("${jTable}", "${jCond}")`);
          else if (type === 'CROSS') lines.push(`query:AddCrossJoin("${jTable}")`);
          else lines.push(`query:AddJoin("${jTable}", "${jCond}")`);
        }
      }
    }

    // 2. Filter (WHERE)
    if (rawWhere) {
      lines.push(`query:Filter("${toQuorumCols(rawWhere)}")`);
    }

    // 3. Group By
    if (rawGroup) {
      const gItems = this.splitCsvClause(rawGroup);
      gItems.forEach(g => {
        lines.push(`query:AddGroupColumn("${toQuorumCols(g)}")`);
      });
    }

    // 4. Having Filter
    if (rawHaving) {
      lines.push(`query:Filter("${toQuorumCols(rawHaving)}")`);
    }

    // 5. Select / Aggregations (AddColumn)
    if (rawSelect) {
      const sItems = this.splitCsvClause(rawSelect);
      sItems.forEach(item => {
        const asMatch = item.match(/^([\s\S]+?)\s+AS\s+([a-zA-Z0-9_]+)$/i);
        if (asMatch) {
          lines.push(`query:AddColumn("${toQuorumCols(asMatch[1].trim())}", "${asMatch[2].trim()}")`);
        } else {
          lines.push(`query:AddColumn("${toQuorumCols(item.trim())}")`);
        }
      });
    }

    // 6. Sort (ORDER BY)
    if (rawOrder) {
      const orderParts = rawOrder.split(/\s+/);
      const col = toQuorumCols(orderParts[0].trim());
      const dir = orderParts[1] ? orderParts[1].toUpperCase() : 'ASC';
      lines.push(`query:Sort("${col}", "${dir}")`);
    }

    // 7. Limit
    if (rawLimit) {
      lines.push(`query:SetLimit(${rawLimit})`);
    }

    return lines.join('\n');
  }

  splitCsvClause(str) {
    if (!str) return [];
    const items = [];
    let current = '';
    let parenDepth = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;
      if (char === ',' && parenDepth === 0) {
        items.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) items.push(current.trim());
    return items;
  }
}

window.SyntaxDialectManager = SyntaxDialectManager;
