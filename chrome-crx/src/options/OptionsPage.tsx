import React, { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { KeyRound, Keyboard, Palette, Info } from 'lucide-react';
import { T as TasksTab } from '@/components/TasksTab';
import { cn } from '@/components/ui';
import { AppearanceTab } from './components/AppearanceTab';
import { MicrophonePermissionModal } from './components/MicrophonePermissionModal';
import { PermissionsTab } from './components/PermissionsTab';
import { AboutTab } from './components/AboutTab';

type SettingsTab = 'permissions' | 'prompts' | 'appearance' | 'about';

const SETTINGS_TABS: SettingsTab[] = ['permissions', 'prompts', 'appearance', 'about'];

const NAV_ITEMS: {
  tab: SettingsTab;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: React.ReactNode;
}[] = [
  {
    tab: 'permissions',
    icon: KeyRound,
    label: (
      <FormattedMessage defaultMessage="Model Config & Permissions" id="model_config_permissions" />
    )
  },
  {
    tab: 'prompts',
    icon: Keyboard,
    label: <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
  },
  {
    tab: 'appearance',
    icon: Palette,
    label: <FormattedMessage defaultMessage="Appearance" id="appearance" />
  },
  {
    tab: 'about',
    icon: Info,
    label: <FormattedMessage defaultMessage="About Us" id="about_us" />
  }
];

function parseHashTab(hash: string): { tab: SettingsTab; queryString?: string } {
  const [section, queryString] = hash.slice(1).split('?');
  return {
    tab: SETTINGS_TABS.includes(section as SettingsTab) ? (section as SettingsTab) : 'permissions',
    queryString
  };
}

function PageTitle({ activeTab }: { activeTab: SettingsTab }) {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-2xl font-bold leading-7 tracking-tight md:tracking-[-0.02em] text-foreground">
        {activeTab === 'permissions' && (
          <FormattedMessage
            defaultMessage="Model Config & Permissions"
            id="model_config_permissions"
          />
        )}
        {activeTab === 'prompts' && <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />}
        {activeTab === 'appearance' && (
          <FormattedMessage defaultMessage="Appearance" id="appearance" />
        )}
        {activeTab === 'about' && (
          <FormattedMessage defaultMessage="About SuperDuck" id="about_superduck" />
        )}
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
        {activeTab === 'permissions' && (
          <FormattedMessage
            defaultMessage="Manage model providers, permissions, notifications, and browser access."
            id="settings_permissions_description"
          />
        )}
        {activeTab === 'prompts' && (
          <FormattedMessage
            defaultMessage="Create reusable shortcuts and schedule browser tasks."
            id="settings_shortcuts_description"
          />
        )}
        {activeTab === 'appearance' && (
          <FormattedMessage
            defaultMessage="Choose the color mode used by SuperDuck settings and sidebar."
            id="settings_appearance_description"
          />
        )}
        {activeTab === 'about' && (
          <FormattedMessage
            defaultMessage="Learn more about SuperDuck open-source project and documentation."
            id="settings_about_description"
          />
        )}
      </p>
    </div>
  );
}

function OptionsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('permissions');
  const [showMicModal, setShowMicModal] = useState(false);
  const [returnTabId, setReturnTabId] = useState<number>();

  useEffect(() => {
    const handleHashChange = () => {
      const { tab: nextTab, queryString } = parseHashTab(window.location.hash);

      let nextReturnTabId: number | undefined;
      let requestMicrophone = false;

      if (queryString) {
        const params = new URLSearchParams(queryString);
        requestMicrophone = params.get('requestMicrophone') === 'true';
        const returnTab = params.get('returnTabId');
        if (returnTab) {
          nextReturnTabId = parseInt(returnTab, 10);
        }
      }

      setActiveTab(nextTab);
      if (requestMicrophone) {
        setShowMicModal(true);
        setReturnTabId(nextReturnTabId);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  return (
    <>
      <div className="relative flex h-full w-full justify-center overflow-x-hidden overflow-y-auto bg-muted/30 py-8 text-foreground md:py-16">
        {/* Decorative background gradient */}
        <div className="pointer-events-none absolute right-0 top-0 -z-10 h-[650px] w-[650px] rounded-full bg-primary/[0.06] blur-3xl dark:bg-primary/10" />

        <div className="w-full max-w-[1100px] px-4 md:px-8 flex flex-col md:flex-row gap-8 md:gap-10">
          {/* Left Sidebar (bar) */}
          <aside className="w-full md:w-64 shrink-0 space-y-6">
            {/* Brand Header */}
            <div className="px-4 py-2 mb-2">
              <h2 className="text-xl font-black text-foreground tracking-tight">SuperDuck</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mt-0.5">
                <FormattedMessage defaultMessage="Settings" id="settings" />
              </p>
            </div>

            {/* Navigation Card */}
            <nav className="space-y-1.5 rounded-2xl bg-card/70 p-2.5 shadow-sm dark:bg-white/[0.025] dark:shadow-[0_16px_40px_rgb(0_0_0/0.18)]">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => navigateTab(item.tab)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex w-full items-center gap-3.5 overflow-hidden rounded-xl px-4 py-[11px] text-left text-[14px] font-medium transition-[color,background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.99]',
                      active
                        ? 'bg-primary/[0.08] font-semibold text-primary shadow-[0_6px_18px_rgb(0_0_0/0.04)] dark:bg-white/[0.09] dark:text-foreground dark:shadow-[0_8px_24px_rgb(0_0_0/0.16),inset_0_1px_0_rgb(255_255_255/0.04)]'
                        : 'bg-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground dark:text-foreground/60 dark:hover:bg-white/[0.05] dark:hover:text-foreground/90'
                    )}
                  >
                    <Icon
                      size={17}
                      className={cn(
                        'shrink-0 transition-[color,transform] duration-200 group-hover:scale-105',
                        active
                          ? 'text-primary dark:text-primary'
                          : 'text-muted-foreground/75 dark:text-foreground/55 dark:group-hover:text-foreground/85'
                      )}
                    />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right Main Panel (信息) */}
          <main className="flex-1 min-w-0 space-y-8">
            <header className="border-b border-border/60 dark:border-border/20 pb-5 mb-2">
              <PageTitle activeTab={activeTab} />
            </header>
            <div className="space-y-6">
              {activeTab === 'permissions' && <PermissionsTab />}
              {activeTab === 'prompts' && <TasksTab />}
              {activeTab === 'appearance' && <AppearanceTab />}
              {activeTab === 'about' && <AboutTab />}
            </div>
          </main>
        </div>
      </div>

      <MicrophonePermissionModal
        isOpen={showMicModal}
        returnTabId={returnTabId}
        onClose={() => setShowMicModal(false)}
      />
    </>
  );
}

export { OptionsPage };
