'use strict';

/**
 * 脚本诊断 diagnostics TypeScript 编译检查
 *
 * 移植自 funplay-cocos-mcp（MIT），用 CocosCreator 编辑器内置 typescript 跑 tsc --noEmit，
 * 避开"工程没装 typescript / typescript 版本和编辑器不兼容 / cc 声明缺失"等坑。
 *
 * 流程：
 *   runScriptDiagnostics
 *     ├─ findTsConfig 找 tsconfig.json 或 temp tsconfig cocos json
 *     ├─ findTypescriptCommand 找编辑器内置 tsc 优先 project node_modules 兜底
 *     │     └─ 用 process.execPath 编辑器 electron + ELECTRON_RUN_AS_NODE 当 node 跑 tsc
 *     ├─ runExec tsc --noEmit -p tsconfig --pretty false
 *     └─ parseTscOutput 解析 error 行 过滤 node_modules 和 extensions 噪音
 *
 * 来源：funplay-cocos-mcp/lib/diagnostics.js（MIT, https://github.com/FunplayAI/funplay-cocos-mcp）
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

declare const Editor: any;

export interface DiagnosticItem {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    snippet?: string;  // 方案B：error 行附近的代码片段，cocoscli 直接展示不用再读文件
}

export interface DiagnosticsResult {
    ok: boolean;
    tool: string;
    binary?: string;
    compiler?: string;
    tsconfigPath: string;
    exitCode: number;
    summary: string;
    compileTime?: number;  // 方案B：编译耗时 ms
    diagnostics: DiagnosticItem[];
    stdout: string;
    stderr: string;
}

function exists(filePath: string): boolean {
    try { return fs.existsSync(filePath); } catch { return false; }
}

/**
 * 找 typescript 编译器：优先编辑器内置（resources/app.asar.unpacked 等），兜底项目本地
 * 实测 CocosCreator 3.7.3 命中：<Editor.App.path 父级>/resources/app.asar.unpacked/node_modules/typescript/bin/tsc
 * 返回用 process.execPath（编辑器 electron）+ ELECTRON_RUN_AS_NODE=1 当 node 跑 tsc
 */
export function findTypescriptCommand(projectPath: string): { binary: string; argsPrefix: string[]; compiler: string; env: NodeJS.ProcessEnv } | null {
    const nodeBinary = process.execPath;
    const possibleRoots = [
        Editor && Editor.App ? Editor.App.path : '',
        (process as any).resourcesPath || '',
        Editor && Editor.App && Editor.App.path ? path.dirname(Editor.App.path) : '',
    ].filter(Boolean);

    const editorBundled: string[] = [];
    for (const root of possibleRoots) {
        editorBundled.push(
            path.join(root, 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(root, 'resources', '3d', 'engine', 'node_modules', '@cocos', 'typescript', 'bin', 'tsc'),
            path.join(root, 'app.asar.unpacked', 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(root, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', '@cocos', 'typescript', 'bin', 'tsc')
        );
    }

    const candidates = [
        path.join(projectPath, 'node_modules', 'typescript', 'bin', 'tsc'),
        ...editorBundled,
    ];

    for (const scriptPath of candidates) {
        if (exists(scriptPath)) {
            return { binary: nodeBinary, argsPrefix: [scriptPath], compiler: scriptPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
        }
    }
    return null;
}

/** 找 tsconfig：项目根 tsconfig.json → temp/tsconfig.cocos.json，或用显式指定路径 */
export function findTsConfig(projectPath: string, explicitPath?: string): string {
    if (explicitPath) {
        return path.isAbsolute(explicitPath) ? explicitPath : path.join(projectPath, explicitPath);
    }
    const candidates = [
        path.join(projectPath, 'tsconfig.json'),
        path.join(projectPath, 'temp', 'tsconfig.cocos.json'),
    ];
    return candidates.find(exists) || '';
}

function runExec(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string; stderr: string; error: string }> {
    return new Promise((resolve) => {
        execFile(file, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
            resolve({
                code: error && typeof (error as any).code === 'number' ? (error as any).code : 0,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error ? error.message : '',
            });
        });
    });
}

/**
 * 读 filePath 第 line 行附近的代码片段（前后各 contextLines 行）
 * 方案B：让 diagnostic 自带 snippet，cocoscli 不用再读文件拼
 */
function readSnippet(filePath: string, line: number, contextLines: number = 1): string {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const arr = content.split(/\r?\n/);
        const start = Math.max(0, line - 1 - contextLines);
        const end = Math.min(arr.length, line + contextLines);
        return arr.slice(start, end).join('\n');
    } catch {
        return '';
    }
}

/**
 * 解析 tsc 输出，过滤 node_modules / extensions 噪音（只留项目脚本真实 error）
 * 噪音来源：副本扩展的 node_modules/@types 等，和编辑器 typescript 不兼容的 syntax error
 * projectPath 用于读 snippet（error 行附近代码）
 */
export function parseTscOutput(output: string, projectPath?: string): DiagnosticItem[] {
    const lines = String(output || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const regex = /^(.*)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/i;
    const diagnostics: DiagnosticItem[] = [];
    for (const line of lines) {
        const m = regex.exec(line);
        if (!m) continue;
        const file = m[1];
        const norm = file.replace(/\\/g, '/');
        // B 过滤：跳过 node_modules / extensions 路径（依赖声明 / 副本扩展噪音）
        if (norm.includes('/node_modules/') || norm.includes('/extensions/')) continue;
        const lineNum = Number(m[2]);
        diagnostics.push({
            file,
            line: lineNum,
            column: Number(m[3]),
            code: m[4],
            message: m[5],
            // 方案B：带 snippet（error 行附近代码），cocoscli 直接展示不用读文件
            snippet: projectPath ? readSnippet(path.join(projectPath, file), lineNum) : '',
        });
    }
    return diagnostics;
}

/** 跑 TypeScript 编译检查，返回 diagnostics 列表 */
export async function runScriptDiagnostics(projectPath: string, options: { tsconfigPath?: string } = {}): Promise<DiagnosticsResult> {
    const tsconfigPath = findTsConfig(projectPath, options.tsconfigPath);
    if (!tsconfigPath || !exists(tsconfigPath)) {
        return { ok: false, tool: 'typescript', tsconfigPath: '', exitCode: 0, summary: 'No tsconfig.json was found in the Cocos project.', diagnostics: [], stdout: '', stderr: '' };
    }

    const command = findTypescriptCommand(projectPath);
    if (!command) {
        return { ok: false, tool: 'typescript', tsconfigPath, exitCode: 0, summary: 'TypeScript compiler was not found in the Cocos project or editor installation.', diagnostics: [], stdout: '', stderr: '' };
    }

    // --skipLibCheck：跳过所有 .d.ts 检查（cc.d.ts/jsb.d.ts 等引擎声明的类型噪音全消，只剩用户 .ts 代码 error）
    const args = [...command.argsPrefix, '--noEmit', '--skipLibCheck', '-p', tsconfigPath, '--pretty', 'false'];
    const startTime = Date.now();
    const result = await runExec(command.binary, args, projectPath, command.env);
    const compileTime = Date.now() - startTime;  // 方案B：编译耗时 ms
    const merged = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
    const diagnostics = parseTscOutput(merged, projectPath);  // 传 projectPath 以读 snippet
    const ok = result.code === 0 && diagnostics.length === 0;

    return {
        ok,
        tool: 'typescript',
        binary: command.binary,
        compiler: command.compiler,
        tsconfigPath,
        exitCode: result.code,
        compileTime,
        summary: ok
            ? 'TypeScript diagnostics completed successfully with no errors.'
            : diagnostics.length
                ? `Found ${diagnostics.length} TypeScript error(s).`
                : merged || 'TypeScript diagnostics reported a non-zero exit code.',
        diagnostics,
        stdout: result.stdout,
        stderr: result.stderr,
    };
}
