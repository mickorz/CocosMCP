---
name: cocos-sceneview
description: Cocos Creator 场景视图技能 - 控制 Gizmo 工具/轴心/坐标系、2D/3D 与网格、相机模式、状态查询与重置。配合 cocos-mcp 的 sceneView 类工具使用。
---

# Cocos 场景视图控制 (cocos-sceneview)

指导 AI 如何通过 cocos-mcp 操控场景编辑视图：切换 Gizmo 工具(移动/旋转/缩放/矩形)、轴心、坐标系、2D/3D 与网格、3D 相机模式与尺寸、视图状态查询与重置。

## 何时使用

- 要切换 Gizmo 工具(移动/旋转/缩放/矩形选框)、查当前工具
- 要改轴心(pivot/center)、坐标系(local/global)
- 要切 2D/3D 视图、开关网格
- 要调 3D 相机模式与视图尺寸
- 要查询视图状态、或重置视图

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/sceneView/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| scene_view_gizmo_management | change_tool / query_tool / change_pivot / query_pivot / change_coordinate / query_coordinate / query_view_mode | 切/查 Gizmo 工具、轴心、坐标系、视图模式 |
| scene_view_mode_control | change_2d_3d / query_2d_3d / set_grid / query_grid | 切/查 2D/3D、网格 |
| scene_view_icon_gizmo | (设图标 gizmo) | 控制图标 gizmo 显示 |
| scene_view_camera_control | set_3d_mode / query_3d_mode / set_size / query_size | 3D 相机模式与视图尺寸 |
| scene_view_status_management | get_status / reset_view | 查状态、重置视图 |

## 典型工作流

1. 切工具：scene_view_gizmo_management action=change_tool 传 tool(position/rotation/scale/rect)。
2. 切坐标系：action=change_coordinate 传 coordinate(local/global)。
3. 切 2D/3D：scene_view_mode_control action=change_2d_3d。
4. 查状态：scene_view_status_management action=get_status。
5. 重置：action=reset_view。

## curl 示例

切换到移动工具：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/sceneView/scene_view_gizmo_management \
  -H "Content-Type: application/json" \
  -d '{"action":"change_tool","tool":"position"}'
```

切换 2D/3D 视图：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/sceneView/scene_view_mode_control \
  -H "Content-Type: application/json" \
  -d '{"action":"change_2d_3d"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 端点 category 是 camelCase 的 sceneView，不是 scene_view。
- 相关技能：节点变换见 cocos-node，场景管理见 cocos-scene。
