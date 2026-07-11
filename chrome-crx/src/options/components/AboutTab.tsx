import React from 'react';
import { FormattedMessage } from 'react-intl';
import { Code, Globe, Heart, Star } from 'lucide-react';
import { SettingsPage, SettingsSection } from './SettingsLayout';

function AboutTab() {
  const openUrl = (url: string) => {
    chrome.tabs.create({ url });
  };

  return (
    <SettingsPage>
      <SettingsSection
        title={<FormattedMessage id="about_superduck" defaultMessage="About SuperDuck" />}
        description={
          <FormattedMessage
            id="about_description"
            defaultMessage="An open-source AI browser agent designed to assist you in automating web tasks seamlessly."
          />
        }
      >
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-muted/20 border border-border/40">
            <div className="size-16 shrink-0 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center p-2.5">
              <img src="/icon-128.png" className="w-full h-full object-contain" alt="SuperDuck" />
            </div>
            <div className="space-y-1.5 text-center sm:text-left">
              <h3 className="text-lg font-bold text-foreground">SuperDuck</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                <FormattedMessage
                  id="about_project_intro"
                  defaultMessage="SuperDuck is a next-generation browser assistant powered by advanced agentic AI, providing side panel control, natural language orchestration, and robust workflow automation."
                />
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => openUrl('https://github.com/superduck-ai/superduck')}
              className="flex items-center justify-between p-4 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <Code size={18} />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    <FormattedMessage id="about_github_project" defaultMessage="GitHub Project" />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">superduck-ai/superduck</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => openUrl('https://superduck-ai.github.io/superduck/')}
              className="flex items-center justify-between p-4 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <Globe size={18} />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    <FormattedMessage
                      id="about_official_website"
                      defaultMessage="Official Website"
                    />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">superduck-ai.github.io</p>
                </div>
              </div>
            </button>

            <button
              onClick={() =>
                openUrl(
                  'https://chromewebstore.google.com/detail/superduck/komnjkkihimgafgblijcchlgeiogpjgi?hl=zh-CN&utm_source=ext_sidebar'
                )
              }
              className="flex items-center justify-between p-4 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <Star size={18} />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    <FormattedMessage id="about_rate_review" defaultMessage="Rate & Review" />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Chrome Web Store</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FormattedMessage defaultMessage="Made with" id="made_with" />
            <Heart size={12} className="animate-pulse fill-brand text-brand" />
            <FormattedMessage defaultMessage="by the SuperDuck Team" id="by_the_team" />
          </div>
          <div>v1.0.0</div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

export { AboutTab };
