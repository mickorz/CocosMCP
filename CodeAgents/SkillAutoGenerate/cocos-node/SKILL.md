---
name: cocos-node
description: Cocos Creator 节点操作技能 - 查询/创建/删除节点，变换与层级操作，属性与数组管理，挂载脚本。配合 cocos-mcp 的 node 类工具使用。
---

# Cocos 节点操作 (cocos-node)

指导 AI 如何通过 cocos-mcp 操控场景中的节点：查找节点、创建/删除、修改位置/旋转/缩放等变换、调整父子层级、复制粘贴、重置属性、管理数组属性、挂载自定义脚本。

## 何时使用

- 要按名称或模式查找场景中的节点、获取节点详情或整棵节点树
- 要新建节点(空节点/2D/3D)、删除节点
- 要改节点的位置/旋转/缩放/可见性等属性
- 要调整节点层级(改父节点、复制节点)、剪贴板复制粘贴
- 要重置节点属性/变换/组件到默认
- 要管理组件上的数组属性(移动/删除元素)
- 要给节点挂载或移除自定义脚本组件

## 可用工具

端点：`POST http://127.0.0.1:3001/api/node/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| node_query | info / find / find_by_name / list_all / detect_type / tree | 查节点详情、按名查找、列全部、判 2D/3D、取层级树 |
| node_lifecycle | create / delete | 创建节点(name 必填，可选 parentUuid/components)、删除(需 uuid) |
| node_transform | (设 position/rotation/scale/active 等) | 修改节点变换与基本属性 |
| node_hierarchy | move / duplicate | 改父节点、复制节点 |
| node_clipboard | copy / paste / cut | 复制/粘贴/剪切节点 |
| node_property_management | reset_property / reset_transform / reset_component | 重置属性/变换/组件 |
| node_array_management | move_element / remove_element | 数组属性元素移动/删除 |
| node_script_management | attach / remove | 挂载/移除自定义脚本 |

## 典型工作流

1. 先定位节点：node_query action=find 传 pattern 模糊查找，或 find_by_name 精确匹配，拿到 uuid。
2. 不确定结构时用 action=tree 看层级，或 list_all 看全部。
3. 创建节点：node_lifecycle action=create 传 name 与可选 parentUuid；如需挂组件可一并传 components。
4. 改变换：node_transform 传 uuid + position/rotation/scale。
5. 调层级：node_hierarchy action=move 传 uuid + parentUuid；或 duplicate 复制。
6. 挂脚本：node_script_management action=attach 传 nodeUuid + scriptPath。
7. 改完可用 cocos-scene 的 scene_management action=save 保存。

## curl 示例

查找名字含 Player 的节点：
```bash
curl -X POST http://127.0.0.1:3001/api/node/node_query \
  -H "Content-Type: application/json" \
  -d '{"action":"find","pattern":"Player"}'
```

创建节点：
```bash
curl -X POST http://127.0.0.1:3001/api/node/node_lifecycle \
  -H "Content-Type: application/json" \
  -d '{"action":"create","name":"Enemy","parentUuid":"<父节点uuid>"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 删除/移动等写操作需要准确的 uuid，先用 node_query 取。
- 改动后记得用 cocos-scene 保存场景。
- 相关技能：组件操作见 cocos-component，场景管理见 cocos-scene。
