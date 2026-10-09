# 贡献者指南

## 环境与常用命令

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript 到 dist/
npm run watch        # 监视模式（tsc -w）
```

需要 `@cocos/creator-types` 提供 Editor API 类型定义。

## 架构总览

```
main.ts                  扩展入口（load/unload 生命周期）
  ├── mcp-server.ts      HTTP 服务器 + MCP 协议 + 工具路由
  ├── tools/             14 个工具类，共 50 个操作
  │   ├── scene-tools.ts
  │   ├── node-tools.ts
  │   ├── component-tools.ts
  │   ├── prefab-tools.ts
  │   ├── project-tools.ts
  │   ├── debug-tools.ts       （含 run_script_diagnostics）
  │   ├── diagnostics.ts       （通过 worker_threads 执行 TypeScript 编译）
  │   ├── script-tools.ts
  │   ├── preferences-tools.ts
  │   ├── server-tools.ts
  │   ├── broadcast-tools.ts
  │   ├── scene-view-tools.ts
  │   ├── reference-image-tools.ts
  │   ├── asset-advanced-tools.ts
  │   └── validation-tools.ts
  ├── panels/default/    Vue 3 面板界面
  ├── scene.ts           Scene 进程脚本（IPC 桥接）
  └── settings.ts        持久化设置（mcp-server.json）
```

工具命名：`${类别}_${工具名}`（如 `scene_management`）。通过 `executeToolCall()` 执行，按第一个下划线分割类别和方法名。

## 测试

无自动化测试框架。手动测试方式：
- 浏览器测试页面 `http://127.0.0.1:{port}/skill-tester`
- 通过 `curl` 调用 `/health`、`/mcp` 和 `/api/*` 端点

## 本地开发流程

1. 在 `source/` 中编辑 TypeScript 源码
2. `npm run watch` 保存时自动编译到 `dist/`
3. 在 Cocos Creator 扩展管理器中重新加载扩展
4. 通过测试页面或直接 MCP 调用进行测试

## 发布

1. 在 `package.json` 中更新版本号
2. `npm run build`
3. 提交并推送到 `master`
4. 在 GitHub 上创建 Release Tag
