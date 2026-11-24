import { useState } from 'react';
import { Button } from '@heroui/react';
import PageHeader from '../components/PageHeader.jsx';
import AppSelect from '../components/AppSelect.jsx';
import TablePagination from '../components/TablePagination.jsx';
import { LoadingRegion, SkeletonDetails } from '../components/Skeleton.jsx';
import './NotificationsPage.css';

const categories = [{ value: 'all', label: 'All activity' }, { value: 'complaint', label: 'New complaints' }, { value: 'reply', label: 'Resident replies' }, { value: 'truckload', label: 'Truckload submissions' }, { value: 'route', label: 'Finished collections' }];
const icons = { complaint: 'alert', reply: 'inbox', truckload: 'truck', route: 'route' };
const formatTime = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export default function NotificationsPage({ feed, onOpen, Icon }) {
  const { data, loading, error, filter, changeFilter, refresh, markRead, getTarget } = feed;
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const items = data?.items || [];
  const act = async (key, action) => {
    if (busy) return;
    setBusy(key); setActionError('');
    try { await action(); } catch (failure) { setActionError(failure.message || 'Unable to update notifications. Please retry.'); }
    finally { setBusy(''); }
  };
  const open = item => act(item.id, async () => {
    const target = item.type === 'route' ? null : await getTarget(item.id);
    if (!item.read) await markRead([item.id]);
    await onOpen(item, target?.record);
  });
  return <>
    <PageHeader title="Notifications" action={<Button variant="secondary" className="outline-button" isDisabled={loading || !!busy} onPress={refresh}><Icon name="refresh" size={16}/>Refresh</Button>}/>
    <section className="notifications-card" aria-label="Admin notifications">
      <div className="notifications-toolbar">
        <div className="notifications-tabs" role="group" aria-label="Notification read status">{[false, true].map(unread => <Button key={String(unread)} variant="ghost" aria-pressed={filter.unread === unread} isDisabled={!!busy} onPress={() => changeFilter({ unread })}>{unread ? `Unread${data ? ` (${data.unread})` : ''}` : 'All notifications'}</Button>)}</div>
        <AppSelect aria-label="Notification category" className="notifications-category-select" popoverClassName="notifications-category-popover" popoverPlacement="bottom start" options={categories} value={filter.type} disabled={!!busy} onChange={type => changeFilter({ type })}/>
        <Button variant="secondary" className="notifications-mark-page" isDisabled={loading || !!busy || !items.some(item => !item.read)} onPress={() => act('page', () => markRead(items.filter(item => !item.read).map(item => item.id)))}>Mark page as read</Button>
      </div>
      {actionError ? <p className="notifications-error" role="alert">{actionError}</p> : null}
      {error && data ? <div className="notifications-error" role="alert">{error} <Button variant="ghost" onPress={refresh}>Retry</Button></div> : null}
      <LoadingRegion loading={loading} hasData={data !== null} error={data ? '' : error} onRetry={refresh} placeholder={<SkeletonDetails rows={7}/> }>
        {items.length ? <ul className="notifications-feed">{items.map(item => <li className={`notifications-row${item.read ? '' : ' is-unread'}`} key={item.id}>
          <span className={`notifications-icon notification-kind-${item.type}`}><Icon name={icons[item.type]} size={21}/></span>
          <div className="notifications-copy"><div className="notifications-title"><h3>{item.title}</h3>{!item.read ? <span className="notifications-unread-dot" aria-label="Unread"/> : null}</div><p>{item.description}</p>
            {item.type === 'route' && item.remaining > 0 ? <p className="notifications-remaining">{item.remaining} stops have no uploaded collection record yet.</p> : null}
            <time dateTime={item.date}>{formatTime(item.date)}</time>
          </div>
          <div className="notifications-actions"><Button variant="secondary" className="outline-button" isDisabled={loading || !!busy} onPress={() => open(item)}>{busy === item.id ? 'Opening...' : item.type === 'complaint' || item.type === 'reply' ? 'View conversation' : 'View details'}</Button>{!item.read ? <Button variant="secondary" className="notifications-mark-item" isDisabled={loading || !!busy} onPress={() => act(`read:${item.id}`, () => markRead([item.id]))} aria-label={`Mark ${item.title.toLowerCase()} as read`}>Mark as read</Button> : <span className="notifications-read-label">Read</span>}</div>
        </li>)}</ul> : <div className="notifications-empty"><Icon name="bell" size={32}/><h3>{filter.unread ? "You're all caught up" : 'No notifications here yet'}</h3><p>{filter.type !== 'all' ? 'Try another activity category.' : 'New activity will appear here automatically.'}</p></div>}
      </LoadingRegion>
      <TablePagination label="Notifications" page={filter.page} pageSize={filter.limit} pageSizeOptions={[4]} total={data?.total || 0} disabled={loading || !!busy} onPageChange={page => changeFilter({ page })} onPageSizeChange={limit => changeFilter({ limit })}/>
    </section>
    <p className="notifications-note">Reading a notification does not resolve a complaint. Collection totals update as offline stop records sync. Finished-collection notices start with this update; earlier ended trips are not treated as finished collections.</p>
  </>;
}
