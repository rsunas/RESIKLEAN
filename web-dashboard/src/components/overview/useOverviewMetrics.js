import { useEffect, useState } from 'react';

// Each section owns its request/error state. Abort on filter changes so late
// responses can never appear under the next filter's labels.
function useMetric(endpoint, token, range = 'today', area = '') {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let controller;
    let disposed = false;
    const fetchData = async (initial = false) => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      if (initial) setState({ data: null, loading: true, error: '' });
      try {
        const base = import.meta.env.VITE_API_URL;
        if (!base) throw new Error('The dashboard API is not configured.');
        const params = new URLSearchParams({ range, ...(area ? { area } : {}) });
        const response = await fetch(`${base.replace(/\/$/, '')}/admin/overview/${endpoint}?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load metrics.');
        if (!disposed && !signal.aborted) setState({ data: body.data, loading: false, error: '' });
      } catch (error) {
        if (!disposed && !signal.aborted) setState(previous => ({ ...previous, loading: false, error: error.message }));
      }
    };
    fetchData(true);
    const refresh = () => { if (!document.hidden) fetchData(); };
    const interval = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [endpoint, token, range, area, retry]);
  return { ...state, retry: () => setRetry(value => value + 1) };
}

export const useCoverage = (token, range, area) => useMetric('coverage', token, range, area);
export const useDailyCompletion = (token, range) => useMetric('daily-completion', token, range);
export const useComplaintsByStatus = (token, range, area) => useMetric('complaints-by-status', token, range, area);
export const useStopsByHour = (token, range, area) => useMetric('stops-by-hour', token, range, area);
export const useFrequentlyUncompleted = token => useMetric('frequently-uncompleted', token);
