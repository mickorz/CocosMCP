import { ToolDefinition, ToolResponse, ToolExecutor, ProjectInfo } from '../types';

export class ProjectTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return [
            {
                name: 'project_manage',
                description: 'PROJECT MANAGEMENT: Core project operations and configuration. COMMON WORKFLOWS: get_info for project details, run for preview testing, build for deployment preparation, get_settings for configuration inspection. Note: Build operations require manual interaction due to API limitations.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['run', 'build', 'get_info', 'get_settings'],
                            description: 'Project operation: "run" = start preview/testing (requires platform) | "build" = prepare for deployment (requires buildPlatform) | "get_info" = project metadata and paths | "get_settings" = configuration by category (requires category)'
                        },
                        // For run action
                        platform: {
                            type: 'string',
                            enum: ['browser', 'simulator', 'preview'],
                            description: 'Preview platform (run action). "browser" = web preview (most common), "simulator" = device simulation, "preview" = editor preview. Recommended: browser for quick testing.',
                            default: 'browser'
                        },
                        // For run + browser action: 指定要预览的场景
                        scene: {
                            type: 'string',
                            description: '(run + browser 可选) 要预览的场景，Cocos 资源 URL。推荐格式: db://assets/scenes/sss.scene。也兼容 assets 相对路径(如 scenes/sss.scene 或 scenes/sss，会自动补全为 db://assets/...)。省略则预览当前编辑器打开的场景。'
                        },
                        // For build action
                        buildPlatform: {
                            type: 'string',
                            enum: ['web-mobile', 'web-desktop', 'ios', 'android', 'windows', 'mac'],
                            description: 'Target deployment platform (REQUIRED for build action). "web-mobile" = mobile web, "web-desktop" = desktop web, "ios" = iPhone/iPad, "android" = Android devices, "windows" = Windows desktop, "mac" = macOS desktop.'
                        },
                        debug: {
                            type: 'boolean',
                            description: 'Build configuration (build action). true = development build with debug info and source maps (larger size, easier debugging), false = optimized production build (smaller size, harder debugging). Recommended: true for testing.',
                            default: true
                        },
                        // For get_settings action
                        category: {
                            type: 'string',
                            enum: ['general', 'physics', 'render', 'assets'],
                            description: 'Configuration category (get_settings action). "general" = basic project settings, "physics" = physics engine config, "render" = rendering settings, "assets" = asset processing. Default: general for basic info.',
                            default: 'general'
                        }
                    },
                    required: ['action']
                }
            },
            {
                name: 'project_build_system',
                description: 'BUILD SYSTEM: Control build panel, check builder status, and manage preview servers. Use this for build-related operations and preview management.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['get_build_settings', 'open_build_panel', 'check_builder_status'],
                            description: 'Build system action to perform'
                        }
                    },
                    required: ['action']
                }
            }
        ];
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        switch (toolName) {
            case 'project_manage':
                return await this.handleProjectManage(args);
            case 'project_build_system':
                return await this.handleBuildSystem(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    // New consolidated handlers
    private async handleProjectManage(args: any): Promise<ToolResponse> {
        const { action } = args;
        
        switch (action) {
            case 'run':
                return await this.runProject(args.platform, args.scene);
            case 'build':
                return await this.buildProject({ platform: args.buildPlatform, debug: args.debug });
            case 'get_info':
                return await this.getProjectInfo();
            case 'get_settings':
                return await this.getProjectSettings(args.category);
            default:
                return { success: false, error: `Unknown project manage action: ${action}` };
        }
    }

    private async handleBuildSystem(args: any): Promise<ToolResponse> {
        const { action } = args;
        
        switch (action) {
            case 'get_build_settings':
                return await this.getBuildSettings();
            case 'open_build_panel':
                return await this.openBuildPanel();
            case 'check_builder_status':
                return await this.checkBuilderStatus();
            default:
                return { success: false, error: `Unknown build system action: ${action}` };
        }
    }

    // Original implementation methods
    /**
     * 运行项目预览
     *
     * 浏览器预览流程：
     *   runProject(platform, scene?)
     *     ├─ platform != browser → 打开构建面板（回退）
     *     └─ platform == browser
     *          ├─ scene 给定 → db:// URL 或 assets 相对路径，asset-db:query-uuid 取场景 uuid
     *          │    └─ scene:open-scene 切换当前场景(3.7.3 无"不切场景直接预览"消息)
     *          ├─ preview:query-preview-url 取预览地址(失败回退 7456)
     *          └─ shell.openExternal 打开浏览器(失败回退 execSync 系统命令)
     */
    private async runProject(platform: string = 'browser', scene?: string): Promise<ToolResponse> {
        try {
            // 非 browser 平台仍走构建面板（浏览器预览仅支持 browser）
            if (platform !== 'browser') {
                await Editor.Message.request('builder', 'open');
                return {
                    success: true,
                    message: `Build panel opened for platform=${platform}.`,
                    data: {
                        platform,
                        instruction: '浏览器预览仅支持 browser 平台；其它平台请在构建面板手动操作。'
                    }
                };
            }

            // 1. 解析 scene 参数：Cocos 资源 URL(db://...) 或 assets 相对路径 → 场景 uuid
            let sceneUuid: string | undefined;
            if (scene) {
                let dbUrl: string;
                if (scene.startsWith('db://')) {
                    dbUrl = scene;
                } else {
                    // assets 相对路径：反斜杠→正斜杠，去前导斜杠与 assets/ 前缀，补 .scene 扩展
                    let rel = scene.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^assets\//i, '');
                    if (!/\.[a-z0-9]+$/i.test(rel)) {
                        rel = rel + '.scene';
                    }
                    dbUrl = `db://assets/${rel}`;
                }
                try {
                    const uuid: string | null = await Editor.Message.request('asset-db', 'query-uuid', dbUrl);
                    if (!uuid) {
                        return {
                            success: false,
                            error: `找不到场景资源: ${dbUrl}。请确认路径相对于 assets 目录且为 .scene 文件。`,
                            data: { scene, dbUrl }
                        };
                    }
                    sceneUuid = uuid;
                    console.log(`[ProjectTools] 预览指定场景 ${dbUrl} -> uuid=${uuid}`);
                } catch (e: any) {
                    return {
                        success: false,
                        error: `查询场景 uuid 失败: ${e && e.message ? e.message : e}`,
                        data: { scene, dbUrl }
                    };
                }
            }

            // 2. 取预览地址（避免硬编码端口）
            let url = '';
            try {
                url = await Editor.Message.request('preview', 'query-preview-url');
            } catch (e) {
                // query-preview-url 不可用时回退默认端口
            }
            if (!url) {
                url = 'http://localhost:7456';
            }

            // 3. 若指定场景，切换当前场景再预览
            //    3.7.3 没有"不切场景直接预览指定场景"的消息，只能先切换当前编辑场景
            if (sceneUuid) {
                try {
                    await Editor.Message.request('scene', 'open-scene', sceneUuid);
                    // 场景加载需要时间，等待一下再预览
                    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
                } catch (e: any) {
                    console.log(`[ProjectTools] scene:open-scene 失败: ${e && e.message ? e.message : e}`);
                }
            }

            // 4. 打开浏览器（openExternal，失败兜底 execSync 系统命令）
            try {
                const electron: any = require('electron');
                const shell = electron && electron.shell;
                if (shell && typeof shell.openExternal === 'function') {
                    await shell.openExternal(url);
                } else {
                    throw new Error('openExternal unavailable');
                }
            } catch (e) {
                // 主进程拿不到 electron.shell 时，用系统命令兜底
                const { execSync } = require('child_process');
                const cmd = process.platform === 'win32' ? `start "" "${url}"`
                    : process.platform === 'darwin' ? `open "${url}"`
                    : `xdg-open "${url}"`;
                execSync(cmd, { stdio: 'ignore' });
            }

            const msg = sceneUuid
                ? `已预览场景 ${scene} (uuid=${sceneUuid})`
                : `浏览器预览已打开: ${url}`;
            return {
                success: true,
                message: msg,
                data: {
                    platform,
                    url,
                    scene: scene || undefined,
                    sceneUuid
                }
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private async buildProject(args: any): Promise<ToolResponse> {
        const buildOptions = {
            platform: args.platform,
            debug: args.debug !== false,
            sourceMaps: args.debug !== false,
            buildPath: `build/${args.platform}`
        };

        // Note: Builder module only supports 'open' and 'query-worker-ready'
        // Building requires manual interaction through the build panel
        try {
            await Editor.Message.request('builder', 'open');
            return {
                success: true,
                message: `✅ Build panel opened for ${args.platform}. Please configure and start build manually.`,
                data: {
                    platform: args.platform,
                    debug: args.debug,
                    instruction: "Use the build panel to configure and start the build process",
                    buildOptions
                }
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private async getProjectInfo(): Promise<ToolResponse> {
        const info: ProjectInfo = {
            name: Editor.Project.name,
            path: Editor.Project.path,
            uuid: Editor.Project.uuid,
            version: (Editor.Project as any).version || '1.0.0',
            cocosVersion: (Editor as any).versions?.cocos || 'Unknown'
        };

        // Note: 'query-info' API doesn't exist, using 'query-config' instead
        try {
            const additionalInfo: any = await Editor.Message.request('project', 'query-config', 'project');
            if (additionalInfo) {
                Object.assign(info, { config: additionalInfo });
            }
            return {
                success: true,
                message: `✅ Project info retrieved: ${info.name}`,
                data: info
            };
        } catch {
            // Return basic info even if detailed query fails
            return {
                success: true,
                message: `✅ Basic project info retrieved: ${info.name}`,
                data: info
            };
        }
    }

    private async getProjectSettings(category: string = 'general'): Promise<ToolResponse> {
        const configMap: Record<string, string> = {
            general: 'project',
            physics: 'physics',
            render: 'render',
            assets: 'asset-db'
        };

        const configName = configMap[category] || 'project';

        try {
            const settings: any = await Editor.Message.request('project', 'query-config', configName);
            return {
                success: true,
                message: `✅ ${category} settings retrieved successfully`,
                data: {
                    category: category,
                    config: settings
                }
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private async getBuildSettings(): Promise<ToolResponse> {
        try {
            const ready: boolean = await Editor.Message.request('builder', 'query-worker-ready');
            return {
                success: true,
                message: `✅ Build settings status retrieved`,
                data: {
                    builderReady: ready,
                    message: 'Build settings are limited in MCP plugin environment',
                    availableActions: [
                        'Open build panel with project_build_system action "open_build_panel"',
                        'Check builder status with project_build_system action "check_builder_status"'
                    ],
                    limitation: 'Full build configuration requires direct Editor UI access'
                }
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private async openBuildPanel(): Promise<ToolResponse> {
        try {
            await Editor.Message.request('builder', 'open');
            return {
                success: true,
                message: '✅ Build panel opened successfully'
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    private async checkBuilderStatus(): Promise<ToolResponse> {
        try {
            const ready: boolean = await Editor.Message.request('builder', 'query-worker-ready');
            return {
                success: true,
                message: '✅ Builder status checked successfully',
                data: {
                    ready: ready,
                    status: ready ? 'Builder worker is ready' : 'Builder worker is not ready'
                }
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

}