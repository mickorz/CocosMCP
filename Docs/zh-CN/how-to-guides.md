# 操作指南

## 启动 MCP 服务器

1. 打开面板：`扩展 > Cocos MCP Server`
2. 点击**启动服务器**
3. 用 `curl http://127.0.0.1:3001/health` 验证，`ready` 应为 `true`

## 连接 Claude CLI

```bash
claude mcp add --transport http cocos-creator http://127.0.0.1:3001/mcp
```

## 运行 TypeScript 编译诊断

发送 MCP 工具调用或使用测试页面：

```json
{
  "tool": "debug_run_script_diagnostics",
  "arguments": {}
}
```

返回 `assets/` 脚本的 TypeScript 错误列表（file/line/column/code/message），自动过滤 `node_modules/` 和引擎声明的噪音。

## 管理工具配置

1. 打开面板的**工具**标签页
2. 创建或选择一个配置
3. 用复选框切换单个工具的启用/禁用
4. 变更立即生效（无需重启服务器）

## 生成 MCP 配置文件

1. 在**服务器**标签页，点击**生成 .mcp.json**（适用于 Claude Desktop / Cursor）
2. 或点击**生成 opencode.json**（适用于 OpenCode）
3. 配置文件会写入项目根目录

## 使用浏览器测试页面

1. 启动 MCP 服务器
2. 在浏览器打开 `http://127.0.0.1:{port}/skill-tester`
3. 选择工具类别标签，填写参数，点击**Execute**
4. 可复制结果或保存为 JSON 文件

## 安装技能到 AI 客户端

1. 打开**技能**标签页
2. 勾选需要的技能（自动生成 + 自定义）
3. 点击**安装技能** — 将 SKILL.md 文件写入 `.claude/skills/cocoscli/`
