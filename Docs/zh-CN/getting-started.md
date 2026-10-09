# 快速开始

## 前提条件

- Cocos Creator 3.7.3 或更高版本（已测试 3.8.6+）
- Node.js（Cocos Creator 自带）
- 支持 MCP 协议的 AI 客户端（Claude CLI、Cursor、VS Code 等）

## 安装

1. 将整个 `cocos-mcp-server` 文件夹复制到 Cocos Creator 项目的 `extensions/` 目录：

```
你的项目/
├── assets/
├── extensions/
│   └── cocos-mcp-server/    <- 放在这里
├── settings/
└── ...
```

2. 安装依赖并构建：

```bash
cd extensions/cocos-mcp-server
npm install
npm run build
```

3. 重启 Cocos Creator 或在扩展管理器中刷新扩展。

## 验证

1. 通过菜单打开面板：`扩展 > Cocos MCP Server`
2. 面板应显示服务器状态和工具列表
3. 默认端口为 `3001`（可在面板设置中修改）

## 第一次运行

1. 点击面板中的**启动服务器**
2. 验证服务器是否运行：

```bash
curl http://127.0.0.1:3001/health
```

预期输出：
```json
{
  "status": "ok",
  "tools": 50,
  "version": "1.5.5",
  "ready": true,
  "phase": "ready"
}
```

3. 连接 AI 客户端：

Claude CLI：
```bash
claude mcp add --transport http cocos-creator http://127.0.0.1:3001/mcp
```

Claude Desktop / Cursor：
```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```

## 下一步

- [配置参考](configuration.md) — 端口、自动启动、工具管理设置
- [操作指南](how-to-guides.md) — 常见任务操作步骤
