/**
 * UIButton.ts - 按钮原子组件（背景 + 文字 + 点击 + 禁用）
 *
 * 结构：UINode(node) → UIShape(背景, 子节点) + UILabel(文字, 子节点)
 * node 自身无 Graphics，故挂 Label 安全（不违反同节点冲突铁律）。
 * 点击自带 stopPropagation，避免穿透到遮罩/面板。
 */

import { NodeEventType, EventTouch, Graphics, Color } from 'cc';
import { UINode } from './UINode';
import { UIShape } from './UIShape';
import { UILabel } from './UILabel';
import { BtnStyle, C } from '../theme';

export class UIButton extends UINode {
    private _bg: UIShape;
    private _label: UILabel;
    private _style: BtnStyle;
    private _enabled = true;
    private _onClick?: () => void;
    private _hovering = false;
    private _pressing = false;

    constructor(text: string, style: BtnStyle, onClick?: () => void, w = 150, h = 52) {
        super('Btn');
        this._style = style;
        this._onClick = onClick;

        this._bg = new UIShape('Bg').rect(w, h, style.bg, style.radius, style.border, style.borderW, false, true);
        this._label = new UILabel(text, {
            size: style.fontSize ?? 22, color: style.text, align: 'center', bold: true, width: w - 12,
        });
        this.add(this._bg, this._label);
        this.size(w, h);

        // 点击（TOUCH 覆盖触屏 + Cocos 鼠标模拟）
        this.node.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (this._enabled) this._onClick?.();
        });

        // 桌面态：悬停 / 按下 / 焦点（pointer 事件仅桌面鼠标触发；触屏不触发 hover，无副作用）
        this.node.on(NodeEventType.POINTER_ENTER, (e: any) => { e.propagationStopped = true; this._hovering = true; this._repaint(); });
        this.node.on(NodeEventType.POINTER_LEAVE, (e: any) => { e.propagationStopped = true; this._hovering = false; this._pressing = false; this._repaint(); });
        this.node.on(NodeEventType.POINTER_DOWN,  (e: any) => { e.propagationStopped = true; if (this._enabled) { this._pressing = true; this._repaint(); } });
        this.node.on(NodeEventType.POINTER_UP,    (e: any) => { e.propagationStopped = true; this._pressing = false; this._repaint(); });
    }

    /** 悬停提亮 + 焦点描边；按下加深，三者叠加出桌面手感（全部走 theme token，禁散落字面量） */
    private _repaint(): void {
        if (!this._enabled) return;
        let bg = this._style.bg;
        let border = this._style.border;
        if (this._pressing)      bg = UIButton._mix(bg, [0, 0, 0], 0.18);
        else if (this._hovering) bg = UIButton._mix(bg, [255, 255, 255], 0.12);
        if (this._hovering || this._pressing) border = C.focus;
        const s: BtnStyle = { ...this._style, bg, border };
        this._bg.gfx.clear();
        this._bg.rect(this._w, this._h, s.bg, s.radius, s.border, s.borderW, false, true);
    }

    /** 颜色线性插值（amt>0 朝 target 提亮/压暗），返回新 Color 实例 */
    private static _mix(c: Color, t: [number, number, number], amt: number): Color {
        return new Color(
            Math.round(c.r + (t[0] - c.r) * amt),
            Math.round(c.g + (t[1] - c.g) * amt),
            Math.round(c.b + (t[2] - c.b) * amt),
            c.a,
        );
    }

    setText(t: string): this { this._label.setText(t); return this; }

    /** 暴露文字标签（供外部动态改文字，如底栏「出门/回家」切换） */
    get label(): UILabel { return this._label; }

    /** 暴露背景 Graphics（供按钮助手返回 BtnRef.gfx 兼容结构） */
    get bgGfx(): Graphics { return this._bg.gfx; }

    setEnabled(b: boolean): this {
        this._enabled = b;
        const s: BtnStyle = b ? this._style
            : { ...this._style, bg: C.disabledBg, text: C.disabledText, border: C.disabledBorder };
        this._bg.gfx.clear();
        this._bg.rect(this._w, this._h, s.bg, s.radius, s.border, s.borderW, false, true);
        this._label.setColor(s.text);
        return this;
    }
}
