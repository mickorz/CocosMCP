/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, computed, onMounted, watch, nextTick } from 'vue';

const panelDataMap = new WeakMap<any, App>();

// 定义工具配置接口
interface ToolConfig {
    category: string;
    name: string;
    enabled: boolean;
    description: string;
}

// 定义配置接口
interface Configuration {
    id: string;
    name: string;
    description: string;
    tools: ToolConfig[];
    createdAt: string;
    updatedAt: string;
}

// 定义服务器设置接口
interface ServerSettings {
    port: number;
    autoStart: boolean;
    debugLog: boolean;
    maxConnections: number;
}

module.exports = Editor.Panel.define({
    listeners: {
        show() { 
            console.log('[MCP Panel] Panel shown'); 
        },
        hide() { 
            console.log('[MCP Panel] Panel hidden'); 
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        panelTitle: '#panelTitle',
    },
    ready() {
        if (this.$.app) {
            const app = createApp({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
            
            // 创建主应用组件
            app.component('McpServerApp', defineComponent({
                setup() {
                    // ==================== i18n 系统 ====================
                    const translations: Record<string, Record<string, string>> = {
                        zh: {
                            // 品牌区
                            brand_name: 'Cocos MCP',
                            brand_slogan: '版本v.0.1',
                            pro_upgrade: '升级为PRO版本',
                            pro_tip: '升级到专业版',
                            // 语言
                            language: '语言',
                            // 标签页
                            tab_server: '服务器',
                            tab_skills: '技能',
                            tab_tools: '工具管理',
                            // 服务器页
                            server_status: '服务器状态',
                            status: '状态',
                            running: '运行中',
                            stopped: '已停止',
                            connections: '连接数',
                            preview_url: '预览地址',
                            preview_not_ready: '预览未就绪',
                            click_to_open: '点击用默认浏览器打开',
                            update_btn: '更新',
                            update_btn_tip: '功能开发中，后续补充',
                            uninstall_btn: '卸载',
                            uninstall_btn_tip: '卸载扩展并清理已安装的 skills 与 .mcp.json',
                            uninstall_confirm: '确定卸载？将清理各平台已安装的 skills 与 .mcp.json，并卸载扩展本身（不可恢复）。',
                            uninstall_failed: '卸载失败，请查看主进程控制台。',
                            uninstall_done: '卸载完成',
                            cancel: '取消',
                            confirm: '确认卸载',
                            uninstall_selected: '卸载选中平台',
                            uninstalling: '卸载中',
                            skill_manager: '技能管理',
                            auto_skills: '自动化生成 SKILL',
                            custom_skills: '自定义 SKILL',
                            open_skill_dir: '打开文件夹',
                            start_server: '启动服务器',
                            stop_server: '停止服务器',
                            server_settings: '服务器设置',
                            port: '端口',
                            auto_start: '自动启动',
                            debug_log: '调试日志',
                            max_connections: '最大连接数',
                            connection_info: '连接信息',
                            http_url: 'HTTP URL',
                            copy: '复制',
                            save_settings: '保存设置',
                            // 工具管理页
                            tool_management: '工具管理',
                            available_tools: '可用工具',
                            tools_count: '个工具',
                            enabled: '启用',
                            disabled: '禁用',
                            select_all: '全选',
                            deselect_all: '取消全选',
                            save_changes: '保存更改',
                            // 工具分类
                            cat_scene: '场景工具',
                            cat_node: '节点工具',
                            cat_component: '组件工具',
                            cat_prefab: '预制体工具',
                            cat_project: '项目工具',
                            cat_debug: '调试工具',
                            cat_preferences: '偏好设置工具',
                            cat_server: '服务器工具',
                            cat_broadcast: '广播工具',
                            cat_sceneView: '场景视图工具',
                            cat_referenceImage: '参考图片工具',
                            cat_assetAdvanced: '高级资源工具',
                            cat_validation: '验证工具',
                            // 技能页
                            skill_generation: '技能生成',
                            last_generated: '上次生成',
                            not_generated: '尚未生成',
                            skill_gen_tip: '一键生成 13 份 Cocos MCP 工作流技能文档(SKILL.md)到 CodeAgents/SkillAutoGenerate，可在该目录二次编辑后再安装。',
                            generate_skills: '生成技能文档',
                            generating: '生成中...',
                            install_options: '安装选项',
                            auto_install: '自动安装(生成后自动安装到勾选平台)',
                            installed: '已安装',
                            not_installed: '未安装',
                            install_to_selected: '安装到选中平台',
                            installing: '安装中...',
                            // MCP 配置
                            mcp_config: 'MCP 配置',
                            mcp_config_tip: '勾选要写入 .mcp.json 的 MCP（cocos mcp = cocos-creator HTTP 服务；chrome mcp = chrome-devtools-mcp 调试浏览器）。点生成后在项目根写出，保留其他 MCP 配置。',
                            mcp_url: 'MCP URL',
                            mcp_config_installed: '已配置',
                            mcp_config_not_installed: '未配置',
                            generate_mcp_config: '生成 .mcp.json',
                            mcp_auto_config: '自动启动(扩展启动时自动生成 .mcp.json)',
                        },
                        en: {
                            // 品牌区
                            brand_name: 'Cocos MCP',
                            brand_slogan: 'Version v.0.1',
                            pro_upgrade: 'Upgrade to PRO',
                            pro_tip: 'Upgrade to Pro',
                            // 语言
                            language: 'Language',
                            // 标签页
                            tab_server: 'Server',
                            tab_skills: 'Skills',
                            tab_tools: 'Tools',
                            // 服务器页
                            server_status: 'Server Status',
                            status: 'Status',
                            running: 'Running',
                            stopped: 'Stopped',
                            connections: 'Connections',
                            preview_url: 'Preview URL',
                            preview_not_ready: 'Preview not ready',
                            click_to_open: 'Click to open in browser',
                            update_btn: 'Update',
                            update_btn_tip: 'Feature in development',
                            uninstall_btn: 'Uninstall',
                            uninstall_btn_tip: 'Uninstall extension and remove installed skills and .mcp.json',
                            uninstall_confirm: 'Confirm uninstall? Removes installed skills and .mcp.json across platforms, and uninstalls the extension (irreversible).',
                            uninstall_failed: 'Uninstall failed, check the main process console.',
                            uninstall_done: 'Uninstall done',
                            cancel: 'Cancel',
                            confirm: 'Confirm Uninstall',
                            uninstall_selected: 'Uninstall Selected',
                            uninstalling: 'Uninstalling',
                            skill_manager: 'Skill Manager',
                            auto_skills: 'Auto-generated Skills',
                            custom_skills: 'Custom Skills',
                            open_skill_dir: 'Open Folder',
                            start_server: 'Start Server',
                            stop_server: 'Stop Server',
                            server_settings: 'Server Settings',
                            port: 'Port',
                            auto_start: 'Auto Start',
                            debug_log: 'Debug Log',
                            max_connections: 'Max Connections',
                            connection_info: 'Connection Info',
                            http_url: 'HTTP URL',
                            copy: 'Copy',
                            save_settings: 'Save Settings',
                            // 工具管理页
                            tool_management: 'Tool Management',
                            available_tools: 'Available Tools',
                            tools_count: 'tools',
                            enabled: 'enabled',
                            disabled: 'disabled',
                            select_all: 'Select All',
                            deselect_all: 'Deselect All',
                            save_changes: 'Save Changes',
                            // 工具分类
                            cat_scene: 'Scene Tools',
                            cat_node: 'Node Tools',
                            cat_component: 'Component Tools',
                            cat_prefab: 'Prefab Tools',
                            cat_project: 'Project Tools',
                            cat_debug: 'Debug Tools',
                            cat_preferences: 'Preferences Tools',
                            cat_server: 'Server Tools',
                            cat_broadcast: 'Broadcast Tools',
                            cat_sceneView: 'Scene View Tools',
                            cat_referenceImage: 'Reference Image Tools',
                            cat_assetAdvanced: 'Asset Advanced Tools',
                            cat_validation: 'Validation Tools',
                            // 技能页
                            skill_generation: 'Skill Generation',
                            last_generated: 'Last Generated',
                            not_generated: 'Not generated yet',
                            skill_gen_tip: 'One-click generate 13 Cocos MCP workflow skill docs (SKILL.md) into CodeAgents/SkillAutoGenerate. Edit them there before installing.',
                            generate_skills: 'Generate Skills',
                            generating: 'Generating...',
                            install_options: 'Install Options',
                            auto_install: 'Auto install (install to selected platforms after generate)',
                            installed: 'Installed',
                            not_installed: 'Not installed',
                            install_to_selected: 'Install to selected',
                            installing: 'Installing...',
                            // MCP config
                            mcp_config: 'MCP Config',
                            mcp_config_tip: 'Check MCPs to write into .mcp.json (cocos mcp = cocos-creator HTTP; chrome mcp = chrome-devtools-mcp). Generates in project root, preserves other MCP configs.',
                            mcp_url: 'MCP URL',
                            mcp_config_installed: 'Configured',
                            mcp_config_not_installed: 'Not configured',
                            generate_mcp_config: 'Generate .mcp.json',
                            mcp_auto_config: 'Auto start (auto-generate .mcp.json on extension load)'
                        }
                    };

                    // 语言状态
                    const currentLanguage = ref(
                        (typeof localStorage !== 'undefined' && localStorage.getItem('cocos-mcp-language')) || 'zh'
                    );

                    const t = (key: string): string => {
                        const dict = translations[currentLanguage.value] || translations['zh'];
                        return dict[key] || key;
                    };

                    const switchLanguage = (lang: string) => {
                        currentLanguage.value = lang;
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem('cocos-mcp-language', lang);
                        }
                    };

                    // ==================== 响应式数据 ====================
                    const activeTab = ref('server');
                    const serverRunning = ref(false);
                    const connectedClients = ref(0);
                    const previewUrl = ref('');
                    const showUninstallConfirm = ref(false);
                    const uninstallMsg = ref('');
                    const uninstallMsgSuccess = ref(true);
                    const httpUrl = ref('');
                    const isProcessing = ref(false);

                    const settings = ref<ServerSettings>({
                        port: 3000,
                        autoStart: false,
                        debugLog: false,
                        maxConnections: 10
                    });

                    const availableTools = ref<ToolConfig[]>([]);
                    const toolCategories = ref<string[]>([]);

                    // 计算属性
                    const statusClass = computed(() => ({
                        'status-running': serverRunning.value,
                        'status-stopped': !serverRunning.value
                    }));
                    
                    const totalTools = computed(() => availableTools.value.length);
                    const enabledTools = computed(() => availableTools.value.filter(t => t.enabled).length);
                    const disabledTools = computed(() => totalTools.value - enabledTools.value);
                    

                    
                    const settingsChanged = ref(false);

                    // 技能安装器数据
                    const skillPlatforms = ref<any[]>([]);
                    const skillAutoInstall = ref(false);
                    const skillLastGenerated = ref('');
                    const skillGenerating = ref(false);
                    const skillInstalling = ref(false);
                    const skillUninstalling = ref(false);
                    const skillMessage = ref('');
                    const skillMessageSuccess = ref(true);
                    const installMessage = ref('');
                    const installMessageSuccess = ref(true);
                    const selectedPlatformCount = computed(() => skillPlatforms.value.filter(p => p.selected).length);

                    // MCP 配置数据
                    const skillMcpConfigExists = ref(false);
                    const mcpEnableCocos = ref(true);
                    const mcpEnableChrome = ref(false);
                    const mcpAutoConfig = ref(false);
                    const mcpConfigGenerating = ref(false);
                    const mcpConfigMessage = ref('');
                    const mcpConfigMessageSuccess = ref(true);
                    
                    // 方法
                    const switchTab = (tabName: string) => {
                        activeTab.value = tabName;
                        if (tabName === 'tools') {
                            loadToolManagerState();
                        } else if (tabName === 'skills') {
                            loadSkillInstallerState();
                        }
                    };
                    
                    const toggleServer = async () => {
                        try {
                            if (serverRunning.value) {
                                await Editor.Message.request('cocos-mcp-server', 'stop-server');
                            } else {
                                // 启动服务器时使用当前面板设置
                                const currentSettings = {
                                    port: settings.value.port,
                                    autoStart: settings.value.autoStart,
                                    enableDebugLog: settings.value.debugLog,
                                    maxConnections: settings.value.maxConnections
                                };
                                await Editor.Message.request('cocos-mcp-server', 'update-settings', currentSettings);
                                await Editor.Message.request('cocos-mcp-server', 'start-server');
                            }
                            console.log('[Vue App] Server toggled');
                        } catch (error) {
                            console.error('[Vue App] Failed to toggle server:', error);
                        }
                    };
                    
                    const saveSettings = async () => {
                        try {
                            // 创建一个简单的对象，避免克隆错误
                            const settingsData = {
                                port: settings.value.port,
                                autoStart: settings.value.autoStart,
                                debugLog: settings.value.debugLog,
                                maxConnections: settings.value.maxConnections
                            };
                            
                            const result = await Editor.Message.request('cocos-mcp-server', 'update-settings', settingsData);
                            console.log('[Vue App] Save settings result:', result);
                            settingsChanged.value = false;
                        } catch (error) {
                            console.error('[Vue App] Failed to save settings:', error);
                        }
                    };
                    
                    // 用默认浏览器打开预览地址（走主进程 shell.openExternal，确保开系统浏览器而非 Electron 窗口）
                    const openPreviewUrl = async () => {
                        if (!previewUrl.value) return;
                        try {
                            await Editor.Message.request('cocos-mcp-server', 'open-external-url', previewUrl.value);
                        } catch (error) {
                            console.error('[Vue App] Failed to open preview url:', error);
                        }
                    };

                    // 用默认浏览器打开 HTTP URL（同 openPreviewUrl，走主进程 shell.openExternal）
                    const openHttpUrl = async () => {
                        if (!httpUrl.value) return;
                        try {
                            await Editor.Message.request('cocos-mcp-server', 'open-external-url', httpUrl.value);
                        } catch (error) {
                            console.error('[Vue App] Failed to open http url:', error);
                        }
                    };

                    // 卸载扩展：打开确认弹窗（不用 window.confirm，Cocos 面板会拦截原生对话框）
                    const uninstallExtension = () => {
                        uninstallMsg.value = '';
                        showUninstallConfirm.value = true;
                    };

                    const cancelUninstall = () => {
                        showUninstallConfirm.value = false;
                    };

                    // 确认卸载：调后端清理 skills/.mcp.json + 卸载扩展，结果显示在顶部提示条
                    const confirmUninstall = async () => {
                        showUninstallConfirm.value = false;
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'uninstall');
                            if (result) {
                                uninstallMsgSuccess.value = !!result.success;
                                uninstallMsg.value = result.message || (result.success ? t('uninstall_done') : t('uninstall_failed'));
                            }
                        } catch (error) {
                            console.error('[Vue App] Failed to uninstall:', error);
                            uninstallMsgSuccess.value = false;
                            uninstallMsg.value = t('uninstall_failed');
                        }
                    };
                    
                    const loadToolManagerState = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'getToolManagerState');
                            if (result && result.success) {
                                // 总是加载后端状态，确保数据是最新的
                                availableTools.value = result.availableTools || [];
                                console.log('[Vue App] Loaded tools:', availableTools.value.length);
                                
                                // 更新工具分类
                                const categories = new Set(availableTools.value.map(tool => tool.category));
                                toolCategories.value = Array.from(categories);
                            }
                        } catch (error) {
                            console.error('[Vue App] Failed to load tool manager state:', error);
                        }
                    };
                    
                    const updateToolStatus = async (category: string, name: string, enabled: boolean) => {
                        try {
                            console.log('[Vue App] updateToolStatus called:', category, name, enabled);
                            
                            // 先更新本地状态
                            const toolIndex = availableTools.value.findIndex(t => t.category === category && t.name === name);
                            if (toolIndex !== -1) {
                                availableTools.value[toolIndex].enabled = enabled;
                                // 强制触发响应式更新
                                availableTools.value = [...availableTools.value];
                                console.log('[Vue App] Local state updated, tool enabled:', availableTools.value[toolIndex].enabled);
                            }
                            
                            // 调用后端更新
                            const result = await Editor.Message.request('cocos-mcp-server', 'updateToolStatus', category, name, enabled);
                            if (!result || !result.success) {
                                // 如果后端更新失败，回滚本地状态
                                if (toolIndex !== -1) {
                                    availableTools.value[toolIndex].enabled = !enabled;
                                    availableTools.value = [...availableTools.value];
                                }
                                console.error('[Vue App] Backend update failed, rolled back local state');
                            } else {
                                console.log('[Vue App] Backend update successful');
                            }
                        } catch (error) {
                            // 如果发生错误，回滚本地状态
                            const toolIndex = availableTools.value.findIndex(t => t.category === category && t.name === name);
                            if (toolIndex !== -1) {
                                availableTools.value[toolIndex].enabled = !enabled;
                                availableTools.value = [...availableTools.value];
                            }
                            console.error('[Vue App] Failed to update tool status:', error);
                        }
                    };
                    
                    const selectAllTools = async () => {
                        try {
                            // 直接更新本地状态，然后保存
                            availableTools.value.forEach(tool => tool.enabled = true);
                            await saveChanges();
                        } catch (error) {
                            console.error('[Vue App] Failed to select all tools:', error);
                        }
                    };
                    
                    const deselectAllTools = async () => {
                        try {
                            // 直接更新本地状态，然后保存
                            availableTools.value.forEach(tool => tool.enabled = false);
                            await saveChanges();
                        } catch (error) {
                            console.error('[Vue App] Failed to deselect all tools:', error);
                        }
                    };
                    
                                        const saveChanges = async () => {
                        try {
                            // 创建普通对象，避免Vue3响应式对象克隆错误
                            const updates = availableTools.value.map(tool => ({
                                category: String(tool.category),
                                name: String(tool.name),
                                enabled: Boolean(tool.enabled)
                            }));
                            
                            console.log('[Vue App] Sending updates:', updates.length, 'tools');
                            
                            const result = await Editor.Message.request('cocos-mcp-server', 'updateToolStatusBatch', updates);
                            
                            if (result && result.success) {
                                console.log('[Vue App] Tool changes saved successfully');
                            }
                        } catch (error) {
                            console.error('[Vue App] Failed to save tool changes:', error);
                        }
                    };
                    

                    
                    const toggleCategoryTools = async (category: string, enabled: boolean) => {
                        try {
                            // 直接更新本地状态，然后保存
                            availableTools.value.forEach(tool => {
                                if (tool.category === category) {
                                    tool.enabled = enabled;
                                }
                            });
                            await saveChanges();
                        } catch (error) {
                            console.error('[Vue App] Failed to toggle category tools:', error);
                        }
                    };
                    
                    const getToolsByCategory = (category: string) => {
                        return availableTools.value.filter(tool => tool.category === category);
                    };
                    
                    const getCategoryDisplayName = (category: string): string => {
                        return t('cat_' + category);
                    };

                    // ===== 技能安装器方法 =====
                    const skillList = ref<{ auto: any[]; custom: any[] }>({ auto: [], custom: [] });

                    // 切换某 skill 勾选（勾选 = 安装时包含）
                    const onToggleSkill = async (name: string, enabled: boolean) => {
                        try {
                            await Editor.Message.request('cocos-mcp-server', 'toggle-skill-enabled', name, enabled);
                            const upd = (arr: any[]) => arr.forEach((s: any) => { if (s.name === name) s.enabled = enabled; });
                            upd(skillList.value.auto);
                            upd(skillList.value.custom);
                            skillList.value = { auto: [...skillList.value.auto], custom: [...skillList.value.custom] };
                        } catch (error) {
                            console.error('[Vue App] 切换 skill 状态失败:', error);
                        }
                    };

                    // 打开 skill 目录（系统文件管理器）
                    const onOpenSkillDir = async (name: string) => {
                        try {
                            await Editor.Message.request('cocos-mcp-server', 'open-skill-dir', name);
                        } catch (error) {
                            console.error('[Vue App] 打开 skill 目录失败:', error);
                        }
                    };

                    const loadSkillInstallerState = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'getSkillInstallerState');
                            if (result && result.success) {
                                skillAutoInstall.value = !!result.autoInstall;
                                skillLastGenerated.value = result.lastGenerated || '';
                                skillPlatforms.value = (result.platforms || []).map((p: any) => ({ ...p }));
                                if (result.mcpConfig) {
                                    skillMcpConfigExists.value = !!result.mcpConfig.exists;
                                    mcpEnableCocos.value = !!result.mcpConfig.enableCocos;
                                    mcpEnableChrome.value = !!result.mcpConfig.enableChrome;
                                    mcpAutoConfig.value = !!result.mcpConfig.autoConfig;
                                }
                            }
                            // 同时刷新技能管理列表（两类 + 勾选状态）
                            try {
                                const list = await Editor.Message.request('cocos-mcp-server', 'list-skills');
                                if (list && list.success) {
                                    skillList.value = { auto: list.auto || [], custom: list.custom || [] };
                                }
                            } catch (e) {
                                console.error('[Vue App] 加载技能列表失败:', e);
                            }
                        } catch (error) {
                            console.error('[Vue App] 加载技能安装器状态失败:', error);
                        }
                    };

                    const saveSkillInstallerSettings = async () => {
                        try {
                            const platformsMap: Record<string, boolean> = {};
                            skillPlatforms.value.forEach(p => { platformsMap[p.key] = p.selected; });
                            await Editor.Message.request('cocos-mcp-server', 'updateSkillInstallerSettings', skillAutoInstall.value, platformsMap);
                        } catch (error) {
                            console.error('[Vue App] 保存技能安装设置失败:', error);
                        }
                    };

                    const onToggleAutoInstall = async (val: boolean) => {
                        skillAutoInstall.value = val;
                        await saveSkillInstallerSettings();
                    };

                    const onTogglePlatform = async (key: string, val: boolean) => {
                        const idx = skillPlatforms.value.findIndex(p => p.key === key);
                        if (idx !== -1) {
                            skillPlatforms.value[idx].selected = val;
                            skillPlatforms.value = [...skillPlatforms.value];
                            await saveSkillInstallerSettings();
                        }
                    };

                    const generateSkills = async () => {
                        skillGenerating.value = true;
                        skillMessage.value = '';
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'generateSkills');
                            if (result) {
                                skillMessageSuccess.value = !!result.success;
                                skillMessage.value = result.message || (result.success ? '生成成功' : '生成失败');
                                if (result.lastGenerated) {
                                    skillLastGenerated.value = result.lastGenerated;
                                }
                                // 生成可能触发自动安装，刷新已安装状态
                                await loadSkillInstallerState();
                            }
                        } catch (error: any) {
                            skillMessageSuccess.value = false;
                            skillMessage.value = '生成失败: ' + (error && error.message ? error.message : error);
                        } finally {
                            skillGenerating.value = false;
                        }
                    };

                    const installSkills = async () => {
                        skillInstalling.value = true;
                        installMessage.value = '';
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'installSkills');
                            if (result) {
                                installMessageSuccess.value = !!result.success;
                                installMessage.value = result.message || (result.success ? '安装成功' : '安装失败');
                                await loadSkillInstallerState();
                            }
                        } catch (error: any) {
                            installMessageSuccess.value = false;
                            installMessage.value = '安装失败: ' + (error && error.message ? error.message : error);
                        } finally {
                            skillInstalling.value = false;
                        }
                    };

                    // 卸载勾选平台的 skills（不动 .mcp.json、不卸载扩展），完事后刷新各平台已装状态
                    const uninstallPlatforms = async () => {
                        skillUninstalling.value = true;
                        installMessage.value = '';
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'uninstall-platforms');
                            if (result) {
                                installMessageSuccess.value = !!result.success;
                                installMessage.value = result.message || (result.success ? '卸载成功' : '卸载失败');
                                await loadSkillInstallerState();
                            }
                        } catch (error: any) {
                            installMessageSuccess.value = false;
                            installMessage.value = '卸载失败: ' + (error && error.message ? error.message : error);
                        } finally {
                            skillUninstalling.value = false;
                        }
                    };

                    const generateMcpConfig = async () => {
                        mcpConfigGenerating.value = true;
                        mcpConfigMessage.value = '';
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'generateMcpConfig');
                            if (result) {
                                mcpConfigMessageSuccess.value = !!result.success;
                                mcpConfigMessage.value = result.message || (result.success ? '生成成功' : '生成失败');
                                await loadSkillInstallerState();
                            }
                        } catch (error: any) {
                            mcpConfigMessageSuccess.value = false;
                            mcpConfigMessage.value = '生成失败: ' + (error && error.message ? error.message : error);
                        } finally {
                            mcpConfigGenerating.value = false;
                        }
                    };

                    const onToggleMcpOption = async (key: 'cocos' | 'chrome' | 'auto', val: boolean) => {
                        if (key === 'cocos') {
                            mcpEnableCocos.value = val;
                        } else if (key === 'chrome') {
                            mcpEnableChrome.value = val;
                        } else {
                            mcpAutoConfig.value = val;
                        }
                        try {
                            await Editor.Message.request('cocos-mcp-server', 'updateMcpConfigSettings', mcpEnableCocos.value, mcpEnableChrome.value, mcpAutoConfig.value);
                        } catch (error) {
                            console.error('[Vue App] 保存 MCP 配置选项失败:', error);
                        }
                    };
                    

                    

                    
                    // 监听设置变化
                    watch(settings, () => {
                        settingsChanged.value = true;
                    }, { deep: true });
                    

                    
                    // 组件挂载时加载数据
                    onMounted(async () => {
                        // 加载工具管理器状态
                        await loadToolManagerState();

                        // 加载技能安装器状态（含 MCP 配置是否存在，供服务器 Tab 的 MCP 配置区块显示）
                        await loadSkillInstallerState();
                        
                        // 从服务器状态获取设置信息
                        try {
                            const serverStatus = await Editor.Message.request('cocos-mcp-server', 'get-server-status');
                            if (serverStatus && serverStatus.settings) {
                                settings.value = {
                                    port: serverStatus.settings.port || 3000,
                                    autoStart: serverStatus.settings.autoStart || false,
                                    debugLog: serverStatus.settings.enableDebugLog || false,
                                    maxConnections: serverStatus.settings.maxConnections || 10
                                };
                                console.log('[Vue App] Server settings loaded from status:', serverStatus.settings);
                            } else if (serverStatus && serverStatus.port) {
                                // 兼容旧版本，只获取端口信息
                                settings.value.port = serverStatus.port;
                                console.log('[Vue App] Port loaded from server status:', serverStatus.port);
                            }
                        } catch (error) {
                            console.error('[Vue App] Failed to get server status:', error);
                            console.log('[Vue App] Using default server settings');
                        }
                        
                        // 定期更新服务器状态
                        setInterval(async () => {
                            try {
                                const result = await Editor.Message.request('cocos-mcp-server', 'get-server-status');
                                if (result) {
                                    serverRunning.value = result.running;
                                    connectedClients.value = result.clients || 0;
                                    previewUrl.value = result.previewUrl || '';
                                    httpUrl.value = result.running ? `http://localhost:${result.port}` : '';
                                    isProcessing.value = false;
                                }
                            } catch (error) {
                                console.error('[Vue App] Failed to get server status:', error);
                            }
                        }, 2000);
                    });
                    
                    return {
                        // i18n
                        currentLanguage,
                        t,
                        switchLanguage,

                        // 数据
                        activeTab,
                        serverRunning,
                        connectedClients,
                        previewUrl,
                        httpUrl,
                        isProcessing,
                        settings,
                        availableTools,
                        toolCategories,
                        settingsChanged,
                        skillPlatforms,
                        skillList,
                        onToggleSkill,
                        onOpenSkillDir,
                        skillAutoInstall,
                        skillLastGenerated,
                        skillGenerating,
                        skillInstalling,
                        skillUninstalling,
                        skillMessage,
                        skillMessageSuccess,
                        installMessage,
                        installMessageSuccess,
                        skillMcpConfigExists,
                        mcpEnableCocos,
                        mcpEnableChrome,
                        mcpAutoConfig,
                        mcpConfigGenerating,
                        mcpConfigMessage,
                        mcpConfigMessageSuccess,

                        // 计算属性
                        statusClass,
                        totalTools,
                        enabledTools,
                        disabledTools,
                        selectedPlatformCount,

                        // 方法
                        switchTab,
                        toggleServer,
                        saveSettings,
                        openPreviewUrl,
                        openHttpUrl,
                        uninstallExtension,
                        cancelUninstall,
                        confirmUninstall,
                        showUninstallConfirm,
                        uninstallMsg,
                        uninstallMsgSuccess,
                        loadToolManagerState,
                        updateToolStatus,
                        selectAllTools,
                        deselectAllTools,
                        saveChanges,
                        toggleCategoryTools,
                        getToolsByCategory,
                        getCategoryDisplayName,
                        loadSkillInstallerState,
                        generateSkills,
                        installSkills,
                        uninstallPlatforms,
                        onToggleAutoInstall,
                        onTogglePlatform,
                        generateMcpConfig,
                        onToggleMcpOption
                    };
                },
                template: readFileSync(join(__dirname, '../../../static/template/vue/mcp-server-app.html'), 'utf-8'),
            }));
            
            app.mount(this.$.app);
            panelDataMap.set(this, app);
            
            console.log('[MCP Panel] Vue3 app mounted successfully');
        }
    },
    beforeClose() { },
    close() {
        const app = panelDataMap.get(this);
        if (app) {
            app.unmount();
        }
    },
});