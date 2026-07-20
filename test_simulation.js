const test = require("node:test");
const assert = require("node:assert/strict");
const sim = require("./simulation.js");
let formulaModule = null;
try {
  formulaModule = require("./formula-explanations.js");
} catch (_) {
  formulaModule = null;
}

test("fixed alpha update matches the closed form", () => {
  let q = 20;
  for (let i = 0; i < 10; i += 1) q = sim.qUpdate(q, 10, 0.1);
  const closed = 0.9 ** 10 * 20 + (1 - 0.9 ** 10) * 10;
  assert.ok(Math.abs(q - closed) < 1e-10);
});

test("summarizeSamples reports sample uncertainty", () => {
  const summary = sim.summarizeSamples([10, 12, 14, 16]);
  const expectedSd = Math.sqrt(20 / 3);

  assert.equal(summary.n, 4);
  assert.equal(summary.mean, 13);
  assert.ok(Math.abs(summary.standardDeviation - expectedSd) < 1e-12);
  assert.ok(Math.abs(summary.standardError - expectedSd / 2) < 1e-12);
  assert.ok(Math.abs(summary.ci95 - 1.96 * expectedSd / 2) < 1e-12);
});

test("seeded evaluations produce identical scientific metrics", () => {
  const config = {
    ...sim.DEFAULTS,
    trainEpisodes: 12,
    evalEpisodes: 4,
    steps: 45,
  };

  const first = sim.evaluateAllAlgorithms(config, 2026);
  const second = sim.evaluateAllAlgorithms(config, 2026);

  assert.deepEqual(first.results, second.results);
  for (const result of Object.values(first.results)) {
    assert.equal(result.episodeMeasurements.length, config.evalEpisodes);
    assert.deepEqual(Object.keys(result.statistics).sort(), [
      "averageWait",
      "energyProxy",
      "longWaitRate",
    ]);
    assert.equal("runtimeMs" in result, false);
  }
});

test("scene score equals the sum of named contributions", () => {
  const config = { ...sim.DEFAULTS, trainEpisodes: 12, evalEpisodes: 4, steps: 45 };
  const { results } = sim.evaluateAllAlgorithms(config, 2026);
  for (const row of sim.sceneScoreRows(results)) {
    const total = Object.values(row.contributions).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - row.sceneScore) < 1e-9);
  }
});

test("scenario profiles use the approved short names", () => {
  assert.deepEqual(Object.values(sim.SCENARIO_PROFILES).map(profile => profile.name), [
    "上行高峰",
    "下行高峰",
    "短途随机",
    "热点楼层",
    "三段通勤",
    "住宅双峰",
  ]);
});

test("all scenario presets come from the shared derivation function", () => {
  for (const key of Object.keys(sim.SCENARIO_PROFILES)) {
    const derived = sim.deriveScenarioPreset(key, 2026);
    for (const field of sim.PARAMETER_FIELDS) {
      assert.equal(derived.values[field], sim.SCENARIO_QAWED_PRESETS[key][field]);
    }
    assert.ok(derived.values.evalEpisodes > 30);
    assert.equal(derived.trace.length, sim.PARAMETER_FIELDS.length);
    assert.ok(derived.trace.every(item => item.formula && item.substitution && Number.isFinite(item.finalValue)));
  }
});

test("algorithm demo timeline is continuous and lasts sixteen seconds", () => {
  const demo = sim.buildAlgorithmDemo("FCFS");
  assert.equal(demo.duration, 16);
  assert.ok(demo.requests.some(request => request.appearAt > 3 && request.appearAt < 10));
  assert.ok(demo.frames.length >= 160);
  for (let i = 1; i < demo.frames.length; i += 1) {
    for (let car = 0; car < demo.frames[i].cars.length; car += 1) {
      const delta = Math.abs(demo.frames[i].cars[car].floor - demo.frames[i - 1].cars[car].floor);
      assert.ok(delta <= 0.201, `car ${car} jumped ${delta} floors at frame ${i}`);
    }
  }
});

test("comparison timelines share the exact same request stream", () => {
  const pair = sim.buildComparisonDemo("FCFS", "Nearest Car");
  assert.equal(pair.duration, 16);
  assert.deepEqual(pair.left.requests, pair.right.requests);
  assert.equal(pair.left.frames.length, pair.right.frames.length);
});

test("Q-AWED training records monotonic empirical state-action coverage", () => {
  const config = sim.withRewardWeights({
    ...sim.DEFAULTS,
    trainEpisodes: 12,
    steps: 45,
    scenarioKind: "office",
    epsilonDecay: 0.985,
    doorTime: 1,
  });
  const agent = sim.trainQAwed(config, 2026);

  assert.equal(agent.coverageHistory.length, 12);
  assert.ok(agent.coverageHistory.every(row => row.total === 54 * 6));
  assert.ok(agent.coverageHistory.every(row => row.coverage >= 0 && row.coverage <= 1));
  for (let index = 1; index < agent.coverageHistory.length; index += 1) {
    assert.ok(agent.coverageHistory[index].coverage >= agent.coverageHistory[index - 1].coverage);
  }
});

test("coverage tracking is deterministic for a fixed seed", () => {
  const config = sim.withRewardWeights({
    ...sim.DEFAULTS,
    trainEpisodes: 8,
    steps: 45,
    scenarioKind: "office",
    epsilonDecay: 0.985,
    doorTime: 1,
  });
  const left = sim.trainQAwed(config, 2026);
  const right = sim.trainQAwed(config, 2026);

  assert.deepEqual(left.coverageHistory, right.coverageHistory);
  assert.deepEqual([...left.qTable.entries()], [...right.qTable.entries()]);
});

test("all academic formulas provide complete beginner explanations", () => {
  assert.ok(formulaModule, "formula-explanations.js should exist and load");
  const required = [
    "id", "title", "category", "purpose", "formalFormula", "plainFormula",
    "derivationSteps", "variables", "subFormulas", "dimensionCheck",
    "dataPipeline", "workedExample", "functionProperties", "rangeReasoning",
    "lowNormalHigh", "assumptions", "evidenceLevel",
  ];
  const expectedIds = [
    "floors", "elevators", "steps", "trainEpisodes", "evalEpisodes", "seed",
    "longWaitThreshold", "learningRate", "discount", "epsilonStart",
    "waitPenalty", "energyPenalty", "longWaitPenalty", "wait-normalization",
    "scene-score", "composite-score",
  ];
  assert.deepEqual(formulaModule.FORMULA_EXPLANATIONS.map(item => item.id), expectedIds);
  for (const record of formulaModule.FORMULA_EXPLANATIONS) {
    for (const field of required) {
      const value = record[field];
      assert.ok(Array.isArray(value) ? value.length : String(value).trim(), `${record.id}.${field} is empty`);
    }
    assert.ok(record.derivationSteps.length >= 3, `${record.id} needs step-by-step derivation`);
    assert.ok(record.variables.length >= 2, `${record.id} needs complete variable sources`);
  }
});

test("load formula keeps work-demand and work-capacity units consistent", () => {
  assert.ok(formulaModule, "formula-explanations.js should exist and load");
  const load = formulaModule.getFormulaExplanation("floors");
  const joined = JSON.stringify(load);
  assert.match(joined, /等效楼层\/请求/);
  assert.match(joined, /等效楼层\/台\/分钟/);
  assert.match(joined, /不能混用|不可混用/);
  for (const token of ["E[d*(F)]", "mu_F", "40", "48", "0.833", "rho < 1", "rho ≈ 1", "rho > 1"]) {
    assert.ok(joined.includes(token), `load explanation is missing ${token}`);
  }
});

test("reward explanations match the raw metrics used by the simulation", () => {
  const training = formulaModule.getFormulaExplanation("trainEpisodes");
  const waiting = formulaModule.getFormulaExplanation("waitPenalty");
  const energy = formulaModule.getFormulaExplanation("energyPenalty");
  const longWait = formulaModule.getFormulaExplanation("longWaitPenalty");

  assert.match(JSON.stringify(training), /324/);
  assert.match(waiting.formalFormula, /W_bar/);
  assert.doesNotMatch(JSON.stringify(waiting), /W_norm|标准化等待/);
  assert.match(energy.formalFormula, /E_bar/);
  assert.doesNotMatch(JSON.stringify(energy), /E_norm|标准化能耗/);
  assert.match(longWait.formalFormula, /lambda_l\*L/);
  assert.match(JSON.stringify(longWait), /acc\.longWait\/acc\.requests|长等待比例/);
});
