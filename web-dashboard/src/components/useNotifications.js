import { useCallback, useEffect, useRef, useState } from 'react';

export default function useNotifications({ token, apiUrl }) {
  const [filter, setFilter] = useState({ type: 'all', unread: false, page: 1, limit: 4, q: '', from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const controller = useRef(null);
  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/admin/notifications${path}`, { ...options, signal: options.signal || AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const result = await response.json();
    if (!response.ok || !result.success) throw Error(result.error || 'Notifications are unavailable. Please retry.');
    return result.data;
  }, [apiUrl, token]);
  const refresh = useCallback(async () => {
    if (!token) return;
    controller.current?.abort();
    if (filter.from && filter.to && filter.from > filter.to) { setLoading(false); return; }
    const current = new AbortController(); controller.current = current;
    const timeout = setTimeout(() => current.abort('timeout'), 15000);
    setLoading(true);
    try {
      const result = await request(`?${new URLSearchParams(filter)}`, { signal: current.signal });
      if (controller.current !== current || current.signal.aborted) return;
      const last = Math.max(1, Math.ceil(result.total / filter.limit));
      if (filter.page > last) { setFilter(previous => ({ ...previous, page: last })); return; }
      setData(result); setError('');
    } catch (failure) {
      if (controller.current === current && (!current.signal.aborted || current.signal.reason === 'timeout')) setError(failure instanceof Error ? failure.message : 'Notifications timed out. Please retry.');
    } finally { clearTimeout(timeout); if (controller.current === current) setLoading(false); }
  }, [filter, request, token]);
  useEffect(() => {
    setData(null); setError('');
  }, [token]);
  useEffect(() => {
    const searchDelay = setTimeout(() => void refresh(), 250);
    const visibleRefresh = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const timer = setInterval(visibleRefresh, 30000);
    window.addEventListener('focus', visibleRefresh);
    window.addEventListener('resiklean:notifications-changed', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { clearTimeout(searchDelay); clearInterval(timer); controller.current?.abort(); controller.current = null; window.removeEventListener('focus', visibleRefresh); window.removeEventListener('resiklean:notifications-changed', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [refresh]);
  const markRead = async ids => {
    if (!ids.length) return;
    await request('/read', { method: 'POST', body: JSON.stringify({ ids }) });
    await refresh();
  };
  return { data, loading, error, filter, refresh, markRead, changeFilter: patch => { setLoading(true); setFilter(previous => ({ ...previous, page: 1, ...patch })); }, getTarget: id => request(`/${encodeURIComponent(id)}/target`) };
}
