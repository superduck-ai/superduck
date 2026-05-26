#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="superduck-cli"
MIN_NODE_MAJOR="18"
NPM_REGISTRY_URL="https://registry.npmjs.org/"

has_cmd() { command -v "$1" >/dev/null 2>&1; }

log() { printf "[superduck-skill] %s\n" "$*"; }
warn() { printf "[superduck-skill][WARN] %s\n" "$*"; }
fail() { printf "[superduck-skill][ERROR] %s\n" "$*"; exit 1; }

print_env() {
  local os shell_name
  os="$(uname -s 2>/dev/null || echo unknown)"
  shell_name="${SHELL:-unknown}"
  log "OS: ${os}"
  log "Shell: ${shell_name}"

  if has_cmd node; then
    log "Node: $(node -v)"
  else
    warn "Node.js 未安装"
  fi

  if has_cmd npm; then
    log "npm: $(npm -v)"
  else
    warn "npm 未安装"
  fi

  if has_cmd pnpm; then
    log "pnpm: $(pnpm -v)"
  else
    warn "pnpm 未安装（可选）"
  fi

  if has_cmd bun; then
    log "bun: $(bun -v)"
  else
    warn "bun 未安装（可选）"
  fi
}

check_prereq() {
  has_cmd node || fail "缺少 Node.js。请先安装 Node.js >= ${MIN_NODE_MAJOR}。"
  has_cmd npm || fail "缺少 npm。请先安装 npm。"

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "${node_major}" -lt "${MIN_NODE_MAJOR}" ]]; then
    fail "Node.js 版本过低（当前 $(node -v)）。请升级到 >= ${MIN_NODE_MAJOR}。"
  fi
}

print_npm_context() {
  local npm_prefix npm_global_bin npm_registry
  npm_prefix="$(npm config get prefix 2>/dev/null || true)"
  npm_global_bin="${npm_prefix%/}/bin"
  npm_registry="$(npm config get registry 2>/dev/null || true)"
  log "npm prefix: ${npm_prefix:-unknown}"
  log "npm global bin(derived): ${npm_global_bin:-unknown}"
  log "npm registry: ${npm_registry:-unknown}"
}

check_network() {
  log "检查 npm registry 连通性..."
  if npm ping >/dev/null 2>&1; then
    log "npm registry 连接正常"
  else
    warn "npm ping 失败，尝试 HTTP 探测 registry.npmjs.org"
    if has_cmd curl; then
      curl -fsS --max-time 8 "${NPM_REGISTRY_URL}" >/dev/null || fail "网络异常：无法访问 npm registry。"
      log "HTTP 探测成功"
    else
      fail "npm ping 失败且缺少 curl，无法继续诊断网络。"
    fi
  fi
}

install_cli() {
  if has_cmd superduck; then
    log "检测到已安装 superduck: $(superduck --version 2>/dev/null || echo unknown)"
    log "尝试升级到最新版本..."
  else
    log "开始安装 ${PACKAGE_NAME} ..."
  fi

  if npm install -g "${PACKAGE_NAME}"; then
    log "${PACKAGE_NAME} 安装成功"
  else
    fail "npm 全局安装失败。可尝试: sudo npm install -g ${PACKAGE_NAME} 或配置 npm 全局目录权限。"
  fi
}

validate_install() {
  if ! has_cmd superduck; then
    warn "安装后仍找不到 superduck 命令。"
    warn '请确认 PATH 包含 npm global bin（例如执行: export PATH="$(npm config get prefix)/bin:$PATH"）。'
    fail "superduck 命令不存在。"
  fi

  log "superduck 可执行路径: $(command -v superduck)"
  if superduck --version; then
    log "版本检查通过"
  else
    fail "superduck --version 执行失败。"
  fi

  log "运行最小可用性检测: superduck doctor"
  if superduck doctor; then
    log "doctor 检测通过"
  else
    warn "doctor 检测未全部通过。通常是 Chrome 扩展未安装/未连接。"
    warn "下一步建议："
    warn "1) 运行 superduck setup 注册 native host"
    warn "2) 打开 Chrome 安装/启用 SuperDuck 扩展"
    warn "3) 再次执行 superduck doctor"
  fi
}

main() {
  print_env
  check_prereq
  print_npm_context
  check_network
  install_cli
  validate_install
  log "完成：superduck-cli 安装与环境检测流程结束。"
}

main "$@"
