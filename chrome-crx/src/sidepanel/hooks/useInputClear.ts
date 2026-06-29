import { useEffect } from 'react';

export interface UseInputClearProps {
  input: string;
  setPopulatedInputTargetTabId: (tabId: number | undefined) => void;
}

/**
 * useInputClear — Input 清空时清除 target tab
 * 当 input 被清空时，清除 populatedInputTargetTabId
 */
export function useInputClear({ input, setPopulatedInputTargetTabId }: UseInputClearProps) {
  useEffect(() => {
    if (!input.trim()) {
      setPopulatedInputTargetTabId(undefined);
    }
  }, [input, setPopulatedInputTargetTabId]);
}
