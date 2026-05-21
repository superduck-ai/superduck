# E2E Tests

基于 Playwright 的 Chrome 扩展端到端测试，加载 `dist/` 真实构建产物在 Chromium 中运行。

## 运行

```bash
# 首次安装
bun install
npx playwright install chromium

# 运行全部 E2E 测试（自动 build）
bun run test:e2e

# 跳过 build（使用已有 dist/）
SKIP_BUILD=1 bun run test:e2e

# UI 模式调试
bun run test:e2e:ui
```

## 目录结构

```
e2e/
  ├── fixtures/extension.ts   ← 公共 fixture（扩展加载 + ID 解析）
  ├── specs/
  │   ├── modules/            ← 模块级测试
  │   ├── flows/              ← 跨模块集成流程
  │   └── live/               ← 真实联调（默认 skip，需手动开启）
  ├── playwright.config.ts
  ├── global-setup.ts
  └── tsconfig.json
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `SKIP_BUILD` | 设为任意值跳过 globalSetup 中的 `bun run build` |
| `CI` | 设置后测试失败自动重试 2 次 |
