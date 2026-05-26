# SuperDuck CLI 安装与环境自检 Skill

本 Skill 提供从“环境识别 → 安装/升级 superduck-cli → 安装后验证”的闭环流程。

## 目录结构

```text
superduck-cli-install/
├── SKILL.md
└── scripts/
    └── install-superduck-cli.sh
```

## 何时使用

- 首次安装 `superduck-cli`
- `superduck` 命令不存在或版本异常
- 希望快速做环境诊断（Node/npm/registry/PATH）

## 快速开始

在仓库根目录执行：

```bash
bash .github/AGENT_SKILLS/superduck-cli-install/scripts/install-superduck-cli.sh
```

## 执行流程（高层）

1. 环境识别（OS / Shell / Node / npm / pnpm / bun）
2. 依赖校验（Node>=18 且存在 npm）
3. npm 上下文输出（`npm config get prefix`、派生 bin、`npm config get registry`）
4. 网络检查（`npm ping`，失败时对配置的 registry 做 HTTP 探测）
5. 安装或升级（`npm install -g superduck-cli`）
6. 安装后验证（`superduck --version` + `superduck doctor`）
7. 失败给出修复建议（权限、PATH、Node 版本、扩展连接）

## 常见修复命令

```bash
# 版本检查
node -v
npm -v

# npm 全局权限/路径问题（避免 sudo）
npm config set prefix "$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"
npm install -g superduck-cli

# 安装后注册与自检
superduck setup
superduck doctor
```
