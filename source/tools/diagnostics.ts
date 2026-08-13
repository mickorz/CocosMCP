'use strict';

/**
 * 脚本诊断 diagnostics TypeScript 编译检查（Compiler API 版）
 *
 * 用编辑器内置 typescript 的 Compiler API（ts.createProgram + getSyntacticDiagnostics +
 * getSemanticDiagnostics）收全量诊断，避免 tsc CLI 的 syntactic 短路（tsc CLI 有语法错误
 * 就不调 getSemanticDiagnostics，导致其他文件类型错误全消失）。
 *
 * 流程：
 *   runScriptDiagnostics
 *     ├─ findTypescriptModule 找编辑器内置 typescript 模块（require 它）
 *     ├─ readConfigFile + parseJsonConfigFileContent 解析 tsconfig（含 extends）
 *     ├─ createProgram
 *     ├─ getSyntacticDiagnostics + getSemanticDiagnostics（天然分类，不短路）
 *     └─ toDiagnosticItem 转 DiagnosticItem（带 category + snippet）
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
    if (relPath.includes('/node_modules/') || relPath.includes('/extensions/')) return null;
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

    let ts: any;
    try {
        ts = require(tsModulePath);
    } catch (e: any) {
        return { ok: false, tool: 'typescript', tsconfigPath, exitCode: 0, syntacticCount: 0, semanticCount: 0, summary: `Failed to require typescript module (${tsModulePath}): ${e && e.message}`, diagnostics: [] };
    }

    const startTime = Date.now();
    const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (cfg.error) {
        const msg = ts.flattenDiagnosticMessageText(cfg.error.messageText, '\n');
        return { ok: false, tool: 'typescript', tsconfigPath, exitCode: 0, syntacticCount: 0, semanticCount: 0, summary: `Failed to read tsconfig: ${msg}`, diagnostics: [] };
    }
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath), {}, tsconfigPath);
    const programOptions = { ...parsed.options, noEmit: true };

    // P2: 通用 VirtualDeclaration Host（仅在有 virtualDeclarations 时启用）
    // cocos-mcp 不含 pfbm/runtimeGlobals 业务知识，只接收 {fileName, content} 注入 Program
    const virtualDecls: VirtualDeclaration[] = options.virtualDeclarations ?? [];
    const virtualMap = new Map<string, string>(virtualDecls.map(v => [v.fileName, v.content]));
    const virtualFileNames = Array.from(virtualMap.keys());
    const isVirtual = (fn: string) => virtualMap.has(fn);
    const rootNames = [...parsed.fileNames, ...virtualFileNames];

    let program: any;
    if (virtualDecls.length > 0) {
        // 只包一层 createCompilerHost，override virtual 文件的 fileExists/readFile/getSourceFile
        //（官方 Compiler API 支持自定义 Host，正常扩展方式）
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

    // 分类取诊断（Compiler API 不短路：syntactic 错误存在时 semantic 仍返回其他文件类型错误）
    const syntactic = program.getSyntacticDiagnostics();
    const semantic = program.getSemanticDiagnostics();

    // P2 分层：virtual declaration 自身 diagnostics 单独收集（Type Environment Resolution）
    // virtual 文件的诊断（如 bridge 里 import(...) 解析失败 TS2307）不混业务 real/noise，
    // 而是作为 environmentErrors 单独报告
    const virtualSet = new Set(virtualFileNames);
    const isVirtualDiag = (d: any) => !!(d.file && virtualSet.has(d.file.fileName));
    const environmentErrors: DiagnosticItem[] = [];
    for (const d of [...syntactic, ...semantic]) {
        if (isVirtualDiag(d)) {
            const item = virtualDiagnosticToItem(d, ts);
            if (item) environmentErrors.push(item);
        }
    }

    // P2 Type Environment Commit / Rollback（fail closed，事务语义，非 fallback）
    //   生成 bridge → 验证（environmentErrors）
    //     成功（=0）→ commit：业务 diagnostics 用带 bridge 的 Program（pfbm 被 bridge 解决，得强类型）
    //     失败（>0）→ rollback：重跑无 bridge 的 Program，业务 diagnostics 用无 bridge 结果
    //                       （pfbm 等回到 TS2304，绝不因 declare const pfbm 污染而 implicit any 假阴性）
    //   P2 整体 commit/rollback；未来多 bridge 可逐项验证（RuntimeGlobalResolution {name, validated, diagnostics}），
    //   一个坏 bridge 不拖累好的——当前整体回退足够（P2 仅 pfbm）。仅失败路径多一次 createProgram，成功路径零额外开销。
    let bizSyn: any = syntactic;
    let bizSem: any = semantic;
    if (virtualDecls.length > 0 && environmentErrors.length > 0) {
        const rollbackProgram = ts.createProgram({ rootNames: parsed.fileNames, options: programOptions });
        bizSyn = rollbackProgram.getSyntacticDiagnostics();
        bizSem = rollbackProgram.getSemanticDiagnostics();
    }

    // 业务 diagnostics（排除 virtual 文件；rollback 时本就无 virtual，此判断为防御）
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
