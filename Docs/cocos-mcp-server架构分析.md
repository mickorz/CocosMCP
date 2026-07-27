# Cocos MCP Server 完整架构分析

> 本文聚焦 `cocos-mcp-server` v1.5.4 开源版的**架构维度**,用 Mermaid 图描述分层、进程、通信、协议、工具系统、回退策略、配置、生命周期与容错设计。工具清单详见同目录《cocos-mcp-server源码分析.md》。

---

## 一、架构总览

### 1.1 分层架构

整个系统分四层,自上而下逐层代理,每一层只与相邻层通信:

```mermaid
flowchart TD
    subgraph L1[第一层 AI 客户端层]
        A1[Claude 客户端]
        A2[Cursor 客户端]
        A3[其他 MCP 客户端]
    end
    subgraph L2[第二层 协议接入层]
        B1[HTTP 服务器]
        B2[JSON RPC 2 0 解析]
        B3[JSON 容错修复]
    end
    subgraph L3[第三层 工具路由层]
        C1[MCPServer 工具注册表]
        C2[category 路由器]
        C3[ToolManager 配置过滤]
    end
    subgraph L4[第四层 执行层]
        D1[13 个工具类]
        D2[多层回退策略]
        D3[工具类组合复用]
    end
    subgraph L5[第五层 编辑器通信层]
        E1[编辑器消息系统]
        E2[场景脚本 scene ts]
        E3[asset db builder 等内置模块]
    end
    subgraph L6[第六层 运行时层]
        F1[cc 引擎运行时]
        F2[场景树节点组件]
    end
    L1 --> L2
    L2 --> L3
    L3 --> L4
    L4 --> L5
    L5 --> L6
```

### 1.2 关键设计原则

| 原则 | 体现 |
|------|------|
| 单一职责分层 | 接入 / 路由 / 执行 / 通信四层分离,每层不越界 |
| 操作码统一 | 所有工具用 category toolName 加 action 参数,降低 AI 调用复杂度 |
| 多层回退兜底 | 每个 Editor Message 调用都有备用方案,失败级联到场景脚本 |
| 验证闭环 | 操作后主动重查返回 verificationData,让 AI 自验证 |
| 配置可持久化 | 双 json 文件保存服务器与工具配置,5 套方案可切换 |
| 协议容错 | JSON 解析失败自动修复,允许 AI 生成不规范 JSON |
| 进程隔离 | 节点组件增删改只能场景进程执行,主进程只发消息 |

---

## 二、进程模型

### 2.1 三进程架构

Cocos Creator 扩展运行在三个独立进程,各自有不同权限与 API:

```mermaid
flowchart LR
    subgraph P1[扩展主进程]
        M1[main ts 入口]
        M2[MCPServer 单例]
        M3[ToolManager]
        M4[methods 对象]
    end
    subgraph P2[场景进程]
        S1[scene ts 脚本]
        S2[require cc 运行时]
        S3[节点组件增删改]
    end
    subgraph P3[面板进程]
        V1[Vue 3 面板]
        V2[默认面板]
        V3[工具管理面板]
    end
    subgraph P4[编辑器内置进程]
        E1[asset db 资源库]
        E2[builder 构建器]
        E3[preferences 偏好]
        E4[server 网络服务]
        E5[reference image 参考图]
    end
    P3 -->|消息机制| P1
    P1 -->|场景消息或场景脚本| P2
    P1 -->|编辑器消息| P4
    P2 --> F1[cc 引擎场景树]
```

### 2.2 各进程职责与边界

| 进程 | 入口 | 能做 | 不能做 |
|------|------|------|------|
| 扩展主进程 | `dist/main.js` | 启动 HTTP 服务器、注册工具、响应编辑器消息、读写配置文件、用 fs os 本地操作 | 直接读写场景树、直接 require cc |
| 场景进程 | `dist/scene.js` | require cc 调运行时 API、节点组件增删改、场景层级查询 | 启动 HTTP 服务器、读写项目配置 |
| 面板进程 | `dist/panels/default` | Vue 3 渲染 UI、用户交互、通过消息调主进程方法 | 直接调场景进程、直接读写文件 |

> **关键边界**:节点与组件的真实增删改只能在场景进程执行。主进程的工具类通过 `Editor.Message.request('scene', ...)` 跨进程调用场景进程的能力。

---

## 三、IPC 通信架构

系统存在两条独立的 IPC 通道,分别服务不同方向:

### 3.1 通道一 面板到主进程

面板进程用 Cocos 扩展**消息机制**调用主进程 `methods` 对象中的方法。方法名在 `package.json` 的 `contributions.messages` 中声明:

```mermaid
flowchart LR
    subgraph Panel[面板进程 Vue]
        U1[用户点击启动按钮]
        U2[用户修改端口]
        U3[用户勾选工具]
    end
    subgraph Call[Editor Message request]
        C1[消息名 start server]
        C2[消息名 update settings]
        C3[消息名 updateToolStatus]
    end
    subgraph Main[主进程 methods 对象]
        M1[startServer 方法]
        M2[updateSettings 方法]
        M3[updateToolStatus 方法]
    end
    U1 --> C1 --> M1
    U2 --> C2 --> M2
    U3 --> C3 --> M3
    M1 --> R1[启动 HTTP 服务器]
    M2 --> R2[保存配置并重建 MCPServer]
    M3 --> R3[更新 ToolManager 并同步 MCPServer]
```

**面板调用的全部消息名**(来自 grep 结果):

| 面板场景 | 消息名 | 主进程方法 |
|------|------|------|
| 启动服务器 | `start-server` | `startServer` |
| 停止服务器 | `stop-server` | `stopServer` |
| 保存设置并重启 | `update-settings` | `updateSettings` |
| 查询状态 | `get-server-status` | `getServerStatus` |
| 获取工具管理状态 | `getToolManagerState` | `getToolManagerState` |
| 切换单个工具 | `updateToolStatus` | `updateToolStatus` |
| 批量切换工具 | `updateToolStatusBatch` | `updateToolStatusBatch` |
| 创建配置 | `createToolConfiguration` | `createToolConfiguration` |
| 更新配置 | `updateToolConfiguration` | `updateToolConfiguration` |
| 删除配置 | `deleteToolConfiguration` | `deleteToolConfiguration` |
| 切换当前配置 | `setCurrentToolConfiguration` | `setCurrentToolConfiguration` |
| 导出配置 | `exportToolConfiguration` | `exportToolConfiguration` |
| 导入配置 | `importToolConfiguration` | `importToolConfiguration` |

### 3.2 通道二 主进程到场景进程

工具类用 `Editor.Message.request('scene', <message>, ...)` 调用编辑器内置场景消息,或用 `execute-scene-script` 调用 `scene.ts` 中导出的方法:

```mermaid
flowchart TD
    subgraph Tool[工具类执行]
        T1[NodeTools 等]
    end
    subgraph Scene[编辑器场景消息]
        S1[create node 创建节点]
        S2[query node 查询节点]
        S3[set property 设置属性]
        S4[create component 加组件]
        S5[remove array element 删组件]
        S6[set parent 改父级]
        S7[query node tree 层级树]
        S8[snapshot 快照]
    end
    subgraph Script[场景脚本 scene ts]
        SC1[createNewScene]
        SC2[addComponentToNode]
        SC3[removeComponentFromNode]
        SC4[getNodeInfo]
        SC5[setNodeProperty]
        SC6[setComponentProperty]
        SC7[getSceneHierarchy]
    end
    subgraph Asset[asset db 消息]
        A1[query assets 查资源]
        A2[query asset info 资源详情]
        A3[create asset 建资源]
        A4[delete asset 删资源]
        A5[query asset dependencies 依赖]
    end
    T1 -->|首选 直接场景 API| Scene
    T1 -->|备用 场景脚本| Script
    T1 -->|资源类| Asset
    Scene --> R[场景进程执行]
    Script --> R
```

> **双层兜底**:工具类首选直接调编辑器场景消息(如 `scene/create-node`),失败时回退到 `scene/execute-scene-script` 调用 `scene.ts` 导出的方法。两条路径都到达场景进程,但接口形态不同。

---

## 四、MCP 协议架构

### 4.1 协议握手与分发

服务器实现 MCP 协议(基于 JSON-RPC 2.0,协议版本 2024-11-05):

```mermaid
flowchart TD
    A[AI 客户端 POST 到 mcp 端点] --> B[handleMCPRequest]
    B --> C{JSON parse 成功}
    C -->|否| D[fixCommonJsonIssues 修复]
    D --> C
    C -->|是| E[handleMessage 分发]
    E --> F{method 字段}
    F -->|initialize| G[返回协议握手]
    F -->|tools list| H[返回 toolsList 清单]
    F -->|tools call| I[executeToolCall 路由]
    G --> J1[protocolVersion 2024 11 05]
    G --> J2[capabilities tools]
    G --> J3[serverInfo 名称版本]
    I --> K[split 下划线取 category]
    K --> L[工具类 execute 方法]
    L --> M[ToolResponse 结果]
    M --> N[content text 包装为 JSON 字符串]
    N --> O[JSON RPC 响应返回]
```

### 4.2 四类 HTTP 端点

| 方法 | 路径 | 分发逻辑 |
|------|------|------|
| POST | `/mcp` | `handleMCPRequest` → JSON-RPC 分发 initialize tools list tools call |
| GET | `/health` | 直接返回 status 与 tools 数量 |
| POST | `/api/{category}/{toolName}` | `handleSimpleAPIRequest` → 拼接后走 `executeToolCall` |
| GET | `/api/tools` | `getSimplifiedToolsList` 返回带 curl 示例的清单 |
| OPTIONS | * | CORS 预检,直接 200 |

> **简化 REST 接口** `/api/...` 是为非 MCP 客户端提供的便利接口,内部复用同一套 `executeToolCall` 路由,与 `/mcp` 走相同执行路径。

### 4.3 JSON 容错架构

AI 生成的 JSON 常见瑕疵与修复策略(`utils/json-utils.ts`):

```mermaid
flowchart LR
    A[原始 JSON 字符串] --> B{parse 成功}
    B -->|是| Z[直接使用]
    B -->|否| C[fixCommonJsonIssues]
    C --> D1[修复未转义反斜杠]
    C --> D2[移除尾逗号]
    C --> D3[单引号转双引号]
    C --> D4[控制字符转义]
    D1 --> E[再次 parse]
    D2 --> E
    D3 --> E
    D4 --> E
    E --> F{成功}
    F -->|是| Z
    F -->|否| G[抛出 Parse error 错误码 32700]
```

---

## 五、工具系统架构

### 5.1 工具注册与路由

工具的注册、过滤、路由三阶段:

```mermaid
flowchart TD
    subgraph Reg[注册阶段 initializeTools]
        R1[new SceneTools] --> R0[tools 对象]
        R2[new NodeTools] --> R0
        R3[new ComponentTools] --> R0
        R4[...共 13 个] --> R0
    end
    subgraph Setup[过滤阶段 setupTools]
        S1{enabledTools 为空}
        S1 -->|是 暴露全部| S2[遍历 13 类取全部工具]
        S1 -->|否 按配置过滤| S3[用 category name 集合过滤]
        S2 --> S4[拼出完整工具名]
        S3 --> S4
        S4 --> S5[toolsList 对外暴露]
    end
    subgraph Route[路由阶段 executeToolCall]
        E1[收到工具名如 scene scene management]
        E2[split 下划线取首段 category]
        E3[剩余段 join 还原 toolMethodName]
        E4[this tools category execute]
        E1 --> E2 --> E3 --> E4
    end
    Reg --> Setup --> Route
```

### 5.2 工具命名与路由机制

```
工具全名 = category + "_" + toolName
示例:   scene + "_" + scene_management  =>  scene_scene_management

路由切分:
  parts = toolName.split("_")
  category = parts[0]                        // "scene"
  toolMethodName = parts.slice(1).join("_")  // "scene_management"

执行:
  this.tools[category].execute(toolMethodName, args)
```

> 因为 `toolName` 自身含下划线(如 `scene_management`),路由时只切第一段作为 category,剩余用 `join('_')` 还原。这是 v1.5.4 命名设计的核心权衡。

### 5.3 工具类组合关系

工具类之间存在组合复用,避免重复实现:

```mermaid
flowchart LR
    NT[NodeTools] -.持有.-> CT[ComponentTools]
    NT -->|createNode 时| CT2[调用 componentTools execute add component]
    CT -->|addComponent 时| ST[SceneTools 查询能力]
    PT[PrefabTools] -->|instantiate 时| NT2[复用 NodeTools 节点创建]
    subgraph Interface[ToolExecutor 接口]
        I1[getTools 返回工具定义]
        I2[execute 执行工具]
    end
    NT -.实现.-> Interface
    CT -.实现.-> Interface
    PT -.实现.-> Interface
```

> `NodeTools` 内部 `private componentTools = new ComponentTools()`,创建节点后调 `componentTools.execute('add_component', ...)` 复用组件添加逻辑,组件添加内部又有多层回退。

### 5.4 工具类内部执行分发

每个工具类的 `execute(toolName, args)` 内部用 `switch(toolName)` 分发到私有方法,每个私有方法再按 `args.action` 二次分发:

```mermaid
flowchart TD
    E[execute toolName args] --> SW{switch toolName}
    SW -->|node query| M1[handleNodeQuery]
    SW -->|node lifecycle| M2[handleNodeLifecycle]
    SW -->|node transform| M3[handleNodeTransform]
    SW -->|node hierarchy| M4[handleNodeHierarchy]
    SW -->|...| M5[其他]
    M1 --> A1{switch action}
    A1 -->|info| I1[getNodeInfo]
    A1 -->|find| I2[findNodes]
    A1 -->|list all| I3[getAllNodes]
    A1 -->|tree| I4[getNodeTree]
    M2 --> A2{switch action}
    A2 -->|create| C1[createNode]
    A2 -->|delete| C2[deleteNode]
```

> 这是两级分发:工具级(toolName)→ 操作级(action)。50 个工具 × 平均 2.4 个 action = 约 120+ 个原子操作。

---

## 六、工具内部多层回退策略

### 6.1 回退架构总览

工具类对每个 Editor Message 调用都设计多层回退,应对 Cocos Creator 不同版本的 API 差异:

```mermaid
flowchart TD
    A[工具方法开始] --> B[方法1 首选 API]
    B --> C{成功}
    C -->|是| Z[返回成功]
    C -->|否| D[方法2 备选 API]
    D --> E{成功}
    E -->|是| Z
    E -->|否| F[方法3 场景脚本]
    F --> G{成功}
    G -->|是| Z
    G -->|否| H[方法4 兜底实现]
    H --> I{成功}
    I -->|是| Z
    I -->|否| J[返回失败 含所有方法错误信息]
```

### 6.2 案例 addComponent 组件添加

`ComponentTools.addComponent` 的双层回退架构:

```mermaid
flowchart TD
    A[addComponent nodeUuid componentType] --> B[先查节点是否已有此组件]
    B --> C{已存在}
    C -->|是| D[返回成功 existing true]
    C -->|否| E[方法1 直接 Editor API]
    E --> F[scene create component]
    F --> G[等待 100ms]
    G --> H[重查节点验证组件是否添加]
    H --> I{验证通过}
    I -->|是| J[返回成功 componentVerified true]
    I -->|否| K[方法2 场景脚本回退]
    K --> L[scene execute scene script]
    L --> M[调 scene ts addComponentToNode]
    M --> N{成功}
    N -->|是| J
    N -->|否| O[返回失败 含双错误信息]
```

### 6.3 案例 removeComponent 组件移除

`ComponentTools.removeComponent` 的四级级联回退(最复杂的回退链):

```mermaid
flowchart TD
    A[removeComponent nodeUuid componentType] --> B[getComponents 查组件索引]
    B --> C[找到 componentIndex]
    C --> D[方法1 remove array element]
    D --> E1{成功}
    E1 -->|否| F[方法2 delete component]
    E1 -->|是| Z
    F --> E2{成功}
    E2 -->|否| G[方法3 remove component 按索引]
    E2 -->|是| Z
    G --> E3{成功}
    E3 -->|否| H[方法4 remove component 按类型]
    E3 -->|是| Z
    H --> E4{成功}
    E4 -->|是| Z
    E4 -->|否| I[再查一次确认是否真未移除]
    I --> J{确实还在}
    J -->|否 误报| Z
    J -->|是 真失败| K[返回失败 含 4 方法错误]
```

> 这种四级回退源于 Cocos Creator 不同版本(3.8.6 / 3.9 / 4.x)的 API 差异,同一操作有多种等价 API,逐一尝试以最大化兼容性。

### 6.4 案例 createNode 节点创建

`NodeTools.createNode` 展示了资源路径解析与验证闭环:

```mermaid
flowchart TD
    A[createNode args] --> B{有 parentUuid}
    B -->|否| C[query node tree 取场景根 UUID]
    B -->|是| D[用传入的 parentUuid]
    C --> E{有 assetPath 无 assetUuid}
    D --> E
    E -->|是| F[asset db query asset info 解析路径为 UUID]
    E -->|否| G[直接用 assetUuid]
    F --> H[拼 createNodeOptions]
    G --> H
    H --> I[scene create node]
    I --> J[拿到新节点 UUID]
    J --> K{有 siblingIndex}
    K -->|是| L[scene set parent 调整顺序]
    K -->|否| M{有 components}
    L --> M
    M -->|是| N[循环调 componentTools add component]
    M -->|否| O{有 initialTransform}
    N --> O
    O -->|是| P[setNodeTransform 设初始变换]
    O -->|否| Q[getNodeInfo 取验证数据]
    P --> Q
    Q --> R[返回 verificationData 给 AI]
```

> 注意每步之间的 `await new Promise(r => setTimeout(r, 100))` 等待,这是给 Editor 完成异步操作的缓冲时间,体现跨进程消息的时序约束。

---

## 七、配置管理与持久化架构

### 7.1 双文件持久化

```mermaid
flowchart LR
    subgraph File1[mcp server json]
        F1[port 端口]
        F2[autoStart 自动启动]
        F3[enableDebugLog 调试日志]
        F4[allowedOrigins 跨域]
        F5[maxConnections 最大连接]
    end
    subgraph File2[tool manager json]
        T1[configurations 配置数组]
        T2[currentConfigId 当前配置]
        T3[maxConfigSlots 5 最大槽位]
        T1 --> T4[ToolConfiguration 最多 5 套]
        T4 --> T5[tools 数组 每个含 category name enabled]
    end
    subgraph Path[路径]
        P1[项目根 settings 目录]
    end
    File1 --> Path
    File2 --> Path
```

### 7.2 配置切换实时生效架构

工具配置的修改会实时同步到运行中的 MCPServer:

```mermaid
flowchart TD
    A[面板用户勾选工具] --> B[updateToolStatus 消息到主进程]
    B --> C[ToolManager updateToolStatus 写 json]
    C --> D[mcpServer updateEnabledTools]
    D --> E[setupTools 重新过滤 toolsList]
    E --> F[下一次 tools list 返回新清单]
    G[面板用户切换配置] --> H[setCurrentToolConfiguration]
    H --> I[ToolManager 切换 currentConfigId]
    I --> J[mcpServer updateEnabledTools]
    J --> E
```

### 7.3 工具配置方案生命周期

```mermaid
flowchart LR
    A[启动时无配置] --> B[自动创建默认配置]
    B --> C[所有工具默认启用]
    D[createConfiguration] --> E[新增配置槽位 上限 5]
    F[exportConfiguration] --> G[导出 JSON 字符串]
    H[importConfiguration] --> I[生成新 ID 导入]
    I --> J[超过 5 套抛错]
    K[deleteConfiguration] --> L[删除配置]
    L --> M{删的是当前配置}
    M -->|是| N[回退到第一个配置]
    M -->|否| O[保持当前不变]
```

### 7.4 工具清单的两种来源

`ToolManager.initializeAvailableTools()` 有真实与后备两种来源:

```mermaid
flowchart TD
    A[ToolManager 构造] --> B[initializeAvailableTools]
    B --> C{实例化 13 工具类}
    C -->|成功| D[从 getTools 取真实清单]
    C -->|失败| E[initializeDefaultTools 后备]
    D --> F[availableTools 含真实工具定义]
    E --> G[availableTools 含硬编码工具名]
    F --> H[createConfiguration 创建默认配置]
    G --> H
```

> 后备方案是硬编码的工具名清单(如 getCurrentSceneInfo / saveScene 等),仅当 13 个工具类实例化失败时启用,确保管理器面板不空。

---

## 八、生命周期时序架构

### 8.1 扩展启动流程

```mermaid
flowchart TD
    A[编辑器加载扩展] --> B[load 函数]
    B --> C[new ToolManager]
    C --> D[读 tool manager json]
    D --> E[initializeAvailableTools 实例化 13 类]
    E --> F[无配置则创建默认配置]
    F --> G[readSettings 读 mcp server json]
    G --> H[new MCPServer settings]
    H --> I[initializeTools 实例化 13 类挂到 tools]
    I --> J[updateEnabledTools 注入启用清单]
    J --> K[setupTools 过滤生成 toolsList]
    K --> L{autoStart 为真}
    L -->|是| M[mcpServer start]
    M --> N[http createServer]
    N --> O[listen 127 0 0 1 端口]
    O --> P[HTTP 服务器就绪]
    L -->|否| Q[等待用户手动启动]
```

### 8.2 服务器启动时序

```mermaid
flowchart LR
    A[start 调用] --> B{httpServer 已存在}
    B -->|是| C[直接返回 防止重复启动]
    B -->|否| D[http createServer]
    D --> E[绑定 handleHttpRequest]
    E --> F[listen 127 0 0 1 port]
    F --> G{监听成功}
    G -->|是| H[打印端点日志]
    G -->|否 EADDRINUSE| I[报错端口被占]
    H --> J[setupTools 生成 toolsList]
    J --> K[打印就绪日志]
```

### 8.3 设置更新流程

```mermaid
flowchart TD
    A[面板保存设置] --> B[updateSettings 消息]
    B --> C[saveSettings 写 json]
    C --> D{mcpServer 已存在}
    D -->|是| E[stop 停止旧服务器]
    E --> F[new MCPServer settings 重建]
    F --> G[start 启动新服务器]
    D -->|否| H[new MCPServer settings]
    H --> G
```

> 设置更新会**销毁旧 MCPServer 实例并重建**,而非修改字段。因为 HTTP 服务器无法动态换端口,只能重建。

### 8.4 卸载流程

```mermaid
flowchart LR
    A[unload 函数] --> B{mcpServer 存在}
    B -->|是| C[mcpServer stop]
    C --> D[httpServer close]
    D --> E[httpServer 置 null]
    E --> F[mcpServer 置 null]
    B -->|否| G[无操作]
```

---

## 九、错误处理与容错架构

### 9.1 三层容错体系

```mermaid
flowchart TD
    A[AI 请求] --> B[协议层容错]
    B --> C[JSON parse 失败]
    C --> D[fixCommonJsonIssues 修复]
    D --> E[修复后仍失败 返回 32700 错误]
    A --> F[路由层容错]
    F --> G[category 不存在]
    G --> H[返回 32603 错误]
    A --> I[执行层容错]
    I --> J[Editor Message 失败]
    J --> K[多层回退策略]
    K --> L[全部失败返回 ToolResponse success false]
    L --> M[错误信息含所有方法错误]
```

### 9.2 错误码体系

| 错误码 | 含义 | 触发场景 |
|------|------|------|
| -32700 | Parse error | JSON 解析失败且修复无效 |
| -32603 | 内部错误 | 工具执行异常或路由失败 |
| 200 | 成功 | HTTP 健康检查 |
| 400 | 请求错误 | API 路径无效或 JSON 不可修复 |
| 404 | 未找到 | 未知路径 |
| 500 | 服务器错误 | 未捕获异常 |

### 9.3 工具级错误封装

工具方法用 try-catch 包裹每个 Editor Message 调用,失败不抛异常,而是返回结构化错误:

```mermaid
flowchart LR
    A[工具方法] --> B[try Editor Message]
    B --> C{成功}
    C -->|是| D[返回 ToolResponse success true]
    C -->|否 抛异常| E[catch 捕获]
    E --> F[返回 ToolResponse success false]
    F --> G[error 字段含异常 message]
    F --> H[部分成功含 errors 数组]
```

> 设计哲学:**错误不抛出,而是返回**。AI 客户端拿到结构化的 `success: false` 可自主决定重试或换工具,不会因异常中断整个会话。

---

## 十、ToolResponse 闭环设计架构

### 10.1 响应字段设计

```mermaid
flowchart LR
    A[ToolResponse] --> B[success 必填 成败]
    A --> C[data 成功数据]
    A --> D[message 人类可读信息]
    A --> E[error 失败原因]
    A --> F[instruction 给 AI 的下一步建议]
    A --> G[warning 非阻断警告]
    A --> H[verificationData 自验证数据]
    A --> I[updatedProperties 本次改了哪些属性]
```

### 10.2 AI 调用闭环

```mermaid
flowchart LR
    A[AI 调用工具] --> B[MCPServer 执行]
    B --> C[ToolResponse 返回]
    C --> D[data 结果数据]
    C --> E[instruction 下一步建议]
    C --> F[verificationData 自验证数据]
    D --> G[AI 解析结果]
    E --> H[AI 决定下一步]
    F --> I[AI 自验证操作生效]
    G --> J[AI 调用下一个工具]
    H --> J
    I --> J
```

> 这是 v1.5.4 降低 50% Token 消耗的关键:单次调用返回「结果 + 建议 + 验证」三件套,AI 不必再来回查询确认,显著减少往返轮次。

---

## 十一、面板与主进程交互架构

### 11.1 面板 Vue 架构

```mermaid
flowchart TD
    A[Editor Panel define] --> B[template HTML 模板]
    A --> C[style CSS 样式]
    A --> D[ready 生命周期]
    D --> E[createApp Vue 3]
    E --> F[defineComponent McpServerApp]
    F --> G[setup Composition API]
    G --> H[响应式状态]
    G --> I[计算属性]
    G --> J[watch 监听]
    G --> K[方法调用 Editor Message]
    K --> L[Editor Message request cocos mcp server]
```

### 11.2 面板功能架构

```mermaid
flowchart TD
    A[默认面板] --> B[服务器标签页]
    A --> C[工具管理标签页]
    B --> B1[状态显示 运行停止 端口连接数]
    B --> B2[启动停止按钮]
    B --> B3[设置表单 端口 自动启动 调试日志]
    B --> B4[保存设置]
    C --> C1[配置选择器]
    C --> C2[工具列表 按分类分组]
    C --> C3[启用禁用勾选]
    C --> C4[配置 CRUD]
    C --> C5[导入导出]
    C1 --> D[Editor Message getToolManagerState]
    C3 --> E[Editor Message updateToolStatus]
    C4 --> F[Editor Message create update delete Configuration]
    C5 --> G[Editor Message export import Configuration]
```

### 11.3 面板内置 i18n

面板组件内部自带中英双语字典(与外层 `i18n/zh.js` 不同):

```mermaid
flowchart LR
    A[面板 setup] --> B[translations 对象]
    B --> C[zh 中文键值]
    B --> D[en 英文键值]
    C --> E[品牌区 语言 标签页]
    C --> F[服务器状态 操作按钮]
    C --> G[工具管理 配置操作]
    E --> H[t 函数按当前语言取值]
    D --> H
```

---

## 十二、类型系统架构

### 12.1 核心接口关系

```mermaid
flowchart TD
    A[MCPServerSettings] --> A1[port autoStart enableDebugLog allowedOrigins maxConnections]
    B[ToolDefinition] --> B1[name description inputSchema]
    C[ToolResponse] --> C1[success data message error instruction warning verificationData updatedProperties]
    D[ToolExecutor 接口] --> D1[getTools 返回 ToolDefinition 数组]
    D --> D2[execute 执行返回 ToolResponse]
    E[ToolConfig] --> E1[category name enabled description]
    F[ToolConfiguration] --> F1[id name description tools 时间戳]
    G[ToolManagerSettings] --> G1[configurations currentConfigId maxConfigSlots]
    H[ToolManagerState] --> H1[availableTools currentConfiguration configurations maxConfigSlots]
    D -.实现.-> I[13 个工具类]
    D -.实现.-> J[NodeTools 等]
```

### 12.2 类型分层

| 层级 | 类型 | 作用 |
|------|------|------|
| 配置层 | MCPServerSettings ServerStatus | 服务器配置与状态 |
| 协议层 | ToolDefinition ToolResponse | MCP 工具定义与响应 |
| 执行层 | ToolExecutor 接口 | 工具类契约 |
| 数据层 | NodeInfo ComponentInfo SceneInfo PrefabInfo AssetInfo ProjectInfo | 业务实体 |
| 管理层 | ToolConfig ToolConfiguration ToolManagerSettings ToolManagerState | 配置管理 |
| 调试层 | ConsoleMessage PerformanceStats ValidationIssue ValidationResult | 调试验证 |

---

## 十三、架构设计原则总结

### 13.1 七大架构原则

```mermaid
mindmap
  root((架构原则))
    分层隔离
      协议接入层
      工具路由层
      执行层
      编辑器通信层
    操作码统一
      category toolName 命名
      action 子操作
      降低 AI 调用复杂度
    多层回退
      直接 Editor API
      场景脚本备用
      多种等价 API 级联
    验证闭环
      操作后重查
      verificationData
      instruction 建议
    配置可持久化
      双 json 文件
      5 套方案
      实时同步
    协议容错
      JSON 自动修复
      错误不抛出
      结构化返回
    进程隔离
      场景操作只能在场景进程
      主进程只发消息
```

### 13.2 架构权衡分析

| 设计选择 | 权衡 | 取舍 |
|------|------|------|
| HTTP 而非 stdio | 牺牲 PRO 版的 Streamable HTTP 省 Token | 换取跨平台兼容与浏览器可调 |
| 操作码统一 | 工具数从 150 降到 50 | 换取 AI 调用成功率与 Token 节省 |
| 多层回退 | 代码冗长 try-catch 嵌套 | 换取多版本 Cocos 兼容性 |
| 错误返回不抛出 | 失败不阻断会话 | 换取 AI 自主决策能力 |
| 重建而非改字段 | 设置更新销毁 MCPServer | 换取 HTTP 端口切换的简单实现 |
| 后备硬编码清单 | 增加维护成本 | 换取工具类实例化失败时面板不空 |

---

## 十四、类比理解

把这套架构类比成一个「智能翻译服务公司」:

```mermaid
flowchart TD
    A[外国客户 AI] --> B[前台 MCPServer]
    B --> C[接电话 HTTP 服务器]
    C --> D[翻译器 fixCommonJsonIssues 校音]
    D --> E[分单员 路由器]
    E --> F[查服务目录 enabledTools]
    E --> G[分发到 13 个业务部门]
    G --> H1[场景部]
    G --> H2[节点部]
    G --> H3[组件部]
    G --> H4[其他 10 个部]
    H3 --> I[施工有多种工具 4 种方法级联]
    I --> J[现场施工队 scene ts]
    J --> K[cc 引擎施工]
    K --> L[返回施工报告 ToolResponse]
    L --> M[含结果 建议 验证数据 三件套]
    M --> A
```

- **前台 MCPServer**:接电话(HTTP)、查手册(`tools/list`)、分订单(路由)
- **13 个业务部门**:每个有自己的工种(`action`),部门间可借人(组合复用)
- **`category_toolName`**:部门代号 + 工种名,前台按第一段(部门)分拣
- **`enabledTools`**:服务目录,ToolManager 是目录管理员,实时增删条目并通知前台
- **`scene.ts`**:现场施工队,前台/部门不能直接动场景,必须派单到施工队
- **多层回退**:施工有 4 种工具,一种坏了换下一种,全坏才报失败
- **`ToolResponse.instruction`**:施工完顺便给客户一张「下一步建议单」
- **`fixCommonJsonIssues`**:客户口音重,前台有翻译器校音后再处理
- **重建而非改字段**:换办公室(端口)只能搬家,不能原地改门牌

---

## 十五、参考引用

### 15.1 源码文件索引

| 架构维度 | 源码位置 |
|------|------|
| 扩展主进程入口 | `cocos-mcp-server/source/main.ts` |
| MCP 协议与 HTTP 服务器 | `cocos-mcp-server/source/mcp-server.ts`（initializeTools 第 44-65 行，setupTools 第 101-136 行，executeToolCall 第 138-148 行，handleMessage 第 244-291 行） |
| 场景脚本 | `cocos-mcp-server/source/scene.ts` |
| 设置持久化 | `cocos-mcp-server/source/settings.ts` |
| 工具配置管理 | `cocos-mcp-server/source/tools/tool-manager.ts`（initializeAvailableTools 第 81-136 行，后备清单第 138-229 行） |
| 类型契约 | `cocos-mcp-server/source/types/index.ts` |
| JSON 容错 | `cocos-mcp-server/source/utils/json-utils.ts` |
| 组件多层回退 | `cocos-mcp-server/source/tools/component-tools.ts`（addComponent 第 315-399 行，removeComponent 第 401-475 行） |
| 节点创建验证闭环 | `cocos-mcp-server/source/tools/node-tools.ts`（createNode 第 535-713 行） |
| 13 个工具类 | `cocos-mcp-server/source/tools/*.ts` |
| 面板 Vue 架构 | `cocos-mcp-server/source/panels/default/index.ts` |
| 扩展清单 | `cocos-mcp-server/package.json`（contributions.messages 与 contributions.scene.script） |

### 15.2 关键源码行号速查

| 架构机制 | 文件 | 行号 |
|------|------|------|
| 工具注册 13 类实例化 | `mcp-server.ts` | 44-65 |
| enabledTools 过滤 | `mcp-server.ts` | 101-136 |
| category 路由切分 | `mcp-server.ts` | 138-148 |
| MCP 协议握手 initialize | `mcp-server.ts` | 259-271 |
| JSON-RPC 分发 | `mcp-server.ts` | 244-291 |
| 简化 REST 接口 | `mcp-server.ts` | 308-370 |
| addComponent 双层回退 | `component-tools.ts` | 315-399 |
| removeComponent 四级级联 | `component-tools.ts` | 401-475 |
| createNode 资源解析与验证 | `node-tools.ts` | 535-713 |
| 自动创建默认配置 | `tool-manager.ts` | 14-19 |
| 后备硬编码清单 | `tool-manager.ts` | 138-229 |
| 扩展 load 生命周期 | `main.ts` | 203-223 |
| 设置更新重建 MCPServer | `main.ts` | 66-76 |

### 15.3 外部参考

- MCP 协议规范（协议版本 2024-11-05）：https://modelcontextprotocol.io/
- JSON-RPC 2.0 规范：https://www.jsonrpc.org/specification
- Cocos Creator 扩展开发文档：https://docs.cocos.com/creator/manual/zh/editor/extension/
- Cocos Creator 编辑器消息系统：https://docs.cocos.com/creator/manual/zh/editor/extension/messages.html
- 主仓库 CLAUDE.md：`CLAUDE.md`（submodule 来源、acp.sh 工作流、版本不匹配提示）
- 同目录工具清单文档：`Docs/cocos-mcp-server源码分析.md`（50 个工具与 120+ action 操作码完整清单）
