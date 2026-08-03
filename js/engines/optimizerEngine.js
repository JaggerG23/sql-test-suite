/**
 * Engine 3: Query Optimizer & Strategy Engine
 */
class OptimizerEngine {
  constructor() {
    this.schema = null;
    this.customEngine = new CustomJsEngine();
  }

  loadSchemaAndData(schema) {
    this.schema = schema;
    this.customEngine.loadSchemaAndData(schema);
  }

  executeQuery(sqlQuery) {
    const startTime = performance.now();

    // Delegate actual result computation to underlying engine so output matches
    const baseResult = this.customEngine.executeQuery(sqlQuery);

    // Compute Optimization Plan & Cost Metrics
    const costAnalysis = this.analyzeOptimizationPlan(sqlQuery);

    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(3));

    return {
      success: baseResult.success,
      columns: baseResult.columns,
      rows: baseResult.rows,
      rowCount: baseResult.rowCount,
      executionTimeMs,
      error: baseResult.error,
      costAnalysis
    };
  }

  analyzeOptimizationPlan(sqlQuery) {
    if (!this.schema) return { costScore: 0, planDetails: [] };

    const parsed = this.customEngine.parseQuery(sqlQuery);
    const mainTable = this.schema.tables.find(t => t.name === parsed.mainTable);
    const mainRows = mainTable ? mainTable.rows.length : 50;

    let ioCost = 0;
    let cpuCost = 0;
    const planSteps = [];

    // Step 1: Scan Cost
    let hasPrimaryIndexScan = parsed.whereCondition && parsed.whereCondition.includes('.id');
    let scanStrategy = hasPrimaryIndexScan ? 'INDEX SEEK (B+ Tree)' : 'FULL TABLE SCAN';
    let scanIo = hasPrimaryIndexScan ? Math.ceil(Math.log2(mainRows)) : mainRows;
    ioCost += scanIo;
    cpuCost += mainRows;

    planSteps.push({
      phase: '1. Access Method',
      target: parsed.mainTable,
      strategy: scanStrategy,
      ioCost: scanIo,
      cpuCost: mainRows,
      desc: hasPrimaryIndexScan ? `Using B-Tree Primary Key index on ${parsed.mainTable}` : `Reading all ${mainRows} data pages sequentially`
    });

    // Step 2: Predicate Pushdown Analysis
    if (parsed.whereCondition) {
      planSteps.push({
        phase: '2. Predicate Pushdown',
        target: parsed.whereCondition,
        strategy: 'EARLY FILTERING (SARGable)',
        ioCost: 0,
        cpuCost: Math.ceil(mainRows * 0.5),
        desc: 'Applied filter immediately after scan to reduce join tuple volume'
      });
      cpuCost += Math.ceil(mainRows * 0.5);
    }

    // Step 3: Join Strategy Selection
    parsed.joins.forEach(join => {
      const rightTable = this.schema.tables.find(t => t.name === join.table);
      const rightRows = rightTable ? rightTable.rows.length : 50;

      // Hash Join vs Nested Loop Decision
      let joinStrategy = 'HASH JOIN (In-Memory)';
      let joinCostIO = Math.ceil(mainRows / 10) + Math.ceil(rightRows / 10);
      let joinCostCPU = mainRows + rightRows;

      if (mainRows * rightRows > 5000) {
        joinStrategy = 'HASH JOIN (Build Hash Table on Right, Probe Left)';
      } else {
        joinStrategy = 'NESTED LOOP JOIN (Indexed Probe)';
      }

      ioCost += joinCostIO;
      cpuCost += joinCostCPU;

      planSteps.push({
        phase: '3. Join Execution',
        target: `${parsed.mainTable} ⋈ ${join.table}`,
        strategy: joinStrategy,
        ioCost: joinCostIO,
        cpuCost: joinCostCPU,
        desc: `Estimated join output cardinality: ~${Math.min(mainRows, rightRows)} tuples`
      });
    });

    // Step 4: Grouping Strategy
    if (parsed.groupBy.length > 0) {
      const groupIo = 0;
      const groupCpu = Math.ceil(mainRows * 1.2);
      ioCost += groupIo;
      cpuCost += groupCpu;

      planSteps.push({
        phase: '4. Grouping & Aggregation',
        target: parsed.groupBy.join(', '),
        strategy: 'HASH AGGREGATION (Single-pass)',
        ioCost: groupIo,
        cpuCost: groupCpu,
        desc: 'Built in-memory hash table for grouping key accumulators'
      });
    }

    const totalCostUnits = ioCost * 1.5 + cpuCost * 0.1;

    return {
      totalCostScore: parseFloat(totalCostUnits.toFixed(1)),
      ioCostPages: ioCost,
      cpuOperations: cpuCost,
      planSteps
    };
  }
}

window.OptimizerEngine = OptimizerEngine;
