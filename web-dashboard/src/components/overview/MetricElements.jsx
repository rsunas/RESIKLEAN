import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppSelect from '../AppSelect.jsx';
import { number, rate, RANGE_OPTIONS } from './formatMetrics.js';

export function RangeSelect({ range, onChange }) {
  return <AppSelect aria-label="Collection metrics date range" value={range} onChange={onChange} options={RANGE_OPTIONS} />;
}

export function MetricState({ request, empty, emptyText = 'No scheduled stops for this range', children }) {
  if (request.loading) return <div className="om-skeleton" role="status" aria-label="Loading metrics"><span /><span /><span /></div>;
  if (request.error) return <div className="om-empty" role="alert"><p>{request.error}</p><button type="button" onClick={request.retry}>Retry</button></div>;
  if (!request.data) return null;
  return <>{request.data.note && <p className="om-note">{request.data.note}</p>}{empty ? <p className="om-empty">{emptyText}</p> : children}</>;
}

export function Stat({ title, value, tone = '' }) {
  return <div className={`om-stat ${tone}`}><span>{title}</span><strong>{value}</strong></div>;
}

export function MetricBars({ data, valueKey, highlight, label, percentage = false }) {
  return <>
    <div className="om-chart" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} accessibilityLayer margin={{ top: 15, right: 8, left: -16, bottom: 5 }}>
          <CartesianGrid vertical={false} stroke="var(--om-border)" strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--om-muted)', fontSize: 11 }} minTickGap={8} />
          <YAxis domain={percentage ? [0, 100] : [0, 'auto']} allowDecimals={false} tickLine={false} axisLine={false} tickFormatter={value => percentage ? `${value}%` : value} tick={{ fill: 'var(--om-muted)', fontSize: 11 }} />
          <Tooltip cursor={{ fill: 'var(--om-surface)' }} contentStyle={{ background: 'var(--om-card)', borderColor: 'var(--om-border)', borderRadius: 12, color: 'var(--om-text)' }} formatter={value => [percentage ? rate(value) : number(value), percentage ? 'Completion rate' : 'Completed stops']} />
          <Bar dataKey={valueKey} maxBarSize={24} radius={[12, 12, 12, 12]} isAnimationActive={false}>
            {data.map((item, index) => <Cell key={item.key || item.label} fill={index === highlight ? 'var(--om-highlight)' : 'var(--om-light)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details className="om-data"><summary>View exact values</summary><table><caption>{label}</caption><thead><tr><th>Time</th><th>{percentage ? 'Completion rate' : 'Completed stops'}</th></tr></thead><tbody>{data.map(item => <tr key={item.key || item.label}><th>{item.label}</th><td>{percentage ? rate(item[valueKey]) : number(item[valueKey])}{percentage && ` (${number(item.completed)} / ${number(item.scheduled)})`}</td></tr>)}</tbody></table></details>
  </>;
}
