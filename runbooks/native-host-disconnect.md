# Runbook: Native Messaging Host 断连

适用范围: `chrome-native-host` 与 `chrome-crx` 之间的 native messaging 通道

## Symptoms

- `superduck` CLI 命令报 `Error: native host disconnected`
- 扩展 service worker console 出现 `Native host has exited` / `Specified native messaging host not found`
- `superduck tab_group list` 长时间无输出后超时

## Diagnose

1. **确认 native host 已注册**

   macOS:
   ```bash
   ls -la ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.superduck.native.json
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.superduck.native.json
   ```
   确认 `path` 字段指向真实存在的二进制。

2. **确认二进制可执行**
   ```bash
   /path/from/manifest --version
   ```

3. **手动启动 native host 看日志**
   ```bash
   cd chrome-native-host
   ./build/native-host 2>&1 | tee /tmp/native-host.log
   ```
   然后在扩展中触发一个 CLI 命令,观察 stderr。

4. **检查 allowed_origins**
   manifest 中的 `allowed_origins` 必须包含当前扩展 ID(从 `chrome://extensions/` 拷贝)。

5. **检查端口冲突 / 文件锁**
   ```bash
   lsof -p $(pgrep -f superduck) 2>/dev/null | head -50
   ```

## Mitigate

1. **重新安装 native host**
   ```bash
   cd chrome-native-host
   make
   ./scripts/install.sh   # 若不存在,见 README 的注册命令
   ```

2. **重启 Chrome** (扩展会重新启动 service worker 与 native host)

3. **回滚到上一个版本**
   ```bash
   cd chrome-native-host
   git checkout <last-good-tag> -- .
   make
   ```

## Follow-up

- 如果是因 native host panic,检查 `chrome-native-host/internal/logger/` 输出的 stack trace
- 评估是否需要在 CLI 入口加 panic recovery + 自动重启
- 在 Issues 中记录 `area: chrome-native-host` + `type: bug`

## 相关代码

- Native host 入口: `chrome-native-host/cmd/native-host/`
- CLI 入口: `chrome-native-host/cmd/superduck/main.go`
- Manifest 模板: `chrome-native-host/scripts/`
