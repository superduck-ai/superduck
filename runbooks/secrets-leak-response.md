# Runbook: 密钥 / Token 泄露应急

适用范围: 任何 API key / Token / 私钥 被意外提交到 git 历史、日志、或公共渠道

## Symptoms

- `git secret-scan` / GitHub secret scanning alert 报告匹配
- 第三方供应商 (Anthropic / PostHog / Honeycomb / Sentry) 邮件告警异常用量
- 用户截图 / 日志中包含明文 secret

## Mitigate (15 分钟内完成前 3 步)

1. **立即吊销泄露的 secret**
   - Anthropic: https://console.anthropic.com/settings/keys → revoke
   - PostHog: project settings → rotate API key
   - Honeycomb: team settings → API keys → revoke
   - Sentry: settings → DSN → 创建新 DSN 并替换
   - GitHub PAT / Actions secret: repo settings → secrets → 删除并重建

2. **更新所有调用方**
   - 仓库内: `.github/workflows/` 中的 secrets 引用
   - 用户侧: chrome-crx Options 页面引导用户重新粘贴(若是用户自己的 key,通知即可)
   - 部署环境变量: 见 `.env.example` 中列出的变量名

3. **从 git 历史擦除**(仅当 secret 是仓库内提交)
   ```bash
   git filter-repo --replace-text <(echo 'OLD_SECRET==>REDACTED') --force
   git push --force --all
   git push --force --tags
   ```
   注意: force-push 需要全员协调,并通知所有 fork。

## Diagnose

1. **确定泄露范围**
   ```bash
   git log -p --all -S '<secret-prefix>'
   gh search code '<secret-prefix>' --owner superduck-ai
   ```

2. **审计第三方供应商日志**
   - 调用时间 / IP / 地理位置 / 调用量
   - 判断是否被滥用,需要不需要联系供应商退款

3. **检查 CI 缓存 / Artifact**
   - `gh run list --limit 50` → 下载产物中的日志,搜索 secret

## Follow-up

- 在 Issues 中开 `type: security` + `priority: P0` 记录(描述中**不要包含 secret 原文**)
- 启用 / 验证 GitHub secret scanning push protection
- 检查 `.gitignore` 是否覆盖 `.env`、`keys/`、`*.pem` 等
- 评估是否引入 pre-commit secret 扫描 (gitleaks, detect-secrets)

## 相关文件

- 环境变量模板: `.env.example`
- 密钥目录: `keys/` (仓库已 ignored)
- Secret scanning workflow: `.github/workflows/` (若已启用)
