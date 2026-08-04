/**
 * ModalRow.ts - 弹窗列表行公共组件（复用现有 widget 库）
 *
 * 统一「圆角底 + 可选左色块 + 左主文字 + 右元信息 + 可选副行 + 禁用态 + 可点击」
 * 替换 DialogPanel 选项行 / BagPanel 物品行 / TradePanel 易货行 / HarvestModal 收获行 中重复的
 * UIShape+UILabel+onTap 手写逻辑。
 *
 * ⚠️ 不实例化 GridCell：弹窗是「单列可滚、每次 render 重建」语境，与页面网格的对象池/常驻生命周期不同。
 */

import { Color } from 'cc';
import { UINode } from './UINode';
import { UIShape } from './UIShape';
import { UILabel } from './UILabel';
import { C, S } from '../theme';

export interface ModalRowOpts {
    /** 行宽（含左右边距） */
    width: number;
    /** 主文字（可含 \n 换行，自动估算行数撑高） */
    name: string;
    nameSize?: number;
    nameColor?: Color;
    align?: 'left' | 'center' | 'right';
    /** 右端元信息（如 ×数量），右对齐 */
    meta?: string;
    metaSize?: number;
    metaColor?: Color;
    /** 左侧色块（类型标识）；给颜色即显示方块 */
    leftIcon?: Color;
    leftIconSize?: number;
    /** 副行文字（如耐久 cur/max 或类型标签），显示在名称下方 */
    subText?: string;
    subSize?: number;
    subColor?: Color;
    /** 背景 / 描边；省略走主题默认（禁用态自动切换） */
    bg?: Color;
    stroke?: Color;
    strokeW?: number;
    radius?: number;
    disabled?: boolean;
    onTap?: () => void;
}

export class ModalRow extends UINode {
    constructor(o: ModalRowOpts) {
        super('ModalRow');

        const w = o.width;
        const fs = o.nameSize ?? S.font.body;
        const lh = Math.ceil(fs * 1.5);
        const padY = 14;
        const iconSz = o.leftIconSize ?? 40;
        const minH = iconSz + 12;

        // 文字块总高（name + sub + spacing），不加 padY（padY 在下方 rowH 统一加）
        const subH = o.subText ? Math.ceil((o.subSize ?? 16) * 1.5) + 4 : 0;
        const hasSub = subH > 0;
        const nameBlockH = lh;                                  // name 文字单行高（lh=fs*1.5）
        const textBlockH = nameBlockH + subH + (hasSub ? 6 : 0); // name + sub + 间距
        // 行高 = max(icon 最小高, 文字块 + 上下内边距)
        const rowH = Math.max(minH, textBlockH + padY * 2);

        const bg = new UIShape('Bg').rect(
            w, rowH,
            o.bg ?? (o.disabled ? C.cellBgDisabled : C.optionBg),
            o.radius ?? 10,
            o.stroke ?? (o.disabled ? C.cellStrokeDisabled : C.optionStroke),
            o.strokeW ?? 1.5,
        );
        this.add(bg);

        // 左侧色块
        let textLeft = -w / 2 + 18;
        if (o.leftIcon) {
            const ic = new UIShape('Icon').rect(iconSz, iconSz, o.leftIcon, 4);
            ic.pos(-w / 2 + 16 + iconSz / 2, 0);
            this.add(ic);
            textLeft = -w / 2 + 16 + iconSz + 12;
        }
        const rightPad = o.meta ? 70 : 24;
        const textMaxW = w - (textLeft + w / 2) - rightPad;

        // 主文字（名称单行居中 / 双行偏上）
        const nameY = hasSub ? (rowH / 2 - padY - nameBlockH / 2) : 0;
        const nameC = o.nameColor ?? (o.disabled ? C.cellTextDisabled : C.cellText);
        const name = new UILabel(o.name, {
            size: fs, width: textMaxW, height: nameBlockH,
            color: nameC, align: o.align ?? 'left', wrap: true,
        });
        name.pos(textLeft + textMaxW / 2, nameY);
        this.add(name);

        // 副行
        if (hasSub) {
            const subY = -rowH / 2 + padY + subH / 2;
            const sub = new UILabel(o.subText!, {
                size: o.subSize ?? 16, width: textMaxW, height: subH,
                color: o.subColor ?? new Color(140, 130, 115), align: o.align ?? 'left', wrap: true,
            });
            sub.pos(textLeft + textMaxW / 2, subY);
            this.add(sub);
        }

        // 右端元信息
        if (o.meta) {
            const metaW = 70;
            const meta = new UILabel(o.meta, {
                size: o.metaSize ?? S.font.body, width: metaW, height: 30,
                color: o.metaColor ?? C.cellCount, align: 'right',
            });
            meta.pos(w / 2 - 12 - metaW / 2, 0);  // 右边 = w/2 - 12（行内 12px padding）
            this.add(meta);
        }

        if (o.onTap && !o.disabled) this.onTap(o.onTap);
        this.size(w, rowH);
    }
}
