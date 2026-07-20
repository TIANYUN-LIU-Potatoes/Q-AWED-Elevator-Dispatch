"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const charts = require("./parameter-charts.js");

test("learning-rate target share follows 1-(1-alpha)^n", () => {
  assert.equal(charts.targetShare(0.20, 0), 0);
  assert.ok(Math.abs(charts.targetShare(0.20, 10) - 0.8926258176) < 1e-9);
  assert.ok(charts.targetShare(0.24, 10) > charts.targetShare(0.12, 10));
});

test("discount curve follows gamma^k", () => {
  assert.equal(charts.futureRewardWeight(0.88, 0), 1);
  assert.ok(Math.abs(charts.futureRewardWeight(0.88, 10) - 0.88 ** 10) < 1e-12);
  assert.ok(charts.futureRewardWeight(0.94, 20) > charts.futureRewardWeight(0.82, 20));
});

test("exploration and penalty curves use program formulas", () => {
  assert.ok(Math.abs(charts.explorationProbability(0.35, 100) - 0.35 * 0.985 ** 100) < 1e-12);
  assert.equal(charts.linearPenalty(1.35, 20), 27);
  assert.equal(charts.linearPenalty(0.45, 10), 4.5);
  assert.equal(charts.linearPenalty(5, 0.25), 1.25);
});

test("exactly seven parameters receive specialized chart models", () => {
  assert.deepEqual(charts.SPECIAL_PARAMETER_KEYS, [
    "trainEpisodes",
    "learningRate",
    "discount",
    "epsilonStart",
    "waitPenalty",
    "energyPenalty",
    "longWaitPenalty"
  ]);
  for (const key of charts.SPECIAL_PARAMETER_KEYS) {
    const model = charts.buildParameterChartModel(key, charts.DEFAULT_CURRENT_VALUES[key], []);
    assert.ok(["single", "dual"].includes(model.layout));
    assert.ok(model.formula.length > 5);
    assert.ok(model.xLabel.length > 2);
    assert.ok(model.yLabel.length > 2);
  }
});

test("boundary models expose current, recommended, and outside-range series", () => {
  const model = charts.buildParameterChartModel("learningRate", 0.18, []);
  assert.equal(model.layout, "dual");
  assert.deepEqual(model.lower.series.map(series => series.role), ["outside", "boundary", "current"]);
  assert.deepEqual(model.upper.series.map(series => series.role), ["current", "boundary", "outside"]);
  assert.match(model.lower.explanation, /0\.12/);
  assert.match(model.upper.explanation, /0\.24/);
});

test("reward chart labels preserve raw simulation units", () => {
  const wait = charts.buildParameterChartModel("waitPenalty", 1.35, []);
  const energy = charts.buildParameterChartModel("energyPenalty", 0.45, []);
  const longWait = charts.buildParameterChartModel("longWaitPenalty", 5, []);
  assert.match(wait.xLabel, /时间步/);
  assert.match(energy.xLabel, /楼层\/请求/);
  assert.match(longWait.xLabel, /0-100%/);
  assert.doesNotMatch(wait.xLabel, /标准化/);
});

test("generated chart points stay finite and within expected probability bounds", () => {
  for (const key of ["learningRate", "discount", "epsilonStart"]) {
    const model = charts.buildParameterChartModel(key, charts.DEFAULT_CURRENT_VALUES[key], []);
    for (const panel of [model.lower, model.upper]) {
      for (const curve of panel.series) {
        assert.ok(curve.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
        assert.ok(curve.points.every(point => point.y >= 0 && point.y <= 1));
      }
    }
  }
});
