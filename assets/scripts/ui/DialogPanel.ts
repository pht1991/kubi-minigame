import { _decorator } from 'cc';
import { ModalPanel } from './ModalPanel';
import { DialogOptionStyle as OS, S } from './theme';
import { ModalRow, ModalScrollList } from './widgets';

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

    private _list!: ModalScrollList;

    protected buildSkeleton(): void {
        super.buildSkeleton();
        // 滚动列表区（自适应高度，自动 resize 面板）
        this._list = this.createScrollList({
            parent: this._panel, x: 0, y: this.panelH / 2 - 110,
            width: 600, viewH: 700, gap: 8, padT: 36, padB: 24,
            minScrollH: 200, minPanelH: 300, maxPanelH: 900,
            align: 'center',
        });
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
        const rows = this._options.map((opt, i) => new ModalRow({
            width: 580,
            name: opt.label,
            align: 'left',
            disabled: !!opt.disabled,
            bg: opt.disabled ? OS.bgDisabled : OS.bg,
            stroke: opt.disabled ? OS.strokeDisabled : OS.stroke,
            onTap: () => {
                this._selectedIndex = i;
                if (this._onSelect) this._onSelect(this._options[i].data);
                this.hide();
            },
        }));
        this._list.setRows(rows);
    }
}
