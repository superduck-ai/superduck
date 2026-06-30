import { useState, useEffect } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { ListBulletsIcon, PlusIcon } from './tasksTab/icons';
import { EMPTY_STATE_DARK_SVG, EMPTY_STATE_LIGHT_SVG } from './tasksTab/emptyState';
import { ToastContainer, useToast } from './tasksTab/toast';
import { PromptCard } from './tasksTab/PromptCard';
import { EditPromptModal } from './tasksTab/EditPromptModal';
import { getScheduleText } from './tasksTab/scheduleText';
import { Button, CalendarIcon } from './ui';
import { getTodayLocalDateString } from '../utils/date';
import {
  PromptService,
  getStorageValue,
  StorageKeys,
  removeStorageValues,
  type SavedPrompt
} from '../extensionServices';

// =============================================================================
// TasksTab (main component)
// =============================================================================

function TasksTab({
  showAddForm: externalShowAddForm,
  setShowAddForm: externalSetShowAddForm,
  editingPrompt: externalEditingPrompt,
  setEditingPrompt: externalSetEditingPrompt,
  isInModal = false,
  initialTab: _initialTab = 'my-shortcuts'
}: {
  showAddForm?: boolean;
  setShowAddForm?: (v: boolean) => void;
  editingPrompt?: SavedPrompt | null;
  setEditingPrompt?: (v: SavedPrompt | null) => void;
  isInModal?: boolean;
  initialTab?: string;
} = {}) {
  const intl = useIntl();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [internalEditingPrompt, setInternalEditingPrompt] = useState<SavedPrompt | null>(null);
  const [internalShowAddForm, setInternalShowAddForm] = useState(false);

  const currentEditingPrompt =
    externalEditingPrompt !== undefined ? externalEditingPrompt : internalEditingPrompt;
  const setEditingPrompt = externalSetEditingPrompt || setInternalEditingPrompt;
  const showAddForm = externalShowAddForm !== undefined ? externalShowAddForm : internalShowAddForm;
  const setShowAddForm = externalSetShowAddForm || setInternalShowAddForm;
  const { showToast } = useToast();

  const loadPrompts = async () => {
    const all = await PromptService.getAllPrompts();
    setPrompts([...all].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)));
  };

  const scheduledPrompts = prompts.filter((p) => p.repeatType && p.repeatType !== 'none');
  const otherPrompts = prompts.filter((p) => !p.repeatType || p.repeatType === 'none');

  useEffect(() => {
    loadPrompts();
    (async () => {
      const pending = await getStorageValue<SavedPrompt>(StorageKeys.PENDING_SCHEDULED_TASK);
      if (pending) {
        const today = getTodayLocalDateString();
        const date = pending.specificDate;
        setEditingPrompt({
          ...pending,
          command: pending.command || '',
          prompt: pending.prompt || '',
          createdAt: pending.createdAt || Date.now(),
          usageCount: pending.usageCount || 0,
          specificDate: date && date >= today ? date : undefined
        });
        setShowAddForm(true);
        await removeStorageValues(StorageKeys.PENDING_SCHEDULED_TASK);
      }
    })();
  }, [setEditingPrompt, setShowAddForm]);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        intl.formatMessage({
          defaultMessage: 'Are you sure you want to delete this prompt?',
          id: 'eJFbw2HgHp'
        })
      )
    )
      return;
    await PromptService.deletePrompt(id);
    if (currentEditingPrompt?.id === id) {
      setEditingPrompt(null);
      setShowAddForm(false);
    }
    loadPrompts();
    showToast(intl.formatMessage({ defaultMessage: 'Shortcut deleted', id: 'RRFjL3H23m' }));
  };

  return (
    <>
      <ToastContainer />
      <div className="space-y-6">
        <div
          className={
            isInModal
              ? 'px-6 pt-6 pb-6'
              : 'bg-bg-100 border-[0.5px] border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8'
          }
        >
          {!isInModal && (
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-text-100 font-xl-bold">
                  <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
                </h3>
                <p className="text-text-300 font-base mt-1">
                  <FormattedMessage
                    defaultMessage="Type / in the chat to use shortcuts or run them on schedule"
                    id="type_in_the_chat_to_use_shortcuts_or"
                  />
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingPrompt(null);
                  setShowAddForm(true);
                }}
                prepend={<PlusIcon size={16} />}
                size="sm"
                className="ml-2"
              >
                <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
              </Button>
            </div>
          )}
          {isInModal && (
            <p className="text-text-300 font-base mb-6">
              <FormattedMessage
                defaultMessage="Type / to use shortcuts or run them on a schedule"
                id="type_to_use_shortcuts_or_run_them_on"
              />
            </p>
          )}
          <div className="space-y-8 mt-6">
            {scheduledPrompts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <CalendarIcon size={16} className="text-text-300" />
                  <h4 className="text-text-200 font-base-bold">
                    <FormattedMessage defaultMessage="Scheduled tasks" id="scheduled_tasks" />
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scheduledPrompts.map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      scheduleText={getScheduleText(intl, p)}
                      onEdit={() => {
                        setEditingPrompt(p);
                        setShowAddForm(true);
                      }}
                      onDelete={() => handleDelete(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {otherPrompts.length > 0 && (
              <div>
                {scheduledPrompts.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <ListBulletsIcon size={18} weight="light" className="text-text-300" />
                    <h4 className="text-text-200 font-base-bold">
                      <FormattedMessage defaultMessage="Quick actions" id="quick_actions" />
                    </h4>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {otherPrompts.map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      onEdit={() => {
                        setEditingPrompt(p);
                        setShowAddForm(true);
                      }}
                      onDelete={() => handleDelete(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {prompts.length === 0 && (
              <div className="bg-bg-200 rounded-xl p-12 text-center">
                <picture>
                  <source srcSet={EMPTY_STATE_DARK_SVG} media="(prefers-color-scheme: dark)" />
                  <img
                    src={EMPTY_STATE_LIGHT_SVG}
                    alt={intl.formatMessage({
                      defaultMessage: 'Tasks illustration',
                      id: 'heKLO07Qz/'
                    })}
                    className="w-24 h-24 mx-auto mb-1"
                  />
                </picture>
                <p className="text-text-300 max-w-[200px] mx-auto">
                  <FormattedMessage
                    defaultMessage="Create your first shortcut to get started"
                    id="create_your_first_shortcut_to_get_started"
                  />
                </p>
              </div>
            )}
          </div>
        </div>
        {showAddForm && (
          <EditPromptModal
            prompt={currentEditingPrompt}
            onClose={() => {
              setShowAddForm(false);
              setEditingPrompt(null);
            }}
            onSave={(isUpdate) => {
              loadPrompts();
              setShowAddForm(false);
              setEditingPrompt(null);
              showToast(
                isUpdate
                  ? intl.formatMessage({ defaultMessage: 'Shortcut updated', id: 'IV5WU06zbs' })
                  : intl.formatMessage({ defaultMessage: 'Shortcut added', id: 'wn15NDyLWm' })
              );
            }}
          />
        )}
      </div>
    </>
  );
}

export { TasksTab as T };
