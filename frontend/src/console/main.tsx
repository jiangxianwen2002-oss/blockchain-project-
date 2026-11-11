import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "../shared/ui";
import { envTag, t } from "../i18n";
import { dep } from "../config";
import { ConsoleApp } from "./ConsoleApp";
import "../shared/theme.css";
import "../shared/ticket.css";
import "./console.css";

document.title = envTag(dep.environment === "rehearsal") + t("AgentVault 控制台", "AgentVault Console");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <ConsoleApp />
    </Providers>
  </React.StrictMode>,
);
