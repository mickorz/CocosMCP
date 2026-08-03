#!/usr/bin/env node
/**
 * start-preview.js —— 启动 Cocos 预览服务（不打开系统浏览器）
 *
 * 作用：调用 cocos-mcp 的 Simple API，让 Cocos Creator 在 7456 起预览服务，
 *       但不弹系统浏览器窗口，返回 localhost 地址供专用调试浏览器
 *       (如 chrome-devtools-mcp / CDP) 自己 navigate 过去，避免双窗口。
 *
 * 调用流程：
 *   node start-preview.js [场景]
 *     ├─ 组装请求体 { action: run, platform: browser, openBrowser: false }
 *     │    └─ 命令行第 1 个参数作为可选 scene
 *     ├─ POST http://{MCP_HOST}:{MCP_PORT}/api/project/project_manage
 *     ├─ 成功 → 打印预览地址，退出码 0
 *     └─ 失败/超时/连接拒绝 → 打印原因，退出码 1
 *
 * 用法：
 *   node scripts/start-preview.js                       # 预览当前编辑器场景
 *   node scripts/start-preview.js db://assets/scenes/sss.scene
 *   node scripts/start-preview.js scenes/sss            # 也兼容 assets 相对路径
 *   MCP_PORT=3002 node scripts/start-preview.js         # 用环境变量改端口
 *
 * 零依赖：仅用 Node 内置 http，任何装了 Node 的机器都能直接跑。
 */

'use strict';

const http = require('http');

// 配置：环境变量可覆盖，命令行第 1 个参数作为可选场景
const HOST = process.env.MCP_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const SCENE = process.argv[2] || '';

// 请求体：核心就是 openBrowser=false
const payload = { action: 'run', platform: 'browser', openBrowser: false };
if (SCENE) {
    payload.scene = SCENE;
}
const body = JSON.stringify(payload);

// Simple API 路径：/api/{category}/{tool_name}
const API_PATH = '/api/project/project_manage';

const req = http.request(
    {
        hostname: HOST,
        port: PORT,
        path: API_PATH,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
        },
        timeout: 60000,
    },
    (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            let json;
            try {
                json = JSON.parse(data);
            } catch (e) {
                console.error('[失败] 响应不是合法 JSON:', e.message);
                console.error('原始响应:', data);
                process.exit(1);
            }
            // Simple API 包了一层 { success, tool, result }，真正结果在 result
            const result = json.result || json;
            if (result.success) {
                console.log('[成功]', result.message || '预览服务已启动');
                if (result.data && result.data.url) {
                    console.log('预览地址:', result.data.url);
                }
                process.exit(0);
            } else {
                console.error('[失败]', result.error || result.message || '未知错误');
                process.exit(1);
            }
        });
    }
);

req.on('error', (e) => {
    if (e.code === 'ECONNREFUSED') {
        console.error('[失败] 连接被拒绝，请确认 cocos-mcp 服务已启动:', `${HOST}:${PORT}`);
    } else {
        console.error('[失败] 请求错误:', e.message);
    }
    process.exit(1);
});

req.on('timeout', () => {
    console.error('[失败] 请求超时(60s)');
    req.destroy();
    process.exit(1);
});

req.write(body);
req.end();
