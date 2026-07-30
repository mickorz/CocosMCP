# 开源版一键配置 MCP：问题与实现方案（待实现）

> 状态：**待实现**（记录于 2026-07-30）
> 背景：新项目接入 cocos-mcp-server（开源版 v1.5.4）后，不会自动配置 AI 客户端的 `.mcp.json`，需用户手动创建。本文记录问题分析与实现方案，供后续开发。

---

## 一、问题描述

新项目安装 cocos-mcp-server 扩展后，AI 客户端（Claude Code / Cursor）**无法自动连接**——用户必须手动在项目根创建 `.mcp.json`，填好 `cocos-creator`（http MCP）+ 可选的 `chrome-devtools`（stdio MCP）。开源版缺少这个"一键配置"能力。

---

## 二、现状分析

### 2.1 两层架构——扩展够不着 AI 客户端那层

```mermaid
flowchart TD
    subgraph Client [AI 客户端层]
        CFG[.mcp.json 配置文件]
        AI[Claude Code 或 Cursor]
    end
    subgraph Editor [编辑器扩展层]
        SRV[cocos-mcp-server HTTP MCP 端口 3001]
    end
    AI --> CFG
    CFG -. 读配置才知道连哪 .-> AI
    AI <. HTTP 连接 .> SRV
```

`.mcp.json` 是 **AI 客户端**的配置文件，告诉它"去哪连 MCP server"。扩展只在 3001 端口提供服务，**不知道用户用哪个 AI 客户端、配置该写哪**，所以不会替用户生成。

### 2.2 源码证据——扩展根本不碰 `.mcp.json`

Grep 整个 `cocos-mcp-server`，无任何代码读写 `.mcp.json`。扩展自己写的配置只有：
- `settings/mcp-server.json`（端口、autoStart 等扩展自身设置，`source/settings.ts:14`）
- `settings/tool-manager.json`（工具启停配置，`source/tools/tool-manager.ts:22`）

### 2.3 README 对比表

| 功能 | 开源版 | Pro 版 |
|------|:---:|:---:|
| **一键配置** | ✕ | ✅ |

"一键配置"是 Pro 版特性，开源版没有。本方案就是给开源版补上。

### 2.4 类比理解

> `.mcp.json` 像一本**通讯录**——AI 客户端靠它知道怎么"联系"MCP server。扩展是"被联系方"，它只负责在 3001 端口"接电话"，但**不会替所有潜在来电者写通讯录**。
>
> "一键配置" = 扩展主动把自己的"联系方式"（`http://127.0.0.1:端口/mcp`）写成一条通讯录条目，放到项目根的 `.mcp.json` 里，AI 客户端一打开项目就能读到。

---

## 三、影响

- **新项目接入体验差**：每接一个新项目都要手写 JSON
- **易错**：端口号、JSON 格式、协议类型（http vs stdio）容易写错
- **附加 MCP 也要手动**：`chrome-devtools` 等增强能力需用户自己加，门槛高
- **与 Pro 版拉开差距**：开源版用户拿不到"开箱即连"体验

---

## 四、实现方案

### 4.1 功能描述

扩展提供"一键生成 `.mcp.json`"，两种触发方式：
- **面板按钮**（设置面板加一个"生成 MCP 配置"按钮）
- **MCP 工具** `server_generate_mcp_config`（AI 也能主动调用）

行为：在当前项目根（`Editor.Project.path`）生成/合并 `.mcp.json`，内容含：
- `cocos-creator`：`{ "type": "http", "url": "http://127.0.0.1:{port}/mcp" }`（端口从 `settings.port` 读，自适应）
- `chrome-devtools`（可选，面板 checkbox 控制）：`{ "command": "npx", "args": ["chrome-devtools-mcp@latest"] }`

### 4.2 流程

```mermaid
flowchart LR
    T[面板按钮或 MCP 工具] --> R[读取 settings 端口]
    R --> C[检查项目根现有 mcp json]
    C --> M[合并配置 保留用户已有项]
    M --> W[写入项目根 mcp json]
    W --> H[提示在项目目录启动 AI 客户端]
```

### 4.3 落地步骤

1. **ServerTools 新增工具** `server_generate_mcp_config`（`source/tools/server-tools.ts`）
   - 参数：`includeChromeDevtools: boolean`（是否带 chrome-devtools）
   - 读 `Editor.Project.path` + `settings.port`
   - 调合并逻辑，写 `.mcp.json`
   - 返回写入路径 + 内容预览
2. **合并逻辑**（关键，单独函数）
   - 项目根无 `.mcp.json` → 直接生成
   - 已有 → 读现有 JSON，**保留用户已有的 mcpServers 项**，只更新/添加 `cocos-creator`（端口同步）和可选 `chrome-devtools`，不覆盖其它
   - JSON 解析失败（用户手写错）→ 备份原文件再生成，提示用户
3. **面板按钮**（`panels/default`）
   - 设置面板加"生成 MCP 配置（.mcp.json）"按钮 + chrome-devtools checkbox
   - 点击调 `Editor.Message` 触发生成
4. **i18n 文案**（`i18n/{en,zh}.js`）
5. **build + 完全重启 Cocos Creator** 验证

### 4.4 关键点与坑

| 点 | 说明 |
|----|------|
| **合并而非覆盖** | 项目可能已有别的 MCP（如用户自配），必须保留，只增改 cocos-creator / chrome-devtools |
| **端口自适应** | URL 里的端口从 `settings.port` 读，别硬编码 3001 |
| **AI 客户端位置** | 生成在项目根 `.mcp.json`，对 Claude Code / Cursor 都通用（都读项目根）；用户级配置（`~/.claude.json`）不碰 |
| **使用前提提示** | 生成后要提示用户：AI 客户端需在**该项目目录**启动才能读到 |
| **chrome-devtools 可选** | 默认勾选（已验证可用），但允许去掉 |
| **坏 JSON 兜底** | 用户现有 `.mcp.json` 解析失败时备份再写，别吞错也别覆盖 |

---

## 五、待实现检查清单（TODO）

- [ ] `ServerTools` 新增 `server_generate_mcp_config` 工具 + 合并逻辑
- [ ] 设置面板加"生成 MCP 配置"按钮 + chrome-devtools checkbox
- [ ] i18n 文案（中/英）
- [ ] `npm run build` + 完全重启 Cocos Creator 测试
- [ ] 测试用例：无现有文件 / 已有文件合并 / 坏 JSON 兜底 / 端口自定义
- [ ] 更新 README 开源版接入说明（补"一键生成"用法）
- [ ] 提交 git

---

## 六、参考的当前 .mcp.json 示例（生成目标）

```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3001/mcp"
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

---

## 七、引用说明

- chrome-devtools-mcp（Chrome 官方，本项目已验证可读游戏日志）：
  https://github.com/ChromeDevTools/chrome-devtools-mcp
- Model Context Protocol（MCP 配置规范）：
  https://modelcontextprotocol.io/
- Claude Code MCP 配置（.mcp.json 项目级 / ~/.claude.json 用户级）：
  https://docs.cocos.com/creator/manual/zh/editor/extension/ （Cocos 扩展 Editor.Project API）
- 关联文档：[方案A-chrome-devtools-mcp-零侵入日志方案](./方案A-chrome-devtools-mcp-零侵入日志方案.md)
