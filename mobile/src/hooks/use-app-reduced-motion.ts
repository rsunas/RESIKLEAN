import { createContext, createElement, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const MotionPreference = createContext<boolean | null>(null);

/** One native subscription for the app, not one per list row/button. */
export function AppMotionProvider({ children }: PropsWithChildren) {
  const [reduced, setReduced] = useState(useReducedMotion());
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { changed = true; setReduced(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active && !changed) setReduced(value); }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return createElement(MotionPreference.Provider, { value: reduced }, children);
}

export function useAppReducedMotion() {
  const initial = useReducedMotion();
  return useContext(MotionPreference) ?? initial;
}
