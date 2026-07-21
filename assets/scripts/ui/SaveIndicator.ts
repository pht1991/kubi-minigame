/**
 * SaveIndicator.ts - 常驻角落存档时间指示器
 * 单例组件，挂在 Canvas 下置顶层。监听 SAVE_COMPLETE 事件，
 * 在屏幕右下角常驻显示「保存于 HH:MM」。
 * 不显示「保存中」状态、不做延迟切换——存档是高频低关注度操作，
 * 每次保存只静默刷新时间，避免闪烁跳动干扰玩家。
 */

import { _decorator, Component, Node, Label, UITransform, Graphics } from 'cc';
import { C } from './theme';

const { ccclass } = _decorator;

@ccclass('SaveIndicator')
export class SaveIndicator extends Component {
    private static _instance: SaveIndicator | null = null;
    static get instance(): SaveIndicator | null { return SaveIndicator._instance; }

    private _label: Label | null = null;
    private _gfx: Graphics | null = null;

    onLoad(): void {
        SaveIndicator._instance = this;

        let tf = this.node.getComponent(UITransform);
        if (!tf) tf = this.node.addComponent(UITransform);
        tf.setContentSize(140, 36);
        tf.setAnchorPoint(0.5, 0.5);

        // 背景小药丸（淡暖白半透明 + 棕描边），低调不抢眼；宽度贴合文字，避免两侧留白过多
        const g = this.node.addComponent(Graphics);
        g.fillColor = C.saveBg;
        g.roundRect(-70, -18, 140, 36, 18);
        g.fill();
        g.strokeColor = C.saveBorder;
        g.lineWidth = 1;
        g.roundRect(-70, -18, 140, 36, 18);
        g.stroke();
        this._gfx = g;

        const lblNode = new Node('SaveLabel');
        lblNode.parent = this.node;
        const lblTf = lblNode.addComponent(UITransform);
        lblTf.setContentSize(130, 32);
        lblTf.setAnchorPoint(0.5, 0.5);
        const lbl = lblNode.addComponent(Label);
        lbl.string = '保存于 --:--';
        lbl.fontSize = 16;
        lbl.lineHeight = 20;
        lbl.color = C.title; // 深棕：完成态
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.CLAMP;
        this._label = lbl;
    }

    onDestroy(): void {
        if (SaveIndicator._instance === this) SaveIndicator._instance = null;
    }

    /** 设置初始文案（启动时立即显示，无延迟） */
    setInitial(timeStr?: string): void {
        if (!this._label) return;
        this._label.string = timeStr ? `保存于 ${timeStr}` : '保存于 --:--';
        this._label.color = C.title;
        if (this._gfx) this._gfx.fillColor = C.saveBg;
    }

    /** 保存完成：立即静默刷新时间（无「保存中」闪烁、无延迟切换） */
    showSaved(timeStr?: string): void {
        if (!this._label || !timeStr) return; // 失败/无时间则保持原样，不跳动
        this._label.string = `保存于 ${timeStr}`;
        this._label.color = C.title;
        if (this._gfx) this._gfx.fillColor = C.saveBg;
    }
}
