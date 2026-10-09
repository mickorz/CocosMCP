# 常见问题排查

## 安装问题

**服务器无法启动 — 端口被占用**

检查残留进程：
```bash
netstat -ano | findstr :3001
```
终止该进程或在面板设置中修改端口。

**工具列表显示 0 或数量不正确**

删除项目中的旧配置文件：
```
settings/mcp-server.json
settings/tool-manager.json
```
重启编辑器。升级后必须执行此步骤。

**`npm run build` 报 TypeScript 错误**

确保已安装 `@cocos/creator-types`：
```bash
npm install
npm run build
```

## 运行问题

**AI 客户端无法连接**

1. 验证服务器是否运行：`curl http://127.0.0.1:3001/health`
2. 检查 URL 使用的是 `127.0.0.1` 而非 `localhost`（部分客户端解析方式不同）
3. 确认防火墙允许本地连接配置端口

**`/health` 返回 `ready: false`**

检查 `phase` 字段定位卡在哪个阶段：
- `extensionLoading` — 扩展尚未完全加载
- `serverStarting` — HTTP 服务器未启动
- `toolsRegistering` — 工具装配进行中
- `sceneLoading` — 场景未就绪，等待编辑器加载完成

**工具调用返回错误**

1. 确保场景已打开（部分工具需要打开的场景）
2. 检查工具参数是否符合 schema（使用测试页面验证）
3. 查看编辑器控制台的错误日志

**运行 `run_script_diagnostics` 时编辑器卡顿**

诊断 Worker 在独立线程执行 TypeScript 编译。首次调用需加载 TypeScript 模块，可能耗时数秒。后续调用复用持久 Worker，应该很快。

如果持续卡顿，检查 Cocos Creator 的 Node.js 运行时是否支持 `worker_threads`。

## 仍无法解决

- 在 [GitHub Issues](https://github.com/mickorz/CocosMCP/issues) 报告问题
- 联系邮箱：mike.newsky@gmail.com
