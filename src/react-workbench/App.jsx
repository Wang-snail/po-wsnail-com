import { useEffect, useState } from "react";
import { Card, Metric, ProgressBar, Text } from "@tremor/react";
import { Background, Handle, Position, ReactFlow } from "@xyflow/react";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, DollarSign, FileSpreadsheet, RefreshCw, ShieldAlert, Target, TrendingUp, UploadCloud } from "lucide-react";
import { Badge, Button, Panel } from "./ui.jsx";
import "./styles.css";
import "@xyflow/react/dist/style.css";

const workflowNodes = [
  { id: "upload", position: { x: 0, y: 28 }, data: { icon: UploadCloud, title: "上传表格", desc: "BS榜单 / 产品列表 / 评论" }, type: "workflow" },
  { id: "clean", position: { x: 210, y: 28 }, data: { icon: FileSpreadsheet, title: "字段标准化", desc: "ASIN归并 / 去重 / 标签" }, type: "workflow" },
  { id: "analyze", position: { x: 420, y: 28 }, data: { icon: BarChart3, title: "市场分析", desc: "容量 / 竞争 / 价格带" }, type: "workflow" },
  { id: "decision", position: { x: 630, y: 28 }, data: { icon: ShieldAlert, title: "决策报告", desc: "ROI / 风险 / 下一步" }, type: "workflow" }
];

const workflowEdges = [
  { id: "upload-clean", source: "upload", target: "clean", animated: true },
  { id: "clean-analyze", source: "clean", target: "analyze", animated: true },
  { id: "analyze-decision", source: "analyze", target: "decision", animated: true }
];

function WorkflowNode({ data }) {
  const Icon = data.icon;
  return (
    <div className="rw-flow-node">
      <Handle type="target" position={Position.Left} />
      <Icon size={18} aria-hidden="true" />
      <strong>{data.title}</strong>
      <span>{data.desc}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

function scrollToAnalyzer() {
  document.querySelector(".rw-command-layout, .workbench-layout")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startFullReport(keyword = "") {
  const targetInput = document.getElementById("targetProductName");
  if (targetInput && keyword) {
    targetInput.value = keyword;
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const dropZone = document.getElementById("dropZone");
  dropZone?.classList.add("rw-attention");
  window.setTimeout(() => dropZone?.classList.remove("rw-attention"), 1800);
  if (dropZone) {
    dropZone.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    scrollToAnalyzer();
  }
}

function loadSample() {
  document.getElementById("loadSampleBtn")?.click();
  scrollToAnalyzer();
}

function utmPath(path, source, medium = "home", campaign = "activation") {
  const url = new URL(path, "https://po.wsnail.com");
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", campaign);
  return `${url.pathname}${url.search}${url.hash}`;
}

function campaignSlug(value) {
  return String(value || "amazon_product")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42) || "amazon_product";
}

function knownQuickProfile(lower) {
  if (/cat water fountain|pet fountain|猫.*饮水|猫.*水/.test(lower)) {
    return {
      market: 72,
      competition: 61,
      profit: 84,
      chances: ["静音泵", "易清洗结构", "多猫场景", "滤芯复购"],
      risks: ["头部评论壁垒明显", "滤芯售后成本需核算", "低价款容易压缩利润"]
    };
  }
  if (/dog bed|pet bed|狗窝|宠物床/.test(lower)) {
    return {
      market: 76,
      competition: 74,
      profit: 63,
      chances: ["可拆洗", "大狗支撑", "防水底部", "冬夏两用"],
      risks: ["体积物流成本高", "价格带拥挤", "材质差评容易集中"]
    };
  }
  if (/standing desk|升降桌/.test(lower)) {
    return {
      market: 68,
      competition: 79,
      profit: 58,
      chances: ["小户型尺寸", "安装简化", "电机质保", "线缆收纳"],
      risks: ["大件运输风险", "售后成本高", "品牌和评论壁垒强"]
    };
  }
  return null;
}

function quickChances(lower) {
  if (/toy|玩具/.test(lower)) return ["套装组合", "安全材质", "礼品场景", "低价多件装"];
  if (/chair|椅/.test(lower)) return ["折叠收纳", "承重升级", "户外防水", "舒适坐垫"];
  if (/organizer|storage|收纳/.test(lower)) return ["空间细分", "透明可视", "模块化组合", "安装免打孔"];
  return ["细分场景", "结构优化", "套装价值", "非主流价格带"];
}

function quickRisks(lower, competition) {
  const base = competition > 70 ? ["头部集中度可能偏高"] : ["需要验证真实搜索量"];
  if (/electronic|charger|电|battery/.test(lower)) base.push("电子/认证风险需要提前排查");
  if (/baby|kids|婴|儿童/.test(lower)) base.push("儿童用品合规风险更高");
  base.push("轻报告未读取竞品表，结论只用于初筛");
  return base;
}

function buildQuickReport(keyword) {
  const text = String(keyword || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const known = knownQuickProfile(lower);
  const seed = Array.from(lower).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const market = known?.market ?? Math.min(88, 50 + seed % 34);
  const competition = known?.competition ?? Math.min(86, 42 + (seed * 3) % 42);
  const profit = known?.profit ?? Math.min(84, 48 + (seed * 7) % 36);
  const opportunity = Math.round(market * 0.35 + profit * 0.35 + (100 - competition) * 0.2 + 10);
  const grade = opportunity >= 78 ? "A-" : opportunity >= 68 ? "B+" : opportunity >= 58 ? "B" : "C";
  const decision = opportunity >= 72
    ? "可以继续研究，但需要用真实表格验证 ROI 和竞争壁垒。"
    : opportunity >= 58
      ? "适合初筛观察，不建议直接备货。"
      : "暂不适合直接推进，先补充数据确认需求。";
  return {
    keyword: text,
    market,
    competition,
    profit,
    opportunity,
    grade,
    decision,
    chances: known?.chances || quickChances(lower),
    risks: known?.risks || quickRisks(lower, competition)
  };
}

function QuickReportEntry() {
  const [keyword, setKeyword] = useState("cat water fountain");

  const submit = () => {
    startFullReport(keyword);
  };

  return (
    <div className="rw-quick-entry">
      <div className="rw-quick-action-grid">
        <div className="rw-quick-input">
          <label htmlFor="rwQuickKeyword">先输入一个产品关键词</label>
          <div>
            <input
              id="rwQuickKeyword"
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") submit();
              }}
              placeholder="例如 cat toy / dog bed / standing desk"
            />
            <Button type="button" onClick={submit}>生成轻报告</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, progress, tone }) {
  return (
    <Card className={`rw-metric-card rw-metric-${tone}`}>
      <Text>{label}</Text>
      <Metric>{value}</Metric>
      <ProgressBar value={progress} className="rw-progress" />
      <p>{hint}</p>
    </Card>
  );
}

function KpiCard({ icon, label, value, hint }) {
  return (
    <div className="rw-preview-kpi">
      <div className="rw-preview-kpi-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function UnitRow({ label, value, hint, tone = "neutral", strong = false }) {
  return (
    <div className={`rw-unit-row rw-unit-${tone} ${strong ? "rw-unit-strong" : ""}`}>
      <div>
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function RiskItem({ label, detail, level }) {
  const levelText = { high: "高", medium: "中", low: "低" }[level] || "中";
  return (
    <div className="rw-risk-item">
      <span className={`rw-risk-level rw-risk-${level}`}>{levelText}</span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function moveExistingNode({ node, mount, className, mountClassName }) {
  if (!node || !mount || mount.contains(node)) return null;
  const placeholder = document.createComment(`rw-original-position-${node.id || node.className || "node"}`);
  const parent = node.parentNode;
  parent?.insertBefore(placeholder, node);
  mount.appendChild(node);
  if (className) node.classList.add(className);
  if (mountClassName) mount.classList.add(mountClassName);

  return () => {
    if (className) node.classList.remove(className);
    if (mountClassName) mount.classList.remove(mountClassName);
    if (placeholder.parentNode) placeholder.parentNode.insertBefore(node, placeholder);
    placeholder.remove();
  };
}

function ReportPreview() {
  return (
    <Panel className="rw-report-preview">
      <div className="rw-report-overview">
        <div className="rw-score-ring">
          <strong>92</strong>
        </div>
        <div>
          <Badge tone="info">真实报告样例</Badge>
          <h3>强烈推荐做</h3>
          <p>Compact Folding Patio Chair 同时具备市场容量、利润空间和低评论切入口，建议尽快打样验证。</p>
        </div>
        <div className="rw-report-tags">
          <span><CheckCircle2 size={15} />市场容量充足</span>
          <span><CheckCircle2 size={15} />尾部机会明显</span>
        </div>
      </div>

      <div className="rw-preview-kpis">
        <KpiCard icon={<BarChart3 size={18} />} label="样本月销量" value="7,150" hint="成交需求明确" />
        <KpiCard icon={<Target size={18} />} label="净利率" value="58.7%" hint="安全边际高" />
        <KpiCard icon={<DollarSign size={18} />} label="预计利润" value="$3,698" hint="售完测算" />
        <KpiCard icon={<TrendingUp size={18} />} label="ROI" value="142%" hint="强推荐区间" />
      </div>

      <div className="rw-preview-detail-grid">
        <section className="rw-preview-section">
          <h4><RefreshCw size={18} />单件利润模型</h4>
          <div className="rw-unit-box">
            <UnitRow label="参考售价" value="$29.99" hint="主流成交价格带" />
            <UnitRow label="采购成本" value="-$7.00" tone="bad" />
            <UnitRow label="广告 + 平台成本" value="-$7.00" tone="bad" />
            <UnitRow label="头程尾程" value="-$2.44" tone="bad" />
            <UnitRow label="单件净利" value="$20.54" tone="good" strong />
          </div>
        </section>

        <section className="rw-action-plan">
          <h4>下一步动作</h4>
          <ol>
            <li><strong>尽快确认供应商报价和样品</strong><span>先锁定折叠收纳、轻量材质和阳台小空间场景。</span></li>
            <li><strong>首批小批量验证转化</strong><span>用 180-300 件测试精准词和尾部词，达标后再追加库存。</span></li>
          </ol>
        </section>
      </div>

      <div className="rw-preview-risk">
        <h4>风险评估</h4>
        <RiskItem level="low" label="评论壁垒低" detail="样本中存在多个低评论但有稳定销量的 ASIN，新品进入压力较小。" />
        <RiskItem level="low" label="利润安全边际高" detail="ROI 和净利率均处于强推荐区间，广告波动仍有缓冲。" />
        <RiskItem level="medium" label="需要验证供应链" detail="进入前仍需确认承重、折叠结构和包装破损率。" />
      </div>
    </Panel>
  );
}

export default function App() {
  const [activeStage, setActiveStage] = useState("target");

  useEffect(() => {
    const targetMount = document.getElementById("rwStepTargetMount");
    const uploadMount = document.getElementById("rwStepUploadMount");
    const generateMount = document.getElementById("rwStepGenerateMount");
    const resultMount = document.getElementById("rwWorkbenchResultMount");
    const moves = [
      moveExistingNode({
        node: document.querySelector(".analysis-command-panel .input-operator-card"),
        mount: targetMount,
        className: "is-in-workbench",
        mountClassName: "has-controls"
      }),
      moveExistingNode({
        node: document.getElementById("uploadOperatorCard"),
        mount: uploadMount,
        className: "is-in-workbench",
        mountClassName: "has-controls"
      }),
      moveExistingNode({
        node: document.querySelector(".analysis-command-panel .generate-operator-card"),
        mount: generateMount,
        className: "is-in-workbench",
        mountClassName: "has-controls"
      }),
      moveExistingNode({
        node: document.getElementById("roiInputPanel"),
        mount: generateMount,
        className: "is-in-workbench",
        mountClassName: "has-controls"
      }),
      moveExistingNode({
        node: document.querySelector(".workspace-results"),
        mount: resultMount,
        className: "is-in-workbench-result",
        mountClassName: "has-result"
      })
    ].filter(Boolean);

    if (moves.length) document.documentElement.classList.add("rw-full-workspace");
    const analyzeButton = document.getElementById("analyzeBtn");
    const sampleButton = document.getElementById("loadSampleBtn");
    const openReport = () => setActiveStage("report");
    analyzeButton?.addEventListener("click", openReport);
    sampleButton?.addEventListener("click", openReport);

    return () => {
      analyzeButton?.removeEventListener("click", openReport);
      sampleButton?.removeEventListener("click", openReport);
      moves.reverse().forEach(restore => restore());
      document.documentElement.classList.remove("rw-full-workspace");
    };
  }, []);

  const stages = [
    { id: "target", label: "输入目标", desc: "告诉系统要判断什么产品" },
    { id: "upload", label: "上传表格", desc: "一次放入竞品、评论和成本数据" },
    { id: "generate", label: "生成报告", desc: "确认参数并生成完整判断" },
    { id: "report", label: "查看报告", desc: "先看结论，再看证据" }
  ];

  return (
    <div className="rw-shell rw-command-center" data-testid="react-workbench">
      <div className="rw-page-workflow">
        <aside className="rw-step-rail" aria-label="分析步骤">
          <div className="rw-step-rail-head">
            <h2>开始分析</h2>
            <p>按步骤推进，不需要先理解复杂规则。</p>
          </div>
          <nav>
            {stages.map((stage, index) => (
              <button
                key={stage.id}
                type="button"
                className={`rw-step-nav ${activeStage === stage.id ? "is-active" : ""}`}
                onClick={() => setActiveStage(stage.id)}
              >
                <span>{index + 1}</span>
                <strong>{stage.label}</strong>
                <small>{stage.desc}</small>
              </button>
            ))}
          </nav>
          <div className="rw-step-rail-actions">
            <Button type="button" variant="secondary" onClick={loadSample}>查看样例报告</Button>
            <Button asChild variant="ghost">
              <a href={utmPath("/help.html#upload", "workbench_steps", "nav", "help")}>使用教程</a>
            </Button>
          </div>
        </aside>

        <main className="rw-step-pages">
          <section className={`rw-step-page ${activeStage === "target" ? "is-active" : ""}`}>
            <div className="rw-step-page-head">
              <Badge tone="info">第 1 步</Badge>
              <h2>输入目标产品</h2>
              <p>先告诉系统你要判断的产品，其他关键词和分析参数由系统自动补全。</p>
            </div>
            <div id="rwStepTargetMount" className="rw-workbench-control-mount">
              <div className="rw-upload-placeholder">
                <strong>目标输入加载中</strong>
                <span>稍后会显示产品名称和币种。</span>
              </div>
            </div>
            <div className="rw-page-actions">
              <Button type="button" onClick={() => setActiveStage("upload")}>
                下一步：上传表格 <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </div>
          </section>

          <section className={`rw-step-page ${activeStage === "upload" ? "is-active" : ""}`}>
            <div className="rw-step-page-head">
              <Badge tone="info">第 2 步</Badge>
              <h2>上传原始表格</h2>
              <p>把 BS 榜单、产品列表、5 点描述、评论和成本表一起拖进来。未识别字段会保留到 extra_fields。</p>
            </div>
            <div id="rwStepUploadMount" className="rw-workbench-control-mount">
              <div className="rw-upload-placeholder">
                <strong>上传区加载中</strong>
                <span>稍后会显示拖拽上传入口。</span>
              </div>
            </div>
            <div className="rw-page-actions">
              <Button type="button" variant="secondary" onClick={() => setActiveStage("target")}>上一步</Button>
              <Button type="button" onClick={() => setActiveStage("generate")}>
                下一步：生成报告 <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </div>
          </section>

          <section className={`rw-step-page ${activeStage === "generate" ? "is-active" : ""}`}>
            <div className="rw-step-page-head">
              <Badge tone="info">第 3 步</Badge>
              <h2>生成判断报告</h2>
              <p>完整报告会扣次数；查看样例报告不扣次数。ROI 计算器默认折叠，需要时再展开。</p>
            </div>
            <div id="rwStepGenerateMount" className="rw-workbench-control-mount">
              <div className="rw-upload-placeholder">
                <strong>生成按钮加载中</strong>
                <span>稍后会显示报告生成操作。</span>
              </div>
            </div>
            <div className="rw-page-actions">
              <Button type="button" variant="secondary" onClick={() => setActiveStage("upload")}>上一步</Button>
              <Button type="button" variant="secondary" onClick={loadSample}>查看样例报告</Button>
              <Button asChild variant="ghost">
                <a href={utmPath("/pricing.html", "workbench_steps", "nav", "pricing")}>购买次数</a>
              </Button>
            </div>
          </section>

          <section className={`rw-step-page rw-report-page ${activeStage === "report" ? "is-active" : ""}`}>
            <div id="rwWorkbenchResultMount" className="rw-workbench-result-mount">
              <ReportPreview />
            </div>
          </section>
        </main>
      </div>

      <Panel className="rw-flow-panel">
        <div className="rw-panel-head">
          <div>
            <Badge tone="info">处理路径</Badge>
            <h3>系统怎么处理你的表格</h3>
          </div>
          <p>所有上传文件先做字段标准化和 ASIN 归并，再进入市场、竞争、利润和风险判断。</p>
        </div>
        <div className="rw-flow-canvas">
          <ReactFlow
            nodes={workflowNodes}
            edges={workflowEdges}
            nodeTypes={nodeTypes}
            fitView
            preventScrolling={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
          >
            <Background gap={18} size={1} />
          </ReactFlow>
        </div>
      </Panel>
    </div>
  );
}

function initialResultSummary() {
  return typeof window !== "undefined" ? window.__poLastAnalysisSummary || null : null;
}

export function ResultDock() {
  const [summary, setSummary] = useState(initialResultSummary);

  useEffect(() => {
    const update = event => setSummary(event.detail || null);
    window.addEventListener("po:analysis-result", update);
    return () => window.removeEventListener("po:analysis-result", update);
  }, []);

  if (!summary) {
    return (
      <div className="rw-result-dock rw-result-empty" data-testid="react-result-dock">
        <div>
          <Badge tone="info">等待分析</Badge>
          <strong>生成报告后，这里会固定显示决策摘要。</strong>
          <p>右侧结果区会优先展示结论、ROI、风险和下一步动作，详细证据继续放在下方折叠区。</p>
        </div>
      </div>
    );
  }

  const tone = summary.level === "bad" ? "bad" : summary.level === "warn" ? "warn" : "good";

  return (
    <div className={`rw-result-dock rw-result-${tone}`} data-testid="react-result-dock">
      <div className="rw-result-main">
        <Badge tone={tone === "good" ? "info" : "warning"}>决策摘要</Badge>
        <h3>{summary.decisionLabel}</h3>
        <p>{summary.verdict}</p>
        <div className="rw-result-actions">
          {(summary.actions || []).slice(0, 3).map((item, index) => (
            <div key={`${index}-${item}`}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rw-result-metrics">
        <Card className="rw-result-card">
          <Text>预计利润</Text>
          <Metric>{summary.profit}</Metric>
          <p>{summary.riskLabel}</p>
        </Card>
        <Card className="rw-result-card">
          <Text>ROI</Text>
          <Metric>{summary.roi}</Metric>
          <p>项目可行指数 {summary.feasibility}/100</p>
        </Card>
        <Card className="rw-result-card">
          <Text>尾部机会</Text>
          <Metric>{summary.tailRatio}</Metric>
          <p>{summary.tailLabel}</p>
        </Card>
        <Card className="rw-result-card">
          <Text>数据可信</Text>
          <Metric>{summary.credibility}/100</Metric>
          <p>{summary.marketSummary}</p>
        </Card>
      </div>
      <div className="rw-result-paths">
        <div>
          <strong>{summary.mainPath?.label}</strong>
          <p>{summary.mainPath?.reason}</p>
        </div>
        <div>
          <strong>{summary.tailPath?.label}</strong>
          <p>{summary.tailPath?.reason}</p>
        </div>
      </div>
    </div>
  );
}
