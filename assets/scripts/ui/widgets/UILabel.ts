/**
 * UILabel.ts - 文本标签原子组件
 *
 * 内建铁律：Label 必须放子节点（不与 Graphics 同节点冲突）。
 * 本组件自带一个子 Node 承载 Label，UINode 自身只做布局占位。
 * 支持换行宽度声明，未给高度时按文本量估算（汉字 ≈ 字号×0.6 宽）。
 */

import { Label, Color, Node, UITransform } from 'cc';
import { UINode } from './UINode';

export interface LabelOpts {
    size?: number;
    /** 换行宽度（CLAMP 需要）。不传则不换行，按字符数估宽 */
    width?: number;
    /** 固定高度（不传则按文本估算） */
    height?: number;
    color?: Color;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    lineHeight?: number;
    /** 溢出策略：true=SHRINK（文字过长自动缩字，不截断）；默认 false=CLAMP */
    shrink?: boolean;
    /** 自动换行（不缩放字体），高度随换行行数撑开；需配合 width */
    wrap?: boolean;
}

export class UILabel extends UINode {
    private _label: Label;
    private _text = '';
    private _size = 20;
    private _wrapW = 0;
    private _measuredH = 0;

    constructor(text = '', opts: LabelOpts = {}) {
        super('Label');

        // Label 放独立子节点（铁律）
        const lNode = new Node('L');
        lNode.addComponent(UITransform);
        lNode.setParent(this.node);
        this._label = lNode.addComponent(Label);

        this._text = text;
        this._size = opts.size ?? 20;
        this._wrapW = opts.width ?? 0;

        const lh = opts.lineHeight ?? Math.ceil(this._size * 1.5);
        const isWrap = !!opts.wrap;
        Object.assign(this._label, {
            string: text,
            fontSize: this._size,
            color: opts.color ?? new Color(50, 40, 30, 255),
            horizontalAlign: opts.align === 'left' ? Label.HorizontalAlign.LEFT
                : opts.align === 'right' ? Label.HorizontalAlign.RIGHT
                : Label.HorizontalAlign.CENTER,
            verticalAlign: Label.VerticalAlign.CENTER,
            enableWrapText: !!opts.width || isWrap,
            overflow: opts.shrink ? Label.Overflow.SHRINK : Label.Overflow.CLAMP,
            lineHeight: lh,
            isBold: !!opts.bold,
        });

        // 自动换行：用估算的换行后高度（按宽度算行数），不缩放字体
        const h = (isWrap && opts.width) ? this.estimateHeight() : (opts.height ?? this.estimateHeight());
        this._measuredH = h;
        const w = opts.width ?? Math.ceil(this._text.length * this._size * 0.6);
        this.size(w, h);
        lNode.getComponent(UITransform)!.setContentSize(this._wrapW || w, h);
    }

    /** 按当前文本估算高度（用于未显式给定 height 或 wrap 时） */
    private estimateHeight(): number {
        const lh = Math.ceil(this._size * 1.5);
        if (!this._wrapW) return lh + 4;
        const charsPerLine = Math.max(1, Math.floor(this._wrapW / (this._size * 0.9)));
        // 按 \n 分段后再逐段估算换行数（否则 "生命\n100" 被算成 1 行）
        const segments = this._text.split('\n');
        let totalLines = 0;
        for (const seg of segments) {
            totalLines += Math.max(1, Math.ceil(seg.length / charsPerLine));
        }
        return totalLines * lh + 4; // +4px 余量防字体 ascent/descent 被 CLAMP 裁切
    }

    setText(t: string): this {
        this._text = t;
        this._label.string = t;
        const h = this.estimateHeight();
        this._measuredH = h;
        this.height(h);
        const lt = this._label.node.getComponent(UITransform);
        if (lt) lt.setContentSize(this._wrapW || this._w, h);
        return this;
    }

    /** 当前文本实际占用高度（换行后估算），供外部布局自适应撑开 */
    get measuredHeight(): number { return this._measuredH; }

    setColor(c: Color): this { this._label.color = c; return this; }
    get label(): Label { return this._label; }
}
