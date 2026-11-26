import { createContext, forwardRef, useContext, useEffect, useRef, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView as NativeKeyboardAvoidingView, Platform, ScrollView as NativeScrollView, TextInput, View, type KeyboardAvoidingViewProps, type ScrollViewProps } from 'react-native';
import { useKeyboardViewport } from '@/hooks/use-keyboard-viewport';

const KeyboardViewportContext = createContext({ managed: false, keyboardOpen: false });
export const useKeyboardViewportState = () => useContext(KeyboardViewportContext);

/** One keyboard owner per native window: the app root or a Modal portal. */
export function KeyboardViewport({ active = true, children }: PropsWithChildren<{ active?: boolean }>) {
  const { keyboardOpen, frame } = useKeyboardViewport(active);
  const root = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    const task = requestAnimationFrame(() => {
      const focused = document.activeElement;
      const container = root.current as unknown as HTMLElement | null;
      if (focused instanceof HTMLElement && container?.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(task);
  }, [active, frame]);
  // Android hide events can report the visible display height without system bars.
  // Stop applying height avoidance when closed so that inset difference cannot
  // leave the entire app (and its bottom navigation) permanently shortened.
  const behavior = Platform.OS === 'ios' ? 'padding' : active && keyboardOpen ? 'height' : undefined;
  return <KeyboardViewportContext.Provider value={{ managed: true, keyboardOpen }}>
    <NativeKeyboardAvoidingView enabled={active && Platform.OS !== 'web'} behavior={behavior} style={[{ flex: 1, minHeight: 0 }, frame]}>
      <View ref={root} style={{ flex: 1, minHeight: 0 }}>{children}</View>
    </NativeKeyboardAvoidingView>
  </KeyboardViewportContext.Provider>;
}

/** Existing screens retain their layout without applying keyboard space twice. */
export function KeyboardAvoidingView(props: KeyboardAvoidingViewProps) {
  const { managed } = useKeyboardViewportState();
  return <NativeKeyboardAvoidingView {...props} enabled={!managed && props.enabled !== false} />;
}

/** Reveal focused native fields after the containing window has resized. */
export const KeyboardScrollView = forwardRef<NativeScrollView, ScrollViewProps>(function KeyboardScrollView({ onFocus, onBlur, onLayout, keyboardShouldPersistTaps = 'handled', ...props }, forwardedRef) {
  const scroll = useRef<NativeScrollView | null>(null);
  const hasFocus = useRef(false);
  const pending = useRef<number | null>(null);
  const { keyboardOpen } = useKeyboardViewportState();
  const reveal = () => {
    if (!hasFocus.current) return;
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      if (Platform.OS === 'web') {
        const focused = document.activeElement;
        if (hasFocus.current && focused instanceof HTMLElement) focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      const focused = TextInput.State.currentlyFocusedInput();
      if (focused && hasFocus.current) scroll.current?.scrollResponderScrollNativeHandleToKeyboard(focused, 16, true);
    });
  };
  useEffect(() => { if (keyboardOpen) reveal(); }, [keyboardOpen]);
  useEffect(() => () => { if (pending.current !== null) cancelAnimationFrame(pending.current); }, []);
  return <NativeScrollView {...props} keyboardShouldPersistTaps={keyboardShouldPersistTaps} ref={value => {
    scroll.current = value;
    if (typeof forwardedRef === 'function') forwardedRef(value);
    else if (forwardedRef) forwardedRef.current = value;
  }} onFocus={event => { hasFocus.current = true; reveal(); onFocus?.(event); }} onBlur={event => { hasFocus.current = false; onBlur?.(event); }} onLayout={event => { reveal(); onLayout?.(event); }} />;
});
