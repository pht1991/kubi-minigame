/**
 * UIShape.ts - 用 Graphics 画形状（矩形 / 圆 / 线）的原子组件
 *
 * 关键约束：Graphics 画在自身 node 上，size 同步为图形尺寸，
 * 因此可安全作为「背景层」被子节点（Label 等）覆盖，不违反「同节点 Graphics+Label 冲突」铁律。
 */

import { Graphics, Color } from 'cc';
import { UINode } from './UINode';
import { C, S } from '../theme';

export class UIShape extends UINode {
    private _gfx: Graphics;

    constructor(name = 'Shape') {
        super(name);
        this._gfx = this.node.addComponent(Graphics);
    }

    get gfx(): Graphics { return this._gfx; }

    /**
     * 圆角矩形（radius=0 为直角）。
     * @param shadow 真实投影：在图形下方偏移画一层半透深色（仅未被 Mask 裁掉的表面可见，
     *               如 HUD / 侧栏；弹窗/格子在 Mask 内会被裁，此时请用 sheen）。
     * @param sheen  内侧高光描边：画一层 2px 白透描边（所有表面通用，不被 Mask 裁），营造立体感。
     */
    rect(w: number, h: number, fill: Color, radius = 0, stroke?: Color, sw = 2, shadow = false, sheen = false): this {
        const x = -w / 2, y = -h / 2;
        if (shadow) {
            this._gfx.fillColor = C.shadow;
            const sy = y + S.shadowOffY;
            if (radius > 0) this._gfx.roundRect(x, sy, w, h, radius); else this._gfx.rect(x, sy, w, h);
            this._gfx.fill();
        }
        this._gfx.fillColor = fill;
        if (radius > 0) this._gfx.roundRect(x, y, w, h, radius); else this._gfx.rect(x, y, w, h);
        this._gfx.fill();
        if (stroke) {
            this._gfx.lineWidth = sw;
            this._gfx.strokeColor = stroke;
            if (radius > 0) this._gfx.roundRect(x, y, w, h, radius); else this._gfx.rect(x, y, w, h);
            this._gfx.stroke();
        }
        if (sheen) {
            this._gfx.lineWidth = 2;
            this._gfx.strokeColor = C.sheen;
            const ix = x + 1.5, iy = y + 1.5, iw = w - 3, ih = h - 3;
            if (radius > 0) this._gfx.roundRect(ix, iy, iw, ih, Math.max(0, radius - 2)); else this._gfx.rect(ix, iy, iw, ih);
            this._gfx.stroke();
        }
        return this.size(w, h);
    }

    /** 圆形 */
    circle(r: number, fill: Color, stroke?: Color, sw = 2, sheen = false): this {
        this._gfx.fillColor = fill;
        this._gfx.circle(0, 0, r);
        this._gfx.fill();
        if (stroke) {
            this._gfx.lineWidth = sw;
            this._gfx.strokeColor = stroke;
            this._gfx.circle(0, 0, r);
            this._gfx.stroke();
        }
        if (sheen) {
            this._gfx.lineWidth = 2;
            this._gfx.strokeColor = C.sheen;
            this._gfx.circle(0, 0, r - 1.5);
            this._gfx.stroke();
        }
        return this.size(r * 2, r * 2);
    }

    /** 线段 */
    line(x1: number, y1: number, x2: number, y2: number, color: Color, w = 2): this {
        this._gfx.lineWidth = w;
        this._gfx.strokeColor = color;
        this._gfx.moveTo(x1, y1);
        this._gfx.lineTo(x2, y2);
        this._gfx.stroke();
        return this;
    }
}
