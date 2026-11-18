import { MetricBars, MetricState, RangeSelect, Stat } from './MetricElements.jsx';
import { hourLabel, number, rangeLabel } from './formatMetrics.js';
import { useStopsByHour } from './useOverviewMetrics.js';

export default function CompletedByHour({ token, range, area, onRange }) {
  const request = useStopsByHour(token, range, area);
  const data = request.data;
  const hours = data?.hours.map(hour => ({ ...hour, label: hourLabel(hour.hour) })) || [];
  return <section className="om-card" aria-labelledby="om-hour-title"><header className="om-header"><div><h3 id="om-hour-title">Completed stops by hour</h3><p>When collection activity is busiest · {rangeLabel(range)}{area && ` · ${area}`}</p></div><RangeSelect range={range} onChange={onRange} /></header>
    <MetricState request={request} empty={!hours.length} emptyText="No confirmed stop completions in this range">
      <div className="om-hour-stat"><Stat title="Confirmed completions" value={number(data?.total)} />{data?.peakHour != null && <span className="om-badge">Peak: {hourLabel(data.peakHour)}</span>}</div>
      <MetricBars data={hours} valueKey="count" highlight={hours.findIndex(hour => hour.hour === data?.peakHour)} label="Confirmed stop completions by Manila hour. Use left and right arrow keys on the chart to inspect values." />
    </MetricState><footer className="om-footer">Confirmed stop completions · Asia/Manila time</footer>
  </section>;
}
