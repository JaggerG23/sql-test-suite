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

  parseFromSubquery(sqlQuery) {
    if (!sqlQuery) return null;
    const fromMatch = sqlQuery.match(/\bFROM\s*\(/i);
    if (!fromMatch) return null;

    const openParenIndex = fromMatch.index + fromMatch[0].length - 1;
    let depth = 1;
    let closeParenIndex = -1;

    for (let i = openParenIndex + 1; i < sqlQuery.length; i++) {
      const char = sqlQuery[i];
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          closeParenIndex = i;
          break;
        }
      }
    }

    if (closeParenIndex === -1) return null;

    const outerBeforeFrom = sqlQuery.substring(0, fromMatch.index).trim();
    const innerSql = sqlQuery.substring(openParenIndex + 1, closeParenIndex).trim();
    const afterClose = sqlQuery.substring(closeParenIndex + 1).trim();

    const aliasMatch = afterClose.match(/^(?:AS\s+)?([a-zA-Z0-9_]+)\b([\s\S]*)$/i);
    const alias = aliasMatch ? aliasMatch[1] : 'sub';
    const outerRemainder = aliasMatch ? aliasMatch[2].trim() : afterClose;

    return {
      outerBeforeFrom,
      innerSql,
      alias,
      outerRemainder
    };
  }

  executeQuery(sqlQuery) {
    const startTime = performance.now();
    const traceLogs = [];

    try {
      if (!this.schema) throw new Error('Schema not loaded in JS Engine');

      // Check for multi-statement execution (e.g. UPDATE; SELECT)
      if (sqlQuery && sqlQuery.includes(';') && sqlQuery.trim().split(';').filter(s => s.trim().length > 0).length > 1) {
        const stmts = sqlQuery.trim().split(';').map(s => s.trim()).filter(s => s.length > 0);
        const selectStmt = stmts.find(s => /^SELECT\b/i.test(s)) || stmts[stmts.length - 1];
        return this.executeQuery(selectStmt);
      }

      // Check for UNION (Standard SQL, Pipe SQL, or Quorum query:Union())
      if (sqlQuery && (/\bUNION\b/i.test(sqlQuery) || /query:Union(?:All)?\(\)/i.test(sqlQuery))) {
        const isUnionAll = /\bUNION\s+ALL\b/i.test(sqlQuery) || /query:UnionAll\(\)/i.test(sqlQuery);
        const parts = sqlQuery.split(/\bUNION(?:\s+ALL|\s+DISTINCT)?\b|query:Union(?:All)?\(\)/i);
        const res1 = this.executeQuery(parts[0].trim());
        const res2 = this.executeQuery(parts[1].trim());
        if (res1.success && res2.success) {
          const seen = new Set();
          const combinedRows = [];
          [...res1.rows, ...res2.rows].forEach(r => {
            if (isUnionAll) {
              combinedRows.push(r);
            } else {
              const key = JSON.stringify(r);
              if (!seen.has(key)) {
                seen.add(key);
                combinedRows.push(r);
              }
            }
          });
          return {
            success: true,
            columns: res1.columns.length > 0 ? res1.columns : res2.columns,
            rows: combinedRows,
            rowCount: combinedRows.length,
            executionTimeMs: parseFloat((performance.now() - startTime).toFixed(3)),
            astTrace: [...(Array.isArray(res1.astTrace) ? res1.astTrace : [res1.astTrace]), '[UNION] Combined tuples', ...(Array.isArray(res2.astTrace) ? res2.astTrace : [res2.astTrace])].join('\n')
          };
        }
      }

      // Check for Subquery in FROM: FROM (SELECT ...) sub
      const subquery = this.parseFromSubquery(sqlQuery);
      if (subquery) {
        const innerRes = this.executeQuery(subquery.innerSql);
        if (!innerRes.success) {
          throw new Error(`Subquery evaluation failed: ${innerRes.error}`);
        }

        const virtualTable = {
          name: subquery.alias,
          columns: innerRes.columns.map(c => ({ name: c, type: 'TEXT' })),
          rows: innerRes.rows.map(r => {
            const rowObj = {};
            innerRes.columns.forEach((col, idx) => {
              rowObj[col] = r[idx];
            });
            return rowObj;
          })
        };

        const originalTables = this.schema.tables;
        this.schema.tables = [...originalTables.filter(t => t.name !== subquery.alias), virtualTable];
        try {
          const outerSql = `${subquery.outerBeforeFrom} FROM ${subquery.alias} ${subquery.outerRemainder}`;
          return this.executeQuery(outerSql);
        } finally {
          this.schema.tables = originalTables;
        }
      }

      traceLogs.push(`[AST PARSER] Parsing query token sequence...`);
      const ast = this.parseQuery(sqlQuery);
      traceLogs.push(`[AST TREE] Main Table: '${ast.mainTable}' | Joins: ${ast.joins.length} | Aggregations: ${ast.aggregates.length}`);

      // Step 1: Base Scan
      const mainTableObj = this.schema.tables.find(t => t.name === ast.mainTable);
      if (!mainTableObj) throw new Error(`Table '${ast.mainTable}' not found in schema`);

      let dataset = mainTableObj.rows.map(row => {
        const tuple = {};
        Object.keys(row).forEach(k => {
          tuple[`${ast.mainTable}.${k}`] = row[k];
          tuple[k] = row[k];
        });
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
            Object.keys(rightRow).forEach(k => {
              tempTuple[`${join.table}.${k}`] = rightRow[k];
              if (tempTuple[k] === undefined) tempTuple[k] = rightRow[k];
            });

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

      // Helper to resolve a column or string literal from a tuple
      const resolveTupleValue = (tuple, expr) => {
        if (!expr) return null;
        const litMatch = expr.match(/^['"](.*)['"]$/);
        if (litMatch) return litMatch[1];
        if (tuple[expr] !== undefined) return tuple[expr];
        const bare = expr.includes('.') ? expr.split('.')[1] : expr;
        if (tuple[`${ast.mainTable}.${bare}`] !== undefined) return tuple[`${ast.mainTable}.${bare}`];
        if (tuple[bare] !== undefined) return tuple[bare];
        const suffixKey = Object.keys(tuple).find(k => k.endsWith(`.${bare}`));
        return suffixKey !== undefined ? tuple[suffixKey] : null;
      };

      // Step 4: Grouping & Aggregations
      let resultRows = [];
      let finalColumns = [];

      if (ast.groupBy.length > 0 || ast.aggregates.length > 0) {
        const groups = new Map();

        if (ast.groupBy.length === 0) {
          groups.set('__all__', dataset);
        } else {
          dataset.forEach(tuple => {
            const groupKey = ast.groupBy.map(g => {
              const val = resolveTupleValue(tuple, g);
              return val !== null && val !== undefined ? val : '';
            }).join('||');
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(tuple);
          });
        }

        traceLogs.push(`[STEP 4: GROUP BY] Grouped into ${groups.size} distinct aggregate buckets`);

        groups.forEach((groupTuples) => {
          const resTuple = {};
          // Projected non-aggregate columns or group keys
          if (ast.selectSpecs && ast.selectSpecs.length > 0) {
            ast.selectSpecs.forEach(spec => {
              resTuple[spec.outputName] = groupTuples.length > 0 ? resolveTupleValue(groupTuples[0], spec.expr) : null;
            });
          } else {
            ast.groupBy.forEach(gCol => {
              const cleanCol = gCol.includes('.') ? gCol.split('.')[1] : gCol;
              resTuple[cleanCol] = groupTuples.length > 0 ? resolveTupleValue(groupTuples[0], gCol) : null;
            });
          }

          // Aggregate evaluations
          ast.aggregates.forEach(agg => {
            const vals = groupTuples.map(t => resolveTupleValue(t, agg.column)).filter(v => v !== null && v !== undefined);
            let aggResult = 0;
            if (agg.func === 'COUNT') aggResult = (agg.column === '*' || agg.column === '') ? groupTuples.length : vals.length;
            else if (agg.func === 'SUM') aggResult = vals.reduce((a, b) => a + Number(b), 0);
            else if (agg.func === 'AVG') aggResult = vals.length > 0 ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length) : 0;
            else if (agg.func === 'MAX') aggResult = vals.length > 0 ? Math.max(...vals.map(Number)) : 0;
            else if (agg.func === 'MIN') aggResult = vals.length > 0 ? Math.min(...vals.map(Number)) : 0;

            if (agg.roundDecimals !== undefined) {
              aggResult = parseFloat(aggResult.toFixed(agg.roundDecimals));
            } else if (agg.func === 'AVG' || typeof aggResult === 'number') {
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
        const specs = (ast.selectSpecs && ast.selectSpecs.length > 0)
          ? ast.selectSpecs
          : ast.selectCols.map(c => ({ expr: c, outputName: c.includes('.') ? c.split('.')[1] : c }));

        resultRows = dataset.map(tuple => {
          const projected = {};
          if (ast.selectCols.includes('*')) {
            Object.assign(projected, tuple);
          } else {
            specs.forEach(spec => {
              projected[spec.outputName] = resolveTupleValue(tuple, spec.expr);
            });
          }
          return projected;
        });
        if (resultRows.length > 0) {
          finalColumns = Object.keys(resultRows[0]);
        } else if (specs.length > 0) {
          finalColumns = specs.map(s => s.outputName);
        }
        traceLogs.push(`[STEP 4: PROJECTION] Projected ${finalColumns.length} attributes across ${resultRows.length} tuples`);
      }

      // Step 5: Sorting (ORDER BY - supports multi-column sorting)
      const orderList = (ast.orderByList && ast.orderByList.length > 0)
        ? ast.orderByList
        : (ast.orderBy ? [ast.orderBy] : []);

      if (orderList.length > 0) {
        resultRows.sort((a, b) => {
          for (const ord of orderList) {
            const orderCol = ord.column;
            const cleanOrderCol = orderCol.includes('.') ? orderCol.split('.')[1] : orderCol;
            const valA = a[orderCol] !== undefined ? a[orderCol] : (a[cleanOrderCol] !== undefined ? a[cleanOrderCol] : 0);
            const valB = b[orderCol] !== undefined ? b[orderCol] : (b[cleanOrderCol] !== undefined ? b[cleanOrderCol] : 0);
            if (valA < valB) return ord.dir === 'ASC' ? -1 : 1;
            if (valA > valB) return ord.dir === 'ASC' ? 1 : -1;
          }
          return 0;
        });
        traceLogs.push(`[STEP 5: SORTING] Sorted by ${orderList.map(o => `'${o.column}' (${o.dir})`).join(', ')}`);
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
      selectSpecs: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      orderBy: null,
      orderByList: [],
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
        const roundMatch = rawExpr.match(/ROUND\s*\(\s*(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)\s*(?:,\s*(\d+))?\s*\)/i);
        if (roundMatch) {
          ast.aggregates.push({
            func: roundMatch[1].toUpperCase(),
            column: roundMatch[2].trim(),
            roundDecimals: roundMatch[3] ? parseInt(roundMatch[3], 10) : 0,
            alias: alias || `${roundMatch[1].toLowerCase()}_val`
          });
        } else {
          const aggMatch = rawExpr.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)/i);
          if (aggMatch) {
            ast.aggregates.push({
              func: aggMatch[1].toUpperCase(),
              column: aggMatch[2].trim(),
              alias: alias || `${aggMatch[1].toLowerCase()}_val`
            });
          } else if (rawExpr !== '*') {
            const defaultName = rawExpr.includes('.') ? rawExpr.split('.')[1] : rawExpr.replace(/^['"]|['"]$/g, '');
            ast.selectCols.push(rawExpr);
            ast.selectSpecs.push({ expr: rawExpr, outputName: alias || defaultName });
          } else {
            ast.selectCols.push('*');
          }
        }
      }

      const sortMatch = line.match(/^query:Sort\("([^"]+)"(?:\s*,\s*"([^"]+)")?\)/i);
      if (sortMatch) {
        const sortSpec = {
          column: fromQuorumCols(sortMatch[1].replace(/,+$/, '').trim()),
          dir: sortMatch[2] ? sortMatch[2].toUpperCase() : 'ASC'
        };
        ast.orderByList.push(sortSpec);
        if (!ast.orderBy) ast.orderBy = sortSpec;
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
      selectSpecs: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      orderBy: null,
      orderByList: [],
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
          ast.groupBy.forEach(g => {
            const bare = g.includes('.') ? g.split('.')[1] : g;
            ast.selectSpecs.push({ expr: g, outputName: bare });
          });
        }

        if (aggPart) {
          const items = this.splitCsvClause(aggPart);
          items.forEach(item => {
            const roundMatch = item.match(/ROUND\s*\(\s*(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)\s*(?:,\s*(\d+))?\s*\)\s*(?:AS\s+([a-zA-Z0-9_]+))?/i);
            if (roundMatch) {
              ast.aggregates.push({
                func: roundMatch[1].toUpperCase(),
                column: roundMatch[2].trim().replace(/[`"\[\]]/g, ''),
                roundDecimals: roundMatch[3] ? parseInt(roundMatch[3], 10) : 0,
                alias: roundMatch[4] || `${roundMatch[1].toLowerCase()}_val`
              });
            } else {
              const aggMatch = item.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)\s*(?:AS\s+([a-zA-Z0-9_]+))?/i);
              if (aggMatch) {
                ast.aggregates.push({
                  func: aggMatch[1].toUpperCase(),
                  column: aggMatch[2].trim().replace(/[`"\[\]]/g, ''),
                  alias: aggMatch[3] || `${aggMatch[1].toLowerCase()}_val`
                });
              }
            }
          });
        }
      } else if (line.startsWith('|> SELECT')) {
        const selectText = line.replace(/^\|>\s*SELECT\s+/i, '').trim();
        const items = this.splitCsvClause(selectText);
        items.forEach(item => {
          const roundMatch = item.match(/ROUND\s*\(\s*(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)\s*(?:,\s*(\d+))?\s*\)\s*(?:AS\s+([a-zA-Z0-9_]+))?/i);
          if (roundMatch) {
            ast.aggregates.push({
              func: roundMatch[1].toUpperCase(),
              column: roundMatch[2].trim().replace(/[`"\[\]]/g, ''),
              roundDecimals: roundMatch[3] ? parseInt(roundMatch[3], 10) : 0,
              alias: roundMatch[4] || `${roundMatch[1].toLowerCase()}_val`
            });
          } else {
            const aggMatch = item.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
            if (aggMatch) {
              ast.aggregates.push({
                func: aggMatch[1].toUpperCase(),
                column: aggMatch[2].trim().replace(/[`"\[\]]/g, ''),
                alias: aggMatch[3] || `${aggMatch[1].toLowerCase()}_val`
              });
            } else {
              const asMatch = item.match(/^([\s\S]+?)\s+AS\s+([a-zA-Z0-9_]+)$/i);
              if (asMatch) {
                const expr = asMatch[1].trim().replace(/[`"\[\]]/g, '');
                const alias = asMatch[2].trim();
                ast.selectCols.push(expr);
                ast.selectSpecs.push({ expr, outputName: alias });
              } else {
                const expr = item.trim().replace(/[`"\[\]]/g, '');
                const bare = expr.includes('.') ? expr.split('.')[1] : expr.replace(/^['"]|['"]$/g, '');
                ast.selectCols.push(expr);
                ast.selectSpecs.push({ expr, outputName: bare });
              }
            }
          }
        });
      } else if (line.startsWith('|> ORDER BY')) {
        const orderText = line.replace(/^\|>\s*ORDER BY\s+/i, '').trim();
        const terms = this.splitCsvClause(orderText);
        terms.forEach(term => {
          const parts = term.trim().split(/\s+/);
          const sortSpec = {
            column: parts[0].replace(/[`"\[\],]/g, ''),
            dir: parts[1] ? parts[1].toUpperCase() : 'ASC'
          };
          ast.orderByList.push(sortSpec);
          if (!ast.orderBy) ast.orderBy = sortSpec;
        });
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
      selectSpecs: [],
      joins: [],
      whereCondition: null,
      groupBy: [],
      aggregates: [],
      orderBy: null,
      orderByList: [],
      limit: null
    };

    // Extract FROM table
    const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) ast.mainTable = fromMatch[1];

    // Extract JOINs
    const joinRegex = /(?:(INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN\s+([a-zA-Z0-9_]+)\s+ON\s+([\s\S]+?)(?=(?:\s+(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\b)|\s+WHERE\b|\s+GROUP\b|\s+ORDER\b|\s+LIMIT\b|;|$)/gi;
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
      const selectParts = this.splitCsvClause(selectMatch[1]);
      selectParts.forEach(part => {
        const roundMatch = part.match(/ROUND\s*\(\s*(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)\s*(?:,\s*(\d+))?\s*\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
        if (roundMatch) {
          ast.aggregates.push({
            func: roundMatch[1].toUpperCase(),
            column: roundMatch[2].trim().replace(/[`"\[\]]/g, ''),
            roundDecimals: roundMatch[3] ? parseInt(roundMatch[3], 10) : 0,
            alias: roundMatch[4] ? roundMatch[4].trim() : `${roundMatch[1].toLowerCase()}_val`
          });
        } else {
          const aggMatch = part.match(/(COUNT|SUM|AVG|MAX|MIN)\((.*?)\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
          if (aggMatch) {
            ast.aggregates.push({
              func: aggMatch[1].toUpperCase(),
              column: aggMatch[2].trim().replace(/[`"\[\]]/g, ''),
              alias: aggMatch[3] ? aggMatch[3].trim() : `${aggMatch[1].toLowerCase()}_val`
            });
          } else {
            const asMatch = part.match(/^([\s\S]+?)\s+AS\s+([a-zA-Z0-9_]+)$/i);
            if (asMatch) {
              const expr = asMatch[1].trim();
              const alias = asMatch[2].trim();
              ast.selectCols.push(expr);
              ast.selectSpecs.push({ expr, outputName: alias });
            } else {
              const expr = part.trim();
              const bare = expr.includes('.') ? expr.split('.')[1] : expr.replace(/^['"]|['"]$/g, '');
              ast.selectCols.push(expr);
              ast.selectSpecs.push({ expr, outputName: bare });
            }
          }
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

    // Extract ORDER BY (single or multi-column)
    const orderMatch = sql.match(/ORDER BY\s+([\s\S]+?)(?=\s+LIMIT|;|$)/i);
    if (orderMatch) {
      const terms = this.splitCsvClause(orderMatch[1].trim());
      terms.forEach(term => {
        const parts = term.trim().split(/\s+/);
        const sortSpec = {
          column: parts[0].replace(/,+$/, '').trim(),
          dir: parts[1] ? parts[1].toUpperCase() : 'ASC'
        };
        ast.orderByList.push(sortSpec);
        if (!ast.orderBy) ast.orderBy = sortSpec;
      });
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

    // Handle AND combinations
    if (/\s+AND\s+/i.test(condStr)) {
      return condStr.split(/\s+AND\s+/i).every(c => this.evalPredicate(c.trim(), tuple));
    }

    const resolveCol = (colName) => {
      if (tuple[colName] !== undefined) return tuple[colName];
      const suffixKey = Object.keys(tuple).find(k => k.endsWith(`.${colName}`));
      return suffixKey !== undefined ? tuple[suffixKey] : undefined;
    };

    // Handle '!=' and '<>' comparison before '='
    const neqMatch = condStr.match(/([a-zA-Z0-9._]+)\s*(!=|<>)\s*(.+)/);
    if (neqMatch) {
      const leftCol = neqMatch[1].trim();
      const rightValRaw = neqMatch[3].trim();
      const leftVal = resolveCol(leftCol);
      const rightValCol = resolveCol(rightValRaw);
      if (rightValCol !== undefined) {
        return leftVal != rightValCol;
      }
      const rightVal = rightValRaw.replace(/^['"]|['"]$/g, '');
      return leftVal != rightVal;
    }

    // Handle comparison operators (> < >= <=) before '='
    const opMatch = condStr.match(/([a-zA-Z0-9._]+)\s*(>=|<=|>|<)\s*([0-9.]+)/);
    if (opMatch) {
      const leftCol = opMatch[1].trim();
      const op = opMatch[2];
      const numVal = parseFloat(opMatch[3]);

      const rawLeft = resolveCol(leftCol);
      const leftVal = rawLeft !== undefined ? rawLeft : 0;
      if (op === '>') return Number(leftVal) > numVal;
      if (op === '<') return Number(leftVal) < numVal;
      if (op === '>=') return Number(leftVal) >= numVal;
      if (op === '<=') return Number(leftVal) <= numVal;
    }

    // Handle '=' comparison
    const eqMatch = condStr.match(/([a-zA-Z0-9._]+)\s*=\s*(.+)/);
    if (eqMatch) {
      const leftCol = eqMatch[1].trim();
      const rightValRaw = eqMatch[2].trim();

      const leftVal = resolveCol(leftCol);

      // If right side is a column reference in tuple
      const rightValCol = resolveCol(rightValRaw);
      if (rightValCol !== undefined) {
        return leftVal == rightValCol;
      }

      // If right side is a literal
      const rightVal = rightValRaw.replace(/^['"]|['"]$/g, '');
      return leftVal == rightVal;
    }

    // Handle LIKE operator
    const likeMatch = condStr.match(/([a-zA-Z0-9._]+)\s+LIKE\s+['"](.*?)['"]/i);
    if (likeMatch) {
      const leftCol = likeMatch[1].trim();
      const pattern = likeMatch[2];
      const rawLeft = resolveCol(leftCol);
      const leftVal = String(rawLeft !== undefined && rawLeft !== null ? rawLeft : '');
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
      const regex = new RegExp(`^${escaped}$`, 'i');
      return regex.test(leftVal);
    }

    return true;
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

window.CustomJsEngine = CustomJsEngine;
