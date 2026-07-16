/**
 * Toast.ts - 全局轻量提示弹窗
 * 单例组件，挂载在 Canvas 下置顶层。调用 Toast.instance?.show(msg) 即可弹出短暂提示。
 * 风格与暖羊皮纸 UI 一致：半透明深棕底 + 暖白文字，自动淡入淡出，不拦截触摸。
 */

import { _decorator, Component, Node, Label, UITransform, UIOpacity, tween, Color, Graphics } from 'cc';

const { ccclass } = _decorator;

@ccclass('Toast')
export class Toast extends Component {
    private static _instance: Toast | null = null;
    static get instance(): Toast | null { return Toast._instance; }

    private _label: Label | null = null;
    private _op: UIOpacity | null = null;
    private _tween: any = null;

    onLoad(): void {
        Toast._instance = this;

        // 确保节点有 UITransform（渲染所需）
        let tf = this.node.getComponent(UITransform);
        if (!tf) tf = this.node.addComponent(UITransform);
        tf.setContentSize(620, 64);
        tf.setAnchorPoint(0.5, 0.5);

        const W = 620, H = 64;

        // 背景（暖羊皮纸浅色半透明圆角矩形，与整体 UI 一致）
        const g = this.node.addComponent(Graphics);
        g.fillColor = new Color(255, 248, 240, 225);
        g.roundRect(-W / 2, -H / 2, W, H, 14);
        g.fill();
        g.strokeColor = new Color(200, 168, 130, 200);
        g.lineWidth = 1.5;
        g.roundRect(-W / 2, -H / 2, W, H, 14);
        g.stroke();

        // 文字
        const lblNode = new Node('ToastLabel');
        lblNode.parent = this.node;
        const lblTf = lblNode.addComponent(UITransform);
        lblTf.setContentSize(W - 48, H);
        lblTf.setAnchorPoint(0.5, 0.5);
        const lbl = lblNode.addComponent(Label);
        lbl.string = '';
        lbl.fontSize = 20;
        lbl.lineHeight = 26;
        lbl.color = new Color(92, 61, 30, 255); // 深棕，浅底上清晰可读
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.CLAMP;
        this._label = lbl;

        // 初始透明
        const op = this.node.addComponent(UIOpacity);
        op.opacity = 0;
        this._op = op;
    }

    onDestroy(): void {
        if (Toast._instance === this) Toast._instance = null;
    }

    /**
     * 弹出提示
     * @param msg 文本内容
     * @param duration 停留时长(ms)，默认 900
     */
    show(msg: string, duration: number = 900): void {
        if (!msg || !this._label || !this._op) return;
        this._label.string = msg;

        const op = this._op;
        if (this._tween) this._tween.stop();
        this._tween = tween(op)
            .set({ opacity: 0 })
            .to(0.12, { opacity: 255 }, { easing: 'fade' })
            .delay(duration / 1000)
            .to(0.18, { opacity: 0 })
            .start();
    }
}
