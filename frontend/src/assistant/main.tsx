import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "../shared/ui";
import { envTag, t } from "../i18n";
import { dep } from "../config";
import { AssistantApp } from "./AssistantApp";
import "../shared/theme.css";
import "../shared/ticket.css";
import "./assistant.css";

document.title = envTag(dep.environment === "rehearsal") + t("AgentVault 助手", "AgentVault Assistant");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <AssistantApp />
    </Providers>
  </React.StrictMode>,
);
