import { useMemo } from 'react';

/**
 * useRandomStartupKey — 随机启动文案
 * 生成随机的启动文案 key，只在组件挂载时计算一次
 */
export function useRandomStartupKey() {
  return useMemo(
    () => `starting_up_${Math.floor(Math.random() * 8) + 1}`,
    [] // 只在组件挂载时计算一次
  );
}
