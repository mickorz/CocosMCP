#!/usr/bin/env node
/**
 * 文档同步 Hook (PostToolUse)
 *
 * 作用：把项目内的 Markdown 文档（新增 / 修改 / 删除）
 *      自动镜像到 Obsidian 知识库目录。
 *
 * 触发：由 .claude/settings.local.json 的 PostToolUse hook 调用，
 *      匹配 Write|Edit|MultiEdit（新增 / 修改）与 Bash（删除）。
 *
 * 规则：
 *   - 仅同步 .md 文件
 *   - 排除 cocos-mcp-server (第三方扩展目录) 与 .git 等目录
 *   - Obsidian 内保持相对仓库根的目录结构
 *
 * 可配置（环境变量）：
 *   - OBSIDIAN_COCOSMCP_ROOT  覆盖 Obsidian 目标根目录（默认本机路径）
 *   - SYNC_DOCS_VERBOSE=1     输出同步日志（默认静默）
 */

const fs = require('fs');
const path = require('path');

// ===== 配置区 =====
// 仓库根（脚本位于 <root>/.claude/hooks/，向上两级）
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
// Obsidian 目标根目录：命令行参数 > 环境变量 > 空
// 个人路径由 .claude/settings.local.json（本地、不进 git）的 hook command 以参数传入，
// 脚本本身不含任何机器特定路径，便于随仓库共享。
const OBSIDIAN_ROOT =
    process.argv[2] || process.env.OBSIDIAN_COCOSMCP_ROOT || '';
// 需排除的子目录（相对仓库根的任一层级匹配）
const EXCLUDE_DIRS = ['cocos-mcp-server', '.git', 'node_modules', 'library', 'temp'];
const DOC_EXT = '.md';
const VERBOSE = !!process.env.SYNC_DOCS_VERBOSE;
// ==================

const log = (...a) => {
    if (VERBOSE) console.log('[文档同步]', ...a);
};

// 读取 stdin（带超时保险，防止异常情况下挂起阻塞工具）
function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        let done = false;
        const finish = () => {
            if (!done) {
                done = true;
                resolve(data);
            }
        };
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => (data += c));
        process.stdin.on('end', finish);
        setTimeout(finish, 3000); // 3 秒超时
    });
}

// 计算 absPath 相对仓库根的路径（正斜杠）；不在仓库内返回 null
function toRel(absPath) {
    if (!absPath) return null;
    const rel = path.relative(PROJECT_ROOT, absPath);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
}

// 是否为应跟踪的项目内 .md 文档
function isTrackable(absPath) {
    if (!absPath || !absPath.toLowerCase().endsWith(DOC_EXT)) return false;
    const rel = toRel(absPath);
    if (!rel) return false;
    const parts = rel.split('/');
    if (parts.some((p) => EXCLUDE_DIRS.includes(p))) return false;
    return true;
}

function ensureDirFor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// 新增 / 修改：复制到 Obsidian
function syncFile(absPath) {
    if (!isTrackable(absPath)) return false;
    if (!fs.existsSync(absPath)) return false; // 源已不存在
    const rel = toRel(absPath);
    const dest = path.join(OBSIDIAN_ROOT, ...rel.split('/'));
    ensureDirFor(dest);
    fs.copyFileSync(absPath, dest);
    log('sync ->', dest);
    return true;
}

// 删除：从 Obsidian 移除（做范围校验，避免越界删除）
function removeFile(absPath) {
    const rel = toRel(absPath);
    if (!rel) return false; // 必须在仓库范围内
    if (!rel.toLowerCase().endsWith(DOC_EXT)) return false;
    const dest = path.join(OBSIDIAN_ROOT, ...rel.split('/'));
    if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
        log('delete ->', dest);
        return true;
    }
    return false;
}

// 从 Bash 命令中尽力提取被删除的 .md 路径
function extractDeletedDocs(command) {
    if (!command) return [];
    // 仅在命令含删除意图时处理
    if (!/(\brm\b|\bdel\b|Remove-Item)/i.test(command)) return [];
    const files = [];
    // 提取所有 .md 结尾的 token（去掉首尾引号）
    const re = /([^\s'";|&<>]+\.md)/gi;
    let m;
    while ((m = re.exec(command)) !== null) {
        files.push(m[1].replace(/^['"]|['"]$/g, ''));
    }
    return files;
}

async function main() {
    if (!OBSIDIAN_ROOT) {
        console.error('[文档同步] 未配置 Obsidian 目标根目录（通过 hook 命令行参数或 OBSIDIAN_COCOSMCP_ROOT 环境变量设置），本次跳过');
        return;
    }
    const raw = await readStdin();
    if (!raw || !raw.trim()) return;
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return; // 非 JSON 输入，忽略
    }
    const tool = payload.tool_name;
    const input = payload.tool_input || {};

    try {
        if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') {
            const fp = input.file_path;
            if (fp) syncFile(path.resolve(fp));
        } else if (tool === 'Bash') {
            const cmd = input.command || '';
            for (const f of extractDeletedDocs(cmd)) {
                const abs = path.isAbsolute(f) ? f : path.resolve(PROJECT_ROOT, f);
                removeFile(abs);
            }
        }
    } catch (e) {
        console.error('[文档同步] 发生错误:', e.message);
    }
}

main();
