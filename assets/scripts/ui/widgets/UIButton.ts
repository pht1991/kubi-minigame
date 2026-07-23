/**
 * UIButton.ts - 按钮原子组件（背景 + 文字 + 点击 + 禁用）
 *
 * 结构：UINode(node) → UIShape(背景, 子节点) + UILabel(文字, 子节点)
 * node 自身无 Graphics，故挂 Label 安全（不违反同节点冲突铁律）。
 * 点击自带 stopPropagation，避免穿透到遮罩/面板。
 */

import { Color, NodeEventType, EventTouch } from 'cc';
import { UINode } from './UINode';
import { UIShape } from './UIShape';
import { UILabel } from './UILabel';
import { BtnStyle } from '../theme';

export class UIButton extends UINode {
    private _bg: UIShape;
    private _label: UILabel;
    private _style: BtnStyle;
    private _enabled = true;
    private _onClick?: () => void;

    constructor(text: string, style: BtnStyle, onClick?: () => void, w = 150, h = 52) {
        super('Btn');
        this._style = style;
        this._onClick = onClick;

        this._bg = new UIShape('Bg').rect(w, h, style.bg, style.radius, style.border, style.borderW);
        this._label = new UILabel(text, {
            size: style.fontSize ?? 22, color: style.text, align: 'center', bold: true, width: w - 12,
        });
        this.add(this._bg, this._label);
        this.size(w, h);

        this.node.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (this._enabled) this._onClick?.();
        });
    }

    setText(t: string): this { this._label.setText(t); return this; }

    /** 暴露文字标签（供外部动态改文字，如底栏「出门/回家」切换） */
    get label(): UILabel { return this._label; }

    setEnabled(b: boolean): this {
        this._enabled = b;
        const s: BtnStyle = b ? this._style
            : { ...this._style, bg: new Color(175, 170, 163), text: new Color(140, 135, 130) };
        this._bg.gfx.clear();
        this._bg.rect(this._w, this._h, s.bg, s.radius, s.border, s.borderW);
        this._label.setColor(s.text);
        return this;
    }
}
