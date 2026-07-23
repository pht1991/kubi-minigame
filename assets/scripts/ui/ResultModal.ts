/**
 * ResultModal.ts - 操作结果确认弹窗
 *
 * 继承 ModalPanel，用于「操作结束后需要玩家确认」的结果展示（尤其是长文案，如拾荒/采集的获得清单、
 * 背包已满仅取部分等）。与 Toast 互补：短文案走 Toast(SHRINK)，长/需确认走本弹窗。
 *
 * 外部调用：ResultModal.instance?.showResult(title, message)
 */

import { ModalPanel } from './ModalPanel';
import { C, Btn } from './theme';
import { UIVStack, UILabel, UIButton } from './widgets';

export class ResultModal extends ModalPanel {
    protected panelW = 600;
    protected panelH = 420;
    protected showMask = true;
    protected maskClose = false;   // 必须点「确定」关闭，防止误触穿透
    protected showClose = false;

    private _msgText = '';

    protected render(): void {
        this.clearContent();
        const cw = this.panelW - 80;
        // 声明式：文案 → 确定按钮，VStack 自动排布
        const stack = new UIVStack().gap(28).align('center').fixedWidth(cw)
            .add(new UILabel(this._msgText, { size: 22, width: cw, color: C.body, align: 'center' }))
            .add(new UIButton('确定', Btn.confirm, () => this.hide(), 240, 64));
        stack.mount(this._content!);
        stack.pos(0, -stack.h / 2 - 10, 0);
    }

    /** 显示结果（标题 + 多行文案） */
    public showResult(title: string, message: string): void {
        this._msgText = message;
        this.show(title);
    }
}
