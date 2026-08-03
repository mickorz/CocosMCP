---
name: cocos-prefab
description: Cocos Creator 预制体技能 - 浏览/创建/删除预制体，实例化/解除/应用/还原，进入编辑与测试。配合 cocos-mcp 的 prefab 类工具使用。
---

# Cocos 预制体操作 (cocos-prefab)

指导 AI 如何通过 cocos-mcp 管理预制体：浏览预制体列表、从场景节点创建预制体、实例化预制体到场景、解除链接/应用更改/还原、进入预制体编辑模式。

## 何时使用

- 要查看项目里有哪些预制体、某预制体的详情或完整性校验
- 要把场景里的节点保存成可复用的预制体
- 要把预制体实例化到场景某父节点下
- 要把实例的改动回写到预制体(apply)、或还原实例(revert)、或解除链接变独立(unlink)
- 要进入预制体独立编辑、保存、退出、或建测试实例

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/prefab/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| prefab_browse | list / info / validate | 列预制体、查详情、校验完整性 |
| prefab_lifecycle | create / delete | 从节点创建预制体(需 nodeUuid+prefabName+savePath)、删除预制体(不可逆) |
| prefab_instance | instantiate / unlink / apply / revert | 实例化、解除链接、应用改动、还原 |
| prefab_edit | enter / save / exit / test | 进入编辑、保存、退出、建测试实例 |

## 典型工作流

1. 查预制体：prefab_browse action=list 看项目预制体，action=info 看详情。
2. 创建预制体：先搭好节点(cocos-node/component)，再 prefab_lifecycle action=create 传 nodeUuid + prefabName + savePath(如 db://assets/prefabs/xxx.prefab)。
3. 使用预制体：prefab_instance action=instantiate 传 prefabPath + parentUuid，放到场景里。
4. 改了实例想同步回原预制体：action=apply 传实例 nodeUuid。
5. 想单独改预制体：prefab_edit action=enter 进入编辑，改完 save，再 exit(记得先保存)。

## curl 示例

列出预制体：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/prefab/prefab_browse \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
```

实例化预制体到场景：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/prefab/prefab_instance \
  -H "Content-Type: application/json" \
  -d '{"action":"instantiate","prefabPath":"db://assets/prefabs/enemy.prefab","parentUuid":"<父节点uuid>"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- prefabPath 用 db:// 协议格式。
- delete 不可逆，谨慎使用。
- exit 前记得 save，否则编辑丢失。
- 相关技能：节点见 cocos-node，组件见 cocos-component，场景见 cocos-scene。
