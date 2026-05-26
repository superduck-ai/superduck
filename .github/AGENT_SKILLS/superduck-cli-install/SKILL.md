# SuperDuck CLI 安装与环境自检 Skill

本 Skill 用于帮助用户完成 `superduck-cli` 的安装 + 环境自检闭环。

## 适用场景

- 用户首次安装 `superduck-cli`
- 用户反馈 `superduck` 命令不可用
- 用户希望一次性完成依赖检查、安装与最小可用性验证

## 一键执行

在仓库根目录运行:

```bash
bash .github/AGENT_SKILLS/superduck-cli-install/install-superduck-cli.sh
```

## Skill 流程

脚本会依次执行:

1. 环境识别
   - 操作系统 (`uname -s`)
   - Shell (`$SHELL`)
   - Node.js / npm / pnpm / bun 版本（pnpm、bun 为可选）
2. 依赖校验
   - 强制要求 `node` 与 `npm`
   - 校验 Node 主版本需 `>= 18`
3. npm 上下文展示
   - 输出 `npm prefix`、`npm global bin`、`npm registry`，方便定位权限与 PATH 问题
4. 网络探测
   - 优先 `npm ping`
   - 失败时回退 `curl https://registry.npmjs.org/`
5. 安装或升级
   - 执行 `npm install -g superduck-cli`
6. 安装后验证
   - `superduck --version`
   - `superduck doctor`（作为最小可用性测试）
7. 失败修复建议
   - Node 版本过低
   - npm 全局安装权限不足
   - PATH 未包含 npm global bin（脚本会提示 `npm config get prefix` 派生的 bin 路径）
   - Chrome 扩展或 native host 未连接

## 常见修复命令

```bash
# Node 版本低于要求时，先升级 Node
node -v

# npm 全局权限问题（按需）
sudo npm install -g superduck-cli

# 安装后注册 native host
superduck setup

# 再次自检
superduck doctor
```
