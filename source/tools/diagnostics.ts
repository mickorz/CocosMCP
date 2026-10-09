'use strict';

/**
 * 脚本诊断 diagnostics TypeScript 编译检查（Compiler API + Worker Threads 版）
 *
 * 用编辑器内置 typescript 的 Compiler API（ts.createProgram + getSyntacticDiagnostics +
 * getSemanticDiagnostics）收全量诊断，避免 tsc CLI 的 syntactic 短路（tsc CLI 有语法错误
 * 就不调 getSemanticDiagnostics，导致其他文件类型错误全消失）。
 *
 * 编译检查在 worker_threads 独立线程执行，不阻塞 Cocos Creator 主线程事件循环。
 * worker_threads 不可用时回退到同步执行（会短暂阻塞）。
 *
 * 流程：
 *   runScriptDiagnostics
 *     ├─ findTsConfig 找 tsconfig
 *     ├─ findTypescriptModule 找编辑器内置 typescript 模块
 *     ├─ Worker 线程执行（DIAGNOSTICS_WORKER_CODE）
 *     │     ├─ readConfigFile + parseJsonConfigFileContent 解析 tsconfig
 *     │     ├─ createProgram
 *     │     ├─ getSyntacticDiagnostics + getSemanticDiagnostics（天然分类，不短路）
 *     │     └─ toDiagnosticItem 转 DiagnosticItem（带 category + snippet）
 *     └─ postMessage 回结果，主线程组装 DiagnosticsResult 返回
 *
 * 关键：getSyntacticDiagnostics 与 getSemanticDiagnostics 分别调用，即使存在 syntactic
 *      错误，semantic 仍会照常返回其他文件的类型错误（一次拿全语法+类型）。
 */

import * as fs from 'fs';
import * as path from 'path';

declare const Editor: any;

export type DiagnosticCategory = 'syntactic' | 'semantic';

export interface DiagnosticItem {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
    category: DiagnosticCategory;  // syntactic / semantic（Compiler API 天然分类）
    snippet?: string;  // error 行附近代码片段，cocoscli 直接展示不用再读文件
}

/** P2 通用 virtual declaration（cocos-mcp 不含业务知识，只接收 {fileName, content} 注入 Program） */
export interface VirtualDeclaration {
    fileName: string;
    content: string;
}

export interface DiagnosticsResult {
    ok: boolean;
    tool: string;
    tsconfigPath: string;
    typescriptPath?: string;       // 命中的 typescript 模块路径
    exitCode: number;
    syntacticCount: number;        // 语法错误数
    semanticCount: number;         // 语义（类型）错误数
    summary: string;
    compileTime?: number;          // 编译耗时 ms
    diagnostics: DiagnosticItem[];
    environmentErrors?: DiagnosticItem[];  // P2: virtual declaration 自身 diagnostics（Type Environment Resolution，不混业务 real）
}

function exists(filePath: string): boolean {
    try { return fs.existsSync(filePath); } catch { return false; }
}

/**
 * 找编辑器内置 typescript 模块根（用于 require）
 * 候选路径沿用原 findTypescriptCommand，返回模块根（非 bin/tsc），验 package.json 存在
 * 实测 CocosCreator 3.7.3 命中：app.asar.unpacked/node_modules/typescript
 */
export function findTypescriptModule(projectPath: string): string | null {
    const possibleRoots = [
        Editor && Editor.App ? Editor.App.path : '',
        (process as any).resourcesPath || '',
        Editor && Editor.App && Editor.App.path ? path.dirname(Editor.App.path) : '',
    ].filter(Boolean);

    const candidates: string[] = [
        path.join(projectPath, 'node_modules', 'typescript'),
    ];
    for (const root of possibleRoots) {
        candidates.push(
            path.join(root, 'resources', '3d', 'engine', 'node_modules', 'typescript'),
            path.join(root, 'resources', '3d', 'engine', 'node_modules', '@cocos', 'typescript'),
            path.join(root, 'app.asar.unpacked', 'node_modules', 'typescript'),
            path.join(root, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript'),
            path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', 'typescript'),
            path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', '@cocos', 'typescript')
        );
    }
    for (const c of candidates) {
        if (exists(path.join(c, 'package.json'))) {
            return c;
        }
    }
    return null;
}

/** 读 filePath 第 line 行附近的代码片段（前后各 contextLines 行） */
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
 * 把一条 ts.Diagnostic 转成 DiagnosticItem
 * 过滤：d.file 或 d.start 为空（config/options 诊断）跳过；
 *      工程外文件跳过（跨盘符 / 向上跳出工程，如引擎 jsb.d.ts 声明）；
 *      /node_modules/ /extensions/ 路径跳过（依赖声明 / 副本扩展噪声）
 */
function toDiagnosticItem(d: any, category: DiagnosticCategory, projectPath: string, ts: any): DiagnosticItem | null {
    if (!d.file || d.start == null) return null;
    const absPath: string = d.file.fileName;
    const relPathRaw = path.relative(projectPath, absPath);
    // 工程外文件丢弃：跨盘符时 path.relative 返回绝对路径（如 D:/CocosSofts/.../jsb.d.ts），
    // 或向上跳出工程目录（以 .. 开头）。引擎 @types 声明、第三方库声明都在工程外，不应算工程错误。
    if (path.isAbsolute(relPathRaw) || relPathRaw.startsWith('..')) return null;
    const relPath = relPathRaw.replace(/\\/g, '/');
    if (relPath.includes('/node_modules/') || relPath.includes('/extensions/') || relPath.startsWith('node_modules/') || relPath.startsWith('extensions/')) return null;
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    return {
        file: relPath,
        line: pos.line + 1,
        column: pos.character + 1,
        code: 'TS' + d.code,
        message,
        category,
        snippet: readSnippet(absPath, pos.line + 1),
    };
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

/**
 * 跑 TypeScript 编译检查（Compiler API），返回分类 diagnostics
 *
 * 与 tsc CLI 的区别：getSyntacticDiagnostics 与 getSemanticDiagnostics 分别请求，
 * 即使有 syntactic 错误，semantic 仍会返回其他文件的类型错误，一次拿全。
 */
export async function runScriptDiagnostics(projectPath: string, options: { tsconfigPath?: string; virtualDeclarations?: VirtualDeclaration[] } = {}): Promise<DiagnosticsResult> {
    const tsconfigPath = findTsConfig(projectPath, options.tsconfigPath);
    if (!tsconfigPath || !exists(tsconfigPath)) {
        return { ok: false, tool: 'typescript', tsconfigPath: '', exitCode: 0, syntacticCount: 0, semanticCount: 0, summary: 'No tsconfig.json was found in the Cocos project.', diagnostics: [] };
    }

    const tsModulePath = findTypescriptModule(projectPath);
    if (!tsModulePath) {
        return { ok: false, tool: 'typescript', tsconfigPath, exitCode: 0, syntacticCount: 0, semanticCount: 0, summary: 'TypeScript module was not found in the Cocos project or editor installation.', diagnostics: [] };
    }

    const virtualDecls = options.virtualDeclarations ?? [];
    const startTime = Date.now();

    // 尝试用持久 worker_threads 在独立线程跑编译检查，避免阻塞 Cocos Creator 主线程
    try {
        const workerResult = await runDiagnosticsInWorker(tsModulePath, tsconfigPath, projectPath, virtualDecls);

        const compileTime = Date.now() - startTime;
        return {
            ok: workerResult.ok,
            tool: 'typescript',
            tsconfigPath,
            typescriptPath: tsModulePath,
            exitCode: workerResult.ok ? 0 : 1,
            syntacticCount: workerResult.syntacticCount,
            semanticCount: workerResult.semanticCount,
            compileTime,
            summary: workerResult.summary,
            diagnostics: workerResult.diagnostics || [],
            environmentErrors: workerResult.environmentErrors || [],
        };
    } catch (e: any) {
        // worker_threads 不可用时，回退到同步执行（会短暂阻塞主线程）
        console.log('[diagnostics] worker unavailable, falling back to sync:', e && e.message);
    }

    // 回退：同步执行（原有逻辑）
    let ts: any;
    try {
        ts = require(tsModulePath);
    } catch (e: any) {
        return { ok: false, tool: 'typescript', tsconfigPath, exitCode: 0, syntacticCount: 0, semanticCount: 0, summary: `Failed to require typescript module (${tsModulePath}): ${e && e.message}`, diagnostics: [] };
    }

    return runDiagnosticsSync(ts, tsModulePath, tsconfigPath, projectPath, virtualDecls, startTime);
}

// ==================== 持久 Worker 复用 ====================

// 缓存的 Worker 实例 + 已加载的 tsModulePath（tsModulePath 变化时重建 Worker）
let _diagnosticsWorker: any = null;
let _diagnosticsWorkerTsPath: string | null = null;
let _diagnosticsReqId = 0;

/**
 * 获取或创建持久 Worker（复用已加载的 TypeScript 实例，避免每次调用都重新 require）
 * tsModulePath 变化时销毁旧 Worker 创建新的（切换编辑器版本等场景）
 */
function getDiagnosticsWorker(tsModulePath: string): any {
    if (_diagnosticsWorker && _diagnosticsWorkerTsPath === tsModulePath) {
        return _diagnosticsWorker;
    }
    // 路径变化或首次创建：销毁旧的
    if (_diagnosticsWorker) {
        try { _diagnosticsWorker.terminate(); } catch {}
        _diagnosticsWorker = null;
    }
    const { Worker } = require('worker_threads');
    _diagnosticsWorker = new Worker(PERSISTENT_WORKER_CODE, { eval: true });
    _diagnosticsWorkerTsPath = tsModulePath;
    _diagnosticsWorker.on('error', (err: Error) => {
        console.error('[diagnostics] worker fatal error:', err.message);
        _diagnosticsWorker = null;
        _diagnosticsWorkerTsPath = null;
    });
    return _diagnosticsWorker;
}

/**
 * 在持久 Worker 中执行编译检查
 * 通过 reqId 区分并发请求，worker 保持存活复用 TypeScript 实例
 */
function runDiagnosticsInWorker(tsModulePath: string, tsconfigPath: string, projectPath: string, virtualDecls: VirtualDeclaration[]): Promise<any> {
    return new Promise((resolve, reject) => {
        let worker: any;
        try {
            worker = getDiagnosticsWorker(tsModulePath);
        } catch (e) {
            reject(e);
            return;
        }
        const reqId = ++_diagnosticsReqId;
        const timeout = setTimeout(() => {
            reject(new Error('Diagnostics worker timed out (60s)'));
        }, 60000);
        const onMessage = (msg: any) => {
            if (msg && msg.reqId === reqId) {
                worker.off('message', onMessage);
                clearTimeout(timeout);
                resolve(msg);
            }
        };
        worker.on('message', onMessage);
        worker.postMessage({ reqId, tsModulePath, tsconfigPath, projectPath, virtualDecls });
    });
}

// ==================== 持久 Worker 代码（监听 message，复用已加载的 ts）====================

/**
 * 持久 Worker：启动后保持存活，通过 postMessage 接收请求
 * TypeScript 模块只在首次请求或路径变化时加载一次，后续请求直接复用
 */
const PERSISTENT_WORKER_CODE = `
var parentPort = require('worker_threads').parentPort;
var fs = require('fs');
var path = require('path');
var ts = null;
var tsModulePath = null;

function readSnippet(filePath, line, contextLines) {
    contextLines = contextLines || 1;
    try {
        var content = fs.readFileSync(filePath, 'utf-8');
        var arr = content.split(/\\r?\\n/);
        var start = Math.max(0, line - 1 - contextLines);
        var end = Math.min(arr.length, line + contextLines);
        return arr.slice(start, end).join('\\n');
    } catch (e) { return ''; }
}

function toDiagnosticItem(d, category, projectPath, ts) {
    if (!d.file || d.start == null) return null;
    var absPath = d.file.fileName;
    var relPathRaw = path.relative(projectPath, absPath);
    if (path.isAbsolute(relPathRaw) || relPathRaw.startsWith('..')) return null;
    var relPath = relPathRaw.replace(/\\\\/g, '/');
    if (relPath.includes('/node_modules/') || relPath.includes('/extensions/') || relPath.startsWith('node_modules/') || relPath.startsWith('extensions/')) return null;
    var pos = d.file.getLineAndCharacterOfPosition(d.start);
    var message = ts.flattenDiagnosticMessageText(d.messageText, '\\n');
    return {
        file: relPath,
        line: pos.line + 1,
        column: pos.character + 1,
        code: 'TS' + d.code,
        message: message,
        category: category,
        snippet: readSnippet(absPath, pos.line + 1)
    };
}

function runDiagnostics(data) {
    var tsconfigPath = data.tsconfigPath;
    var projectPath = data.projectPath;
    var virtualDecls = data.virtualDecls || [];

    var cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (cfg.error) {
        return { ok: false, summary: 'Failed to read tsconfig: ' + ts.flattenDiagnosticMessageText(cfg.error.messageText, '\\n'), diagnostics: [], syntacticCount: 0, semanticCount: 0, environmentErrors: [] };
    }
    var parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath), {}, tsconfigPath);
    var programOptions = Object.assign({}, parsed.options, { noEmit: true });

    var virtualMap = new Map();
    for (var i = 0; i < virtualDecls.length; i++) {
        virtualMap.set(virtualDecls[i].fileName, virtualDecls[i].content);
    }
    var virtualFileNames = virtualDecls.map(function(v) { return v.fileName; });
    var isVirtual = function(fn) { return virtualMap.has(fn); };

    var program;
    if (virtualDecls.length > 0) {
        var host = ts.createCompilerHost(programOptions);
        var origFileExists = host.fileExists.bind(host);
        var origReadFile = host.readFile.bind(host);
        var origGetSourceFile = host.getSourceFile.bind(host);
        host.fileExists = function(fn) { return isVirtual(fn) || origFileExists(fn); };
        host.readFile = function(fn) { return isVirtual(fn) ? virtualMap.get(fn) : origReadFile(fn); };
        host.getSourceFile = function(fn, lv, err, scp) {
            if (isVirtual(fn)) { return ts.createSourceFile(fn, virtualMap.get(fn), lv, true, ts.ScriptKind.TS); }
            return origGetSourceFile(fn, lv, err, scp);
        };
        program = ts.createProgram({ rootNames: parsed.fileNames.concat(virtualFileNames), options: programOptions, host: host });
    } else {
        program = ts.createProgram({ rootNames: parsed.fileNames, options: programOptions });
    }

    var syntactic = program.getSyntacticDiagnostics();
    var semantic = program.getSemanticDiagnostics();

    var virtualSet = new Set(virtualFileNames);
    var isVirtualDiag = function(d) { return !!(d.file && virtualSet.has(d.file.fileName)); };
    var environmentErrors = [];
    var allDiags = syntactic.concat(semantic);
    for (var i = 0; i < allDiags.length; i++) {
        if (isVirtualDiag(allDiags[i])) {
            var d = allDiags[i];
            if (d.file) {
                var pos = d.file.getLineAndCharacterOfPosition(d.start || 0);
                environmentErrors.push({
                    file: d.file.fileName,
                    line: pos.line + 1,
                    column: pos.character + 1,
                    code: 'TS' + d.code,
                    message: ts.flattenDiagnosticMessageText(d.messageText, '\\n'),
                    category: 'semantic'
                });
            }
        }
    }

    var bizSyn = syntactic;
    var bizSem = semantic;
    if (virtualDecls.length > 0 && environmentErrors.length > 0) {
        var rollbackProgram = ts.createProgram({ rootNames: parsed.fileNames, options: programOptions });
        bizSyn = rollbackProgram.getSyntacticDiagnostics();
        bizSem = rollbackProgram.getSemanticDiagnostics();
    }

    var diagnostics = [];
    var synCount = 0, semCount = 0;
    for (var i = 0; i < bizSyn.length; i++) {
        if (isVirtualDiag(bizSyn[i])) continue;
        var item = toDiagnosticItem(bizSyn[i], 'syntactic', projectPath, ts);
        if (item) { diagnostics.push(item); synCount++; }
    }
    for (var i = 0; i < bizSem.length; i++) {
        if (isVirtualDiag(bizSem[i])) continue;
        var item = toDiagnosticItem(bizSem[i], 'semantic', projectPath, ts);
        if (item) { diagnostics.push(item); semCount++; }
    }

    var ok = diagnostics.length === 0 && environmentErrors.length === 0;
    var summary = ok
        ? 'TypeScript diagnostics completed successfully with no errors.'
        : environmentErrors.length > 0
            ? 'Found ' + synCount + ' syntactic and ' + semCount + ' semantic error(s); plus ' + environmentErrors.length + ' Type Environment Resolution error(s) (bridge rolled back, business diagnostics use no-bridge program).'
            : 'Found ' + synCount + ' syntactic and ' + semCount + ' semantic TypeScript error(s).';

    return { ok: ok, summary: summary, diagnostics: diagnostics, syntacticCount: synCount, semanticCount: semCount, environmentErrors: environmentErrors };
}

// 持久监听 message：首次请求加载 TypeScript，后续请求直接复用
parentPort.on('message', function(data) {
    try {
        if (!ts || tsModulePath !== data.tsModulePath) {
            ts = require(data.tsModulePath);
            tsModulePath = data.tsModulePath;
        }
        var result = runDiagnostics(data);
        result.reqId = data.reqId;
        parentPort.postMessage(result);
    } catch (e) {
        parentPort.postMessage({ reqId: data.reqId, ok: false, summary: 'Worker error: ' + (e && e.message ? e.message : String(e)), diagnostics: [], syntacticCount: 0, semanticCount: 0, environmentErrors: [] });
    }
});
`;

// ==================== 同步回退（worker_threads 不可用时）====================

function runDiagnosticsSync(ts: any, tsModulePath: string, tsconfigPath: string, projectPath: string, virtualDecls: VirtualDeclaration[], startTime: number): DiagnosticsResult {
    const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (cfg.error) {
        const msg = ts.flattenDiagnosticMessageText(cfg.error.messageText, '\n');
        return { ok: false, tool: 'typescript', tsconfigPath, exitCode: 0, syntacticCount: 0, semanticCount: 0, summary: `Failed to read tsconfig: ${msg}`, diagnostics: [] };
    }
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath), {}, tsconfigPath);
    const programOptions = { ...parsed.options, noEmit: true };

    const virtualMap = new Map<string, string>(virtualDecls.map(v => [v.fileName, v.content]));
    const virtualFileNames = Array.from(virtualMap.keys());
    const isVirtual = (fn: string) => virtualMap.has(fn);
    const rootNames = [...parsed.fileNames, ...virtualFileNames];

    let program: any;
    if (virtualDecls.length > 0) {
        const host = ts.createCompilerHost(programOptions);
        const origFileExists = host.fileExists.bind(host);
        const origReadFile = host.readFile.bind(host);
        const origGetSourceFile = host.getSourceFile.bind(host);
        host.fileExists = (fn: string) => isVirtual(fn) || origFileExists(fn);
        host.readFile = (fn: string) => (isVirtual(fn) ? virtualMap.get(fn)! : origReadFile(fn));
        host.getSourceFile = (fn: any, languageVersion: any, onError: any, shouldCreateNewSourceFile: any) => {
            if (isVirtual(fn)) {
                return ts.createSourceFile(fn, virtualMap.get(fn)!, languageVersion, true, ts.ScriptKind.TS);
            }
            return origGetSourceFile(fn, languageVersion, onError, shouldCreateNewSourceFile);
        };
        program = ts.createProgram({ rootNames, options: programOptions, host });
    } else {
        program = ts.createProgram({ rootNames: parsed.fileNames, options: programOptions });
    }

    const syntactic = program.getSyntacticDiagnostics();
    const semantic = program.getSemanticDiagnostics();

    const virtualSet = new Set(virtualFileNames);
    const isVirtualDiag = (d: any) => !!(d.file && virtualSet.has(d.file.fileName));
    const environmentErrors: DiagnosticItem[] = [];
    for (const d of [...syntactic, ...semantic]) {
        if (isVirtualDiag(d)) {
            const item = virtualDiagnosticToItem(d, ts);
            if (item) environmentErrors.push(item);
        }
    }

    let bizSyn: any = syntactic;
    let bizSem: any = semantic;
    if (virtualDecls.length > 0 && environmentErrors.length > 0) {
        const rollbackProgram = ts.createProgram({ rootNames: parsed.fileNames, options: programOptions });
        bizSyn = rollbackProgram.getSyntacticDiagnostics();
        bizSem = rollbackProgram.getSemanticDiagnostics();
    }

    const diagnostics: DiagnosticItem[] = [];
    let synCount = 0, semCount = 0;
    for (const d of bizSyn) {
        if (isVirtualDiag(d)) continue;
        const item = toDiagnosticItem(d, 'syntactic', projectPath, ts);
        if (item) { diagnostics.push(item); synCount++; }
    }
    for (const d of bizSem) {
        if (isVirtualDiag(d)) continue;
        const item = toDiagnosticItem(d, 'semantic', projectPath, ts);
        if (item) { diagnostics.push(item); semCount++; }
    }

    const compileTime = Date.now() - startTime;
    const ok = diagnostics.length === 0 && environmentErrors.length === 0;

    return {
        ok,
        tool: 'typescript',
        tsconfigPath,
        typescriptPath: tsModulePath,
        exitCode: ok ? 0 : 1,
        syntacticCount: synCount,
        semanticCount: semCount,
        compileTime,
        summary: ok
            ? 'TypeScript diagnostics completed successfully with no errors.'
            : environmentErrors.length > 0
                ? `Found ${synCount} syntactic and ${semCount} semantic error(s); plus ${environmentErrors.length} Type Environment Resolution error(s) (bridge rolled back, business diagnostics use no-bridge program).`
                : `Found ${synCount} syntactic and ${semCount} semantic TypeScript error(s).`,
        diagnostics,
        environmentErrors,
    };
}

/**
 * P2: virtual declaration 自身 diagnostic 转 DiagnosticItem
 * 不走 toDiagnosticItem 的工程外过滤（virtual 文件名非工程内路径），直接按 virtual 文件名记录
 */
function virtualDiagnosticToItem(d: any, ts: any): DiagnosticItem | null {
    if (!d.file) return null;
    const pos = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    return {
        file: d.file.fileName,
        line: pos.line + 1,
        column: pos.character + 1,
        code: 'TS' + d.code,
        message,
        category: 'semantic',
    };
}
