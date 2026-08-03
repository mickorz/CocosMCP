---
name: cocos-asset
description: Cocos Creator 资源技能 - 导入/删除/查询资源，依赖分析与清单，纹理压缩，资源系统刷新与状态，资源增删改操作。配合 cocos-mcp 的 assetAdvanced 类工具使用。
---

# Cocos 资源管理 (cocos-asset)

指导 AI 如何通过 cocos-mcp 管理项目资源：导入/删除资源、查询资源信息、依赖分析与资源清单、纹理压缩、资源库刷新与状态、资源的创建/复制/移动/保存/重新导入。

## 何时使用

- 要批量导入外部文件到项目、或删除资源
- 要查询资源信息、按类型/文件夹查资源、按名查找、查路径/uuid/url
- 要分析某资源的依赖、或生成资源清单报告
- 要批量压缩纹理
- 要检查资源库就绪状态、刷新资源库、用外部程序打开资源
- 要创建/复制/移动/保存/重新导入资源

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/assetAdvanced/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| asset_manage | import / delete / save_meta / generate_url | 导入、删除、存元数据、生成 url |
| asset_analyze | dependencies / manifest | 依赖分析、资源清单(JSON/CSV/XML) |
| asset_optimize | compress_textures | 批量压缩纹理 |
| asset_system | check_ready / open_external / refresh | 资源库就绪、外部打开、刷新 |
| asset_query | get_info / get_assets / find_by_name / get_details / query_path / query_uuid / query_url | 多种资源查询 |
| asset_operations | create / copy / move / delete / save / reimport / import | 资源增删改操作 |

## 典型工作流

1. 先确认资源库就绪：asset_system action=check_ready。
2. 查资源：asset_query action=get_assets 传 type 过滤，或 find_by_name 按名找，拿到 uuid/path。
3. 导入外部文件：asset_manage action=import 传 assets 数组。
4. 分析依赖：asset_analyze action=dependencies 传 url。
5. 改动后刷新：asset_system action=refresh。
6. 高级操作：asset_operations 做创建/复制/移动/保存/重新导入。

## curl 示例

按类型列出资源：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/assetAdvanced/asset_query \
  -H "Content-Type: application/json" \
  -d '{"action":"get_assets","type":"texture"}'
```

刷新资源库：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/assetAdvanced/asset_system \
  -H "Content-Type: application/json" \
  -d '{"action":"refresh"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 端点 category 是 camelCase 的 assetAdvanced，不是 asset_advanced。
- 导入/删除等批量操作注意传数组参数；删除前建议先 query 确认。
- 相关技能：预制体见 cocos-prefab，场景见 cocos-scene。
