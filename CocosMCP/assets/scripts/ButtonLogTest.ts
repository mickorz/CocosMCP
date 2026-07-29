import { _decorator, Component, Button } from 'cc';

const { ccclass } = _decorator;

/**
 * ButtonLogTest —— 按钮点击随机日志测试组件（动态注册版）
 *
 * 用途：把本组件挂到带有 Button 组件的节点上（与 Button 同节点），onLoad 时自动监听该按钮点击，
 *       无需在编辑器 Click Events 里手动绑定三要素。每次点击随机打印一个等级
 *       （debug / info / warn / error）的随机日志，用于测试控制台输出与 MCP debug_console 采集。
 *
 * 动态注册流程：
 *   onLoad()
 *     ├─> getComponent(Button)   取同节点的 Button 组件（取不到说明挂错节点，会直接报错暴露）
 *     └─> button.node.on(CLICK, onButtonClicked, this)   注册点击监听
 *   点击按钮
 *     └─> onButtonClicked()
 *           ├─> randomLevel()    随机选一个日志等级
 *           ├─> randomMessage()  组装随机日志内容
 *           └─> printLog()       按等级分发到对应 console 方法
 *   onDestroy()
 *     └─> button.node.off(...)   注销监听，避免泄漏与重复触发
 *
 * 注意：用代码注册后，请勿再在编辑器 Button 的 Click Events 里重复绑定同一方法，
 *       否则一次点击会触发两次日志。
 */
@ccclass('ButtonLogTest')
export class ButtonLogTest extends Component {
    /** 点击计数，用于在日志里区分每一次点击 */
    private clickCount: number = 0;

    /** 同节点上的 Button 组件，onLoad 时取得，onDestroy 时用于注销 */
    private button!: Button;

    /** 可选的日志等级，每次点击从中随机一种 */
    private readonly levels: ReadonlyArray<string> = ['debug', 'info', 'warn', 'error'];

    /** 随机日志内容池，每次点击从中随机一条 */
    private readonly messages: ReadonlyArray<string> = [
        '这是一条测试日志',
        '按钮点击事件已触发',
        '随机日志等级测试',
        '用于验证日志采集',
        '控制台输出检查中',
        'MCP debug_console 联调',
        '请观察控制台输出',
        '日志等级随机切换',
    ];

    protected onLoad(): void {
        // 取同节点上的 Button 组件；若该节点没有 Button 会得到 null，下一行直接报错暴露根因
        this.button = this.getComponent(Button)!;
        this.button.node.on(Button.EventType.CLICK, this.onButtonClicked, this);
    }

    protected onDestroy(): void {
        this.button.node.off(Button.EventType.CLICK, this.onButtonClicked, this);
    }

    /** 点击回调，由动态注册的监听触发 */
    private onButtonClicked(): void {
        this.clickCount++;
        const level = this.randomLevel();
        const message = this.randomMessage(this.clickCount, level);
        this.printLog(level, message);
    }

    /** 从等级列表中随机选一个 */
    private randomLevel(): string {
        const index = Math.floor(Math.random() * this.levels.length);
        return this.levels[index];
    }

    /** 组装一条带等级标签与点击序号的随机日志内容 */
    private randomMessage(count: number, level: string): string {
        const index = Math.floor(Math.random() * this.messages.length);
        return '[' + level + '] 第 ' + count + ' 次点击 -> ' + this.messages[index];
    }

    /** 按等级分发到对应的 console 方法 */
    private printLog(level: string, message: string): void {
        switch (level) {
            case 'debug':
                console.debug(message);
                break;
            case 'info':
                console.info(message);
                break;
            case 'warn':
                console.warn(message);
                break;
            case 'error':
                console.error(message);
                break;
            default:
                console.log(message);
                break;
        }
    }
}
