# Runbook: CI Pipeline 持续失败

适用范围: `.github/workflows/` 中的所有 workflow (build / test / lint / docs / dependabot / labels-sync / min-release-age 等)

## Symptoms

- `main` 分支 build status 红色,且非个别 PR 引起
- Dependabot PR 全部 CI 红
- `docs.yml` 无法发布到 GitHub Pages

## Diagnose

1. **查看最近的失败 run**
   ```bash
   gh run list --branch main --status failure --limit 10
   gh run view <run-id> --log-failed
   ```

2. **判断失败模式**
   - 单个 step 失败 → 看 step log
   - 全部 jobs 在 setup 阶段失败 → 通常是 runner 或 GitHub 平台问题
   - 仅 publish 阶段失败 → 检查 `GITHUB_TOKEN` 权限或 secrets

3. **本地复现**
   ```bash
   cd chrome-crx && bun install && bun run lint && bun run typecheck && bun run test
   cd chrome-native-host && make lint && make test
   node scripts/validate-agents-md.mjs
   ```

4. **检查近期变更**
   ```bash
   git log -p .github/workflows/ | head -200
   ```

## Mitigate

1. **平台问题**: 关注 https://www.githubstatus.com/,等待恢复
2. **依赖更新引起**: revert dependabot PR,或在本仓库锁定到上一个版本
3. **secrets 失效**: 在 repo settings → Secrets 中重新生成
4. **关闭误报 workflow**: 在 workflow 文件顶部临时加 `if: false`,并立即开 issue 追踪

## Follow-up

- 在 Issues 中开 `area: ci` + `type: bug` 描述根因
- 如果是测试 flaky,加入 `area: testing` + `needs: tests` 标签
- 修复后回滚临时禁用,确认 CI 绿后再合并

## 相关文件

- Workflow 目录: `.github/workflows/`
- Lint 配置: `chrome-crx/eslint.config.js`、`chrome-native-host/.golangci.yml`
- AGENTS.md 校验: `scripts/validate-agents-md.mjs`
- Min release age 校验: `scripts/check-min-release-age.mjs`
