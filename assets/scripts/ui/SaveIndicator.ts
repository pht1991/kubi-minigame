/**
 * SaveIndicator.ts - 常驻角落存档时间指示器
 * 单例组件，挂在 Canvas 下置顶层。监听 SAVE_COMPLETE 事件，
 * 在屏幕右下角常驻显示「保存于 HH:MM」。
 * 不显示「保存中」状态、不做延迟切换——存档是高频低关注度操作，
 * 每次保存只静默刷新时间，避免闪烁跳动干扰玩家。
 */

import { _decorator, Component, Node, UITransform } from 'cc';
import { C } from './theme';
import { UIShape, UILabel } from './widgets';

const { ccclass } = _decorator;

@ccclass('SaveIndicator')
export class SaveIndicator extends Component {
    private static _instance: SaveIndicator | null = null;
    static get instance(): SaveIndicator | null { return SaveIndicator._instance; }

    private _label: UILabel | null = null;
    private _gfx: Graphics | null = null;

    onLoad(): void {
        SaveIndicator._instance = this;

        let tf = this.node.getComponent(UITransform);
        if (!tf) tf = this.node.addComponent(UITransform);
        tf.setContentSize(140, 36);
        tf.setAnchorPoint(0.5, 0.5);

        // 背景小药丸（淡暖白半透明 + 棕描边），低调不抢眼；宽度贴合文字，避免两侧留白过多
        const bg = new UIShape('SavePill').rect(140, 36, C.saveBg, 18, C.saveBorder, 1);
        bg.mount(this.node);
        this._gfx = bg.gfx;

        const lbl = new UILabel('保存于 --:--', { size: 16, color: C.title, align: 'center', width: 130 });
        lbl.mount(this.node);
        this._label = lbl;
    }

    onDestroy(): void {
        if (SaveIndicator._instance === this) SaveIndicator._instance = null;
    }

    /** 设置初始文案（启动时立即显示，无延迟） */
    setInitial(timeStr?: string): void {
        if (!this._label) return;
        this._label.setText(timeStr ? `保存于 ${timeStr}` : '保存于 --:--');
        this._label.setColor(C.title);
        if (this._gfx) this._gfx.fillColor = C.saveBg;
    }

    /** 保存完成：立即静默刷新时间（无「保存中」闪烁、无延迟切换） */
    showSaved(timeStr?: string): void {
        if (!this._label || !timeStr) return; // 失败/无时间则保持原样，不跳动
        this._label.setText(`保存于 ${timeStr}`);
        this._label.setColor(C.title);
        if (this._gfx) this._gfx.fillColor = C.saveBg;
    }
}
