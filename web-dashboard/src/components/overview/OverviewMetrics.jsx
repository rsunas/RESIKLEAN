import { useState } from 'react';
import CollectionCoverage from './CollectionCoverage.jsx';
import DailyCompletion from './DailyCompletion.jsx';
import ComplaintsByStatus from './ComplaintsByStatus.jsx';
import CompletedByHour from './CompletedByHour.jsx';
import FrequentlyUncompleted from './FrequentlyUncompleted.jsx';
import './overviewMetrics.css';

export default function OverviewMetrics({ token }) {
  const [range, setRange] = useState('today');
  const [area, setArea] = useState('');
  const shared = { token, range, area };
  return <div className="overview-metrics">
    <CollectionCoverage {...shared} onRange={setRange} onArea={setArea} />
    <div className="om-grid om-grid-wide"><DailyCompletion token={token} /><ComplaintsByStatus {...shared} /></div>
    <div className="om-grid"><CompletedByHour {...shared} onRange={setRange} /><FrequentlyUncompleted token={token} /></div>
  </div>;
}
