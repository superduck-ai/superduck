# Runbook: 发布回滚 (Release Rollback)

适用范围: chrome-crx 扩展打包发布、`superduck` CLI 二进制发布

## Symptoms

- 新发布版本上线后用户大量上报严重 bug (扩展无法启动 / CLI panic / 数据丢失)
- Sentry 错误率较上一版本翻倍以上
- 关键 e2e 冒烟测试在 stable 渠道失败

## Mitigate (优先恢复)

1. **找到上一个 stable tag**
   ```bash
   git tag --sort=-creatordate | head -10
   ```

2. **回滚 GitHub Release "Latest" 标记**
   - https://github.com/superduck-ai/superduck/releases
   - 编辑当前 release → 取消勾选 "Set as the latest release"
   - 编辑上一个 stable release → 勾选 "Set as the latest release"

3. **chrome-crx: 通知用户 / 替换 dist**
   - 在 release notes 顶部加 `> ⚠️ 已知严重问题,请回退到 vX.Y.Z`
   - 若发布到 Chrome Web Store,使用 dashboard 的 "Rollback to previous version"

4. **CLI: 替换 npm dist-tag**
   ```bash
   npm dist-tag add @superduck/cli@<last-good-version> latest
   ```

5. **代码层 revert (可选)**
   ```bash
   git revert -m 1 <bad-merge-sha>
   git push origin main
   ```
   触发 CI 重建,产出修复版 release。

## Diagnose (回滚之后再做)

- 收集 bad release 与 last-good release 的 diff: `git log <last-good>..<bad> --oneline`
- 在 Sentry / Honeycomb 上对比两版本的错误率与延迟分布
- 复现 bug 并补上回归测试

## Follow-up

- 在 Issues 中开 `incident` + `type: bug` + `priority: P0` 记录时间线
- PR 修复时关联 incident issue,要求 reviewer 显式 ack
- 评估是否需要在 release workflow 增加 canary 阶段(如灰度 5% 用户 24h)

## 相关代码

- Release workflow: `.github/workflows/`(若已配置)
- 构建脚本: `chrome-crx/scripts/`、`chrome-native-host/Makefile`
