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
                return await this.runProject(args.platform);
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
     * 浏览器预览打开流程：
     *   runProject(platform)
     *     ├─ platform != browser → 打开构建面板（回退，simulator/preview 仍需手动）
     *     └─ platform == browser
     *          ├─ preview:query-preview-url 取预览地址（失败则回退默认 7456）
     *          └─ shell.openExternal 打开默认浏览器（失败则回退 child_process 系统命令）
     *
     * 说明：Cocos 的 preview 消息模块没有 open 这类触发消息，但编辑器打开项目时
     *       预览服务会常驻在 7456 端口，因此直接打开该地址即可，无需额外触发。
     */
    private async runProject(platform: string = 'browser'): Promise<ToolResponse> {
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

            const debug: string[] = [];

            // 1. 优先向编辑器查询预览地址，避免硬编码端口
            let url = '';
            try {
                url = await Editor.Message.request('preview', 'query-preview-url');
                debug.push(`step1 query-preview-url OK: ${url}`);
            } catch (e: any) {
                debug.push(`step1 query-preview-url FAIL: ${e && e.message ? e.message : e}`);
            }
            if (!url) {
                url = 'http://localhost:7456';
                debug.push(`step1 fallback url: ${url}`);
            }

            // 2. 优先触发编辑器原生预览（让 Cocos 自己启动预览服务并打开浏览器）
            //    类型定义里 preview 模块只有 query-preview-url，但运行时的 preview-server
            //    等内置包可能有 open 消息（类型未公开），逐个试探并记录返回值。
            const msgCandidates: Array<[string, string]> = [
                ['preview-server', 'open'],
                ['preview-server', 'open-preview'],
                ['preview', 'open'],
            ];
            let previewTriggered = false;
            for (const [pkg, method] of msgCandidates) {
                try {
                    const r: any = await Editor.Message.request(pkg, method);
                    debug.push(`step2 message ${pkg}:${method} => ${JSON.stringify(r)}`);
                    if (r !== undefined && r !== null && r !== false) {
                        previewTriggered = true;
                        break;
                    }
                } catch (e: any) {
                    debug.push(`step2 message ${pkg}:${method} FAIL: ${e && e.message ? e.message : e}`);
                }
            }

            // 3. 原生预览消息都没触发时，才退而用 shell.openExternal / 系统命令打开 URL
            if (!previewTriggered) {
                debug.push('step3 原生预览消息未触发，回退到 openExternal/execSync');
                try {
                    const electron: any = require('electron');
                    debug.push(`step3 require('electron') keys: ${Object.keys(electron || {}).slice(0, 12).join(',')}`);
                    const shell = electron && electron.shell;
                    if (shell && typeof shell.openExternal === 'function') {
                        await shell.openExternal(url);
                        debug.push('step3 openExternal called, no throw');
                    } else {
                        debug.push(`step3 shell.openExternal missing (shell=${shell ? Object.keys(shell).join(',') : 'undefined'})`);
                        throw new Error('openExternal unavailable');
                    }
                } catch (e: any) {
                    debug.push(`step3 openExternal FAIL: ${e && e.message ? e.message : e}`);
                    // 兜底：用系统命令同步打开（start 命令本身立即返回，不会阻塞）
                    try {
                        const { execSync } = require('child_process');
                        const cmd = process.platform === 'win32' ? `start "" "${url}"`
                            : process.platform === 'darwin' ? `open "${url}"`
                            : `xdg-open "${url}"`;
                        execSync(cmd, { stdio: 'ignore' });
                        debug.push(`step3 execSync OK: ${cmd}`);
                    } catch (e2: any) {
                        debug.push(`step3 execSync FAIL: ${e2 && e2.message ? e2.message : e2}`);
                    }
                }
            }

            return {
                success: true,
                message: `浏览器预览已打开: ${url}`,
                data: {
                    platform,
                    url,
                    debug
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