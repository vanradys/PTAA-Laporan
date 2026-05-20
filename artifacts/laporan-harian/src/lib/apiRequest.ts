export type ApiRequestOptions = RequestInit & {
  responseType?: "json" | "text" | "blob";
};

export async function apiRequest<T = unknown>(
  input: RequestInfo | URL,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { responseType = "json", headers, ...init } = options;

  const response = await fetch(input, {
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
