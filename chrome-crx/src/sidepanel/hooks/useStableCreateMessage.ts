import { useCallback } from 'react';
import type { CreateApiMessageParams, ApiResponseMessage } from '../../messageTypes';
import type { ModelRequest } from '../session';

export interface UseStableCreateMessageProps {
  createApiMessageRef: React.MutableRefObject<
    ((params: CreateApiMessageParams) => Promise<ApiResponseMessage>) | null
  >;
}

/**
 * useStableCreateMessage — 稳定的消息创建函数
 * 通过 ref 包装 createApiMessage 以避免 hook 排序问题
 */
export function useStableCreateMessage({ createApiMessageRef }: UseStableCreateMessageProps) {
  return useCallback(
    async ({ modelClass: _modelClass, ...request }: ModelRequest) => {
      const fn = createApiMessageRef.current;
      if (!fn) throw new Error('Client not initialized');
      return fn(request);
    },
    [createApiMessageRef]
  );
}
