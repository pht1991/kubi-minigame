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
import { Btn } from './theme';
import { UIVStack, UIHStack, UILabel, UIButton } from './widgets';

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
        super.show(title);
    }

    protected render(): void {
        this.clearContent();
        const c = this._content!;
        const o = this._opts;
        const cw = this.panelW - 80;

        // 声明式垂直栈：信息行 → N/M + −/+ → 全部 → 预览 → 确认，布局自动排
        const stack = new UIVStack().gap(18).align('center').fixedWidth(cw).padding(12, 0, 0, 0);

        // ── 信息行（交易场景：持有/单价等）──
        if (o?.infoLines) {
            for (const line of o.infoLines) {
                stack.add(new UILabel(line, { size: 18, width: cw, color: C.sub, align: 'center' }));
            }
        }

        // ── − / N/M / + 一行（HStack 水平排布）──
        stack.add(new UIHStack().gap(24)
            .add(new UIButton('\u2212', Btn.neutral, () => this.setQty(this._qty - 1), 60, 60))
            .add(new UILabel(`${this._qty} / ${this._max}`, { size: 44, width: 240, height: 70, color: C.title, align: 'center', bold: true }))
            .add(new UIButton('+', Btn.primary, () => this.setQty(this._qty + 1), 60, 60)));

        // ── 全部 ──
        stack.add(new UIButton('全部', Btn.neutral, () => this.setQty(this._max), 180, 50));

        // ── 预览文本（交易场景：花费/获得）──
        const previewLines = o?.getPreview ? o.getPreview(this._qty) : [];
        previewLines.forEach((line, i) => {
            const last = i === previewLines.length - 1;
            stack.add(new UILabel(line, { size: last ? 20 : 19, width: cw, color: last ? C.accent2 : C.body, align: 'center' }));
        });

        // ── 确认按钮（取消由 × / 蒙层承担）──
        stack.add(new UIButton(o?.confirmLabel || '\u786e\u5b9a', Btn.confirm, () => {
            this.hide();
            this._onConfirm(this._qty);
        }, 220, 56));

        stack.mount(c);
        stack.pos(0, -stack.h / 2, 0);

        // 面板高度直接由内容栈推导（140 = 标题区 90 + 底部留白 50），不再手工估算
        const targetH = Math.max(420, stack.h + 150);
        if (Math.abs(targetH - this.panelH) > 4) this.resizePanel(targetH);
    }

    private setQty(v: number): void {
        this._qty = Math.max(1, Math.min(this._max, v));
        this.render();   // 整面板重建即可同步数量/预览
    }
}
