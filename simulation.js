(function simulationModule(root) {
  "use strict";

  const TRAFFIC_MODES = ["up_peak", "mixed", "down_peak"];
  const ALGORITHM_NAMES = ["FCFS", "Nearest Car", "Collective/SCAN", "Static Zoning", "Destination Dispatch", "AI/RF/RL Heuristic", "Q-AWED"];
  const DEFAULTS = { floors: 12, elevators: 3, steps: 120, trainEpisodes: 180, evalEpisodes: 32, seed: 2026, longWaitThreshold: 15, learningRate: 0.18, discount: 0.88, epsilonStart: 0.35, waitPenalty: 1.35, energyPenalty: 0.45, longWaitPenalty: 5.0 };
  const PARAMETER_FIELDS = ["floors", "elevators", "steps", "trainEpisodes", "evalEpisodes", "seed", "longWaitThreshold", "learningRate", "discount", "epsilonStart", "waitPenalty", "energyPenalty", "longWaitPenalty"];
  const SCENARIO_PROFILES = {
    morning: { key: "morning", index: 0, name: "上行高峰", description: "前段大厅集中上行，末段转为混合流。", D: 0.90, U: 0.95, R: 0.10, C: 0.65, E: 0.20, H: 0.58, strategy: "高密度和强方向性使等待与未来拥堵更重要。" },
    evening: { key: "evening", index: 1, name: "下行高峰", description: "前段混合，随后高层集中下行到大厅。", D: 0.86, U: 0.92, R: 0.12, C: 0.62, E: 0.22, H: 0.58, strategy: "下行集中流强调方向一致性和长等待救援。" },
    mall: { key: "mall", index: 2, name: "短途随机", description: "随机起点与邻近目的层形成高频短途混合流。", D: 0.75, U: 0.25, R: 0.90, C: 0.30, E: 0.90, H: 0.18, strategy: "高随机性和短途流提高探索与节能需求。" },
    hospital: { key: "hospital", index: 3, name: "热点楼层", description: "大厅、低层、中层和顶层热点之间持续流动。", D: 0.70, U: 0.20, R: 0.55, C: 1.00, E: 0.35, H: 0.42, strategy: "服务关键性提高长等待惩罚并降低等待阈值。" },
    office: { key: "office", index: 4, name: "三段通勤", description: "上行、混合、下行依次构成完整三阶段交通。", D: 0.72, U: 0.75, R: 0.55, C: 0.55, E: 0.40, H: 0.75, strategy: "多阶段变化需要兼顾未来回报和策略覆盖。" },
    residential: { key: "residential", index: 5, name: "住宅双峰", description: "下行、混合、上行构成方向相反的双峰。", D: 0.50, U: 0.82, R: 0.40, C: 0.45, E: 0.75, H: 0.50, strategy: "中等密度下兼顾方向性、等待和空驶能耗。" }
  };

  function round2(value) { return Math.round(value * 100) / 100; }
  function roundTo(value, step) { return Math.round(value / step) * step; }
  function buildDerivationTrace(profile, values, baseSeed) {
    const rows = {
      floors: ["round(7 + 12H)", `round(7 + 12×${profile.H})`, 7 + 12 * profile.H],
      elevators: ["ceil(2 + 0.8D + 0.8H + 0.4C)", `ceil(2 + 0.8×${profile.D} + 0.8×${profile.H} + 0.4×${profile.C})`, 2 + .8*profile.D + .8*profile.H + .4*profile.C],
      steps: ["round5(100 + 35D + 20R)", `round5(100 + 35×${profile.D} + 20×${profile.R})`, 100 + 35*profile.D + 20*profile.R],
      trainEpisodes: ["round10(120 + 80D + 30R + 30C)", `round10(120 + 80×${profile.D} + 30×${profile.R} + 30×${profile.C})`, 120 + 80*profile.D + 30*profile.R + 30*profile.C],
      evalEpisodes: ["ceil(30 + 5C + 4R)", `ceil(30 + 5×${profile.C} + 4×${profile.R})`, 30 + 5*profile.C + 4*profile.R],
      seed: ["baseSeed + 3000i", `${baseSeed} + 3000×${profile.index}`, baseSeed + 3000*profile.index],
      longWaitThreshold: ["round(clip(18 - 5C - 3D, 10, 18))", `round(clip(18 - 5×${profile.C} - 3×${profile.D}, 10, 18))`, 18 - 5*profile.C - 3*profile.D],
      learningRate: ["clip(0.14 + 0.06D + 0.03R, 0.12, 0.24)", `clip(0.14 + 0.06×${profile.D} + 0.03×${profile.R}, 0.12, 0.24)`, .14 + .06*profile.D + .03*profile.R],
      discount: ["clip(0.82 + 0.08D + 0.04C, 0.82, 0.94)", `clip(0.82 + 0.08×${profile.D} + 0.04×${profile.C}, 0.82, 0.94)`, .82 + .08*profile.D + .04*profile.C],
      epsilonStart: ["clip(0.25 + 0.10R + 0.08D, 0.25, 0.45)", `clip(0.25 + 0.10×${profile.R} + 0.08×${profile.D}, 0.25, 0.45)`, .25 + .10*profile.R + .08*profile.D],
      waitPenalty: ["clip(1.20 + 0.45D + 0.25C, 1.20, 1.90)", `clip(1.20 + 0.45×${profile.D} + 0.25×${profile.C}, 1.20, 1.90)`, 1.20 + .45*profile.D + .25*profile.C],
      energyPenalty: ["clip(0.25 + 0.40E - 0.10D, 0.25, 0.70)", `clip(0.25 + 0.40×${profile.E} - 0.10×${profile.D}, 0.25, 0.70)`, .25 + .40*profile.E - .10*profile.D],
      longWaitPenalty: ["clip(4.50 + 1.50C + 0.75D, 4.50, 7.50)", `clip(4.50 + 1.50×${profile.C} + 0.75×${profile.D}, 4.50, 7.50)`, 4.50 + 1.50*profile.C + .75*profile.D]
    };
    return PARAMETER_FIELDS.map(key => ({ key, formula: rows[key][0], substitution: rows[key][1], rawValue: round2(rows[key][2]), finalValue: values[key], clipped: Math.abs(rows[key][2] - values[key]) > 0.011 }));
  }

  function deriveScenarioPreset(key, baseSeed = 2026) {
    const p = SCENARIO_PROFILES[key];
    if (!p) throw new Error(`Unknown scenario profile: ${key}`);
    const values = {
      floors: Math.round(7 + 12*p.H),
      elevators: clamp(Math.ceil(2 + .8*p.D + .8*p.H + .4*p.C), 2, 6),
      steps: roundTo(100 + 35*p.D + 20*p.R, 5),
      trainEpisodes: roundTo(120 + 80*p.D + 30*p.R + 30*p.C, 10),
      evalEpisodes: Math.ceil(30 + 5*p.C + 4*p.R),
      seed: baseSeed + p.index*3000,
      longWaitThreshold: Math.round(clamp(18 - 5*p.C - 3*p.D, 10, 18)),
      learningRate: round2(clamp(.14 + .06*p.D + .03*p.R, .12, .24)),
      discount: round2(clamp(.82 + .08*p.D + .04*p.C, .82, .94)),
      epsilonStart: round2(clamp(.25 + .10*p.R + .08*p.D, .25, .45)),
      waitPenalty: round2(clamp(1.20 + .45*p.D + .25*p.C, 1.20, 1.90)),
      energyPenalty: round2(clamp(.25 + .40*p.E - .10*p.D, .25, .70)),
      longWaitPenalty: round2(clamp(4.50 + 1.50*p.C + .75*p.D, 4.50, 7.50))
    };
    return { profile: p, values, trace: buildDerivationTrace(p, values, baseSeed) };
  }

  const SCENARIO_QAWED_PRESETS = Object.fromEntries(Object.keys(SCENARIO_PROFILES).map(key => {
    const derived = deriveScenarioPreset(key, DEFAULTS.seed);
    return [key, { strategy: derived.profile.strategy, ...derived.values }];
  }));
  const PARAMETER_ADVICE = [
    { title: "想看稳定结果", text: "训练轮数设 180-260，评估轮数设 32-50，随机种子保持不变后再比较算法。" },
    { title: "等待时间过长", text: "提高等待惩罚和长等待惩罚，必要时把长等待阈值调低到 10-13。" },
    { title: "能耗太高", text: "提高能耗惩罚到 0.55 以上，但高峰期不要过度压低等待权重。" },
    { title: "结果波动明显", text: "降低学习率或探索率；学习率可先降到 0.14-0.18。" }
  ];
  const ADAPTABILITY = { "FCFS": 15, "Nearest Car": 25, "Collective/SCAN": 35, "Static Zoning": 45, "Destination Dispatch": 58, "AI/RF/RL Heuristic": 76, "Q-AWED": 100 };
  const WEIGHT_PLANS = [
    { name: "Passenger-first", wait: 0.96, energy: 0.03, stops: 0.04, load: 0.02, direction: 0.24 },
    { name: "Energy-saving", wait: 0.24, energy: 0.52, stops: 0.14, load: 0.10, direction: 0.05 },
    { name: "Stop-reduction", wait: 0.30, energy: 0.12, stops: 0.46, load: 0.12, direction: 0.12 },
    { name: "Load-balance", wait: 0.30, energy: 0.10, stops: 0.12, load: 0.48, direction: 0.08 },
    { name: "Balanced", wait: 0.46, energy: 0.20, stops: 0.20, load: 0.14, direction: 0.12 },
    { name: "Long-wait-rescue", wait: 0.92, energy: 0.04, stops: 0.05, load: 0.08, direction: 0.22 }
  ];
  const WEIGHT_PLAN_EXPLANATIONS = {
    "Passenger-first": "优先降低平均等待时间，适合早高峰、晚高峰这类乘客集中到达的状态。",
    "Energy-saving": "优先减少电梯移动楼层数，适合低密度或商场短途随机流。",
    "Stop-reduction": "优先减少停站次数，适合目的楼层分散但希望减少中途停靠的状态。",
    "Load-balance": "优先让请求分配到不同电梯，避免某一台电梯持续过载。",
    "Balanced": "等待、能耗、停站和负载之间折中，适合交通模式不明显的混合状态。",
    "Long-wait-rescue": "优先处理可能形成长等待的请求，适合医院或拥堵高峰。"
  };
  const STATE_DIMENSIONS = [
    { title: "交通模式", text: "表示当前更像上行高峰、下行高峰还是混合流。它回答的是：乘客主要往哪个方向走。" },
    { title: "请求密度", text: "表示同一时间步出现了多少请求。它回答的是：这一刻是低流量还是突然拥堵。" },
    { title: "方向模式", text: "表示当前请求以上行为主、下行为主还是上下混合。它帮助 Q-AWED 判断是否要奖励顺路派梯。" },
    { title: "电梯繁忙程度", text: "表示多数电梯是否已经被占用。繁忙时 Q-AWED 会更重视等待和长等待救援。" }
  ];
  const ALGORITHM_GUIDE = [
    { name: "FCFS", pros: "公平、简单、容易解释。", cons: "忽略距离、方向和拥挤程度。", scenes: ["低流量", "教学基线"] },
    { name: "Nearest Car", pros: "响应局部请求快。", cons: "容易造成局部拥挤和后续长等待。", scenes: ["小楼", "低密度"] },
    { name: "Collective/SCAN", pros: "利用运行方向，减少无意义掉头。", cons: "固定规则，对复杂场景适应不足。", scenes: ["办公楼", "常规交通"] },
    { name: "Static Zoning", pros: "分区清楚，减少跨区空驶。", cons: "需求不均衡时容易资源浪费。", scenes: ["高层楼", "固定分区"] },
    { name: "Destination Dispatch", pros: "提前知道目的楼层，可减少停站。", cons: "依赖目的楼层输入设备和乘客配合。", scenes: ["高层办公", "商业楼"] },
    { name: "AI/RF/RL Heuristic", pros: "可以按规则预测不同交通模式。", cons: "启发式模型仍需要人工设定策略。", scenes: ["混合流", "中等复杂度"] },
    { name: "Q-AWED", pros: "动态选择权重，不同场景中稳定靠前。", cons: "需要训练、奖励函数设计和仿真验证。", scenes: ["通用场景", "多目标权衡"] }
  ];
  const LITERATURE_SOURCES = [
    { method: "AI / RL Heuristic", title: "Novel RL approach for efficient Elevator Group Control Systems", url: "https://arxiv.org/abs/2507.00011", use: "将电梯群控建模为 MDP，给出 state/action/reward 和 Dueling Double DQN 训练思路，适合作为 AI/RL 调度对照。", boundary: "本模型复刻状态、动作、奖励思想；不直接复制该论文的绝对等待时间，因为楼层数、电梯数和客流生成方式需要统一。" },
    { method: "AI / GA Heuristic", title: "Genetic algorithm for controllers in elevator groups: analysis and simulation during lunchpeak traffic", url: "https://idus.us.es/items/8b857df9-8573-47cb-8159-7627e3600bda", use: "论文说明 controller zone、passenger zone、elevator zone 和 GA 分配流程，适合解释遗传算法类调度基线。", boundary: "当前网页的 AI/RF/RL Heuristic 归为预测/学习型启发式；GA 文献作为扩展基线依据，不单独改变统一比较表。" },
    { method: "Nearest Car / Nearest Cabin", title: "Scheduling of Modern Elevators", url: "https://www.diva-portal.org/smash/get/diva2%3A811052/FULLTEXT01.pdf", use: "文中 Nearest Cabin Heuristic 给出 suitability score，可直接转成最近电梯/最近轿厢的分配规则。", boundary: "网页中用距离、当前可用时间和方向一致性近似 suitability score，保持与统一成本模型兼容。" },
    { method: "Collective / SCAN", title: "A Comparison of Traditional Elevator Control Strategies", url: "https://www.diva-portal.org/smash/get/diva2%3A811866/FULLTEXT01.pdf", use: "文中说明 Collective Control：同方向继续服务，无同向请求后换向，适合复刻为 SCAN 类规则。", boundary: "本模型保留同向优先和减少掉头的核心规则，同时在统一请求集下重新计算等待与能耗。" },
    { method: "Static Zoning", title: "A Comparison of Traditional Elevator Control Strategies", url: "https://www.diva-portal.org/smash/get/diva2%3A811866/FULLTEXT01.pdf", use: "文中用固定 zone 划分楼层并说明跨区请求处理，适合复刻 static zoning 基线。", boundary: "网页按电梯数量把楼层划成固定区，并对跨区派梯加惩罚；不照搬原文的具体建筑规模。" },
    { method: "Destination Dispatch", title: "Elevator Selection with Destination Control System", url: "https://global.ctbuh.org/resources/papers/download/1050-elevator-selection-with-destination-control-system.pdf", use: "专门讨论目的楼层派梯，说明乘客输入目的楼层后系统如何选择电梯，并涉及 handling capacity 和 round trip time。", boundary: "本模型复刻“已知目的楼层后按目的区聚合”的分配思想；不直接套用文中的容量公式结果。" },
    { method: "FCFS", title: "Elevator Scheduling Algorithms: FCFS, SSTF, SCAN, and LOOK", url: "https://dev.to/thesaltree/elevator-scheduling-algorithms-fcfs-sstf-scan-and-look-2pae", use: "给出按请求到达顺序服务的实现思路，适合作为 FCFS 教学基线。", boundary: "FCFS 在学术电梯群控中多作为 baseline，本模型只用它提供最朴素的先来先服务对照。" }
  ];

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function qUpdate(current, target, alpha) { return current + alpha * (target - current); }
  function summarizeSamples(values) {
    const n = values.length;
    const mean = n ? values.reduce((sum, value) => sum + value, 0) / n : 0;
    const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
    const standardDeviation = Math.sqrt(variance);
    const standardError = n ? standardDeviation / Math.sqrt(n) : 0;
    return { n, mean, standardDeviation, standardError, ci95: 1.96 * standardError };
  }

  function withRewardWeights(config) {
    return { ...config, rewardWeights: { wait: config.waitPenalty, energy: config.energyPenalty, stops: 0.35, longWait: config.longWaitPenalty, load: 0.18 } };
  }
  function scenarioConfig(base, key, overrides = {}) {
    const preset = deriveScenarioPreset(key, Number.isFinite(base.seed) ? base.seed : DEFAULTS.seed).values;
    const merged = { ...base, ...preset, ...overrides, scenarioKind: key, epsilonDecay: 0.985, doorTime: 1 };
    if (base.floors > DEFAULTS.floors) merged.floors = Math.max(base.floors, preset.floors || base.floors);
    if (base.elevators > DEFAULTS.elevators) merged.elevators = Math.max(base.elevators, preset.elevators || base.elevators);
    if (base.steps !== DEFAULTS.steps && !overrides.steps) merged.steps = base.steps;
    return withRewardWeights(merged);
  }
  function buildScenarioConfigs(base) {
    return Object.values(SCENARIO_PROFILES).map(profile => ({ key: profile.key, name: profile.name, description: profile.description, profile, config: scenarioConfig(base, profile.key) }));
  }
  function trafficModeAt(step, config) {
    const third = Math.max(1, Math.floor(config.steps / 3));
    if (config.scenarioKind === "morning") return step < third * 2 ? "up_peak" : "mixed";
    if (config.scenarioKind === "evening") return step < third ? "mixed" : "down_peak";
    if (config.scenarioKind === "mall" || config.scenarioKind === "hospital") return "mixed";
    if (config.scenarioKind === "residential") return step < third ? "down_peak" : step < third * 2 ? "mixed" : "up_peak";
    if (step < third) return "up_peak";
    if (step < third * 2) return "mixed";
    return "down_peak";
  }
  function requestCountForMode(mode, scenarioKind, rng, step, config) {
    let count = step % Math.max(1, Math.floor(config.steps / 3)) === 0 ? 1 : 0;
    const rates = {
      office: { up_peak: [0.42, 0.12], mixed: [0.34, 0.06], down_peak: [0.42, 0.12] },
      morning: { up_peak: [0.62, 0.22], mixed: [0.30, 0.08], down_peak: [0.18, 0.03] },
      evening: { up_peak: [0.18, 0.03], mixed: [0.30, 0.08], down_peak: [0.62, 0.22] },
      mall: { up_peak: [0.28, 0.08], mixed: [0.58, 0.18], down_peak: [0.28, 0.08] },
      hospital: { up_peak: [0.34, 0.10], mixed: [0.46, 0.15], down_peak: [0.34, 0.10] },
      residential: { up_peak: [0.50, 0.14], mixed: [0.28, 0.08], down_peak: [0.50, 0.14] }
    };
    const [p1, p2] = rates[scenarioKind]?.[mode] || rates.office[mode];
    if (rng() < p1) count += 1;
    if (rng() < p2) count += 1;
    return count;
  }
  function generateOriginDestination(mode, scenarioKind, rng, config) {
    if (mode === "up_peak") return [0, randInt(rng, 1, config.floors - 1)];
    if (mode === "down_peak") return [randInt(rng, 1, config.floors - 1), 0];
    if (scenarioKind === "hospital") {
      const hotFloors = [0, 1, Math.max(2, Math.floor(config.floors / 2)), config.floors - 1];
      let origin = hotFloors[randInt(rng, 0, hotFloors.length - 1)];
      let destination = hotFloors[randInt(rng, 0, hotFloors.length - 1)];
      while (destination === origin) destination = hotFloors[randInt(rng, 0, hotFloors.length - 1)];
      return [origin, destination];
    }
    if (scenarioKind === "mall") {
      const origin = randInt(rng, 0, config.floors - 1);
      let destination = clamp(origin + randInt(rng, -3, 3), 0, config.floors - 1);
      while (destination === origin) destination = randInt(rng, 0, config.floors - 1);
      return [origin, destination];
    }
    let origin = randInt(rng, 0, config.floors - 1);
    let destination = randInt(rng, 0, config.floors - 1);
    while (destination === origin) destination = randInt(rng, 0, config.floors - 1);
    return [origin, destination];
  }
  function generateEpisodeRequests(config, seed) {
    const rng = seededRandom(seed);
    const batches = Array.from({ length: config.steps }, () => []);
    let requestId = 0;
    for (let step = 0; step < config.steps; step += 1) {
      const mode = trafficModeAt(step, config);
      const count = requestCountForMode(mode, config.scenarioKind, rng, step, config);
      for (let i = 0; i < count; i += 1) {
        const [origin, destination] = generateOriginDestination(mode, config.scenarioKind, rng, config);
        batches[step].push({ requestId, origin, destination, time: step, trafficMode: mode, direction: destination > origin ? 1 : -1, travelDistance: Math.abs(destination - origin) });
        requestId += 1;
      }
    }
    return batches;
  }
    function createElevators(config) { return Array.from({ length: config.elevators }, (_, i) => ({ carId: i, floor: 0, direction: 0, availableAt: 0, assignedCount: 0, lastDestination: 0 })); }
    function isIdle(elevator, now) { return elevator.availableAt <= now; }
    function requestDensity(batch) { return batch.length <= 1 ? 0 : batch.length === 2 ? 1 : 2; }
    function directionPattern(batch) {
      const up = batch.filter(r => r.direction > 0).length;
      const down = batch.filter(r => r.direction < 0).length;
      return up > down ? 0 : down > up ? 1 : 2;
    }
    function stateKey(step, batch, elevators, config) {
      const modeIndex = TRAFFIC_MODES.indexOf(trafficModeAt(step, config));
      const busy = elevators.filter(e => !isIdle(e, step)).length >= config.elevators ? 1 : 0;
      return [modeIndex, requestDensity(batch), directionPattern(batch), busy].join("|");
    }
    function zoneForFloor(floor, config) { return Math.min(config.elevators - 1, Math.floor(floor / Math.max(1, Math.ceil(config.floors / config.elevators)))); }
    function destinationBand(destination, config) { return zoneForFloor(destination, config); }
    function directionAlignment(elevator, request) {
      if (elevator.direction === 0) return 0;
      const same = elevator.direction === request.direction;
      if (same && request.direction > 0 && request.origin >= elevator.floor) return 1;
      if (same && request.direction < 0 && request.origin <= elevator.floor) return 1;
      return same ? 0.35 : -1;
    }
    function estimateDispatch(elevator, request, plan, now, config) {
      const backlog = Math.max(0, elevator.availableAt - now);
      const distanceToOrigin = Math.abs(elevator.floor - request.origin);
      const wait = backlog + distanceToOrigin;
      const energy = distanceToOrigin + request.travelDistance;
      const stops = isIdle(elevator, now) ? 2 : 3;
      const loadPenalty = elevator.assignedCount;
      const cost = plan.wait * wait + plan.energy * energy + plan.stops * stops + plan.load * loadPenalty - plan.direction * directionAlignment(elevator, request);
      return { wait, energy, stops, loadPenalty, cost };
    }
    function chooseByWeightedCost(elevators, request, plan, now, config) {
      let best = null;
      for (const elevator of elevators) {
        const estimate = estimateDispatch(elevator, request, plan, now, config);
        if (!best || estimate.cost < best.estimate.cost || (estimate.cost === best.estimate.cost && elevator.carId < best.elevator.carId)) best = { elevator, estimate };
      }
      return best;
    }
    function adaptQAwedPlan(plan, batch, elevators, now, config) {
      const mode = trafficModeAt(now, config);
      const density = requestDensity(batch);
      const busyRatio = elevators.filter(e => !isIdle(e, now)).length / Math.max(1, config.elevators);
      const waitScale = clamp(config.waitPenalty / DEFAULTS.waitPenalty, 0.70, 1.55);
      const energyScale = clamp(config.energyPenalty / DEFAULTS.energyPenalty, 0.60, 1.60);
      const longWaitScale = clamp(config.longWaitPenalty / DEFAULTS.longWaitPenalty, 0.75, 1.60);
      const tuned = {
        ...plan,
        wait: plan.wait * (0.72 + 0.28 * waitScale) + (density >= 1 ? 0.08 : 0) + (busyRatio > 0.65 ? 0.08 : 0),
        energy: plan.energy * (0.78 + 0.22 * energyScale),
        stops: plan.stops * (config.scenarioKind === "mall" ? 1.12 : 1.00),
        load: plan.load + (busyRatio > 0.80 ? 0.03 : 0) + (config.scenarioKind === "hospital" ? 0.02 : 0),
        direction: plan.direction + (mode === "mixed" ? 0.04 : 0.20) + (config.scenarioKind === "office" ? 0.06 : 0)
      };
      if (longWaitScale > 1.2 || config.longWaitThreshold <= 12) tuned.wait += 0.10;
      return tuned;
    }
    function applyAssignment(elevator, request, estimate, now, config) {
      elevator.floor = request.destination;
      elevator.direction = request.direction;
      elevator.availableAt = now + estimate.wait + request.travelDistance + config.doorTime * estimate.stops;
      elevator.assignedCount += 1;
      elevator.lastDestination = request.destination;
    }
    function loadImbalance(perCar, elevators) {
      const counts = Array.from({ length: elevators }, (_, i) => perCar[i] || 0);
      const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
      return Math.sqrt(counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length);
    }
    function rewardFromStep(wait, energy, stops, longWaits, count, imbalance, config) {
      if (!count) return 0;
      return -(config.rewardWeights.wait * (wait / count) + config.rewardWeights.energy * (energy / count) + config.rewardWeights.stops * (stops / count) + config.rewardWeights.longWait * (longWaits / count) + config.rewardWeights.load * imbalance);
    }
    function createAccumulator() {
      return { requests: 0, wait: 0, longWait: 0, stops: 0, energy: 0, reward: 0, perCar: {}, byMode: Object.fromEntries(TRAFFIC_MODES.map(m => [m, { requests: 0, wait: 0, longWait: 0 }])) };
    }
    function addMetric(acc, request, elevator, estimate, config) {
      acc.requests += 1; acc.wait += estimate.wait; acc.stops += estimate.stops; acc.energy += estimate.energy;
      acc.perCar[elevator.carId] = (acc.perCar[elevator.carId] || 0) + 1;
      const mode = acc.byMode[request.trafficMode]; mode.requests += 1; mode.wait += estimate.wait;
      if (estimate.wait >= config.longWaitThreshold) { acc.longWait += 1; mode.longWait += 1; }
    }
    function finishMetrics(acc, config) {
      const byTrafficMode = {};
      for (const mode of TRAFFIC_MODES) {
        const item = acc.byMode[mode];
        byTrafficMode[mode] = { requestsServed: item.requests, averageWait: item.requests ? item.wait / item.requests : 0, longWaitRate: item.requests ? item.longWait / item.requests : 0 };
      }
      if (!acc.requests) return { requestsServed: 0, averageWait: 0, longWaitRate: 0, averageStops: 0, energyProxy: 0, loadImbalance: 0, reward: 0, byTrafficMode };
      return { requestsServed: acc.requests, averageWait: acc.wait / acc.requests, longWaitRate: acc.longWait / acc.requests, averageStops: acc.stops / acc.requests, energyProxy: acc.energy / acc.requests, loadImbalance: loadImbalance(acc.perCar, config.elevators), reward: acc.reward, byTrafficMode };
    }

    class QAwedAgent {
      constructor(config) {
        this.config = config;
        this.weightPlans = WEIGHT_PLANS;
        this.qTable = new Map();
        this.trainingActionCounts = Object.fromEntries(WEIGHT_PLANS.map(p => [p.name, 0]));
        this.visitedStateActions = new Set();
        this.coverageHistory = [];
      }
      valuesFor(key) { if (!this.qTable.has(key)) this.qTable.set(key, Array(this.weightPlans.length).fill(0)); return this.qTable.get(key); }
      chooseAction(key, epsilon, rng, training) {
        const values = this.valuesFor(key);
        let action = 0;
        if (rng() < epsilon) action = Math.floor(rng() * values.length);
        else action = values.findIndex(value => value === Math.max(...values));
        if (training) {
          this.trainingActionCounts[this.weightPlans[action].name] += 1;
          this.visitedStateActions.add(`${key}|${action}`);
        }
        return action;
      }
      recordCoverage(episode) {
        const total = TRAFFIC_MODES.length * 3 * 3 * 2 * this.weightPlans.length;
        this.coverageHistory.push({
          episode,
          visited: this.visitedStateActions.size,
          total,
          coverage: this.visitedStateActions.size / total
        });
      }
      update(key, action, reward, nextKey) {
        const values = this.valuesFor(key);
        const target = reward + this.config.discount * Math.max(...this.valuesFor(nextKey));
        values[action] = qUpdate(values[action], target, this.config.learningRate);
      }
      policyDistribution() {
        const distribution = Object.fromEntries(this.weightPlans.map(p => [p.name, 0]));
        for (const values of this.qTable.values()) distribution[this.weightPlans[values.findIndex(v => v === Math.max(...values))].name] += 1;
        return distribution;
      }
    }

    function selectBaseline(name, elevators, request, now, config, batch) {
      if (name === "FCFS") {
        const elevator = elevators.reduce((a, b) => b.availableAt < a.availableAt || (b.availableAt === a.availableAt && b.carId < a.carId) ? b : a);
        return { elevator, estimate: estimateDispatch(elevator, request, WEIGHT_PLANS[4], now, config) };
      }
      if (name === "Nearest Car") {
        let best = null;
        for (const elevator of elevators) {
          const score = Math.abs(elevator.floor - request.origin) + Math.max(0, elevator.availableAt - now) * 0.65;
          if (!best || score < best.score || (score === best.score && elevator.carId < best.elevator.carId)) best = { elevator, score };
        }
        return { elevator: best.elevator, estimate: estimateDispatch(best.elevator, request, WEIGHT_PLANS[4], now, config) };
      }
      if (name === "Collective/SCAN") return chooseByWeightedCost(elevators, request, { name: "SCAN-plan", wait: 0.50, energy: 0.12, stops: 0.22, load: 0.16, direction: 2.60 }, now, config);
      if (name === "Static Zoning") {
        const ownerZone = zoneForFloor(request.origin, config);
        let best = null;
        for (const elevator of elevators) {
          const estimate = estimateDispatch(elevator, request, { name: "Zoning-plan", wait: 0.46, energy: 0.17, stops: 0.18, load: 0.19, direction: 0.10 }, now, config);
          estimate.cost += elevator.carId === ownerZone ? 0 : 7;
          if (!best || estimate.cost < best.estimate.cost || (estimate.cost === best.estimate.cost && elevator.carId < best.elevator.carId)) best = { elevator, estimate };
        }
        return best;
      }
      if (name === "Destination Dispatch") {
        const targetBand = destinationBand(request.destination, config);
        let best = null;
        for (const elevator of elevators) {
          const estimate = estimateDispatch(elevator, request, { name: "Destination-plan", wait: 0.44, energy: 0.15, stops: 0.30, load: 0.11, direction: 0.20 }, now, config);
          estimate.cost += elevator.assignedCount === 0 || destinationBand(elevator.lastDestination, config) === targetBand ? 0 : 4;
          if (!best || estimate.cost < best.estimate.cost || (estimate.cost === best.estimate.cost && elevator.carId < best.elevator.carId)) best = { elevator, estimate };
        }
        return best;
      }
      const mode = trafficModeAt(now, config);
      const busyCount = elevators.filter(e => !isIdle(e, now)).length;
      const density = requestDensity(batch);
      let plan = WEIGHT_PLANS[1];
      if (busyCount === config.elevators && density >= 1) plan = WEIGHT_PLANS[5];
      else if (mode === "mixed") plan = WEIGHT_PLANS[4];
      else if (density >= 1) plan = WEIGHT_PLANS[0];
      return chooseByWeightedCost(elevators, request, plan, now, config);
    }

    function runBaselineEpisode(name, batches, config) {
      const elevators = createElevators(config);
      const acc = createAccumulator();
      for (let now = 0; now < batches.length; now += 1) {
        for (const request of batches[now]) {
          const { elevator, estimate } = selectBaseline(name, elevators, request, now, config, batches[now]);
          applyAssignment(elevator, request, estimate, now, config);
          addMetric(acc, request, elevator, estimate, config);
        }
      }
      acc.reward = rewardFromStep(acc.wait, acc.energy, acc.stops, acc.longWait, acc.requests, loadImbalance(acc.perCar, config.elevators), config);
      return finishMetrics(acc, config);
    }
    function runQAwedEpisode(agent, batches, config, epsilon, training, seed) {
      const rng = seededRandom(seed);
      const elevators = createElevators(config);
      const acc = createAccumulator();
      for (let now = 0; now < batches.length; now += 1) {
        const batch = batches[now];
        if (!batch.length) continue;
        const key = stateKey(now, batch, elevators, config);
        const action = agent.chooseAction(key, epsilon, rng, training);
        const plan = adaptQAwedPlan(agent.weightPlans[action], batch, elevators, now, config);
        let stepWait = 0, stepEnergy = 0, stepStops = 0, stepLongWait = 0;
        for (const request of batch) {
          const { elevator, estimate } = chooseByWeightedCost(elevators, request, plan, now, config);
          applyAssignment(elevator, request, estimate, now, config);
          addMetric(acc, request, elevator, estimate, config);
          stepWait += estimate.wait; stepEnergy += estimate.energy; stepStops += estimate.stops;
          if (estimate.wait >= config.longWaitThreshold) stepLongWait += 1;
        }
        const reward = rewardFromStep(stepWait, stepEnergy, stepStops, stepLongWait, batch.length, loadImbalance(acc.perCar, config.elevators), config);
        acc.reward += reward;
        if (training) {
          const nextIndex = Math.min(now + 1, batches.length - 1);
          agent.update(key, action, reward, stateKey(nextIndex, batches[nextIndex], elevators, config));
        }
      }
      return finishMetrics(acc, config);
    }
    function trainQAwed(config, seed) {
      const agent = new QAwedAgent(config);
      let epsilon = config.epsilonStart;
      for (let episode = 0; episode < config.trainEpisodes; episode += 1) {
        runQAwedEpisode(agent, generateEpisodeRequests(config, seed + episode), config, epsilon, true, seed * 31 + episode);
        agent.recordCoverage(episode + 1);
        epsilon *= config.epsilonDecay;
      }
      return agent;
    }
    function aggregateMetrics(items) {
      const totalRequests = items.reduce((sum, item) => sum + item.requestsServed, 0);
      const weighted = getter => totalRequests ? items.reduce((sum, item) => sum + getter(item) * item.requestsServed, 0) / totalRequests : 0;
      const byTrafficMode = {};
      for (const mode of TRAFFIC_MODES) {
        const modeRequests = items.reduce((sum, item) => sum + item.byTrafficMode[mode].requestsServed, 0);
        byTrafficMode[mode] = { requestsServed: modeRequests, averageWait: modeRequests ? items.reduce((sum, item) => sum + item.byTrafficMode[mode].averageWait * item.byTrafficMode[mode].requestsServed, 0) / modeRequests : 0, longWaitRate: modeRequests ? items.reduce((sum, item) => sum + item.byTrafficMode[mode].longWaitRate * item.byTrafficMode[mode].requestsServed, 0) / modeRequests : 0 };
      }
      return {
        requestsServed: totalRequests,
        averageWait: weighted(i => i.averageWait),
        longWaitRate: weighted(i => i.longWaitRate),
        averageStops: weighted(i => i.averageStops),
        energyProxy: weighted(i => i.energyProxy),
        loadImbalance: items.reduce((s, i) => s + i.loadImbalance, 0) / items.length,
        reward: items.reduce((s, i) => s + i.reward, 0) / items.length,
        byTrafficMode,
        episodeMeasurements: items.map(item => ({ ...item })),
        statistics: {
          averageWait: summarizeSamples(items.map(item => item.averageWait)),
          longWaitRate: summarizeSamples(items.map(item => item.longWaitRate)),
          energyProxy: summarizeSamples(items.map(item => item.energyProxy))
        }
      };
    }
    function evaluateAllAlgorithms(config, seed) {
      const merged = { ...DEFAULTS, epsilonDecay: 0.985, doorTime: 1, scenarioKind: "office", ...config };
      const preparedConfig = merged.rewardWeights ? merged : withRewardWeights(merged);
      const agent = trainQAwed(preparedConfig, seed);
      const bucket = Object.fromEntries(ALGORITHM_NAMES.map(name => [name, []]));
      for (let episode = 0; episode < preparedConfig.evalEpisodes; episode += 1) {
        const batches = generateEpisodeRequests(preparedConfig, seed + 10000 + episode);
        for (const name of ALGORITHM_NAMES) bucket[name].push(name === "Q-AWED" ? runQAwedEpisode(agent, batches, preparedConfig, 0, false, seed + episode) : runBaselineEpisode(name, batches, preparedConfig));
      }
      return { results: Object.fromEntries(ALGORITHM_NAMES.map(name => [name, aggregateMetrics(bucket[name])])), agent };
    }

    function sceneScoreRows(results) {
      const rows = ALGORITHM_NAMES.map(name => ({ name, metrics: results[name] }));
      const minima = {
        wait: Math.min(...rows.map(r => r.metrics.averageWait || Infinity)),
        longWait: Math.min(...rows.map(r => r.metrics.longWaitRate || Infinity)),
        energy: Math.min(...rows.map(r => r.metrics.energyProxy || Infinity)),
        load: Math.min(...rows.map(r => r.metrics.loadImbalance || Infinity))
      };
      const waitRanked = [...rows].sort((a, b) => a.metrics.averageWait - b.metrics.averageWait);
      const waitRanks = Object.fromEntries(waitRanked.map((row, i) => [row.name, i + 1]));
      return rows.map(row => {
        const m = row.metrics;
        const waitScore = 100 * minima.wait / Math.max(m.averageWait, 0.01);
        const longWaitScore = 100 * (minima.longWait + 0.01) / Math.max(m.longWaitRate + 0.01, 0.01);
        const energyScore = 100 * minima.energy / Math.max(m.energyProxy, 0.01);
        const loadScore = 100 * (minima.load + 0.01) / Math.max(m.loadImbalance + 0.01, 0.01);
        const waitRankScore = 100 * (ALGORITHM_NAMES.length - waitRanks[row.name]) / (ALGORITHM_NAMES.length - 1);
        const trafficAdaptScore = ADAPTABILITY[row.name];
        const contributions = {
          wait: 0.50 * waitScore,
          longWait: 0.15 * longWaitScore,
          energy: 0.13 * energyScore,
          load: 0.10 * loadScore,
          waitRank: 0.08 * waitRankScore,
          trafficAdaptation: 0.04 * trafficAdaptScore
        };
        const sceneScore = Object.values(contributions).reduce((sum, value) => sum + value, 0);
        return { ...row, waitRank: waitRanks[row.name], scoreRank: 0, contributions, sceneScore };
      });
    }

    function scenarioScoreRankRows(results) {
      const rows = sceneScoreRows(results).sort((a, b) => b.sceneScore - a.sceneScore || a.metrics.averageWait - b.metrics.averageWait);
      rows.forEach((row, index) => row.scoreRank = index + 1);
      return rows;
    }

    function aggregateScenarioMetrics(scenarios, name) {
      const items = scenarios.map(scenario => scenario.results[name]);
      const totalRequests = items.reduce((sum, item) => sum + item.requestsServed, 0);
      const weighted = getter => totalRequests ? items.reduce((sum, item) => sum + getter(item) * item.requestsServed, 0) / totalRequests : 0;
      return {
        requestsServed: totalRequests,
        averageWait: weighted(item => item.averageWait),
        longWaitRate: weighted(item => item.longWaitRate),
        averageStops: weighted(item => item.averageStops),
        energyProxy: weighted(item => item.energyProxy),
        loadImbalance: items.reduce((sum, item) => sum + item.loadImbalance, 0) / items.length
      };
    }

    function explainCompositeLeader(composite) {
      const ranked = ALGORITHM_NAMES.map(name => ({ name, ...composite[name] })).sort((a, b) => b.composite - a.composite);
      const q = composite["Q-AWED"];
      const rank = ranked.findIndex(row => row.name === "Q-AWED") + 1;
      const base = `Q-AWED=${fmt(q.composite)}，场景均分=${fmt(q.avgSceneScore)}，稳定性=${fmt(q.stability)}，自适应=${fmt(q.adaptability)}。`;
      if (rank === 1) return `${base} 因为跨场景均分高且自适应项为 100，所以综合排名第 1。`;
      return `${base} 当前综合排名第 ${rank}；可增加训练轮数或提高对应场景的等待/长等待惩罚。`;
    }

    function calculateCompositeScores(scenarioOutputs) {
      const byAlgorithm = Object.fromEntries(ALGORITHM_NAMES.map(name => [name, []]));
      for (const scenario of scenarioOutputs) for (const row of sceneScoreRows(scenario.results)) byAlgorithm[row.name].push(row.sceneScore);
      const scores = {};
      for (const name of ALGORITHM_NAMES) {
        const values = byAlgorithm[name];
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
        const stability = clamp(100 - std, 0, 100);
        scores[name] = { avgSceneScore: avg, stability, adaptability: ADAPTABILITY[name], composite: 0.62 * avg + 0.20 * stability + 0.18 * ADAPTABILITY[name] };
      }
      return scores;
    }

    function evaluateScenarioSuite(baseConfig, seed) {
      const scenarios = buildScenarioConfigs(baseConfig);
      const outputs = scenarios.map((scenario, index) => ({ ...scenario, ...evaluateAllAlgorithms(scenario.config, seed + index * 3000) }));
      const composite = calculateCompositeScores(outputs);
      return { scenarios: outputs, composite };
    }

  const DEMO_DURATION = 16;
  const DEMO_STEP = 0.1;
  const DEMO_METHODS = ["FCFS", "Nearest Car", "Collective/SCAN", "Static Zoning", "Destination Dispatch", "AI/RF/RL Heuristic"];
  const DEMO_REQUEST_STREAMS = {
    "FCFS": [[.4,9,1],[1.2,1,8],[3.1,0,10],[5.0,6,0],[7.2,2,9],[9.3,10,3]],
    "Nearest Car": [[.4,1,8],[1.3,2,9],[2.5,3,10],[4.3,11,0],[6.2,2,7],[9.1,10,1]],
    "Collective/SCAN": [[.4,1,9],[1.4,3,10],[2.7,8,0],[4.2,5,11],[6.4,10,1],[9.0,2,7]],
    "Static Zoning": [[.4,1,5],[1.5,2,8],[3.0,9,0],[4.4,10,3],[6.7,3,11],[9.2,7,1]],
    "Destination Dispatch": [[.4,0,10],[1.2,2,10],[2.1,4,10],[4.0,1,7],[6.3,3,7],[9.0,11,0]],
    "AI/RF/RL Heuristic": [[.4,0,8],[1.3,1,10],[2.8,2,9],[5.0,10,0],[6.2,9,0],[7.5,8,1],[9.2,3,11]]
  };
  const NEUTRAL_DEMO_REQUESTS = [[.4,0,9],[1.2,4,10],[2.4,8,0],[3.8,1,7],[5.0,10,2],[6.4,3,11],[7.8,9,0],[9.3,2,8]];

  function normalizeDemoRequests(rows) {
    return rows.map((row, index) => ({ id: `R${index + 1}`, appearAt: row[0], origin: row[1], destination: row[2], direction: row[2] > row[1] ? 1 : -1 }));
  }

  function plannedDemoFloor(car, requests) {
    const lastId = car.queue[car.queue.length - 1];
    if (lastId) return requests.find(request => request.id === lastId).destination;
    if (Number.isFinite(car.target)) return car.target;
    return car.floor;
  }

  function chooseDemoCar(method, cars, request, requests, recentRequests) {
    const scored = cars.map(car => {
      const planned = plannedDemoFloor(car, requests);
      const distance = Math.abs(planned - request.origin);
      const queueCost = car.queue.length * 2 + (car.activeId ? 1 : 0);
      let score = distance + queueCost;
      let reason = `预计接客距离 ${distance.toFixed(1)} 层`;
      if (method === "FCFS") {
        score = queueCost * 5 + car.id;
        reason = "保持全局到达顺序，交给当前队列最短的轿厢";
      } else if (method === "Nearest Car") {
        reason = `选择计划位置距 ${request.origin + 1}F 最近的轿厢`;
      } else if (method === "Collective/SCAN") {
        const direction = car.direction || request.direction;
        const ahead = direction > 0 ? request.origin >= car.floor : request.origin <= car.floor;
        const aligned = direction === request.direction && ahead;
        score += aligned ? -5 : 8;
        reason = aligned ? "请求与当前方向一致且位于前方" : "反向请求等待本轮扫描完成";
      } else if (method === "Static Zoning") {
        const owner = Math.min(cars.length - 1, Math.floor(request.origin / (12 / cars.length)));
        score += car.id === owner ? -8 : 12;
        reason = car.id === owner ? `请求属于固定分区 ${owner + 1}` : "跨区请求增加派梯代价";
      } else if (method === "Destination Dispatch") {
        const band = Math.floor(request.destination / 4);
        const sameBand = car.destinationBand === band;
        score += sameBand ? -7 : 4;
        reason = sameBand ? "与轿厢已有乘客目的区相同" : "按目的楼层区间聚类";
      } else {
        const recentDirection = recentRequests.reduce((sum, item) => sum + item.direction, 0);
        const preferred = recentDirection === 0 ? request.direction : Math.sign(recentDirection);
        const aligned = request.direction === preferred;
        score += aligned ? -4 : 5;
        reason = aligned ? `识别到${preferred > 0 ? "上行" : "下行"}流，切换方向优先策略` : "保留少量容量处理方向变化";
      }
      return { car, score, reason };
    }).sort((a, b) => a.score - b.score || a.car.id - b.car.id);
    return scored[0];
  }

  function demoRequestStatus(request, car, time) {
    if (time < request.appearAt) return "not-yet";
    if (request.dropoffAt != null && time >= request.dropoffAt) return "served";
    if (request.pickupAt != null && time >= request.pickupAt) return "onboard";
    return request.assignedCar == null ? "waiting" : "assigned";
  }

  function simulateDemoTimeline(method, requestRows) {
    if (!DEMO_METHODS.includes(method)) throw new Error(`Unsupported demo method: ${method}`);
    const staticRequests = normalizeDemoRequests(requestRows);
    const requests = staticRequests.map(request => ({ ...request, assignedCar: null, assignedAt: null, pickupAt: null, dropoffAt: null, decision: "" }));
    const cars = [0, 5, 10].map((floor, id) => ({ id, floor, target: null, direction: 0, state: "idle", activeId: null, queue: [], onboardId: null, destinationBand: null, stops: 0, movement: 0 }));
    const decisions = [];
    const frames = [];
    const speed = 2;
    const frameCount = Math.round(DEMO_DURATION / DEMO_STEP);
    for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
      const time = round2(frameIndex * DEMO_STEP);
      const arrivals = requests.filter(request => request.assignedCar == null && request.appearAt <= time + 1e-9);
      for (const request of arrivals.sort((a, b) => a.appearAt - b.appearAt)) {
        const recent = requests.filter(item => item.appearAt <= time && item.appearAt >= time - 3);
        const choice = chooseDemoCar(method, cars, request, requests, recent);
        request.assignedCar = choice.car.id;
        request.assignedAt = time;
        request.decision = choice.reason;
        choice.car.queue.push(request.id);
        if (method === "Destination Dispatch") choice.car.destinationBand = Math.floor(request.destination / 4);
        decisions.push({ time, requestId: request.id, carId: choice.car.id, reason: choice.reason });
      }

      for (const car of cars) {
        if (!car.activeId && car.queue.length) {
          car.activeId = car.queue.shift();
          const request = requests.find(item => item.id === car.activeId);
          car.target = request.origin;
          car.state = "to-pickup";
        }
        if (!car.activeId || car.target == null) { car.direction = 0; continue; }
        const request = requests.find(item => item.id === car.activeId);
        const difference = car.target - car.floor;
        car.direction = Math.sign(difference);
        const distance = Math.min(Math.abs(difference), speed * DEMO_STEP);
        car.floor = round2(car.floor + car.direction * distance);
        car.movement = round2(car.movement + distance);
        if (Math.abs(car.floor - car.target) < 0.001) {
          car.floor = car.target;
          car.stops += 1;
          if (car.state === "to-pickup") {
            request.pickupAt = time;
            car.onboardId = request.id;
            car.target = request.destination;
            car.state = "to-dropoff";
          } else {
            request.dropoffAt = time;
            car.onboardId = null;
            car.activeId = null;
            car.target = null;
            car.state = "idle";
            if (method !== "Destination Dispatch" || !car.queue.length) car.destinationBand = null;
          }
        }
      }

      const visibleRequests = requests.map(request => {
        const status = demoRequestStatus(request, cars[request.assignedCar], time);
        const waitUntil = request.pickupAt == null ? time : request.pickupAt;
        return { id: request.id, origin: request.origin, destination: request.destination, appearAt: request.appearAt, assignedCar: request.assignedCar, status, wait: time < request.appearAt ? 0 : round2(Math.max(0, waitUntil - request.appearAt)), decision: request.decision };
      });
      const appeared = visibleRequests.filter(request => request.status !== "not-yet");
      const served = visibleRequests.filter(request => request.status === "served").length;
      const waits = appeared.map(request => request.wait);
      frames.push({ time, cars: cars.map(car => ({ id: car.id, floor: car.floor, direction: car.direction, state: car.state, activeId: car.activeId, onboardId: car.onboardId, queue: [...car.queue], stops: car.stops, movement: car.movement })), requests: visibleRequests, decisions: decisions.filter(item => item.time >= time - .5 && item.time <= time), metrics: { appeared: appeared.length, served, averageWait: waits.length ? round2(waits.reduce((a, b) => a + b, 0) / waits.length) : 0, longestWait: waits.length ? Math.max(...waits) : 0, stops: cars.reduce((sum, car) => sum + car.stops, 0), movement: round2(cars.reduce((sum, car) => sum + car.movement, 0)) } });
    }
    return { method, duration: DEMO_DURATION, step: DEMO_STEP, requests: staticRequests, frames };
  }

  function buildAlgorithmDemo(method) {
    return simulateDemoTimeline(method, DEMO_REQUEST_STREAMS[method]);
  }

  function buildComparisonDemo(leftMethod, rightMethod) {
    return { duration: DEMO_DURATION, left: simulateDemoTimeline(leftMethod, NEUTRAL_DEMO_REQUESTS), right: simulateDemoTimeline(rightMethod, NEUTRAL_DEMO_REQUESTS) };
  }

  const QAWED_SIM = {
    DEFAULTS,
    PARAMETER_FIELDS,
    SCENARIO_PROFILES,
    SCENARIO_QAWED_PRESETS,
    ALGORITHM_NAMES,
    WEIGHT_PLANS,
    qUpdate,
    summarizeSamples,
    evaluateAllAlgorithms,
    evaluateScenarioSuite,
    sceneScoreRows,
    scenarioScoreRankRows,
    calculateCompositeScores,
    TRAFFIC_MODES,
    PARAMETER_ADVICE,
    ADAPTABILITY,
    WEIGHT_PLAN_EXPLANATIONS,
    STATE_DIMENSIONS,
    ALGORITHM_GUIDE,
    LITERATURE_SOURCES,
    QAwedAgent,
    seededRandom,
    withRewardWeights,
    deriveScenarioPreset,
    scenarioConfig,
    buildScenarioConfigs,
    generateEpisodeRequests,
    trainQAwed,
    runQAwedEpisode,
    aggregateScenarioMetrics,
    explainCompositeLeader,
    buildAlgorithmDemo,
    buildComparisonDemo
  };

  if (typeof window !== "undefined") window.QAWED_SIM = QAWED_SIM;
  if (typeof module !== "undefined" && module.exports) module.exports = QAWED_SIM;
}(typeof globalThis !== "undefined" ? globalThis : this));
