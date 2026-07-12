import { FormattedMessage, useIntl } from 'react-intl';
import { MoreVertical, Pencil, Slash, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '../ui';
import type { SavedPrompt } from '../../extensionServices';

export function PromptCard({
  prompt,
  scheduleText,
  onEdit,
  onDelete
}: {
  prompt: SavedPrompt;
  scheduleText?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const intl = useIntl();
  const actionsLabel = intl.formatMessage({
    defaultMessage: 'Shortcut actions',
    id: 'shortcut_actions'
  });

  return (
    <Item className="rounded-none border-0 px-4 py-3.5 sm:flex-nowrap">
      <ItemMedia>
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          <Slash aria-hidden className="size-4" />
        </span>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full text-sm font-medium leading-5">
          <span className="truncate">/{prompt.command}</span>
          {scheduleText && (
            <Badge
              variant="outline"
              className="shrink-0 border-border bg-muted/60 text-muted-foreground"
            >
              <FormattedMessage defaultMessage="Scheduled" id="scheduled" />
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription className="max-w-full text-sm leading-5">
          <span className="line-clamp-2 whitespace-pre-wrap break-words">{prompt.prompt}</span>
        </ItemDescription>
        {scheduleText && (
          <ItemDescription className="max-w-full text-xs">
            <span className="truncate">{scheduleText}</span>
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={actionsLabel}
                title={actionsLabel}
                className="text-muted-foreground hover:text-foreground"
              />
            }
          >
            <MoreVertical aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil aria-hidden className="size-4" />
              <FormattedMessage defaultMessage="Edit" id="edit_2" />
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 aria-hidden className="size-4" />
              <FormattedMessage defaultMessage="Delete" id="delete" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}
