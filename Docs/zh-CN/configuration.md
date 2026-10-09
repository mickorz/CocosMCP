# 配置参考

## 配置字段

设置存储在 Cocos Creator 项目根的 `settings/mcp-server.json` 中，可通过面板编辑。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| port | number | 3001 | HTTP 服务器端口（绑定 127.0.0.1） |
| autoStart | boolean | false | 编辑器加载时自动启动服务器 |
| autoOpenPanel | boolean | true | 编辑器加载时自动打开面板 |
| enableDebugLog | boolean | false | 开发调试用的详细日志 |
| maxConnections | number | 10 | 最大并发 HTTP 连接数 |
| allowedOrigins | string[] | ["*"] | CORS 允许的来源 |

工具配置单独存储在 `settings/tool-manager.json` 中，支持多套命名配置，每个工具可独立启用/禁用。

## 生效与验证

- **端口变更**：停止服务器，创建新的 MCPServer 实例，在新端口上重启
- **工具启用/禁用**：立即生效，无需重启服务器（实时更新工具列表）
- **验证**：`GET /health` 返回当前工具数量和就绪状态

## 升级

1. 删除项目中的 `settings/mcp-server.json` 和 `settings/tool-manager.json`（必需，避免旧配置干扰）
2. 用新版本替换 `extensions/cocos-mcp-server` 文件夹
3. 运行 `npm install && npm run build`
4. 重启 Cocos Creator

## 卸载

使用面板头部的**卸载**按钮，将执行以下清理：
- 移除所有勾选平台已安装的 skills
- 移除项目根的 `.mcp.json`
- 尝试通过 `Editor.Message.request('extension', 'uninstall-extension')` 卸载扩展本身
