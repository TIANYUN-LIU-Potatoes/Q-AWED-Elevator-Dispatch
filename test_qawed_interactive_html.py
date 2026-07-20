from pathlib import Path
import json
import re
import unittest


HTML_PATH = Path(__file__).with_name("index.html")
PROJECT_ROOT = HTML_PATH.parent


class QAwedInteractiveHtmlTests(unittest.TestCase):
    longMessage = False

    def setUp(self):
        if not HTML_PATH.is_file():
            self.fail(f"required presentation entry point is missing: {HTML_PATH}")

        self.assets = {
            name: (PROJECT_ROOT / name).read_text(encoding="utf-8")
            for name in ["index.html", "styles.css", "simulation.js", "formula-explanations.js", "parameter-charts.js", "presentation.js"]
            if (PROJECT_ROOT / name).exists()
        }
        self.html = self.assets["index.html"]
        self.css = self.assets["styles.css"]
        self.parameter_chart_source = self.assets.get("parameter-charts.js", "")
        self.source = "\n".join(self.assets.values())

    def test_contains_parameter_controls_and_run_button(self):
        required_ids = [
            "floors",
            "elevators",
            "steps",
            "trainEpisodes",
            "evalEpisodes",
            "seed",
            "longWaitThreshold",
            "learningRate",
            "discount",
            "epsilonStart",
            "runSimulation",
            "resultsBody",
        ]
        for element_id in required_ids:
            self.assertIn(f'id="{element_id}"', self.html)

    def test_embeds_all_dispatch_algorithms_and_qawed_functions(self):
        for name in [
            "FCFS",
            "Nearest Car",
            "Collective/SCAN",
            "Static Zoning",
            "Destination Dispatch",
            "AI/RF/RL Heuristic",
            "Q-AWED",
        ]:
            self.assertIn(name, self.source)

        for function_name in [
            "evaluateAllAlgorithms",
            "trainQAwed",
            "runQAwedEpisode",
            "drawHorizontalRankChart",
            "renderResults",
        ]:
            self.assertRegex(self.source, rf"function\s+{function_name}\s*\(")

    def test_css_uses_responsive_research_tool_layout(self):
        self.assertIn("grid-template-columns", self.source)
        self.assertIn("@media", self.source)
        self.assertRegex(self.html, r"<canvas[^>]+id=\"scoreRankChart\"")
        self.assertRegex(self.html, r"<canvas[^>]+id=\"scenarioHeatmap\"")

    def test_has_two_views_scenario_tabs_and_score_formula(self):
        for element_id in [
            "introView",
            "scenarioView",
            "showIntroView",
            "showScenarioView",
            "scenarioTabs",
            "scenarioResultsBody",
            "scoreFormula",
            "overallFormulaSummary",
            "qawedFirstReason",
            "scenarioTitle",
            "scenarioParameterPanel",
            "scenarioPresetSummary",
            "scenarioParameterAdvice",
            "applyScenarioPreset",
            "rerunScenario",
            "policyStateExplanation",
            "policyPlanGuide",
            "paperConclusion",
            "literatureGuide",
        ]:
            self.assertIn(f'id="{element_id}"', self.html)

        for scenario_name in ["早高峰", "晚高峰", "商场", "医院", "办公楼", "住宅"]:
            self.assertIn(scenario_name, self.source)

        self.assertIn("综合评分", self.source)
        self.assertIn("通用性", self.source)
        self.assertIn("SceneScore(a,s)=100 × [0.50·WaitScore + 0.15·LongWaitScore + 0.13·EnergyScore + 0.10·LoadScore + 0.08·WaitRankScore + 0.04·TrafficAdaptScore]", self.source)
        self.assertIn("Composite(a)=0.62·AvgSceneScore(a)+0.20·Stability(a)+0.18·Adaptability(a)", self.source)
        self.assertIn("综合排名", self.source)
        self.assertIn("等待排名", self.source)

    def test_embeds_scenario_evaluation_and_view_switching_functions(self):
        for function_name in [
            "buildScenarioConfigs",
            "evaluateScenarioSuite",
            "calculateCompositeScores",
            "scenarioScoreRankRows",
            "renderScenarioTable",
            "renderScenarioParameterPanel",
            "applyScenarioConfigToInputs",
            "rerunSelectedScenario",
            "drawHorizontalRankChart",
            "drawScenarioHeatmap",
            "explainCompositeLeader",
            "renderPolicyExplanation",
            "renderPaperConclusion",
            "renderLiteratureGuide",
            "switchView",
            "renderAlgorithmGuide",
        ]:
            self.assertRegex(self.source, rf"function\s+{function_name}\s*\(")

    def test_defines_scenario_specific_qawed_parameter_presets(self):
        self.assertIn("SCENARIO_PROFILES", self.source)
        self.assertIn("SCENARIO_QAWED_PRESETS", self.source)
        for key in ["morning", "evening", "mall", "hospital", "office", "residential"]:
            self.assertRegex(self.source, rf'{key}:\s*\{{\s*key:\s*"{key}"')
        self.assertRegex(self.source, r"function\s+deriveScenarioPreset\s*\(")
        for field in ["learningRate", "waitPenalty", "longWaitPenalty"]:
            self.assertRegex(self.source, rf"{field}:\s*round2\(clamp\(")

    def test_scenario_presets_use_paper_grade_evaluation_episodes(self):
        default_match = re.search(r"DEFAULTS\s*=\s*\{[^}]+evalEpisodes:\s*(\d+)", self.source)
        self.assertIsNotNone(default_match)
        self.assertGreater(int(default_match.group(1)), 30)
        self.assertIn("evalEpisodes: Math.ceil(30 + 5*p.C + 4*p.R)", self.source)
        self.assertRegex(self.html, r'id="evalEpisodes"[^>]+min="30"')

    def test_replaces_ambiguous_charts_with_rank_and_heatmap_canvases(self):
        self.assertRegex(self.html, r"<canvas[^>]+id=\"scoreRankChart\"")
        self.assertRegex(self.html, r"<canvas[^>]+id=\"scenarioHeatmap\"")
        self.assertIn("跨场景排名热力图", self.source)
        self.assertIn("当前场景综合评分排名", self.source)

    def test_explains_qawed_policy_states_for_beginners(self):
        for phrase in ["状态不是楼层", "交通模式", "请求密度", "方向模式", "电梯繁忙程度"]:
            self.assertIn(phrase, self.source)

        for plan_name in ["Passenger-first", "Energy-saving", "Stop-reduction", "Load-balance", "Balanced", "Long-wait-rescue"]:
            self.assertIn(plan_name, self.source)

    def test_embeds_literature_sources_and_replication_boundaries(self):
        self.assertIn("LITERATURE_SOURCES", self.source)
        for phrase in [
            "Novel RL approach for efficient Elevator Group Control Systems",
            "Genetic algorithm for controllers in elevator groups",
            "Scheduling of Modern Elevators",
            "A Comparison of Traditional Elevator Control Strategies",
            "Elevator Selection with Destination Control System",
            "Elevator Scheduling Algorithms: FCFS, SSTF, SCAN, and LOOK",
            "不是直接照搬文献数值",
            "统一仿真环境",
        ]:
            self.assertIn(phrase, self.source)

        for url in [
            "https://arxiv.org/abs/2507.00011",
            "https://idus.us.es/items/8b857df9-8573-47cb-8159-7627e3600bda",
            "https://www.diva-portal.org/smash/get/diva2%3A811052/FULLTEXT01.pdf",
            "https://www.diva-portal.org/smash/get/diva2%3A811866/FULLTEXT01.pdf",
            "https://global.ctbuh.org/resources/papers/download/1050-elevator-selection-with-destination-control-system.pdf",
            "https://dev.to/thesaltree/elevator-scheduling-algorithms-fcfs-sstf-scan-and-look-2pae",
        ]:
            self.assertIn(url, self.source)

    def test_uses_presentation_chapters_and_directory_navigation(self):
        for section_id in ["research", "method", "evidence", "live-lab", "conclusion"]:
            self.assertIn(
                f'id="{section_id}"',
                self.html,
                msg=f'presentation section "{section_id}" is missing',
            )
            self.assertIn(
                f'href="#{section_id}"',
                self.html,
                msg=f'directory link for "{section_id}" is missing',
            )
        self.assertNotIn("运行控制", self.html, msg='legacy label "运行控制" must be removed')
        self.assertNotIn("阅读顺序", self.html, msg='legacy label "阅读顺序" must be removed')
        self.assertIn(
            'id="talkProgress"',
            self.html,
            msg='presentation progress element "talkProgress" is missing',
        )

    def test_loads_split_assets(self):
        references = {
            "styles.css": 'href="styles.css"',
            "simulation.js": 'src="simulation.js"',
            "presentation.js": 'src="presentation.js"',
        }
        for asset_name, reference in references.items():
            self.assertTrue(
                (PROJECT_ROOT / asset_name).is_file(),
                msg=f'required split asset "{asset_name}" does not exist',
            )
            self.assertIn(
                reference,
                self.html,
                msg=f'index.html does not reference split asset "{asset_name}"',
            )

    def test_explains_all_thirteen_parameters_mathematically(self):
        ids = ["floors", "elevators", "steps", "trainEpisodes", "evalEpisodes",
               "seed", "longWaitThreshold", "learningRate", "discount",
               "epsilonStart", "waitPenalty", "energyPenalty", "longWaitPenalty"]
        required_fields = [
            "formalFormula",
            "plainFormula",
            "variables",
            "reason",
            "property",
            "recommended",
            "low",
            "high",
            "assumption",
        ]
        object_body = r"[^{}]*"
        for parameter_id in ids:
            lookaheads = [
                rf'(?={object_body}\bkey\s*:\s*"{re.escape(parameter_id)}")',
                *(rf"(?={object_body}\b{field}\s*:)" for field in required_fields),
            ]
            metadata_object = re.compile(
                r"\{" + "".join(lookaheads) + object_body + r"\}",
                re.DOTALL,
            )
            self.assertRegex(
                self.source,
                metadata_object,
                msg=(
                    f'parameter metadata for "{parameter_id}" must define key, '
                    f'{", ".join(required_fields)} in the same object'
                ),
            )
        for phrase in ["函数性质", "推荐范围", "过低", "过高", "适用前提"]:
            self.assertIn(
                phrase,
                self.source,
                msg=f'global mathematical explanation phrase "{phrase}" is missing',
            )
        for element_id in ["parameterPlainFormula", "parameterVariableTable", "parameterStateVisuals", "parameterSubstitution"]:
            self.assertIn(f'id="{element_id}"', self.html)
        for phrase in ["学术公式", "通俗公式", "为什么使用这个函数"]:
            self.assertIn(phrase, self.source)

    def test_has_animations_tables_and_statistical_evidence(self):
        for element_id in ["algorithmStage", "qawedDecisionFlow", "parameterCurve",
                           "waitComparisonChart", "scoreContributionChart",
                           "rankMatrix", "parameterTable", "algorithmTable"]:
            self.assertIn(
                f'id="{element_id}"',
                self.html,
                msg=f'presentation element "{element_id}" is missing',
            )
        for phrase in ["标准差", "95% 置信区间", "平均排名", "最差排名"]:
            self.assertIn(
                phrase,
                self.source,
                msg=f'statistical evidence phrase "{phrase}" is missing',
            )

    def test_has_specialized_parameter_boundary_charts(self):
        self.assertIn('src="parameter-charts.js"', self.html)
        self.assertLess(
            self.html.index('src="parameter-charts.js"'),
            self.html.index('src="presentation.js"'),
        )
        for element_id in [
            "specialParameterCharts",
            "specialChartFormula",
            "coverageChartPanel",
            "coverageChart",
            "boundaryChartPair",
            "lowerBoundaryChart",
            "upperBoundaryChart",
            "lowerBoundaryExplanation",
            "upperBoundaryExplanation",
            "boundaryChartSummary",
        ]:
            self.assertIn(f'id="{element_id}"', self.html)
        for css_class in ["boundary-chart-pair", "boundary-chart-card", "chart-axis-note"]:
            self.assertIn(f".{css_class}", self.css)
        self.assertIn("#parameterCurve[hidden]", self.css)

    def test_routes_seven_parameters_to_specialized_charts(self):
        for key in [
            "trainEpisodes",
            "learningRate",
            "discount",
            "epsilonStart",
            "waitPenalty",
            "energyPenalty",
            "longWaitPenalty",
        ]:
            self.assertIn(key, self.parameter_chart_source)
        for name in ["renderSpecialParameterCharts", "drawBoundaryChart", "drawCoverageChart"]:
            self.assertIn(name, self.source)

    def test_algorithm_animation_supports_continuous_comparison(self):
        for element_id in [
            "demoMode",
            "comparisonAlgorithm",
            "algorithmTimeline",
            "stepAlgorithm",
            "featureStage",
            "comparisonStage",
        ]:
            self.assertIn(f'id="{element_id}"', self.html)
        self.assertIn("16 秒", self.source)

    def test_npm_dev_entrypoint_serves_the_site_locally(self):
        package_path = PROJECT_ROOT / "package.json"
        server_path = PROJECT_ROOT / "dev-server.js"
        self.assertTrue(package_path.exists(), "package.json should exist so npm run dev works")
        self.assertTrue(server_path.exists(), "dev-server.js should serve the local HTML site")

        package = json.loads(package_path.read_text(encoding="utf-8"))
        self.assertEqual(package["scripts"]["dev"], "node dev-server.js")
        self.assertEqual(package["scripts"]["test"], "python3 test_qawed_interactive_html.py && node --test test_simulation.js test_parameter_charts.js")

        server_code = server_path.read_text(encoding="utf-8")
        for phrase in ["http.createServer", "server.listen", "openUrl", "5173", "index.html"]:
            self.assertIn(phrase, server_code)

    def test_all_academic_formulas_open_one_complete_explanation(self):
        knowledge_path = PROJECT_ROOT / "formula-explanations.js"
        self.assertTrue(knowledge_path.exists(), "formula knowledge module is missing")
        self.assertIn('src="formula-explanations.js"', self.html)

        for element_id in [
            "formulaExplainer",
            "formulaExplainerTitle",
            "formulaExplainerMeta",
            "formulaExplainerBody",
            "closeFormulaExplainer",
        ]:
            self.assertIn(f'id="{element_id}"', self.html)

        for formula_id in [
            "floors", "elevators", "steps", "trainEpisodes", "evalEpisodes",
            "seed", "longWaitThreshold", "learningRate", "discount",
            "epsilonStart", "waitPenalty", "energyPenalty", "longWaitPenalty",
            "wait-normalization", "scene-score", "composite-score",
        ]:
            self.assertIn(formula_id, self.source)

        for phrase in [
            "公式如何一步步得到",
            "完整变量来源",
            "量纲检查",
            "代入一个完整例子",
            "成立条件与限制",
        ]:
            self.assertIn(phrase, self.source)

        self.assertIn("data-formula-id", self.source)
        self.assertIn("formula-table-entry", self.source)
        self.assertIn('data-label="计算方法"', self.source)
        self.assertIn("formula-variable-table td::before", self.source)
        self.assertIn("openFormulaExplanation", self.source)
        self.assertIn("renderFormulaExplanation", self.source)


if __name__ == "__main__":
    unittest.main()
