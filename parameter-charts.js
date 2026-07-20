(function parameterChartsModule(root) {
  "use strict";

  const SPECIAL_PARAMETER_KEYS = [
    "trainEpisodes",
    "learningRate",
    "discount",
    "epsilonStart",
    "waitPenalty",
    "energyPenalty",
    "longWaitPenalty"
  ];

  const DEFAULT_CURRENT_VALUES = {
    trainEpisodes: 180,
    learningRate: 0.18,
    discount: 0.88,
    epsilonStart: 0.35,
    waitPenalty: 1.35,
    energyPenalty: 0.45,
    longWaitPenalty: 5
  };

  const targetShare = (alpha, updates) => 1 - (1 - alpha) ** updates;
  const futureRewardWeight = (gamma, futureStep) => gamma ** futureStep;
  const explorationProbability = (epsilonStart, episode, decay = 0.985) => epsilonStart * decay ** episode;
  const linearPenalty = (weight, metric) => weight * metric;

  function makeSeries(label, role, maxX, curve, points = 61) {
    return {
      label,
      role,
      points: Array.from({ length: points }, (_, index) => {
        const x = maxX * index / (points - 1);
        return { x, y: curve(x) };
      })
    };
  }

  function makePanel(entries, maxX, curve, explanation) {
    return {
      maxX,
      explanation,
      series: entries.map(entry => makeSeries(entry.label, entry.role, maxX, x => curve(entry.value, x)))
    };
  }

  function learningRateModel(value) {
    const curve = (alpha, updates) => targetShare(alpha, updates);
    const currentLabel = `当前 ${value.toFixed(2)}`;
    return {
      layout: "dual",
      formula: "Qnew = (1-α)Qold + αTarget；TargetShare(n) = 1-(1-α)^n",
      xLabel: "同类状态更新次数 n（次）",
      yLabel: "新目标累计占比（%）",
      lower: makePanel([
        { label: "越界 0.05", role: "outside", value: 0.05 },
        { label: "下限 0.12", role: "boundary", value: 0.12 },
        { label: currentLabel, role: "current", value }
      ], 20, curve, "0.12 使旧经验约 5.4 次更新减半；低于 0.12 时旧经验衰减过慢，交通变化后 Q 值容易滞后。"),
      upper: makePanel([
        { label: currentLabel, role: "current", value },
        { label: "上限 0.24", role: "boundary", value: 0.24 },
        { label: "越界 0.40", role: "outside", value: 0.40 }
      ], 20, curve, "0.24 已能在 10 次更新内吸收约 93.6% 的新目标；继续提高会放大单次随机奖励并使 Q 值震荡。"),
      summary: [
        { label: "旧经验半衰期", value: `${(Math.log(0.5) / Math.log(1 - value)).toFixed(1)} 次` },
        { label: "10 次后新目标", value: `${(targetShare(value, 10) * 100).toFixed(1)}%` },
        { label: "达到 90%", value: `${Math.ceil(Math.log(0.1) / Math.log(1 - value))} 次` }
      ]
    };
  }

  function discountModel(value) {
    const curve = (gamma, step) => futureRewardWeight(gamma, step);
    const currentLabel = `当前 ${value.toFixed(2)}`;
    return {
      layout: "dual",
      formula: "Gt = Rt + γRt+1 + γ²Rt+2 + …；w(k) = γ^k",
      xLabel: "距离当前的未来步数 k（步）",
      yLabel: "未来奖励保留比例（%）",
      lower: makePanel([
        { label: "越界 0.60", role: "outside", value: 0.60 },
        { label: "下限 0.82", role: "boundary", value: 0.82 },
        { label: currentLabel, role: "current", value }
      ], 30, curve, "0.82 对应约 5.6 步有效视野；低于它时未来奖励衰减过快，派梯决策容易只顾当前请求。"),
      upper: makePanel([
        { label: currentLabel, role: "current", value },
        { label: "上限 0.94", role: "boundary", value: 0.94 },
        { label: "越界 0.99", role: "outside", value: 0.99 }
      ], 30, curve, "0.94 对应约 16.7 步有效视野；继续接近 1 会让遥远且不确定的奖励保持过大影响。"),
      summary: [
        { label: "有效视野", value: `${(1 / (1 - value)).toFixed(1)} 步` },
        { label: "影响半衰期", value: `${(Math.log(0.5) / Math.log(value)).toFixed(1)} 步` },
        { label: "第 10 步权重", value: `${(futureRewardWeight(value, 10) * 100).toFixed(1)}%` }
      ]
    };
  }

  function explorationModel(value) {
    const curve = (epsilonStart, episode) => explorationProbability(epsilonStart, episode);
    const currentLabel = `当前 ${value.toFixed(2)}`;
    const expectedTotal = Array.from({ length: 180 }, (_, episode) => explorationProbability(value, episode)).reduce((sum, item) => sum + item, 0);
    return {
      layout: "dual",
      formula: "εe = ε0 × 0.985^e",
      xLabel: "训练轮次 e（轮）",
      yLabel: "随机探索概率 εe（%）",
      lower: makePanel([
        { label: "越界 0.05", role: "outside", value: 0.05 },
        { label: "下限 0.25", role: "boundary", value: 0.25 },
        { label: currentLabel, role: "current", value }
      ], 200, curve, "低于 0.25 时非贪心尝试明显减少，部分权重方案可能缺少样本并过早失去竞争机会。"),
      upper: makePanel([
        { label: currentLabel, role: "current", value },
        { label: "上限 0.45", role: "boundary", value: 0.45 },
        { label: "越界 0.70", role: "outside", value: 0.70 }
      ], 200, curve, "高于 0.45 时训练前期随机动作占比过大，奖励波动增加且利用已有经验的时间被压缩。"),
      summary: [
        { label: "首轮探索", value: `${(value * 100).toFixed(1)}%` },
        { label: "第 100 轮", value: `${(explorationProbability(value, 100) * 100).toFixed(1)}%` },
        { label: "180 轮概率总和", value: expectedTotal.toFixed(1) }
      ]
    };
  }

  function penaltyModel(value, config) {
    const curve = (weight, metric) => linearPenalty(weight, metric);
    const currentLabel = `当前 ${value.toFixed(2)}`;
    const examples = config.examples.map(metric => ({
      label: `${config.exampleLabel}=${config.formatMetric(metric)}`,
      value: `${linearPenalty(value, metric).toFixed(2)} 分`
    }));
    return {
      layout: "dual",
      formula: config.formula,
      xLabel: config.xLabel,
      yLabel: "该奖励项造成的扣分（奖励分）",
      lower: makePanel([
        { label: `越界 ${config.outsideLow.toFixed(2)}`, role: "outside", value: config.outsideLow },
        { label: `下限 ${config.lower.toFixed(2)}`, role: "boundary", value: config.lower },
        { label: currentLabel, role: "current", value }
      ], config.maxX, curve, `${config.lowerReason}低于下限时该目标的扣分斜率太小，调度可能用该指标恶化来换取其他指标改善。`),
      upper: makePanel([
        { label: currentLabel, role: "current", value },
        { label: `上限 ${config.upper.toFixed(2)}`, role: "boundary", value: config.upper },
        { label: `越界 ${config.outsideHigh.toFixed(2)}`, role: "outside", value: config.outsideHigh }
      ], config.maxX, curve, `${config.upperReason}高于上限时该目标可能压过奖励中的其他目标，使多目标调度退化为近似单目标优化。`),
      summary: [{ label: "当前扣分斜率", value: value.toFixed(2) }, ...examples]
    };
  }

  function buildParameterChartModel(key, value, coverageHistory = []) {
    if (key === "trainEpisodes") {
      const latest = coverageHistory[coverageHistory.length - 1];
      return {
        layout: "single",
        formula: "Coverage(N) = Nvisited(N) ÷ (54 × 6)",
        xLabel: "训练轮数 N（轮）",
        yLabel: "状态-动作覆盖率（%）",
        recommended: [120, 260],
        current: value,
        explanation: "覆盖率统计 54 类可能状态与 6 套权重方案，共 324 个组合。推荐区间用于兼顾稀有组合的访问机会与后期边际收益。",
        series: [{
          label: "实际覆盖率",
          role: "current",
          points: coverageHistory.map(row => ({ x: row.episode, y: row.coverage }))
        }],
        summary: latest ? [
          { label: "已访问组合", value: `${latest.visited}/324` },
          { label: "当前覆盖率", value: `${(latest.coverage * 100).toFixed(1)}%` }
        ] : [{ label: "实际覆盖率", value: "运行一次仿真后显示" }]
      };
    }
    if (key === "learningRate") return learningRateModel(value);
    if (key === "discount") return discountModel(value);
    if (key === "epsilonStart") return explorationModel(value);
    if (key === "waitPenalty") return penaltyModel(value, {
      formula: "PW = λW × W̄",
      xLabel: "平均等待 W̄（时间步）",
      maxX: 30,
      lower: 1.20,
      upper: 1.90,
      outsideLow: 0.40,
      outsideHigh: 2.50,
      examples: [10, 20],
      exampleLabel: "等待",
      formatMetric: metric => `${metric} 步`,
      lowerReason: "1.20 让等待项在常见等待尺度下保持可见影响。",
      upperReason: "1.90 已使等待项成为奖励的主要组成部分。"
    });
    if (key === "energyPenalty") return penaltyModel(value, {
      formula: "PE = λE × Ē",
      xLabel: "平均移动 Ē（楼层/请求）",
      maxX: 20,
      lower: 0.25,
      upper: 0.70,
      outsideLow: 0.05,
      outsideHigh: 1.50,
      examples: [5, 10],
      exampleLabel: "移动",
      formatMetric: metric => `${metric} 层`,
      lowerReason: "0.25 使移动楼层数能够对空驶行为形成最低约束。",
      upperReason: "0.70 已明显提高远距离派梯的代价。"
    });
    if (key === "longWaitPenalty") return penaltyModel(value, {
      formula: "PL = λL × L；L = N(Wi≥τ) ÷ Npassengers",
      xLabel: "长等待比例 L（0-100%）",
      maxX: 1,
      lower: 4.50,
      upper: 7.50,
      outsideLow: 1.00,
      outsideHigh: 10.00,
      examples: [0.10, 0.25, 0.50],
      exampleLabel: "长等待比例",
      formatMetric: metric => `${(metric * 100).toFixed(0)}%`,
      lowerReason: "4.50 让少数极端等待对总奖励产生足够明显的额外扣分。",
      upperReason: "7.50 已能强烈推动长等待救援。"
    });
    return null;
  }

  const LINE_STYLES = {
    current: { color: "#2f6fa5", dash: [10, 5], label: "当前值" },
    boundary: { color: "#087f72", dash: [], label: "推荐边界" },
    outside: { color: "#b83a42", dash: [2, 5], label: "越界示例" }
  };

  function drawAxes(ctx, width, height, pad, maxX, maxY, xLabel, yLabel) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfc";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "11px Arial, sans-serif";
    ctx.strokeStyle = "#d6dee1";
    ctx.lineWidth = 1;
    const percentageY = maxY <= 1.001 && /比例|概率|覆盖率/.test(yLabel);
    for (let index = 0; index <= 5; index += 1) {
      const ratio = index / 5;
      const y = height - pad.bottom - ratio * (height - pad.top - pad.bottom);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = "#5f6c73";
      const value = maxY * ratio;
      ctx.fillText(percentageY ? `${Math.round(value * 100)}%` : value.toFixed(maxY < 10 ? 1 : 0), 18, y + 4);
    }
    for (let index = 0; index <= 5; index += 1) {
      const ratio = index / 5;
      const x = pad.left + ratio * (width - pad.left - pad.right);
      ctx.fillStyle = "#5f6c73";
      ctx.fillText((maxX * ratio).toFixed(maxX <= 1 ? 1 : 0), x - 8, height - pad.bottom + 20);
    }
    ctx.fillStyle = "#17242b";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(xLabel, pad.left + (width - pad.left - pad.right) / 2, height - 14);
    ctx.save();
    ctx.translate(13, pad.top + (height - pad.top - pad.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.textAlign = "left";
  }

  function drawLegend(ctx, series, pad, width) {
    const available = width - pad.left - pad.right;
    const slot = available / series.length;
    series.forEach((item, index) => {
      const style = LINE_STYLES[item.role];
      const x = pad.left + index * slot;
      const y = 28;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 3;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 28, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = style.color;
      ctx.font = "10px Arial, sans-serif";
      ctx.fillText(`${style.label} ${item.label.replace(/^(当前|下限|上限|越界)\s*/, "")}`, x + 34, y + 4);
    });
  }

  function drawBoundaryChart(canvas, panel) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = { left: 70, right: 22, top: 58, bottom: 66 };
    const points = panel.series.flatMap(item => item.points);
    const maxX = Math.max(...points.map(point => point.x), 1);
    const maxY = Math.max(...points.map(point => point.y), 0.000001) * 1.05;
    drawAxes(ctx, width, height, pad, maxX, maxY, panel.xLabel, panel.yLabel);
    drawLegend(ctx, panel.series, pad, width);
    panel.series.forEach(item => {
      const style = LINE_STYLES[item.role];
      ctx.strokeStyle = style.color;
      ctx.lineWidth = item.role === "current" ? 4 : 3;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = pad.left + point.x / maxX * (width - pad.left - pad.right);
        const y = height - pad.bottom - point.y / maxY * (height - pad.top - pad.bottom);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function drawCoverageChart(canvas, model) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = { left: 72, right: 24, top: 52, bottom: 66 };
    const maxX = Math.max(300, model.current);
    drawAxes(ctx, width, height, pad, maxX, 1, model.xLabel, model.yLabel);
    const mapX = value => pad.left + value / maxX * (width - pad.left - pad.right);
    ctx.fillStyle = "rgba(8,127,114,.12)";
    ctx.fillRect(mapX(model.recommended[0]), pad.top, mapX(model.recommended[1]) - mapX(model.recommended[0]), height - pad.top - pad.bottom);
    ctx.fillStyle = "#087f72";
    ctx.font = "11px Arial, sans-serif";
    ctx.fillText("推荐 120-260 轮", mapX(model.recommended[0]) + 8, pad.top + 18);
    ctx.strokeStyle = "#b83a42";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(mapX(model.current), pad.top);
    ctx.lineTo(mapX(model.current), height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#b83a42";
    ctx.fillText(`当前 ${Math.round(model.current)} 轮`, Math.min(mapX(model.current) + 6, width - 105), pad.top + 36);
    const points = model.series[0].points;
    if (!points.length) {
      ctx.fillStyle = "#5f6c73";
      ctx.font = "15px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("运行一次仿真后显示实际覆盖率", width / 2, height / 2);
      ctx.textAlign = "left";
      return;
    }
    ctx.strokeStyle = "#2f6fa5";
    ctx.lineWidth = 4;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = mapX(point.x);
      const y = height - pad.bottom - point.y * (height - pad.top - pad.bottom);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const QAWED_PARAMETER_CHARTS = {
    SPECIAL_PARAMETER_KEYS,
    DEFAULT_CURRENT_VALUES,
    targetShare,
    futureRewardWeight,
    explorationProbability,
    linearPenalty,
    buildParameterChartModel,
    drawBoundaryChart,
    drawCoverageChart
  };

  if (typeof window !== "undefined") window.QAWED_PARAMETER_CHARTS = QAWED_PARAMETER_CHARTS;
  if (typeof module !== "undefined" && module.exports) module.exports = QAWED_PARAMETER_CHARTS;
}(typeof globalThis !== "undefined" ? globalThis : this));
