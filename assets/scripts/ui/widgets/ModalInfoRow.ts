/**
 * ModalInfoRow.ts - 弹窗「标签: 内容」信息行公共组件
 *
 * 替换 EventDetailPanel._infoRow、BagPanel 标签行、TradePanel Header 信息行 中重复的
 * UIShape 行底 + 标签/内容 UILabel 手写逻辑。复用 UIShape + UILabel。
 */

import { Color } from 'cc';
import { UINode } from './UINode';
import { UIShape } from './UIShape';
import { UILabel } from './UILabel';
import { S } from '../theme';

export interface ModalInfoRowOpts {
    rowH?: number;
    labelColor?: Color;
    valueSize?: number;
    valueColor?: Color;
    bg?: Color;
    radius?: number;
}

export class ModalInfoRow extends UINode {
    constructor(cw: number, label: string, value: string, o?: ModalInfoRowOpts) {
        super('InfoRow');

        const rowH = o?.rowH ?? 44;
        const bg = new UIShape('Bg').rect(
            cw, rowH,
            o?.bg ?? new Color(240, 234, 222, 255),
            o?.radius ?? 6,
        );
        this.add(bg);

        if (label) {
            const tag = new UILabel(label, {
                size: S.font.sub, color: o?.labelColor ?? new Color(100, 80, 60, 255), bold: true,
            });
            tag.pos(-cw / 2 + 16 + tag.w / 2, 0);
            this.add(tag);
        }

        const valW = cw - (label ? 96 : 32);
        const val = new UILabel(value, {
            size: o?.valueSize ?? S.font.body, width: valW, height: rowH,
            color: o?.valueColor ?? new Color(60, 45, 30, 255), align: 'left',
        });
        val.pos(-cw / 2 + (label ? 80 : 16) + valW / 2, 0);
        this.add(val);

        this.size(cw, rowH);
    }
}
