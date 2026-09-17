/**
 * Engine 2: Custom JS Relational AST Engine & Evaluator
 */
class CustomJsEngine {
  constructor() {
    this.schema = null;
  }

  loadSchemaAndData(schema) {
    this.schema = schema;
  }

  executeQuery(sqlQuery) {
    const startTime = performance.now();
    const traceLogs = [];

    try {
      if (!this.schema) throw new Error('Schema not loaded in JS Engine');

      traceLogs.push(`[AST PARSER] Parsing query token sequence...`);
      const ast = this.parseQuery(sqlQuery);
      traceLogs.push(`[AST TREE] Main Table: '${ast.mainTable}' | Joins: ${ast.joins.length} | Aggregations: ${ast.aggregates.length}`);

      // Step 1: Base Scan
      const mainTableObj = this.schema.tables.find(t => t.name === ast.mainTable);
      if (!mainTableObj) throw new Error(`Table '${ast.mainTable}' not found in schema`);

      let dataset = mainTableObj.rows.map(row => {
        const tuple = {};
        Object.keys(row).forEach(k => { tuple[`${ast.mainTable}.${k}`] = row[k]; });
        return tuple;
      });
      traceLogs.push(`[STEP 1: SCAN] Scanned table '${ast.mainTable}' -> ${dataset.length} initial tuples`);

      // Step 2: Joins
      ast.joins.forEach((join, idx) => {
        const rightTableObj = this.schema.tables.find(t => t.name === join.table);
        if (!rightTableObj) return;

        const joinedTuples = [];
        dataset.forEach(leftTuple => {
          let matched = false;
          rightTableObj.rows.forEach(rightRow => {
            const tempTuple = { ...leftTuple };
            Object.keys(rightRow).forEach(k => { tempTuple[`${join.table}.${k}`] = rightRow[k]; });

            if (this.evalPredicate(join.onCondition, tempTuple)) {
              joinedTuples.push(tempTuple);
              matched = true;
            }
          });

          if (!matched && join.type === 'LEFT') {
            const nullTuple = { ...leftTuple };
            rightTableObj.columns.forEach(col => { nullTuple[`${join.table}.${col.name}`] = null; });
            joinedTuples.push(nullTuple);
          }
        });
        dataset = joinedTuples;
        traceLogs.push(`[STEP 2.${idx + 1}: ${join.type} JOIN] Joined with '${join.table}' -> ${dataset.length} tuples`);
      });

      // Step 3: WHERE Filter
      if (ast.whereCondition) {
        dataset = dataset.filter(tuple => this.evalPredicate(ast.whereCondition, tuple));
        traceLogs.push(`[STEP 3: SELECTION/WHERE] Filtered predicates -> ${dataset.length} tuples remaining`);
      }

      // Step 4: Grouping & Aggregations
      let resultRows = [];
      let finalColumns = [];

      if (ast.groupBy.length > 0 || ast.aggregates.length > 0) {
        const groups = new Map();

        dataset.forEach(tuple => {
          const groupKey = ast.groupBy.map(g => tuple[g] !== undefined ? tuple[g] : '').join('||');
          if (!groups.has(groupKey)) groups.set(groupKey, []);
          groups.get(groupKey).push(tuple);
        });

        traceLogs.push(`[STEP 4: GROUP BY] Grouped into ${groups.size} distinct aggregate buckets`);

        groups.forEach((groupTuples, gKey) => {
          const resTuple = {};
          // Group keys
          ast.groupBy.forEach(gCol => {
            resTuple[gCol] = groupTuples[0][gCol];
          });

          // Aggregate evaluations
          ast.aggregates.forEach(agg => {
            const vals = groupTuples.map(t => t[agg.column]).filter(v => v !== null && v !== undefined);
            let aggResult = 0;
            if (agg.func === 'COUNT') aggResult = vals.length;
            else if (agg.func === 'SUM') aggResult = vals.reduce((a, b) => a + Number(b), 0);
            else if (agg.func === 'AVG') aggResult = vals.length > 0 ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length) : 0;
            else if (agg.func === 'MAX') aggResult = vals.length > 0 ? Math.max(...vals.map(Number)) : 0;
            else if (agg.func === 'MIN') aggResult = vals.length > 0 ? Math.min(...vals.map(Number)) : 0;

            if (agg.func === 'AVG' || typeof aggResult === 'number') {
              if (!Number.isInteger(aggResult)) aggResult = parseFloat(aggResult.toFixed(2));
            }
            resTuple[agg.alias || `${agg.func.toLowerCase()}_val`] = aggResult;
          });

          resultRows.push(resTuple);
        });

        // Derive column list
        if (resultRows.length > 0) {
          finalColumns = Object.keys(resultRows[0]);
        }
      } else {
        // Step 4b: Standard Projection
        resultRows = dataset.map(tuple => {
          const projected = {};
          if (ast.selectCols.includes('*')) {
            Object.assign(projected, tuple);
          } else {
            ast.selectCols.forEach(col => {
              if (tuple[col] !== undefined) projected[col] = tuple[col];
              else projected[col] = null;
            });
          }
          return projected;
        });
        if (resultRows.length > 0) {
          finalColumns = Object.keys(resultRows[0]);
        }
        traceLogs.push(`[STEP 4: PROJECTION] Projected ${finalColumns.length} attributes across ${resultRows.length} tuples`);
      }

      // Step 5: Sorting (ORDER BY)
      if (ast.orderBy) {
        resultRows.sort((a, b) => {
          const valA = a[ast.orderBy.column] !== undefined ? a[ast.orderBy.column] : 0;
          const valB = b[ast.orderBy.column] !== undefined ? b[ast.orderBy.column] : 0;
          if (valA < valB) return ast.orderBy.dir === 'ASC' ? -1 : 1;
          if (valA > valB) return ast.orderBy.dir === 'ASC' ? 1 : -1;
          return 0;
        });
        traceLogs.push(`[STEP 5: SORTING] Sorted by '${ast.orderBy.column}' (${ast.orderBy.dir})`);
      }

      // Step 6: LIMIT
      if (ast.limit) {
        resultRows = resultRows.slice(0, ast.limit);
        traceLogs.push(`[STEP 6: LIMIT] Truncated dataset to ${resultRows.length} rows`);
      }

      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(3));

      // Format matrix output
      const rawRowsArray = resultRows.map(rowObj => finalColumns.map(col => rowObj[col]));

      return {
        success: true,
        columns: finalColumns,
        rows: rawRowsArray,
        rowCount: rawRowsArray.length,
        executionTimeMs,
        astTrace: traceLogs.join('\n')
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: parseFloat((performance.now() - startTime).toFixed(3)),
        astTrace: traceLogs.join('\n') + `\n[ERROR] ${err.message}`
      };
    }
  }

  parseQuery(sql) {
    if (sql.includes('query:SetTable') || sql.includes('query:')) {
      return this.parseQuorumQuery(sql);
    }
    if (sql.includes('|>') || /^\s*FROM\b/i.test(sql)) {
      return this.parsePipeQuery(sql);
    }
    return this.parseStandardQuery(sql);
  }

  parseQuorumQuery(sql) {
    const ast = {
      mainTable: '',
      selectCols: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      orderBy: null,
      limit: null
    };

    const lines = sql.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    lines.forEach(line => {
      const fromQuorumCols = (str) => str.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*):([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1.$2');

      const setTblMatch = line.match(/^query:SetTable\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)/i);
      if (setTblMatch) {
        ast.mainTable = setTblMatch[1];
      }

      const joinMatch = line.match(/^query:(AddJoin|AddLeftJoin|AddRightJoin|AddCrossJoin)\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)/i);
      if (joinMatch) {
        const jAction = joinMatch[1];
        const jTable = joinMatch[2];
        const jCond = joinMatch[3] ? fromQuorumCols(joinMatch[3]) : '';
        let jType = 'INNER';
        if (jAction === 'AddLeftJoin') jType = 'LEFT';
        else if (jAction === 'AddRightJoin') jType = 'RIGHT';
        else if (jAction === 'AddCrossJoin') jType = 'CROSS';

        ast.joins.push({
          type: jType,
          table: jTable,
          onCondition: jCond
        });
      }

      const filterMatch = line.match(/^query:Filter\("([^"]+)"\)/i);
      if (filterMatch) {
        const cond = fromQuorumCols(filterMatch[1]);
        ast.whereCondition = ast.whereCondition ? `${ast.whereCondition} AND ${cond}` : cond;
      }

      const groupMatch = line.match(/^query:AddGroupColumn\("([^"]+)"\)/i);
      if (groupMatch) {
        ast.groupBy.push(fromQuorumCols(groupMatch[1]));
      }

      const colMatch = line.match(/^query:AddColumn\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)/i);
      if (colMatch) {
        const rawExpr = fromQuorumCols(colMatch[1]);
        const alias = colMatch[2];
        const aggMatch = rawExpr.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)/i);
        if (aggMatch) {
          ast.aggregates.push({
            func: aggMatch[1].toUpperCase(),
            column: aggMatch[2].trim(),
            alias: alias || `${aggMatch[1].toLowerCase()}_val`
          });
        } else if (rawExpr !== '*') {
          ast.selectCols.push(rawExpr);
        } else {
          ast.selectCols.push('*');
        }
      }

      const sortMatch = line.match(/^query:Sort\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)/i);
      if (sortMatch) {
        ast.orderBy = {
          column: fromQuorumCols(sortMatch[1]),
          dir: sortMatch[2] ? sortMatch[2].toUpperCase() : 'ASC'
        };
      }

      const limitMatch = line.match(/^query:SetLimit\((\d+)\)/i);
      if (limitMatch) {
        ast.limit = parseInt(limitMatch[1], 10);
      }
    });

    return ast;
  }

  parsePipeQuery(sql) {
    const ast = {
      mainTable: '',
      selectCols: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      orderBy: null,
      limit: null
    };

    const lines = sql.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    lines.forEach(line => {
      if (line.startsWith('FROM')) {
        const fromMatch = line.match(/^FROM\s+([a-zA-Z0-9._`"\[\]]+)/i);
        if (fromMatch) ast.mainTable = fromMatch[1].replace(/[`"\[\]]/g, '');
      } else if (line.startsWith('|> JOIN') || line.startsWith('|> INNER JOIN') || line.startsWith('|> LEFT JOIN')) {
        const joinMatch = line.match(/^\|>\s*(?:(INNER|LEFT)\s+)?JOIN\s+([a-zA-Z0-9._`"\[\]]+)\s+ON\s+(.*)$/i);
        if (joinMatch) {
          ast.joins.push({
            type: joinMatch[1] ? joinMatch[1].toUpperCase() : 'INNER',
            table: joinMatch[2].replace(/[`"\[\]]/g, ''),
            onCondition: joinMatch[3].trim()
          });
        }
      } else if (line.startsWith('|> WHERE')) {
        const cond = line.replace(/^\|>\s*WHERE\s+/i, '').trim();
        ast.whereCondition = ast.whereCondition ? `${ast.whereCondition} AND ${cond}` : cond;
      } else if (line.startsWith('|> AGGREGATE')) {
        const aggText = line.replace(/^\|>\s*AGGREGATE\s+/i, '').trim();
        const groupIdx = aggText.search(/\bGROUP BY\b/i);
        let aggPart = aggText;
        let groupPart = '';

        if (groupIdx !== -1) {
          aggPart = aggText.substring(0, groupIdx).trim();
          groupPart = aggText.substring(groupIdx).replace(/^GROUP BY\s+/i, '').trim();
        }

        if (groupPart) {
          ast.groupBy = groupPart.split(',').map(s => s.trim().replace(/[`"\[\]]/g, ''));
        }

        if (aggPart) {
          const items = aggPart.split(',').map(s => s.trim());
          items.forEach(item => {
            const aggMatch = item.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)\s*(?:AS\s+([a-zA-Z0-9_]+))?/i);
            if (aggMatch) {
              ast.aggregates.push({
                func: aggMatch[1].toUpperCase(),
                column: aggMatch[2].trim().replace(/[`"\[\]]/g, ''),
                alias: aggMatch[3] || `${aggMatch[1].toLowerCase()}_val`
              });
            }
          });
        }
      } else if (line.startsWith('|> SELECT')) {
        const selectText = line.replace(/^\|>\s*SELECT\s+/i, '').trim();
        ast.selectCols = selectText.split(',').map(s => s.trim().replace(/[`"\[\]]/g, ''));
      } else if (line.startsWith('|> ORDER BY')) {
        const orderText = line.replace(/^\|>\s*ORDER BY\s+/i, '').trim();
        const parts = orderText.split(/\s+/);
        ast.orderBy = {
          column: parts[0].replace(/[`"\[\]]/g, ''),
          dir: parts[1] ? parts[1].toUpperCase() : 'ASC'
        };
      } else if (line.startsWith('|> LIMIT')) {
        const limitText = line.replace(/^\|>\s*LIMIT\s+/i, '').trim();
        ast.limit = parseInt(limitText, 10);
      }
    });

    return ast;
  }

  parseStandardQuery(sql) {
    const ast = {
      mainTable: '',
      selectCols: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      orderBy: null,
      limit: null
    };

    // Extract FROM table
    const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) ast.mainTable = fromMatch[1];

    // Extract JOINs
    const joinRegex = /(INNER|LEFT|RIGHT)?\s*JOIN\s+([a-zA-Z0-9_]+)\s+ON\s+([^\nWHEREGROUPORDERLIMIT]+)/gi;
    let match;
    while ((match = joinRegex.exec(sql)) !== null) {
      ast.joins.push({
        type: match[1] ? match[1].toUpperCase() : 'INNER',
        table: match[2],
        onCondition: match[3].trim()
      });
    }

    // Extract SELECT columns & aggregates
    const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    if (selectMatch) {
      const selectParts = selectMatch[1].split(',').map(s => s.trim());
      selectParts.forEach(part => {
        const aggMatch = part.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
        if (aggMatch) {
          ast.aggregates.push({
            func: aggMatch[1].toUpperCase(),
            column: aggMatch[2].trim(),
            alias: aggMatch[3] ? aggMatch[3].trim() : `${aggMatch[1].toLowerCase()}_val`
          });
        } else {
          ast.selectCols.push(part.replace(/\s+AS\s+[a-zA-Z0-9_]+/i, ''));
        }
      });
    }

    // Extract WHERE
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?=\s+GROUP|\s+HAVING|\s+ORDER|\s+LIMIT|;|$)/i);
    if (whereMatch) {
      ast.whereCondition = whereMatch[1].trim();
    }

    // Extract GROUP BY
    const groupMatch = sql.match(/GROUP BY\s+([a-zA-Z0-9_.,\s]+?)(?=\s+HAVING|\s+ORDER|\s+LIMIT|;|$)/i);
    if (groupMatch) {
      ast.groupBy = groupMatch[1].split(',').map(s => s.trim());
    }

    // Extract ORDER BY
    const orderMatch = sql.match(/ORDER BY\s+([a-zA-Z0-9._]+)\s*(ASC|DESC)?/i);
    if (orderMatch) {
      ast.orderBy = {
        column: orderMatch[1].trim(),
        dir: orderMatch[2] ? orderMatch[2].toUpperCase() : 'ASC'
      };
    }

    // Extract LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      ast.limit = parseInt(limitMatch[1], 10);
    }

    return ast;
  }

  evalPredicate(condStr, tuple) {
    if (!condStr) return true;

    // Handle '=' comparison
    const eqMatch = condStr.match(/([a-zA-Z0-9._]+)\s*=\s*(.+)/);
    if (eqMatch) {
      const leftCol = eqMatch[1].trim();
      const rightValRaw = eqMatch[2].trim();

      const leftVal = tuple[leftCol] !== undefined ? tuple[leftCol] : tuple[Object.keys(tuple).find(k => k.endsWith(`.${leftCol}`))];
      
      // If right side is a column reference in tuple
      if (tuple[rightValRaw] !== undefined) {
        return leftVal == tuple[rightValRaw];
      }

      // If right side is a literal
      const rightVal = rightValRaw.replace(/^['"]|['"]$/g, '');
      return leftVal == rightVal;
    }

    // Handle comparison operators (> < >= <=)
    const opMatch = condStr.match(/([a-zA-Z0-9._]+)\s*(>=|<=|>|<)\s*([0-9.]+)/);
    if (opMatch) {
      const leftCol = opMatch[1].trim();
      const op = opMatch[2];
      const numVal = parseFloat(opMatch[3]);

      const leftVal = tuple[leftCol] !== undefined ? tuple[leftCol] : 0;
      if (op === '>') return Number(leftVal) > numVal;
      if (op === '<') return Number(leftVal) < numVal;
      if (op === '>=') return Number(leftVal) >= numVal;
      if (op === '<=') return Number(leftVal) <= numVal;
    }

    return true;
  }
}

window.CustomJsEngine = CustomJsEngine;
