# 安装与运行验收清单

## 概述

验证 cocos-mcp-server 是否正确安装，以及所有核心功能端到端是否正常工作。

## 安装检查

- [ ] 插件文件夹存在于 `extensions/cocos-mcp-server/`
- [ ] `npm install` 无错误完成
- [ ] `npm run build` 生成了 `dist/main.js` 和 `dist/mcp-server.js`
- [ ] 扩展在 Cocos Creator 扩展管理器中显示
- [ ] 可通过 `扩展 > Cocos MCP Server` 打开面板

## 冒烟测试

- [ ] 服务器启动正常（点击启动服务器，控制台无报错）
- [ ] `GET /health` 返回 `{"status":"ok","ready":true,"phase":"ready"}`
- [ ] `GET /skill-tester` 能加载浏览器测试页面
- [ ] `/health` 中 `tools` 数量符合预期（50）
- [ ] 至少一次工具调用成功（如 `scene_management` 的 `action: "current"`）
- [ ] `run_script_diagnostics` 在 60 秒内返回且不卡顿编辑器
- [ ] 面板显示服务器状态（运行中、端口、预览地址）
- [ ] 工具管理标签页显示所有类别并可切换

## 最终清单

- [ ] 无端口冲突（配置端口上只有一个 LISTENING）
- [ ] 停止服务器后无残留进程
- [ ] `autoStart` 设置跨编辑器重启后保持
- [ ] 场景操作正常（查询节点、创建节点、设置属性）
- [ ] 预制体操作正常（创建、实例化、同步）
- [ ] 诊断 Worker 多次调用后无泄漏
