import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

const listeners = new Set<() => void>();
let retryReads = false;

export function requestNetworkRetry() { retryReads = true; }

export function subscribeToNetworkRecovery(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Refresh the native state; NetInfo.fetch() alone can return a stale cached state. */
export function startNetworkRecovery() {
  let disposed = false;
  let refreshing = false;
  let wasOnline: boolean | undefined;
  let networkType: string | undefined;
  let lastNotified = -Infinity;
  const notify = () => {
    if (disposed || AppState.currentState !== 'active' || Date.now() - lastNotified < 1000) return;
    lastNotified = Date.now();
    retryReads = false;
    listeners.forEach(listener => listener());
  };
  const unsubscribe = NetInfo.addEventListener(state => {
    const online = state.isConnected === true && state.isInternetReachable !== false;
    const restored = wasOnline === false || (networkType !== undefined && networkType !== state.type);
    wasOnline = online;
    networkType = state.type;
    if (online && restored) notify();
  });
  const refresh = async (resumed = false) => {
    if (disposed || refreshing || AppState.currentState !== 'active') return;
    refreshing = true;
    try {
      const state = await NetInfo.refresh();
      if (state.isConnected && state.isInternetReachable !== false && (resumed || retryReads)) notify();
    } catch {
      // Retain offline work and try again on the next foreground check.
    } finally { refreshing = false; }
  };
  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') void refresh(true);
  });
  // Refresh also wakes existing queue subscribers, including after a server outage.
  const timer = setInterval(() => { void refresh(); }, 15000);
  void refresh();
  return () => { disposed = true; unsubscribe(); appState.remove(); clearInterval(timer); };
}
