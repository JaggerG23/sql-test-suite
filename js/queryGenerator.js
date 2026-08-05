/**
 * Randomized & Incremental Query Generator
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
   * Generates queries that evolve incrementally in small portions across consecutive variation steps.
   */
  generateIncrementalQuery(schema, tier = 'medium', allowNULL = true, variationIndex = 0) {
    if (!schema || !schema.tables || schema.tables.length === 0) {
      return 'SELECT 1;';
    }

    this.rng = new RandomGenerator(this.seed);

    const t1 = schema.tables[0];
    const t2 = schema.tables.length > 1 ? schema.tables[1] : schema.tables[0];
    const fkCol = t2.columns.find(c => c.fk && c.fk.table === t1.name) || { name: 'id' };

    // Select primary column & numerical attribute
    const groupCol = `${t1.name}.${t1.columns[0].name}`;
    const numCol = t2.columns.find(c => c.type === 'INTEGER' || c.type === 'FLOAT') || t2.columns[0];
    const whereColDef = t1.columns.find(c => c.type === 'INTEGER' || c.type === 'FLOAT') || t1.columns[0];
    const whereColName = `${t1.name}.${whereColDef.name}`;

    // Sample value for filter
    const sampleRow = t1.rows.length > 0 ? t1.rows[0] : {};
    const baseVal = Number(sampleRow[whereColDef.name]) || 10;

    // Small incremental mutations based on variationIndex (0 to 5)
    let op = '>';
    let valThreshold = baseVal;
    let orderDir = 'DESC';
    let aggFunc = 'COUNT';
    let limitVal = 15;

    switch (variationIndex % 6) {
      case 0:
        // Base Query
        op = '>';
        valThreshold = baseVal;
        orderDir = 'DESC';
        aggFunc = 'COUNT';
        limitVal = 15;
        break;
      case 1:
        // Small Tweak 1: Change comparison operator (e.g. > to >=)
        op = '>=';
        valThreshold = baseVal;
        orderDir = 'DESC';
        aggFunc = 'COUNT';
        limitVal = 15;
        break;
      case 2:
        // Small Tweak 2: Change numeric threshold value (+ 5)
        op = '>=';
        valThreshold = baseVal + 5;
        orderDir = 'DESC';
        aggFunc = 'COUNT';
        limitVal = 15;
        break;
      case 3:
        // Small Tweak 3: Invert sort direction (DESC to ASC)
        op = '>=';
        valThreshold = baseVal + 5;
        orderDir = 'ASC';
        aggFunc = 'COUNT';
        limitVal = 15;
        break;
      case 4:
        // Small Tweak 4: Change aggregate function (COUNT to SUM / AVG)
        op = '>=';
        valThreshold = baseVal + 5;
        orderDir = 'ASC';
        aggFunc = 'SUM';
        limitVal = 15;
        break;
      case 5:
        // Small Tweak 5: Change row limit (15 to 10)
        op = '>=';
        valThreshold = baseVal + 5;
        orderDir = 'ASC';
        aggFunc = 'SUM';
        limitVal = 10;
        break;
    }

    if (t1.name === t2.name) {
      return `SELECT ${groupCol}, ${aggFunc}(${numCol.name}) AS agg_val\nFROM ${t1.name}\nWHERE ${whereColName} ${op} ${valThreshold}\nGROUP BY ${groupCol}\nORDER BY agg_val ${orderDir}\nLIMIT ${limitVal};`;
    }

    return `SELECT ${groupCol}, ${aggFunc}(${t2.name}.${numCol.name}) AS agg_val\nFROM ${t1.name}\nJOIN ${t2.name} ON ${t1.name}.id = ${t2.name}.${fkCol.name}\nWHERE ${whereColName} ${op} ${valThreshold}\nGROUP BY ${groupCol}\nORDER BY agg_val ${orderDir}\nLIMIT ${limitVal};`;
  }
}

window.QueryGenerator = QueryGenerator;
