export default function PageHeader({ category, title, description, action }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{category}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}
