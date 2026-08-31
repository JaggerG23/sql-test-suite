/**
 * Engine 1: SQLite WebAssembly Engine (sql.js)
 */
class SQLiteEngine {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      if (typeof window.initSqlJs === 'function') {
        const initPromise = window.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SQLite WASM init timed out')), 2500)
        );
        this.SQL = await Promise.race([initPromise, timeoutPromise]);
        this.initialized = true;
      } else {
        console.warn('sql.js library not loaded');
      }
    } catch (err) {
      console.warn('SQLite WASM initialization fallback:', err);
    }
  }

  async loadSchemaAndData(schema) {
    try {
      await this.init();
    } catch (e) {
      console.warn('SQLite WASM init deferred:', e);
    }
    if (!this.SQL) {
      console.warn('SQLite WASM engine unavailable. Falling back to Custom JS engine.');
      return;
    }

    if (this.db) {
      this.db.close();
    }
    this.db = new this.SQL.Database();

    // Run DDL
    this.db.run(schema.ddl);

    // Bulk Insert Rows
    schema.tables.forEach(table => {
      if (table.rows.length === 0) return;
      const colNames = table.columns.map(c => c.name).join(', ');
      const placeholders = table.columns.map(() => '?').join(', ');
      const stmt = this.db.prepare(`INSERT INTO ${table.name} (${colNames}) VALUES (${placeholders});`);

      table.rows.forEach(row => {
        const values = table.columns.map(c => row[c.name]);
        stmt.run(values);
      });
      stmt.free();
    });
  }

  executeQuery(sqlQuery) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized', rows: [], columns: [], executionTimeMs: 0 };
    }

    const startTime = performance.now();
    try {
      const results = this.db.exec(sqlQuery);
      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(3));

      if (results.length === 0) {
        return {
          success: true,
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs,
          plan: this.getExecutionPlan(sqlQuery)
        };
      }

      const columns = results[0].columns;
      const rows = results[0].values;

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs,
        plan: this.getExecutionPlan(sqlQuery)
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: parseFloat((performance.now() - startTime).toFixed(3)),
        plan: 'Query Execution Error'
      };
    }
  }

  getExecutionPlan(sqlQuery) {
    try {
      // Clean query (remove trailing semicolon for EXPLAIN)
      const cleanSql = sqlQuery.trim().replace(/;$/, '');
      const planRes = this.db.exec(`EXPLAIN QUERY PLAN ${cleanSql};`);
      if (planRes.length > 0) {
        return planRes[0].values.map(r => `[id:${r[0]} parent:${r[1]}] ${r[3]}`).join('\n');
      }
      return 'No plan generated';
    } catch (err) {
      return `Explain plan error: ${err.message}`;
    }
  }
}

window.SQLiteEngine = SQLiteEngine;
