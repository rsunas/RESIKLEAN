import AppSelect from '../AppSelect.jsx';
import { MetricState, Stat } from './MetricElements.jsx';
import { number, rate, RANGE_OPTIONS, rangeLabel, syncTime } from './formatMetrics.js';
import { useCoverage } from './useOverviewMetrics.js';

export default function CollectionCoverage({ token, range, area, onRange, onArea }) {
  const request = useCoverage(token, range, area);
  const data = request.data;
  return <section className="om-card om-coverage" aria-labelledby="om-coverage-title">
    <header className="om-header"><div><p className="om-eyebrow">Collection tracking</p><h3 id="om-coverage-title">Collection coverage by route</h3><p>Stops completed against stops scheduled, per route · {rangeLabel(range)}</p></div>
      <div className="om-controls">
        <span className="om-badge" title="Latest data received from drivers, in Manila time. Offline drivers may not have uploaded their latest progress.">{data?.lastSyncedAt ? `● Synced ${syncTime(data.lastSyncedAt)}` : 'No uploads received'}</span>
        <div className="om-segmented" role="group" aria-label="Collection date range">{RANGE_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={range === option.value} onClick={() => onRange(option.value)}>{option.label}</button>)}</div>
        <AppSelect aria-label="Filter collection metrics by area" value={area || 'all'} onChange={value => onArea(value === 'all' ? '' : value)} options={[{ value: 'all', label: 'All areas' }, ...[...new Set([...(data?.areas || []), ...(area ? [area] : [])])].map(value => ({ value, label: value }))]} />
      </div>
    </header>
    <MetricState request={request} empty={!data?.routes.length}>
      {data && <><div className="om-stats"><Stat title={data.incomplete ? 'Known scheduled stops' : 'Scheduled stops'} value={number(data.scheduled)} /><Stat title="Completed stops" value={number(data.completed)} tone="om-green" /><Stat title="Remaining stops" value={number(data.remaining)} tone="om-amber" /><Stat title="Completion rate" value={rate(data.rate)} /></div>
        <div className="om-route-list">{data.routes.map(route => {
          const completed = route.matchedCompleted ?? route.completed;
          const completionRate = route.scheduled ? Math.round(completed / route.scheduled * 100) : null;
          return <div className="om-route-row" key={route.key}><strong title={route.name}>{route.name}</strong><div className="om-route-track" role="img" aria-label={`${route.name}: ${completed} of ${route.scheduled} stops completed`}><span style={{ width: `${completionRate ?? 0}%` }} /></div><span><b>{number(completed)} / {number(route.scheduled)}</b> · {rate(completionRate)}</span></div>;
        })}</div></>}
    </MetricState>
    <footer className="om-footer"><div className="om-legend"><span><i className="om-completed" />Completed</span><span><i className="om-remaining" />Remaining</span></div><p>Completed stops count once per day.</p><p>Offline uploads may take a moment to appear.</p></footer>
  </section>;
}
