export type ApiRequestOptions = RequestInit & {
  responseType?: "json" | "text" | "blob";
};

function getApiBaseUrl(): string {
  const envValue = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (import.meta.env.DEV) {
    return envValue || "http://localhost:5000";
  }

  if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app")) {
    return "";
  }

  return envValue;
}

function buildApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string") {
    return input;
  }

  if (!input.startsWith("/api")) {
    return input;
  }

  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${input}` : input;
}

export async function apiRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { responseType = "json", headers, ...init } = options;

  const response = await fetch(buildApiUrl(input), {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  if (!response.ok) {
    let message = `HTTP ${response.status} ${response.statusText}`;

    try {
      const errorData = await response.json();

      if (typeof errorData?.message === "string") {
        message = errorData.message;
      } else if (typeof errorData?.error === "string") {
        message = errorData.error;
      }

      if (typeof errorData?.detail === "string") {
        message = `${message} - ${errorData.detail}`;
      }
    } catch {
      // Response error bukan JSON, pakai message default dari status HTTP.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  if (responseType === "text") {
    return (await response.text()) as T;
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  const text = await response.text();
  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}
