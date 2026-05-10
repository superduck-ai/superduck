# Runbook: MCP Server 无响应

适用范围: `chrome-native-host/cmd/mcp-server` 与扩展 MCP runtime (`chrome-crx/src/mcpRuntime/`)

## Symptoms

- `superduck --tab <id> navigate ...` 命令挂起 30s+ 后超时
- `tab_group list` 返回空但浏览器中明显有 MCP 分组
- 扩展 console 出现 `MCP request timeout` / `CDP connection closed`

## Diagnose

1. **检查 CDP 连接**
   - Chrome 启动参数中需有 `--remote-debugging-port` 或扩展通过 `chrome.debugger` API 已 attach
   - 在扩展 console 跑: `chrome.debugger.getTargets((t) => console.log(t))`

2. **手动调用 MCP server**
   ```bash
   cd chrome-native-host
   ./build/mcp-server <<< '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```
   预期返回 tools 列表 JSON。

3. **检查 tab group 状态**
   ```bash
   ./superduck tab_group list --json
   ```

4. **查看 native host 日志**
   - 见 [native-host-disconnect.md](native-host-disconnect.md) 的步骤 3

## Mitigate

1. **关闭再重新创建 MCP tab group**
   ```bash
   ./superduck tab_group close-all
   ./superduck tab_group new
   ```

2. **重启浏览器** 以释放卡死的 CDP session

3. **降级到上一个 mcp-server 版本**
   ```bash
   cd chrome-native-host
   git checkout <last-good-tag> -- internal/mcp cmd/mcp-server
   make
   ```

## Follow-up

- 若是 CDP race condition,在 `chrome-crx/src/mcpRuntime/cdp.ts` 增加超时与重试
- 若是 MCP tools/list 卡住,检查 `chrome-native-host/internal/mcp/` 中是否有阻塞的 channel
- 用 `make test-perf` 验证修复后没有引入新的慢测试

## 相关代码

- MCP runtime: `chrome-crx/src/mcpRuntime/`
- MCP server: `chrome-native-host/cmd/mcp-server/`
- Tab group 管理: `chrome-native-host/cmd/superduck/cmd_tabs_mcp.go`
