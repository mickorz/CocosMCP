---
name: cocos-project
description: Cocos Creator 项目控制技能 - 运行预览/构建、查询项目信息与设置、构建系统状态。配合 cocos-mcp 的 project 类工具使用。
---

# Cocos 项目控制 (cocos-project)

指导 AI 如何通过 cocos-mcp 运行/预览项目、准备构建、查询项目信息与各类配置、查看构建系统状态。

## 何时使用

- 要在浏览器预览游戏(run)、或准备构建到某平台(build)
- 要获取项目名称/路径/uuid/Cocos 版本等元信息
- 要查看项目的 general/physics/render/assets 配置
- 要打开构建面板、检查 builder 是否就绪

## 可用工具

端点：`POST http://127.0.0.1:3001/api/project/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| project_manage | run / build / get_info / get_settings | 运行预览、构建、项目信息、按类查配置 |
| project_build_system | get_build_settings / open_build_panel / check_builder_status | 构建设置、打开构建面板、查 builder 状态 |

## 典型工作流

1. 先了解项目：project_manage action=get_info 拿项目名称、路径、Cocos 版本。
2. 浏览器预览：action=run 传 platform=browser；若配合外部调试浏览器(如 chrome-devtools-mcp)，传 openBrowser=false 只返回 localhost 地址，避免双窗口。
3. 预览指定场景：run 时传 scene(如 db://assets/scenes/main.scene 或 scenes/main)。
4. 准备构建：action=build 传 buildPlatform(如 web-mobile) 与 debug；实际构建在构建面板手动启动(build 受 API 限制)。
5. 查配置：action=get_settings 传 category(general/physics/render/assets)。

## curl 示例

获取项目信息：
```bash
curl -X POST http://127.0.0.1:3001/api/project/project_manage \
  -H "Content-Type: application/json" \
  -d '{"action":"get_info"}'
```

浏览器预览(不弹系统浏览器，供专用调试浏览器使用)：
```bash
curl -X POST http://127.0.0.1:3001/api/project/project_manage \
  -H "Content-Type: application/json" \
  -d '{"action":"run","platform":"browser","openBrowser":false}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- run 推荐用 browser 平台；openBrowser=false 时返回 localhost 地址，配合专用调试浏览器使用。
- build 仅打开构建面板，实际构建需手动操作。
- 相关技能：运行时日志见 cocos-debug，服务器信息见 cocos-server。
