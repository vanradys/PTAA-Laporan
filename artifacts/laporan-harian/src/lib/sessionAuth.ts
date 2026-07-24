const SESSION_TOKEN_STORAGE_KEY = "ptaa.session_token";

export function getSessionAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const token = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY)?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function setSessionAuthToken(token: string): void {
  if (typeof window === "undefined") return;

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    clearSessionAuthToken();
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, normalizedToken);
  } catch {
    // Cookie session tetap menjadi jalur utama jika storage browser diblokir.
  }
}

export function clearSessionAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Tidak ada yang perlu dibersihkan jika storage browser tidak tersedia.
  }
}
