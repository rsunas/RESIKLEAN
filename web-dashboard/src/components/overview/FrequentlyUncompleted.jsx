import { MetricState } from './MetricElements.jsx';
import { number } from './formatMetrics.js';
import { useFrequentlyUncompleted } from './useOverviewMetrics.js';

export default function FrequentlyUncompleted({ token }) {
  const request = useFrequentlyUncompleted(token);
  const stops = request.data?.stops || [];
  return <section className="om-card" aria-labelledby="om-frequent-title"><header className="om-header"><div><h3 id="om-frequent-title">Frequently uncompleted stops</h3><p>Locations that repeatedly miss collection, last 30 days</p></div></header>
    <MetricState request={request} empty={!stops.length} emptyText="No uncompleted stops recorded for closed routes or days">
      <ol aria-label="Ranked uncompleted stops. Scroll for more results." className="om-missed-list" tabIndex={0}>{stops.map((stop, index) => <li key={stop.key}><span className="om-rank">{index + 1}</span><div className="om-stop-name"><strong>{stop.name}</strong><span>{stop.route}</span></div><div className="om-missed-track" aria-hidden="true"><span style={{ width: `${stop.missed / stops[0].missed * 100}%` }} /></div><span><b>{number(stop.missed)}</b> missed</span></li>)}</ol>
    </MetricState><footer className="om-footer">Closed routes only. Offline uploads may take a moment to appear.</footer>
  </section>;
}
