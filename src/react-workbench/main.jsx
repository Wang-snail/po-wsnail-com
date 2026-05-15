import React from "react";
import { createRoot } from "react-dom/client";
import App, { ResultDock } from "./App.jsx";

const root = document.getElementById("reactWorkbenchHero");
const resultDock = document.getElementById("reactResultDock");

if (root) {
  root.classList.add("react-workbench-mounted");
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (resultDock) {
  createRoot(resultDock).render(
    <React.StrictMode>
      <ResultDock />
    </React.StrictMode>
  );
}
