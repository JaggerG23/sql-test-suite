/**
 * Seedable PRNG (Mulberry32)
 */
class RandomGenerator {
  constructor(seed = 42) {
    this.seed = seed;
  }

  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(array) {
    return array[this.nextInt(0, array.length - 1)];
  }
}

/**
 * Schema & Mock Data Generator
 */
class SchemaGenerator {
  constructor(seed = 42) {
    this.rng = new RandomGenerator(seed);
    this.tablePool = ['users', 'products', 'orders', 'categories', 'reviews', 'payments', 'inventory', 'stores'];
    this.firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Evan', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia'];
    this.lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
    this.productNames = ['Laptop', 'Smartphone', 'Headphones', 'Smartwatch', 'Tablet', 'Camera', 'Monitor', 'Keyboard', 'Mouse', 'Speaker'];
    this.statusList = ['PENDING', 'COMPLETED', 'SHIPPED', 'CANCELLED', 'REFUNDED'];
    this.categoryNames = ['Electronics', 'Home & Kitchen', 'Books', 'Clothing', 'Sports', 'Toys', 'Automotive', 'Beauty'];
  }

  generateSchema(numTables = 5, colsPerTable = 4, rowsPerTable = 50, useFK = true) {
    const selectedTables = this.tablePool.slice(0, numTables);
    const schema = {
      tables: [],
      ddl: '',
      inserts: []
    };

    let ddlStatements = [];

    selectedTables.forEach((tableName, index) => {
      const columns = [
        { name: 'id', type: 'INTEGER', pk: true, fk: null }
      ];

      // Add foreign key if not first table and FK is enabled
      if (useFK && index > 0) {
        const parentTable = selectedTables[this.rng.nextInt(0, index - 1)];
        columns.push({
          name: `${parentTable.replace(/s$/, '')}_id`,
          type: 'INTEGER',
          pk: false,
          fk: { table: parentTable, column: 'id' }
        });
      }

      // Fill columns: include all standard domain attributes from pool
      const existingNames = new Set(columns.map(c => c.name));

      // Guarantee standard relational columns for products, orders, and reviews
      if (tableName === 'products' && !existingNames.has('category_id')) {
        existingNames.add('category_id');
        columns.push({ name: 'category_id', type: 'INTEGER', pk: false, fk: { table: 'categories', column: 'id' } });
      }
      if (tableName === 'orders' && !existingNames.has('user_id')) {
        existingNames.add('user_id');
        columns.push({ name: 'user_id', type: 'INTEGER', pk: false, fk: { table: 'users', column: 'id' } });
      }
      if (tableName === 'reviews' && !existingNames.has('order_id')) {
        existingNames.add('order_id');
        columns.push({ name: 'order_id', type: 'INTEGER', pk: false, fk: { table: 'orders', column: 'id' } });
      }

      const colPool = this.getColumnPoolForTable(tableName);
      colPool.forEach(col => {
        if (!existingNames.has(col.name)) {
          existingNames.add(col.name);
          columns.push({ ...col, pk: false, fk: null });
        }
      });

      // Generate Table Data
      const rows = [];
      for (let r = 1; r <= rowsPerTable; r++) {
        const row = {};
        columns.forEach(col => {
          if (col.pk) {
            row[col.name] = r;
          } else if (col.fk) {
            row[col.name] = col.name === 'order_id' ? this.rng.nextInt(1, 8) : this.rng.nextInt(1, rowsPerTable);
          } else {
            row[col.name] = this.generateSampleValue(col.name, col.type);
          }
        });
        rows.push(row);
      }

      const tableObj = { name: tableName, columns, rows };
      schema.tables.push(tableObj);

      // Generate DDL SQL
      let ddl = `CREATE TABLE ${tableName} (\n`;
      const colDefs = columns.map(c => {
        let def = `  ${c.name} ${c.type}`;
        if (c.pk) def += ' PRIMARY KEY';
        return def;
      });
      if (useFK) {
        columns.filter(c => c.fk).forEach(c => {
          colDefs.push(`  FOREIGN KEY (${c.name}) REFERENCES ${c.fk.table}(${c.fk.column})`);
        });
      }
      ddl += colDefs.join(',\n') + '\n);';
      ddlStatements.push(ddl);
    });

    schema.ddl = ddlStatements.join('\n\n');
    return schema;
  }

  getColumnPoolForTable(tableName) {
    switch (tableName) {
      case 'users':
        return [
          { name: 'name', type: 'VARCHAR' },
          { name: 'age', type: 'INTEGER' },
          { name: 'rating', type: 'FLOAT' },
          { name: 'is_active', type: 'INTEGER' }
        ];
      case 'products':
        return [
          { name: 'title', type: 'VARCHAR' },
          { name: 'price', type: 'FLOAT' },
          { name: 'stock', type: 'INTEGER' },
          { name: 'rating', type: 'FLOAT' }
        ];
      case 'orders':
        return [
          { name: 'amount', type: 'FLOAT' },
          { name: 'status', type: 'VARCHAR' },
          { name: 'quantity', type: 'INTEGER' }
        ];
      case 'categories':
        return [
          { name: 'name', type: 'VARCHAR' },
          { name: 'priority', type: 'INTEGER' }
        ];
      case 'reviews':
        return [
          { name: 'score', type: 'INTEGER' },
          { name: 'rating', type: 'FLOAT' },
          { name: 'status', type: 'VARCHAR' },
          { name: 'title', type: 'VARCHAR' }
        ];
      default:
        return [
          { name: 'title', type: 'VARCHAR' },
          { name: 'amount', type: 'FLOAT' },
          { name: 'score', type: 'INTEGER' },
          { name: 'status', type: 'VARCHAR' }
        ];
    }
  }

  generateSampleValue(colName, colType) {
    if (colType === 'INTEGER') {
      if (colName === 'category_id') return this.rng.nextInt(1, 4);
      if (colName === 'user_id') return this.rng.nextInt(1, 10);
      if (colName === 'order_id') return this.rng.nextInt(1, 8);
      if (colName === 'priority') return this.rng.nextInt(1, 5);
      if (colName.includes('score')) return this.rng.nextInt(1, 5);
      if (colName.includes('age')) return this.rng.nextInt(18, 75);
      if (colName.includes('stock') || colName.includes('quantity')) return this.rng.nextInt(1, 100);
      if (colName.includes('active')) return this.rng.nextInt(0, 1);
      return this.rng.nextInt(1, 500);
    }
    if (colType === 'FLOAT') {
      if (colName.includes('rating') || colName.includes('score')) return parseFloat((this.rng.next() * 4 + 1).toFixed(2));
      return parseFloat((this.rng.next() * 200 + 5).toFixed(2));
    }
    if (colType === 'VARCHAR') {
      if (colName.includes('name')) return `${this.rng.pick(this.firstNames)} ${this.rng.pick(this.lastNames)}`;
      if (colName.includes('title')) return `${this.rng.pick(this.productNames)}`;
      if (colName.includes('status')) return this.rng.pick(this.statusList);
      return this.rng.pick(this.categoryNames);
    }
    return 'Sample';
  }
}

window.RandomGenerator = RandomGenerator;
window.SchemaGenerator = SchemaGenerator;
