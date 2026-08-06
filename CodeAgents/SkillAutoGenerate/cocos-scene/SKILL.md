---
name: cocos-scene
description: Cocos Creator 场景管理技能 - 查询/打开/创建/保存场景，读取场景层级与状态，执行组件方法。配合 cocos-mcp 的 scene 类工具使用。
---

# Cocos 场景管理 (cocos-scene)

指导 AI 如何通过 cocos-mcp 操控 Cocos Creator 的场景：查询当前场景、打开/新建/保存场景、读取场景层级结构、管理场景状态(快照/撤销)、执行组件方法或场景脚本。

## 何时使用

- 需要了解当前打开的是哪个场景、项目里有哪些场景
- 要切换到指定场景、新建场景、保存或另存场景
- 要读取场景的完整节点层级结构(用于后续节点/组件操作前的勘察)
- 需要调用场景里某个组件的方法、或运行场景脚本
- 需要创建场景快照、撤销、软重载

## 可用工具

调用端点统一为 Simple API：`POST http://127.0.0.1:3001/api/scene/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| scene_management | get_current / get_list / open / save / create / save_as / close | 场景的查询、切换、新建、保存、关闭 |
| scene_hierarchy | (无 action，可选 uuid) | 获取场景完整节点层级 |
| scene_execution_control | execute_component_method / execute_scene_script / restore_prefab | 执行组件方法、场景脚本、同步预制体 |
| scene_state_management | create_snapshot / abort_snapshot / begin_undo / end_undo / cancel_undo / soft_reload | 场景快照与撤销录制 |
| scene_query_system | check_ready / check_dirty / list_classes / list_components / check_script / find_nodes_by_asset | 场景就绪/脏检查、列出类与组件、按资源找节点 |

## 典型工作流

1. 开工先勘察：scene_management action=get_current 确认当前场景；不确定项目有哪些场景时用 action=get_list。
2. 需要操作某场景前先切换：action=open 传 scenePath（如 db://assets/scenes/main.scene）。
3. 读取结构：用 scene_hierarchy 拿到节点树，确定要操作的节点 uuid，再交给 cocos-node 技能。
4. 改动后保存：action=save。批量改动前可 create_snapshot 做快照便于回退。
5. 要调用组件逻辑：scene_execution_control action=execute_component_method。

## curl 示例

获取当前场景：
```bash
curl -X POST http://127.0.0.1:3001/api/scene/scene_management \
  -H "Content-Type: application/json" \
  -d '{"action":"get_current"}'
```

打开指定场景：
```bash
curl -X POST http://127.0.0.1:3001/api/scene/scene_management \
  -H "Content-Type: application/json" \
  -d '{"action":"open","scenePath":"db://assets/scenes/main.scene"}'
```

获取场景层级：
```bash
curl -X POST http://127.0.0.1:3001/api/scene/scene_hierarchy \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 注意事项

- 端口以 Cocos MCP 面板显示为准，默认 3001，可在项目 settings/mcp-server.json 修改。
- scenePath 推荐 db:// 协议格式（db://assets/scenes/xxx.scene）。
- 场景切换后建议稍等加载再读取层级。
- execute_component_method 需要准确的节点 uuid 与组件方法名，先用 scene_hierarchy 或 cocos-node 的 node_query 取 uuid。
- 相关技能：节点操作见 cocos-node，预制体见 cocos-prefab。
