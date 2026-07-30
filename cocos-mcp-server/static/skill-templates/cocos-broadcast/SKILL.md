---
name: cocos-broadcast
description: Cocos Creator 消息广播技能 - 监听/停止编辑器事件，获取与清空广播日志。配合 cocos-mcp 的 broadcast 类工具使用。
---

# Cocos 消息广播 (cocos-broadcast)

指导 AI 如何通过 cocos-mcp 监听/停止编辑器事件消息、获取已广播的消息日志、清空日志。用于跨进程/跨扩展的事件通信与观察。

## 何时使用

- 要监听某些编辑器事件(指定 messageType)、或停止监听
- 要查看当前有哪些活跃的监听器
- 要获取最近的广播消息记录(可按类型与数量过滤)
- 要清空广播消息历史

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/broadcast/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| broadcast_log_management | get_log / clear_log | 取广播消息日志(可 limit + messageType 过滤)、清空 |
| broadcast_listener_management | start_listening / stop_listening / get_active_listeners | 开始/停止监听(需 messageType)、列活跃监听器 |

## 典型工作流

1. 先看在监听什么：broadcast_listener_management action=get_active_listeners。
2. 开始监听某事件：action=start_listening 传 messageType(如 scene:ready)。
3. 触发/等待事件后取消息：broadcast_log_management action=get_log 传 limit。
4. 不再需要时：broadcast_listener_management action=stop_listening 传 messageType。
5. 清空记录：broadcast_log_management action=clear_log。

## curl 示例

开始监听事件：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/broadcast/broadcast_listener_management \
  -H "Content-Type: application/json" \
  -d '{"action":"start_listening","messageType":"scene:ready"}'
```

获取最近 20 条广播日志：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/broadcast/broadcast_log_management \
  -H "Content-Type: application/json" \
  -d '{"action":"get_log","limit":20}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- start/stop 监听需要准确的 messageType。
- 相关技能：场景事件见 cocos-scene，调试日志见 cocos-debug。
