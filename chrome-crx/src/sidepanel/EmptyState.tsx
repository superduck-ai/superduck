import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  StorageKeys,
  getStorageValue,
  setStorageValue,
  useFeatureValue,
} from "../extensionServices";
import { useTabEvent } from "./hooks";
import { HandwritingAnimation } from "./HandwritingAnimation";

// =============================================================================
// DomainPrompts (lines 729-748)
// =============================================================================

interface DomainConfig {
  logo_url: string;
  header_text: string;
  prompts: Array<{ prompt: string; prompt_title: string }>;
}

interface DomainPromptsProps {
  domainConfig: DomainConfig;
  onPromptClick: (prompt: string) => void;
}

export function DomainPrompts({ domainConfig, onPromptClick }: DomainPromptsProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <div className="w-12 h-12 rounded-xl border-[0.5px] border-border-300 bg-always-white shadow-sm mb-4 overflow-hidden">
        <img
          src={domainConfig.logo_url}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <h2 className="font-ui-sm text-text-500 mb-[22px]">
        {domainConfig.header_text}
      </h2>
      <div className="flex flex-col items-center gap-2 w-full max-w-sm">
        {domainConfig.prompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => onPromptClick(prompt.prompt)}
            className="min-w-[75px] min-h-8 px-[14px] py-[3px] font-base text-text-100 border-[0.5px] border-border-300 bg-bg-000/30 hover:bg-bg-200 transition-colors text-center line-clamp-2 break-words"
            style={{ borderRadius: "38px" }}
          >
            {prompt.prompt_title}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// FeatureCard (lines 750-766)
// =============================================================================

interface FeatureCardProps {
  lightImage: string;
  darkImage: string;
  title: string;
  subtitle: string;
}

function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDark;
}

export function FeatureCard({ lightImage, darkImage, title, subtitle }: FeatureCardProps) {
  const isDark = useDarkMode();
  return (
    <div className="flex flex-col items-center">
      <img
        src={isDark ? darkImage : lightImage}
        alt={title}
        className="w-[212px] h-[122px] rounded-[14px]"
      />
      <div className="mt-4 flex flex-col items-center gap-1 w-[188px]">
        <p className="font-small-bold text-text-300 text-center">{title}</p>
        <p className="font-small text-text-500 text-center">{subtitle}</p>
      </div>
    </div>
  );
}

// =============================================================================
// Tip Display Logic (lines 768-794)
// =============================================================================

const TIP_CONFIGS: Record<string, { maxDisplays: number; requiresGate: boolean }> = {
  pin_extension: { maxDisplays: 1, requiresGate: false },
};

function useTipDisplay(tipId: string, tabId: number | undefined) {
  const [canShow, setCanShow] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    (async () => {
      if (!tabId) {
        setCanShow(false);
        return;
      }
      try {
        const config = TIP_CONFIGS[tipId];
        const counts =
          ((await getStorageValue(StorageKeys.TIP_DISPLAY_COUNTS)) as Record<
            string,
            string[]
          >) || {};
        const shown = counts[tipId] || [];
        const alreadyShownForTab = shown.includes(String(tabId));
        const reachedLimit = shown.length >= config.maxDisplays;

        setLimitReached(reachedLimit);
        setCanShow(!alreadyShownForTab && !reachedLimit);
      } catch {
        setCanShow(false);
        setLimitReached(false);
      }
    })();
  }, [tipId, tabId]);

  const markAsShown = useCallback(async () => {
    if (!tabId) return;
    try {
      const counts =
        ((await getStorageValue(StorageKeys.TIP_DISPLAY_COUNTS)) as Record<
          string,
          string[]
        >) || {};
      const shown = counts[tipId] || [];
      if (!shown.includes(String(tabId))) {
        shown.push(String(tabId));
        counts[tipId] = shown;
        await setStorageValue(StorageKeys.TIP_DISPLAY_COUNTS, counts);
      }
    } catch {
      // ignore
    }
  }, [tipId, tabId]);

  return { canShow, limitReached, markAsShown };
}

const MountEffect: React.FC<{ onMount: () => void; children: React.ReactNode }> = ({
  children,
  onMount,
}) => {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return <>{children}</>;
};

// =============================================================================
// EmptyState / WelcomeScreen (lines 772-847)
// =============================================================================

async function getIsExtensionPinned(): Promise<boolean> {
  try {
    if (!chrome.action?.getUserSettings) return false;
    const settings = await chrome.action.getUserSettings();
    return settings.isOnToolbar ?? false;
  } catch {
    return false;
  }
}

interface EmptyStateProps {
  tabId: number | undefined;
  onPromptClick: (prompt: string) => void;
}

export function EmptyState({ tabId, onPromptClick }: EmptyStateProps) {
  const intl = useIntl();
  const [currentUrl, setCurrentUrl] = useState("");
  const [isPinned, setIsPinned] = useState<boolean | null>(null);
  const crochetChips = useFeatureValue("crochet_chips", {});
  const tipDisplay = useTipDisplay("pin_extension", tabId);

  useEffect(() => {
    (async () => {
      const pinned = await getIsExtensionPinned();
      setIsPinned(pinned);
    })();
  }, []);

  const handleTabUpdate = useCallback((tab: chrome.tabs.Tab) => {
    setCurrentUrl(tab.url || "");
  }, []);

  useEffect(() => {
    if (tabId) {
      chrome.tabs
        .get(tabId)
        .then(handleTabUpdate)
        .catch(() => setCurrentUrl(""));
    }
  }, [tabId, handleTabUpdate]);

  useTabEvent(
    tabId,
    ["url"],
    (eventTabId, changeInfo, tab) => {
      if (eventTabId === tabId && changeInfo.url && tab) {
        handleTabUpdate(tab);
      }
    },
    [tabId]
  );

  const domainConfig = useMemo(() => {
    if (!currentUrl) return undefined;
    try {
      const url = new URL(currentUrl);
      const hostname = url.hostname.replace(/^www\./, "");
      const firstPath = url.pathname.split("/")[1];

      if (firstPath) {
        const fullKey = `${hostname}/${firstPath}`;
        if (crochetChips[fullKey]) return crochetChips[fullKey] as DomainConfig;
      }
      return crochetChips[hostname] as DomainConfig | undefined;
    } catch {
      return undefined;
    }
  }, [currentUrl, crochetChips]);

  if (domainConfig) {
    return <DomainPrompts domainConfig={domainConfig} onPromptClick={onPromptClick} />;
  }

  if (isPinned === null) return null;

  if (!isPinned && tipDisplay.canShow) {
    return (
      <MountEffect onMount={tipDisplay.markAsShown}>
        <SuperDuckHeader>
          <FeatureCard
            lightImage="/assets/extension-light-min-CwWd0kAK.svg"
            darkImage="/assets/extension-dark-min-Ctxo0Z8w.svg"
            title={intl.formatMessage({
              defaultMessage: "Pin SuperDuck for quick access",
              id: "9qJKQKXInl",
            })}
            subtitle={intl.formatMessage({
              defaultMessage:
                "Click the pin icon in the top right corner of the extension window",
              id: "PqHH2BNESm",
            })}
          />
        </SuperDuckHeader>
      </MountEffect>
    );
  }

  return <SuperDuckHeader />;
}

const HEADER_COLOR = "rgb(156,156,156)";
const HEADER_SKEW = "skewX(-10deg)";
// Sit slightly above vertical center so the header reads as "upper-middle"
// across both tall windows and short ones (fixed bottom offsets don't scale).
const HEADER_VERTICAL_BIAS = "-15%";

function SuperDuckHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-6 px-6 pointer-events-none"
      style={{ position: 'absolute', inset: 0, transform: `translateY(${HEADER_VERTICAL_BIAS})` }}
    >
      <div
        className="pointer-events-auto flex flex-col items-center gap-6 w-full"
        style={{ transform: HEADER_SKEW }}
      >
        <HandwritingAnimation text="SuperDuck" fontSize={88} speed={3} color={HEADER_COLOR} />
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// CompactedDivider (lines 687-693)
// =============================================================================

export function CompactedDivider() {
  return (
    <div className="flex items-center gap-2 py-2 my-2">
      <div className="flex-1 h-[0.5px] bg-border-300" />
      <div className="text-xs text-text-400 px-2 bg-bg-100">
        <FormattedMessage defaultMessage="Conversation compacted" id="conversation_compacted" />
      </div>
      <div className="flex-1 h-[0.5px] bg-border-300" />
    </div>
  );
}
