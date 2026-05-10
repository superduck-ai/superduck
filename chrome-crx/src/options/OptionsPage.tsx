import React, { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { createLucideIcon } from 'lucide-react';
import { Spinner } from '@/components/providers/AppProviders';
import { T as TasksTab } from '@/components/TasksTab';
import { StorageKeys, getStorageValue, loginWithProvider } from '@/extensionServices';
import { MicrophonePermissionModal } from './components/MicrophonePermissionModal';
import { PermissionsTab } from './components/PermissionsTab';
import { NavItem, PageContent, PageHeader } from './components/PageLayout';

const LogOutIcon = createLucideIcon('log-out', [
  ['path', { d: 'm16 17 5-5-5-5', key: '1bji2h' }],
  ['path', { d: 'M21 12H9', key: 'dn1m92' }],
  ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', key: '1uf3rs' }]
]);

const UserIcon = createLucideIcon('user', [
  [
    'path',
    {
      d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2',
      key: '975kel'
    }
  ],
  ['circle', { cx: '12', cy: '7', r: '4', key: '17ys0d' }]
]);

function OptionsPage() {
  const intl = useIntl();
  const userProfile = null as { email: string } | null;
  const isAuthenticated = false as boolean;
  const resetAnalytics = async () => {};
  const showInternal = false;
  const [apiKey, setApiKey] = useState('dev-mode');
  const [activeTab, setActiveTab] = useState<string>('permissions');
  const [showMicModal, setShowMicModal] = useState(false);
  const [returnTabId, setReturnTabId] = useState<number>();

  useEffect(() => {
    getStorageValue(StorageKeys.API_KEY).then((value) => {
      if (value) setApiKey(value);
    });
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      const [section, queryString] = hash.split('?');
      const nextTab = ['permissions', 'prompts', 'internal'].includes(section)
        ? section
        : 'permissions';

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

  const navigateTab = (tab: string) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  return (
    <div className="min-h-screen bg-bg-100">
      <PageHeader large mdTitle="Settings">
        {isAuthenticated && userProfile && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-text-300 font-base-sm">
              <UserIcon className="w-4 h-4" />
              <span>{userProfile.email}</span>
            </div>
          </div>
        )}
        {!isAuthenticated && !apiKey && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-text-300 font-base-sm">
              <FormattedMessage defaultMessage="Not logged in" id="not_logged_in" />
            </div>
            <button
              onClick={async () => {
                try {
                  await loginWithProvider();
                } catch {
                  // ignore
                }
              }}
              className="px-3 py-2 bg-accent-main-100 text-oncolor-100 rounded-lg font-base-sm hover:bg-accent-main-200 transition-colors"
            >
              <FormattedMessage defaultMessage="Login" id="login" />
            </button>
          </div>
        )}
      </PageHeader>

      <PageContent>
        <div className="mb-4 md:hidden pl-3">
          <h1 className="font-heading text-text-200 flex items-center gap-1.5">
            <FormattedMessage defaultMessage="Settings" id="settings" />
          </h1>
        </div>

        {isAuthenticated || apiKey ? (
          <div className="grid md:grid-cols-[220px_minmax(0px,_1fr)] gap-x-8 w-full max-w-6xl my-4 md:my-8">
            <nav className="w-full overflow-x-auto -m-2 p-2 self-start md:sticky md:top-4 relative z-10 mb-4 md:mb-0">
              <ul className="flex gap-1 md:flex-col mb-0">
                <li>
                  <NavItem
                    href="/settings/permissions"
                    isActive={activeTab === 'permissions'}
                    onClick={() => navigateTab('permissions')}
                  >
                    <FormattedMessage defaultMessage="Permissions" id="permissions" />
                  </NavItem>
                </li>
                <li>
                  <NavItem
                    href="/settings/prompts"
                    isActive={activeTab === 'prompts'}
                    onClick={() => navigateTab('prompts')}
                  >
                    <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
                  </NavItem>
                </li>
                {showInternal}
              </ul>

              {isAuthenticated && (
                <div className="mt-8 pt-8 border-t-[0.5px] border-border-300">
                  <button
                    onClick={async () => {
                      try {
                        await chrome.runtime.sendMessage({ type: 'logout' });
                        await resetAnalytics();
                        window.location.reload();
                      } catch {
                        alert(
                          intl.formatMessage({
                            id: 'failed_to_logout',
                            defaultMessage: 'Failed to logout. Please try again.'
                          })
                        );
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-3 text-danger-000 hover:bg-danger-000/10 rounded-lg transition-all font-base"
                  >
                    <LogOutIcon className="w-4 h-4" />
                    <FormattedMessage defaultMessage="Log out" id="log_out" />
                  </button>
                </div>
              )}
            </nav>

            <div>
              {activeTab === 'permissions' && <PermissionsTab />}
              {activeTab === 'prompts' && <TasksTab />}
              {activeTab === 'internal' && showInternal}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Spinner />
          </div>
        )}
      </PageContent>

      <MicrophonePermissionModal
        isOpen={showMicModal}
        returnTabId={returnTabId}
        onClose={() => setShowMicModal(false)}
      />
    </div>
  );
}

export { OptionsPage };
