/**
 * UILabel.ts - 文本标签原子组件
 *
 * 内建铁律：Label 必须放子节点（不与 Graphics 同节点冲突）。
 * 本组件自带一个子 Node 承载 Label，UINode 自身只做布局占位。
 *
 * 尺寸策略（贴近 CSS 自适应）：
 *  - 不传 width → overflow=NONE，引擎按文本真实度量渲染，文字永不裁切；
 *    本组件用「CJK≈1.0×字号、ASCII/数字≈0.6×字号」混合估算一个接近真实的尺寸
 *    喂给 UINode，供上层容器（VStack/HStack/行/面板）按 CSS 风格排版。
 *  - 传 width → 进入固定容器语义：overflow=CLAMP（裁切）或 SHRINK（缩字），
 *    用于按钮/Tab/弹窗行 meta 等需要限定宽度的场景。
 *  ⚠️ Cline：Cocos 没有 CSS 那种「父随子自动回流撑开」的布局链，父容器（行/面板/滚动区）
 *    排布时读的是子节点的显式 _w/_h，因此本组件在「不传 width」时仍需把估算尺寸喂给
 *    UINode（NONE 只保证文字本身不裁切，不保证父容器自动适应）。
 */

import { Label, Color, Node, UITransform } from 'cc';
import { UINode } from './UINode';
import { estimateTextWidth, estimateWrappedLines } from '../textMetrics';

export interface LabelOpts {
    size?: number;
    /** 换行/固定宽度（CLAMP 需要）。传了即进入固定容器语义（裁切/缩字）；不传则 NONE 自适应 */
    width?: number;
    /** 固定高度（不传则按文本估算） */
    height?: number;
    color?: Color;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    lineHeight?: number;
    /** 溢出策略：true=SHRINK（文字过长自动缩字，不截断）；默认 CLAMP。仅在传 width 时生效 */
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
        const fixedWidth = !!opts.width;

        Object.assign(this._label, {
            string: text,
            fontSize: this._size,
            color: opts.color ?? new Color(50, 40, 30, 255),
            horizontalAlign: opts.align === 'left' ? Label.HorizontalAlign.LEFT
                : opts.align === 'right' ? Label.HorizontalAlign.RIGHT
                : Label.HorizontalAlign.CENTER,
            verticalAlign: Label.VerticalAlign.CENTER,
            // 传 width → 固定容器语义（CLAMP 裁切 / SHRINK 缩字）；否则 NONE 自适应不裁切
            enableWrapText: fixedWidth || isWrap,
            overflow: fixedWidth
                ? (opts.shrink ? Label.Overflow.SHRINK : Label.Overflow.CLAMP)
                : Label.Overflow.NONE,
            lineHeight: lh,
            isBold: !!opts.bold,
        });

        // 自动换行：用估算的换行后高度（按宽度算行数），不缩放字体
        const h = (isWrap && opts.width) ? this.estimateHeight() : (opts.height ?? this.estimateHeight());
        this._measuredH = h;
        const w = opts.width ?? this.estimateTextWidth(text) + 4;
        this.size(w, h);
        lNode.getComponent(UITransform)!.setContentSize(this._wrapW || w, h);
    }

    /**
     * 估算文本像素宽（基于混合字符宽：CJK≈1.0×字号、ASCII/数字≈0.55×字号）。
     * 复用 textMetrics.estimateTextWidth 单一真相源。
     * 不传 width 时本估算仅供父容器排版参考（文字本身 NONE 不裁切）；传 width 时本估算不使用。
     */
    private estimateTextWidth(text: string): number {
        return estimateTextWidth(text, this._size);
    }

    /** 按当前文本估算高度（用于未显式给定 height 或 wrap 时） */
    private estimateHeight(): number {
        const lh = Math.ceil(this._size * 1.5);
        if (!this._wrapW) return lh + 4;
        const lines = estimateWrappedLines(this._text, this._size, this._wrapW);
        return lines * lh + 4; // +4px 余量防字体 ascent/descent 被 CLAMP 裁切
    }

    setText(t: string): this {
        this._text = t;
        this._label.string = t;
        const h = this.estimateHeight();
        this._measuredH = h;
        const w = this._wrapW || (this.estimateTextWidth(t) + 4);
        this.height(h);
        if (!this._wrapW) this.width(w); // NONE 自适应：按新文字重算宽（固定 width 不变）
        const lt = this._label.node.getComponent(UITransform);
        if (lt) lt.setContentSize(this._wrapW || w, h);
        return this;
    }

    /** 当前文本实际占用高度（换行后估算），供外部布局自适应撑开 */
    get measuredHeight(): number { return this._measuredH; }

    setColor(c: Color): this { this._label.color = c; return this; }
    get label(): Label { return this._label; }
    /** 便捷赋值（等价于 setText），兼容直接 .string = 写法 */
    set string(t: string) { this.setText(t); }
    get string(): string { return this._text; }
}
