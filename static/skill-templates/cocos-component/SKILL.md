---
name: cocos-component
description: Cocos Creator 组件操作技能 - 增删引擎组件、查询组件、设置组件属性、配置点击事件。配合 cocos-mcp 的 component 类工具使用。
---

# Cocos 组件操作 (cocos-component)

指导 AI 如何通过 cocos-mcp 给节点添加/移除引擎组件(如 Sprite/Label/Button)、查询节点上的组件、设置组件属性、配置按钮点击事件。

## 何时使用

- 要给节点添加引擎组件(cc.Sprite、cc.Button 等)或移除组件
- 要查看节点上挂了哪些组件、某组件的详情、引擎有哪些可用组件类型
- 要设置组件的属性值(如 Label 的 string、Sprite 的 spriteFrame)
- 要给 Button 等配置点击事件(onClick)

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/component/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| component_manage | add / remove | 添加引擎组件(需 componentType)/移除组件(需组件 CID) |
| component_query | list / info / available_types | 列节点组件、查组件详情、列可用组件类型 |
| set_component_property | (设属性) | 设置单个或多个组件属性值 |
| configure_click_event | add / modify / remove / clear | 配置按钮点击事件 |

## 典型工作流

1. 先确认目标节点 uuid(用 cocos-node 的 node_query)。
2. 查看现有组件：component_query action=list 传 uuid，了解已挂组件与各自的 CID/type。
3. 添加组件：component_manage action=add 传 uuid + componentType(如 cc.Sprite)。
4. 设置属性：set_component_property 传 uuid + 组件 type/CID + 属性键值(如 {string:"hello"})。
5. 配置按钮点击：先 add 一个 cc.Button，再用 configure_click_event action=add 绑定事件。
6. 移除组件：先 component_query 取到组件的 CID(type 字段)，再 component_manage action=remove 传 CID。

## curl 示例

列出节点上的组件：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/component/component_query \
  -H "Content-Type: application/json" \
  -d '{"action":"list","uuid":"<节点uuid>"}'
```

给节点添加 Sprite 组件：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/component/component_manage \
  -H "Content-Type: application/json" \
  -d '{"action":"add","uuid":"<节点uuid>","componentType":"cc.Sprite"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 移除组件必须用组件的 CID(component_query 返回的 type 字段)，不能用类名。
- 设置属性前先 component_query 确认属性键名与组件标识。
- 相关技能：节点操作见 cocos-node，自定义脚本挂载见 cocos-node 的 node_script_management。
