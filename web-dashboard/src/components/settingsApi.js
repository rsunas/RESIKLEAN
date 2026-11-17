const API_URL = import.meta.env.VITE_API_URL;

// Bound requests so an offline connection cannot leave Save spinning indefinitely.
export async function settingsRequest(path, token, { method = 'GET', body, signal } = {}) {
  if (!API_URL) throw new Error('The account service is unavailable. Please try again later.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = window.setTimeout(cancel, 15000);
  try {
    const multipart = body instanceof FormData;
    const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/${path}`, {
      method, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'Unable to save your changes. Please try again.');
    return result.data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Check your connection and try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Your changes have not been saved.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
