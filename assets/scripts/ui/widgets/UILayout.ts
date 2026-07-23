/**
 * UILayout.ts - 自动布局容器（VStack / HStack / Grid）
 *
 * 设计原则：用「相对关系」描述布局，子节点加入后由容器在 mount/layout 时
 * 自动计算各自坐标，业务代码不再手写绝对 y。
 *
 * 坐标系：容器本地坐标，原点在中心，y 向上为正（与 Cocos 一致）。
 * 布局时：内容区 = 容器尺寸 - padding；子节点默认锚点 (0.5,0.5)（本库组件默认如此）。
 *
 * 递归：layout() 先对子节点调 layout()（让嵌套容器先算出自身尺寸），
 * 再基于子节点回报的 w/h 排布并设定本容器尺寸。
 */

import { UINode } from './UINode';

export type AlignX = 'left' | 'center' | 'right' | 'stretch';
export type AlignY = 'top' | 'center' | 'bottom' | 'stretch';

// ══════════ 垂直栈 ══════════
export class UIVStack extends UINode {
    private _gap = 0;
    private _padT = 0; private _padB = 0; private _padL = 0; private _padR = 0;
    private _align: AlignX = 'center';
    private _fixedW?: number;

    constructor() { super('VStack'); this._needsLayout = true; }

    gap(g: number): this { this._gap = g; return this; }
    padding(t: number, b = t, l = t, r = t): this { this._padT = t; this._padB = b; this._padL = l; this._padR = r; return this; }
    align(a: AlignX): this { this._align = a; return this; }
    fixedWidth(w: number): this { this._fixedW = w; return this; }

    layout(): { w: number; h: number } {
        for (const k of this._kids) k.layout();

        let maxW = 0;
        let sumH = 0;
        for (const k of this._kids) { sumH += k.h; if (k.w > maxW) maxW = k.w; }
        const innerW = this._fixedW ?? maxW;
        const innerH = this._padT + this._padB + sumH + this._gap * Math.max(0, this._kids.length - 1);

        this._w = innerW + this._padL + this._padR;
        this._h = innerH;
        this.ut.setContentSize(this._w, this._h);

        const contentLeft = -this._w / 2 + this._padL;
        const contentCenterX = contentLeft + innerW / 2;
        let y = this._h / 2 - this._padT; // 内容区顶边
        for (const k of this._kids) {
            const cx = this._align === 'left' ? contentLeft + k.w / 2
                     : this._align === 'right' ? contentLeft + innerW - k.w / 2
                     : contentCenterX;
            k.node.setPosition(cx, y - k.h / 2, 0);
            y -= (k.h + this._gap);
        }
        return { w: this._w, h: this._h };
    }
}

// ══════════ 水平栈 ══════════
export class UIHStack extends UINode {
    private _gap = 0;
    private _padT = 0; private _padB = 0; private _padL = 0; private _padR = 0;
    private _align: AlignY = 'center';
    private _fixedH?: number;

    constructor() { super('HStack'); this._needsLayout = true; }

    gap(g: number): this { this._gap = g; return this; }
    padding(t: number, b = t, l = t, r = t): this { this._padT = t; this._padB = b; this._padL = l; this._padR = r; return this; }
    align(a: AlignY): this { this._align = a; return this; }
    fixedHeight(h: number): this { this._fixedH = h; return this; }

    layout(): { w: number; h: number } {
        for (const k of this._kids) k.layout();

        let maxH = 0;
        let sumW = 0;
        for (const k of this._kids) { sumW += k.w; if (k.h > maxH) maxH = k.h; }
        const innerH = this._fixedH ?? maxH;
        const innerW = this._padL + this._padR + sumW + this._gap * Math.max(0, this._kids.length - 1);

        this._w = innerW;
        this._h = innerH + this._padT + this._padB;
        this.ut.setContentSize(this._w, this._h);

        const contentTop = this._h / 2 - this._padT;
        const contentCenterY = contentTop - innerH / 2;
        let x = -this._w / 2 + this._padL; // 内容区左边缘
        for (const k of this._kids) {
            const cy = this._align === 'top' ? contentTop - k.h / 2
                     : this._align === 'bottom' ? contentTop - innerH + k.h / 2
                     : contentCenterY;
            k.node.setPosition(x + k.w / 2, cy, 0);
            x += (k.w + this._gap);
        }
        return { w: this._w, h: this._h };
    }
}

// ══════════ 网格（等宽等高单元格）══════════
export class UIGrid extends UINode {
    private _cols = 1;
    private _cellW = 0; private _cellH = 0;
    private _gapX = 0; private _gapY = 0;
    private _padT = 0; private _padB = 0; private _padL = 0; private _padR = 0;

    constructor() { super('Grid'); this._needsLayout = true; }

    cols(c: number): this { this._cols = Math.max(1, c); return this; }
    cellSize(w: number, h: number): this { this._cellW = w; this._cellH = h; return this; }
    gap(x: number, y = x): this { this._gapX = x; this._gapY = y; return this; }
    padding(t: number, b = t, l = t, r = t): this { this._padT = t; this._padB = b; this._padL = l; this._padR = r; return this; }

    layout(): { w: number; h: number } {
        for (const k of this._kids) k.layout();

        const n = this._kids.length;
        const rows = Math.ceil(n / this._cols);
        const innerW = this._cols * this._cellW + (this._cols - 1) * this._gapX;
        const innerH = rows * this._cellH + (rows - 1) * this._gapY;

        this._w = innerW + this._padL + this._padR;
        this._h = innerH + this._padT + this._padB;
        this.ut.setContentSize(this._w, this._h);

        const contentLeft = -this._w / 2 + this._padL;
        const contentTop = this._h / 2 - this._padT;
        for (let i = 0; i < n; i++) {
            const col = i % this._cols;
            const row = Math.floor(i / this._cols);
            const cx = contentLeft + col * (this._cellW + this._gapX) + this._cellW / 2;
            const cy = contentTop - row * (this._cellH + this._gapY) - this._cellH / 2;
            this._kids[i].node.setPosition(cx, cy, 0);
        }
        return { w: this._w, h: this._h };
    }
}
