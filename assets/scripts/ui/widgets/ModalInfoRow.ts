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
import { estimateTextWidth } from '../textMetrics';
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
            // 复用 textMetrics 混合字符宽（CJK≈1.0×字号）算标签宽，避免 CLAMP 裁切
            const labelW = estimateTextWidth(label, S.font.sub) + 4;
            const tag = new UILabel(label, {
                size: S.font.sub, width: labelW,
                color: o?.labelColor ?? new Color(100, 80, 60, 255), bold: true,
            });
            tag.pos(-cw / 2 + 16 + labelW / 2, 0);
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
