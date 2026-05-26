# REFERENCE — superduck-cli-install Skill 详细说明

## 脚本入口

- 路径：`.github/AGENT_SKILLS/superduck-cli-install/scripts/install-superduck-cli.sh`
- 运行方式：`bash <script>`
- Shell 选项：`set -euo pipefail`

## 主要阶段

1. `print_env`
   - 输出 OS/Shell
   - 输出 Node/npm 版本
   - pnpm/bun 仅提示（可选依赖）

2. `check_prereq`
   - 强制 `node`、`npm` 存在
   - 校验 Node 主版本 >= 18

3. `print_npm_context`
   - 输出 `npm config get prefix`
   - 输出派生的 global bin：`<prefix>/bin`
   - 输出 `npm config get registry`

4. `check_network`
   - 优先 `npm ping`
   - 若失败，使用 `curl` 访问 `${registry}/-/ping`
   - registry 来源：`npm config get registry`，为空则回退默认值

5. `install_cli`
   - 执行 `npm install -g superduck-cli`
   - 失败时提示非 sudo 方案（可写 prefix 或 nvm/volta）

6. `validate_install`
   - 校验 `superduck` 命令是否存在
   - 执行 `superduck --version`
   - 执行 `superduck doctor` 并给出后续建议

## 输出规范

- 前缀：`[superduck-skill]`
- 警告：`[superduck-skill][WARN]`
- 错误：`[superduck-skill][ERROR]`（并退出）

## 可扩展建议

- 增加 `--dry-run` 参数用于只诊断不安装
- 增加 `--registry <url>` 覆盖 registry
- 在 CI 环境下提供非交互输出模式
