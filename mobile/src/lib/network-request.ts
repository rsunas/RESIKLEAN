import { withTimeout } from './async-timeout';
import { requestNetworkRetry } from './network-recovery';

/** Bound a request and its JSON body. Mutations are never automatically replayed here. */
export async function requestJson<T = any>(url: string, options: RequestInit = {}, milliseconds = 15000): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const isRead = !options.method || options.method.toUpperCase() === 'GET';
  options.signal?.addEventListener('abort', abort);
  if (options.signal?.aborted) abort();
  try {
    return await withTimeout((async () => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (isRead && response.status >= 500) requestNetworkRetry();
      const payload = await response.json() as T;
      return { response, payload };
    })(), milliseconds);
  } catch (error) {
    if (isRead && !options.signal?.aborted) requestNetworkRetry();
    throw error;
  } finally {
    controller.abort();
    options.signal?.removeEventListener('abort', abort);
  }
}
