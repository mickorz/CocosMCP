import * as fs from 'fs';
import * as path from 'path';
import { SkillInstallerSettings, SkillPlatformState, SkillPlatformKey, McpConfigSettings, SkillInfo } from './types';

/**
 * 技能安装器 SkillInstaller
 *
 * 生成 Cocos MCP 工作流 SKILL.md 并安装到各 AI 客户端的约定目录
 *
 * 流程：
 *   生成 generateSkills(port)
 *     ├─ 读扩展内置手写模板 static/skill-templates/<name>/SKILL.md（13 份）
 *     ├─ 渲染 {{port}} 占位符为当前 MCP 端口
 *     └─ 写到项目中间目录 CodeAgents/SkillAutoGenerate/<name>/SKILL.md + .last-generated
 *   安装 installSkills()
 *     ├─ 收集技能源：CodeAgents/SkillAutoGenerate（自动生成）+ CodeAgents/SkillCustomers（用户手写，递归）
 *     └─ 递归复制到每个勾选平台的 <项目根>/<平台dir>/<name>/
 *   持久化 settings/skill-installer.json：autoInstall + 平台勾选 + lastGenerated
 */

// 5 个支持平台，目录格式统一为 <项目根>/<dir>/<skillName>/SKILL.md
const SKILL_PLATFORMS: Record<SkillPlatformKey, { label: string; dir: string }> = {
    claude: { label: 'Claude Code', dir: '.claude/skills' },
    gemini: { label: 'Gemini CLI', dir: '.gemini/skills' },
    codex: { label: 'Codex', dir: '.codex/skills' },
    antigravity: { label: 'Antigravity', dir: '.antigravity/skills' },
    opencode: { label: 'opencode', dir: '.opencode/skills' },
};

// 13 个技能名（目录名须与 frontmatter name 一致，小写字母+连字符，遵守 opencode 约束）
const SKILL_NAMES = [
    'cocos-scene', 'cocos-node', 'cocos-component', 'cocos-prefab',
    'cocos-project', 'cocos-debug', 'cocos-preferences', 'cocos-server',
    'cocos-broadcast', 'cocos-sceneview', 'cocos-reference-image',
    'cocos-asset', 'cocos-validation'
];

// SkillCustomers 目录的使用说明（用户手写 skill 区的 README，不会被当成 skill 安装）
const SKILL_CUSTOMERS_README = `# 手写定制技能 (SkillCustomers)

本目录放置你自己手写的 SKILL.md 技能文档。安装时会和自动生成的 SkillAutoGenerate 一起，安装到勾选的平台。

## 目录结构

每个 skill 是一个子目录，里面放 SKILL.md：

    SkillCustomers/
      my-custom-skill          skill 目录名，小写字母加连字符
        SKILL.md               skill 内容
      another-skill
        SKILL.md

支持任意层级嵌套，安装时会递归查找所有含 SKILL.md 的目录。

## SKILL.md 格式

文件开头是 YAML frontmatter，name 必须和目录名一致：

    ---
    name: my-custom-skill
    description: 一句话描述这个 skill 做什么
    ---

    # 标题

    正文内容写在这里。

## 注意

- name 字段必须和目录名一致（opencode 等平台要求）。
- 安装时本目录下所有 skill 会一并复制到各平台的 skills 目录。
- 这个 README.md 不会被当成 skill 安装（安装只收集含 SKILL.md 的目录）。
`;

const DEFAULT_SETTINGS: SkillInstallerSettings = {
    autoInstall: false,
    platforms: { claude: true, gemini: false, codex: false, antigravity: false, opencode: false },
    lastGenerated: '',
    skillEnabled: {}
};

// MCP 配置勾选默认值（cocos mcp 默认开，chrome mcp 默认关）
const DEFAULT_MCP_CONFIG_SETTINGS: McpConfigSettings = {
    enableCocos: true,
    enableChrome: false,
    autoConfig: false
};

// chrome-devtools-mcp 的 stdio 配置（通过 npx 拉起，用于调试浏览器读取游戏日志）
const CHROME_MCP_CONFIG = {
    command: 'npx',
    args: ['chrome-devtools-mcp@latest']
};

export class SkillInstaller {
    private settings: SkillInstallerSettings;
    private mcpConfigSettings: McpConfigSettings;

    constructor() {
        this.settings = this.readSettings();
        this.mcpConfigSettings = this.readMcpConfigSettings();
    }

    // ==================== 持久化 ====================
    private getSettingsPath(): string {
        return path.join(Editor.Project.path, 'settings', 'skill-installer.json');
    }

    private ensureSettingsDir(): void {
        const dir = path.dirname(this.getSettingsPath());
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private readSettings(): SkillInstallerSettings {
        try {
            this.ensureSettingsDir();
            const file = this.getSettingsPath();
            if (fs.existsSync(file)) {
                const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                return {
                    autoInstall: !!parsed.autoInstall,
                    platforms: { ...DEFAULT_SETTINGS.platforms, ...(parsed.platforms || {}) },
                    lastGenerated: parsed.lastGenerated || '',
                    skillEnabled: { ...(parsed.skillEnabled || {}) }
                };
            }
        } catch (e) {
            console.error('[SkillInstaller] 读取设置失败:', e);
        }
        return { ...DEFAULT_SETTINGS, platforms: { ...DEFAULT_SETTINGS.platforms }, skillEnabled: { ...DEFAULT_SETTINGS.skillEnabled } };
    }

    private saveSettings(): void {
        try {
            this.ensureSettingsDir();
            fs.writeFileSync(this.getSettingsPath(), JSON.stringify(this.settings, null, 2));
        } catch (e) {
            console.error('[SkillInstaller] 保存设置失败:', e);
            throw e;
        }
    }

    // ==================== MCP 配置勾选持久化（settings/mcp-config.json）====================
    private getMcpConfigSettingsPath(): string {
        return path.join(Editor.Project.path, 'settings', 'mcp-config.json');
    }

    private readMcpConfigSettings(): McpConfigSettings {
        try {
            this.ensureSettingsDir();
            const file = this.getMcpConfigSettingsPath();
            if (fs.existsSync(file)) {
                const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                return {
                    enableCocos: parsed.enableCocos !== false,
                    enableChrome: !!parsed.enableChrome,
                    autoConfig: !!parsed.autoConfig
                };
            }
        } catch (e) {
            console.error('[SkillInstaller] 读取 MCP 配置设置失败:', e);
        }
        return { ...DEFAULT_MCP_CONFIG_SETTINGS };
    }

    private saveMcpConfigSettings(): void {
        try {
            this.ensureSettingsDir();
            fs.writeFileSync(this.getMcpConfigSettingsPath(), JSON.stringify(this.mcpConfigSettings, null, 2));
        } catch (e) {
            console.error('[SkillInstaller] 保存 MCP 配置设置失败:', e);
        }
    }

    // ==================== 目录定位 ====================
    // 扩展内置手写模板：编译后 __dirname 为 dist/，模板在 ../static/skill-templates
    private getTemplatesDir(): string {
        return path.join(__dirname, '..', 'static', 'skill-templates');
    }

    // 扩展目录内的中间目录（生成产物，用户可在此二次编辑后再安装）
    // 用 __dirname 定位扩展根（与 getTemplatesDir 一致），避免生成物污染游戏项目根
    private getAutoGenerateDir(): string {
        return path.join(__dirname, '..', 'CodeAgents', 'SkillAutoGenerate');
    }

    // 扩展目录内的用户手写定制技能目录（安装时一并收集）
    private getCustomersDir(): string {
        return path.join(__dirname, '..', 'CodeAgents', 'SkillCustomers');
    }

    // ==================== 工具方法 ====================
    private copyDirectory(src: string, dest: string): void {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // 探测某平台是否已安装：该平台 skills 目录下存在任一含 SKILL.md 的子目录即视为已安装
    private isPlatformInstalled(key: SkillPlatformKey): boolean {
        const dir = path.join(Editor.Project.path, SKILL_PLATFORMS[key].dir);
        if (!fs.existsSync(dir)) return false;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            return entries.some(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')));
        } catch {
            return false;
        }
    }

    // ==================== 生成 ====================
    /**
     * 生成 13 份技能文档到 CodeAgents/SkillAutoGenerate
     * @param port 当前 MCP 端口，用于渲染 curl 示例；不传按默认 3001
     */
    public generateSkills(port?: number): { success: boolean; message: string; count: number; lastGenerated: string } {
        try {
            const templatesDir = this.getTemplatesDir();
            const autoDir = this.getAutoGenerateDir();
            const usePort = port || 3001;

            if (!fs.existsSync(templatesDir)) {
                return { success: false, message: `内置技能模板目录不存在: ${templatesDir}`, count: 0, lastGenerated: this.settings.lastGenerated };
            }

            if (!fs.existsSync(autoDir)) {
                fs.mkdirSync(autoDir, { recursive: true });
            }

            let count = 0;
            const missing: string[] = [];
            for (const name of SKILL_NAMES) {
                const tplFile = path.join(templatesDir, name, 'SKILL.md');
                if (!fs.existsSync(tplFile)) {
                    missing.push(name);
                    continue;
                }
                let content = fs.readFileSync(tplFile, 'utf8');
                content = content.replace(/\{\{port\}\}/g, String(usePort));
                const destDir = path.join(autoDir, name);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
                count++;
            }

            // 确保 SkillCustomers 目录存在（用户手写 skill 区），并放一份使用说明
            const custDir = this.getCustomersDir();
            if (!fs.existsSync(custDir)) {
                fs.mkdirSync(custDir, { recursive: true });
            }
            const custReadme = path.join(custDir, 'README.md');
            if (!fs.existsSync(custReadme)) {
                fs.writeFileSync(custReadme, SKILL_CUSTOMERS_README, 'utf8');
            }

            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            fs.writeFileSync(path.join(autoDir, '.last-generated'), ts);
            this.settings.lastGenerated = ts;
            this.saveSettings();

            const tip = missing.length > 0 ? `（缺失模板: ${missing.join(', ')}）` : '';
            return { success: true, message: `已生成 ${count} 份技能文档到 CodeAgents/SkillAutoGenerate${tip}`, count, lastGenerated: ts };
        } catch (e: any) {
            return { success: false, message: `生成失败: ${e && e.message ? e.message : e}`, count: 0, lastGenerated: this.settings.lastGenerated };
        }
    }

    // ==================== 安装 ====================
    /**
     * 收集所有技能源目录：SkillAutoGenerate（一级子目录）+ SkillCustomers（递归查找含 SKILL.md 的目录）
     */
    private collectSkillSources(): string[] {
        const sources: string[] = [];

        const autoDir = this.getAutoGenerateDir();
        if (fs.existsSync(autoDir)) {
            try {
                for (const e of fs.readdirSync(autoDir, { withFileTypes: true })) {
                    if (e.isDirectory() && fs.existsSync(path.join(autoDir, e.name, 'SKILL.md'))) {
                        if (this.settings.skillEnabled[e.name] !== false) {
                            sources.push(path.join(autoDir, e.name));
                        }
                    }
                }
            } catch { /* 忽略 */ }
        }

        const custDir = this.getCustomersDir();
        if (fs.existsSync(custDir)) {
            const walk = (dir: string) => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    if (!e.isDirectory()) continue;
                    const full = path.join(dir, e.name);
                    if (fs.existsSync(path.join(full, 'SKILL.md'))) {
                        if (this.settings.skillEnabled[e.name] !== false) {
                            sources.push(full);
                        }
                    } else {
                        walk(full);
                    }
                }
            };
            walk(custDir);
        }

        return sources;
    }

    /**
     * 列出所有 skill（分自动生成 / 自定义两类），含 frontmatter 解析的 name/description 和勾选状态
     */
    public listSkills(): { success: boolean; auto: SkillInfo[]; custom: SkillInfo[] } {
        const parseFrontmatter = (skillDir: string): { name: string; description: string } => {
            try {
                const file = path.join(skillDir, 'SKILL.md');
                if (!fs.existsSync(file)) return { name: path.basename(skillDir), description: '' };
                const content = fs.readFileSync(file, 'utf8');
                const m = content.match(/^---\s*([\s\S]*?)\s*---/);
                const fm = m ? m[1] : '';
                const name = (fm.match(/^name:\s*(.+)$/m) || [])[1] || path.basename(skillDir);
                const description = (fm.match(/^description:\s*(.+)$/m) || [])[1] || '';
                return { name: name.trim(), description: description.trim() };
            } catch {
                return { name: path.basename(skillDir), description: '' };
            }
        };
        const isEnabled = (n: string) => this.settings.skillEnabled[n] !== false;

        const auto: SkillInfo[] = [];
        const autoDir = this.getAutoGenerateDir();
        if (fs.existsSync(autoDir)) {
            try {
                for (const e of fs.readdirSync(autoDir, { withFileTypes: true })) {
                    if (!e.isDirectory()) continue;
                    const full = path.join(autoDir, e.name);
                    if (!fs.existsSync(path.join(full, 'SKILL.md'))) continue;
                    const { name, description } = parseFrontmatter(full);
                    auto.push({ name, description, dir: full, category: 'auto', enabled: isEnabled(name) });
                }
            } catch { /* 忽略 */ }
        }

        const custom: SkillInfo[] = [];
        const custDir = this.getCustomersDir();
        if (fs.existsSync(custDir)) {
            const walk = (dir: string) => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    if (!e.isDirectory()) continue;
                    const full = path.join(dir, e.name);
                    if (fs.existsSync(path.join(full, 'SKILL.md'))) {
                        const { name, description } = parseFrontmatter(full);
                        custom.push({ name, description, dir: full, category: 'custom', enabled: isEnabled(name) });
                    } else {
                        walk(full);
                    }
                }
            };
            walk(custDir);
        }

        return { success: true, auto, custom };
    }

    /**
     * 切换某 skill 的勾选状态（勾选 = 安装时包含）
     */
    public toggleSkillEnabled(name: string, enabled: boolean): { success: boolean } {
        this.settings.skillEnabled[name] = !!enabled;
        this.saveSettings();
        return { success: true };
    }

    /**
     * 打开某 skill 的目录（系统文件管理器）
     */
    public openSkillDir(name: string): { success: boolean; message: string } {
        const tryFind = (root: string): string | null => {
            if (!fs.existsSync(root)) return null;
            const walk = (dir: string): string | null => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
                for (const e of entries) {
                    if (!e.isDirectory()) continue;
                    const full = path.join(dir, e.name);
                    if (e.name === name && fs.existsSync(path.join(full, 'SKILL.md'))) return full;
                    const sub = walk(full);
                    if (sub) return sub;
                }
                return null;
            };
            return walk(root);
        };
        const dir = tryFind(this.getCustomersDir()) || tryFind(this.getAutoGenerateDir());
        if (!dir) return { success: false, message: `找不到 skill: ${name}` };
        try {
            const electron: any = require('electron');
            const shell = electron && electron.shell;
            if (shell && typeof shell.openPath === 'function') {
                shell.openPath(dir);
            } else {
                const { execSync } = require('child_process');
                const cmd = process.platform === 'win32' ? `explorer "${dir}"`
                    : process.platform === 'darwin' ? `open "${dir}"`
                    : `xdg-open "${dir}"`;
                execSync(cmd, { stdio: 'ignore' });
            }
            return { success: true, message: `已打开 ${name}` };
        } catch (e: any) {
            return { success: false, message: `打开失败: ${e && e.message ? e.message : e}` };
        }
    }

    /**
     * 安装到勾选平台：把每个技能源目录递归复制到各平台 skills 目录
     */
    public installSkills(): { success: boolean; message: string; platforms: SkillPlatformKey[]; skillCount: number } {
        try {
            const sources = this.collectSkillSources();
            if (sources.length === 0) {
                return { success: false, message: '没有可安装的技能文档，请先生成（CodeAgents/SkillAutoGenerate 为空）', platforms: [], skillCount: 0 };
            }

            const selected = (Object.keys(SKILL_PLATFORMS) as SkillPlatformKey[]).filter(k => this.settings.platforms[k]);
            if (selected.length === 0) {
                return { success: false, message: '未勾选任何安装平台', platforms: [], skillCount: sources.length };
            }

            for (const key of selected) {
                const destRoot = path.join(Editor.Project.path, SKILL_PLATFORMS[key].dir);
                if (!fs.existsSync(destRoot)) {
                    fs.mkdirSync(destRoot, { recursive: true });
                }
                for (const src of sources) {
                    this.copyDirectory(src, path.join(destRoot, path.basename(src)));
                }
            }

            const labels = selected.map(k => SKILL_PLATFORMS[k].label).join('、');
            const sourceNames = sources.map(s => path.basename(s)).join(', ');
            return { success: true, message: `已安装 ${sources.length} 份技能到 ${selected.length} 个平台：${labels}（${sourceNames}）`, platforms: selected, skillCount: sources.length };
        } catch (e: any) {
            return { success: false, message: `安装失败: ${e && e.message ? e.message : e}`, platforms: [], skillCount: 0 };
        }
    }

    // ==================== 卸载清理 ====================
    /**
     * 卸载清理：删除本扩展安装到各平台的 skills，并清理 .mcp.json 里本扩展写入的条目
     *
     * 收集的 skill 名 = SKILL_NAMES（13 份自动生成）+ SkillCustomers 源头里的（手写定制），
     * 遍历 5 平台 skills 目录逐个删除；.mcp.json 只删 cocos-creator / chrome-devtools 两条，
     * 删完 mcpServers 为空则整个文件删除，其他 MCP 配置保留。
     */
    public uninstallAll(): { success: boolean; message: string; removedSkills: string[]; mcpJsonHandled: boolean } {
        const removedSkills: string[] = [];

        // 1. 收集本扩展安装的所有 skill 名
        const skillNames = new Set<string>(SKILL_NAMES);
        const custDir = this.getCustomersDir();
        if (fs.existsSync(custDir)) {
            const walk = (dir: string) => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    if (!e.isDirectory()) continue;
                    const full = path.join(dir, e.name);
                    if (fs.existsSync(path.join(full, 'SKILL.md'))) {
                        skillNames.add(e.name);
                    } else {
                        walk(full);
                    }
                }
            };
            walk(custDir);
        }

        // 2. 遍历 5 平台 skills 目录，删除这些 skill 目录
        for (const key of Object.keys(SKILL_PLATFORMS) as SkillPlatformKey[]) {
            const skillsDir = path.join(Editor.Project.path, SKILL_PLATFORMS[key].dir);
            if (!fs.existsSync(skillsDir)) continue;
            for (const name of skillNames) {
                const target = path.join(skillsDir, name);
                if (fs.existsSync(target)) {
                    try {
                        fs.rmSync(target, { recursive: true, force: true });
                        removedSkills.push(`${SKILL_PLATFORMS[key].label}/${name}`);
                    } catch (e) {
                        console.error(`[SkillInstaller] 删除 ${target} 失败:`, e);
                    }
                }
            }
        }

        // 3. 清理 .mcp.json：删 cocos-creator / chrome-devtools 条目，保留其他；空则删文件
        let mcpJsonHandled = false;
        const mcpFile = path.join(Editor.Project.path, '.mcp.json');
        if (fs.existsSync(mcpFile)) {
            try {
                const config = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
                if (config && config.mcpServers && typeof config.mcpServers === 'object') {
                    delete config.mcpServers['cocos-creator'];
                    delete config.mcpServers['chrome-devtools'];
                    const remaining = Object.keys(config.mcpServers);
                    if (remaining.length === 0) {
                        fs.rmSync(mcpFile, { force: true });
                    } else {
                        fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2));
                    }
                    mcpJsonHandled = true;
                }
            } catch (e) {
                console.error('[SkillInstaller] 清理 .mcp.json 失败:', e);
            }
        }

        const tip = mcpJsonHandled ? '，已清理 .mcp.json' : '';
        return {
            success: true,
            message: `已清理 ${removedSkills.length} 个 skill 安装${tip}`,
            removedSkills,
            mcpJsonHandled
        };
    }

    /**
     * 卸载选中平台：只删除当前勾选平台的本扩展 skills，不动 .mcp.json、不卸载扩展本身
     * 与 uninstallAll 的区别：仅限 settings.platforms 勾选的平台，且不清理 .mcp.json、不触发 uninstall-extension
     */
    public uninstallPlatforms(): { success: boolean; message: string; platforms: SkillPlatformKey[]; removedCount: number } {
        const selected = (Object.keys(SKILL_PLATFORMS) as SkillPlatformKey[]).filter(k => this.settings.platforms[k]);
        if (selected.length === 0) {
            return { success: false, message: '未勾选任何平台', platforms: [], removedCount: 0 };
        }

        // 收集本扩展安装的 skill 名（SKILL_NAMES + SkillCustomers 源头）
        const skillNames = new Set<string>(SKILL_NAMES);
        const custDir = this.getCustomersDir();
        if (fs.existsSync(custDir)) {
            const walk = (dir: string) => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    if (!e.isDirectory()) continue;
                    const full = path.join(dir, e.name);
                    if (fs.existsSync(path.join(full, 'SKILL.md'))) {
                        skillNames.add(e.name);
                    } else {
                        walk(full);
                    }
                }
            };
            walk(custDir);
        }

        // 只删勾选平台的这些 skill
        let removedCount = 0;
        for (const key of selected) {
            const skillsDir = path.join(Editor.Project.path, SKILL_PLATFORMS[key].dir);
            if (!fs.existsSync(skillsDir)) continue;
            for (const name of skillNames) {
                const target = path.join(skillsDir, name);
                if (fs.existsSync(target)) {
                    try {
                        fs.rmSync(target, { recursive: true, force: true });
                        removedCount++;
                    } catch (e) {
                        console.error(`[SkillInstaller] 删除 ${target} 失败:`, e);
                    }
                }
            }
        }

        const labels = selected.map(k => SKILL_PLATFORMS[k].label).join('、');
        return { success: true, message: `已从 ${selected.length} 个平台（${labels}）卸载 ${removedCount} 个 skill`, platforms: selected, removedCount };
    }

    // ==================== 编排 ====================
    /**
     * 生成，并在 autoInstall=true 时自动安装
     */
    public generateAndMaybeInstall(port?: number): any {
        const gen = this.generateSkills(port);
        if (gen.success && this.settings.autoInstall) {
            const ins = this.installSkills();
            return { ...gen, autoInstall: ins };
        }
        return gen;
    }

    /**
     * 在项目根生成/更新 .mcp.json，让 AI 客户端(Claude Code/Cursor 等)打开本项目时自动连接 cocos-mcp
     * 智能合并：若 .mcp.json 已存在且含其他 mcpServers，只更新 cocos-creator 条目，保留其余配置
     * @param port MCP 端口（取自 settings/mcp-server.json）
     */
    public generateMcpConfig(port?: number): { success: boolean; message: string; path: string; url: string } {
        try {
            const usePort = port || 3001;
            const mcpFile = path.join(Editor.Project.path, '.mcp.json');
            const url = `http://127.0.0.1:${usePort}/mcp`;
            const enableCocos = this.mcpConfigSettings.enableCocos;
            const enableChrome = this.mcpConfigSettings.enableChrome;

            if (!enableCocos && !enableChrome) {
                return { success: false, message: '请至少勾选一个 MCP（cocos mcp 或 chrome mcp）', path: mcpFile, url };
            }

            // 读现有，保留其他 mcpServers（非 cocos-creator / chrome-devtools 的条目）
            let config: any = { mcpServers: {} };
            let merged = false;
            if (fs.existsSync(mcpFile)) {
                try {
                    const existing = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
                    if (existing && existing.mcpServers && typeof existing.mcpServers === 'object') {
                        config = existing;
                        merged = true;
                    }
                } catch {
                    // 损坏的 json 走全新配置
                }
            }
            if (!config.mcpServers || typeof config.mcpServers !== 'object') {
                config.mcpServers = {};
            }

            // cocos-creator 与 chrome-devtools 这两个 key 完全由勾选决定：勾选则写，不勾则删
            if (enableCocos) {
                config.mcpServers['cocos-creator'] = { type: 'http', url };
            } else {
                delete config.mcpServers['cocos-creator'];
            }
            if (enableChrome) {
                config.mcpServers['chrome-devtools'] = { command: CHROME_MCP_CONFIG.command, args: [...CHROME_MCP_CONFIG.args] };
            } else {
                delete config.mcpServers['chrome-devtools'];
            }

            fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2));
            const enabled: string[] = [];
            if (enableCocos) enabled.push('cocos-creator');
            if (enableChrome) enabled.push('chrome-devtools');
            const tip = merged ? '（已合并，保留其他 MCP 配置）' : '';
            return { success: true, message: `已生成 .mcp.json，包含: ${enabled.join(', ')}${tip}`, path: mcpFile, url };
        } catch (e: any) {
            return { success: false, message: `生成 .mcp.json 失败: ${e && e.message ? e.message : e}`, path: '', url: '' };
        }
    }

    // ==================== 前端状态 ====================
    public getState(): { success: boolean; autoInstall: boolean; platforms: SkillPlatformState[]; lastGenerated: string; mcpConfig: { exists: boolean; enableCocos: boolean; enableChrome: boolean; autoConfig: boolean } } {
        const platforms: SkillPlatformState[] = (Object.keys(SKILL_PLATFORMS) as SkillPlatformKey[]).map(key => ({
            key,
            label: SKILL_PLATFORMS[key].label,
            selected: this.settings.platforms[key],
            installed: this.isPlatformInstalled(key)
        }));
        return {
            success: true,
            autoInstall: this.settings.autoInstall,
            platforms,
            lastGenerated: this.settings.lastGenerated,
            mcpConfig: {
                exists: fs.existsSync(path.join(Editor.Project.path, '.mcp.json')),
                enableCocos: this.mcpConfigSettings.enableCocos,
                enableChrome: this.mcpConfigSettings.enableChrome,
                autoConfig: this.mcpConfigSettings.autoConfig
            }
        };
    }

    public updateSettings(autoInstall: boolean, platforms: Record<string, boolean>): void {
        this.settings.autoInstall = !!autoInstall;
        (Object.keys(SKILL_PLATFORMS) as SkillPlatformKey[]).forEach(key => {
            if (key in platforms) {
                this.settings.platforms[key] = !!platforms[key];
            }
        });
        this.saveSettings();
    }

    // 更新 MCP 配置勾选（cocos mcp / chrome mcp / 自动启动）
    public updateMcpConfigSettings(enableCocos: boolean, enableChrome: boolean, autoConfig: boolean): void {
        this.mcpConfigSettings.enableCocos = !!enableCocos;
        this.mcpConfigSettings.enableChrome = !!enableChrome;
        this.mcpConfigSettings.autoConfig = !!autoConfig;
        this.saveMcpConfigSettings();
    }

    // 启动时若开启自动配置，则自动生成 .mcp.json（静默，失败仅记日志）
    public maybeAutoGenerateMcpConfig(port?: number): boolean {
        if (this.mcpConfigSettings.autoConfig) {
            const result = this.generateMcpConfig(port);
            if (!result.success) {
                console.log('[SkillInstaller] 自动生成 .mcp.json 跳过:', result.message);
            }
            return true;
        }
        return false;
    }
}

export { SKILL_PLATFORMS, SKILL_NAMES };
