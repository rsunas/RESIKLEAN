import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useState } from 'react';
import AppSelect from '../AppSelect.jsx';
import { MetricState } from './MetricElements.jsx';
import { number, rangeLabel } from './formatMetrics.js';
import { useComplaintsByStatus } from './useOverviewMetrics.js';

const labels = { pending: 'Pending', verified: 'Verified', resolved: 'Resolved', rejected: 'Rejected' };
const dateOptions = [{ value: 'all', label: 'All dates' }, { value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: 'month', label: 'This month' }];

export default function ComplaintsByStatus({ token, area }) {
  const [dateRange, setDateRange] = useState('all');
  const request = useComplaintsByStatus(token, dateRange, area);
  const data = request.data;
  return <section className="om-card" aria-labelledby="om-complaints-title">
    <header className="om-header">
      <div><h3 id="om-complaints-title">Complaints by status</h3><p>{data ? `${number(data.total)} complaints` : 'Complaints'} · {rangeLabel(dateRange)}{area && ` · ${area}`}</p></div>
      <AppSelect aria-label="Complaint date range" value={dateRange} onChange={setDateRange} options={dateOptions} />
    </header>
    <MetricState request={request}>
      <div className="om-pie-row">
        <div className="om-pie" aria-label="Complaint status distribution">
          {data?.total ? <ResponsiveContainer width="100%" height="100%">
            <PieChart accessibilityLayer>
              <Pie data={data.statuses} dataKey="count" nameKey="status" stroke="var(--om-card)" strokeWidth={3} isAnimationActive={false}>
                {data.statuses.map(item => <Cell key={item.status} fill={`var(--om-${item.status})`} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [number(value), labels[name]]} contentStyle={{ background: 'var(--om-card)', borderColor: 'var(--om-border)', color: 'var(--om-text)' }} />
            </PieChart>
          </ResponsiveContainer> : <div className="om-pie-empty" role="img" aria-label="Empty complaint status pie chart; no complaints in this date range"><span>No data</span></div>}
        </div>
        <ul className="om-status-list" aria-label="Exact complaint counts">
          {data?.statuses.map(item => <li key={item.status}><span><i style={{ background: `var(--om-${item.status})` }} />{labels[item.status]}</span><b>{number(item.count)}</b><span>{item.percent}%</span></li>)}
        </ul>
      </div>
    </MetricState>
  </section>;
}
