# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库概览

根目录本身是一个 git 仓库，组合了三个部分：

- `CocosMCP/` —— Cocos Creator 游戏项目（3.7.3），是 AI 操控的目标场景所在（当前 `assets/` 为空）。
- `cocos-mcp-server/` —— Cocos Creator 编辑器扩展（已解除 submodule，作为主仓库的普通子目录直接被 git 跟踪）。内嵌 MCP（Model Context Protocol）服务器，让 AI 客户端（Claude、Cursor 等）通过 HTTP 标准化协议操控编辑器。开源版 v1.5.4，共 50 个工具。
- `acp.sh` / `acpExample.sh` —— 根目录 git 工作流脚本，一键 add/commit/push（已无 submodule，直接处理主仓库）。

## 常用命令

### cocos-mcp-server（TypeScript 扩展）
```bash
cd cocos-mcp-server
npm install          # 触发 preinstall：联网校验 @cocos/creator-types 版本
npm run build        # tsc，source/ -> dist/
npm run watch        # tsc -w 监听重新编译
```
- 扩展运行时加载的是 `dist/main.js`。**改了 `source/` 必须重新 build**，否则编辑器加载旧产物。
- TS 配置：`tsconfig.json` 继承 `base.tsconfig.json`，`target ES2017 / CommonJS / strict`，types 为 `node` + `@cocos/creator-types/editor`；`rootDir=./source`、`outDir=./dist`。

### CocosMCP（游戏项目）
- 用 Cocos Creator 编辑器打开 `CocosMCP/` 目录运行/预览；脚本编译由编辑器自动处理。
- `CocosMCP/tsconfig.json` 继承 `./temp/tsconfig.cocos.json`（编辑器生成，勿改 base 字段）。

### Git（一键提交）
```bash
bash acp.sh "提交说明"   # 已无 submodule，直接 add/commit/push 主仓库（含 cocos-mcp-server 改动）
bash acpExample.sh       # 只读自检（不推送），确认脚本与仓库识别正确
```

### 测试
- 仓库无单元测试框架。`acpExample.sh` 提供 `acp.sh` 的只读自检。

## 架构：cocos-mcp-server（编辑器扩展）

这是典型的 Cocos Creator 扩展分层，理解它需要串联多个文件：

```mermaid
flowchart LR
    A[AI客户端 Claude Cursor] --> B[HTTP MCP协议]
    B --> C[MCPServer 主进程]
    C --> D[工具类]
    D --> E[编辑器消息 Editor Message]
    E --> F[场景脚本 scene]
    F --> G[操作 Cocos 场景]
```

- `source/main.ts` —— **扩展主进程入口**。导出 `methods` 对象，响应编辑器消息（`start-server` / `open-panel` / `update-settings` 等，定义见 `package.json` 的 `contributions.messages`）；持有 `MCPServer` 单例与 `ToolManager`，管理服务生命周期。
- `source/mcp-server.ts` —— **`MCPServer` 类**。启动 Node `http` server 实现 MCP 协议；`initializeTools()` 实例化全部 13 个工具类挂到 `this.tools`；通过 `enabledTools` 控制对外暴露哪些工具。
- `source/tools/*.ts` —— **按域划分的工具类**：SceneTools / NodeTools / ComponentTools / PrefabTools / ProjectTools / DebugTools / PreferencesTools / ServerTools / BroadcastTools / SceneViewTools / ReferenceImageTools / AssetAdvancedTools / ValidationTools。每个工具类定义 AI 可调用的操作，内部通过 `Editor.Message` 与编辑器/场景通信。
- `source/scene.ts` —— **场景脚本**（`package.json` 的 `contributions.scene.script`，运行在场景进程）。主进程通过 `Editor.Message.request('scene', ...)` 调用这里的方法（如 `createNewScene` / `addComponentToNode` / `getNodeInfo`）实际读写场景树。**节点与组件的真实增删改只能在此进程执行**。
- `source/tools/tool-manager.ts` —— 工具启用/禁用、配置导入导出的管理器。
- `panels/`（编译产物 `dist/panels/`）—— Vue 3 编写的编辑器面板（设置、工具管理 UI）。
- `i18n/{en,zh}.js` —— 面板与菜单文案。

数据流：AI 客户端 → HTTP → `MCPServer` 路由到工具类 → 工具类发 `Editor.Message` → `scene.ts`（场景操作）或编辑器 API → 改变场景。

## 重要约定与注意事项

- **`cocos-mcp-server` 是主仓库的普通子目录**：已解除 submodule（commit b33058d），源码直接被主仓库 git 跟踪，远程为本地 Gitea（`http://127.0.0.1:3000/mickorz/CocosMCP.git`），不再是 GitHub 的 submodule。改源码后直接在主仓库提交即可，无需 fork/PR、无需更新指针。
- **无需初始化 submodule**：clone 后直接可用，不再需要 `git submodule update --init`。
- **`acp.sh` 直接提交主仓库**：已无 submodule，脚本会跳过 submodule 阶段，直接 add/commit/push 主仓库（`cocos-mcp-server` 的改动随主仓库一起提交）。
- **版本不匹配需留意**：扩展要求 Cocos Creator `>=3.8.6`，而 `CocosMCP` 项目是 `3.7.3`。在该项目里启用扩展可能需要升级编辑器版本。
- **扩展加载**：`cocos-mcp-server` 需构建后在 Cocos Creator 扩展管理器中加载（入口 `dist/main.js`），接入步骤参考 `cocos-mcp-server/README.md`。
- **忽略规则分层**：根目录 `.gitignore` 负责根级别（OS / IDE / 日志）；`CocosMCP/.gitignore`（Cocos 标准模板）忽略 `library/ temp/ build/ profiles/ local/ node_modules/`。提交前确认未把 `library/`、`temp/` 等大目录带入。

## 扩展接入约定

`cocos-mcp-server` 源码在仓库根（git 跟踪），接入 Cocos 项目的方式按场景区分：

- **本仓库项目（CocosMCP）**：用目录 junction 接入 `CocosMCP/extensions/cocos-mcp-server` -> 仓库根 `cocos-mcp-server`。单一来源，改源码或重新 build 后 Cocos 刷新扩展即生效，无需复制。`CocosMCP/extensions/` 已在根 `.gitignore` 排除，不重复跟踪。
- **外部项目（不在本仓库）**：可直接把整个 `cocos-mcp-server` 目录复制到目标项目的 `extensions/`，代价是改源码后要重新复制 + build。

建 junction（PowerShell）：
```powershell
New-Item -ItemType Directory -Force "<项目路径>/extensions"
New-Item -ItemType Junction -Path "<项目路径>/extensions/cocos-mcp-server" -Target "E:\CocosProjects\CocosMCP\cocos-mcp-server"
```

## 文档同步到 Obsidian

本项目所有 Markdown 文档（`.md`）的**新增 / 修改 / 删除**会自动镜像到 Obsidian 知识库：

- 目标目录：`E:\Obsidian\newsky\AI岗位\CocosMCP`
- 范围：仓库内所有 `.md`，**排除 `cocos-mcp-server`（第三方扩展目录）**等目录
- 结构：Obsidian 内保持相对仓库根的目录路径

实现方式（Claude Code hook 自动化，无需手动复制）：
- `.claude/hooks/sync-docs.js` —— 同步脚本（PostToolUse 触发）
- `.claude/settings.local.json` —— hook 配置（本地、不进 git）
- 新增 / 修改由 `Write|Edit|MultiEdit` 的 PostToolUse 自动复制；删除由 `Bash` 命令中检测到 `rm .md` 时尽力移除

注意：
- 删除依赖 Bash 命令解析，复杂场景（`rm -rf` 整个目录、通配符）可能漏判；**删除单个 `.md` 文件最可靠**，删除目录后建议人工核对 Obsidian 侧。
- 修改 `.claude/settings.local.json` 或脚本后，通常需**重启 Claude Code 会话**让 hook 生效。
- Obsidian 目标根目录**不硬编码在脚本里**（脚本可随仓库共享、不含个人路径）：由 `.claude/settings.local.json` 的 hook command 以命令行参数传入，也可用环境变量 `OBSIDIAN_COCOSMCP_ROOT` 覆盖；`SYNC_DOCS_VERBOSE=1` 时脚本输出同步日志。
- `.claude/settings.local.json` 已在 `.gitignore` 排除、不进 git；换机器时需在新机器的该文件里配置自己的 Obsidian 路径。
- 新增 / 修改文档时无需手动操作；若发现 Obsidian 侧缺失，可手动重跑脚本或在会话内重新编辑该文件触发同步。
