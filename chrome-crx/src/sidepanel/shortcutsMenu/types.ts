import type { ReactNode } from 'react';
import type { SavedPrompt } from '../../extensionServices';

export interface ShortcutsMenuProps {
  searchTerm: string;
  onSelect: (command: string, label?: string) => void;
  onEditShortcut?: (shortcut: SavedPrompt) => void;
  onRecordWorkflow: () => void;
  onScheduleTask: () => void;
  onClose: () => void;
}

export interface SecondaryMenuItem {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export interface CommandMenuItem {
  key: string;
  commandId: string;
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  onEdit?: (shortcut: SavedPrompt) => void;
  shortcut?: SavedPrompt;
  searchTokens: string[];
}
