(function formulaExplanationModule(root) {
  "use strict";

  function variable(symbol, name, meaning, unit, source, calculation) {
    return { symbol, name, meaning, unit, source, calculation };
  }

  const FORMULA_EXPLANATIONS = [
    {
      id: "floors",
      title: "系统负载率与楼层规模",
      category: "建筑规模 · 排队负载",
      evidenceLevel: "工作守恒模型",
      purpose: "回答“当前客流产生工作的速度，是否超过电梯群处理工作的速度”。楼层数 F 不直接等于困难程度；它通过接客距离、乘客行程和停站成本改变每个请求的平均工作量。",
      formalFormula: "rho_F = lambda_F * E[d*(F)] / (M * mu_F)",
      plainFormula: "负载率 = 每分钟新增工作量 / 每分钟可处理工作量 = (请求数量 × 每个请求平均工作量) / (电梯数量 × 单梯有效能力)",
      derivationSteps: [
        "第一步先算需求。lambda_F 的单位是“请求/分钟”，E[d*(F)] 的单位是“等效楼层/请求”。两者相乘后，请求这个单位被约掉，得到系统每分钟新增多少等效楼层工作。这里必须相乘，因为每个请求都平均带来一份工作量。",
        "第二步算供给。一台电梯每分钟可处理 mu_F 个等效楼层，M 台相似电梯并行工作时，总能力近似为 M * mu_F。因此这里相乘表示多台服务器的能力相加。",
        "第三步用需求除以能力。比值小于 1 表示平均供给大于需求；接近 1 表示几乎没有余量；大于 1 表示每分钟新增工作多于可完成工作，未完成部分只能进入队列。",
        "不能把需求和能力相加，因为“40 个工作 + 48 个能力”不能回答是否超载；相除才能得到两者的相对大小。"
      ],
      variables: [
        variable("rho_F", "场景负载率", "场景 F 中需求相对总服务能力的比例。", "无单位", "由本公式计算", "lambda_F * E[d*(F)] / (M * mu_F)"),
        variable("lambda_F", "平均请求到达率", "场景 F 每单位时间新出现的乘客请求数。", "请求/分钟", "请求生成器或真实呼梯日志", "观察 T 分钟出现 N_F 个请求时，lambda_F = N_F / T"),
        variable("E[d*(F)]", "平均请求工作量", "完成一个请求平均消耗的移动、停站和换向工作。", "等效楼层/请求", "每个请求的起点、终点、分配时电梯位置和停站日志", "E[d*(F)] = (1/N_F) * sum(d_i*)"),
        variable("F", "楼层数", "建筑中可服务楼层总数，它会改变可出现的行程距离。", "层", "场景输入参数", "直接读取 floors；它不直接代入分子，而是影响请求分布和 E[d*(F)]"),
        variable("M", "电梯数量", "能够并行处理请求的轿厢数量。", "台", "场景输入参数", "直接读取 elevators"),
        variable("mu_F", "单梯有效工作能力", "在场景 F 下，一台电梯平均每分钟真正能够完成的等效工作。", "等效楼层/台/分钟", "高负载标定仿真或真实运行日志", "mu_F = (1/M) * sum(W_j / T_obs)"),
        variable("N_F", "样本请求数", "用于估计场景平均工作量的请求总数。", "请求", "仿真请求列表", "统计场景 F 中已生成或已完成的请求数量")
      ],
      subFormulas: [
        "单个请求：d_i* = |X_i-O_i| + |O_i-D_i| + c_s*n_i + c_r*I_i。前两项分别是接客距离和载客距离，后两项把停站与额外换向换成等效楼层。",
        "停站换算：c_s = t_s/t_f。若开门、上下客、关门共 6 秒，移动一层平均 2 秒，则一次停站相当于 3 个等效楼层。",
        "平均工作量：E[d*(F)] = sum(d_i*)/N_F。多人共享同一路段或停站时，应按共享人数分摊，避免把同一段路线重复计算。",
        "单梯能力：mu_F = (1/M) * sum(W_j/T_obs)。W_j 是第 j 台电梯在高负载观察窗内完成的等效工作量。",
        "物理估计：T_cycle = D_cycle*t_f + N_stop*t_s + t_other，mu_F = 60*W_cycle/T_cycle；T_cycle 使用秒时乘 60 转成每分钟。"
      ],
      dimensionCheck: [
        "需求：请求/分钟 × 等效楼层/请求 = 等效楼层/分钟。",
        "能力：台 × 等效楼层/台/分钟 = 等效楼层/分钟。",
        "最终：(等效楼层/分钟) / (等效楼层/分钟) = 1，因此 rho_F 没有单位。",
        "重要口径：这里的 mu_F 必须是“工作能力”。如果 mu 写成“请求/分钟”，正确公式应改为 rho = lambda/(M*mu)，不能再乘 E[d*(F)]；两种口径不能混用。"
      ],
      dataPipeline: [
        "请求生成器记录每位乘客的出现时间、起点 O_i 和终点 D_i。",
        "派梯时记录被选电梯当前位置 X_i；运行过程记录移动路段、停站、换向和共享人数。",
        "由每条日志计算 d_i*，再对同一场景全部请求求平均，得到 E[d*(F)]。",
        "在持续有任务的标定窗口中，统计每台电梯完成的 W_j/T_obs，得到 mu_F。低流量时的空闲不是能力不足，因此不应用低负载窗口直接估计最大能力。",
        "最后用同一时间单位下的 lambda_F、E[d*(F)]、M 和 mu_F 计算 rho_F。"
      ],
      workedExample: [
        "场景每分钟出现 lambda_F = 4 个请求，每个请求平均工作量 E[d*(F)] = 10 等效楼层，因此需求为 4*10 = 40 等效楼层/分钟。",
        "有 M = 4 台电梯；高负载标定得到每台 mu_F = 12 等效楼层/台/分钟，总能力为 4*12 = 48。",
        "代入得到 rho_F = 40/48 = 0.833。系统平均有约 16.7% 的能力余量，但已经属于较高负载。",
        "如果到达率升到 6 请求/分钟，rho_F = 6*10/48 = 1.25。每分钟新增 60 单位工作，只能完成 48，队列平均每分钟积累 12 单位工作。"
      ],
      functionProperties: [
        "固定其他量时，rho_F 与 lambda_F、E[d*(F)] 成正比：请求加倍或单请求工作加倍，负载也加倍。",
        "固定其他量时，rho_F 与 M、mu_F 成反比：增加电梯或提高有效能力会降低负载，但真实系统还会出现协调损失，因此 1/M 是理想近似。",
        "rho < 1：平均服务能力大于新增工作量，满足长期稳定的必要条件；不代表每个人都立即上梯。",
        "rho ≈ 1：系统接近饱和，小幅随机波动也可能形成长队，等待时间常呈非线性上升。",
        "rho > 1：新增工作量超过处理能力；若交通状态长期不变，队列会持续积累。"
      ],
      rangeReasoning: [
        "楼层范围不是由一个普适定理直接算出，而是为了让不同算法的方向、距离和分区差异可观察，同时避免所有算法都因 rho > 1 而失去比较意义。",
        "研究中应先由场景请求分布算 E[d*(F)]，再标定 mu_F，最后检查 rho_F。9-16 层只是当前合成场景的实验范围，不应写成所有建筑的最佳范围。"
      ],
      lowNormalHigh: [
        "楼层太少或 rho 很低：请求很快被处理，各算法等待差异可能小于随机误差。",
        "rho 约 0.6-0.9：系统有压力但仍可恢复，通常更适合观察调度策略差异。",
        "rho 接近或超过 1：等待迅速增加；若长期大于 1，比较结果主要反映容量不足，而不只是派梯规则。"
      ],
      assumptions: [
        "请求到达率和工作量在统计窗口内具有可解释的平均值。",
        "M 台电梯能够并行工作；若速度、容量不同，应分别计算每台 mu_j 后求和。",
        "等效楼层是时间或能耗代理，不等于真实电机功率。真实能耗研究还需质量、速度曲线和再生制动数据。",
        "rho < 1 是稳定运行的必要判断，不是平均等待时间的直接预测公式。"
      ]
    },
    {
      id: "elevators",
      title: "电梯数量与并行服务能力",
      category: "建筑规模 · 并行服务",
      evidenceLevel: "排队工作量关系",
      purpose: "解释为什么增加电梯通常会减轻单梯负担，以及为什么电梯越多并不保证等待时间按同样比例下降。",
      formalFormula: "rho = lambda * E[S] / M",
      plainFormula: "每台电梯平均负担 = 所有请求带来的服务时间 / 同时工作的电梯数量",
      derivationSteps: [
        "lambda 表示每单位时间到来多少请求，E[S] 表示每个请求平均占用一台电梯多久；相乘得到每单位时间需要多少“电梯忙碌时间”。",
        "M 台相似电梯同时服务，相当于把总工作量分给 M 个并行服务者，所以用总工作量除以 M。",
        "该式首先描述利用率，不直接给出等待。等待还受请求是否同向、轿厢当前位置、共享停站和队列波动影响。"
      ],
      variables: [
        variable("rho", "平均单梯利用率", "一台代表性电梯被工作占用的比例。", "无单位", "由公式计算", "lambda*E[S]/M"),
        variable("lambda", "请求率", "每单位时间新增的呼梯请求。", "请求/分钟", "请求日志", "请求总数/观察分钟数"),
        variable("E[S]", "平均服务时间", "一个请求平均占用服务资源的时间，含移动、停站及上下客。", "电梯分钟/请求", "仿真服务日志", "sum(S_i)/N"),
        variable("M", "电梯数", "可并行工作的轿厢数量。", "台", "场景输入", "直接读取 elevators")
      ],
      subFormulas: [
        "S_i = t_pickup,i + t_trip,i + t_door,i + t_other,i。",
        "若各台能力不同，应使用 rho = lambda*E[S]/sum(c_j)，其中 c_j 是相对能力；不能简单假设每台相同。",
        "工作量口径也可写成 rho = lambda*E[d*]/sum(mu_j)，但时间口径和等效楼层口径必须二选一并保持单位一致。"
      ],
      dimensionCheck: ["请求/分钟 × 电梯分钟/请求 = 电梯；再除以 M 台电梯，得到无单位比例。", "若 E[S] 只含载客时间却漏掉接客和开门，rho 会被系统性低估。"],
      dataPipeline: ["统计每个请求从占用电梯开始到相关服务结束的时间组成。", "对独立评估轮求平均 E[S]，读取场景电梯数 M 与请求率 lambda。", "用同一时间单位代入。"],
      workedExample: ["lambda=3 请求/分钟，E[S]=0.8 电梯分钟/请求，总工作需求为 2.4 电梯。", "M=3 时 rho=2.4/3=0.80；M=4 时 rho=0.60。", "这不表示第四台一定把等待降低 25%，因为实际请求未必能被完全平均分配。"],
      functionProperties: ["固定需求时 rho 与 1/M 成反比。", "从 M=2 增加到 3 的理论负载降幅大于从 8 增加到 9，因此具有边际收益递减的直觉。", "等待时间在 rho 接近 1 时对 M 更敏感。"],
      rangeReasoning: ["当前研究选 3-4 台，是为了使系统既不长期过载，也不因容量过剩让算法差异消失。", "最终数量应由目标交通量、处理能力和容许等待反推，而不是照搬固定范围。"],
      lowNormalHigh: ["M 太少：所有算法都受容量短缺主导。", "M 合理：调度选择会明显影响等待、停站和能耗。", "M 太多：多数请求立即分配，算法差异和学习价值变小。"],
      assumptions: ["电梯能共享请求并近似并行。", "基础公式假设服务时间均值有限；成批合乘会使单请求服务时间分摊更复杂。", "设备异构时应按每台能力求和。"]
    },
    {
      id: "steps",
      title: "仿真步数与交通周期覆盖",
      category: "实验设计 · 时间长度",
      evidenceLevel: "实验覆盖定义",
      purpose: "判断一轮仿真是否看完了场景中的完整交通变化，而不是只观察到开头的一小段。",
      formalFormula: "Coverage = min(1, T/T_cycle)",
      plainFormula: "周期覆盖率 = 已观察时长 / 一个完整交通周期；超过一个周期后最高记为100%",
      derivationSteps: ["T/T_cycle 比较观察窗口与完整周期的长度，所以使用除法。", "当 T<T_cycle 时，比值表示看到了周期的多少比例。", "当 T>=T_cycle 时，完整周期已经覆盖；min(1, ·) 把覆盖率限制在 100%，额外时长用于重复和降低截尾影响。"],
      variables: [
        variable("Coverage", "周期覆盖率", "观察窗口包含完整场景结构的程度。", "0到1", "由公式计算", "min(1,T/T_cycle)"),
        variable("T", "仿真步数", "每轮生成和处理请求的时间步总数。", "步", "输入参数", "直接读取 steps"),
        variable("T_cycle", "完整交通周期", "场景定义中所有阶段合计的长度。", "步", "请求生成器", "例如三段通勤的三段长度之和")
      ],
      subFormulas: ["实际仿真时长 = T*Delta_t，其中 Delta_t 是每步对应的秒数。", "若需覆盖 k 个完整周期，可用 RepeatCoverage=T/(k*T_cycle)，而不是继续把 Coverage 写到大于1。"],
      dimensionCheck: ["步/步=1，因此 Coverage 无单位。", "若 T 使用步而 T_cycle 使用分钟，必须先通过 Delta_t 转成同一单位。"],
      dataPipeline: ["由场景生成器读取各阶段长度。", "把阶段长度相加得到 T_cycle。", "读取输入 T 并计算覆盖率，同时检查末尾仍在等待的请求。"],
      workedExample: ["完整周期 T_cycle=120 步。T=60 时 Coverage=0.5，只观察一半。", "T=120 时 Coverage=1。T=180 时公式仍为1，但多出的60步可观察队列恢复。"],
      functionProperties: ["在 T<T_cycle 区间线性增加，斜率为1/T_cycle。", "到1后进入平台；这是带上限的分段函数。"],
      rangeReasoning: ["当前100-180步来自六个场景周期长度和运行时间折中。", "推荐值应至少覆盖一次到达高峰及其消退阶段，并检查仿真结束时是否仍有大量未完成请求。"],
      lowNormalHigh: ["过短：结果依赖起始楼层和第一批请求。", "适中：覆盖完整流量变化并允许队列消退。", "过长：重复相同合成模式，计算量线性增加而新增信息减少。"],
      assumptions: ["时间步长度固定。", "场景有可定义的周期或阶段。", "Coverage 是实验完整性指标，不是模型准确率。"]
    },
    {
      id: "trainEpisodes",
      title: "训练轮数与状态动作覆盖",
      category: "实验设计 · 学习充分性",
      evidenceLevel: "实际访问计数",
      purpose: "直接统计训练中有多少状态与权重策略组合真正获得过Q值更新，而不是用理想均匀抽样近似代替实际覆盖。",
      formalFormula: "Coverage(N) = N_visited(N)/(54*6)",
      plainFormula: "训练覆盖率 = 到第N轮为止至少更新过一次的组合数 / 324个可能组合",
      derivationSteps: ["状态由3种交通模式、3档请求密度、3种方向模式和2档繁忙状态组成，因此最多有3*3*3*2=54类状态。", "每类状态可选择6套权重策略，所以固定状态动作空间为54*6=324个组合。", "每当训练选择动作a并更新Q(s,a)，就把(s,a)记入已访问集合。", "训练到第N轮时，用已访问集合大小除以324，得到不会随新状态出现而反向下降的实际覆盖率。"],
      variables: [
        variable("Coverage", "实际覆盖率", "至少被更新过一次的状态动作组合比例。", "0到1", "visitedStateActions", "N_visited/324"),
        variable("N_train", "训练轮数", "独立生成并用于更新Q表的仿真回合数。", "轮", "输入参数", "直接读取 trainEpisodes"),
        variable("N_visited", "已访问组合数", "训练到第N轮至少更新过一次的(s,a)数量。", "组", "visitedStateActions.size", "每次训练选择动作后把状态键与动作编号加入集合"),
        variable("54", "可能状态数", "四个离散状态维度的笛卡尔积大小。", "类", "stateKey定义", "3*3*3*2"),
        variable("6", "动作数", "每个状态可选择的权重策略数量。", "种", "WEIGHT_PLANS", "当前固定为6")
      ],
      subFormulas: ["|S_possible|=3*3*3*2=54。", "|S_possible|*|A|=54*6=324。", "N_visited(N+1)>=N_visited(N)，因此Coverage(N)单调不下降。"],
      dimensionCheck: ["组合数除以组合数得到无单位比例。", "Coverage乘100后表示百分比；训练轮数只作为横坐标，不直接与比例相加。"],
      dataPipeline: ["训练动作选择后记录状态键与动作编号。", "每轮结束读取已访问集合大小并除以324。", "把每轮的episode、visited、total和coverage保存为曲线历史。"],
      workedExample: ["训练到第60轮时若访问了162个组合，则Coverage=162/324=50%。", "训练到第180轮时若访问了243个组合，则Coverage=243/324=75%；其余81个组合仍没有直接训练样本。"],
      functionProperties: ["覆盖率只能上升或保持不变，范围为0到1。", "接近平台后新增轮数主要重复已有组合，因此实际曲线通常呈现边际收益下降。"],
      rangeReasoning: ["120-260轮来自当前有限Q表、120步场景和六动作规模的计算成本折中。", "选择180不能仅靠近似式，还要观察Q值变化、策略分布和评估性能是否进入平台。"],
      lowNormalHigh: ["过少：稀有状态保持初始Q值，种子一换策略就变。", "适中：主要状态重复更新，评估回报趋于稳定。", "过多：合成流量上收益进入平台，还可能对固定生成分布过拟合。"],
      assumptions: ["四个状态维度及其档位数量保持不变。", "动作集合固定为6套权重方案。", "覆盖只证明组合被访问过，不证明每个Q值已经收敛，也不等于真实建筑有效性。"]
    },
    {
      id: "evalEpisodes",
      title: "评估轮数、标准误与95%置信区间",
      category: "统计证据 · 不确定性",
      evidenceLevel: "经典抽样统计公式",
      purpose: "说明报告的平均等待不是一次随机仿真的偶然结果，并量化重复实验后均值还有多大不确定性。",
      formalFormula: "SE = s/sqrt(N_eval); CI95 = mean ± 1.96*SE",
      plainFormula: "均值的不确定性 = 单轮结果的波动 / 评估次数平方根；95%区间 = 平均值上下各留1.96个标准误",
      derivationSteps: ["独立样本均值是N个结果的平均；独立方差相加后再除以N^2，所以均值方差为 sigma^2/N。", "开平方得到均值标准差 sigma/sqrt(N)；未知总体sigma时用样本标准差s估计。", "样本量足够且均值近似正态时，约95%的标准正态概率落在±1.96之间，因此得到mean±1.96*SE。"],
      variables: [
        variable("SE", "标准误", "如果重复整套评估，样本均值会波动的典型大小。", "与等待时间相同", "由评估样本计算", "s/sqrt(N_eval)"),
        variable("s", "样本标准差", "不同评估轮平均等待的离散程度。", "时间步", "episodeMeasurements", "sqrt(sum((x_i-mean)^2)/(N_eval-1))"),
        variable("N_eval", "评估轮数", "不再学习、只测性能的独立回合数量。", "轮", "输入参数", "直接读取 evalEpisodes"),
        variable("mean", "样本均值", "所有评估轮平均等待的平均值。", "时间步", "episodeMeasurements", "sum(x_i)/N_eval"),
        variable("1.96", "95%临界值", "标准正态分布双侧95%区间对应的分位数。", "无单位", "统计分布", "Phi^{-1}(0.975)≈1.96")
      ],
      subFormulas: ["s=sqrt(sum((x_i-mean)^2)/(N_eval-1))。", "CI半宽=1.96*s/sqrt(N_eval)。小样本时更严谨可把1.96换成t分布临界值。"],
      dimensionCheck: ["s是时间步，sqrt(N_eval)是无单位，所以SE仍是时间步。", "1.96无单位，mean±1.96*SE两项单位相同。"],
      dataPipeline: ["固定算法、场景和参数，使用成对随机种子运行N_eval轮。", "每轮计算一个平均等待x_i。", "由x_i列表计算mean、s、SE和CI半宽；不同算法应使用同一组请求序列以减少比较噪声。"],
      workedExample: ["若mean=20步、s=8步、N_eval=16，则SE=8/4=2，95%CI约为20±3.92。", "增加到N_eval=64，SE=8/8=1，区间半宽约1.96；轮数扩大4倍，误差才减半。"],
      functionProperties: ["SE按1/sqrt(N)下降，单调但边际收益递减。", "N从10增至40约减半；若想再次减半需增至160。"],
      rangeReasoning: ["大于30轮是当前论文的最低重复要求；32-50轮在计算成本和区间宽度之间折中。", "最终是否足够应看CI是否窄到不会改变主要结论，而不是只看轮数门槛。"],
      lowNormalHigh: ["过少：区间宽，单个异常交通流可改变排名。", "适中：能展示均值和不确定性，计算时间可控。", "过多：精度仍提高，但成本线性增长、误差只按平方根下降。"],
      assumptions: ["各轮评估独立或使用正确的成对分析。", "1.96近似依赖样本均值近似正态。", "置信区间描述估计不确定性，不表示95%的乘客等待都在该区间。"]
    },
    {
      id: "seed",
      title: "随机种子与波动来源",
      category: "实验设计 · 可复现性",
      evidenceLevel: "全方差定律",
      purpose: "解释随机种子为什么不是性能参数，以及为什么仅固定一个种子只能复现实验、不能证明算法稳定。",
      formalFormula: "Var(Y) = E[Var(Y|Z)] + Var(E[Y|Z])",
      plainFormula: "总波动 = 同一种随机环境内部的波动 + 更换随机环境后平均结果的波动",
      derivationSteps: ["把结果Y相对总体均值的偏差，拆成“相对当前种子均值的偏差”和“当前种子均值相对总体均值的偏差”。", "平方并取期望时，交叉项在条件期望下为0。", "剩下第一项是种子内方差的平均，第二项是不同种子均值之间的方差。"],
      variables: [
        variable("Y", "实验结果", "例如一次评估得到的平均等待。", "时间步", "评估输出", "由仿真指标计算"),
        variable("Z", "随机种子", "选择一条确定的伪随机数序列的整数索引。", "整数标签", "输入参数", "直接读取 seed"),
        variable("Var(Y|Z)", "种子内方差", "种子条件固定时，其他重复或过程造成的波动。", "时间步平方", "同种子重复设计", "对同一Z下Y求样本方差"),
        variable("Var(E[Y|Z])", "种子间方差", "更换请求序列后，各种子平均结果的差异。", "时间步平方", "多种子实验", "先求每个种子的均值，再求这些均值的方差")
      ],
      subFormulas: ["伪随机生成器写作 U_1,U_2,... = PRNG(Z)。相同代码、参数和Z应产生同一序列。", "多种子均值 = sum(mean_z)/K，其中K是种子数量，不是种子整数大小。"],
      dimensionCheck: ["方差各项都是结果单位的平方，因此可以相加。", "种子Z只是标签，没有“2026比10更随机”的量纲含义。"],
      dataPipeline: ["seed初始化请求生成与策略探索的伪随机数发生器。", "复现实验时固定seed和代码版本。", "稳健性验证时使用多个预先声明的种子，并报告种子间分布。"],
      workedExample: ["种子2026让同一配置重复得到完全一致的请求流，便于核对算法。", "若5个种子的平均等待分别为18、21、19、30、20，只报告2026对应的18会低估场景随机性；应报告全部种子的均值和波动。"],
      functionProperties: ["种子数值大小与性能没有单调关系。", "增加不同种子的数量会提高对种子间波动的认识，但不会自动改善算法。"],
      rangeReasoning: ["2026只是便于论文复现的固定标签。", "研究结论应同时包含多种子检查；种子数量由结果波动和计算预算决定。"],
      lowNormalHigh: ["只用一个种子：可复现但不能证明稳健。", "使用多组预先固定种子：可估计随机流量敏感性。", "只把种子整数改得很大：没有统计收益。"],
      assumptions: ["PRNG实现和调用顺序不变。", "所有算法共享相同请求种子才能公平比较。", "该公式解释方差来源，不给出最佳seed。"]
    },
    {
      id: "longWaitThreshold",
      title: "长等待阈值与尾部概率",
      category: "服务质量 · 分布尾部",
      evidenceLevel: "概率定义",
      purpose: "补充平均等待指标，单独统计等待超过服务目标的乘客比例，避免少量极端等待被平均数掩盖。",
      formalFormula: "LongWaitRate(tau) = P(W>=tau) = 1-F_W(tau)",
      plainFormula: "长等待比例 = 等待达到阈值的乘客数 / 全部乘客数",
      derivationSteps: ["累计分布F_W(tau)表示等待不超过tau的概率。", "总概率为1，所以超过阈值的尾部概率等于1减去未超过部分。", "样本中用指示函数计数：每个超阈值乘客记1，否则记0，再取平均。"],
      variables: [
        variable("W", "乘客等待时间", "从请求出现到进入电梯的时间。", "时间步或秒", "请求日志", "pickupTime-arrivalTime"),
        variable("tau", "长等待阈值", "研究者或服务标准定义的不可接受等待界线。", "与W相同", "输入参数或服务目标", "直接读取 longWaitThreshold"),
        variable("F_W", "等待累计分布", "等待不超过给定值的乘客比例。", "0到1", "评估样本", "count(W_i<tau)/N，边界符号需与定义统一"),
        variable("LongWaitRate", "长等待率", "达到或超过阈值的乘客占比。", "0到1或百分比", "评估指标", "sum(I(W_i>=tau))/N")
      ],
      subFormulas: ["I(W_i>=tau)=1 当条件成立，否则为0。", "LongWaitRate=sum(I_i)/N。", "若一步为5秒、tau=12步，则实际阈值为60秒。"],
      dimensionCheck: ["W和tau必须使用同一时间单位才能比较。", "人数/人数=无单位比例。", "F_W与概率均无单位。"],
      dataPipeline: ["记录每个乘客arrivalTime和pickupTime。", "计算W_i并与tau比较。", "对全部已服务及按规则处理的截尾请求计数；论文需说明仿真结束仍未上梯者如何处理。"],
      workedExample: ["100名乘客中有14人的W>=12步，则LongWaitRate=14/100=14%。", "把tau提高到15步后只剩7人超过，比例降到7%；这不代表算法变好了，只是判定标准放宽。"],
      functionProperties: ["固定等待样本时，长等待率随tau增加单调不升。", "经验曲线是阶梯函数，只在某个乘客等待值处下降。"],
      rangeReasoning: ["普通场景13-16步、关键服务10-12步是当前服务目标设定，不是概率公式自动推导的常数。", "应把一步换算成秒，并结合目标建筑服务要求、基线分布分位数和敏感性分析确定tau。"],
      lowNormalHigh: ["tau太低：正常等待也被判为异常，指标接近100%。", "tau合理：能区分平均表现相近但尾部不同的算法。", "tau太高：长等待率接近0，失去区分力。"],
      assumptions: ["等待起止定义一致。", "阈值在比较算法前确定，不能看完结果后挑选。", "平均等待与长等待率应同时报告。"]
    },
    {
      id: "learningRate",
      title: "学习率与旧经验衰减",
      category: "Q-learning · 更新速度",
      evidenceLevel: "递推公式及闭式解",
      purpose: "解释Q-AWED每次获得新奖励后，应该把旧Q值向新目标移动多大比例。",
      formalFormula: "Q_new = Q_old + alpha*(Target-Q_old)",
      plainFormula: "新经验分数 = 旧分数 + 学习速度 × 本次目标与旧分数的差距",
      derivationSteps: ["误差Target-Q_old表示当前估计离新目标还有多远。", "乘alpha表示本次只修正误差的一部分；alpha=0完全不学，alpha=1完全用新目标覆盖旧值。", "整理可得Q_new=(1-alpha)Q_old+alpha*Target，因此它是旧值和新目标的加权平均。", "当Target固定并重复n次时，展开递推得到Q_n=(1-alpha)^n Q_0+[1-(1-alpha)^n]Target。"],
      variables: [
        variable("Q_old", "更新前Q值", "状态s下选择权重策略a的旧经验回报。", "奖励分", "Q表", "Q[s][a]"),
        variable("Q_new", "更新后Q值", "吸收本次反馈后的新经验回报。", "奖励分", "Q表更新", "Q_old+alpha*(Target-Q_old)"),
        variable("alpha", "学习率", "一次更新吸收新误差的比例。", "0到1", "输入参数", "直接读取 learningRate"),
        variable("Target", "学习目标", "即时奖励加上下一个状态可获得的折扣价值。", "奖励分", "训练轨迹", "r+gamma*max_a Q(s_next,a)"),
        variable("n", "重复更新次数", "同一状态动作接受相似目标的次数。", "次", "训练访问计数", "该状态动作的更新次数")
      ],
      subFormulas: ["Target=r+gamma*max Q(s_next,a)。", "旧经验剩余比例=(1-alpha)^n。", "新目标累计占比=1-(1-alpha)^n。", "半衰更新次数 n_1/2=ln(0.5)/ln(1-alpha)。"],
      dimensionCheck: ["Target与Q_old都是奖励分，因此差值也是奖励分。", "alpha无单位，alpha*(Target-Q_old)仍为奖励分，可与Q_old相加。"],
      dataPipeline: ["编码当前交通状态s并选择权重动作a。", "执行派梯后由等待、能耗和长等待计算奖励r。", "观察下一状态s_next，计算Target并更新Q[s][a]。", "记录更新曲线和多种子波动，验证推荐范围。"],
      workedExample: ["Q_old=20、Target=10。alpha=0.1时Q_new=20+0.1*(-10)=19，只移动1分。", "alpha=0.3时Q_new=17，一次移动3分，因此0.3明显更敏感。", "重复10次且Target保持10：alpha=0.1的新目标占比1-0.9^10≈65.1%；alpha=0.3时为1-0.7^10≈97.2%。"],
      functionProperties: ["固定Target时，误差按(1-alpha)^n指数衰减。", "alpha越大半衰期越短，适应变化更快，但随机奖励的影响也保留更多。", "alpha=0是完全不更新的边界；alpha=1是完全覆盖的边界。"],
      rangeReasoning: ["0.12-0.24让新目标在10次相似更新后约占72%-94%，既能在有限训练内改变策略，又不会让单次噪声完全控制Q值。", "默认0.18时，10次后新目标占比1-0.82^10≈86.3%，半衰期约3.5次更新。", "该范围不是普适定理，必须结合奖励噪声、状态访问频率和敏感性曲线验证。"],
      lowNormalHigh: ["alpha约0.1：10次后仍保留约34.9%旧误差，变化较慢。", "alpha约0.18：兼顾跟随速度和平均噪声。", "alpha约0.3：10次后几乎完全跟随近期目标，交通随机时Q值更易震荡。"],
      assumptions: ["同一状态动作会被重复访问。", "奖励尺度稳定且有限。", "固定Target闭式解用于解释函数性质，真实Target会随轨迹变化。"]
    },
    {
      id: "discount",
      title: "折扣因子与有效决策视野",
      category: "Q-learning · 未来价值",
      evidenceLevel: "折扣回报定义",
      purpose: "控制一次派梯决策要重视多远的未来，因为当前最近的选择可能把电梯送到不利位置并造成后续拥堵。",
      formalFormula: "G_t = sum(k=0..infinity) gamma^k*r_(t+k); H_eff ≈ 1/(1-gamma)",
      plainFormula: "长期回报 = 当前奖励 + 未来奖励×gamma + 更远奖励×gamma平方……",
      derivationSteps: ["第k步未来奖励乘gamma^k，让越远反馈权重越小。", "若每步奖励规模相近，权重总和是几何级数1+gamma+gamma^2+...=1/(1-gamma)。", "因此1/(1-gamma)可作为有效视野的直觉，但不是未来真正只看到这么多步。"],
      variables: [
        variable("G_t", "折扣累计回报", "从时刻t开始考虑的当前与未来奖励总和。", "奖励分", "Q学习目标", "sum gamma^k*r_(t+k)"),
        variable("gamma", "折扣因子", "每向未来一步保留的价值比例。", "0到1", "输入参数", "直接读取 discount"),
        variable("r_(t+k)", "未来奖励", "第k步后由服务结果产生的反馈。", "奖励分", "奖励函数", "等待、能耗、停站和负载的加权负值"),
        variable("k", "未来距离", "奖励距离当前决策的步数。", "步数索引", "时间循环", "0,1,2,..."),
        variable("H_eff", "有效视野", "累计权重相当于多少个当前权重的近似。", "步", "几何级数近似", "1/(1-gamma)")
      ],
      subFormulas: ["第10步权重=gamma^10。", "Q学习目标Target=r+gamma*max Q(s_next,a)。"],
      dimensionCheck: ["gamma和gamma^k无单位，乘奖励后仍是奖励分。", "1/(1-gamma)按步数直觉解释，不是物理时间；乘Delta_t才可换成秒。"],
      dataPipeline: ["每次派梯后计算即时奖励r。", "从Q表读取下一状态最大价值。", "用gamma形成Target并交给alpha更新。"],
      workedExample: ["gamma=0.88时H_eff≈8.33步，第10步权重0.88^10≈0.279。", "gamma=0.5时第10步权重仅约0.001，几乎只看眼前。", "gamma=0.98时H_eff≈50步，遥远噪声也会强烈进入目标。"],
      functionProperties: ["gamma^k对k指数衰减。", "H_eff在gamma接近1时快速发散，所以0.94到0.99的变化远大于0.4到0.45。"],
      rangeReasoning: ["0.82-0.94对应约5.6-16.7步的有效视野，能够看到派梯后的若干请求，又避免极远反馈占比过大。", "默认0.88与当前场景的短期位置后果相匹配；范围需通过奖励稳定性验证。"],
      lowNormalHigh: ["过低：只追求当前最近，可能制造后续拥堵。", "适中：兼顾当前乘客和轿厢下一段位置。", "过高：目标方差和信用分配难度增加，学习变慢。"],
      assumptions: ["未来奖励与当前动作存在因果关联。", "任务持续或终止处理正确。", "有效视野公式是解释近似，不是严格截断点。"]
    },
    {
      id: "epsilonStart",
      title: "初始探索率与指数衰减",
      category: "Q-learning · 探索策略",
      evidenceLevel: "epsilon-greedy策略定义",
      purpose: "让Q-AWED在训练初期尝试尚不熟悉的权重方案，随后逐渐使用目前表现最好的方案。",
      formalFormula: "epsilon_e = epsilon_0*d^e; E[N_explore] = sum(epsilon_e)",
      plainFormula: "第e轮随机尝试的概率 = 初始尝试概率 × 每轮保留比例的e次方",
      derivationSteps: ["epsilon-greedy在概率epsilon下随机选动作，在1-epsilon下选Q值最大的动作。", "每轮乘固定保留比例d，因此第e轮为epsilon_0*d^e，这是指数衰减。", "每轮探索事件的期望是epsilon_e，把各轮概率相加得到预计探索轮数。"],
      variables: [
        variable("epsilon_e", "第e轮探索率", "当前随机尝试非贪心策略的概率。", "0到1", "训练循环", "epsilon_0*d^e"),
        variable("epsilon_0", "初始探索率", "训练开始时随机尝试的概率。", "0到1", "输入参数", "直接读取 epsilonStart"),
        variable("d", "衰减保留比例", "每轮保留上一轮探索率的比例。", "0到1", "程序常量", "当前epsilonDecay=0.985"),
        variable("e", "训练轮次索引", "从训练开始经过的回合数。", "轮", "训练循环", "0到N_train-1"),
        variable("E[N_explore]", "预计探索量", "训练期间随机探索事件数量的期望。", "次", "概率求和", "sum epsilon_e")
      ],
      subFormulas: ["有限轮数求和：sum(e=0..N-1) epsilon_0*d^e = epsilon_0*(1-d^N)/(1-d)。", "探索半衰轮数=ln(0.5)/ln(d)。"],
      dimensionCheck: ["所有概率与d均无单位。", "概率逐轮求和得到期望次数。"],
      dataPipeline: ["训练开始设置epsilon=epsilon_0。", "每轮动作选择时由随机数判断探索或利用。", "一轮结束乘d；正式评估把epsilon设为0，避免随机探索污染性能结果。"],
      workedExample: ["epsilon_0=0.35表示训练开始约35%的选择用于探索。", "d=0.985时100轮后epsilon≈0.35*0.985^100≈0.077。", "180轮预计探索总量约0.35*(1-0.985^180)/(1-0.985)≈21.8个“整轮等效探索机会”。"],
      functionProperties: ["随e单调指数下降。", "epsilon_0只改变曲线起点；d同时决定下降速度和长期探索总量。"],
      rangeReasoning: ["0.25-0.45保证六种动作在训练初期有可见尝试机会，同时大多数选择仍可利用当前知识。", "默认0.35不是由单一闭式公式证明，而是结合六动作规模、180轮训练和策略稳定性选择。"],
      lowNormalHigh: ["过低：早期Q值偶然领先后容易被锁定。", "适中：先试多种权重，后期逐渐稳定。", "过高：大量选择随机，学习曲线噪声增加；若衰减慢，后期仍不稳定。"],
      assumptions: ["动作数有限且随机探索能覆盖各动作。", "评估时关闭探索。", "独立随机动作不保证访问稀有状态，状态覆盖还取决于交通生成器。"]
    },
    {
      id: "waitPenalty",
      title: "等待惩罚与多目标奖励",
      category: "奖励函数 · 乘客体验",
      evidenceLevel: "线性加权建模",
      purpose: "把等待、能耗、停站和长等待等不同目标放进一个可优化的奖励，并明确等待增加一单位需要付出多少扣分。",
      formalFormula: "P_W = lambda_w*W_bar; R = -(P_W + P_E + P_S + P_L + P_I)",
      plainFormula: "等待部分的扣分 = 等待权重 × 实际平均等待时间",
      derivationSteps: ["当前仿真先把所有请求的等待相加，再除以请求数得到平均等待W_bar。", "平均等待乘lambda_w形成等待项扣分P_W。", "P_W与移动、停站、长等待比例和负载项相加，最后取负号成为Q-learning奖励。", "当前实现没有把W_bar压缩到0到1，因此lambda_w带有奖励分/时间步的隐含单位。"],
      variables: [
        variable("P_W", "等待项扣分", "平均等待对总成本贡献的奖励分。", "奖励分", "rewardFromStep", "lambda_w*W_bar"),
        variable("lambda_w", "等待惩罚权重", "平均等待每增加1个时间步所增加的扣分。", "奖励分/时间步", "输入参数", "直接读取 waitPenalty"),
        variable("W_bar", "平均等待", "全部请求预计等待时间的算术平均。", "时间步", "调度估计", "sum(wait_i)/N"),
        variable("R", "总奖励", "Q-AWED用于评价当前状态动作结果的反馈。", "奖励分", "rewardFromStep", "各成本项相加后取负")
      ],
      subFormulas: ["W_bar=sum(wait_i)/N。", "边际影响：partial P_W/partial W_bar=lambda_w。", "总奖励中的等待斜率为partial R/partial W_bar=-lambda_w。"],
      dimensionCheck: ["lambda_w的隐含单位是奖励分/时间步，乘W_bar后得到奖励分。", "由于不同成本项使用不同原始单位，权重数值承担了单位换算与偏好表达两种作用。"],
      dataPipeline: ["从统一请求轨迹累计每个请求的预计等待。", "除以请求数得到W_bar。", "乘lambda_w形成P_W，并与其他成本项相加后取负。"],
      workedExample: ["W_bar=10步、lambda_w=1.35时，P_W=13.5分。", "W_bar=20步时P_W=27分；等待翻倍时线性扣分也翻倍。", "若lambda_w提高到1.90，同样20步等待会扣38分。"],
      functionProperties: ["固定lambda_w时，P_W关于W_bar是经过原点、斜率lambda_w的上升直线。", "lambda_w越大直线越陡；线性等待项之外仍用长等待比例保护分布尾部。"],
      rangeReasoning: ["1.20-1.90使常见等待尺度下的等待项保持主要影响，同时给能耗、停站和负载留出作用空间。", "该范围依赖当前时间步定义和其他奖励项尺度，不能跨不同仿真单位直接照搬。"],
      lowNormalHigh: ["过低：模型可能为少移动而容忍明显等待。", "适中：乘客体验优先，同时保留多目标权衡。", "过高：奖励近似退化为单目标等待最小化。"],
      assumptions: ["所有算法使用相同时间步定义。", "当前奖励使用实际平均等待而不是0到1归一化等待。", "线性权重属于研究偏好，范围应通过多场景敏感性分析验证。"]
    },
    {
      id: "energyPenalty",
      title: "能耗惩罚与边际斜率",
      category: "奖励函数 · 运行代价",
      evidenceLevel: "线性代理模型",
      purpose: "解释平均移动距离每增加一层，会使Q-AWED奖励下降多少，并明确该指标只是能耗代理。",
      formalFormula: "P_E = lambda_e*E_bar; Delta R/Delta E_bar = -lambda_e",
      plainFormula: "移动扣分 = 能耗权重 × 每个请求平均移动楼层数",
      derivationSteps: ["每个请求的移动代理等于接客距离加乘客起终点距离。", "对全部请求取平均得到E_bar，单位为楼层/请求。", "E_bar乘lambda_e形成能耗代理项扣分P_E。", "比较两个只在移动上不同的方案可得Delta R=-lambda_e*Delta E_bar。"],
      variables: [
        variable("P_E", "能耗代理项扣分", "平均移动对总成本贡献的奖励分。", "奖励分", "rewardFromStep", "lambda_e*E_bar"),
        variable("E_bar", "平均移动距离", "每个请求接客距离与载客距离之和的平均。", "楼层/请求", "estimateDispatch与评估累计", "sum(distanceToOrigin+travelDistance)/N"),
        variable("lambda_e", "能耗惩罚", "平均移动每增加一层/请求时的扣分强度。", "奖励分/(楼层/请求)", "输入参数", "直接读取 energyPenalty"),
        variable("Delta R", "奖励变化", "两个只在移动代理上不同的方案之间的奖励差。", "奖励分", "奖励函数差值", "-lambda_e*Delta E_bar")
      ],
      subFormulas: ["distanceToOrigin=|f_e-o_r|。", "travelDistance=|d_r-o_r|。", "E_bar=sum(distanceToOrigin+travelDistance)/N。", "若有功率数据，应改为Energy=sum(P_t*Delta_t)。"],
      dimensionCheck: ["lambda_e乘楼层/请求后得到奖励分。", "移动楼层数不是千瓦时，必须称为能耗代理，不能作为真实电耗结论。"],
      dataPipeline: ["派梯时计算电梯到起点距离和乘客行程。", "累加所有请求的移动楼层数并除以请求数。", "乘lambda_e形成奖励中的能耗代理扣分。"],
      workedExample: ["E_bar=5层/请求、lambda_e=0.45时，P_E=2.25分。", "E_bar=10层/请求时P_E=4.50分。", "若lambda_e提高到0.70，同样10层/请求会扣7分。"],
      functionProperties: ["关系为斜率固定的下降直线。", "lambda_e越大，直线越陡；lambda_e=0时完全忽略能耗。"],
      rangeReasoning: ["0.25-0.70使移动项能够改变等待接近的候选方案，同时通常不压过高峰等待项。", "该范围依赖楼层单位、建筑高度和当前代理定义，不能跨不同代理直接照搬。"],
      lowNormalHigh: ["过低：空驶和来回调动增加。", "适中：在等待相近时偏向较短路线。", "过高：为省移动延迟接客，平均及长等待上升。"],
      assumptions: ["当前代码使用实际平均移动楼层而不是0到1归一化能耗。", "代理指标与真实能耗方向大致一致。", "真实节能结论需要电机、载荷与再生制动数据验证。"]
    },
    {
      id: "longWaitPenalty",
      title: "长等待惩罚与阶跃函数",
      category: "奖励函数 · 尾部救援",
      evidenceLevel: "阈值惩罚建模",
      purpose: "让少数即将形成极端等待的乘客得到额外优先级，避免平均等待改善却有人被长期遗忘。",
      formalFormula: "P_L = lambda_l*L; L = sum I(W_i>=tau)/N",
      plainFormula: "长等待扣分 = 长等待权重 × 超过阈值的乘客比例",
      derivationSteps: ["对每名乘客计算指示函数I(W_i>=tau)：未达到阈值为0，达到或超过为1。", "把所有指示值相加并除以乘客数N，得到长等待比例L。", "L乘lambda_l形成当前整轮奖励中的长等待扣分P_L。", "单个乘客的判定关于W是阶跃的，但整轮扣分关于比例L是线性的。"],
      variables: [
        variable("P_L", "长等待项扣分", "长等待乘客比例对总成本贡献的奖励分。", "奖励分", "rewardFromStep", "lambda_l*L"),
        variable("lambda_l", "长等待惩罚", "长等待比例从0增加到1时的最大扣分强度。", "奖励分", "输入参数", "直接读取 longWaitPenalty"),
        variable("L", "长等待比例", "等待达到阈值的请求占全部请求的比例。", "0到1", "acc.longWait/acc.requests", "sum I_i/N"),
        variable("I", "指示函数", "判断第i名乘客等待是否达到阈值。", "0或1", "addMetric条件判断", "W_i>=tau时1，否则0"),
        variable("tau", "长等待阈值", "把普通等待与长等待分开的服务界线。", "时间步", "输入参数", "longWaitThreshold")
      ],
      subFormulas: ["I(W_i>=tau)={0,W_i<tau;1,W_i>=tau}。", "L=sum I_i/N。", "总奖励中的长等待项为R_L=-lambda_l*L。"],
      dimensionCheck: ["I和L都无单位，lambda_l为奖励分，所以P_L是奖励分。", "W_i与tau必须使用相同时间单位。"],
      dataPipeline: ["计算每个请求的预计等待W_i。", "与tau比较并累计长等待请求数。", "用长等待数除以请求数得到L，再乘lambda_l加入总成本。"],
      workedExample: ["100名乘客中25名达到tau，则L=25/100=0.25。", "lambda_l=5时P_L=5*0.25=1.25分。", "若L升到50%，P_L=2.5分；比例翻倍时扣分也翻倍。"],
      functionProperties: ["单个I关于W在tau处是阶跃函数。", "汇总后的P_L关于L是经过原点、斜率lambda_l的直线；lambda_l控制直线陡峭程度。"],
      rangeReasoning: ["4.5-7.5让一次长等待事件足以抵消若干普通小幅成本，但不应大到任何临界乘客都迫使系统频繁掉头。", "范围必须和总奖励其余项的尺度一起校准。"],
      lowNormalHigh: ["过低：模型仍可能牺牲少数乘客来改善平均数。", "适中：在尾部风险明显时启动救援。", "过高：为单个临界请求频繁打断路线，整体等待和停站增加。"],
      assumptions: ["tau事先确定且所有算法一致。", "尾部事件数量足够进行比例统计。", "当前实现按整轮长等待比例扣分，不是每名超阈值乘客各扣lambda_l分。"]
    },
    {
      id: "wait-normalization",
      title: "等待时间归一化得分",
      category: "统一评价 · 单项得分",
      evidenceLevel: "相对基准评分定义",
      purpose: "把不同算法的等待时间转换成0到100附近、方向统一的得分，使“等待越低越好”能够进入综合评分。",
      formalFormula: "WaitScore(a,s) = 100*min_b Wait(b,s)/Wait(a,s)",
      plainFormula: "某算法等待得分 = 100 × 本场景最短等待 / 该算法等待",
      derivationSteps: ["先在同一场景s找到所有算法中的最小平均等待，作为相对基准。", "用最小值除以算法a的等待；最佳算法比值为1，其他算法小于1。", "乘100把比例变成易读分数。使用除法是为了表达相对差距，而不是绝对时间差。"],
      variables: [
        variable("WaitScore(a,s)", "等待得分", "算法a在场景s的相对等待表现。", "分", "评分程序", "100*场景最小等待/算法等待"),
        variable("Wait(a,s)", "算法平均等待", "算法a在场景s多轮评估的平均等待。", "时间步", "评估均值", "mean episode average wait"),
        variable("min_b", "场景最佳基准", "场景s中所有比较算法的最小等待。", "时间步", "同一结果表", "min over algorithm b"),
        variable("a,s,b", "索引", "a为当前算法，s为场景，b遍历全部算法。", "无单位", "评分循环", "算法名和场景键")
      ],
      subFormulas: ["Wait_min(s)=min_b Wait(b,s)。", "WaitScore=100*Wait_min/Wait_a。"],
      dimensionCheck: ["时间步/时间步=无单位，再乘100得到分数。", "所有算法必须使用同一时间步和同一请求分布。"],
      dataPipeline: ["对每个算法用相同场景和种子计算平均等待。", "找到场景最小值。", "逐个算法计算相对得分，并保留原始等待和置信区间供核查。"],
      workedExample: ["场景最短等待为20步。算法A等待20步，得分100。", "算法B等待25步，得分100*20/25=80。", "算法C等待40步，得分50。"],
      functionProperties: ["固定最佳值时，得分随Wait按反比例下降。", "最佳算法为100；等待趋近无穷时得分趋近0。", "若比较集合改变，min基准可能改变，历史得分也会改变。"],
      rangeReasoning: ["该公式没有可调推荐范围，但等待必须为正，并应同时展示原始单位。", "相对评分适合统一量纲，不应替代均值、标准差和置信区间。"],
      lowNormalHigh: ["接近100：接近本场景最短等待。", "约70-90：存在可见差距但仍可能有其他目标优势。", "很低：等待显著高于场景最佳。"],
      assumptions: ["比较算法在完全相同的场景、种子和评估轮数下运行。", "最小等待大于0。", "评分是研究者定义的相对尺度，不是算法准确率。"]
    },
    {
      id: "scene-score",
      title: "单场景多目标综合评分",
      category: "统一评价 · 场景排名",
      evidenceLevel: "加权决策模型",
      purpose: "在一个场景中同时考虑平均等待、长等待、能耗、负载均衡、等待排名和交通适应性，而不是只按一个指标判断算法。",
      formalFormula: "SceneScore(a,s)=100*[0.50*WaitScore+0.15*LongWaitScore+0.13*EnergyScore+0.10*LoadScore+0.08*WaitRankScore+0.04*TrafficAdaptScore]",
      plainFormula: "场景总分 = 六个标准化单项分数按50%、15%、13%、10%、8%、4%加权相加",
      derivationSteps: ["先把六个指标统一到0到1或等价的百分制方向，全部变成越高越好。", "每项乘权重表示研究偏好：等待占50%，因此是最主要目标；长等待和能耗次之。", "权重相加为1，所以加权和仍位于统一尺度；最外层乘100转换成百分制。", "这不是由自然定律唯一推导的公式，而是透明的多准则决策定义，必须做权重敏感性分析。"],
      variables: [
        variable("SceneScore(a,s)", "场景综合分", "算法a在场景s的多目标表现。", "0到100分", "评分程序", "六项贡献之和"),
        variable("WaitScore", "等待得分", "相对最短平均等待的得分。", "0到1", "平均等待", "min(wait)/wait"),
        variable("LongWaitScore", "长等待得分", "相对较低长等待率的得分。", "0到1", "长等待率", "统一平滑后的相对比值"),
        variable("EnergyScore", "能耗得分", "相对较低移动代理的得分。", "0到1", "energyProxy", "min energy/current energy"),
        variable("LoadScore", "负载均衡得分", "相对较小电梯任务差异的得分。", "0到1", "loadImbalance", "min load/current load"),
        variable("WaitRankScore", "等待排名得分", "把等待名次映射成越靠前越高的分。", "0到1", "等待排序", "由名次线性映射"),
        variable("TrafficAdaptScore", "交通适应得分", "算法对当前方向和密度模式的先验适配评价。", "0到1", "方法评价表", "预先声明的适应性尺度")
      ],
      subFormulas: ["Contribution_wait=100*0.50*WaitScore，其他项同理。", "总权重=0.50+0.15+0.13+0.10+0.08+0.04=1.00。", "每个相对成本得分都应保留原始指标，避免百分制隐藏实际差异。"],
      dimensionCheck: ["六项分数均已无量纲，权重也无量纲，因此可以相加。", "乘100后单位为评分分数。", "若直接把等待步数和移动楼层相加，会发生量纲错误。"],
      dataPipeline: ["运行同场景、同请求序列的全部算法。", "计算六个原始指标及不确定性。", "按同一方向归一化并分别乘权重。", "保存每项贡献，场景分必须等于贡献之和，便于审计。"],
      workedExample: ["若六项标准化得分为0.95、0.90、0.80、0.85、1.00、0.90。", "加权和=0.50*0.95+0.15*0.90+0.13*0.80+0.10*0.85+0.08*1+0.04*0.90=0.915。", "SceneScore=91.5分；其中等待贡献47.5分，说明排名主要由乘客体验驱动。"],
      functionProperties: ["对每个单项分数都是单调线性的，某项提高不会直接降低总分。", "某项权重就是该项边际影响；等待得分提高0.1会使总分提高5分。"],
      rangeReasoning: ["50%等待权重体现研究目标“乘客优先”；其余50%用于尾部、公平、运行代价和适应性。", "这些权重必须作为研究设定公开，并测试小幅改变后总排名是否稳定。"],
      lowNormalHigh: ["某项权重过低：该目标即使明显恶化也难以改变排名。", "权重平衡：主要目标主导，同时次要目标能区分等待接近的算法。", "单项权重过高：综合评价退化为近似单指标排名。"],
      assumptions: ["所有单项得分方向一致且标准化方法固定。", "权重在看结果前确定或完整披露调整过程。", "TrafficAdaptScore若来自专家设定，必须与仿真指标分开标明。"]
    },
    {
      id: "composite-score",
      title: "跨场景通用性综合评分",
      category: "统一评价 · 通用性",
      evidenceLevel: "加权决策模型",
      purpose: "奖励在多个交通场景中持续表现良好的算法，而不是只在一个场景取得第一、换场景就明显退步。",
      formalFormula: "Composite(a)=0.62*AvgSceneScore(a)+0.20*Stability(a)+0.18*Adaptability(a)",
      plainFormula: "跨场景总分 = 62%平均表现 + 20%稳定性 + 18%交通适应能力",
      derivationSteps: ["先对六个场景的SceneScore求平均，表示总体性能水平。", "再计算场景分的离散程度；波动越小，Stability越高，避免平均分被少数极强场景掩盖。", "加入Adaptability，表达能否根据交通状态改变优化偏好的结构能力。", "三项权重相加为1，最终仍为百分制；62%保证实测场景表现是决定性部分。"],
      variables: [
        variable("Composite(a)", "跨场景综合分", "算法a的总体通用性评价。", "0到100分", "综合评分程序", "三项贡献之和"),
        variable("AvgSceneScore(a)", "平均场景分", "算法a在全部场景综合分的平均。", "0到100分", "六场景评分", "sum_s SceneScore(a,s)/K"),
        variable("Stability(a)", "稳定性得分", "场景分波动越小，得分越高。", "0到100分", "场景分标准差", "100-归一化后的场景分标准差"),
        variable("Adaptability(a)", "适应性得分", "算法是否能随交通模式调整策略的结构评价。", "0到100分", "预先声明的算法特征表", "Q-AWED因状态到权重策略映射获得高值"),
        variable("K", "场景数量", "纳入通用性比较的交通场景数。", "个", "场景套件", "当前K=6")
      ],
      subFormulas: ["AvgSceneScore=sum(SceneScore_s)/K。", "SceneSD=sqrt(sum((SceneScore_s-Avg)^2)/K)。", "当前程序把SceneSD映射为Stability；映射规则必须和结果一同披露。", "贡献分别为0.62*Avg、0.20*Stability、0.18*Adaptability。"],
      dimensionCheck: ["三项均为百分制分数，权重无单位，所以加权项单位一致。", "0.62+0.20+0.18=1.00，结果保持在可解释的百分制范围。"],
      dataPipeline: ["每个场景先用相同评价流程得到SceneScore。", "对场景分求平均和标准差，形成平均表现与稳定性。", "读取预先公开的Adaptability定义。", "计算三项贡献并按Composite排序，同时展示平均排名和最差排名交叉验证。"],
      workedExample: ["某算法AvgSceneScore=96.03、Stability=98.84、Adaptability=100。", "Composite=0.62*96.03+0.20*98.84+0.18*100=97.31。", "高分来自跨场景均分、低波动和自适应结构共同作用；不能只用“某几个场景第一”解释。"],
      functionProperties: ["对三项都是单调线性函数。", "平均场景分提高1分使Composite提高0.62分；稳定性提高1分贡献0.20分；适应性提高1分贡献0.18分。", "线性加权可审计，但结果会受场景集合和适应性定义影响。"],
      rangeReasoning: ["62%给予真实仿真表现最大权重，20%惩罚跨场景波动，18%体现Q-AWED研究主题中的自适应能力。", "必须进行去除Adaptability项、改变权重和增加场景后的敏感性分析，确认第一名不是评分设计强行产生。"],
      lowNormalHigh: ["只重平均：可能奖励少数场景极强、其他场景很差的方法。", "同时考虑均值和稳定性：更接近“普遍可用”。", "适应性权重过高：会在实测性能不足时仍偏袒学习型方法，应避免。"],
      assumptions: ["六个场景具有研究代表性且权重相同。", "Stability映射和Adaptability来源公开透明。", "综合分是决策框架，不是数学上唯一的算法真值。"]
    }
  ];

  const FORMULA_EXPLANATION_MAP = Object.fromEntries(
    FORMULA_EXPLANATIONS.map(record => [record.id, record])
  );

  function getFormulaExplanation(id) {
    return FORMULA_EXPLANATION_MAP[id] || null;
  }

  const api = { FORMULA_EXPLANATIONS, getFormulaExplanation };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QAWED_FORMULAS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
