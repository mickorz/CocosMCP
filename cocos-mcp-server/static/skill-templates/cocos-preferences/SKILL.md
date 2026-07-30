---
name: cocos-preferences
description: Cocos Creator 偏好设置技能 - 打开偏好面板、读写与重置配置、查询全部设置、导出备份。配合 cocos-mcp 的 preferences 类工具使用。
---

# Cocos 偏好设置 (cocos-preferences)

指导 AI 如何通过 cocos-mcp 打开编辑器偏好面板、读取/修改/重置配置、查询全部设置或按关键词搜索、导出偏好备份。

## 何时使用

- 要打开偏好设置面板(可指定 tab)
- 要读取某分类(general/external-tools/preview 等)的配置值
- 要修改偏好配置、或重置为默认
- 要列出所有配置分类、按关键词搜索设置项
- 要导出偏好做备份

## 可用工具

端点：`POST http://127.0.0.1:{{port}}/api/preferences/{工具名}`，参数走 JSON body。

| 工具 | 主要 action | 用途 |
|------|------------|------|
| preferences_manage | open_panel / get_config / set_config / reset_config | 开面板、读/写/重置配置(按 category+path) |
| preferences_query | get_all / list_categories / search_settings | 查全部、列分类、按关键词搜 |
| preferences_backup | export / validate_backup | 导出偏好、校验备份格式 |

## 典型工作流

1. 不确定有哪些分类：preferences_query action=list_categories。
2. 读配置：preferences_manage action=get_config 传 category(如 general) + path。
3. 改配置：action=set_config 传 category + path + value + scope(global/local)。
4. 重置：action=reset_config 传 category。
5. 想看全部：preferences_query action=get_all 传 scope。
6. 备份：preferences_backup action=export。

## curl 示例

列出偏好分类：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/preferences/preferences_query \
  -H "Content-Type: application/json" \
  -d '{"action":"list_categories"}'
```

读取 general 分类配置：
```bash
curl -X POST http://127.0.0.1:{{port}}/api/preferences/preferences_manage \
  -H "Content-Type: application/json" \
  -d '{"action":"get_config","category":"general","path":"<配置路径>"}'
```

## 注意事项

- 端口以面板为准，默认 3001。
- 配置 scope 分 global(全局)/local(项目)/default(只读)。
- set_config 前建议先 get_config 确认当前值与 path。
- 相关技能：项目设置见 cocos-project 的 get_settings。
