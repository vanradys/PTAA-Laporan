import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

function getApiBaseUrl() {
  const envUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const isVercelApp =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith("vercel.app");

  if (import.meta.env.DEV) {
    return envUrl || "http://localhost:5000";
  }

  // On Vercel, keep API calls same-origin so mobile browsers persist the
  // session cookie through the /api rewrite instead of treating Railway as a
  // third-party cookie context.
  if (isVercelApp) {
    return "";
  }

  return envUrl;
}

const apiUrl = getApiBaseUrl();
setBaseUrl(apiUrl);

createRoot(document.getElementById("root")!).render(<App />);
