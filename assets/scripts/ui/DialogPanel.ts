import { _decorator, Node, UITransform } from 'cc';
import { ModalPanel } from './ModalPanel';
import { DialogOptionStyle as OS, S } from './theme';
import { UIVStack, UILabel, UIShape } from './widgets';

const { ccclass } = _decorator;

export interface DialogOption {
    label: string;
    desc?: string;
    disabled?: boolean;
    data: any;
}

@ccclass('DialogPanel')
export class DialogPanel extends ModalPanel {
    protected buildContentContainer = false;   // 使用自带滚动视图，不需要基类 _content
    private _options: DialogOption[] = [];
    private _selectedIndex: number = -1;
    private _onSelect: ((data: any) => void) | null = null;
    private _onCancel: (() => void) | null = null;

    private _contentNode: Node | null = null;
    private _scrollNode: Node | null = null;
    private _scrollT: UITransform | null = null;

    protected buildSkeleton(): void {
        super.buildSkeleton();
        // 滚动视图（自适应高度，render 时更新尺寸与位置）
        const s = this.mkScroll(this._panel, 0, this.panelH / 2 - 110, 600, 700);
        this._scrollNode = s.view;
        this._scrollT = s.view.getComponent(UITransform);
        this._contentNode = s.content;
    }

    /**
     * 显示对话弹窗
     * @param title    标题
     * @param options  选项列表
     * @param onSelect 点击选项的回调（参数为选项的 data）
     * @param onCancel 关闭时的回调（可选）
     */
    show(title: string, options: DialogOption[], onSelect: (data: any) => void, onCancel?: () => void): void {
        this._options = options;
        this._selectedIndex = -1;
        this._onSelect = onSelect;
        this._onCancel = onCancel || null;
        super.show(title);
    }

    protected onHide(): void {
        if (this._onCancel) this._onCancel();
        this._onCancel = null;
        this._onSelect = null;
        this._options = [];
    }

    protected render(): void {
        if (!this._contentNode) return;

        // 清除旧选项
        for (const child of [...this._contentNode.children]) child.destroy();

        const optionHeight = 70;
        const spacing = 8;
        const topPadding = 36;
        const bottomPadding = 24;
        const totalHeight = this._options.length * (optionHeight + spacing) + spacing + topPadding + bottomPadding;

        // 自适应面板高度（消除底部大块空白）
        const actualScrollH = this.updateLayout(totalHeight);

        const contentT = this._contentNode.getComponent(UITransform);
        if (contentT) contentT.setContentSize(600, Math.max(totalHeight, actualScrollH));

        // 选项行：widgets 声明式（UIShape 行底 + UILabel），VStack 自动排布
        const list = new UIVStack().gap(spacing).align('center').fixedWidth(580);
        for (let i = 0; i < this._options.length; i++) {
            const opt = this._options[i];
            const isDisabled = opt.disabled;
            // 选项行用统一预设（暖杏按钮底 + 金棕描边），与上方信息区明确区分
            const row = new UIShape(`Option_${i}`).rect(
                580, optionHeight,
                isDisabled ? OS.bgDisabled : OS.bg, OS.radius,
                isDisabled ? OS.strokeDisabled : OS.stroke, 1,
            );
            // 文本盒宽 520 居左：原 mkInline(x=-240, anchor(0,0.5)) 等效盒中心 x = -240+260 = 20
            const lbl = new UILabel(opt.label, {
                size: S.font.option, width: 520, height: optionHeight,
                color: isDisabled ? OS.textDisabled : OS.text, align: 'left',
            });
            lbl.pos(20, 0);
            row.add(lbl);
            if (!isDisabled) {
                row.onTap(() => {
                    this._selectedIndex = i;
                    if (this._onSelect) this._onSelect(this._options[i].data);
                    this.hide();
                });
            }
            list.add(row);
        }
        list.mount(this._contentNode);
        list.pos(0, -topPadding - list.h / 2, 0);

        // 重置 content 位置到顶部（确保首行可见）
        if (this._contentNode) this._contentNode.setPosition(0, 0, 0);
    }

    /** 根据内容高度自适应面板与滚动区域尺寸 */
    private updateLayout(contentTotal: number): number {
        const titleReserve = 110;
        const bottomReserve = 30;
        const minScrollH = 200;
        const minPanelH = 300;
        const maxPanelH = 900;

        const scrollH = Math.max(contentTotal, minScrollH);
        let panelH = titleReserve + scrollH + bottomReserve;
        if (panelH < minPanelH) panelH = minPanelH;
        if (panelH > maxPanelH) panelH = maxPanelH;
        const actualScrollH = Math.min(scrollH, panelH - titleReserve - bottomReserve);

        this.resizePanel(panelH);

        if (this._scrollT) this._scrollT.setContentSize(600, actualScrollH);
        if (this._scrollNode) this._scrollNode.setPosition(0, panelH / 2 - titleReserve, 0);

        return actualScrollH;
    }
}
