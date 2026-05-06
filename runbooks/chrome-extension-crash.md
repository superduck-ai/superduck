# Runbook: Chrome Extension Crash / Side Panel 无法打开

适用范围: `chrome-crx` (Manifest V3 扩展, service worker + side panel)

## Symptoms

- 用户反馈 `Cmd+E` / `Ctrl+E` 无法打开 side panel
- side panel 打开后白屏 / 一直 loading
- `chrome://extensions/` 中 SuperDuck 显示 "Service worker (Inactive)" 或 "errored"
- DevTools console 中出现 `Uncaught (in promise) Error: Extension context invalidated`

## Diagnose

按顺序执行,直到定位到问题为止:

1. **检查扩展状态**
   ```
   chrome://extensions/ → SuperDuck → "service worker" 链接 → DevTools Console
   ```
   关注最后 50 行红色 error。

2. **检查 side panel devtools**
   - 右键 side panel → Inspect → Console / Network
   - 关注 `chrome-extension://<id>/sidepanel.html` 的资源是否 404

3. **检查最近一次构建**
   ```bash
   cd chrome-crx
   git log -10 --oneline -- chrome-crx/src
   bun run build
   ```
   若 build 失败,通常是上游 commit 引入了类型错误。

4. **查看 Sentry**
   - https://sentry.io → project `superduck-crx` → 过滤 `release:<git-sha>`
   - 若有大量同类错误且时间窗对齐,基本可定位故障 commit

5. **检查 Honeycomb 追踪**
   - dataset `superduck-crx` 中过滤 `service.name = sidepanel` + `error = true`

## Mitigate

按风险从低到高:

1. **指导用户重新加载扩展**
   - `chrome://extensions/` → SuperDuck → 点击刷新图标
   - 或: 关闭浏览器后重开

2. **回滚到上一个 stable release**
   - 见 [release-rollback.md](release-rollback.md)
   - 用户从 release 页下载上一个版本,Load unpacked 覆盖

3. **关闭引发崩溃的 feature flag** (若有)
   - 通过 Options 页面禁用相关功能

## Follow-up

- 在 Issues 中开 `type: bug` + `priority: P1` 描述事故
- 如果是 service worker timeout,考虑在 [chrome-crx/src/sw.ts](../chrome-crx/src/sw.ts) 增加 `keepAlive` 心跳
- 如果是 sidepanel 资源加载失败,确认 `vite.config.ts` 的 `build.rollupOptions.input` 包含所有入口

## 相关代码

- Service worker 入口: `chrome-crx/src/sw.ts`
- Side panel 入口: `chrome-crx/src/sidepanel/main.tsx`
- 构建配置: `chrome-crx/vite.config.ts`
