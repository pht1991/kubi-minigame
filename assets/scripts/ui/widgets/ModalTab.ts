/**
 * ModalTab.ts - 弹窗 Tab 按钮公共组件（选中态切换，复用 UIShape + UILabel）
 *
 * 替换 TradePanel 中 _tabN + _rstab 手绘 Graphics 选中态的逻辑。
 * 点击自带 stopPropagation（继承自 UINode.onTap）。选中态用 setActive 重绘背景 + 切换文字色。
 */

import { UINode } from './UINode';
import { UIShape } from './UIShape';
import { UILabel } from './UILabel';
import { C, S } from '../theme';

export class ModalTab extends UINode {
    private _g: UIShape;
    private _lbl: UILabel;

    constructor(text: string, w: number, h: number, onTap: () => void, opts?: { fontSize?: number }) {
        super('Tab');

        this._g = new UIShape('Bg').rect(w, h, C.tabOff, 12, C.panelBorder, 2);
        this.add(this._g);

        this._lbl = new UILabel(text, {
            size: opts?.fontSize ?? 23, color: C.body, align: 'center', bold: true,
        });
        this.add(this._lbl);

        this.onTap(onTap);
        this.size(w, h);
    }

    /** 切换选中态：重绘背景（圆角）+ 切换文字色 */
    setActive(on: boolean): void {
        this._g.gfx.clear();
        this._g.rect(
            this.w, this.h,
            on ? C.tabOn : C.tabOff, 12,
            on ? C.accent : C.panelBorder, 2,
        );
        this._lbl.setColor(on ? C.white : C.body);
    }
}
