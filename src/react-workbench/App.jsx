import { useEffect, useState } from "react";
import { Card, Metric, ProgressBar, Text } from "@tremor/react";
import { Background, Handle, Position, ReactFlow } from "@xyflow/react";
import { ArrowRight, BarChart3, CircleDollarSign, FileSpreadsheet, ShieldAlert, Sparkles, UploadCloud } from "lucide-react";
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

function MagicMetricBeam() {
  return (
    <div className="rw-magic-beam" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function scrollToAnalyzer() {
  document.querySelector(".workbench-layout")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadSample() {
  document.getElementById("loadSampleBtn")?.click();
  scrollToAnalyzer();
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

export default function App() {
  return (
    <div className="rw-shell" data-testid="react-workbench">
      <MagicMetricBeam />
      <div className="rw-hero-grid">
        <Panel className="rw-decision-panel">
          <div className="rw-eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            shadcn 工作台风格 · Tremor 数据摘要
          </div>
          <h2>先看结论，再展开证据</h2>
          <p className="rw-lead">
            面向亚马逊运营的分析工作台：上传表格后，系统优先输出是否值得做、ROI 安全边际、竞争风险和尾部切入口。
          </p>
          <div className="rw-action-row">
            <Button type="button" onClick={scrollToAnalyzer}>
              开始上传分析 <ArrowRight size={17} aria-hidden="true" />
            </Button>
            <Button type="button" variant="secondary" onClick={loadSample}>
              查看样例报告
            </Button>
            <Button asChild variant="ghost">
              <a href="/pricing">购买次数</a>
            </Button>
          </div>
          <div className="rw-decision-strip">
            <div>
              <span>最终建议</span>
              <strong>谨慎小批量测试</strong>
            </div>
            <div>
              <span>ROI 区间</span>
              <strong>18% - 32%</strong>
            </div>
            <div>
              <span>风险等级</span>
              <strong>中等偏高</strong>
            </div>
          </div>
        </Panel>

        <Panel className="rw-report-panel">
          <div className="rw-report-head">
            <Badge tone="warning">公开样例</Badge>
            <span>Cat Water Fountain</span>
          </div>
          <h3>可进入，但不要直接大货。</h3>
          <p>
            市场存在真实需求，主流价格带稳定；但评论壁垒和头部集中度不低，建议先验证静音泵、易清洗结构和滤芯复购成本。
          </p>
          <div className="rw-risk-list">
            <div><span>低评论高销量</span><strong>可继续研究</strong></div>
            <div><span>头部集中</span><strong>需要避开</strong></div>
            <div><span>广告敏感</span><strong>先小预算测</strong></div>
          </div>
        </Panel>
      </div>

      <div className="rw-dashboard-grid">
        <MetricCard label="市场容量" value="72/100" hint="销量与销售额达到可验证规模" progress={72} tone="market" />
        <MetricCard label="利润空间" value="B+" hint="成本和广告变化仍需保守测算" progress={84} tone="profit" />
        <MetricCard label="竞争风险" value="61/100" hint="头部强，但尾部仍有切口" progress={61} tone="risk" />
        <Card className="rw-mini-roi">
          <CircleDollarSign size={20} aria-hidden="true" />
          <Text>免费策略</Text>
          <Metric>3 + 5 次</Metric>
          <p>注册免费 3 次，邮箱验证后额外 5 次。</p>
        </Card>
      </div>

      <Panel className="rw-flow-panel">
        <div className="rw-panel-head">
          <div>
            <Badge tone="info">React Flow</Badge>
            <h3>分析流程可视化</h3>
          </div>
          <p>用户能看清数据从上传到决策报告的路径，增强信任感。</p>
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
