import { useCallback } from 'react';
import { StorageKeys, setStorageValue } from '../../extensionServices';
import { trackEvent } from '../../mcpRuntime';
import type { SupportedLocale } from '../../index-react-dom-intl';
import type { ChatMessage } from '../types';
import { openOptionsTo } from '../sidepanelUtils';

export interface UseUIActionsProps {
  selectedModel: string;
  effectiveIsAgentRunning: boolean;
  effectiveCancel: () => void;
  effectiveSelectedModel: string;
  setSelectedModel: (model: string) => void;
  setIsModelMenuOpen: (open: boolean) => void;
  setIsHeaderMenuOpen: (open: boolean) => void;
  setIsLanguageSubmenuOpen: (open: boolean) => void;
  locale: string;
  messages: ChatMessage[];
  setPendingLocale: (locale: SupportedLocale | null) => void;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  pendingLocale: SupportedLocale | null;
  clearConversation: () => void;
}

/**
 * useUIActions — UI 相关操作
 * 封装模型切换、选项页面打开、语言选择等操作
 */
export function useUIActions({
  selectedModel,
  effectiveIsAgentRunning,
  effectiveCancel,
  effectiveSelectedModel,
  setSelectedModel,
  setIsModelMenuOpen,
  setIsHeaderMenuOpen,
  setIsLanguageSubmenuOpen,
  locale,
  messages,
  setPendingLocale,
  setLocale,
  pendingLocale,
  clearConversation
}: UseUIActionsProps) {
  const handleModelChange = useCallback(
    (nextModel: string) => {
      if (!nextModel) {
        setIsModelMenuOpen(false);
        return;
      }

      if (nextModel === selectedModel) {
        setIsModelMenuOpen(false);
        return;
      }

      void trackEvent('superduck.sidebar.model_switched', {
        from: selectedModel || '',
        to: nextModel
      });

      // If the agent is currently running, abort it so the next request uses the
      // new model. Otherwise the in-flight request would continue with the old
      // model, which is confusing to users who expect the switch to take effect
      // immediately (Issue 7.2/7.3 from UX audit).
      if (effectiveIsAgentRunning) {
        effectiveCancel();
      }

      setSelectedModel(nextModel);
      setIsModelMenuOpen(false);
      void setStorageValue(StorageKeys.SELECTED_MODEL, nextModel);
    },
    [selectedModel, effectiveSelectedModel, effectiveIsAgentRunning, effectiveCancel]
  );

  const openOptionsPage = useCallback(() => {
    setIsHeaderMenuOpen(false);
    setIsLanguageSubmenuOpen(false);
    void openOptionsTo();
  }, []);

  const handleLanguageSelection = useCallback(
    (nextLocale: SupportedLocale) => {
      setIsLanguageSubmenuOpen(false);
      setIsHeaderMenuOpen(false);
      if (nextLocale === locale) return;
      if (messages.length > 0) {
        setPendingLocale(nextLocale);
        return;
      }
      void trackEvent('superduck.sidebar.language_changed', {
        from: locale,
        to: nextLocale
      });
      void setLocale(nextLocale);
    },
    [locale, messages.length, setLocale]
  );

  const confirmLocaleChange = useCallback(() => {
    if (!pendingLocale) return;
    const nextLocale = pendingLocale;
    setPendingLocale(null);
    void trackEvent('superduck.sidebar.language_changed', {
      from: locale,
      to: nextLocale
    });
    void (async () => {
      await setLocale(nextLocale);
      clearConversation();
    })();
  }, [clearConversation, locale, pendingLocale, setLocale]);

  return { handleModelChange, openOptionsPage, handleLanguageSelection, confirmLocaleChange };
}
