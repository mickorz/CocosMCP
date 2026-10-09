/**
 * 文档同步插件 (OpenCode Plugin)
 *
 * 作用：把项目内值得存档的 Markdown 文档自动镜像到 Obsidian 知识库的
 *      40_Projects/<项目名>/ 目录下，按文档类型分类存放。
 *
 * 触发：通过 tool.execute.after 钩子，在工具执行完成后介入。
 *      - write / edit 工具 -> 读取 -> 分类 -> 复制到 Obsidian
 *      - bash 工具 -> 解析删除命令，移除 Obsidian 侧对应文件
 *
 * 文档分类（3 层模型）：
 *   L1 工程知识（当前有效）  -> docs/、根目录文档        -> 同步
 *   L2 开发过程（可追溯）    -> dev-docs/ 大部分子目录    -> 不同步（留 Git）
 *   L3 经验知识（跨项目复用）-> dev-docs/experience/     -> 同步
 *
 * 同步前会读取文档内容做质量过滤：
 *   - 空文件 / 过短（< 100 字符）-> 跳过
 *   - 纯模板骨架（只有占位符无实际内容）-> 跳过
 *   - 有效内容 < 3 行 -> 跳过
 *
 * 可配置（环境变量）：
 *   - OBSIDIAN_VAULT_ROOT       覆盖 vault 根目录（默认运行 obsidian vault 自动获取）
 *   - SYNC_DOCS_PROJECT_NAME     覆盖项目名（默认取项目目录名）
 *   - OBSIDIAN_DOCS_ROOT        完整目标路径（最高优先级，跳过自动检测）
 *   - SYNC_DOCS_EXCLUDE          追加排除目录（逗号分隔，如 "vendor,build"）
 *   - SYNC_DOCS_DEV_DIRS        dev-docs 下需同步的子目录（逗号分隔，默认 "experience"）
 *   - SYNC_DOCS_VERBOSE=1        输出同步日志（默认静默）
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ===== 配置区 =====
const VERBOSE = !!process.env.SYNC_DOCS_VERBOSE;
const DOC_EXT = ".md";
const EXCLUDE_DIRS = [
  ".git",
  "node_modules",
  "dist",
  ...(process.env.SYNC_DOCS_EXCLUDE
    ? process.env.SYNC_DOCS_EXCLUDE.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []),
];
const VAULT_PROJECTS_DIR = "40_Projects";
const SYNC_DEV_DIRS = (process.env.SYNC_DOCS_DEV_DIRS || "experience")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MIN_CONTENT_LENGTH = 100;
const MIN_EFFECTIVE_LINES = 3;
// ==================

const log = (...a) => {
  if (VERBOSE) console.log("[文档同步]", ...a);
};

// 自动检测 Obsidian vault 根目录
function detectVaultRoot() {
  if (process.env.OBSIDIAN_VAULT_ROOT) return process.env.OBSIDIAN_VAULT_ROOT;
  try {
    const output = execSync("obsidian vault", {
      encoding: "utf8",
      timeout: 5000,
      stdio: "pipe",
    });
    const match = output.match(/^path\s+(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// 解析 Obsidian 同步目标根目录
function resolveObsidianRoot(projectRoot) {
  if (process.env.OBSIDIAN_DOCS_ROOT) return process.env.OBSIDIAN_DOCS_ROOT;
  const vaultRoot = detectVaultRoot();
  if (vaultRoot) {
    const name =
      process.env.SYNC_DOCS_PROJECT_NAME || path.basename(projectRoot);
    return path.join(vaultRoot, VAULT_PROJECTS_DIR, name);
  }
  return "";
}

// 计算 absPath 相对仓库根的路径（正斜杠）；不在仓库内返回 null
function toRel(absPath, projectRoot) {
  if (!absPath) return null;
  const rel = path.relative(projectRoot, absPath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

// 是否为 .md 文件且不在排除目录内
function isMdNotExcluded(absPath, projectRoot) {
  if (!absPath || !absPath.toLowerCase().endsWith(DOC_EXT)) return false;
  const rel = toRel(absPath, projectRoot);
  if (!rel) return false;
  const parts = rel.split("/");
  if (parts.some((p) => EXCLUDE_DIRS.includes(p))) return false;
  return true;
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// ===== 文档分类 =====

// 路径分类：根据文件相对路径判断是否同步及目标路径
function classifyByPath(rel) {
  const parts = rel.split("/");
  const fileName = parts[parts.length - 1];
  const topDir = parts[0];
  const subDir = parts.length > 1 ? parts[1] : "";

  // 根目录 .md 文件 -> 同步到根
  if (parts.length === 1) {
    return { sync: true, targetRel: fileName };
  }

  // docs/ 下 -> 同步，保持原路径（L1 读者向文档）
  if (topDir === "docs") {
    return { sync: true, targetRel: rel };
  }

  // dev-docs/<子目录>/ -> 仅 SYNC_DEV_DIRS 中的子目录同步，重映射到子目录名
  if (topDir === "dev-docs") {
    if (subDir && SYNC_DEV_DIRS.includes(subDir)) {
      const restPath = parts.slice(2).join("/");
      return {
        sync: true,
        targetRel: restPath ? subDir + "/" + restPath : subDir,
      };
    }
    return {
      sync: false,
      reason: "dev-docs/" + subDir + " 属于 L2 过程文档，不同步到 Obsidian",
    };
  }

  // dev-examples/ -> 不同步（沙盒）
  if (topDir === "dev-examples") {
    return { sync: false, reason: "dev-examples/ 沙盒目录，不同步" };
  }

  // 其他路径 -> 同步，保持原路径
  return { sync: true, targetRel: rel };
}

// 内容质量过滤：判断文档是否值得存档
function isWorthSyncing(content) {
  if (!content || !content.trim()) {
    return { ok: false, reason: "内容为空" };
  }
  if (content.trim().length < MIN_CONTENT_LENGTH) {
    return { ok: false, reason: "内容过短（<" + MIN_CONTENT_LENGTH + " 字符），可能为占位文件" };
  }
  const stripped = content
    .replace(/{{[^}]+}}/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (stripped.length < MIN_CONTENT_LENGTH / 2) {
    return { ok: false, reason: "内容为模板骨架，无实际内容" };
  }
  const lines = content.trim().split("\n").filter((l) => l.trim());
  if (lines.length < MIN_EFFECTIVE_LINES) {
    return { ok: false, reason: "有效内容不足 " + MIN_EFFECTIVE_LINES + " 行" };
  }
  const nonTodoLines = lines.filter(
    (l) => !/^(TODO|待填充|TBD|占位|placeholder)/i.test(l.trim())
  );
  if (nonTodoLines.length < MIN_EFFECTIVE_LINES) {
    return { ok: false, reason: "内容全为 TODO/占位标记" };
  }
  return { ok: true };
}

// 综合分类：路径规则 + 内容质量
function classifyDocument(absPath, projectRoot) {
  const rel = toRel(absPath, projectRoot);
  if (!rel) return { sync: false, reason: "不在项目根目录范围内" };

  const pathResult = classifyByPath(rel);
  if (!pathResult.sync) {
    return { sync: false, reason: pathResult.reason };
  }

  let content;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    return { sync: false, reason: "读取失败: " + e.message };
  }
  const contentResult = isWorthSyncing(content);
  if (!contentResult.ok) {
    return { sync: false, reason: contentResult.reason };
  }

  return { sync: true, targetRel: pathResult.targetRel };
}

// 仅路径分类（用于删除场景，文件已不存在无法读内容）
function classifyByPathOnly(absPath, projectRoot) {
  const rel = toRel(absPath, projectRoot);
  if (!rel) return { sync: false };
  if (!rel.toLowerCase().endsWith(DOC_EXT)) return { sync: false };
  return classifyByPath(rel);
}

// ===== 同步操作 =====

// 新增 / 修改：读取 -> 分类 -> 复制到 Obsidian
function syncFile(absPath, projectRoot, obsidianRoot) {
  if (!isMdNotExcluded(absPath, projectRoot)) return false;
  if (!fs.existsSync(absPath)) return false;

  const result = classifyDocument(absPath, projectRoot);
  if (!result.sync) {
    log("skip  ", toRel(absPath, projectRoot), "->", result.reason);
    return false;
  }

  const dest = path.join(obsidianRoot, ...result.targetRel.split("/"));
  ensureDirFor(dest);
  fs.copyFileSync(absPath, dest);
  log("sync  ", result.targetRel, "->", dest);
  return true;
}

// 删除：从 Obsidian 移除（仅路径分类，文件已不存在）
function removeFile(absPath, projectRoot, obsidianRoot) {
  const result = classifyByPathOnly(absPath, projectRoot);
  if (!result.sync) return false;
  const dest = path.join(obsidianRoot, ...result.targetRel.split("/"));
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
    log("delete", result.targetRel, "->", dest);
    return true;
  }
  return false;
}

// 从 Bash 命令中尽力提取被删除的 .md 路径
function extractDeletedDocs(command) {
  if (!command) return [];
  if (!/(\brm\b|\bdel\b|Remove-Item)/i.test(command)) return [];
  const files = [];
  const re = /([^\s'";|&<>]+\.md)/gi;
  let m;
  while ((m = re.exec(command)) !== null) {
    files.push(m[1].replace(/^['"]|['"]$/g, ""));
  }
  return files;
}

// 尝试从工具参数中提取文件路径（兼容多种字段名）
function extractFilePath(args) {
  if (!args) return null;
  return args.filePath || args.file_path || args.path || args.file || null;
}

export const SyncDocsPlugin = async ({ directory, worktree }) => {
  const projectRoot = directory || worktree || process.cwd();
  const obsidianRoot = resolveObsidianRoot(projectRoot);

  if (!obsidianRoot) {
    console.error(
      "[文档同步] 无法确定 Obsidian 目标路径。请确保已安装 obsidian CLI（运行 obsidian vault 验证），或设置 OBSIDIAN_DOCS_ROOT 环境变量。插件已加载但跳过同步"
    );
    return {};
  }

  log("插件已加载，项目根:", projectRoot, "目标:", obsidianRoot);

  return {
    "tool.execute.after": async (input, output) => {
      try {
        const tool = (input && input.tool) || "";
        const args = (output && output.args) || {};
        const toolLower = String(tool).toLowerCase();

        // 写入 / 编辑类工具 -> 同步文件
        if (
          toolLower === "write" ||
          toolLower === "edit" ||
          toolLower === "multiedit" ||
          toolLower === "str_replace_editor"
        ) {
          const fp = extractFilePath(args);
          if (fp) syncFile(path.resolve(fp), projectRoot, obsidianRoot);
          return;
        }

        // Bash 类工具 -> 检测删除操作
        if (
          toolLower === "bash" ||
          toolLower === "shell" ||
          toolLower === "terminal"
        ) {
          const cmd = args.command || "";
          for (const f of extractDeletedDocs(cmd)) {
            const abs = path.isAbsolute(f)
              ? f
              : path.resolve(projectRoot, f);
            removeFile(abs, projectRoot, obsidianRoot);
          }
          return;
        }
      } catch (e) {
        console.error("[文档同步] 发生错误:", e.message);
      }
    },
  };
};

export default SyncDocsPlugin;
