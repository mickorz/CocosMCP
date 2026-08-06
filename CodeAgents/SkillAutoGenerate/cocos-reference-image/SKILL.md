---
name: cocos-reference-image
description: Cocos Creator 参考图片技能 - 添加/移除/切换参考图，查询配置与当前图，调整位置/缩放/透明度，刷新显示。配合 cocos-mcp 的 referenceImage 类工具使用。
---

# Cocos 参考图片 (cocos-reference-image)

指导 AI 如何通过 cocos-mcp 在场景视图叠加参考图片(用于照着原图摆放节点)：添加/移除/切换参考图、查询配置、调整位置/缩放/透明度、刷新显示。

## 何时使用

- 要把外部图片作为参考叠加到场景视图
- 要切换当前激活的参考图、移除某些图或全部清空
- 要查看参考图配置、当前激活图、已添加的全部图
- 要调整参考图位置、缩放、透明度
- 参考图显示异常时要强制刷新

## 可用工具

端点：`POST http://127.0.0.1:3001/api/referenceImage/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| reference_image_management | add / remove / switch / clear_all | 添加(需 paths)、移除(需 removePaths)、切换(需 path)、清空 |
| reference_image_query | get_config / get_current / list_all | 查配置、当前图、全部图 |
| reference_image_transform | set_position / set_scale / set_opacity / set_data | 调位置/缩放/透明度/任意属性 |
| reference_image_display | refresh | 强制刷新显示 |

## 典型工作流

1. 添加参考图：reference_image_management action=add 传 paths(图片路径数组)。
2. 切换激活：action=switch 传 path。
3. 调整：reference_image_transform action=set_position 传 x,y；set_scale 传 sx,sy；set_opacity 传 opacity。
4. 查看状态：reference_image_query action=get_current 或 list_all。
5. 显示异常：reference_image_display action=refresh。
6. 清理：action=remove 传 removePaths，或 clear_all。

## curl 示例

添加参考图：
```bash
curl -X POST http://127.0.0.1:3001/api/referenceImage/reference_image_management \
  -H "Content-Type: application/json" \
  -d '{"action":"add","paths":["E:/refs/ui_layout.png"]}'
```

调整参考图位置：
```bash
curl -X POST http://127.0.0.1:3001/api/referenceImage/reference_image_transform \
  -H "Content-Type: application/json" \
  -d '{"action":"set_position","x":100,"y":50}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 端点 category 是 camelCase 的 referenceImage。
- paths 用图片的绝对路径或项目内可识别路径。
- 相关技能：场景视图见 cocos-sceneview，节点摆放见 cocos-node。
