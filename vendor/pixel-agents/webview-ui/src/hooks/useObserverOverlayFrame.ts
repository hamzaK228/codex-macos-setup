import { useSyncExternalStore } from 'react';

// One bounded sample clock for all observer overlays. No per-agent timers, and
// no animation work while the document is hidden or all overlays are unmounted.
const subscribers = new Set<() => void>();
let frame = 0;
let request = 0;
let previousSample = 0;
function sample(now: number) {
  request = 0;
  if (document.hidden || subscribers.size === 0) return;
  if (now - previousSample >= 100) {
    previousSample = now;
    frame = frame === 0 ? 1 : 0;
    subscribers.forEach((notify) => notify());
  }
  request = requestAnimationFrame(sample);
}
function visibilityChanged() {
  if (document.hidden) {
    cancelAnimationFrame(request);
    request = 0;
  } else if (!request && subscribers.size) {
    request = requestAnimationFrame(sample);
  }
}
function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (subscribers.size === 1) {
    document.addEventListener('visibilitychange', visibilityChanged);
    visibilityChanged();
  }
  return () => {
    subscribers.delete(notify);
    if (!subscribers.size) {
      cancelAnimationFrame(request);
      request = 0;
      document.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}
export function useObserverOverlayFrame() {
  useSyncExternalStore(subscribe, () => frame);
}
