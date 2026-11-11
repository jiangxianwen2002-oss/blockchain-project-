import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "../shared/ui";
import { envTag, t } from "../i18n";
import { dep } from "../config";
import { PlatformApp } from "./PlatformApp";
import "../shared/theme.css";
import "../shared/ticket.css";
import "../console/console.css";
import "../merchant/merchant.css";

document.title = envTag(dep.environment === "rehearsal") + t("AgentVault 平台仲裁", "AgentVault Arbitration");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <PlatformApp />
    </Providers>
  </React.StrictMode>,
);
