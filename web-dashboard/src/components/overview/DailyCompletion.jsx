import { useState } from 'react';
import AppSelect from '../AppSelect.jsx';
import { MetricBars, MetricState, Stat } from './MetricElements.jsx';
import { rate, shortDay } from './formatMetrics.js';
import { useDailyCompletion } from './useOverviewMetrics.js';

export default function DailyCompletion({ token }) {
  const [range, setRange] = useState('7d');
  const request = useDailyCompletion(token, range);
  const data = request.data;
  const days = data?.days.map(day => ({ ...day, key: day.date, label: day.date === data.end ? 'Today' : shortDay(day.date) })) || [];
  return <section className="om-card" aria-labelledby="om-daily-title">
    <header className="om-header"><div><h3 id="om-daily-title">Daily stop completion rate</h3><p>Share of scheduled stops completed each day</p></div><AppSelect aria-label="Daily completion date range" value={range} onChange={setRange} options={[{ value: '7d', label: 'Last 7 days' }, { value: '14d', label: 'Last 14 days' }]} /></header>
    <MetricState request={request} empty={!days.some(day => day.scheduled)}>
      {data && <><div className="om-stats om-inline-stats"><Stat title="Period average" value={rate(data.average)} /><Stat title="Best day" value={rate(data.best)} /><Stat title="Today so far" value={rate(data.todayRate)} /></div>{data.delta != null && <span className="om-badge">{data.delta > 0 ? '+' : ''}{data.delta} pts vs previous {range === '7d' ? '7' : '14'} days</span>}
        <MetricBars data={days} valueKey="rate" highlight={days.length - 1} percentage label="Daily stop completion rate. Use left and right arrow keys on the chart to inspect values." /></>}
    </MetricState><footer className="om-footer">Today is still in progress and may rise as routes finish. Days without scheduled stops have no rate.</footer>
  </section>;
}
