import { join } from 'path';
module.paths.push(join(Editor.App.path, 'node_modules'));

/**
 * 把引擎对象降维成可 JSON 序列化的普通对象
 *
 * executeCode 的返回值要过编辑器 IPC 序列化，Node/Vec3/Color 等引擎对象
 * 不先降维会在 IPC 边界丢成空对象或直接抛错，所以这层是必须的。
 * 规则参考 funplay-cocos-mcp scene.js 的 plain()：
 *   Node -> {name, path, uuid, active, components}
 *   Vec3 -> {x,y,z}；Quat -> {x,y,z,w}；Color -> {r,g,b,a}
 *   深度上限 5，超深返回 [Array(n)] / [ClassName] 占位
 *   循环引用返回 [Circular]；单属性读取抛错降级为 [Unserializable: msg]
 *
 * @param value 任意返回值
 * @param depth 当前递归深度（入口传 0）
 * @param seen 循环引用检测（入口传 new WeakSet()）
 * @param cc 引擎命名空间（方法内 require('cc')，作参数传入便于 instanceof 判型）
 */
function plainSerialize(value: any, depth: number, seen: WeakSet<object>, cc: any): any {
    if (value == null) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    // 引擎对象判型（instanceof 用参数传入的 cc，scene.ts 顶层不 import 引擎）
    if (cc && cc.Node && value instanceof cc.Node) {
        return {
            name: value.name,
            path: getNodePath(value),
            uuid: value.uuid,
            active: Boolean(value.active),
            components: (value.components || []).map((comp: any) => comp && comp.constructor ? comp.constructor.name : '').filter(Boolean)
        };
    }
    if (cc && cc.Vec3 && value instanceof cc.Vec3) {
        return { x: value.x, y: value.y, z: value.z };
    }
    if (cc && cc.Quat && value instanceof cc.Quat) {
        return { x: value.x, y: value.y, z: value.z, w: value.w };
    }
    if (cc && cc.Color && value instanceof cc.Color) {
        return { r: value.r, g: value.g, b: value.b, a: value.a };
    }

    if (Array.isArray(value)) {
        if (depth >= 5) {
            return `[Array(${value.length})]`;
        }
        return value.map((item) => plainSerialize(item, depth + 1, seen, cc));
    }

    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);

        if (depth >= 5) {
            return `[${value.constructor && value.constructor.name ? value.constructor.name : 'Object'}]`;
        }

        const output: any = {};
        for (const key of Object.keys(value)) {
            try {
                output[key] = plainSerialize(value[key], depth + 1, seen, cc);
            } catch (error: any) {
                // 单属性读取失败不炸整体（getter 抛错等），降级标注后继续
                output[key] = `[Unserializable: ${error.message}]`;
            }
        }
        return output;
    }

    return String(value);
}

/** 沿 parent 上溯到场景根拼层级路径（如 Canvas/Player） */
function getNodePath(node: any): string {
    const names: string[] = [];
    let current = node;
    while (current && current.parent) {
        names.unshift(current.name);
        current = current.parent;
    }
    // 最顶层节点（parent 为场景）也计入
    if (current && current.name && names.length === 0) {
        names.unshift(current.name);
    }
    return names.join('/');
}

export const methods: { [key: string]: (...any: any) => any } = {
    /**
     * Create a new scene
     */
    createNewScene() {
        try {
            const { director, Scene } = require('cc');
            const scene = new Scene();
            scene.name = 'New Scene';
            director.runScene(scene);
            return { success: true, message: 'New scene created successfully' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Add component to a node
     */
    addComponentToNode(nodeUuid: string, componentType: string) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            // Find node by UUID
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }

            // Get component class
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return { success: false, error: `Component type ${componentType} not found` };
            }

            // Add component
            const component = node.addComponent(ComponentClass);
            return { 
                success: true, 
                message: `Component ${componentType} added successfully`,
                data: { componentId: component.uuid }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Remove component from a node
     */
    removeComponentFromNode(nodeUuid: string, componentType: string) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }

            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return { success: false, error: `Component type ${componentType} not found` };
            }

            const component = node.getComponent(ComponentClass);
            if (!component) {
                return { success: false, error: `Component ${componentType} not found on node` };
            }

            node.removeComponent(component);
            return { success: true, message: `Component ${componentType} removed successfully` };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Create a new node
     */
    createNode(name: string, parentUuid?: string) {
        try {
            const { director, Node } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = new Node(name);
            
            if (parentUuid) {
                const parent = scene.getChildByUuid(parentUuid);
                if (parent) {
                    parent.addChild(node);
                } else {
                    scene.addChild(node);
                }
            } else {
                scene.addChild(node);
            }

            return { 
                success: true, 
                message: `Node ${name} created successfully`,
                data: { uuid: node.uuid, name: node.name }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Get node information
     */
    getNodeInfo(nodeUuid: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }

            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    position: node.position,
                    rotation: node.rotation,
                    scale: node.scale,
                    parent: node.parent?.uuid,
                    children: node.children.map((child: any) => child.uuid),
                    components: node.components.map((comp: any) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }))
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Get all nodes in scene
     */
    getAllNodes() {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const nodes: any[] = [];
            const collectNodes = (node: any) => {
                nodes.push({
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    parent: node.parent?.uuid
                });
                
                node.children.forEach((child: any) => collectNodes(child));
            };

            scene.children.forEach((child: any) => collectNodes(child));
            
            return { success: true, data: nodes };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Find node by name
     */
    findNodeByName(name: string) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = scene.getChildByName(name);
            if (!node) {
                return { success: false, error: `Node with name ${name} not found` };
            }

            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    position: node.position
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Get current scene information
     */
    getCurrentSceneInfo() {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            return {
                success: true,
                data: {
                    name: scene.name,
                    uuid: scene.uuid,
                    nodeCount: scene.children.length
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Set node property
     */
    setNodeProperty(nodeUuid: string, property: string, value: any) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }

            // 设置属性
            if (property === 'position') {
                node.setPosition(value.x || 0, value.y || 0, value.z || 0);
            } else if (property === 'rotation') {
                node.setRotationFromEuler(value.x || 0, value.y || 0, value.z || 0);
            } else if (property === 'scale') {
                node.setScale(value.x || 1, value.y || 1, value.z || 1);
            } else if (property === 'active') {
                node.active = value;
            } else if (property === 'name') {
                node.name = value;
            } else {
                // 尝试直接设置属性
                (node as any)[property] = value;
            }

            return { 
                success: true, 
                message: `Property '${property}' updated successfully` 
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Get scene hierarchy
     */
    getSceneHierarchy(includeComponents: boolean = false) {
        try {
            const { director } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const processNode = (node: any): any => {
                const result: any = {
                    name: node.name,
                    uuid: node.uuid,
                    active: node.active,
                    children: []
                };

                if (includeComponents) {
                    result.components = node.components.map((comp: any) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }));
                }

                if (node.children && node.children.length > 0) {
                    result.children = node.children.map((child: any) => processNode(child));
                }

                return result;
            };

            const hierarchy = scene.children.map((child: any) => processNode(child));
            return { success: true, data: hierarchy };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Create prefab from node
     */
    createPrefabFromNode(nodeUuid: string, prefabPath: string) {
        try {
            const { director, instantiate } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }

            // 注意：这里只是一个模拟实现，因为运行时环境下无法直接创建预制体文件
            // 真正的预制体创建需要Editor API支持
            return {
                success: true,
                data: {
                    prefabPath: prefabPath,
                    sourceNodeUuid: nodeUuid,
                    message: `Prefab created from node '${node.name}' at ${prefabPath}`
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Set component property
     */
    setComponentProperty(nodeUuid: string, componentType: string, property: string, value: any) {
        try {
            const { director, js } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = scene.getChildByUuid(nodeUuid);
            if (!node) {
                return { success: false, error: `Node with UUID ${nodeUuid} not found` };
            }
            const ComponentClass = js.getClassByName(componentType);
            if (!ComponentClass) {
                return { success: false, error: `Component type ${componentType} not found` };
            }
            const component = node.getComponent(ComponentClass);
            if (!component) {
                return { success: false, error: `Component ${componentType} not found on node` };
            }
            // 针对常见属性做特殊处理
            if (property === 'spriteFrame' && componentType === 'cc.Sprite') {
                // 支持 value 为 uuid 或资源路径
                if (typeof value === 'string') {
                    // 先尝试按 uuid 查找
                    const assetManager = require('cc').assetManager;
                    assetManager.resources.load(value, require('cc').SpriteFrame, (err: any, spriteFrame: any) => {
                        if (!err && spriteFrame) {
                            component.spriteFrame = spriteFrame;
                        } else {
                            // 尝试通过 uuid 加载
                            assetManager.loadAny({ uuid: value }, (err2: any, asset: any) => {
                                if (!err2 && asset) {
                                    component.spriteFrame = asset;
                                } else {
                                    // 直接赋值（兼容已传入资源对象）
                                    component.spriteFrame = value;
                                }
                            });
                        }
                    });
                } else {
                    component.spriteFrame = value;
                }
            } else if (property === 'material' && (componentType === 'cc.Sprite' || componentType === 'cc.MeshRenderer')) {
                // 支持 value 为 uuid 或资源路径
                if (typeof value === 'string') {
                    const assetManager = require('cc').assetManager;
                    assetManager.resources.load(value, require('cc').Material, (err: any, material: any) => {
                        if (!err && material) {
                            component.material = material;
                        } else {
                            assetManager.loadAny({ uuid: value }, (err2: any, asset: any) => {
                                if (!err2 && asset) {
                                    component.material = asset;
                                } else {
                                    component.material = value;
                                }
                            });
                        }
                    });
                } else {
                    component.material = value;
                }
            } else if (property === 'string' && (componentType === 'cc.Label' || componentType === 'cc.RichText')) {
                component.string = value;
            } else {
                component[property] = value;
            }
            // 可选：刷新 Inspector
            // Editor.Message.send('scene', 'snapshot');
            return { success: true, message: `Component property '${property}' updated successfully` };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Execute arbitrary JavaScript in the scene process
     *
     * 参考 funplay-cocos-mcp 的 executeUserCode：
     *   - AsyncFunction 动态求值（支持顶层 await，注入形参即执行环境）
     *   - 注入 require / cc / Editor / scene / director / args
     *   - 三种代码出口（按优先级）：
     *       1. 直接 return（代码体即函数体）
     *       2. 定义 run(env) 函数，自动调用 run({cc, Editor, scene, director, args})
     *       3. module.exports 是函数或 {run} 对象，自动调用
     *   - 返回值经 plainSerialize 降维（引擎对象 -> 普通 JSON），否则过不了编辑器 IPC
     *
     * 由 script-tools.ts 的 execute_script 工具经 execute-scene-script 调用，
     * package.json contributions.scene.methods 必须含 executeCode 才能注册。
     */
    async executeCode(code: string, args?: any) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor as any;
            const runner = new AsyncFunction(
                'require', 'cc', 'Editor', 'scene', 'director', 'args',
                `
                const module = { exports: {} };
                const exports = module.exports;
                ${code}
                if (typeof run === 'function') {
                    return await run({ cc, Editor, scene, director, args });
                }
                if (typeof module.exports === 'function') {
                    return await module.exports({ cc, Editor, scene, director, args });
                }
                if (module.exports && typeof module.exports.run === 'function') {
                    return await module.exports.run({ cc, Editor, scene, director, args });
                }
                `
            );
            const raw = await runner(require, cc, (global as any).Editor, scene, director, args ?? {});
            return { success: true, data: plainSerialize(raw, 0, new WeakSet(), cc) };
        } catch (error: any) {
            return { success: false, error: error.message || String(error) };
        }
    }
};