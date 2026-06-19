import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

function getApiBaseUrl() {
  const envUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

  if (import.meta.env.DEV) {
    return envUrl || "http://localhost:5000";
  }

  // Production selalu memakai /api pada origin frontend. Vercel meneruskan
  // request tersebut ke Railway melalui rewrite sehingga cookie login tetap
  // first-party pada vercel.app maupun custom domain.
  return "";
}

const apiUrl = getApiBaseUrl();
setBaseUrl(apiUrl);

createRoot(document.getElementById("root")!).render(<App />);
