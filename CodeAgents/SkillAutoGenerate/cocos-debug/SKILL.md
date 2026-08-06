---
name: cocos-debug
description: Cocos Creator 调试技能 - 读取/清空控制台日志，搜索与分析日志文件，获取编辑器信息与性能统计。配合 cocos-mcp 的 debug 类工具使用。
---

# Cocos 调试工具 (cocos-debug)

指导 AI 如何通过 cocos-mcp 读取编辑器控制台日志、搜索日志文件、获取编辑器与项目信息、性能统计，用于排障与状态检查。

## 何时使用

- 要看编辑器控制台最近日志(含 log/warn/error)、或清空控制台
- 要读取或搜索日志文件(找报错堆栈、特定关键词)
- 要获取编辑器信息、性能统计(节点数/组件数/draw call 等)

## 可用工具

端点：`POST http://127.0.0.1:3001/api/debug/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| debug_console | get_logs / clear | 取控制台日志(可按 type 过滤、limit 限制)、清空 |
| debug_logs | read / search / info | 读日志文件、搜关键词、看日志文件信息 |
| debug_system | editor_info / performance | 编辑器与项目信息、性能统计 |

## 典型工作流

1. 运行后看日志：debug_console action=get_logs 传 type=error 只看错误，或 type=all 看全部。
2. 找具体报错：debug_logs action=search 传 pattern 匹配关键词。
3. 看性能：debug_system action=performance 拿节点数、draw call、三角形数等。
4. 清屏重来：debug_console action=clear。

## curl 示例

读取控制台最近 50 条错误日志：
```bash
curl -X POST http://127.0.0.1:3001/api/debug/debug_console \
  -H "Content-Type: application/json" \
  -d '{"action":"get_logs","type":"error","limit":50}'
```

搜索日志文件中的报错：
```bash
curl -X POST http://127.0.0.1:3001/api/debug/debug_logs \
  -H "Content-Type: application/json" \
  -d '{"action":"search","pattern":"Exception"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 注意区分编辑器控制台日志(debug_console)与日志文件(debug_logs)。
- 相关技能：运行预览见 cocos-project，服务器状态见 cocos-server。
