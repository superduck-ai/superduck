# SuperDuck Runbooks

本目录收录 SuperDuck 各组件的事故响应 (Incident Response) 与值班 (On-call) 操作手册。每个 runbook 描述一类典型故障的**诊断步骤**、**缓解操作**与**根因排查清单**,目标是让任何 on-call 工程师或 AI 代理在不熟悉代码细节的情况下也能快速恢复服务。

## 目录

| Runbook | 适用场景 |
|---|---|
| [chrome-extension-crash.md](chrome-extension-crash.md) | Chrome 扩展 service worker 崩溃 / side panel 无法打开 |
| [native-host-disconnect.md](native-host-disconnect.md) | Native messaging host 断连、CLI 无法与扩展通信 |
| [mcp-server-unresponsive.md](mcp-server-unresponsive.md) | MCP server 无响应 / tab_group 命令超时 |
| [release-rollback.md](release-rollback.md) | 发布出现严重回归时回滚到上一个 stable 版本 |
| [ci-pipeline-failure.md](ci-pipeline-failure.md) | GitHub Actions / Dependabot / docs workflow 持续失败 |
| [secrets-leak-response.md](secrets-leak-response.md) | 密钥/Token 泄露的取证与轮换流程 |

## 使用约定

- 每个 runbook 以**症状 (Symptoms)** 开头,确保值班人能快速定位是否命中。
- **诊断 (Diagnose)** 列出可直接复制的命令,按从快到慢、从无副作用到有副作用排序。
- **缓解 (Mitigate)** 优先于根因分析:先恢复用户,再回头查根因。
- **跟进 (Follow-up)** 收集需要在事故后开 issue / PR 的工作项,使用 `incident` + `type: bug` 标签。

## 外部链接

- 事故记录与时间线: 仓库 Issues 中带 `incident` 标签的条目
- 监控仪表盘: 见 [chrome-crx Honeycomb dataset](https://ui.honeycomb.io) (内部链接)
- 状态页: TODO — 接入公开 status page 后在此补充

## 维护

- 每次 P0 / P1 事故后,值班人需要在 7 天内更新对应 runbook 或新增条目。
- 每季度 review 一次,删除已经不再适用的步骤,标注最后验证时间。
