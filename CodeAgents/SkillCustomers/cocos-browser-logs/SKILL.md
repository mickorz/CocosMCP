---
name: cocos-browser-logs
description: 获取 Cocos 预览页面的浏览器控制台日志，通过 chrome-devtools-mcp 的 list_console_messages 读取，默认全量、支持按级别（error/warn/info/log/debug）筛选。预览端口动态获取（多工程同时开时 7456 会递增为 7457 等，绝不写死）。自动联动 cocos-preview-scene：若 chrome-devtools 已有页面在当前预览地址则直接复用，否则先取真实预览地址（server_information 查 previewUrl 或 run openBrowser=false 兜底）再 navigate 再读日志。用于查看游戏日志、预览报错、console 输出、有没有 error、刷日志、看警告等。
---

# Cocos 浏览器日志读取

读取 Cocos 预览页面（动态预览地址）在浏览器中产生的游戏运行日志（console.log / warn / error / 报错堆栈），基于 chrome-devtools-mcp 的 list_console_messages。与 cocos-preview-scene（负责开预览）分工互补。

## 核心要点（必读）

1. **专用 Chrome 实例**：chrome-devtools-mcp 用的是它自己拉起的 Chrome，不是用户手动开的预览窗口。读日志前必须确保这个实例里有页面已导航到当前预览地址。
2. **预览地址动态获取，绝不写死 7456**：多工程同时开时预览端口会自动递增（7457 等）。先按步骤 1 取当前真实预览地址（cocos-mcp 返回的已规范成 localhost），后续 navigate、判断已有页面都用它，不要复用上次的地址。
3. **默认全量**：不传 types 即返回所有级别日志。
4. **默认不含刷新前历史**：includePreservedMessages 保持 false，只返回本次导航之后的新消息。游戏刷新后，刷新前日志默认不可见。
5. **不重复开预览/页面**：先 list_pages 检查是否已有页面在当前预览地址，有则复用，没有才走「取地址 + 导航」。
6. **localhost 不用真实 IP**：cocos-mcp 返回的预览地址已是 localhost，不要用 query 出来的局域网 IP（换环境失效）。
7. **零侵入**：不改游戏代码。

## 触发条件

当用户说类似下面的话时使用本 skill：

- 获取浏览器日志 / 读预览日志 / 看游戏日志 / 拿 console
- 有没有 error / 看看警告 / 浏览器报错了吗
- 刷一下日志 / 查看控制台输出
- 只看 error / 筛一下 warn

## 关键工具与参数

| 工具 | 作用 |
|------|------|
| `server_server_information`（cocos） | action=get_comprehensive_status，返回的 previewUrl 是当前真实预览地址（首选，纯查询） |
| `project_project_manage`（cocos） | action=run, platform=browser, openBrowser=false，返回 data.url 为预览地址（previewUrl 为空时兜底） |
| `list_pages`（chrome-devtools） | 列出 chrome-devtools 实例的标签页（含 pageId、url） |
| `select_page`（chrome-devtools） | 按 pageId 切到目标页 |
| `navigate_page`（chrome-devtools） | 导航到当前预览地址（type=url） |
| `list_console_messages`（chrome-devtools） | 核心：读控制台日志 |
| `get_console_message`（chrome-devtools） | 按 msgid 取单条详情（含完整堆栈） |
| `evaluate_script`（chrome-devtools） | 跑 JS，如检查 window.cc 是否就绪 |

list_console_messages 主要参数（均可选）：

- types：级别过滤数组。取值：log / debug / info / error / warn / dir / dirxml / table / trace / verbose / issue 等。不传 = 全量。
- pageSize / pageIdx：分页（日志多时用）。
- includePreservedMessages：默认 false。true 才返回最近 3 次导航的历史。

## type 筛选映射（用户说法 → types 值）

| 用户说法 | types |
|----------|-------|
| 报错 / 错误 / error | ["error"] |
| 警告 / warn | ["warn"] |
| 普通日志 / log | ["log"] |
| info | ["info"] |
| debug | ["debug"] |
| 所有 / 全部 / 看看日志 | 不传 types |

## 标准流程

### 步骤 1：取真实预览地址（动态，不要假设 7456）

优先调 `mcp__cocos-creator__server_server_information`，action=`get_comprehensive_status`，从返回的 `previewUrl` 取预览地址，记为「预览地址」。若为空，改调 `mcp__cocos-creator__project_project_manage`：action=`run`，platform=`browser`，openBrowser=`false`，从 data.url 取。openBrowser=false 不弹系统浏览器。

### 步骤 2：检查是否已有页面在该预览地址（不重复开）

调用 `list_pages`：

- 若返回里有页面且 url 含「预览地址」的端口 → 记下其 pageId，select_page 选中它，跳到步骤 4。
- 若没有页面在该地址 → 进入步骤 3。

### 步骤 3：导航到预览地址并确认引擎就绪

先 navigate_page（type=url，url=步骤 1 取到的预览地址），再用 evaluate_script 跑：

```js
() => typeof window.cc !== 'undefined'
```

- 返回 true → 引擎已就绪，进入步骤 4。
- 返回 false / 导航失败 → 说明预览没开或编译产物异常。此时按 cocos-preview-scene 的流程处理：先用 scene_scene_management（action=open，scenePath=目标场景）在编辑器切到目标场景（不弹浏览器），再 navigate_page 到预览地址重新确认 window.cc。取地址、导航都用动态地址，不要回退写死的 7456。

> 若 window.cc 仍为 undefined 且控制台刷 cce:/internal CORS 错，是 temp/programming 编译产物损坏，关编辑器删 temp/programming 重开重编译，见「常见问题」。

### 步骤 4：读日志

调用 `list_console_messages`：

- 默认全量：不传 types，includePreservedMessages 不设（即 false）。
- 按级别筛选：用户指定级别时，按上方映射表传 types。
- 日志很多时用 pageSize / pageIdx 分页。

### 步骤 5：回报

- 给出总条数与按级别统计（error / warn / info / log 各几条）。
- 展示日志内容；error / warn 优先展示。
- 需要某条完整堆栈 → 用 get_console_message(msgid) 取详情。

## 完整示例

### 示例 A：全量读日志

用户：看看预览的浏览器日志

1. server_information(get_comprehensive_status) → previewUrl = http://localhost:7456。
2. list_pages → 已有一个 url 含该端口的页面（pageId=1）→ select_page(pageId=1)。
3. （已在预览地址，跳过导航）
4. list_console_messages（不带参数）→ 拿到全量日志。
5. 回报：共 N 条，error x / warn y / info z ……，列出内容。

### 示例 B：只看报错（页面还没导航过）

用户：有没有 error？

1. server_information(get_comprehensive_status) → previewUrl = http://localhost:7457（多工程端口递增）。
2. list_pages → 没有页面在该地址。
3. navigate_page(type=url, url=http://localhost:7457) → evaluate_script(() => typeof window.cc !== 'undefined') → false → 联动 cocos-preview-scene（scene_management open 切场景）→ 再 navigate_page 到 http://localhost:7457 → window.cc 就绪。
4. list_console_messages(types=["error"]) → 只拿到 error 级别。
5. 回报：error 条数与每条内容/堆栈。

## 常见问题

- **读到的全是空 / 不是游戏日志**：当前页面不在预览地址或引擎没加载。回到步骤 1/2，重新取地址并确认 window.cc 为 object。
- **取到的预览地址打不开**：端口变了（多工程切换、重开编辑器）。重做步骤 1 取最新地址。
- **用了真实 IP 导致换环境打不开**：一律用 cocos-mcp 返回的 localhost 预览地址，不要用 query 出来的局域网 IP。
- **刷新前的日志不见了**：默认行为。要看历史就传 includePreservedMessages=true（最近 3 次导航）。
- **cce:/internal CORS 错 + window.cc 为 undefined**：temp/programming 编译产物损坏，不是协议不兼容。关 Cocos Creator → 删 temp/programming → 重开重编译。
- **chrome-devtools 工具不可用**：.mcp.json 改动后需重启 Claude Code 会话才加载 chrome-devtools-mcp。

## 相关约定

- 与 cocos-preview-scene 协作：本 skill 负责读日志，预览未开时按 cocos-preview-scene 的流程（取动态地址 + scene_management open 切场景 + chrome-devtools navigate）打开，不弹系统浏览器。
- 三份 skill（preview-scene / browser-logs / browser-eval）共用同一动态预览地址，任一份先取到，另两份可直接复用。
- 改 cocos-mcp-server 源码后需重启编辑器（见项目记忆 cocos-mcp-server-rebuild-restart）。
- 依赖 chrome-devtools-mcp（.mcp.json 已配）与 cocos-mcp（已配）。
