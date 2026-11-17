import { Button } from '@heroui/react';
import { useId, useState } from 'react';
export default function ExpandableRouteText({ text = '', limit = 140 }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const value = String(text);
  if (value.length <= limit) return <span>{value}</span>;
  return <span className="rh-expandable"><span id={id}>{expanded ? value : `${value.slice(0, limit).trimEnd()}...`}</span><Button type="button" size="sm" variant="tertiary" aria-expanded={expanded} aria-controls={id} onPress={() => setExpanded(current => !current)}>{expanded ? 'Hide' : 'Show all'}</Button></span>;
}
