import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "../shared/ui";
import { envTag, t } from "../i18n";
import { dep } from "../config";
import { MerchantApp } from "./MerchantApp";
import "../shared/theme.css";
import "../console/console.css";
import "./merchant.css";

document.title = envTag(dep.environment === "rehearsal") + t("AgentVault 商家入驻", "AgentVault Merchant Onboarding");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <MerchantApp />
    </Providers>
  </React.StrictMode>,
);
