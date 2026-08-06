---
name: cocos-browser-eval
description: 在 Cocos 预览页面（动态预览地址，多工程时 7456 会递增为 7457 等，绝不写死）动态执行任意 JS 代码，基于 chrome-devtools-mcp 的 evaluate_script（CDP），可访问 window.cc 等 Cocos 运行时对象，用于检查场景节点、调用引擎 API（cc.director / cc.find / getComponent 等）、读取游戏运行状态、动态测试与调试。依赖 cocos-preview-scene 先把预览页开在专用 Chrome 里，与 cocos-browser-logs（读日志）分工互补。触发词：执行JS、跑代码、eval、动态执行、检查运行时、调用cc、查看节点状态、在游戏里运行脚本、读游戏变量、调试运行时。
---

# Cocos 预览页动态执行 JS（CDP）

在 Cocos 预览页面（动态预览地址，由 chrome-devtools-mcp 的专用 Chrome 打开）上，通过 evaluate_script 动态执行任意 JS，访问 window.cc 等 Cocos 运行时对象。

三个 skill 分工：
- cocos-preview-scene：把预览页开在专用 Chrome 里（开浏览器）
- cocos-browser-logs：读控制台日志（读日志）
- 本 skill：在预览页跑 JS，读写 Cocos 运行时（执行 eval）

## 核心要点（必读）

1. **默认 1 次调用**：直接 evaluate_script，函数开头先自检 window.cc 是否就绪，再执行核心逻辑（见操作步骤的自检模板）。不必每次先 list_pages——那会多一次往返；list_pages 仅在 eval 自检报"页面不对"时才用来排查。
2. **预览地址动态获取，绝不写死 7456**：自检不要用 location.href.indexOf('7456') 这种写死端口的判断（多工程时端口是 7457 等，会误判）。改用 typeof window.cc 判断是否在预览页（window.cc 只在 Cocos 预览页存在）。需要 navigate 时用动态地址（server_information 查 previewUrl，或 run openBrowser=false 兜底）。
3. **核心工具 evaluate_script（chrome-devtools）**：在当前选中页的 JS 上下文执行一个函数，返回值需 JSON 可序列化。
4. **能访问 window.cc**：Cocos 引擎全局对象，可调用 cc.director、cc.find、director.getScene() 等读运行时状态。执行前可先 () => typeof window.cc 确认引擎就绪。
5. **返回值必须可序列化**：Cocos 节点对象有循环引用，不能直接 return 节点本身，要提取需要的字段（name / active / position / components 等）。
6. **默认只读**：本 skill 用于查询/检查；修改运行时（改节点属性、调 setter、增删节点）需用户明确要求，并说明影响（刷新后失效，不改源码）。
7. **零侵入**：不改游戏源码，只在运行时执行。

## 触发条件

- 在游戏里跑一段 JS / 执行这段代码 / eval 一下
- 检查场景里的节点 / 看看 Canvas 下有哪些子节点
- 调用 cc.xxx / 读取游戏里的某个变量
- 当前场景名是什么 / 节点 active 状态 / 组件属性值
- 动态测试某个 API / 调试运行时

## 关键工具与参数

| 工具 | 作用 |
|------|------|
| `evaluate_script`（chrome-devtools） | 核心：在当前选中页跑 JS 函数，返回 JSON（函数内自检 window.cc 即可确认是否在预览页） |
| `server_server_information`（cocos） | action=get_comprehensive_status，返回 previewUrl 为真实预览地址（需要 navigate 时用，首选） |
| `project_project_manage`（cocos） | action=run, platform=browser, openBrowser=false，data.url 为预览地址（previewUrl 为空时兜底） |
| `list_pages`（chrome-devtools） | 仅排查用：eval 自检报"页面不对"时，看当前选中页是谁 |
| `select_page`（chrome-devtools） | 按 pageId 切到预览页（排查时用） |
| `navigate_page`（chrome-devtools） | 自检发现不在预览页时，切到动态预览地址 |

evaluate_script 要点：
- function：一个 JS 函数声明（箭头函数最常用），如 () => cc.director.getScene().name。
- 返回值：函数 return 的值会被 JSON 序列化返回。只能 return 可序列化值（基本类型、普通对象、数组）。
- 执行环境：页面 main world，能访问 window、window.cc、document 以及游戏脚本挂的全局对象。
- 在当前选中页执行：跑的是 chrome-devtools 当前选中的那个标签页。不确定是不是预览页时，函数开头自检 typeof window.cc，别盲目跑。
- args（可选）：传页面元素的 uid 数组，函数形参接收对应 DOM 元素（一般用不到，除非操作特定 DOM）。

## Cocos 运行时常用 JS 片段

```js
// 1. 引擎是否就绪
() => typeof window.cc

// 2. 当前场景名 + 一级子节点
() => {
  const s = cc.director.getScene();
  return { name: s.name, children: s.children.map(n => n.name) };
}

// 3. 按路径查找节点，读关键属性（提取字段，避免循环引用）
() => {
  const n = cc.find('Canvas/目标节点名');
  if (!n) return null;
  return {
    name: n.name,
    active: n.active,
    position: { x: n.position.x, y: n.position.y, z: n.position.z },
    children: n.children.map(c => c.name),
    components: n.getComponents(cc.Component).map(c => c.constructor.name)
  };
}

// 4. 取某组件的属性
() => {
  const n = cc.find('Canvas/目标节点名');
  if (!n) return null;
  const c = n.getComponent('Label');      // 按类名取组件
  return c ? { string: c.string, fontSize: c.fontSize } : null;
}

// 5. 引擎信息
() => ({ scene: cc.director.getScene().name, totalTime: cc.director.getTotalTime() })
```

> 具体类名/方法以项目 Cocos 版本（本项目 3.7.3）为准；cc.find 在 3.x 仍可用。

## 自检模板（推荐：把确认 + 执行合并成 1 次调用）

```js
() => {
  // 1) 确认引擎就绪（window.cc 只在 Cocos 预览页存在；不要用端口号判断，多工程端口会变）
  if (typeof window.cc === 'undefined') return { ccNotReady: true };
  // 2) 核心代码（只 return 可序列化字段）
  const s = cc.director.getScene();
  return { scene: s.name, children: s.children.map(n => n.name) };
}
```

返回值判断：
- 正常对象 → 成功，直接回报。
- { ccNotReady: true } → 引擎没就绪或当前选中页不是预览页：稍等重 eval；持续不就绪则按 cocos-preview-scene 流程，先取动态预览地址（server_information 或 run openBrowser=false）再 navigate 过去，然后回步骤 1。

## 操作步骤

### 1. 直接 eval（带自检，通常 1 次搞定）

evaluate_script 跑"自检模板 + 用户核心代码"。正常就完成（只调 1 次 chrome-devtools）。

### 2.（仅自检报错时）排查

- 报 ccNotReady → 稍等重 eval；仍不行说明当前选中页不是预览页（或预览没开）：先 server_information(get_comprehensive_status) 取 previewUrl（空则 project_project_manage run openBrowser=false 兜底），再 navigate_page(url=该动态预览地址)，然后回步骤 1。需要时用 list_pages / select_page 确认选中页。

### 3. 回报

把返回的 JSON 结果解读给用户；若执行报错，贴出错误并定位（节点路径不对、类名拼错、API 在该版本不存在等）。

## 完整示例

### 示例 A：查当前场景结构（只读）

用户：看看当前预览场景有哪些一级节点

1. evaluate_script：
   ```js
   () => {
     if (typeof window.cc === 'undefined') return { ccNotReady: true };
     const s = cc.director.getScene();
     return { scene: s.name, children: s.children.map(n => `${n.name}(${n.children.length})`) };
   }
   ```
2. 回报：场景 sss，一级节点 Canvas(3)、Main Camera(0)、Light(0)……

### 示例 B：读某节点 Label 文本（只读）

用户：Canvas 下 Btn 节点的 Label 写的什么？

1. evaluate_script：
   ```js
   () => {
     if (typeof window.cc === 'undefined') return { ccNotReady: true };
     const n = cc.find('Canvas/Btn');
     if (!n) return { error: '节点不存在' };
     const lbl = n.getComponent('Label');
     return lbl ? { text: lbl.string } : { error: '无 Label 组件' };
   }
   ```
2. 回报：Btn 的 Label 文本是"开始"。

### 示例 C：动态改节点状态（修改类，需用户明确要求）

用户：把 Btn 节点临时藏掉看看效果

1. evaluate_script：
   ```js
   () => {
     if (typeof window.cc === 'undefined') return { ccNotReady: true };
     const n = cc.find('Canvas/Btn');
     if (!n) return { error: '节点不存在' };
     n.active = false;
     return { name: n.name, active: n.active };
   }
   ```
2. 回报：已把 Btn 设为 inactive；注意：这是运行时修改，刷新页面后恢复，不改源码。

## 常见问题

- **返回报错 / 序列化失败**：大概率 return 了节点/组件本身（循环引用）。改成只 return 需要的字段。
- **cc.xxx is undefined**：引擎没就绪或 API 名错。先 typeof window.cc，再核对该版本 API（3.x 部分旧 API 已调整）。
- **cc.find 返回 null**：节点路径不对。先用场景结构片段（示例 A）确认真实路径再查。
- **ccNotReady（当前页不是预览页）**：evaluate_script 跑在了错误页面（常见于 Chrome 重连后选中了 about:blank）。先 server_information 取动态预览地址，navigate_page 切过去，或按 cocos-preview-scene 打开预览；再回步骤 1。
- **chrome-devtools 工具不可用**：.mcp.json 改动后需重启 Claude Code 会话才加载 chrome-devtools-mcp。

## 相关约定

- 依赖 cocos-preview-scene 先开预览（专用 Chrome 在动态预览地址）；与 cocos-browser-logs 互补（一个读日志，一个跑 JS）。
- 三份 skill（preview-scene / browser-logs / browser-eval）共用同一动态预览地址，任一份先取到，另两份可直接复用。
- 预览地址绝不写死 7456；自检一律用 window.cc，不用端口号。
- 改 cocos-mcp-server 源码后需重启编辑器（项目记忆 cocos-mcp-server-rebuild-restart）。
