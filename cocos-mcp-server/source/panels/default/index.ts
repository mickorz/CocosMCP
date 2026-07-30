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
                            brand_slogan: '请勿开源',
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
                        },
                        en: {
                            // 品牌区
                            brand_name: 'Cocos MCP',
                            brand_slogan: 'Open Source Edition',
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
                            installing: 'Installing...'
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
                    const skillMessage = ref('');
                    const skillMessageSuccess = ref(true);
                    const installMessage = ref('');
                    const installMessageSuccess = ref(true);
                    const selectedPlatformCount = computed(() => skillPlatforms.value.filter(p => p.selected).length);
                    
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
                    
                    const copyUrl = async () => {
                        try {
                            await navigator.clipboard.writeText(httpUrl.value);
                            console.log('[Vue App] URL copied to clipboard');
                        } catch (error) {
                            console.error('[Vue App] Failed to copy URL:', error);
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
                    const loadSkillInstallerState = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'getSkillInstallerState');
                            if (result && result.success) {
                                skillAutoInstall.value = !!result.autoInstall;
                                skillLastGenerated.value = result.lastGenerated || '';
                                skillPlatforms.value = (result.platforms || []).map((p: any) => ({ ...p }));
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
                    

                    

                    
                    // 监听设置变化
                    watch(settings, () => {
                        settingsChanged.value = true;
                    }, { deep: true });
                    

                    
                    // 组件挂载时加载数据
                    onMounted(async () => {
                        // 加载工具管理器状态
                        await loadToolManagerState();
                        
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
                        httpUrl,
                        isProcessing,
                        settings,
                        availableTools,
                        toolCategories,
                        settingsChanged,
                        skillPlatforms,
                        skillAutoInstall,
                        skillLastGenerated,
                        skillGenerating,
                        skillInstalling,
                        skillMessage,
                        skillMessageSuccess,
                        installMessage,
                        installMessageSuccess,

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
                        copyUrl,
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
                        onToggleAutoInstall,
                        onTogglePlatform
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