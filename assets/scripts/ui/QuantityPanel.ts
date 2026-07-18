/**
 * QuantityPanel.ts - 数量选择弹窗
 *
 * 用于「存入大箱子 / 取出到背包」等需要指定数量的场景：避免一次只转移 1 个、多了要反复点的麻烦。
 * 继承 ModalPanel 复用外壳（遮罩 / 面板 / 关闭钮 / 控件助手）。
 *
 * 用法：
 *   qtyPanel.show(`存入【${name}】`, max, (qty) => { ... });
 * 默认全选（qty = max）；提供 − / +（每次 ±1，下限 1）、全部（= max）、确定 / 取消。
 */

import { _decorator, Node } from 'cc';
import { ModalPanel, C } from './ModalPanel';

const { ccclass } = _decorator;

@ccclass('QuantityPanel')
export class QuantityPanel extends ModalPanel {
    private _qty = 1;
    private _max = 1;
    private _onConfirm: (qty: number) => void = () => {};
    private _qtyLabel: ReturnType<ModalPanel['mkCenter']> | null = null;

    constructor() {
        super();
        this.panelW = 540;
        this.panelH = 470;
    }

    public show(title: string, max: number, onConfirm: (qty: number) => void): void {
        this._max = Math.max(1, max);
        this._qty = this._max;            // 默认全选，符合「快速存全部」直觉
        this._onConfirm = onConfirm;
        super.show(title);
    }

    protected render(): void {
        this.clearContent();
        const c = this._content!;

        // 顶部提示（使用标题已含物品名，这里仅一行轻提示）
        this.mkText(c, 0, -12, this.panelW - 80, 36, '请选择数量', 22, C.sub, { align: 'center', anchorX: 0.5, anchorY: 1 });

        // 数量显示 N / M（居中大字）
        this._qtyLabel = this.mkCenter(c, 0, -110, 320, 70, `${this._qty} / ${this._max}`, 44, C.title, true);

        // − / + 步进按钮（与数量同行的左右两侧）
        this.mkButton(c, -130, -150, 80, 80, '−', C.accent2, () => this.setQty(this._qty - 1));
        this.mkButton(c, 130, -150, 80, 80, '+', C.accent, () => this.setQty(this._qty + 1));

        // 全部
        this.mkButton(c, 0, -250, 220, 62, '全部', C.tabOn, () => this.setQty(this._max));

        // 确定（取消由右上角 × / 蒙层承担，避免与关闭按钮功能重复）
        this.mkButton(c, 0, -340, 280, 72, '确定', C.accent2, () => {
            this.hide();
            this._onConfirm(this._qty);
        });
    }

    private setQty(v: number): void {
        this._qty = Math.max(1, Math.min(this._max, v));
        if (this._qtyLabel) this._qtyLabel.string = `${this._qty} / ${this._max}`;
    }
}
