import { Fragment, useState, useEffect, type ReactNode } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { CalendarClock, ListChecks, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PromptCard } from './tasksTab/PromptCard';
import { EditPromptModal } from './tasksTab/EditPromptModal';
import { getScheduleText } from './tasksTab/scheduleText';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ItemGroup,
  ItemSeparator
} from './ui';
import { SettingsSection } from '../options/components/SettingsLayout';
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const currentEditingPrompt =
    externalEditingPrompt !== undefined ? externalEditingPrompt : internalEditingPrompt;
  const setEditingPrompt = externalSetEditingPrompt || setInternalEditingPrompt;
  const showAddForm = externalShowAddForm !== undefined ? externalShowAddForm : internalShowAddForm;
  const setShowAddForm = externalSetShowAddForm || setInternalShowAddForm;

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

  const handleConfirmDelete = async (id: string) => {
    try {
      await PromptService.deletePrompt(id);
      if (currentEditingPrompt?.id === id) {
        setEditingPrompt(null);
        setShowAddForm(false);
      }
      setDeleteConfirmId(null);
      loadPrompts();
      toast.success(intl.formatMessage({ defaultMessage: 'Shortcut deleted', id: 'RRFjL3H23m' }));
    } catch {
      toast.error(
        intl.formatMessage({
          defaultMessage: 'Failed to delete shortcut',
          id: 'failed_to_delete_shortcut'
        })
      );
    }
  };

  const renderPromptGroup = ({
    title,
    icon,
    items,
    scheduled
  }: {
    title: ReactNode;
    icon: ReactNode;
    items: SavedPrompt[];
    scheduled?: boolean;
  }) => (
    <section className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {icon}
        <h3 className="text-xs font-medium uppercase leading-4 tracking-normal text-muted-foreground">
          {title}
        </h3>
      </div>
      <ItemGroup className="gap-0">
        {items.map((prompt, index) => (
          <Fragment key={prompt.id}>
            <PromptCard
              prompt={prompt}
              scheduleText={scheduled ? getScheduleText(intl, prompt) : undefined}
              onEdit={() => {
                setEditingPrompt(prompt);
                setShowAddForm(true);
              }}
              onDelete={() => setDeleteConfirmId(prompt.id)}
            />
            {index < items.length - 1 && <ItemSeparator className="my-0" />}
          </Fragment>
        ))}
      </ItemGroup>
    </section>
  );

  if (isInModal) {
    return (
      <div className="space-y-6">
        <div className="space-y-6">
          <Card size="sm" className="border-0 py-0 shadow-none ring-0">
            <CardContent className="p-0">
              <p className="mb-6 text-sm text-muted-foreground">
                <FormattedMessage
                  defaultMessage="Type / to use shortcuts or run them on a schedule"
                  id="type_to_use_shortcuts_or_run_them_on"
                />
              </p>
              <div>
                {scheduledPrompts.length > 0 &&
                  renderPromptGroup({
                    title: (
                      <FormattedMessage defaultMessage="Scheduled tasks" id="scheduled_tasks" />
                    ),
                    icon: <CalendarClock aria-hidden className="size-4 text-muted-foreground" />,
                    items: scheduledPrompts,
                    scheduled: true
                  })}
                {otherPrompts.length > 0 &&
                  renderPromptGroup({
                    title: <FormattedMessage defaultMessage="Quick actions" id="quick_actions" />,
                    icon: <ListChecks aria-hidden className="size-4 text-muted-foreground" />,
                    items: otherPrompts
                  })}
                {prompts.length === 0 && (
                  <div className="m-4 flex flex-col items-center rounded-md border border-dashed border-border px-6 py-10 text-center">
                    <div className="mb-3 flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                      <ListChecks aria-hidden className="size-5" />
                    </div>
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                      <FormattedMessage
                        defaultMessage="Create your first shortcut to get started"
                        id="create_your_first_shortcut_to_get_started"
                      />
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      size="sm"
                      onClick={() => {
                        setEditingPrompt(null);
                        setShowAddForm(true);
                      }}
                    >
                      <Plus data-icon="inline-start" className="size-4" />
                      <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
                toast.success(
                  isUpdate
                    ? intl.formatMessage({ defaultMessage: 'Shortcut updated', id: 'IV5WU06zbs' })
                    : intl.formatMessage({ defaultMessage: 'Shortcut added', id: 'wn15NDyLWm' })
                );
              }}
            />
          )}
        </div>

        <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
          <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>
                <FormattedMessage defaultMessage="Delete shortcut" id="delete_shortcut_title" />
              </DialogTitle>
              <DialogDescription>
                <FormattedMessage
                  defaultMessage="Are you sure you want to delete this prompt? This action cannot be undone."
                  id="delete_shortcut_confirm_description"
                />
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                <FormattedMessage defaultMessage="Cancel" id="cancel" />
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteConfirmId) {
                    void handleConfirmDelete(deleteConfirmId);
                  }
                }}
              >
                <FormattedMessage defaultMessage="Delete" id="delete" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <SettingsSection
          title={<FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />}
          description={
            <FormattedMessage
              defaultMessage="Type / in the chat to use shortcuts or run them on schedule"
              id="type_in_the_chat_to_use_shortcuts_or"
            />
          }
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setEditingPrompt(null);
                setShowAddForm(true);
              }}
              size="sm"
            >
              <Plus data-icon="inline-start" className="size-4" />
              <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
            </Button>
          }
        >
          <div>
            {scheduledPrompts.length > 0 &&
              renderPromptGroup({
                title: <FormattedMessage defaultMessage="Scheduled tasks" id="scheduled_tasks" />,
                icon: <CalendarClock aria-hidden className="size-4 text-muted-foreground" />,
                items: scheduledPrompts,
                scheduled: true
              })}
            {otherPrompts.length > 0 &&
              renderPromptGroup({
                title: <FormattedMessage defaultMessage="Quick actions" id="quick_actions" />,
                icon: <ListChecks aria-hidden className="size-4 text-muted-foreground" />,
                items: otherPrompts
              })}
            {prompts.length === 0 && (
              <div className="m-6 flex flex-col items-center rounded-md border border-dashed border-border px-6 py-10 text-center">
                <div className="mb-3 flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                  <ListChecks aria-hidden className="size-5" />
                </div>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  <FormattedMessage
                    defaultMessage="Create your first shortcut to get started"
                    id="create_your_first_shortcut_to_get_started"
                  />
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  size="sm"
                  onClick={() => {
                    setEditingPrompt(null);
                    setShowAddForm(true);
                  }}
                >
                  <Plus data-icon="inline-start" className="size-4" />
                  <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
                </Button>
              </div>
            )}
          </div>
        </SettingsSection>
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
              toast.success(
                isUpdate
                  ? intl.formatMessage({ defaultMessage: 'Shortcut updated', id: 'IV5WU06zbs' })
                  : intl.formatMessage({ defaultMessage: 'Shortcut added', id: 'wn15NDyLWm' })
              );
            }}
          />
        )}
      </div>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage defaultMessage="Delete shortcut" id="delete_shortcut_title" />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                defaultMessage="Are you sure you want to delete this prompt? This action cannot be undone."
                id="delete_shortcut_confirm_description"
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              <FormattedMessage defaultMessage="Cancel" id="cancel" />
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  void handleConfirmDelete(deleteConfirmId);
                }
              }}
            >
              <FormattedMessage defaultMessage="Delete" id="delete" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { TasksTab as T };
