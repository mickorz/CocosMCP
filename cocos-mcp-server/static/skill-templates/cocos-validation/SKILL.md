---
name: cocos-validation
description: Cocos Creator 参数校验技能 - 校验 JSON 参数、安全取值、格式化 MCP 请求，降低调用其他工具时的参数错误。配合 cocos-mcp 的 validation 类工具使用。
---

# Cocos 参数校验 (cocos-validation)

指导 AI 如何通过 cocos-mcp 的 validation 类工具在调用其他工具前校验参数、安全读取值、格式化 MCP 请求，降低因参数格式错误导致的调用失败。

## 何时使用

- 调用其他工具前，想校验 JSON 参数是否符合预期结构
- 需要安全地从对象里取值(避免 undefined 报错)
- 需要把请求格式化成标准 MCP 调用结构

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/validation/{工具名}`，参数走 JSON body。

| 工具 | 用途 |
|------|------|
| validate_json_params | 校验 JSON 参数结构是否符合规则 |
| safe_string_value | 安全读取字符串值，缺省返回默认值 |
| format_mcp_request | 将参数格式化为标准 MCP 请求结构 |

## 典型工作流

1. 构造好参数后，先用 validate_json_params 校验结构。
2. 处理返回结果时用 safe_string_value 安全取值。
3. 需要标准请求结构时用 format_mcp_request 格式化。

## curl 示例

安全取值(从对象中按键取字符串，缺失则用默认值)：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/validation/safe_string_value \
  -H "Content-Type: application/json" \
  -d '{"source":{"name":"Player"},"key":"name","defaultValue":"unknown"}'
```

格式化 MCP 请求(具体参数结构以工具 schema 为准)：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/validation/format_mcp_request \
  -H "Content-Type: application/json" \
  -d '{"toolName":"project_manage","arguments":{"action":"get_info"}}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 本类工具是辅助校验，不直接改动场景/资源。
- validate_json_params 等工具的具体入参结构，以 GET /api/tools 返回的 schema 为准。
- 相关技能：所有其他 cocos-* 技能在调用前都可用本技能做参数校验。
