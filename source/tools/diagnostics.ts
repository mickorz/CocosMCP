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
 *      /node_modules/ /extensions/ 路径跳过（依赖声明 / 副本扩展噪声）
 */
function toDiagnosticItem(d: any, category: DiagnosticCategory, projectPath: string, ts: any): DiagnosticItem | null {
    if (!d.file || d.start == null) return null;
    const absPath: string = d.file.fileName;
    const relPath = path.relative(projectPath, absPath).replace(/\\/g, '/');
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
export async function runScriptDiagnostics(projectPath: string, options: { tsconfigPath?: string } = {}): Promise<DiagnosticsResult> {
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

    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });

    // 分类取诊断（Compiler API 不短路：syntactic 错误存在时 semantic 仍返回其他文件类型错误）
    const syntactic = program.getSyntacticDiagnostics();
    const semantic = program.getSemanticDiagnostics();

    const diagnostics: DiagnosticItem[] = [];
    let synCount = 0, semCount = 0;
    for (const d of syntactic) {
        const item = toDiagnosticItem(d, 'syntactic', projectPath, ts);
        if (item) { diagnostics.push(item); synCount++; }
    }
    for (const d of semantic) {
        const item = toDiagnosticItem(d, 'semantic', projectPath, ts);
        if (item) { diagnostics.push(item); semCount++; }
    }

    const compileTime = Date.now() - startTime;
    const ok = diagnostics.length === 0;

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
            : `Found ${synCount} syntactic and ${semCount} semantic TypeScript error(s).`,
        diagnostics,
    };
}
