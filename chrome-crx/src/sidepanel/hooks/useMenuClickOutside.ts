import { useEffect } from 'react';

/**
 * useMenuClickOutside — 统一的菜单点击外部关闭逻辑
 * 将重复的 click-outside effect 提取为通用 hook
 */
export function useMenuClickOutside(
  isOpen: boolean,
  menuRef: React.RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, menuRef, onClose]);
}
