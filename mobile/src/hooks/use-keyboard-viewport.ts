import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions, type ViewStyle } from 'react-native';

/** Native keyboard events do not fire in React Native Web. Follow the browser's
 * visual viewport there, including the pan it can apply when an input is focused. */
let scrollLocks = 0;
let bodyOverflow = '';
let rootOverflow = '';

export function useKeyboardViewport(active: boolean) {
  const windowSize = useWindowDimensions();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [frame, setFrame] = useState<ViewStyle>();

  useEffect(() => {
    if (!active) {
      setKeyboardOpen(false);
      return;
    }
    if (Platform.OS !== 'web') {
      setKeyboardOpen(Keyboard.isVisible());
      const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
      const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
      return () => { show.remove(); hide.remove(); };
    }
    if (typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    let baselineWidth = window.innerWidth;
    let baselineHeight = window.innerHeight;
    let wasKeyboardOpen = false;
    let pendingFrame = 0;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const scale = viewport?.scale ?? 1;
      // A rotation establishes a new baseline. Pinch zoom is not a keyboard.
      if (scale === 1) {
        if (Math.abs(width - baselineWidth) > 1) baselineHeight = window.innerHeight;
        baselineWidth = width;
        baselineHeight = Math.max(baselineHeight, window.innerHeight, height);
      }
      const focused = document.activeElement;
      const editing = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || (focused instanceof HTMLElement && focused.isContentEditable);
      wasKeyboardOpen = scale === 1 && baselineHeight - height > 100 && (editing || wasKeyboardOpen);
      setKeyboardOpen(wasKeyboardOpen);
      const next: ViewStyle = { position: 'absolute', flex: 0, top: viewport?.offsetTop ?? 0, left: viewport?.offsetLeft ?? 0, width, height };
      setFrame(previous => previous?.height === next.height && previous?.width === next.width && previous?.top === next.top && previous?.left === next.left ? previous : next);
    };
    const schedule = () => {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(update);
    };
    if (scrollLocks++ === 0) {
      bodyOverflow = document.body.style.overflow;
      rootOverflow = document.documentElement.style.overflow;
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(pendingFrame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      if (--scrollLocks === 0) {
        document.body.style.overflow = bodyOverflow;
        document.documentElement.style.overflow = rootOverflow;
      }
    };
  }, [active]);

  return { keyboardOpen, frame, visibleHeight: typeof frame?.height === 'number' ? frame.height : windowSize.height, fontScale: windowSize.fontScale };
}
