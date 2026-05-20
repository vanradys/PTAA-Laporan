export type ApiRequestOptions = RequestInit & {
  responseType?: "json" | "text" | "blob";
};

function applyApiBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  const baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

  if (!baseUrl) {
    return input;
  }

  if (typeof input === "string") {
    return input.startsWith("/") ? `${baseUrl}${input}` : input;
  }

  if (input instanceof URL) {
    const url = input.toString();
    return url.startsWith("/") ? new URL(`${baseUrl}${url}`) : input;
  }

  return input;
}

export async function apiRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { responseType = "json", headers, ...init } = options;

  const response = await fetch(applyApiBaseUrl(input), {
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
