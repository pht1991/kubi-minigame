/**
 * Toast.ts - 全局轻量提示弹窗
 * 单例组件，挂载在 Canvas 下置顶层。调用 Toast.instance?.show(msg) 即可弹出短暂提示。
 * 风格与暖羊皮纸 UI 一致：半透明深棕底 + 暖白文字，自动淡入淡出，不拦截触摸。
 */

import { _decorator, Component, Node, UITransform, UIOpacity, tween, Color } from 'cc';
import { C, S } from './theme';
import { UIShape, UILabel } from './widgets';

const { ccclass } = _decorator;

@ccclass('Toast')
export class Toast extends Component {
    private static _instance: Toast | null = null;
    static get instance(): Toast | null { return Toast._instance; }

    private _label: UILabel | null = null;
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
        const bg = new UIShape('ToastBg').rect(
            W, H,
            new Color(C.panelBg.r, C.panelBg.g, C.panelBg.b, 225),
            S.panelRadius,
            new Color(C.panelBorder.r, C.panelBorder.g, C.panelBorder.b, 200),
            1.5
        );
        bg.mount(this.node);

        // 文字（SHRINK：过长自动缩字而非截断，避免长文案被裁掉）
        const lbl = new UILabel('', {
            size: S.font.body,
            lineHeight: 26,
            color: C.title,
            align: 'center',
            width: W - 48,
            shrink: true,
        });
        lbl.mount(this.node);
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
        this._label.setText(msg);

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
