# AGENTS.md

本文件为 AI 编码代理（Claude Code、Codex、Cursor 等）在本仓库工作时的基础指引。

## 仓库概览

SuperDuck 是一个浏览器 AI 助手,由多个子项目组成:

| 目录 | 说明 | 语言/构建 |
|---|---|---|
| `chrome-crx/` | Chrome 扩展(Manifest V3),包含 side panel、content script、service worker、MCP runtime | TypeScript + Vite,使用 **Bun** |
| `chrome-native-host/` | Native messaging host + `superduck` CLI + MCP server | Go + Makefile |
| `coworkd/` | Cowork 守护进程 | Go |
| `desktop/` | 桌面端封装 | - |
| `mac-native-addon/` | macOS 原生 Node addon | Swift / C++ |
| `npm/` | npm 分发包 | - |

主要工作区: `chrome-crx`(扩展功能)与 `chrome-native-host`(CLI / 原生桥)。

## Monorepo 工作区

仓库根用两套 workspace 工具把多个子项目绑成一个 monorepo,新增子模块时请同步登记:

- **JS/TS** — 根 `package.json` 声明 `"workspaces": ["chrome-crx", "npm/packages/*"]`,Bun / npm / yarn 任一都能识别。在仓库根 `bun install` 会同时安装所有子包依赖,并把 husky / lint-staged 等开发工具集中放在根 `node_modules/`。
- **Go** — 仓库根 [`go.work`](go.work) 通过 `use` 指令把 `./chrome-native-host` 纳入工作区。在仓库根直接 `go build ./...` / `go test ./...` 就能跨模块编译,IDE / 代理也能基于此识别每个 Go 子项目的 module 边界。新增 Go 模块(例如未来真正落地 `coworkd/`)时,先 `cd <dir> && go mod init <name>`,再在 `go.work` 的 `use (...)` 块中追加路径并提交,不要让多模块项目散落在根 module 之外。
- `go.work.sum` 是本地缓存,**不**提交;`go.work` 是工作区契约,**必须**提交。

## 构建命令

### chrome-crx(Chrome 扩展)

使用 **Bun**,不要用 npm/pnpm/yarn。

```bash
cd chrome-crx
bun install          # 安装依赖
bun run build        # 生产构建 → dist/
bun run dev          # 监听模式
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run format       # prettier
bun run test         # vitest run (单元 + 集成)
bun run test:coverage # vitest 覆盖率 + 阈值门禁 (lines/statements/branches ≥ 90%, functions ≥ 55%)
bun run test:perf    # 运行测试并写出 JUnit XML 报告 (test-results.junit.xml)
bun run test:perf:report # 解析 JUnit 报告,打印每个 suite 耗时、慢测试 (>= 300ms) 与 Top10
# CI=1 bun run test  # 额外输出 verbose 计时 + JUnit 报告 (test-results.junit.xml),
#                    # 用于 BuildPulse / Datadog CI / GitHub test-reporter 跟踪测试耗时
```

构建产物在 `chrome-crx/dist/`,加载扩展时指向该目录。
**修改任何 `chrome-crx/src/**` 下的源码后都要立即 `bun run build` 验证。**

### chrome-native-host(Go)

```bash
cd chrome-native-host
make              # 构建 native-host / mcp-server / superduck 三个二进制到 build/
make superduck    # 只构建 CLI
make test         # 运行 go test ./...
make test-coverage # 覆盖率门禁(默认 ≥ 40%, 见 COVERAGE_PACKAGES / MIN_COVERAGE 变量)
make test-perf    # 运行测试并输出 per-test 耗时 + test-results.json,
                  # 报告慢测试 (>= SLOW_TEST_MS, 默认 500ms) 与 Top10 最慢用例
make lint         # 运行 golangci-lint(配置见 .golangci.yml)
make lint-install # 首次使用前安装 pinned 版本的 golangci-lint
```

构建完成后,`chrome-native-host/superduck` 通常是指向 `build/superduck` 的软链;如果丢失用 `ln -sf build/superduck superduck` 重建。

### Pre-commit Hooks (husky + lint-staged)

仓库根目录配置了 husky + lint-staged,首次 clone 后请在仓库根执行:

```bash
bun install      # 或 npm install — 触发 husky `prepare` 脚本,在 .git 中注册钩子
```

之后每次 `git commit` 时会自动:

- 对暂存的 `chrome-crx/src/**/*.{ts,tsx,js,json}` 跑 `prettier --write` 与 `eslint --fix`
- 对暂存的 `chrome-native-host/**/*.go` / `coworkd/**/*.go` 跑 `gofmt -w` 与 `go vet ./...`

钩子失败时提交会被中止;修复后重新 `git add` 再 `git commit`。如需绕过(不推荐),可加 `--no-verify`。

## 依赖最小发布年龄 (min-release-age)

为缓解供应链攻击,所有引入或升级到刚发布的依赖版本必须先经过冷却期:

- **政策**:任何 `package.json` / `go.mod` 中的版本必须**至少发布 3 天**后才允许进入主干。Major 升级建议延长到 7 天。
- **Dependabot**:[`.github/dependabot.yml`](.github/dependabot.yml) 的 `cooldown` 块强制 Dependabot 不在窗口内开 PR(default 3d / minor 5d / major 7d)。
- **CI 校验**:[`.github/workflows/min-release-age.yml`](.github/workflows/min-release-age.yml) 在每个修改 `package.json` / `go.mod` 的 PR 上运行 [`scripts/check-min-release-age.mjs`](scripts/check-min-release-age.mjs),向 npm/Go module proxy 查询每个新版本的发布时间并阻止 < 3 天的引入。
- **临时豁免**:确实需要紧急升级(例如 CVE 修复)时,在 PR 描述中说明,然后用 `workflow_dispatch` 重新触发该 workflow 并把 `days` 调低,或获得 reviewer 显式批准后再合并。

## API 文档自动生成

- TypeScript 侧用 [TypeDoc](https://typedoc.org) 生成 `chrome-crx/docs/api/`,本地运行 `bun run docs`(配置见 [`chrome-crx/typedoc.json`](chrome-crx/typedoc.json)),`bun run docs:check` 只校验不写盘
- Go 侧由 CI 通过 `go doc -all <pkg>` 给每个包生成纯文本快照,便于 agent 检索
- [`.github/workflows/docs.yml`](.github/workflows/docs.yml) 在每次 PR 上构建文档,合并到 `main` 后将 TypeDoc 站点 + godoc 快照发布到 GitHub Pages

## Dev Container

仓库根目录提供 [`.devcontainer/`](.devcontainer/devcontainer.json),含 Node + Bun + Go 1.25 + gh 与必要的 VS Code 扩展。在 Codespaces 或本地 Dev Containers 中打开即可获得统一环境,`postCreateCommand` 会自动运行 [`post-create.sh`](.devcontainer/post-create.sh) 完成依赖拉取。

## AGENTS.md 自验

仓库根的 [`scripts/validate-agents-md.mjs`](scripts/validate-agents-md.mjs) 会校验本文件的 `bun run <script>` 引用都存在于 `chrome-crx/package.json`、`make <target>` 引用都存在于 `chrome-native-host/Makefile`、所有相对链接都能解析到真实文件。CI 工作流 [`.github/workflows/validate-agents-md.yml`](.github/workflows/validate-agents-md.yml) 在每次涉及 `AGENTS.md` / `package.json` / `Makefile` 的 PR 上运行该脚本。本地可直接执行:

```bash
node scripts/validate-agents-md.mjs
```

## 环境变量

仓库根目录的 [`.env.example`](.env.example) 列出了常用的环境变量及默认值/示例;复制为 `.env` 后按需填写。简要分组:

| 变量 | 作用域 | 说明 |
|---|---|---|
| `SUPERDUCK_POSTHOG_KEY` | chrome-native-host | PostHog write key,留空则不发送埋点 |
| `SUPERDUCK_POSTHOG_HOST` | chrome-native-host | 自定义 PostHog 域名,默认 `https://us.i.posthog.com` |
| `SUPERDUCK_ANALYTICS_DISABLED` | chrome-native-host | `1/true` 强制关闭埋点 |
| `SUPERDUCK_SENTRY_DSN` | chrome-native-host | Sentry/GlitchTip DSN,留空则不上报错误 |
| `SUPERDUCK_ERRORTRACK_DISABLED` | chrome-native-host | `1/true` 强制关闭错误上报 |
| `SUPERDUCK_ENV` | chrome-native-host | 错误上报的 environment tag,默认 `production` |
| `POSTHOG_KEY` | chrome-native-host Makefile | release 构建时通过 `-ldflags -X` 注入到二进制 |
| `SLOW_TEST_MS` / `TOP_N` / `FAIL_OVER_MS` | chrome-crx 测试报告 | `chrome-crx/scripts/test-perf-report.mjs` 的阈值与门禁 |
| `CI` | 通用 | CI 环境自动注入,本地不要手动设置 |

> 注意:扩展运行时使用的 `ANTHROPIC_API_KEY` 通过 Options 页面 UI 写入 `chrome.storage`,不读取环境变量。

## 约定与原则

- **修改即构建**:改完代码立即跑对应的 build,验证通过再回复用户。
- **不做多余的防御**:不加无用的 try/catch、不写冗长注释、不引入向后兼容壳。
- **优先复用已有结构**,而不是新建抽象。
- **中文交流**:用户是中文用户,回复请使用中文。

## 命名约定 (Naming Conventions)

仓库统一执行下面的命名规则,新增 / 修改代码时请遵循。TS 侧已通过 `@typescript-eslint/naming-convention` 在 `chrome-crx/eslint.config.js` 强制,Go 侧遵循官方 `gofmt`/`go vet`/`golint` 风格。

### TypeScript / JavaScript (`chrome-crx/src/**`)

| 类别 | 约定 | 例子 |
|---|---|---|
| 变量 / 局部常量 | `camelCase` | `tabId`, `currentUser` |
| 模块级常量(不可变字面量) | `UPPER_CASE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS` |
| 函数 | `camelCase` | `fetchTabInfo()`, `parseUrl()` |
| React 组件 / 类 / 类型 / 接口 / 枚举 | `PascalCase` | `SidepanelApp`, `TabInfo`, `MessageKind` |
| 枚举成员 | `PascalCase` 或 `UPPER_CASE` | `MessageKind.Request`, `Status.OK` |
| 私有 / 故意未使用的标识符 | 前缀 `_` | `_unused`, `_internal` |
| 文件名 | 组件用 `PascalCase.tsx`,工具/hook 用 `camelCase.ts` | `SidepanelApp.tsx`, `useTabStatus.ts` |
| 对象字面量 / 接口属性 | 不强制(为兼容外部 API / JSON) | `{ "Content-Type": "..." }` |

避免:
- 缩写大小写混乱(`HTTPUrl` → 用 `HttpUrl` 或 `httpUrl`)。
- TS 接口加 `I` 前缀(`IUser` ❌,直接 `User` ✅)。
- snake_case 变量(除非来自外部 JSON schema)。

### Go (`chrome-native-host/**`、`coworkd/**`)

遵循 [Effective Go](https://go.dev/doc/effective_go#names) 与 `gofmt`:

- 包名:全小写、单个单词,无下划线(`tabgroup`,不要 `tab_group`)。
- 导出标识符:`PascalCase`(`NewTabGroup`、`ServerConfig`)。
- 未导出标识符:`camelCase`(`newTabGroup`、`serverConfig`)。
- 缩写保持统一大小写:`URL`、`ID`、`HTTP`(用 `parseURL` 而不是 `parseUrl`,导出版用 `ParseURL`)。
- 接收者:1–2 个字母短名,且全文件保持一致(`func (s *Server) ...`)。
- 错误变量:`errXxx`(包内)/ `ErrXxx`(导出)。
- 常量:依语义选 `PascalCase` / `camelCase`,不用 `UPPER_CASE`。

### 通用

- 文件名与目录名:Go 用全小写(必要时下划线),TS 见上表。
- 测试文件:Go 用 `*_test.go`,TS 用 `*.test.ts` / `*.spec.ts`。
- 提交信息 scope 用小写短名(`cli`、`crx`、`sidepanel`)。

新代码若违反 TS 命名规则会触发 ESLint warning;Go 侧请在提交前跑 `go vet ./...`。

## 事故响应 / Runbooks

仓库根目录的 [`runbooks/`](runbooks/) 目录收录了各组件的事故响应手册,值班工程师与代理在排障时优先查阅:

| 场景 | Runbook |
|---|---|
| Chrome 扩展崩溃 / side panel 打不开 | [runbooks/chrome-extension-crash.md](runbooks/chrome-extension-crash.md) |
| Native messaging host 断连 | [runbooks/native-host-disconnect.md](runbooks/native-host-disconnect.md) |
| MCP server 无响应 | [runbooks/mcp-server-unresponsive.md](runbooks/mcp-server-unresponsive.md) |
| 发布回滚 | [runbooks/release-rollback.md](runbooks/release-rollback.md) |
| CI pipeline 持续失败 | [runbooks/ci-pipeline-failure.md](runbooks/ci-pipeline-failure.md) |
| 密钥泄露应急 | [runbooks/secrets-leak-response.md](runbooks/secrets-leak-response.md) |

入口索引见 [runbooks/README.md](runbooks/README.md);新增事故类型时请补充 runbook 并在该索引登记。

## 目录入口速查

- 扩展 MCP runtime / CDP 桥: [chrome-crx/src/mcpRuntime/cdp.ts](chrome-crx/src/mcpRuntime/cdp.ts)
- 扩展视觉指示器(含 blocking overlay): [chrome-crx/src/agent-visual-indicator.ts](chrome-crx/src/agent-visual-indicator.ts)
- CLI 入口与 usage 文本: [chrome-native-host/cmd/superduck/main.go](chrome-native-host/cmd/superduck/main.go)
- Tab group 子命令: [chrome-native-host/cmd/superduck/cmd_tabs_mcp.go](chrome-native-host/cmd/superduck/cmd_tabs_mcp.go)
- 端到端测试脚本: [chrome-native-host/testdata/](chrome-native-host/testdata/)

## CLI 使用要点

`superduck` CLI 协议命令:

```bash
./superduck tab_group list --create-if-empty     # 确保 MCP 分组存在
TAB=$(./superduck tab_group new | sed -n 's/.*Tab ID: *\([0-9][0-9]*\).*/\1/p' | head -1)
./superduck --tab $TAB navigate https://example.com
./superduck --tab $TAB screenshot --output /tmp/
```

完整帮助: `./superduck --help`。

## 测试

```bash
cd chrome-native-host
go run ./testdata/server -addr :8765 &    # 本地测试服
./testdata/run_cli_test.sh                 # CLI 冒烟测试
./testdata/visual_test.sh                  # 视觉回归(/tmp/sd_visual/*.png)
```

## PR / 提交

- 提交信息使用 conventional commits(`feat:`/`fix:`/`refactor:` 等)。
- 常用 scope:`cli`、`crx`、`scroll`、`sidepanel` 等。
- 通过 `gh pr create` 开 PR,不要在未经用户确认时直接 merge / force push。
- PR 模板见 [`.github/pull_request_template.md`](.github/pull_request_template.md);Issue 模板见 [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/)(bug / feature / chore / agent-task)。

## Issue / PR 标签体系 (Labeling System)

仓库的 label 列表是**源代码化**的:唯一来源是 [`.github/labels.yml`](.github/labels.yml),由 [`.github/workflows/labels-sync.yml`](.github/workflows/labels-sync.yml) 在 push 到 `main` 时自动同步到 GitHub(也支持手动触发)。修改 label 必须改 `labels.yml`,不要在 GitHub UI 里直接改。

label 命名规则统一为 `<group>: <slug>`(全小写、kebab-case),分为以下几组,Issue / PR 模板已预填合理默认值:

| Group | 用途 | 示例 |
|---|---|---|
| `type:` | 工作类型(每个 issue 必填一个) | `type: bug`、`type: feature`、`type: chore`、`type: docs`、`type: test`、`type: perf`、`type: security`、`type: agent-task`、`type: question`、`type: enhancement` |
| `priority:` | 优先级(bug / agent-task 必填) | `priority: P0` 紧急、`priority: P1` 高、`priority: P2` 中、`priority: P3` 低 |
| `area:` | 影响的子项目,对齐仓库概览 | `area: chrome-crx`、`area: chrome-native-host`、`area: coworkd`、`area: desktop`、`area: mac-native-addon`、`area: npm`、`area: ci`、`area: docs`、`area: testing`、`area: tooling` |
| `status:` | 工作流状态,triager / 机器人维护 | `status: triage`、`status: ready`、`status: in-progress`、`status: blocked`、`status: needs-review`、`status: stale`、`status: wontfix`、`status: duplicate` |
| `needs:` | 当前阻塞点 | `needs: repro`、`needs: design`、`needs: tests`、`needs: docs` |
| 其他 | 可发现性 / 元信息 | `good first issue`、`help wanted`、`agent: ready`、`breaking-change`、`dependencies` |

**给代理 (agent) 的提示**:挑取任务时优先看 `agent: ready` + `status: ready`;按 `priority:` 和 `area:` 过滤。新建 issue 时至少打上 `type:` + 一个 `area:`,用 `priority:` 表达紧急程度。
