import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

declare const Editor: any;

/**
 * ScriptTools：任意 JavaScript 执行工具（execute_script）
 *
 * 参考 funplay-cocos-mcp 的 execute_javascript：双上下文统一入口。
 *
 * execute_script 执行流程
 *
 * ScriptTools.execute('execute_script', {context, code, args})
 *        ├─> context 归一化（非 'editor' 一律 scene）
 *        ├─> scene   -> executeSceneCode
 *        │             └─> Editor.Message.request('scene', 'execute-scene-script',
 *        │                   {name:'cocos-mcp-server', method:'executeCode', args:[code, args]})
 *        │                 scene 进程 scene.ts executeCode 执行（已 plainSerialize 降维）
 *        └─> editor -> executeEditorCode
 *                      └─> browser 进程本地 AsyncFunction 执行
 *                          注入 require / Editor / args / fs / path / os
 *                          结果经 plainSerializeLite（JSON 安全化）
 *
 * 注意：不做代码安全检查（对齐 cocoscli 的定位——开发者本机工具链，
 * compile/build/lint 同样无沙箱），执行内容由调用方自行负责。
 */
export class ScriptTools implements ToolExecutor {

    getTools(): ToolDefinition[] {
        return [
            {
                name: 'execute_script',
                description: 'SCRIPT EXECUTION: Run arbitrary JavaScript in scene or editor context. ' +
                    'context="scene": runs in the Cocos scene process, injected vars require/cc/Editor/scene/director/args, use for live scene inspection and mutation. ' +
                    'context="editor": runs in the editor main process, injected vars require/Editor/args/fs/path/os, use for Editor APIs, asset-db workflows and file operations. ' +
                    'Three code exits (by priority): direct return; define run(env) function; export a function via module.exports or module.exports.run. ' +
                    'Scene results are plain-serialized (Node -> {name,path,uuid,active,components}).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        context: {
                            type: 'string',
                            enum: ['scene', 'editor'],
                            default: 'scene',
                            description: 'Execution context: scene (Cocos scene process) or editor (editor main process)'
                        },
                        code: {
                            type: 'string',
                            description: 'JavaScript source to execute. May directly return a value, define run(env), or export a function via module.exports.'
                        },
                        args: {
                            type: 'object',
                            description: 'Optional JSON object passed into the script as args.',
                            default: {}
                        }
                    },
                    required: ['context', 'code']
                }
            }
        ];
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        if (toolName !== 'execute_script') {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        const code = String(args?.code || '');
        if (!code.trim()) {
            return { success: false, error: 'code is required' };
        }

        const context = args?.context === 'editor' ? 'editor' : 'scene';
        const scriptArgs = args?.args ?? {};

        if (context === 'editor') {
            return await this.executeEditorCode(code, scriptArgs);
        }
        return await this.executeSceneCode(code, scriptArgs);
    }

    /**
     * scene 上下文：转发到场景进程的 executeCode
     *
     * scene.ts 的 executeCode 已包好 {success, data|error}（data 已 plainSerialize），
     * 这里直接透传。name 必须是 package.json 的 name（cocos-mcp-server）。
     */
    private async executeSceneCode(code: string, args: Record<string, unknown>): Promise<ToolResponse> {
        try {
            const result: any = await Editor.Message.request('scene', 'execute-scene-script', {
                name: 'cocos-mcp-server',
                method: 'executeCode',
                args: [code, args]
            });
            // execute-scene-script 失败时可能返回 null/undefined（如方法未注册）
            if (result == null) {
                return {
                    success: false,
                    error: 'execute-scene-script returned no result. ' +
                        'CocosMCP may need a restart to load the new scene method (executeCode).'
                };
            }
            return result;
        } catch (err: any) {
            return { success: false, error: err.message || String(err) };
        }
    }

    /**
     * editor 上下文：browser 进程本地执行
     *
     * 参考 funplay browser.js 的 executeEditorScript（去掉 helpers，第一版不注入
     * callTool——ScriptTools 拿不到 mcpServer 实例会循环引用，需要调工具走
     * Editor.Message.request 即可）。
     */
    private async executeEditorCode(code: string, args: Record<string, unknown>): Promise<ToolResponse> {
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor as any;
        const runner = new AsyncFunction(
            'require', 'Editor', 'args', 'fs', 'path', 'os',
            `
            const module = { exports: {} };
            const exports = module.exports;
            ${code}
            if (typeof run === 'function') {
                return await run({ Editor, args, fs, path, os, require });
            }
            if (typeof module.exports === 'function') {
                return await module.exports({ Editor, args, fs, path, os, require });
            }
            if (module.exports && typeof module.exports.run === 'function') {
                return await module.exports.run({ Editor, args, fs, path, os, require });
            }
            `
        );
        const raw = await runner(require, Editor, args ?? {}, fs, path, os);
        return { success: true, data: plainSerializeLite(raw, 0, new WeakSet()) };
    }
}

/**
 * editor 侧结果 JSON 安全化（无 cc 引擎类，只做通用降维）
 *
 * 与 scene 侧 plainSerialize 的区别：browser 进程没有引擎对象，
 * 不需要 instanceof 判型，只处理深度上限 / 循环引用 / 单属性降级。
 */
function plainSerializeLite(value: any, depth: number, seen: WeakSet<object>): any {
    if (value == null) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'bigint') {
        return String(value);
    }

    if (Array.isArray(value)) {
        if (depth >= 5) {
            return `[Array(${value.length})]`;
        }
        return value.map((item) => plainSerializeLite(item, depth + 1, seen));
    }

    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);

        if (depth >= 5) {
            return `[${value.constructor && value.constructor.name ? value.constructor.name : 'Object'}]`;
        }

        const output: any = {};
        for (const key of Object.keys(value)) {
            try {
                output[key] = plainSerializeLite(value[key], depth + 1, seen);
            } catch (error: any) {
                output[key] = `[Unserializable: ${error.message}]`;
            }
        }
        return output;
    }

    return String(value);
}
