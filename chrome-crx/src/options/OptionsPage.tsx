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
      <div className="relative flex min-h-screen w-full justify-center overflow-hidden bg-muted/30 py-8 text-foreground md:py-16">
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
            <nav className="space-y-1 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm dark:border-border/30">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => navigateTab(item.tab)}
                    className={cn(
                      'w-full flex items-center gap-3.5 px-4 py-[11px] text-[14px] font-medium rounded-xl transition-all duration-200 text-left',
                      active
                        ? 'bg-primary/[0.08] text-primary dark:bg-primary/[0.18] dark:text-primary-foreground font-semibold'
                        : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn(
                        'shrink-0 transition-transform duration-200',
                        active
                          ? 'text-primary dark:text-primary-foreground'
                          : 'text-muted-foreground/75'
                      )}
                    />
                    <span>{item.label}</span>
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
