# FORMS — 安装执行记录模板

用于在执行 Skill 时快速记录状态，便于复现与交接。

## 1) 基本信息

- 执行时间：
- 操作系统：
- Shell：
- Node 版本：
- npm 版本：
- npm registry：

## 2) 执行命令

```bash
bash .github/AGENT_SKILLS/superduck-cli-install/scripts/install-superduck-cli.sh
```

## 3) 结果勾选

- [ ] 前置依赖通过（Node>=18，npm 可用）
- [ ] 网络探测通过（npm ping / HTTP fallback）
- [ ] `npm install -g superduck-cli` 成功
- [ ] `superduck --version` 成功
- [ ] `superduck doctor` 通过或有可操作结论

## 4) 常见失败与修复

### A. Node 版本过低

```bash
node -v
# 升级到 Node 18+
```

### B. 全局安装权限或 PATH 问题（避免 sudo）

```bash
npm config set prefix "$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"
npm install -g superduck-cli
```

### C. 扩展/Native host 未连接

```bash
superduck setup
superduck doctor
```
