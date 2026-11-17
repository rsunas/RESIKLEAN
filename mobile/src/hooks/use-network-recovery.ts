import { useEffect, useState } from 'react';
import { subscribeToNetworkRecovery } from '@/lib/network-recovery';

/** Re-run read effects after reconnect/resume, without replacing their local drafts. */
export function useNetworkRecovery() {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeToNetworkRecovery(() => setRevision(value => value + 1)), []);
  return revision;
}
