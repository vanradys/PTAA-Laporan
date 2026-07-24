import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getSessionAuthToken } from "@/lib/sessionAuth";

function getApiBaseUrl() {
  const envUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

  if (import.meta.env.DEV) {
    return envUrl;
  }

  // Production memakai /api pada origin frontend. Vercel meneruskan request
  // ke backend melalui Cloudflare Tunnel sehingga cookie login tetap first-party.
  return "";
}

const apiUrl = getApiBaseUrl();
setBaseUrl(apiUrl);
setAuthTokenGetter(getSessionAuthToken);

createRoot(document.getElementById("root")!).render(<App />);
