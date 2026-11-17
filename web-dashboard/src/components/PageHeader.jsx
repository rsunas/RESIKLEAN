import { translate, usePreferences } from './preferences.jsx';

export default function PageHeader({ title, action }) {
  const { preferences } = usePreferences();
  return (
    <div className="page-header">
      <div>
        <h2>{translate(title, preferences.language)}</h2>
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}
