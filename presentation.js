"use strict";

const {
  ALGORITHM_NAMES,
  DEFAULTS,
  PARAMETER_FIELDS,
  SCENARIO_QAWED_PRESETS,
  PARAMETER_ADVICE,
  WEIGHT_PLANS,
  WEIGHT_PLAN_EXPLANATIONS,
  STATE_DIMENSIONS,
  ALGORITHM_GUIDE,
  LITERATURE_SOURCES,
  withRewardWeights,
  scenarioConfig,
  buildScenarioConfigs,
  aggregateScenarioMetrics,
  explainCompositeLeader,
  evaluateAllAlgorithms,
  evaluateScenarioSuite,
  sceneScoreRows,
  scenarioScoreRankRows,
  calculateCompositeScores,
  summarizeSamples,
  buildAlgorithmDemo,
  buildComparisonDemo
} = window.QAWED_SIM;
const { getFormulaExplanation } = window.QAWED_FORMULAS;
const PARAMETER_CHARTS = window.QAWED_PARAMETER_CHARTS;

const SCORE_FORMULA = "SceneScore(a,s)=100 × [0.50·WaitScore + 0.15·LongWaitScore + 0.13·EnergyScore + 0.10·LoadScore + 0.08·WaitRankScore + 0.04·TrafficAdaptScore]";
const COMPOSITE_FORMULA = "Composite(a)=0.62·AvgSceneScore(a)+0.20·Stability(a)+0.18·Adaptability(a)";

const PARAMETER_MATH = [
  { key: "floors", symbol: "F", title: "楼层数", group: "规模", formalFormula: "ρF = λF × E[d*(F)] ÷ (M × μF)", plainFormula: "系统负载 = 请求到达率 × 每个请求平均等效工作量 ÷ (电梯数 × 单梯有效工作能力)", variables: "ρF|场景负载率|无单位|公式结果;λF|平均请求率|请求/分钟|场景客流生成器;F|楼层总数|层|场景参数;E[d*(F)]|平均请求工作量|等效楼层/请求|移动与停站日志;M|电梯数量|台|场景参数;μF|单梯有效工作能力|等效楼层/台/分钟|高负载标定", reason: "楼层数不会单独决定难度，负载比能同时考虑请求工作量、电梯数量与实际服务能力。", property: "F 增加通常会扩大接客和载客距离，使 E[d*(F)] 上升；具体速度取决于起点、终点和共享停站分布。", recommended: "研究场景采用 9-16 层；控件允许 5-40 层，并应逐场景检查 ρF。", low: "楼层过少时距离、分区和方向差异不明显。", high: "楼层过多且电梯数不变时 ρF 可能超过 1，所有方法都会拥堵。", assumption: "E[d*(F)] 与 μF 使用同一等效工作口径和时间单位；不能把请求能力与等效楼层能力混用。" },
  { key: "elevators", symbol: "M", title: "电梯数", group: "规模", formalFormula: "ρ = λ × E[S] ÷ M", plainFormula: "每部电梯平均负担 = 总服务工作量 ÷ 同时工作的电梯数", variables: "ρ|单梯负载比|无单位|公式结果;λ|平均请求率|请求/步|场景客流;E[S]|平均服务工作量|步|请求距离与开门时间;M|电梯数量|部|场景参数", reason: "群控本质是并行服务系统，用除以 M 的形式表示多一部电梯如何分担工作。", property: "负载近似按 1/M 下降，前几部电梯收益大，之后边际收益递减。", recommended: "3-4 部用于主要研究场景；控件允许 2-10 部。", low: "M 太小时容量不足，调度差异被供给短缺掩盖。", high: "M 太大时请求几乎立即服务，各算法差异趋近于零。", assumption: "各轿厢速度、容量一致，并能共享全部请求。" },
  { key: "steps", symbol: "T", title: "仿真步数", group: "实验", formalFormula: "Coverage = min(1, T ÷ Tcycle)", plainFormula: "交通周期覆盖率 = 已观察时间 ÷ 一个完整交通周期，最高记为 100%", variables: "Coverage|周期覆盖率|百分比|公式结果;T|每轮仿真长度|步|输入参数;Tcycle|完整交通周期|步|场景定义", reason: "必须先观察完整客流周期，才能比较算法在不同阶段的表现。", property: "覆盖率先线性增加，到 100% 后饱和；继续增加主要减少截尾误差。", recommended: "100-180 步，默认 120。", low: "窗口太短只看到一个交通片段，排名受起始状态影响。", high: "窗口太长重复同一合成周期，耗时增加但新信息有限。", assumption: "时间步长度固定，场景周期边界已在生成器中定义。" },
  { key: "trainEpisodes", symbol: "Nₜ", title: "训练轮数", group: "实验", formalFormula: "Coverage(N) = Nvisited(N) ÷ (54 × 6)", plainFormula: "状态动作覆盖率 = 已实际访问的组合数 ÷ 324 个可能组合", variables: "Coverage|访问覆盖率|百分比|训练记录;Ntrain|训练轮数|轮|输入参数;Nvisited|至少更新一次的组合数|组|Q 学习访问记录;54|可能状态类别数|类|3种交通×3种密度×3种方向×2种繁忙状态;6|权重策略数|种|Q-AWED 方案集合", reason: "直接统计实际访问能够显示哪些状态与权重方案真正获得训练样本。", property: "固定分母下覆盖率随训练轮数单调不下降；接近平台后继续训练主要增加重复访问。", recommended: "120-260 轮，默认 180。", low: "稀有状态 Q 值接近初始值，策略分布不稳定。", high: "超过覆盖平台后主要增加耗时，并可能过度适应合成流量。", assumption: "状态空间按当前四个离散维度固定为54类，动作数固定为6。" },
  { key: "evalEpisodes", symbol: "Nₑ", title: "评估轮数", group: "实验", formalFormula: "SE = s ÷ √Neval; CI95 = mean ± 1.96 × SE", plainFormula: "均值误差 = 样本波动 ÷ 评估次数的平方根；95% 区间 = 平均值 ± 1.96倍误差", variables: "SE|均值标准误|时间步|公式结果;s|样本标准差|时间步|重复评估;Neval|评估轮数|轮|输入参数;mean|样本均值|时间步|重复评估", reason: "研究需要说明均值有多稳定，标准误和置信区间直接量化不确定性。", property: "误差按 1/√N 下降；从 10 增至 40 轮约减半，但继续增加收益越来越小。", recommended: "32-50 轮，且论文结果大于 30 轮。", low: "置信区间宽，少数随机请求可能改变排名。", high: "精度继续提高，但计算成本线性增加而误差只按平方根下降。", assumption: "各评估轮相互独立；明显偏态时还应检查自助法区间。" },
  { key: "seed", symbol: "z", title: "随机种子", group: "实验", formalFormula: "Var(total) = Var(within) + Var(between-seed)", plainFormula: "总波动 = 同一种子内的波动 + 更换随机序列带来的波动", variables: "z|随机种子|整数|输入参数;Var(within)|种子内方差|平方时间步|同种子重复;Var(between-seed)|种子间方差|平方时间步|多种子比较", reason: "种子不是性能旋钮，而是复现实验和拆分随机误差的索引。", property: "种子大小与结果优劣没有单调关系；不同整数只选择不同伪随机序列。", recommended: "固定 2026 用于复现，并用多组种子做稳健性检查。", low: "只用一个种子会低估客流随机性。", high: "更大的整数不会提高随机质量，重要的是使用多少个不同种子。", assumption: "随机发生器和代码版本固定，相同配置与种子产生相同结果。" },
  { key: "longWaitThreshold", symbol: "τ", title: "长等待阈值", group: "服务", formalFormula: "LongWaitRate(τ) = P(W ≥ τ) = 1 - FW(τ)", plainFormula: "长等待比例 = 等待时间超过服务阈值的乘客数 ÷ 全部乘客数", variables: "LongWaitRate|长等待比例|百分比|评估结果;W|单个乘客等待|时间步|仿真记录;τ|长等待阈值|时间步|输入参数;FW|等待累计分布|百分比|评估样本", reason: "平均等待会隐藏极端个案，阈值把分布尾部单独暴露出来。", property: "τ 增加时长等待比例单调下降；它是阈值函数，在乘客等待值处会出现阶跃。", recommended: "普通场景 13-16 步；关键服务与高峰 10-12 步。", low: "正常等待也被判为异常，尾部惩罚主导奖励。", high: "极端等待被掩盖，长等待比例接近零而失去区分力。", assumption: "一个时间步对应的实际时长已说明，阈值来自服务目标。" },
  { key: "learningRate", symbol: "α", title: "学习率", group: "学习", formalFormula: "Qnew = Qold + α(Target - Qold)", plainFormula: "更新后的经验分数 = 原经验分数 + 学习速度 × (本次目标 - 原经验分数)", variables: "Qnew|更新后经验分数|奖励分|Q 表;Qold|更新前经验分数|奖励分|Q 表;α|学习速度|0到1|输入参数;Target|本次学习目标|奖励分|即时奖励与未来价值", reason: "增量更新不必保存全部历史，只需把旧判断向新目标移动一部分。", property: "固定目标下旧经验按 (1-α)^n 指数衰减；α 越大跟随越快，但奖励噪声也保留得更多。", recommended: "0.12-0.24，默认 0.18。", low: "交通模式变化后 Q 值跟随滞后。", high: "单次随机奖励影响过大，Q 值和策略容易震荡。", assumption: "同一状态被重复访问，奖励有噪声但均值具有意义。" },
  { key: "discount", symbol: "γ", title: "折扣因子", group: "学习", formalFormula: "Gt = Σ γ^k × r(t+k); Heff ≈ 1 ÷ (1-γ)", plainFormula: "长期回报 = 当前奖励 + 未来奖励×重视比例 + 更远奖励×重视比例的平方……", variables: "Gt|长期累计回报|奖励分|Q 更新目标;γ|未来重视比例|0到1|输入参数;k|未来距离|步|时间索引;r(t+k)|未来第k步奖励|奖励分|仿真反馈;Heff|有效视野|步|近似公式", reason: "一次派梯会影响后续位置和拥堵，因此不能只看当前乘客。", property: "未来第 k 步权重按 γ^k 指数衰减；γ 接近 1 时有效视野快速增大。", recommended: "0.82-0.94，默认 0.88。", low: "算法近视，可能用当前最优制造后续拥堵。", high: "遥远且不确定的奖励累积，目标方差增加并更难稳定。", assumption: "未来状态与当前动作有关，奖励尺度在时间上保持一致。" },
  { key: "epsilonStart", symbol: "ε₀", title: "初始探索率", group: "学习", formalFormula: "εe = ε0 × d^e; E[explore] = Σ εe", plainFormula: "第e轮尝试新策略的概率 = 初始尝试概率 × 每轮衰减比例的e次方", variables: "εe|第e轮探索概率|百分比|训练过程;ε0|初始探索率|百分比|输入参数;d|每轮保留比例|0.985|程序常量;e|训练轮次|轮|训练循环;E[explore]|预计探索总量|次|概率求和", reason: "先广泛尝试、后集中使用较好策略，能减少过早锁定偶然结果。", property: "探索概率随轮次指数下降；ε0 决定曲线起点，d 决定下降速度。", recommended: "0.25-0.45，默认 0.35。", low: "部分权重策略从未充分尝试，容易过早锁定。", high: "训练后期仍频繁随机选择，回报波动且收敛慢。", assumption: "使用 ε-greedy，正式评估时探索率设为 0。" },
  { key: "waitPenalty", symbol: "λw", title: "等待惩罚", group: "奖励", formalFormula: "PW = λw × W̄", plainFormula: "等待扣分 = 等待权重 × 平均等待时间", variables: "PW|等待项扣分|奖励分|奖励函数;λw|等待权重|奖励分/时间步|输入参数;W̄|平均等待时间|时间步|仿真请求记录", reason: "当前代码直接按平均等待时间线性扣分，使每增加一个等待时间步的边际代价保持为 λw。", property: "其他指标固定时是斜率为 λw 的线性扣分；λw 越大越强调快速接客。", recommended: "1.20-1.90；高峰和关键服务偏高。", low: "算法可能为了节能或少停站容忍明显更长等待。", high: "调度退化为单目标最短等待，能耗和负载均衡失去作用。", assumption: "W̄ 使用仿真时间步；当前代码没有把等待归一化到0至1。" },
  { key: "energyPenalty", symbol: "λe", title: "能耗惩罚", group: "奖励", formalFormula: "PE = λe × Ē", plainFormula: "移动扣分 = 能耗权重 × 每个请求平均移动楼层数", variables: "PE|能耗代理项扣分|奖励分|奖励函数;λe|能耗权重|奖励分/(楼层/请求)|输入参数;Ē|平均移动距离|楼层/请求|接客距离与乘客行程", reason: "用线性边际斜率表达平均多移动一层需要付出的奖励代价。", property: "其他指标固定时是斜率为 λe 的线性扣分；λe 越大越抗拒远距离派梯。", recommended: "0.25-0.70；短途随机与住宅双峰可偏高。", low: "频繁跨楼层空驶，移动代理值升高。", high: "电梯为少移动而延迟乘客，平均和长等待上升。", assumption: "移动楼层数只是能耗代理，不等于真实电机功耗，也没有归一化到0至1。" },
  { key: "longWaitPenalty", symbol: "λl", title: "长等待惩罚", group: "奖励", formalFormula: "PL = λl × L；L = N(Wi ≥ τ) ÷ Npassengers", plainFormula: "长等待扣分 = 长等待权重 × 超过阈值的乘客比例", variables: "PL|长等待项扣分|奖励分|奖励函数;λl|长等待权重|奖励分|输入参数;L|长等待比例|0到1|评估请求;Wi|第i名乘客等待|时间步|仿真记录;τ|长等待阈值|时间步|输入参数", reason: "平均等待可能掩盖少数极端个案，因此对超过阈值的乘客比例增加独立扣分。", property: "当 L 增加时扣分按斜率 λl 线性上升；单个乘客是否进入 L 则由阈值 τ 阶跃决定。", recommended: "4.50-7.50；热点楼层与高峰偏高。", low: "平均值可能改善，但少数乘客仍长期滞留。", high: "为救援单个临界请求频繁打断方向，停站和平均等待增加。", assumption: "τ 已由服务水平确定，L 使用足够数量的乘客请求统计。" }
];

const REPLAY_METHODS = {
  "FCFS": { rule: "按请求到达先后顺序服务，不比较距离和方向。", difficulty: "低", routes: [[0,3,8,9],[0,1,6,0],[0,10,2,7]], metrics: [33,8,15] },
  "Nearest Car": { rule: "把请求交给当前距离与可用时间代价最小的电梯。", difficulty: "低", routes: [[0,3,8,8],[0,1,6,7],[0,10,9,2]], metrics: [22,10,13] },
  "Collective/SCAN": { rule: "保持当前运行方向，完成同向请求后再换向。", difficulty: "中", routes: [[0,3,8,10],[0,1,6,9],[0,2,7,0]], metrics: [20,7,12] },
  "Static Zoning": { rule: "电梯固定负责不同楼层区间，跨区请求增加派梯代价。", difficulty: "中", routes: [[0,3,4,0],[0,6,8,7],[0,9,10,9]], metrics: [25,6,11] },
  "Destination Dispatch": { rule: "提前知道目的楼层，把方向和目的区相近的乘客合并。", difficulty: "高", routes: [[0,3,8,10],[0,1,6,7],[0,9,2,0]], metrics: [17,5,10] },
  "AI/RF/RL Heuristic": { rule: "根据交通模式和繁忙程度，在预设启发式策略间切换。", difficulty: "高", routes: [[0,3,8,9],[0,1,7,10],[0,6,2,0]], metrics: [16,6,10] }
};

let latestSuite = null;
let latestAgent = null;
let selectedScenario = "overall";
let selectedParameter = "learningRate";
let selectedReplay = "FCFS";
let comparisonReplay = "Nearest Car";
let demoMode = "feature";
let demoTime = 0;
let replayFrame = 0;
let replayAnimationId = null;
let replayLastTick = 0;
let replayPaused = false;
let demoData = null;
let comparisonData = null;
let formulaReturnFocus = null;

function fmt(value, decimals = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(decimals) : "-";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function renderExplanationList(items, ordered = false) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

function renderFormulaExplanation(record) {
  const variableRows = record.variables.map(item => `<tr><td data-label="符号"><strong>${escapeHtml(item.symbol)}</strong></td><td data-label="名称">${escapeHtml(item.name)}</td><td data-label="意义">${escapeHtml(item.meaning)}</td><td data-label="量纲/单位">${escapeHtml(item.unit)}</td><td data-label="数据来源">${escapeHtml(item.source)}</td><td data-label="计算方法">${escapeHtml(item.calculation)}</td></tr>`).join("");
  const levelLabels = ["过低", "适中", "过高"];
  const stateRows = record.lowNormalHigh.map((item, index) => `<div class="formula-state formula-state-${index}"><strong>${levelLabels[index] || `情况 ${index + 1}`}</strong><p>${escapeHtml(item)}</p></div>`).join("");
  return `
    <section class="formula-hero-panel">
      <p class="formula-purpose-label">这个公式解决什么问题</p>
      <p class="formula-purpose">${escapeHtml(record.purpose)}</p>
      <div class="formula-pair">
        <div><span>学术公式</span><code>${escapeHtml(record.formalFormula)}</code></div>
        <div><span>通俗说法</span><p>${escapeHtml(record.plainFormula)}</p></div>
      </div>
    </section>
    <section class="formula-detail-section formula-derivation">
      <p class="section-kicker">01 · 从问题到数学</p>
      <h3>公式如何一步步得到</h3>
      ${renderExplanationList(record.derivationSteps, true)}
    </section>
    <section class="formula-detail-section">
      <p class="section-kicker">02 · 每个符号都从哪里来</p>
      <h3>完整变量来源</h3>
      <p class="section-intro">这里的变量不是孤立字母。每一个量都说明含义、单位、程序来源，以及真正代入前怎样计算。</p>
      <div class="formula-table-wrap"><table class="formula-variable-table"><thead><tr><th>符号</th><th>名称</th><th>意义</th><th>量纲/单位</th><th>数据来源</th><th>计算方法</th></tr></thead><tbody>${variableRows}</tbody></table></div>
    </section>
    <section class="formula-detail-section formula-subformulas">
      <p class="section-kicker">03 · 不省略中间过程</p>
      <h3>变量内部用到的计算式</h3>
      ${renderExplanationList(record.subFormulas)}
    </section>
    <div class="formula-two-column">
      <section class="formula-detail-section">
        <p class="section-kicker">04 · 单位能否对上</p>
        <h3>量纲检查</h3>
        ${renderExplanationList(record.dimensionCheck)}
      </section>
      <section class="formula-detail-section">
        <p class="section-kicker">05 · 数字从哪里进入</p>
        <h3>仿真数据怎样进入公式</h3>
        ${renderExplanationList(record.dataPipeline, true)}
      </section>
    </div>
    <section class="formula-detail-section formula-example">
      <p class="section-kicker">06 · 跟着数字算一次</p>
      <h3>代入一个完整例子</h3>
      ${renderExplanationList(record.workedExample, true)}
    </section>
    <div class="formula-two-column">
      <section class="formula-detail-section">
        <p class="section-kicker">07 · 曲线为什么这样变化</p>
        <h3>函数性质</h3>
        ${renderExplanationList(record.functionProperties)}
      </section>
      <section class="formula-detail-section">
        <p class="section-kicker">08 · 推荐数字的依据</p>
        <h3>推荐范围怎样确定</h3>
        ${renderExplanationList(record.rangeReasoning)}
      </section>
    </div>
    <section class="formula-detail-section">
      <p class="section-kicker">09 · 数值改变会发生什么</p>
      <h3>过低、适中、过高</h3>
      <div class="formula-state-grid">${stateRows}</div>
    </section>
    <section class="formula-detail-section formula-assumptions">
      <p class="section-kicker">10 · 不能省略的研究边界</p>
      <h3>成立条件与限制</h3>
      ${renderExplanationList(record.assumptions)}
      <p class="evidence-note"><strong>公式性质：</strong>${escapeHtml(record.evidenceLevel)}。公式的理论地位决定它能证明到什么程度，不能把建模假设写成普适定理。</p>
    </section>`;
}

function closeFormulaExplanation() {
  const dialog = document.getElementById("formulaExplainer");
  if (dialog.open) dialog.close();
  document.body.classList.remove("formula-open");
  if (formulaReturnFocus && document.contains(formulaReturnFocus)) formulaReturnFocus.focus();
  formulaReturnFocus = null;
}

function openFormulaExplanation(id, trigger = document.activeElement) {
  const record = getFormulaExplanation(id);
  if (!record) return;
  const dialog = document.getElementById("formulaExplainer");
  formulaReturnFocus = trigger;
  document.getElementById("formulaExplainerMeta").textContent = `${record.category} · ${record.evidenceLevel}`;
  document.getElementById("formulaExplainerTitle").textContent = record.title;
  document.getElementById("formulaExplainerBody").innerHTML = renderFormulaExplanation(record);
  document.body.classList.add("formula-open");
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  document.getElementById("closeFormulaExplainer").focus();
}

function initFormulaExplainer() {
  const dialog = document.getElementById("formulaExplainer");
  document.addEventListener("click", event => {
    const entry = event.target.closest("[data-formula-id]");
    if (entry) openFormulaExplanation(entry.dataset.formulaId, entry);
  });
  document.getElementById("closeFormulaExplainer").addEventListener("click", closeFormulaExplanation);
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeFormulaExplanation(); });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeFormulaExplanation();
  });
}

function initTalkNavigation() {
  const sections = [...document.querySelectorAll(".talk-section")];
  const links = [...document.querySelectorAll(".talk-directory nav a")];
  const progress = document.getElementById("talkProgress");
  const updateProgress = () => {
    const root = document.documentElement;
    const max = Math.max(1, root.scrollHeight - root.clientHeight);
    progress.style.width = `${Math.min(100, window.scrollY / max * 100)}%`;
  };
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach(link => link.setAttribute("aria-current", String(link.hash === `#${visible.target.id}`)));
  }, { rootMargin: "-18% 0px -55%", threshold: [0, .2, .55] });
  sections.forEach(section => observer.observe(section));
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();
}

function switchView(view) {
  document.getElementById(view === "intro" ? "research" : "evidence").scrollIntoView({ behavior: "smooth" });
}

function renderAlgorithmGuide() {
  const selector = document.getElementById("algorithmSelector");
  selector.innerHTML = Object.keys(REPLAY_METHODS).map((name, index) => `<button type="button" role="tab" data-method="${escapeHtml(name)}" class="${name === selectedReplay ? "active" : ""}" aria-selected="${name === selectedReplay}">${index + 1}. ${escapeHtml(name)}</button>`).join("");
  selector.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    selectedReplay = button.dataset.method;
    renderAlgorithmGuide();
    loadReplayData();
  }));

  const comparisonSelector = document.getElementById("comparisonAlgorithm");
  comparisonSelector.innerHTML = Object.keys(REPLAY_METHODS).map(name => `<option value="${escapeHtml(name)}" ${name === comparisonReplay ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");

  const body = document.getElementById("algorithmTableBody");
  body.innerHTML = ALGORITHM_GUIDE.map(item => {
    const demo = REPLAY_METHODS[item.name] || { rule: "根据状态选择动态权重，再由加权代价完成派梯。", difficulty: "高" };
    return `<tr class="${item.name === "Q-AWED" ? "qawed-row" : ""}"><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(demo.rule)}</td><td>${escapeHtml(item.pros)}</td><td>${escapeHtml(item.cons)}</td><td>${escapeHtml(item.scenes.join("、"))}</td><td>${demo.difficulty}</td></tr>`;
  }).join("");
  renderReplayNarrative();
}

function renderReplayNarrative() {
  const guide = ALGORITHM_GUIDE.find(item => item.name === selectedReplay);
  const demo = REPLAY_METHODS[selectedReplay];
  document.getElementById("algorithmNarrative").innerHTML = `
    <span class="method-number">CONTINUOUS DEMO · 16 秒 · ${Object.keys(REPLAY_METHODS).indexOf(selectedReplay) + 1}/6</span>
    <h3>${escapeHtml(selectedReplay)}</h3>
    <p class="method-rule">${escapeHtml(demo.rule)}</p>
    <p id="demoDecision" class="demo-decision">等待首个请求出现。</p>
    <div class="pro-con"><div class="pro"><strong>优点</strong>${escapeHtml(guide.pros)}</div><div class="con"><strong>限制</strong>${escapeHtml(guide.cons)}</div></div>
    <div class="demo-metrics"><div><strong id="demoMetricWait">0.0</strong><span>平均等待</span></div><div><strong id="demoMetricLongest">0.0</strong><span>当前最长等待</span></div><div><strong id="demoMetricServed">0</strong><span>已服务人数</span></div><div><strong id="demoMetricStops">0</strong><span>停站次数</span></div><div><strong id="demoMetricMovement">0.0</strong><span>移动楼层</span></div></div>`;
}

function buildAlgorithmStage() {
  const grid = document.getElementById("floorGrid");
  grid.innerHTML = Array.from({ length: 12 }, (_, index) => `<span class="floor-label" style="bottom:${index / 11 * 100}%">${index + 1}F</span>`).join("");
  const shafts = document.getElementById("elevatorShafts");
  shafts.innerHTML = [0,1,2].map(index => `<div class="shaft"><i class="elevator-car" data-car="${index}">E${index + 1}</i></div>`).join("");
}

function currentDemoFrame(data, time) {
  return data.frames[Math.min(data.frames.length - 1, Math.max(0, Math.round(time / data.step)))];
}

function renderElevatorCars(cars) {
  document.querySelectorAll(".elevator-car").forEach((car, index) => {
    const state = cars[index];
    car.style.bottom = `${state.floor / 11 * 100}%`;
    car.classList.toggle("assigned", state.state !== "idle");
    car.textContent = `E${index + 1} ${state.direction > 0 ? "↑" : state.direction < 0 ? "↓" : "·"}`;
  });
}

function renderPassengerMarkers(requests) {
  const visible = requests.filter(request => request.status !== "not-yet" && request.status !== "served");
  document.getElementById("passengerLayer").innerHTML = visible.map(request => `<div class="passenger ${request.status}" style="bottom:${request.origin / 11 * 100}%"><b>${request.id}</b> ${request.origin + 1}F→${request.destination + 1}F <em>${fmt(request.wait,1)}s</em></div>`).join("");
}

function renderReplayCounters(frame) {
  document.getElementById("stageClock").textContent = `${fmt(frame.time,1)} / 16 秒`;
  document.getElementById("algorithmTimeline").value = frame.time;
  document.getElementById("algorithmTimeOutput").textContent = `${fmt(frame.time,1)} 秒`;
  const metrics = frame.metrics;
  const values = { demoMetricWait: metrics.averageWait, demoMetricLongest: metrics.longestWait, demoMetricServed: metrics.served, demoMetricStops: metrics.stops, demoMetricMovement: metrics.movement };
  Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = id === "demoMetricServed" || id === "demoMetricStops" ? String(value) : fmt(value,1); });
  const latestDecision = frame.decisions[frame.decisions.length - 1];
  document.getElementById("demoDecision").textContent = latestDecision ? `${latestDecision.requestId} → E${latestDecision.carId + 1}：${latestDecision.reason}` : frame.time < .4 ? "等待首个请求出现。" : "电梯沿当前计划连续运行。";
}

function renderMiniStage(containerId, frame, method) {
  const container = document.getElementById(containerId);
  const cars = frame.cars.map(car => `<i class="mini-car ${car.state !== "idle" ? "active" : ""}" style="left:${12 + car.id * 28}%;bottom:${car.floor / 11 * 100}%">E${car.id + 1}</i>`).join("");
  const passengers = frame.requests.filter(request => request.status !== "not-yet" && request.status !== "served").map(request => `<span class="mini-passenger ${request.status}" style="bottom:${request.origin / 11 * 100}%">${request.id}</span>`).join("");
  container.innerHTML = `<div class="mini-floor-lines"></div>${cars}${passengers}<small>${escapeHtml(method)}</small>`;
}

function renderComparisonFrame(time) {
  const leftFrame = currentDemoFrame(comparisonData.left, time);
  const rightFrame = currentDemoFrame(comparisonData.right, time);
  renderMiniStage("comparisonLeftStage", leftFrame, selectedReplay);
  renderMiniStage("comparisonRightStage", rightFrame, comparisonReplay);
  document.getElementById("comparisonLeftName").textContent = selectedReplay;
  document.getElementById("comparisonRightName").textContent = comparisonReplay;
  const metricText = frame => `等待 ${fmt(frame.metrics.averageWait,1)} · 最长 ${fmt(frame.metrics.longestWait,1)} · 服务 ${frame.metrics.served} · 停站 ${frame.metrics.stops} · 移动 ${fmt(frame.metrics.movement,1)}`;
  document.getElementById("comparisonLeftMetrics").textContent = metricText(leftFrame);
  document.getElementById("comparisonRightMetrics").textContent = metricText(rightFrame);
  document.getElementById("stageClock").textContent = `${fmt(time,1)} / 16 秒`;
  document.getElementById("algorithmTimeline").value = time;
  document.getElementById("algorithmTimeOutput").textContent = `${fmt(time,1)} 秒`;
}

function renderReplayFrame(time = demoTime) {
  replayFrame = Math.round(time * 10);
  if (demoMode === "comparison") { renderComparisonFrame(time); return; }
  const frame = currentDemoFrame(demoData, time);
  renderElevatorCars(frame.cars);
  renderPassengerMarkers(frame.requests);
  renderReplayCounters(frame);
}

function loadReplayData() {
  demoData = buildAlgorithmDemo(selectedReplay);
  comparisonData = buildComparisonDemo(selectedReplay, comparisonReplay);
  demoTime = 0;
  replayFrame = 0;
  replayPaused = false;
  replayLastTick = performance.now();
  document.getElementById("pauseAlgorithm").textContent = "Ⅱ";
  document.getElementById("featureStage").hidden = demoMode !== "feature";
  document.getElementById("comparisonStage").hidden = demoMode !== "comparison";
  document.getElementById("comparisonSelectorWrap").hidden = demoMode !== "comparison";
  document.querySelectorAll("#demoMode button").forEach(button => button.classList.toggle("active", button.dataset.demoMode === demoMode));
  renderReplayNarrative();
  renderReplayFrame(0);
}

function replayLoop(now) {
  if (!replayPaused) {
    const delta = Math.min(.1, Math.max(0, (now - replayLastTick) / 1000));
    demoTime = Math.min(16, demoTime + delta);
    if (demoTime >= 16) { replayPaused = true; document.getElementById("pauseAlgorithm").textContent = "▶"; }
  }
  replayLastTick = now;
  const nextFrame = Math.round(demoTime * 10);
  if (nextFrame !== replayFrame || demoTime === 0) renderReplayFrame(demoTime);
  replayAnimationId = window.requestAnimationFrame(replayLoop);
}

function startReplay() {
  replayPaused = false;
  replayLastTick = performance.now();
  document.getElementById("pauseAlgorithm").textContent = "Ⅱ";
  if (!replayAnimationId) replayAnimationId = window.requestAnimationFrame(replayLoop);
}

function renderLiteratureGuide() {
  document.getElementById("literatureGuide").innerHTML = LITERATURE_SOURCES.map(item => `<article class="source-card"><small>${escapeHtml(item.method)}</small><h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3><p><strong>适合复刻：</strong>${escapeHtml(item.use)}</p><p><strong>边界：</strong>${escapeHtml(item.boundary)}</p></article>`).join("");
}

function renderPolicyExplanation() {
  document.getElementById("policyStateExplanation").innerHTML = STATE_DIMENSIONS.map(item => `<div class="state-card"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join("");
  document.getElementById("policyPlanGuide").innerHTML = WEIGHT_PLANS.map(plan => `<div class="policy-chip"><strong>${escapeHtml(plan.name)}</strong><span>${escapeHtml(WEIGHT_PLAN_EXPLANATIONS[plan.name])}</span></div>`).join("");
}

function renderDecisionFlowAnimation() {
  const nodes = [...document.querySelectorAll("#qawedDecisionFlow > div")];
  let index = 0;
  window.setInterval(() => {
    nodes.forEach((node, nodeIndex) => node.classList.toggle("active", nodeIndex === index));
    index = (index + 1) % nodes.length;
  }, 1200);
}

function learningRateFacts(alpha) {
  return { halfLife: Math.log(.5) / Math.log(1 - alpha), updatesTo90: Math.ceil(Math.log(.1) / Math.log(1 - alpha)), targetShareAt10: 1 - (1 - alpha) ** 10 };
}

function discountFacts(gamma) {
  return { effectiveHorizon: 1 / (1 - gamma), step10Weight: gamma ** 10 };
}

function getParameterMeta(key) {
  return PARAMETER_MATH.find(item => item.key === key) || PARAMETER_MATH[0];
}

function parameterValue(key) {
  const input = document.getElementById(key);
  return input ? Number(input.value) : Number(DEFAULTS[key] || 0);
}

function renderParameterWorkbench() {
  const list = document.getElementById("parameterList");
  list.innerHTML = PARAMETER_MATH.map(item => `<button type="button" data-key="${item.key}" class="${item.key === selectedParameter ? "active" : ""}"><span>${item.symbol}</span><strong>${item.title}</strong><small>${item.group}</small></button>`).join("");
  list.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    selectedParameter = button.dataset.key;
    renderParameterWorkbench();
  }));
  renderSelectedParameter();
  document.getElementById("parameterTableBody").innerHTML = PARAMETER_MATH.map(item => `<tr><td><strong>${item.symbol} · ${item.title}</strong></td><td><button type="button" class="formula-table-entry formula-entry" data-formula-id="${item.key}" aria-label="查看${item.title}公式的完整推导"><strong>学术：</strong>${item.formalFormula}<small>查看完整推导</small></button><span class="formula-table-plain"><strong>通俗：</strong>${item.plainFormula}</span></td><td>${item.recommended}</td><td>${item.reason}<br>${item.property}</td><td>${item.low}</td><td>${item.high}</td><td>${item.assumption}</td></tr>`).join("");
}

function parameterVariableRows(item) {
  return item.variables.split(";").map(entry => {
    const [symbol, name, unit, source] = entry.split("|");
    return { symbol, name, unit, source };
  });
}

function parameterSubstitutionText(item, value) {
  if (item.key === "learningRate") return `假设原经验分数 Qold=20，本次目标 Target=10：Qnew = 20 + ${fmt(value,2)}×(10-20) = ${fmt(20 + value * (10 - 20),2)}。`;
  if (item.key === "discount") return `当前 γ=${fmt(value,2)}：第10步奖励权重 γ^10=${fmt(value ** 10,3)}，有效视野约 1÷(1-γ)=${fmt(1/(1-value),1)} 步。`;
  if (item.key === "epsilonStart") return `当前 ε0=${fmt(value,2)}：第100轮探索概率 = ${fmt(value,2)}×0.985^100 = ${fmt(value*.985**100,3)}。`;
  if (item.key === "evalEpisodes") return `若样本标准差 s=10，Neval=${Math.round(value)}：SE=10÷√${Math.round(value)}=${fmt(10/Math.sqrt(value),2)}，95%区间半宽=${fmt(1.96*10/Math.sqrt(value),2)}。`;
  if (item.key === "trainEpisodes") {
    const history = currentCoverageHistory();
    const latest = history[history.length - 1];
    return latest ? `当前训练记录访问了 ${latest.visited}/324 个状态动作组合，实际覆盖率为 ${fmt(latest.coverage * 100,1)}%。修改轮数后需重新运行仿真才能获得新覆盖曲线。` : "覆盖率将在运行仿真时按已访问状态动作组合数 ÷ 324 实际统计。";
  }
  if (item.key === "floors" || item.key === "elevators") return `当前 F=${parameterValue("floors")} 层、M=${parameterValue("elevators")} 台。楼层通过平均等效工作量 E[d*(F)] 影响需求，电梯数量通过 M×μF 形成并行能力。`;
  if (item.key === "longWaitThreshold") return `当前 τ=${Math.round(value)}：等待达到 ${Math.round(value)} 个时间步的请求开始计入长等待比例。`;
  if (item.key === "seed") return `当前 z=${Math.round(value)}。它只选择一条可复现随机序列，不参与“越大越好”的优化。`;
  if (item.key === "waitPenalty") return `当前 λw=${fmt(value,2)}：平均等待10步时扣 ${fmt(value*10,2)} 分，20步时扣 ${fmt(value*20,2)} 分。`;
  if (item.key === "energyPenalty") return `当前 λe=${fmt(value,2)}：平均移动5层/请求时扣 ${fmt(value*5,2)} 分，10层/请求时扣 ${fmt(value*10,2)} 分。`;
  if (item.key === "longWaitPenalty") return `当前 λl=${fmt(value,2)}：长等待比例25%时扣 ${fmt(value*.25,2)} 分，50%时扣 ${fmt(value*.5,2)} 分。`;
  return `将当前值 ${fmt(value,2)} 代入：${item.plainFormula}`;
}

function renderParameterStateVisuals(item) {
  const states = [
    { key: "low", label: "过低", text: item.low, level: 24 },
    { key: "recommended", label: "推荐区间", text: "响应速度、稳定性和计算成本之间的折中区域。", level: 58 },
    { key: "high", label: "过高", text: item.high, level: 90 }
  ];
  document.getElementById("parameterStateVisuals").innerHTML = states.map(state => `<article class="parameter-state ${state.key}"><span>${state.label}</span><div class="state-sketch"><i style="--level:${state.level}%"></i><b></b><b></b><b></b></div><p>${state.text}</p></article>`).join("");
}

function currentCoverageHistory() {
  if (!latestSuite) return [];
  if (selectedScenario !== "overall") return selectedScenarioItem()?.agent?.coverageHistory || [];
  return latestAgent?.coverageHistory || latestSuite.scenarios[0]?.agent?.coverageHistory || [];
}

function renderSpecialParameterCharts(item, current) {
  const specialized = PARAMETER_CHARTS.SPECIAL_PARAMETER_KEYS.includes(item.key);
  const genericCanvas = document.getElementById("parameterCurve");
  const region = document.getElementById("specialParameterCharts");
  genericCanvas.hidden = specialized;
  region.hidden = !specialized;
  if (!specialized) return false;

  const model = PARAMETER_CHARTS.buildParameterChartModel(item.key, current, currentCoverageHistory());
  document.getElementById("specialChartFormula").textContent = model.formula;
  const coveragePanel = document.getElementById("coverageChartPanel");
  const boundaryPair = document.getElementById("boundaryChartPair");
  coveragePanel.hidden = model.layout !== "single";
  boundaryPair.hidden = model.layout !== "dual";

  if (model.layout === "single") {
    PARAMETER_CHARTS.drawCoverageChart(document.getElementById("coverageChart"), model);
    document.getElementById("coverageChartExplanation").textContent = `${model.explanation} 横坐标表示完成的训练轮数，纵坐标表示324个可能组合中至少被更新一次的比例。`;
  } else {
    PARAMETER_CHARTS.drawBoundaryChart(document.getElementById("lowerBoundaryChart"), { ...model.lower, xLabel: model.xLabel, yLabel: model.yLabel });
    PARAMETER_CHARTS.drawBoundaryChart(document.getElementById("upperBoundaryChart"), { ...model.upper, xLabel: model.xLabel, yLabel: model.yLabel });
    document.getElementById("lowerBoundaryExplanation").textContent = model.lower.explanation;
    document.getElementById("upperBoundaryExplanation").textContent = model.upper.explanation;
  }
  document.getElementById("boundaryChartSummary").innerHTML = model.summary.map(fact => `<span class="fact">${escapeHtml(fact.label)}<strong>${escapeHtml(fact.value)}</strong></span>`).join("");
  return true;
}

function renderSelectedParameter() {
  const item = getParameterMeta(selectedParameter);
  const current = parameterValue(item.key);
  document.getElementById("parameterSymbol").textContent = item.symbol;
  document.getElementById("parameterTitle").textContent = item.title;
  document.getElementById("parameterMeaning").textContent = `${item.title}决定模型中的一个可观察尺度或学习偏好。下面两条公式表达同一关系：第一条用于论文，第二条用于没有阅读代码的观众。`;
  const formulaButton = document.getElementById("parameterFormula");
  formulaButton.textContent = `${item.formalFormula}  ·  点击查看完整推导`;
  formulaButton.dataset.formulaId = item.key;
  formulaButton.setAttribute("aria-label", `查看${item.title}公式的完整推导`);
  document.getElementById("parameterPlainFormula").textContent = item.plainFormula;
  document.getElementById("parameterSubstitution").textContent = parameterSubstitutionText(item, current);
  document.getElementById("parameterVariableTable").innerHTML = parameterVariableRows(item).map(row => `<tr><td><strong>${row.symbol}</strong></td><td>${row.name}</td><td>${row.unit}</td><td>${row.source}</td></tr>`).join("");
  document.getElementById("parameterRecommendation").textContent = item.recommended;
  document.getElementById("parameterReason").textContent = item.reason;
  document.getElementById("parameterProperty").textContent = item.property;
  document.getElementById("parameterLow").textContent = item.low;
  document.getElementById("parameterHigh").textContent = item.high;
  document.getElementById("parameterAssumption").textContent = item.assumption;
  const preview = document.getElementById("parameterPreviewValue");
  preview.value = Number.isFinite(current) ? current : 0;
  preview.step = document.getElementById(item.key)?.step || "1";
  renderParameterFacts(item, current);
  renderParameterStateVisuals(item);
  if (!renderSpecialParameterCharts(item, current)) drawParameterCurve(document.getElementById("parameterCurve"), item, current);
}

function renderParameterFacts(item, value) {
  let facts = [];
  if (item.key === "learningRate") {
    const result = learningRateFacts(value);
    facts = [["旧经验半衰期", `${fmt(result.halfLife,1)} 次`], ["吸收 90%", `${result.updatesTo90} 次`], ["10 次后新目标", `${fmt(result.targetShareAt10 * 100,1)}%`]];
  } else if (item.key === "discount") {
    const result = discountFacts(value);
    facts = [["有效视野", `${fmt(result.effectiveHorizon,1)} 步`], ["第 10 步权重", fmt(result.step10Weight,3)]];
  } else if (item.key === "epsilonStart") {
    const expected = Array.from({length: Number(DEFAULTS.trainEpisodes)}, (_, i) => value * .985 ** i).reduce((a,b) => a+b,0);
    facts = [["首轮探索概率", `${fmt(value*100,1)}%`], ["180 轮概率总和", fmt(expected,1)], ["第 100 轮", `${fmt(value * .985 ** 100 * 100,1)}%`]];
  } else if (item.key === "evalEpisodes") {
    facts = [["相对标准误", fmt(1 / Math.sqrt(Math.max(1,value)),3)], ["相较 10 轮", `${fmt(Math.sqrt(10 / Math.max(1,value))*100,1)}%`]];
  } else if (item.key === "seed") {
    facts = [["当前种子", String(Math.round(value))], ["可复现", "相同配置 = 相同结果"], ["优化意义", "无" ]];
  } else {
    facts = [["当前值", fmt(value,2)], ["参数类别", item.group], ["检查方法", "敏感性曲线 + 多种子"]];
  }
  document.getElementById("parameterLiveFacts").innerHTML = facts.map(([label, fact]) => `<span class="fact">${label}：<strong>${fact}</strong></span>`).join("");
}

function recommendedBounds(item) {
  const match = item.recommended.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function drawParameterCurve(canvas, item, value) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 64, right: 28, top: 32, bottom: 70 };
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle = "#fbfcfc"; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = "#d6dee1"; ctx.lineWidth = 1;
  for (let i=0;i<=4;i+=1) { const y=pad.top+(height-pad.top-pad.bottom)*i/4; ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(width-pad.right,y);ctx.stroke(); }
  const points = [];
  const count = 48;
  for (let i=0;i<count;i+=1) {
    const x = i/(count-1);
    let y;
    if (item.key === "learningRate") y = 1 - (1 - Math.min(.95,Math.max(.001,value))) ** (x*20);
    else if (item.key === "discount") y = Math.min(.99,Math.max(.01,value)) ** (x*20);
    else if (item.key === "epsilonStart") y = Math.min(1,value * .985 ** (x*200));
    else if (item.key === "evalEpisodes" || item.key === "trainEpisodes") y = 1 / Math.sqrt(2 + x*198);
    else if (item.key === "floors") y = (5 + x*35) / Math.max(2,parameterValue("elevators")) / 20;
    else if (item.key === "elevators") y = parameterValue("floors") / (2 + x*8) / 8;
    else if (item.key === "steps") y = 1 - Math.exp(-(45+x*255)/120);
    else if (item.key === "seed") y = .25 + .55 * Math.abs(Math.sin((value+i*7919)*.017));
    else if (item.key === "longWaitThreshold") y = Math.exp(-(4+x*36)/Math.max(5,value));
    else y = Math.min(1, x * Math.max(.1,value) / Math.max(1,value));
    points.push([pad.left+x*(width-pad.left-pad.right), pad.top+(1-Math.min(1,Math.max(0,y)))*(height-pad.top-pad.bottom)]);
  }
  ctx.strokeStyle = "#087f72"; ctx.lineWidth = 4; ctx.beginPath(); points.forEach(([x,y],i)=> i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.stroke();
  ctx.fillStyle = "#17242b"; ctx.font = "14px Arial"; ctx.fillText(`${item.symbol} = ${fmt(value,2)}`,pad.left,pad.top-10);
  ctx.fillStyle = "#5f6c73"; ctx.font = "12px Arial"; ctx.fillText("函数输入 / 更新次数", width/2-55,height-42);
  ctx.save(); ctx.translate(18,height/2+32); ctx.rotate(-Math.PI/2); ctx.fillText("相对影响（0-1）",0,0); ctx.restore();
  const input = document.getElementById(item.key);
  const min = Number(input?.min || 0);
  const max = Number(input?.max || Math.max(1, value));
  const rangeWidth = width - pad.left - pad.right;
  const mapX = current => pad.left + (clampVisual(current, min, max) - min) / Math.max(.0001, max - min) * rangeWidth;
  ctx.fillStyle = "#dfe6e7"; ctx.fillRect(pad.left, height - 25, rangeWidth, 8);
  const bounds = recommendedBounds(item);
  if (bounds) { ctx.fillStyle = "#8fd2c9"; ctx.fillRect(mapX(bounds[0]), height - 25, Math.max(3, mapX(bounds[1]) - mapX(bounds[0])), 8); }
  ctx.fillStyle = "#b83a42"; ctx.fillRect(mapX(value) - 2, height - 30, 4, 18);
  ctx.fillStyle = "#5f6c73"; ctx.font = "10px Arial"; ctx.fillText(`控件范围 ${min}–${max}`, pad.left, height - 6);
}

function clampVisual(value, min, max) { return Math.max(min, Math.min(max, value)); }

function readConfig() {
  const values = Object.fromEntries(PARAMETER_FIELDS.map(id => [id, Number(document.getElementById(id).value)]));
  const invalid = PARAMETER_FIELDS.find(id => !Number.isFinite(values[id]));
  if (invalid) throw new Error(`${getParameterMeta(invalid).title}不是有效数字。`);
  if (values.evalEpisodes < 30) throw new Error("评估轮数必须至少为 30。 ");
  return withRewardWeights({ ...values, epsilonDecay: .985, doorTime: 1, scenarioKind: selectedScenario === "overall" ? "office" : selectedScenario });
}

function applyScenarioConfigToInputs(config) {
  PARAMETER_FIELDS.forEach(id => {
    const input = document.getElementById(id);
    if (input && Number.isFinite(config[id])) input.value = config[id];
  });
  syncRangeValues();
  renderSelectedParameter();
}

function syncRangeValues() {
  document.querySelectorAll("input[type='range']").forEach(input => {
    const output = document.querySelector(`[data-for="${input.id}"]`);
    if (output) output.textContent = Number(input.value).toFixed(input.step.includes(".") ? 2 : 0);
  });
}

function renderScenarioTabs() {
  if (!latestSuite) return;
  const tabs = document.getElementById("scenarioTabs");
  const items = [{key:"overall",name:"综合"}, ...latestSuite.scenarios.map(item => ({key:item.key,name:item.name}))];
  tabs.innerHTML = items.map(item => `<button type="button" data-scenario="${item.key}" class="${item.key===selectedScenario?"active":""}">${item.name}</button>`).join("");
  tabs.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    selectedScenario = button.dataset.scenario;
    renderEvidence();
    renderScenarioParameterPanel();
    renderSelectedParameter();
  }));
}

function selectedScenarioItem() {
  return latestSuite?.scenarios.find(item => item.key === selectedScenario) || null;
}

function overallRankRows() {
  if (!latestSuite) return [];
  const ranksByScene = latestSuite.scenarios.map(scene => scenarioScoreRankRows(scene.results));
  return ALGORITHM_NAMES.map(name => {
    const metrics = aggregateScenarioMetrics(latestSuite.scenarios,name);
    const waits = latestSuite.scenarios.flatMap(scene => scene.results[name].episodeMeasurements.map(episode => episode.averageWait));
    const waitStatistics = summarizeSamples(waits);
    const ranks = ranksByScene.map(rows => rows.find(row => row.name===name).scoreRank);
    const averageRank = ranks.reduce((a,b)=>a+b,0)/ranks.length;
    const rankSd = Math.sqrt(ranks.reduce((sum,rank)=>sum+(rank-averageRank)**2,0)/ranks.length);
    return { name, metrics: { ...metrics, averageWait: waitStatistics.mean, statistics: { averageWait: waitStatistics } }, averageRank, worstRank: Math.max(...ranks), rankSd, firstCount: ranks.filter(rank=>rank===1).length, ...latestSuite.composite[name], sceneScore: latestSuite.composite[name].composite, scoreRank:0, waitRank:0 };
  }).sort((a,b)=>b.composite-a.composite).map((row,index)=>({...row,scoreRank:index+1}));
}

function currentRankRows() {
  return selectedScenario === "overall" ? overallRankRows() : scenarioScoreRankRows(selectedScenarioItem().results);
}

function renderScenarioTable() {
  if (!latestSuite) return;
  const rows = currentRankRows();
  document.getElementById("scenarioTitle").textContent = selectedScenario === "overall" ? "跨场景结果与综合评分" : `${selectedScenarioItem().name}：等待与场景评分`;
  document.getElementById("scenarioResultsBody").innerHTML = rows.map(row => {
    const m = row.metrics;
    const stats = m.statistics?.averageWait || {standardDeviation:0,ci95:0};
    const waitRank = selectedScenario === "overall" ? "跨场景" : row.waitRank;
    return `<tr class="${row.name==="Q-AWED"?"qawed-row":""}"><td><strong>${row.name}</strong></td><td>${fmt(m.averageWait)}</td><td>${fmt(stats.standardDeviation)}</td><td>±${fmt(stats.ci95)}</td><td>${fmt(m.longWaitRate*100,1)}%</td><td>${fmt(m.averageStops)}</td><td>${fmt(m.energyProxy)}</td><td>${fmt(m.loadImbalance)}</td><td>${waitRank}</td><td>${row.scoreRank}</td><td>${fmt(row.sceneScore)}</td></tr>`;
  }).join("");
}

function renderScenarioOverview() {
  if (!latestSuite) return;
  document.getElementById("scenarioOverviewHead").innerHTML = `<tr><th>算法</th>${latestSuite.scenarios.map(scene=>`<th>${scene.name}</th>`).join("")}<th>平均排名</th><th>最差排名</th><th>排名波动</th><th>第一场景数</th><th>综合评分</th></tr>`;
  const rows = overallRankRows();
  document.getElementById("resultsBody").innerHTML = rows.map(row => `<tr class="${row.name==="Q-AWED"?"qawed-row":""}"><td><strong>${row.name}</strong></td>${latestSuite.scenarios.map(scene=>`<td>${fmt(scene.results[row.name].averageWait)}</td>`).join("")}<td>${fmt(row.averageRank)}</td><td>${row.worstRank}</td><td>${fmt(row.rankSd)}</td><td>${row.firstCount}</td><td>${fmt(row.composite)}</td></tr>`).join("");
}

function drawHorizontalRankChart(canvas, rows) {
  const ctx = canvas.getContext("2d"); const w=canvas.width,h=canvas.height; ctx.clearRect(0,0,w,h);
  const sorted=[...rows].sort((a,b)=>a.scoreRank-b.scoreRank); const max=Math.max(...sorted.map(r=>r.sceneScore),1); const left=190,right=70,top=38,rowH=(h-top-22)/sorted.length;
  ctx.font="13px Arial";ctx.fillStyle="#5f6c73";ctx.fillText("综合评分越高越好",16,20);
  sorted.forEach((row,index)=>{const y=top+index*rowH;const bar=(w-left-right)*row.sceneScore/max;ctx.fillStyle=index%2?"#f4f7f7":"#edf2f3";ctx.fillRect(8,y,w-16,rowH-5);ctx.fillStyle=row.name==="Q-AWED"?"#087f72":"#286aa6";ctx.fillRect(left,y+8,bar,Math.max(12,rowH-20));ctx.fillStyle="#17242b";ctx.textAlign="right";ctx.fillText(`#${row.scoreRank} ${row.name}`,left-10,y+rowH/2+4);ctx.textAlign="left";ctx.fillText(fmt(row.sceneScore),left+bar+7,y+rowH/2+4);});ctx.textAlign="left";
}

function drawWaitComparison(canvas, rows) {
  const ctx=canvas.getContext("2d");const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const sorted=[...rows].sort((a,b)=>a.metrics.averageWait-b.metrics.averageWait);const max=Math.max(...sorted.map(r=>r.metrics.averageWait+(r.metrics.statistics?.averageWait?.ci95||0)),1);const left=205,right=90,top=35,rowH=(h-top-22)/sorted.length;
  sorted.forEach((row,index)=>{const mean=row.metrics.averageWait;const ci=row.metrics.statistics?.averageWait?.ci95||0;const y=top+index*rowH;const scale=(w-left-right)/max;ctx.fillStyle=index%2?"#f7f9f9":"#eef3f3";ctx.fillRect(8,y,w-16,rowH-6);ctx.fillStyle=row.name==="Q-AWED"?"#087f72":"#286aa6";ctx.fillRect(left,y+10,mean*scale,Math.max(12,rowH-25));ctx.strokeStyle="#b77813";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left+Math.max(0,mean-ci)*scale,y+rowH/2);ctx.lineTo(left+(mean+ci)*scale,y+rowH/2);ctx.stroke();ctx.beginPath();ctx.moveTo(left+(mean+ci)*scale,y+rowH/2-6);ctx.lineTo(left+(mean+ci)*scale,y+rowH/2+6);ctx.stroke();ctx.fillStyle="#17242b";ctx.font="13px Arial";ctx.textAlign="right";ctx.fillText(row.name,left-10,y+rowH/2+4);ctx.textAlign="left";ctx.fillText(`${fmt(mean)} ± ${fmt(ci)}`,left+mean*scale+8,y+rowH/2+4);});ctx.textAlign="left";
  const q=sorted.find(row=>row.name==="Q-AWED");document.getElementById("waitChartSummary").textContent=`Q-AWED 当前平均等待 ${fmt(q.metrics.averageWait)}，95% 置信区间半宽 ${fmt(q.metrics.statistics?.averageWait?.ci95||0)}；误差线反映重复评估的不确定性，而不是额外加到等待时间上。`;
}

function drawScoreContribution(canvas, rows) {
  const ctx=canvas.getContext("2d");const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const sorted=[...rows].sort((a,b)=>a.scoreRank-b.scoreRank);const colors=["#087f72","#286aa6","#b77813","#2a7b4f","#7b5ea7","#b83a42"];const labels=["等待","长等待","能耗","负载","等待排名","适应性"];const left=170,right=40,top=40,rowH=(h-top-22)/sorted.length;
  sorted.forEach((row,index)=>{let values;if(row.contributions)values=Object.values(row.contributions);else values=[row.avgSceneScore*.62,row.stability*.20,row.adaptability*.18];const total=values.reduce((a,b)=>a+b,0)||1;let x=left;values.forEach((value,i)=>{const width=(w-left-right)*value/100;ctx.fillStyle=colors[i];ctx.fillRect(x,top+index*rowH+8,width,Math.max(12,rowH-20));x+=width;});ctx.fillStyle="#17242b";ctx.font="12px Arial";ctx.textAlign="right";ctx.fillText(row.name,left-9,top+index*rowH+rowH/2+4);ctx.textAlign="left";ctx.fillText(fmt(total),x+5,top+index*rowH+rowH/2+4);});ctx.textAlign="left";ctx.font="10px Arial";labels.slice(0,selectedScenario==="overall"?3:6).forEach((label,i)=>{ctx.fillStyle=colors[i];ctx.fillRect(12+i*93,12,10,10);ctx.fillStyle="#5f6c73";ctx.fillText(label,26+i*93,21);});
}

function drawScenarioHeatmap(canvas, suite) {
  const ctx=canvas.getContext("2d");const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const left=190,top=62;const cellW=(w-left-24)/suite.scenarios.length;const cellH=(h-top-18)/ALGORITHM_NAMES.length;
  suite.scenarios.forEach((scene,col)=>{ctx.fillStyle="#5f6c73";ctx.font="12px Arial";ctx.textAlign="center";ctx.fillText(scene.name,left+col*cellW+cellW/2,35);});
  ALGORITHM_NAMES.forEach((name,row)=>{ctx.fillStyle=name==="Q-AWED"?"#087f72":"#17242b";ctx.textAlign="right";ctx.fillText(name,left-10,top+row*cellH+cellH/2+4);suite.scenarios.forEach((scene,col)=>{const rank=scenarioScoreRankRows(scene.results).find(item=>item.name===name).scoreRank;const strength=(ALGORITHM_NAMES.length-rank)/(ALGORITHM_NAMES.length-1);ctx.fillStyle=name==="Q-AWED"?`rgba(8,127,114,${.18+.75*strength})`:`rgba(40,106,166,${.12+.65*strength})`;ctx.fillRect(left+col*cellW+3,top+row*cellH+3,cellW-6,cellH-6);ctx.fillStyle=strength>.5?"#fff":"#17242b";ctx.textAlign="center";ctx.fillText(`#${rank}`,left+col*cellW+cellW/2,top+row*cellH+cellH/2+4);});});ctx.textAlign="left";
}

function renderRankMatrix() {
  document.getElementById("rankMatrix").innerHTML=`<table><thead><tr><th>算法</th>${latestSuite.scenarios.map(scene=>`<th>${scene.name}</th>`).join("")}<th>平均排名</th><th>最差排名</th></tr></thead><tbody>${overallRankRows().map(row=>`<tr class="${row.name==="Q-AWED"?"qawed-row":""}"><td>${row.name}</td>${latestSuite.scenarios.map(scene=>`<td>#${scenarioScoreRankRows(scene.results).find(item=>item.name===row.name).scoreRank}</td>`).join("")}<td>${fmt(row.averageRank)}</td><td>${row.worstRank}</td></tr>`).join("")}</tbody></table>`;
}

function renderMetrics(rows) {
  const q=rows.find(row=>row.name==="Q-AWED");const stats=q.metrics.statistics?.averageWait||{ci95:0};
  document.getElementById("summaryWait").textContent=fmt(q.metrics.averageWait);
  document.getElementById("summaryWaitDelta").textContent=selectedScenario==="overall"?"六场景加权平均":"仿真时间步";
  document.getElementById("summaryCI").textContent=`±${fmt(stats.ci95)}`;
  document.getElementById("summaryComposite").textContent=fmt(latestSuite.composite["Q-AWED"].composite);
  const overall=overallRankRows().find(row=>row.name==="Q-AWED");document.getElementById("summaryAverageRank").textContent=fmt(overall.averageRank);document.getElementById("summaryWorstRank").textContent=`最差排名 #${overall.worstRank}`;
}

function renderEvidence() {
  if(!latestSuite)return;renderScenarioTabs();const rows=currentRankRows();renderScenarioTable();renderScenarioOverview();renderMetrics(rows);drawWaitComparison(document.getElementById("waitComparisonChart"),rows);drawHorizontalRankChart(document.getElementById("scoreRankChart"),rows);drawScoreContribution(document.getElementById("scoreContributionChart"),rows);drawScenarioHeatmap(document.getElementById("scenarioHeatmap"),latestSuite);renderRankMatrix();document.getElementById("qawedFirstReason").textContent=explainCompositeLeader(latestSuite.composite);renderPaperConclusion();
}

function renderResults(results, agent) {
  latestAgent=agent;renderEvidence();renderPolicyDistribution(agent);
}

function renderPolicyDistribution(agent=latestAgent) {
  if(!agent)return;const distribution=agent.policyDistribution();const total=Object.values(distribution).reduce((a,b)=>a+b,0)||1;document.getElementById("policyDistribution").innerHTML=WEIGHT_PLANS.map(plan=>{const count=distribution[plan.name]||0;const share=count/total*100;return `<div class="policy-row"><span>${plan.name}</span><div class="policy-track"><div class="policy-fill" style="width:${share}%"></div></div><output>${fmt(share,1)}%</output></div>`;}).join("");
}

function renderPaperConclusion() {
  if(!latestSuite)return;const overall=overallRankRows();const q=overall.find(row=>row.name==="Q-AWED");const scenes=latestSuite.scenarios.map(scene=>({name:scene.name,rank:scenarioScoreRankRows(scene.results).find(row=>row.name==="Q-AWED").scoreRank}));const first=scenes.filter(scene=>scene.rank===1).map(scene=>scene.name);document.getElementById("paperConclusion").textContent=`在 ${scenes.length} 类交通场景、每场景大于 30 轮评估的统一仿真中，Q-AWED 综合得分为 ${fmt(q.composite)}，综合排名第 ${q.scoreRank}；平均场景排名 ${fmt(q.averageRank)}，最差排名第 ${q.worstRank}。${first.length?`它在${first.join("、")}取得场景第一。`:"它没有依靠单一场景第一来证明通用性。"} 结果支持的是跨场景稳定性，而不是声称每个场景都最优。`;
}

function renderScenarioParameterPanel() {
  const summary=document.getElementById("scenarioPresetSummary");if(selectedScenario==="overall"){summary.textContent="综合模式使用当前基础值，并为六个场景分别应用论文级预设。";return;}const preset=SCENARIO_QAWED_PRESETS[selectedScenario];summary.textContent=`${selectedScenarioItem()?.name||selectedScenario}：${preset.strategy}`;
}

function applySelectedScenarioPreset() {
  if(selectedScenario==="overall"){applyScenarioConfigToInputs(DEFAULTS);return;}applyScenarioConfigToInputs(scenarioConfig(readConfig(),selectedScenario,SCENARIO_QAWED_PRESETS[selectedScenario]));renderScenarioParameterPanel();
}

function setRunning(running,message) {
  ["runSimulation","rerunScenario","applyScenarioPreset","resetDefaults"].forEach(id=>{const button=document.getElementById(id);if(button)button.disabled=running;});document.getElementById("runStatus").textContent=message;document.getElementById("directoryStatus").textContent=message;document.querySelector(".status-dot").classList.toggle("ready",!running);
}

function runSimulation() {
  let config;try{config=readConfig();}catch(error){setRunning(false,error.message);return;}setRunning(true,"正在计算六个场景");window.setTimeout(()=>{try{latestSuite=evaluateScenarioSuite(config,config.seed+90000);const scene=selectedScenarioItem()||latestSuite.scenarios.find(item=>item.key==="office")||latestSuite.scenarios[0];latestAgent=scene.agent;renderEvidence();renderPolicyDistribution(latestAgent);renderScenarioParameterPanel();renderSelectedParameter();setRunning(false,`默认实验已完成 · ${latestSuite.scenarios.length} 个场景`);}catch(error){console.error(error);setRunning(false,`计算失败：${error.message}`);}},30);
}

function rerunSelectedScenario() {
  if(selectedScenario==="overall"||!latestSuite){runSimulation();return;}let config;try{config={...readConfig(),scenarioKind:selectedScenario};}catch(error){setRunning(false,error.message);return;}setRunning(true,`正在重算${selectedScenarioItem().name}`);window.setTimeout(()=>{try{const index=latestSuite.scenarios.findIndex(item=>item.key===selectedScenario);const evaluated=evaluateAllAlgorithms(config,config.seed+120000+index*4000);latestSuite.scenarios[index]={...latestSuite.scenarios[index],config,...evaluated};latestSuite.composite=calculateCompositeScores(latestSuite.scenarios);latestAgent=evaluated.agent;renderEvidence();renderPolicyDistribution(latestAgent);renderSelectedParameter();setRunning(false,`${latestSuite.scenarios[index].name}已重算`);}catch(error){console.error(error);setRunning(false,`计算失败：${error.message}`);}},30);
}

function resultRowsForCsv() {
  if(!latestSuite)return[];const rows=[];latestSuite.scenarios.forEach(scene=>{const ranked=scenarioScoreRankRows(scene.results);ranked.forEach(row=>{const stats=row.metrics.statistics.averageWait;rows.push([scene.name,row.name,scene.config.seed,scene.config.evalEpisodes,stats.mean,stats.standardDeviation,stats.ci95,row.metrics.longWaitRate,row.metrics.averageStops,row.metrics.energyProxy,row.metrics.loadImbalance,row.waitRank,row.scoreRank,row.sceneScore,latestSuite.composite[row.name].composite]);});});return rows;
}

function downloadCsv() {
  const rows=resultRowsForCsv();if(!rows.length){setRunning(false,"请先运行实验");return;}const header=["scenario","algorithm","seed","eval_episodes","mean_wait","std_wait","ci95_wait","long_wait_rate","average_stops","energy_proxy","load_imbalance","wait_rank","scene_rank","scene_score","composite_score"];const csv=[header,...rows].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");const blob=new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="qawed_presentation_results.csv";link.click();URL.revokeObjectURL(url);
}

function resetDefaults() {
  applyScenarioConfigToInputs(DEFAULTS);setRunning(false,"参数已恢复默认值");
}

function initControls() {
  document.querySelectorAll("input[type='range'], input[type='number']").forEach(input=>input.addEventListener("input",()=>{syncRangeValues();if(input.id===selectedParameter)renderSelectedParameter();}));
  document.getElementById("parameterPreviewValue").addEventListener("input",event=>{const input=document.getElementById(selectedParameter);if(input){input.value=event.target.value;input.dispatchEvent(new Event("input"));}});
  document.getElementById("runSimulation").addEventListener("click",runSimulation);
  document.getElementById("rerunScenario").addEventListener("click",rerunSelectedScenario);
  document.getElementById("applyScenarioPreset").addEventListener("click",applySelectedScenarioPreset);
  document.getElementById("resetDefaults").addEventListener("click",resetDefaults);
  document.getElementById("downloadCsv").addEventListener("click",downloadCsv);
  document.getElementById("replayAlgorithm").addEventListener("click",()=>{loadReplayData();startReplay();});
  document.getElementById("pauseAlgorithm").addEventListener("click",event=>{replayPaused=!replayPaused;replayLastTick=performance.now();event.currentTarget.textContent=replayPaused?"▶":"Ⅱ";});
  document.getElementById("stepAlgorithm").addEventListener("click",()=>{replayPaused=true;demoTime=Math.min(16,demoTime+.1);document.getElementById("pauseAlgorithm").textContent="▶";renderReplayFrame(demoTime);});
  document.getElementById("algorithmTimeline").addEventListener("input",event=>{replayPaused=true;demoTime=Number(event.target.value);document.getElementById("pauseAlgorithm").textContent="▶";renderReplayFrame(demoTime);});
  document.querySelectorAll("#demoMode button").forEach(button=>button.addEventListener("click",()=>{demoMode=button.dataset.demoMode;loadReplayData();startReplay();}));
  document.getElementById("comparisonAlgorithm").addEventListener("change",event=>{comparisonReplay=event.target.value;loadReplayData();startReplay();});
  document.getElementById("showIntroView").addEventListener("click",()=>switchView("intro"));
  document.getElementById("showScenarioView").addEventListener("click",()=>switchView("scenario"));
}

function initPresentation() {
  initTalkNavigation();initFormulaExplainer();buildAlgorithmStage();renderAlgorithmGuide();renderLiteratureGuide();renderPolicyExplanation();renderDecisionFlowAnimation();syncRangeValues();renderParameterWorkbench();document.getElementById("scenarioParameterAdvice").innerHTML=PARAMETER_ADVICE.map(item=>`<div class="advice-card"><strong>${item.title}</strong><span>${item.text}</span></div>`).join("");initControls();loadReplayData();startReplay();runSimulation();
}

document.addEventListener("DOMContentLoaded",initPresentation);
