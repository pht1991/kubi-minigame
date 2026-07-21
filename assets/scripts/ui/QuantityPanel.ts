/**
 * QuantityPanel.ts - 数量选择弹窗（通用）
 *
 * 用于「存入大箱子 / 取出到背包 / 交易数量」等需要指定数量的场景。
 * 继承 ModalPanel 复用外壳（遮罩 / 面板 / 关闭钮 / 控件助手）。
 *
 * 基础用法（存取）：
 *   qtyPanel.show(`存入【${name}】`, max, (qty) => { ... });
 *   默认全选；提供 − / +（±1）、全部、确定。
 *
 * 扩展用法（交易）：
 *   qtyPanel.show(title, max, onConfirm, {
 *       infoLines: ['持有 50 金 | 单价 20'],
 *       confirmLabel: '确认购买',
 *       getPreview: (q) => [`花费：${price*q} 金`, `→ 获得：${name}×${q}`],
 *   });
 */

import { _decorator } from 'cc';
import { ModalPanel, C } from './ModalPanel';

const { ccclass } = _decorator;

export interface QtyOptions {
    /** 信息行（显示在标题下方，如持有/单价/最多） */
    infoLines?: string[];
    /** 确认按钮文字，默认 '确定' */
    confirmLabel?: string;
    /** 实时预览文本生成器（每次数量变化调用，显示在数量区下方） */
    getPreview?: (qty: number) => string[];
}

@ccclass('QuantityPanel')
export class QuantityPanel extends ModalPanel {
    private _qty = 1;
    private _max = 1;
    private _onConfirm: (qty: number) => void = () => {};
    private _opts: QtyOptions | null = null;

    constructor() {
        super();
        this.panelW = 540;
        this.panelH = 470;
    }

    public show(
        title: string,
        max: number,
        onConfirm: (qty: number) => void,
        opts?: QtyOptions,
    ): void {
        this._max = Math.max(1, max);
        this._qty = this._max;            // 默认全选
        this._onConfirm = onConfirm;
        this._opts = opts || null;

        // ── 动态计算面板高度（确保确认按钮不被裁切）──
        const o = this._opts;
        const initQty = this._qty;
        const hasInfo = !!(o?.infoLines?.length);
        const prevCount = o?.getPreview ? o.getPreview(initQty).length : 0;
        // 基础模式：确定按钮在 y=-310，底部留白约 70 → 需要 380+
        // 每行信息额外 +26px，每行预览额外 +26px
        const minH = Math.max(420,
            380
            + (hasInfo ? (o!.infoLines!.length * 26) : 0)
            + (prevCount * 26)
            + 75   // 底部安全余量
        );
        if (this.panelH !== minH) this.resizePanel(minH);

        super.show(title);
    }

    protected render(): void {
        this.clearContent();
        const c = this._content!;
        const o = this._opts;

        // ── 信息行（交易场景：持有/单价等）──
        if (o?.infoLines) {
            let iy = 12;
            for (const line of o.infoLines) {
                this.mkText(c, 0, -iy, this.panelW - 80, 28, line, 18, C.sub, { align: 'center', anchorY: 1 });
                iy += 26;
            }
        }

        // ── 数量显示 N / M（居中大字）──
        const numY = o?.infoLines ? 110 : 100;
        this.mkCenter(c, 0, -numY, 320, 70, `${this._qty} / ${this._max}`, 44, C.title, true);

        // ── − / + 步进按钮 ──
        const btnY = o?.infoLines ? 145 : 135;
        this.mkButton(c, -115, -btnY, 60, 60, '\u2212', C.accent2, () => this.setQty(this._qty - 1));
        this.mkButton(c, 115, -btnY, 60, 60, '+', C.accent, () => this.setQty(this._qty + 1));

        // ── 全部 ──
        const allY = o?.infoLines ? 230 : 220;
        this.mkButton(c, 0, -allY, 180, 50, '全部', C.tabOn, () => this.setQty(this._max));

        // ── 预览文本（交易场景：花费/获得）── 提升到外层作用域，供确认按钮定位
        const previewLines = o?.getPreview ? o.getPreview(this._qty) : [];
        const prevY = allY + 60;
        previewLines.forEach((line, i) => {
            this.mkText(c, 0, -(prevY + i * 26), this.panelW - 80, 26, line,
                i === previewLines.length - 1 ? 20 : 19,
                i === previewLines.length - 1 ? C.accent2 : C.body,
                { align: 'center', anchorY: 1 });
        });

        // ── 确认按钮（取消由 × / 蒙层承担）──
        const cfmY = previewLines.length ? (prevY + previewLines.length * 26 + 24) : 310;
        this.mkButton(c, 0, -cfmY, 220, 56, o?.confirmLabel || '\u786e\u5b9a', C.accent2, () => {
            this.hide();
            this._onConfirm(this._qty);
        });
    }

    private setQty(v: number): void {
        this._qty = Math.max(1, Math.min(this._max, v));
        this.render();   // 整面板重建即可同步数量/预览
    }
}
