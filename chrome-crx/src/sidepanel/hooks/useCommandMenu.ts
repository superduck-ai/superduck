import { useEffect } from 'react';
import { trackEvent } from '../../mcpRuntime';
import type { PermissionMode } from '../sidepanelUtils';
import type { PermissionModeOption } from '@/sidepanel/components/PermissionModeMenu';

export interface UseCommandMenuProps {
  input: string;
  inputRef: React.RefObject<any>;
  inputValueRef: React.MutableRefObject<string>;
  commandMenuDismissedRef: React.MutableRefObject<boolean>;
  commandMenuDismissedInputRef: React.MutableRefObject<string>;
  showCommandMenu: boolean;
  setShowCommandMenu: (show: boolean) => void;
  setCommandSearchTerm: (term: string) => void;
  commandMenuRef: React.RefObject<HTMLDivElement | null>;
  effectiveIsAgentRunning: boolean;
  effectiveCancel: () => void;
  permissionModeMenuOptions: PermissionModeOption[];
  permissionMode: string;
  setPermissionMode: (mode: PermissionMode) => void;
}

/**
 * useCommandMenu — 命令菜单和键盘快捷键
 * 封装命令菜单显示/隐藏逻辑和键盘快捷键处理
 */
export function useCommandMenu({
  input,
  inputRef,
  inputValueRef,
  commandMenuDismissedRef,
  commandMenuDismissedInputRef,
  showCommandMenu,
  setShowCommandMenu,
  setCommandSearchTerm,
  commandMenuRef,
  effectiveIsAgentRunning,
  effectiveCancel,
  permissionModeMenuOptions,
  permissionMode,
  setPermissionMode
}: UseCommandMenuProps) {
  // Handle command menu when input starts with / or 、(Chinese IME equivalent)
  useEffect(() => {
    // If the user was dismissed but then typed more, reset the dismissed flag
    if (commandMenuDismissedRef.current && input !== commandMenuDismissedInputRef.current) {
      commandMenuDismissedRef.current = false;
    }

    const hasShortcutChip = inputRef.current?.hasShortcutChips() ?? false;
    const startsWithCommandTrigger = input.startsWith('/') || input.startsWith('、');

    if (startsWithCommandTrigger && !hasShortcutChip) {
      const commandName = input.slice(1).split(' ')[0];
      setCommandSearchTerm(commandName);
      if (!showCommandMenu && !commandMenuDismissedRef.current) {
        setShowCommandMenu(true);
      }
    } else {
      // Only keep slash suggestions open for raw slash input, not inserted shortcut chips.
      if (showCommandMenu) {
        setShowCommandMenu(false);
        setCommandSearchTerm('');
      }
      if (!startsWithCommandTrigger) {
        commandMenuDismissedRef.current = false;
      }
    }
  }, [input, showCommandMenu, setShowCommandMenu, setCommandSearchTerm]);

  // Click-outside handler for the command menu (matching compiled lines 37315-37321)
  useEffect(() => {
    if (!showCommandMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (commandMenuRef.current && !commandMenuRef.current.contains(target)) {
        commandMenuDismissedRef.current = true;
        commandMenuDismissedInputRef.current = inputValueRef.current;
        setShowCommandMenu(false);
        setCommandSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showCommandMenu, setShowCommandMenu, setCommandSearchTerm]);

  // Escape dismisses slash suggestions without changing the current draft.
  // Listen on window capture so this takes priority over the palette's
  // document listener and the global Escape-to-cancel-agent shortcut.
  useEffect(() => {
    if (!showCommandMenu) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === 'Process' || e.key !== 'Escape') return;

      e.preventDefault();
      e.stopPropagation();
      commandMenuDismissedRef.current = true;
      commandMenuDismissedInputRef.current = inputValueRef.current;
      setShowCommandMenu(false);
      setCommandSearchTerm('');
      inputRef.current?.focus();
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [
    showCommandMenu,
    inputRef,
    inputValueRef,
    commandMenuDismissedRef,
    commandMenuDismissedInputRef,
    setShowCommandMenu,
    setCommandSearchTerm
  ]);

  // Shift+Tab cycles permission modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when IME is composing — Escape during CJK input cancels the
      // composition, not the agent.
      if (e.isComposing) return;
      if (e.key === 'Escape' && effectiveIsAgentRunning) {
        effectiveCancel();
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const modes = permissionModeMenuOptions.map((o) => o.value);
        if (modes.length === 0) return;
        const idx = (modes.indexOf(permissionMode as PermissionMode) + 1) % modes.length;
        void trackEvent('superduck.sidebar.permission_mode_changed', {
          from: permissionMode,
          to: modes[idx]
        });
        setPermissionMode(modes[idx]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [effectiveIsAgentRunning, effectiveCancel, permissionMode, permissionModeMenuOptions]);
}
