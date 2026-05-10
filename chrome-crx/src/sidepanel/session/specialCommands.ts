import { useIntl } from 'react-intl';
import { isChineseLocale } from '../../utils/locale';

const COMPACT_COMMAND = 'compact';

export interface SpecialCommand {
  command: string;
  label: string;
  aliases: string[];
  description: string;
}

function getCompactCommandLabel(intl?: ReturnType<typeof useIntl>) {
  if (isChineseLocale(intl?.locale)) {
    return intl
      ? intl.formatMessage({
          defaultMessage: '清理上下文',
          id: 'compact_command_name'
        })
      : '清理上下文';
  }

  return COMPACT_COMMAND;
}

export function getSpecialCommands(intl?: ReturnType<typeof useIntl>): SpecialCommand[] {
  const compactLabel = getCompactCommandLabel(intl);
  const compactAliases = isChineseLocale(intl?.locale)
    ? [compactLabel, '清理', '压缩上下文', '压缩对话']
    : [COMPACT_COMMAND];
  const compactDescription = isChineseLocale(intl?.locale)
    ? '清理历史记录并保留摘要'
    : 'Clear history and keep summary';

  return [
    {
      command: COMPACT_COMMAND,
      label: compactLabel,
      aliases: compactAliases,
      description: intl
        ? intl.formatMessage({
            defaultMessage: compactDescription,
            id: 'AtUwwM+FWM'
          })
        : compactDescription
    }
  ];
}

export function resolveSpecialCommand(
  inputCommand: string,
  intl?: ReturnType<typeof useIntl>
): SpecialCommand | undefined {
  const normalizedInput = inputCommand.trim().toLowerCase();
  if (!normalizedInput) return undefined;

  return getSpecialCommands(intl).find((entry) =>
    [entry.command, entry.label, ...entry.aliases].some(
      (candidate) => candidate.trim().toLowerCase() === normalizedInput
    )
  );
}

export function isSpecialCommand(command: string, intl?: ReturnType<typeof useIntl>): boolean {
  return !!resolveSpecialCommand(command, intl);
}
