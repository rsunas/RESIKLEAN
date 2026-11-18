import { useEffect, useRef, useState } from 'react';
import background from '../../assets/announcement-bg-blurred.jpg';
import { formatDay, formatTime } from '../../../../backend/src/shared/announcements.mjs';

export function AnnouncementCanvas({ fields, width = 1200, height = 675, canvasRef }) {
  const headline = `${fields.areaLabel || 'All areas'} · ${formatTime(fields.time)}`;
  return <div ref={canvasRef} className="announcement-canvas" style={{ width, height }} role="img" aria-label={`${headline}. ${fields.reason}. ${fields.impact}`}>
    <img className="announcement-art" src={background} alt="" />
    <div className="announcement-shade" />
    <div className="announcement-art-copy" style={{ padding: width * .055 }}>
      <div className="announcement-art-top" style={{ fontSize: width * .022 }}><span>{fields.type === 'Service delay' ? 'SERVICE ADVISORY' : fields.type?.toUpperCase()}</span><span>{formatDay(fields.date, true)}</span></div>
      <div className="announcement-art-main">
        <h2 style={{ fontSize: width * (headline.length > 48 ? .043 : headline.length > 26 ? .058 : .08) }}>{headline}</h2>
        <p className="announcement-art-reason" style={{ fontSize: width * .053 }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3v1" /></svg>{fields.reason}</p>
        <p className="announcement-art-impact" style={{ fontSize: width * .043 }}>{fields.impact === 'Rescheduled' ? `Rescheduled to ${formatDay(fields.newDate, true)}` : `${fields.impact}.`}</p>
      </div>
      <div className="announcement-art-footer" style={{ fontSize: width * .024 }}>Solid Waste Management Office · Naga City</div>
    </div>
  </div>;
}

export function AnnouncementPreview({ fields }) {
  const wrapper = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={wrapper} className="announcement-preview" style={{ aspectRatio: '16 / 9' }}><div style={{ transform: `scale(${width / 1200})`, transformOrigin: 'top left' }}><AnnouncementCanvas fields={fields} /></div></div>;
}
