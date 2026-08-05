import { MCPServer } from './mcp-server';
import { readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';
import { SkillInstaller } from './skill-installer';

let mcpServer: MCPServer | null = null;
let toolManager: ToolManager;
let skillInstaller: SkillInstaller;

/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
    /**
     * @en Open the MCP server panel
     * @zh 打开 MCP 服务器面板
     */
    openPanel() {
        Editor.Panel.open('cocos-mcp-server');
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
            mcpServer = new MCPServer(settings);
            mcpServer.start();
        } else {
            mcpServer = new MCPServer(settings);
            mcpServer.start();
        }
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

    async generateMcpConfig() {
        // 用当前 MCP 端口生成 .mcp.json（直接读持久化配置，确保用最新保存的端口）
        const port = readSettings().port;
        return skillInstaller.generateMcpConfig(port);
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
}