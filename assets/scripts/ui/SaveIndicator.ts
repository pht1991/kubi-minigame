/**
 * SaveIndicator.ts - 常驻角落存档状态指示器
 * 单例组件，挂在 Canvas 下置顶层。监听 SAVE_START / SAVE_COMPLETE 事件，
 * 在屏幕角落常驻显示「保存中…」↔「已保存 · HH:MM」的状态切换。
 * 相比 Toast 弹窗，它不抢眼、不闪、不遮挡操作，适合自动存档这类高频低关注度的反馈。
 */

import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';

const { ccclass } = _decorator;

@ccclass('SaveIndicator')
export class SaveIndicator extends Component {
    private static _instance: SaveIndicator | null = null;
    static get instance(): SaveIndicator | null { return SaveIndicator._instance; }

    private _label: Label | null = null;
    private _gfx: Graphics | null = null;
    private _savedCb: (() => void) | null = null;

    onLoad(): void {
        SaveIndicator._instance = this;

        let tf = this.node.getComponent(UITransform);
        if (!tf) tf = this.node.addComponent(UITransform);
        tf.setContentSize(190, 36);
        tf.setAnchorPoint(0.5, 0.5);

        // 背景小药丸（淡暖白半透明 + 棕描边），低调不抢眼
        const g = this.node.addComponent(Graphics);
        g.fillColor = new Color(255, 248, 240, 150);
        g.roundRect(-95, -18, 190, 36, 18);
        g.fill();
        g.strokeColor = new Color(200, 168, 130, 180);
        g.lineWidth = 1;
        g.roundRect(-95, -18, 190, 36, 18);
        g.stroke();
        this._gfx = g;

        const lblNode = new Node('SaveLabel');
        lblNode.parent = this.node;
        const lblTf = lblNode.addComponent(UITransform);
        lblTf.setContentSize(180, 32);
        lblTf.setAnchorPoint(0.5, 0.5);
        const lbl = lblNode.addComponent(Label);
        lbl.string = '已保存';
        lbl.fontSize = 16;
        lbl.lineHeight = 20;
        lbl.color = new Color(92, 61, 30, 255); // 深棕：完成态
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.CLAMP;
        this._label = lbl;
    }

    onDestroy(): void {
        if (SaveIndicator._instance === this) SaveIndicator._instance = null;
    }

    /** 设置初始文案（启动时立即显示，无延迟） */
    setInitial(text: string): void {
        if (!this._label) return;
        if (this._savedCb) { this.unschedule(this._savedCb); this._savedCb = null; }
        this._label.string = text;
        this._label.color = new Color(92, 61, 30, 255);
        if (this._gfx) this._gfx.fillColor = new Color(255, 248, 240, 150);
    }

    /** 正在保存：琥珀色「保存中…」 */
    showSaving(): void {
        if (!this._label) return;
        if (this._savedCb) { this.unschedule(this._savedCb); this._savedCb = null; }
        this._label.string = '保存中…';
        this._label.color = new Color(180, 120, 40, 255);
        if (this._gfx) this._gfx.fillColor = new Color(255, 240, 210, 175);
    }

    /** 保存完成：0.5s 后切回「已保存 · HH:MM」（让「保存中」可见） */
    showSaved(timeStr?: string, ok: boolean = true): void {
        if (!this._label) return;
        const text = ok ? (timeStr ? `已保存 · ${timeStr}` : '已保存') : '保存失败';
        const cb = () => {
            if (!this._label) return;
            this._label.string = text;
            this._label.color = ok ? new Color(92, 61, 30, 255) : new Color(160, 50, 40, 255);
            if (this._gfx) this._gfx.fillColor = new Color(255, 248, 240, 150);
            this._savedCb = null;
        };
        this._savedCb = cb;
        this.scheduleOnce(cb, 0.5);
    }
}
