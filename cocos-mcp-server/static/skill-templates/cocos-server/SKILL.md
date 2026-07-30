---
name: cocos-server
description: Cocos Creator 服务器信息技能 - 查询 IP/端口/综合状态，测试连通性与网络接口。配合 cocos-mcp 的 server 类工具使用，连接前先查状态。
---

# Cocos 服务器信息 (cocos-server)

指导 AI 如何通过 cocos-mcp 查询编辑器服务器状态(IP 列表、端口、综合状态)、测试连通性、获取网络接口信息。适合在调用其他工具前确认连接与地址。

## 何时使用

- 连接前想确认编辑器服务器的端口与可用 IP
- 要拿到完整的综合状态(IPs + 端口 + 系统信息)
- 要测试服务器连通性与响应时间
- 要查看本机网络接口信息

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/server/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| server_information | get_ip_list / get_sorted_ip_list / get_port / get_comprehensive_status | IP 列表、排序 IP、端口、综合状态 |
| server_connectivity | test_connectivity / get_network_interfaces | 测连通性、查网络接口 |

## 典型工作流

1. 连接前：server_information action=get_port 拿端口，或 get_comprehensive_status 看综合状态。
2. 需要访问地址：action=get_sorted_ip_list 拿排序后的 IP。
3. 排障连接：server_connectivity action=test_connectivity 测响应时间。
4. 看网卡：action=get_network_interfaces。

## curl 示例

获取综合状态：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/server/server_information \
  -H "Content-Type: application/json" \
  -d '{"action":"get_comprehensive_status"}'
```

测试连通性：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/server/server_connectivity \
  -H "Content-Type: application/json" \
  -d '{"action":"test_connectivity"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 注意区分编辑器自带服务器(本技能)与 cocos-mcp 的 MCP 服务器(默认 3001，见 cocos-project)。
- 相关技能：项目运行见 cocos-project，调试日志见 cocos-debug。
