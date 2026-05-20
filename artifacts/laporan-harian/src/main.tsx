import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const apiUrl = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "") || "http://localhost:5000";
setBaseUrl(apiUrl);

createRoot(document.getElementById("root")!).render(<App />);