import { useCallback } from 'react';

type RefCleanup = void | (() => void);
type ComposableRef<T> =
  | ((instance: T | null) => RefCleanup)
  | React.MutableRefObject<T | null>
  | null
  | undefined;

function setRef<T>(ref: ComposableRef<T>, value: T | null): RefCleanup {
  if (typeof ref === 'function') return ref(value);
  if (typeof ref === 'object' && ref !== null && 'current' in ref) {
    ref.current = value;
  }
}

function composeRefs<T>(...refs: ComposableRef<T>[]) {
  const cleanups = new Map<ComposableRef<T>, () => void>();
  return (node: T | null) => {
    if (
      (refs.forEach((ref) => {
        const cleanup = setRef(ref, node);
        if (cleanup) cleanups.set(ref, cleanup);
      }),
      cleanups.size > 0)
    ) {
      return () => {
        refs.forEach((ref) => {
          const cleanup = cleanups.get(ref);
          cleanup ? cleanup() : setRef(ref, null);
        });
        cleanups.clear();
      };
    }
  };
}

export function useComposedRefs<T>(...refs: ComposableRef<T>[]) {
  return useCallback(composeRefs(...refs), refs);
}

export { composeRefs, setRef, type RefCleanup, type ComposableRef };
