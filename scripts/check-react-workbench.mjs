import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${message}`);
  }
}

const index = read("index.html");
assert(index.includes('id="reactWorkbenchHero"'), "index.html exposes the React workbench mount");
assert(index.includes("/public/react-workbench/workbench.css"), "index.html loads the React workbench stylesheet");
assert(index.includes("/public/react-workbench/workbench.js"), "index.html loads the React workbench bundle");
assert(index.includes('id="reactResultDock"'), "index.html exposes the React result dock mount");
assert(index.includes("po:analysis-result"), "index.html emits analysis results to React");

const appPath = "src/react-workbench/App.jsx";
assert(existsSync(resolve(root, appPath)), "React workbench source exists");

if (existsSync(resolve(root, appPath))) {
  const app = read(appPath);
  assert(app.includes("@xyflow/react"), "React Flow is used for the workflow visualization");
  assert(app.includes("@tremor/react"), "Tremor is used for metric cards");
  assert(app.includes("亚马逊新品机会判断器") || index.includes("亚马逊新品机会判断器"), "React workbench uses product-facing decision copy");
  assert(app.includes("data-testid=\"react-workbench\""), "React workbench has a stable test marker");
  assert(app.includes("function ResultDock"), "React result dock component exists");
  assert(app.includes("po:analysis-result"), "React result dock listens for analysis updates");
}

assert(existsSync(resolve(root, "public/react-workbench/workbench.js")), "built React workbench JS exists");
assert(existsSync(resolve(root, "public/react-workbench/workbench.css")), "built React workbench CSS exists");
