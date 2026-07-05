#!/usr/bin/env bash
# 验收: CLI finalize 后用旧 tab id 操作, 该 tab 必须被纳入 session group。
# 修复前 FAIL (操作落在 group 外), 修复后 PASS (session group 含旧 tab)。
# 用法: ./repro-stale-tab-regroup.sh   (需 Chrome 已装最新构建的扩展)
set +e
SD="${SUPERDUCK:-/Users/it00013153/go/bin/superduck}"
getId() { grep -o '"currentTabId":[0-9]*' | grep -o '[0-9]*$' | head -1; }
getMemberIds() { grep -o '"id":[0-9]*' | grep -o '[0-9]*$' | sort -n | tr '\n' ' '; }

SID="$($SD session new)"
TAB="$($SD --session "$SID" --json tab_group list --create-if-empty --name "repro" | getId)"
[ -z "$TAB" ] && { echo "FATAL: no TAB"; exit 2; }
echo "SID=$SID TAB=$TAB"

# turn1: 打开页面后 finalize(omit) → tab 脱组散落, group 释放
$SD --session "$SID" --tab "$TAB" navigate https://chat.deepseek.com/ >/dev/null 2>&1
sleep 4
$SD --session "$SID" tab_group finalize >/dev/null 2>&1
sleep 1

# turn2: 用旧 TAB(不重新 list) —— 修复前这里会裸操作散落 tab
$SD --session "$SID" --tab "$TAB" navigate "https://chat.deepseek.com/?from=turn2" >/dev/null 2>&1
sleep 2

MEMBERS="$($SD --session "$SID" --json tab_group list 2>&1 | getMemberIds)"
echo "session group members after turn2: $MEMBERS"
if echo "$MEMBERS" | grep -qw "$TAB"; then
  echo "PASS: operated tab $TAB is inside the session group"
  exit 0
else
  echo "FAIL: operated tab $TAB is NOT in session group (bug present)"
  exit 1
fi
