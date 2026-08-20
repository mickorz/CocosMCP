import { MCPServer } from './mcp-server';
import { readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';
import { SkillInstaller } from './skill-installer';

let mcpServer: MCPServer | null = null;
let toolManager: ToolManager;
let skillInstaller: SkillInstaller;
// 自动打开面板是否已完成（load 延迟打开与 scene:ready 兜底共用，防止切场景时重复打开）
let autoOpened = false;
// scene:ready 闩锁：切场景会重复触发，只记第一次；/health 的 ready 依赖它，
// 重建 MCPServer（改设置）后要把闩锁重新推送给新实例，否则 ready 永远 false
let sceneReady = false;

/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    /**
     * @en Open the MCP server panel
     * @zh 打开 MCP 服务器面板（菜单/消息入口，无视 autoOpened 守卫，用户主动要求必须打开）
     */
    openPanel() {
        // 手动打开同样视为“已打开过”，避免随后的 scene:ready 兜底把它再拉起来
        autoOpened = true;
        Editor.Panel.open('cocos-mcp-server');
    },

    /**
     * @en Scene ready callback: fallback to ensure the panel is visible during editor startup
     * @zh 场景就绪回调：编辑器启动阶段的兜底，确保面板已显示（受 autoOpenPanel 设置控制）
     */
    onSceneReady() {
        // 闩锁只记第一次；同时推送给 MCPServer（/health 的 ready 四项之一）
        if (!sceneReady) {
            sceneReady = true;
            if (mcpServer) {
                mcpServer.updateReadyState({ sceneReady: true });
            }
            console.log('[MCP插件] 场景就绪（scene:ready），工程完全可操作');
        }
        if (!readSettings().autoOpenPanel) {
            return;
        }
        openCocosMcpPanel();
    },

    /**
     * @en Start the MCP server
     * @zh 启动 MCP 服务器
     */
    async startServer() {
        if (mcpServer) {
            // 确保使用最新的工具配置
            const enabledTools = toolManager.getEnabledTools();
            mcpServer.updateEnabledTools(enabledTools);
            await mcpServer.start();
        } else {
            console.warn('[MCP插件] mcpServer 未初始化');
        }
    },

    /**
     * @en Stop the MCP server
     * @zh 停止 MCP 服务器
     */
    async stopServer() {
        if (mcpServer) {
            mcpServer.stop();
        } else {
            console.warn('[MCP插件] mcpServer 未初始化');
        }
    },

    /**
     * @en Get server status
     * @zh 获取服务器状态
     */
    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : readSettings();
        return {
            ...status,
            settings: settings
        };
    },

    /**
     * @en Update server settings
     * @zh 更新服务器设置
     */
    updateSettings(settings: MCPServerSettings) {
        saveSettings(settings);
        if (mcpServer) {
            mcpServer.stop();
        }
        mcpServer = new MCPServer(settings);
        // 重建实例会把 sceneReady 带丢，先补推闩锁再启动，否则 /health 永远卡在 sceneLoading
        mcpServer.updateReadyState({ sceneReady });
        mcpServer.start();
    },

    /**
     * @en Get tools list
     * @zh 获取工具列表
     */
    getToolsList() {
        return mcpServer ? mcpServer.getAvailableTools() : [];
    },

    /**
     * @en Get server settings
     * @zh 获取服务器设置
     */
    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    // 工具管理器相关方法
    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },

    async createToolConfiguration(name: string, description?: string) {
        try {
            const config = toolManager.createConfiguration(name, description);
            return { success: true, id: config.id, config };
        } catch (error: any) {
            throw new Error(`创建配置失败: ${error.message}`);
        }
    },

    async updateToolConfiguration(configId: string, updates: any) {
        try {
            return toolManager.updateConfiguration(configId, updates);
        } catch (error: any) {
            throw new Error(`更新配置失败: ${error.message}`);
        }
    },

    async deleteToolConfiguration(configId: string) {
        try {
            toolManager.deleteConfiguration(configId);
            return { success: true };
        } catch (error: any) {
            throw new Error(`删除配置失败: ${error.message}`);
        }
    },

    async setCurrentToolConfiguration(configId: string) {
        try {
            toolManager.setCurrentConfiguration(configId);
            return { success: true };
        } catch (error: any) {
            throw new Error(`设置当前配置失败: ${error.message}`);
        }
    },

    async updateToolStatus(category: string, toolName: string, enabled: boolean) {
        try {
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('没有当前配置');
            }
            
            toolManager.updateToolStatus(currentConfig.id, category, toolName, enabled);
            
            // 更新MCP服务器的工具列表
            if (mcpServer) {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
            }
            
            return { success: true };
        } catch (error: any) {
            throw new Error(`更新工具状态失败: ${error.message}`);
        }
    },

    async updateToolStatusBatch(updates: any[]) {
        try {
            console.log(`[Main] updateToolStatusBatch called with updates count:`, updates ? updates.length : 0);
            
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('没有当前配置');
            }
            
            toolManager.updateToolStatusBatch(currentConfig.id, updates);
            
            // 更新MCP服务器的工具列表
            if (mcpServer) {
                const enabledTools = toolManager.getEnabledTools();
                mcpServer.updateEnabledTools(enabledTools);
            }
            
            return { success: true };
        } catch (error: any) {
            throw new Error(`批量更新工具状态失败: ${error.message}`);
        }
    },

    async exportToolConfiguration(configId: string) {
        try {
            return { configJson: toolManager.exportConfiguration(configId) };
        } catch (error: any) {
            throw new Error(`导出配置失败: ${error.message}`);
        }
    },

    async importToolConfiguration(configJson: string) {
        try {
            return toolManager.importConfiguration(configJson);
        } catch (error: any) {
            throw new Error(`导入配置失败: ${error.message}`);
        }
    },

    async getEnabledTools() {
        return toolManager.getEnabledTools();
    },

    // 技能安装器相关方法
    async getSkillInstallerState() {
        return skillInstaller.getState();
    },

    async updateSkillInstallerSettings(autoInstall: boolean, platforms: any) {
        try {
            skillInstaller.updateSettings(autoInstall, platforms);
            return { success: true };
        } catch (error: any) {
            throw new Error(`保存技能安装设置失败: ${error.message}`);
        }
    },

    async generateSkills() {
        // 用当前 MCP 端口渲染 SKILL.md 里的 curl 示例
        // 直接读持久化的 settings/mcp-server.json，确保用最新保存的端口（用户在服务器 Tab 改端口并保存后即生效）
        const port = readSettings().port;
        return skillInstaller.generateAndMaybeInstall(port);
    },

    async installSkills() {
        return skillInstaller.installSkills();
    },

    /**
     * @en Uninstall skills from selected platforms only
     * @zh 仅卸载勾选平台的 skills（不动 .mcp.json、不卸载扩展）
     */
    async uninstallPlatforms() {
        return skillInstaller.uninstallPlatforms();
    },

    /**
     * @en List all skills (auto-generated + custom) with enabled state
     * @zh 列出所有技能（自动生成 + 自定义），含勾选状态
     */
    async listSkills() {
        return skillInstaller.listSkills();
    },

    /**
     * @en Toggle a skill's enabled state (enabled = included in install)
     * @zh 切换某 skill 的勾选状态（勾选 = 安装时包含）
     */
    async toggleSkillEnabled(name: string, enabled: boolean) {
        return skillInstaller.toggleSkillEnabled(name, enabled);
    },

    /**
     * @en Open a skill's directory in the system file manager
     * @zh 在系统文件管理器打开某 skill 目录
     */
    async openSkillDir(name: string) {
        return skillInstaller.openSkillDir(name);
    },

    async generateMcpConfig() {
        // 用当前 MCP 端口生成 .mcp.json（直接读持久化配置，确保用最新保存的端口）
        const port = readSettings().port;
        return skillInstaller.generateMcpConfig(port);
    },

    /**
     * @en Generate opencode.json (opencode uses its own config format, not .mcp.json)
     * @zh 生成 opencode.json（opencode 不用 .mcp.json，用自己的 mcp 字段格式）
     */
    async generateOpencodeConfig() {
        const port = readSettings().port;
        return skillInstaller.generateOpencodeConfig(port);
    },

    async updateMcpConfigSettings(enableCocos: boolean, enableChrome: boolean, autoConfig: boolean) {
        try {
            skillInstaller.updateMcpConfigSettings(enableCocos, enableChrome, autoConfig);
            return { success: true };
        } catch (error: any) {
            throw new Error(`保存 MCP 配置选项失败: ${error.message}`);
        }
    },

    /**
     * @en Open an external URL in the default system browser
     * @zh 用默认系统浏览器打开外部 URL（面板按钮点击预览地址时调用）
     */
    async openExternalUrl(url: string) {
        try {
            const electron: any = require('electron');
            const shell = electron && electron.shell;
            if (shell && typeof shell.openExternal === 'function') {
                await shell.openExternal(url);
                return { success: true };
            }
            // 主进程拿不到 electron.shell 时用系统命令兜底
            const { execSync } = require('child_process');
            const cmd = process.platform === 'win32' ? `start "" "${url}"`
                : process.platform === 'darwin' ? `open "${url}"`
                : `xdg-open "${url}"`;
            execSync(cmd, { stdio: 'ignore' });
            return { success: true };
        } catch (e: any) {
            console.error('[MCP插件] 打开外部 URL 失败:', e);
            return { success: false, error: e && e.message ? e.message : String(e) };
        }
    },

    /**
     * @en Uninstall: clean installed skills + .mcp.json, then remove the extension
     * @zh 卸载：清理已安装的 skills 与 .mcp.json，再卸载扩展本身
     */
    async uninstall() {
        const result = skillInstaller.uninstallAll();
        // 卸载扩展本身：best-effort 触发编辑器 uninstall-extension 消息，失败仅记日志（清理已完成）
        try {
            await Editor.Message.request('extension', 'uninstall-extension', 'cocos-mcp-server');
        } catch (e: any) {
            console.log('[MCP插件] 扩展卸载消息:', e && e.message ? e.message : e);
        }
        return result;
    }
};

/**
 * @en Open the CocosMCP panel (idempotent: only auto-opens once per extension load)
 * @zh 打开 CocosMCP 面板（幂等：每次扩展加载只自动打开一次）
 */
function openCocosMcpPanel() {
    if (autoOpened) {
        return;
    }

    autoOpened = true;

    // Editor.Panel.open 返回 Promise，同步 try-catch 捕不到异步拒绝，需挂 catch
    const result = Editor.Panel.open('cocos-mcp-server');
    if (result && typeof result.then === 'function') {
        result.then(() => {
            console.log('[MCP插件] 面板已自动打开');
        }).catch((err: any) => {
            console.error('[MCP插件] 自动打开面板失败:', err);
            // 复位标记，让后续 scene:ready 兜底还能重试
            autoOpened = false;
        });
    } else {
        console.log('[MCP插件] 面板已自动打开');
    }
}

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export function load() {
    console.log('Cocos MCP Server extension loaded');

    // 初始化工具管理器
    toolManager = new ToolManager();

    // 初始化技能安装器
    skillInstaller = new SkillInstaller();

    // 读取设置
    const settings = readSettings();
    mcpServer = new MCPServer(settings);

    // 初始化MCP服务器的工具列表
    const enabledTools = toolManager.getEnabledTools();
    mcpServer.updateEnabledTools(enabledTools);

    // 如果设置了自动启动，则启动服务器
    if (settings.autoStart) {
        mcpServer.start().catch(err => {
            console.error('Failed to auto-start MCP server:', err);
        });
    }

    // 如果设置了自动打开面板，延迟打开（等编辑器主界面与布局恢复完成，避免启动时序竞争）
    if (settings.autoOpenPanel) {
        setTimeout(() => {
            openCocosMcpPanel();
        }, 1000);
    }

    // 若 MCP 配置开启了自动生成，启动时自动写 .mcp.json
    skillInstaller.maybeAutoGenerateMcpConfig(settings.port);
}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export function unload() {
    if (mcpServer) {
        mcpServer.stop();
        mcpServer = null;
    }
    // 重置自动打开标记，扩展热重载后可再次自动打开
    autoOpened = false;
    // 重置场景就绪闩锁，扩展热重载后 scene:ready 可再次触发
    sceneReady = false;
}