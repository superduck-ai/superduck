import React from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button, RadioGroup, RadioGroupItem } from '@/components/ui';
import { useStorageState } from '@/hooks/useStorageState';
import { THEME_MODE_STORAGE_KEY, type ThemeMode } from '@/themeMode';
import {
  SettingsPage,
  SettingsRow,
  SettingsRowActions,
  SettingsRowContent,
  SettingsRowDescription,
  SettingsRowTitle,
  SettingsSection,
  SettingsSeparator
} from './SettingsLayout';

const MODE_OPTIONS: {
  value: ThemeMode;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  labelId: string;
  label: string;
  descriptionId: string;
  description: string;
}[] = [
  {
    value: 'system',
    icon: Monitor,
    labelId: 'appearance_mode_system',
    label: 'System',
    descriptionId: 'appearance_mode_system_description',
    description: 'Follow your browser appearance'
  },
  {
    value: 'light',
    icon: Sun,
    labelId: 'appearance_mode_light',
    label: 'Light',
    descriptionId: 'appearance_mode_light_description',
    description: 'Use the light interface'
  },
  {
    value: 'dark',
    icon: Moon,
    labelId: 'appearance_mode_dark',
    label: 'Dark',
    descriptionId: 'appearance_mode_dark_description',
    description: 'Use the dark interface'
  }
];

function AppearanceTab() {
  const intl = useIntl();
  const [themeMode, setThemeMode] = useStorageState<ThemeMode>(THEME_MODE_STORAGE_KEY, 'system');

  return (
    <SettingsPage>
      <SettingsSection
        title={<FormattedMessage id="appearance" defaultMessage="Appearance" />}
        description={
          <FormattedMessage
            id="appearance_description"
            defaultMessage="Choose how SuperDuck settings and sidebar should look in this browser."
          />
        }
      >
        <RadioGroup
          value={themeMode}
          onValueChange={(value) => void setThemeMode(value as ThemeMode)}
          className="gap-0"
        >
          {MODE_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const active = themeMode === option.value;
            return (
              <React.Fragment key={option.value}>
                <label htmlFor={`appearance-${option.value}`} className="block cursor-pointer">
                  <SettingsRow
                    className={
                      active
                        ? 'bg-muted/30 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/20'
                    }
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
                        <Icon aria-hidden className="size-4" />
                      </span>
                      <SettingsRowContent>
                        <SettingsRowTitle>
                          <FormattedMessage id={option.labelId} defaultMessage={option.label} />
                        </SettingsRowTitle>
                        <SettingsRowDescription>
                          <FormattedMessage
                            id={option.descriptionId}
                            defaultMessage={option.description}
                          />
                        </SettingsRowDescription>
                      </SettingsRowContent>
                    </div>
                    <SettingsRowActions>
                      <RadioGroupItem id={`appearance-${option.value}`} value={option.value} />
                    </SettingsRowActions>
                  </SettingsRow>
                </label>
                {index < MODE_OPTIONS.length - 1 && <SettingsSeparator />}
              </React.Fragment>
            );
          })}
        </RadioGroup>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void setThemeMode('system')}
            disabled={themeMode === 'system'}
          >
            {intl.formatMessage({
              id: 'reset_to_system',
              defaultMessage: 'Reset to system'
            })}
          </Button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

export { AppearanceTab };
