/**
 * Randomized Query Generator
 */
class QueryGenerator {
  constructor(seed = 42) {
    this.rng = new RandomGenerator(seed);
  }

  generateQuery(schema, tier = 'medium', allowNULL = true) {
    if (!schema || !schema.tables || schema.tables.length === 0) {
      return 'SELECT 1;';
    }

    this.rng.seed += 13; // bump seed for query variation

    switch (tier) {
      case 'simple':
        return this.generateSimpleQuery(schema, allowNULL);
      case 'complex':
        return this.generateComplexQuery(schema, allowNULL);
      case 'medium':
      default:
        return this.generateMediumQuery(schema, allowNULL);
    }
  }

  generateSimpleQuery(schema, allowNULL) {
    const table = this.rng.pick(schema.tables);
    const colsToSelect = this.pickColumns(table.columns, 2, 4);
    const selectStr = colsToSelect.map(c => `${table.name}.${c.name}`).join(', ');

    const whereCol = this.rng.pick(table.columns);
    const whereCond = this.generateWhereCondition(`${table.name}.${whereCol.name}`, whereCol, table, allowNULL);

    const orderCol = this.rng.pick(table.columns);
    const orderDir = this.rng.pick(['ASC', 'DESC']);
    const limit = this.rng.nextInt(5, 25);

    return `SELECT ${selectStr}\nFROM ${table.name}\nWHERE ${whereCond}\nORDER BY ${table.name}.${orderCol.name} ${orderDir}\nLIMIT ${limit};`;
  }

  generateMediumQuery(schema, allowNULL) {
    if (schema.tables.length < 2) {
      return this.generateSimpleQuery(schema, allowNULL);
    }

    const t1 = schema.tables[0];
    const t2 = schema.tables[1];
    const fkCol = t2.columns.find(c => c.fk && c.fk.table === t1.name) || { name: 'id' };

    const joinClause = `FROM ${t1.name}\nJOIN ${t2.name} ON ${t1.name}.id = ${t2.name}.${fkCol.name}`;

    const numAgg = this.rng.next() > 0.5;
    if (numAgg) {
      // Aggregated query with GROUP BY
      const groupCol1 = `${t1.name}.${t1.columns[0].name}`;
      const numCol = t2.columns.find(c => c.type === 'INTEGER' || c.type === 'FLOAT') || t2.columns[0];
      const aggFunc = this.rng.pick(['COUNT', 'SUM', 'AVG', 'MAX']);
      
      const whereCol = this.rng.pick(t1.columns);
      const whereCond = this.generateWhereCondition(`${t1.name}.${whereCol.name}`, whereCol, t1, allowNULL);

      return `SELECT ${groupCol1}, ${aggFunc}(${t2.name}.${numCol.name}) AS agg_val\n${joinClause}\nWHERE ${whereCond}\nGROUP BY ${groupCol1}\nORDER BY agg_val DESC\nLIMIT 15;`;
    } else {
      // Standard 2-table JOIN
      const c1 = this.pickColumns(t1.columns, 1, 2).map(c => `${t1.name}.${c.name}`);
      const c2 = this.pickColumns(t2.columns, 1, 2).map(c => `${t2.name}.${c.name}`);
      const selectStr = [...c1, ...c2].join(', ');

      const whereCol = this.rng.pick(t2.columns);
      const whereCond = this.generateWhereCondition(`${t2.name}.${whereCol.name}`, whereCol, t2, allowNULL);
      const orderCol = `${t1.name}.${t1.columns[0].name}`;

      return `SELECT ${selectStr}\n${joinClause}\nWHERE ${whereCond}\nORDER BY ${orderCol} ASC\nLIMIT 20;`;
    }
  }

  generateComplexQuery(schema, allowNULL) {
    if (schema.tables.length < 2) {
      return this.generateMediumQuery(schema, allowNULL);
    }

    const t1 = schema.tables[0];
    const t2 = schema.tables[1];
    const t3 = schema.tables.length >= 3 ? schema.tables[2] : null;

    const fkCol2 = t2.columns.find(c => c.fk && c.fk.table === t1.name) || { name: 'id' };

    let joinStr = `FROM ${t1.name}\nINNER JOIN ${t2.name} ON ${t1.name}.id = ${t2.name}.${fkCol2.name}`;
    if (t3) {
      const fkCol3 = t3.columns.find(c => c.fk && c.fk.table === t2.name) || t3.columns[0];
      joinStr += `\nLEFT JOIN ${t3.name} ON ${t2.name}.id = ${t3.name}.${fkCol3.name}`;
    }

    const groupCol = `${t1.name}.${t1.columns[0].name}`;
    const numCol = t2.columns.find(c => c.type === 'INTEGER' || c.type === 'FLOAT') || t2.columns[0];

    const whereCol = this.rng.pick(t1.columns);
    const whereCond = this.generateWhereCondition(`${t1.name}.${whereCol.name}`, whereCol, t1, allowNULL);

    return `SELECT ${groupCol}, COUNT(${t2.name}.id) AS total_count, AVG(${t2.name}.${numCol.name}) AS avg_val\n${joinStr}\nWHERE ${whereCond}\nGROUP BY ${groupCol}\nHAVING total_count > 0\nORDER BY total_count DESC\nLIMIT 15;`;
  }

  generateWhereCondition(colFullName, colDef, table, allowNULL) {
    const op = this.rng.pick(['=', '>', '<', '>=', '<=']);

    if (colDef.type === 'INTEGER' || colDef.type === 'FLOAT') {
      const sampleVal = this.rng.pick(table.rows)[colDef.name];
      const val = sampleVal !== undefined ? sampleVal : 10;
      return `${colFullName} ${op} ${val}`;
    } else {
      const sampleVal = this.rng.pick(table.rows)[colDef.name];
      const val = sampleVal ? `'${sampleVal}'` : "'Sample'";
      return `${colFullName} = ${val}`;
    }
  }

  pickColumns(columns, min, max) {
    const count = Math.min(columns.length, this.rng.nextInt(min, max));
    const shuffled = [...columns].sort(() => this.rng.next() - 0.5);
    return shuffled.slice(0, count);
  }
}

window.QueryGenerator = QueryGenerator;
