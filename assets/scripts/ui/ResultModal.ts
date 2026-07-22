/**
 * ResultModal.ts - 操作结果确认弹窗
 *
 * 继承 ModalPanel，用于「操作结束后需要玩家确认」的结果展示（尤其是长文案，如拾荒/采集的获得清单、
 * 背包已满仅取部分等）。与 Toast 互补：短文案走 Toast(SHRINK)，长/需确认走本弹窗。
 *
 * 外部调用：ResultModal.instance?.showResult(title, message)
 */

import { Label } from 'cc';
import { ModalPanel, Btn } from './ModalPanel';
import { C } from './theme';

export class ResultModal extends ModalPanel {
    protected panelW = 600;
    protected panelH = 420;
    protected showMask = true;
    protected maskClose = false;   // 必须点「确定」关闭，防止误触穿透
    protected showClose = false;

    private _msgText = '';

    protected render(): void {
        this.clearContent();
        // 结果文案（多行，自动换行；mkText 已内建 enableWrapText）
        this.mkText(
            this._content!, 0, -10, this.panelW - 80, 240,
            this._msgText, 22, C.body,
            { anchorY: 0.5, align: 'center' },
        );
        // 确认按钮
        this.mkBtn(this._content!, 0, -170, 240, 64, '确定', Btn.confirm, () => this.hide());
    }

    /** 显示结果（标题 + 多行文案） */
    public showResult(title: string, message: string): void {
        this._msgText = message;
        this.show(title);
    }
}
