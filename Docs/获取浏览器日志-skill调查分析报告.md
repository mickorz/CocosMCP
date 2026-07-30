# 获取浏览器日志 Agent Skill 调查分析报告

> 目标：制作一个 agent skill，让 AI 能获取「当前浏览器（Cocos 预览 7456）中的游戏运行日志」。
> 技术基础：已选定并实测全绿的 chrome devtools mcp 方案，见 [方案A chrome devtools mcp 零侵入日志方案](./方案A-chrome-devtools-mcp-零侵入日志方案.md) 与 [问题分析与方案对比](./获取浏览器预览游戏日志-问题分析与方案对比.md)。
> 当前阶段：**skill 已制作完成**（cocos-browser-logs，位于 `CocosMCP/.claude/skills/cocos-browser-logs/`），决策见文末「决策结果」。

---

## 一、调查结论速览

| 项 | 结论 |
|----|------|
| 读日志靠哪个工具 | chrome devtools mcp 的 `list_console_messages`（已配在 `.mcp.json`，当前会话可用） |
| 能否拿到游戏日志 | 能。今天已实测读到 7456 的引擎初始化日志（Physics / Cocos Creator v3.7.3 等） |
| 「当前浏览器」指谁 | **chrome devtools mcp 自己拉起的专用 Chrome 实例**，不是用户手动开的预览窗口 |
| 核心坑 | 专用实例需 AI 自己 navigate 到 7456；预览刷新后消息按「导航」分窗，要看跨刷新历史得开 preserved |
| 是否改游戏代码 | 不改，零侵入 |

---

## 二、list_console_messages 工具详解

### 2.1 作用
返回**当前选中页面**自上次导航以来的浏览器控制台消息。底层是 CDP 的 `Runtime.consoleAPICalled` + `Log.entryAdded`，能拿到级别、文本、堆栈。

### 2.2 入参（均可选）

| 参数 | 类型 | 说明 |
|------|------|------|
| `types` | 字符串数组 | 按级别过滤。取值：log / debug / info / error / warn / dir / dirxml / table / trace / clear / startGroup / startGroupCollapsed / endGroup / assert / profile / profileEnd / count / timeEnd / verbose / issue |
| `pageSize` | 整数 | 每页最大条数（分页用） |
| `pageIdx` | 整数 | 页码，0 开始 |
| `includePreservedMessages` | 布尔 | 默认 false。true 时返回**最近 3 次导航**被保留的消息（用于看刷新前的历史） |
| `serviceWorkerId` | 字符串 | 仅看指定 service worker 的消息（Cocos 预览一般用不到） |

### 2.3 返回
消息列表，每条含：msgid、级别（type）、文本、（error/pageerror 还带堆栈）。配合 `get_console_message(msgid)` 可取单条详情。

### 2.4 两个关键行为（直接影响 skill 流程）

1. **「自上次导航以来」**：`list_console_messages` 默认只返回**本次导航之后**的新消息。游戏预览一旦刷新（等于一次导航），上一轮日志就不再出现在默认结果里。
2. **专用 Chrome 实例**：chrome devtools mcp 启动的是**它自己的 Chrome**，初始没有任何页面，必须先 `navigate_page` 到 `http://localhost:7456`（或局域网 IP:7456），才能真正读到游戏日志。

---

## 三、配套工具链（skill 可能用到）

| 工具 | 用途 |
|------|------|
| `list_pages` / `select_page` | 列出 / 切换 chrome devtools mcp 实例里的标签页 |
| `navigate_page` | 导航到 7456（专用实例的「接入」动作） |
| `list_console_messages` | **核心**：读控制台日志 |
| `get_console_message` | 按 msgid 取单条详情（含完整堆栈） |
| `evaluate_script` | 在页面跑 JS，如读 `window.cc` 是否就绪、读业务变量 |
| `take_screenshot` | 截图（看画面表现，辅助排错） |
| `list_network_requests` | 看网络（资源加载失败等） |

---

## 四、关键坑与边界（skill 必须处理）

1. **专用实例 vs 手开窗口**：AI 调试的是 chrome devtools mcp 的 Chrome，用户手开的预览窗口日志它看不到。skill 要么自动 navigate，要么先确认当前页是 7456。
2. **预览没开 / 页面未导航**：直接 `list_console_messages` 会拿不到游戏日志（页面不是 7456，或引擎没加载完）。需判断 `window.cc` 是否为 object。
3. **刷新即断档**：游戏刷新后默认丢失刷新前日志；要保留需 `includePreservedMessages=true`（最多 3 次导航）。
4. **cce 假象**：若 `temp/programming` 编译产物损坏，外部 Chrome 连 7456 会刷 `cce:/internal` CORS 错、`window.cc` 为 undefined。这是**编译产物问题**，不是协议不兼容——关编辑器删 `temp/programming` 重开重编译。
5. **会话加载**：`.mcp.json` 改动后需重启 Claude Code 会话才会加载 chrome devtools mcp（当前会话已可用）。

---

## 五、skill 设计草案（待确认）

### 5.1 定位
专注「读 Cocos 预览页面的浏览器日志」，与已有的 `cocos-preview-scene`（开预览）分工互补：
- `cocos-preview-scene`：把场景跑起来（编辑器侧）
- 本 skill：把跑起来后的日志读出来（浏览器侧）

### 5.2 触发词（候选）
获取浏览器日志 / 读预览日志 / 看游戏日志 / 拿 console / 报错了吗 / 有没有 error / 刷一下日志。

### 5.3 标准流程（草案）
1. 确认有页面且在 7456（`list_pages`，必要时 `navigate_page` 到 7456）。
2. 确认引擎就绪（可选 `evaluate_script` 看 `window.cc`）。
3. `list_console_messages` 取日志（按用户意图决定是否带 `types` 过滤、是否 `includePreservedMessages`）。
4. 汇总回报：总条数、按级别统计、error/warn 优先展示。

### 5.4 与 cocos-preview-scene 联动（需决策）
若发现预览没开，是否自动调用 `cocos-preview-scene` 先开预览再读日志？

### 5.5 输出与筛选（需决策）
默认只报 error/warn，还是全量返回？是否提供「含刷新前历史」选项？

---

## 六、待决策问题（需你拍板）

1. **能力范围**：纯读日志 / 日志为主且默认聚焦错误 / 日志+截图+网络全套调试。
2. **预览未开时的行为**：自动联动开预览并 navigate / 只提示用户去开。
3. **默认筛选**：默认全量 / 默认只看 error 和 warn。
4. **刷新前历史**：默认不含（只看本次）/ 默认含最近 3 次导航。
5. **skill 名称与位置**：名称候选 `cocos-game-logs` / `cocos-browser-logs` / `read-preview-logs`；位置候选当前游戏项目目录（与 cocos-preview-scene 同级）。

---

## 七、类比理解

> chrome devtools mcp 就像一个**只能坐在自己专属监控室里的质检员**：他看不见你桌上那台电脑（用户手开的预览窗口），只看得见监控室里那块屏幕（专用 Chrome）。要让他检查 7456 号流水线，得先把监控画面切到 7456（navigate）；流水线一重启（刷新），之前的录像就归档了，想看回放得专门调「近 3 次录像」（includePreservedMessages）。

---

## 八、引用说明

- chrome devtools mcp（Chrome 官方）：https://github.com/ChromeDevTools/chrome-devtools-mcp
- 让编码 Agent 调试浏览器会话（官方博客）：https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session
- Chrome DevTools Protocol 规范：https://chromedevtools.github.io/devtools-protocol/
- CDP Runtime.consoleAPICalled 事件：https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#event_consoleAPICalled
- 本仓库已实测方案：[方案A](./方案A-chrome-devtools-mcp-零侵入日志方案.md)、[方案对比](./获取浏览器预览游戏日志-问题分析与方案对比.md)
