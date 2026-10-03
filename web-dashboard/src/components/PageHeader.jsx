export default function PageHeader({ title, action }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}
