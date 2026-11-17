import { Button, Skeleton as HeroSkeleton } from '@heroui/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './Skeleton.css';

export function Skeleton({ width = '100%', height = 14, radius = 8, variant = 'block', className = '', style }) {
  return <HeroSkeleton render={props => <span {...props}/>} aria-hidden="true" animationType="none" className={`dashboard-skeleton skeleton-${variant} ${className}`} style={{ width, height, borderRadius: variant === 'circle' ? '50%' : radius, ...style }} />;
}

// Presentation timing only. Never starts, cancels, or stores a request or API result.
// Shared with the skeleton primitives so loading presentation has one implementation.
// eslint-disable-next-line react-refresh/only-export-components
export function useLoadingPresentation({ loading, hasData = false, error = '', enabled = true }) {
  const [visible, setVisible] = useState(false);
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seen = useRef(hasData);
  const started = useRef(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (hasData) seen.current = true;
    if (!loading && started.current && !error) seen.current = true;
  }, [hasData, loading, error]);
  useEffect(() => {
    if (!enabled || error) {
      if (!enabled) { seen.current = false; started.current = false; }
      setVisible(false); setExpired(false); return;
    }
    if (!loading) {
      setExpired(false);
      const delay = visible ? Math.max(0, 400 - (Date.now() - shownAt.current)) : 0;
      const end = setTimeout(() => setVisible(false), delay);
      return () => clearTimeout(end);
    }
    started.current = true;
    setExpired(false);
    const show = setTimeout(() => {
      if (!seen.current) { shownAt.current = Date.now(); setVisible(true); }
    }, 150);
    const timeout = setTimeout(() => { setExpired(true); setVisible(false); }, 10000);
    return () => { clearTimeout(show); clearTimeout(timeout); };
    // Visibility is deliberately not a dependency: showing a skeleton must not restart its timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, enabled, attempt]);
  const failure = enabled ? error || (expired ? 'Loading took too long. Please retry.' : '') : '';
  const initial = enabled && !failure && (visible || (loading && !hasData && !seen.current));
  return { initial, visible, busy: enabled && !failure && (loading || visible), failure,
    refreshing: enabled && loading && !initial && !failure,
    retry: () => { setExpired(false); setVisible(false); setAttempt(value => value + 1); } };
}

export function LoadingError({ message, onRetry }) {
  return <div className="skeleton-error feedback error-feedback"><p role="alert">{message}</p>{onRetry ? <Button variant="secondary" onPress={onRetry}>Retry</Button> : null}</div>;
}

export function DisabledControls({ disabled, children, className = '' }) {
  return <fieldset disabled={disabled} inert={disabled ? true : undefined} className={`loading-controls ${disabled ? 'is-disabled' : ''} ${className}`}>{children}</fieldset>;
}

export function LoadingRegion({ loading, hasData, error, onRetry, placeholder, children, className = '', as: Tag = 'div', columns, enabled = true, minHeight }) {
  const state = useLoadingPresentation({ loading, hasData, error, enabled });
  // A visual snapshot keeps existing rows/chart on screen when their parent's loading flag changes.
  // It is discarded with the component and never feeds data fetching, filtering or caching.
  const previous = useRef(null);
  useLayoutEffect(() => { if (!loading && !error && hasData) previous.current = children; }, [loading, error, hasData, children]);
  const content = loading && previous.current !== null ? previous.current : children;
  const retry = onRetry ? () => { state.retry(); onRetry(); } : undefined;
  const failure = state.failure ? <LoadingError message={state.failure} onRetry={retry} /> : null;
  const label = <span className="skeleton-sr-only" role="status">Loading…</span>;
  return <Tag inert={state.refreshing ? true : undefined} aria-busy={state.busy} className={`loading-region ${state.initial ? state.visible ? 'skeleton-visible' : 'skeleton-waiting' : 'skeleton-ready'} ${state.refreshing ? 'skeleton-refreshing' : ''} ${className}`} style={minHeight ? { minHeight } : undefined}>
    {state.busy ? Tag === 'tbody' ? <tr className="skeleton-status-row"><td colSpan={columns}>{label}</td></tr> : label : null}
    {failure ? Tag === 'tbody' ? <tr><td colSpan={columns}>{failure}</td></tr> : failure : null}
    {state.initial ? placeholder : state.failure && !hasData && previous.current === null ? null : content}
  </Tag>;
}

export function SkeletonTable({ rows = 25, columns = 6, variant = 'table' }) {
  const firstRow = useRef(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      const top = firstRow.current?.getBoundingClientRect().top || 250;
      setFit(Math.max(1, Math.min(9, Math.floor((window.innerHeight - top - 100) / 70))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (firstRow.current?.parentElement?.parentElement) observer.observe(firstRow.current.parentElement.parentElement);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return Array.from({ length: Math.min(rows, fit) }, (_, row) => <tr aria-hidden="true" className="skeleton-table-row" ref={row === 0 ? firstRow : undefined} key={row}>
    {Array.from({ length: columns }, (_, column) => <td key={column}>
      {variant === 'accounts' && column === 0 ? <div className="skeleton-inline"><Skeleton variant="circle" width={40} height={40}/><Skeleton variant="text" width={96 + row % 3 * 22}/></div>
        : column === columns - 1 ? <Skeleton width={108} height={38} radius={11}/>
          : variant === 'accounts' && column === 1 ? <Skeleton width={84} height={26} radius={10}/>
            : <Skeleton variant="text" width={variant === 'accounts' && column === 4 ? 150 + row % 3 * 20 : variant === 'accounts' && column === 3 ? 110 : column === 0 ? 120 : 80 + row % 3 * 15} height={column === 0 ? 14 : 12}/>}
    </td>)}
  </tr>);
}

export function LoadingTableBody({ rows = 25, columns = 6, variant, ...props }) {
  return <LoadingRegion {...props} as="tbody" columns={columns} placeholder={<SkeletonTable rows={rows} columns={columns} variant={variant}/>}/>;
}

export function SkeletonComplaintList() {
  return <div className="skeleton-complaint-list">{Array.from({length:8}, (_, i) => <div className="skeleton-complaint-item" key={i}><Skeleton variant="circle" width={44} height={44}/><div className="skeleton-complaint-copy"><div className="skeleton-inline skeleton-between"><Skeleton width={90}/><Skeleton width={44} height={10}/></div><Skeleton width={`${55 + i % 3 * 12}%`}/><Skeleton width="88%" height={12}/></div></div>)}</div>;
}
export function SkeletonThread() {
  return <div className="skeleton-thread"><Skeleton width={130} height={12} className="skeleton-date"/><Skeleton width={300} height={84} radius={18}/><Skeleton width={360} height={170} radius={16}/><Skeleton width={260} height={64} radius={18} className="skeleton-reply"/></div>;
}
export function SkeletonConversation() {
  return <><div className="cq-header"><Skeleton variant="circle" width={44} height={44}/><div className="skeleton-complaint-copy"><Skeleton width={120} height={16}/><Skeleton width={160} height={12}/></div><Skeleton width={112} height={40} radius={12}/></div><div className="skeleton-conversation-details">{[0,1,2].map(i=><div className="skeleton-inline" key={i}><Skeleton width={18} height={18}/><div className="skeleton-complaint-copy"><Skeleton width={70} height={10}/><Skeleton width={100}/></div></div>)}</div><SkeletonThread/></>;
}
export function SkeletonChart() {
  return <div className="skeleton-chart"><div className="skeleton-chart-axis">{[0,1,2,3,4].map(i=><Skeleton key={i} width={28} height={10}/>)}</div><div className="skeleton-chart-bars">{[70,120,88,158,100,136,78].map((height,i)=><div className="skeleton-chart-column" key={i}><Skeleton width={68} height={height} radius="10px 10px 0 0"/><Skeleton width={46} height={12}/></div>)}</div></div>;
}
export function SkeletonStat() { return <div className="skeleton-stat"><Skeleton width={64} height={22}/><Skeleton width={80} height={12}/></div>; }
export function SkeletonDetails({ rows = 7 }) { return <div className="skeleton-detail-grid">{Array.from({length:rows},(_,i)=><div className="skeleton-inline" key={i}><Skeleton variant="circle" width={40} height={40}/><div className="skeleton-complaint-copy"><Skeleton width={70} height={10}/><Skeleton width={130}/></div></div>)}</div>; }
