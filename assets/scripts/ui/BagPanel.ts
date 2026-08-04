import { _decorator, Color } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { S } from './theme';
import { GridCellData } from '../data/types';
import { ModalRow, ModalScrollList } from './widgets';
import { ITEM_DATA } from '../data/data';

const { ccclass } = _decorator;

/**
 * BagPanel.ts - 背包弹窗（列表视图版）
 *
 * 每行一个物品：[类型色块] 名称 · 类型标签  [耐久]  ...  ×数量
 * 用 ModalRow 公共组件（复用 UIShape/UILabel + CellLayout 行高估算），
 * 列表用 ModalScrollList 自动装载 + 自适应面板高度，消除重复的行构建与 updateLayout。
 */

@ccclass('BagPanel')
export class BagPanel extends ModalPanel {
    protected buildContentContainer = false;
    private _getTitle: (() => string) | null = null;
    private _getCells: (() => GridCellData[]) | null = null;
    private _onSelect: ((id: string) => void) | null = null;

    private _list!: ModalScrollList;

    // 列表布局参数（充分利用 750 设计分辨率屏宽）
    protected panelW = 710;                // 覆盖基类默认 640，弹窗更宽
    private readonly CONTENT_W = 680;      // 内容区宽度（≈panelW - 30 左右边距）
    private readonly MARGIN_X = 16;
    private readonly ROW_GAP = 8;         // 行间距
    private readonly ICON_SIZE = 40;      // 左侧类型色块尺寸

    // 字号——与主页状态栏(S.font.body=20)和底部按钮(22)对齐
    private readonly NAME_SIZE = S.font.body;       // 名称 = 主页数值 20
    private readonly SUB_SIZE = 16;                  // 副标签/耐久
    private readonly COUNT_SIZE = S.font.body;       // 数量 = 主页数值 20

    // 类型 → 色块颜色映射（暖棕色调色板内）
    private static readonly TYPE_COLORS: Record<string, Color> = {
        weapon:  new Color(0xD8, 0x5A, 0x30),   // 暖橙（武器）
        equip:   new Color(0xD8, 0x5A, 0x30),
        head:    new Color(0xBA, 0x75, 0x17),
        body:    new Color(0xBA, 0x75, 0x17),
        foot:    new Color(0xBA, 0x75, 0x17),
        neck:    new Color(0xBA, 0x75, 0x17),
        tool:    new Color(0x5F, 0x5E, 0x5A),   // 中灰（工具）
        food:    new Color(0x3B, 0x6D, 0x11),   // 橄绿（食物）
        cooked:  new Color(0x3B, 0x6D, 0x11),
        mat:     new Color(0x88, 0x87, 0x80),   // 浅灰（材料）
        material:new Color(0x88, 0x87, 0x80),
        quest:   new Color(0x7F, 0x77, 0xDD),   // 紫蓝（任务）
        special: new Color(0x7F, 0x77, 0xDD),
        art:     new Color(0x7F, 0x77, 0xDD),
    };

    protected buildSkeleton(): void {
        super.buildSkeleton();
        this._list = this.createScrollList({
            parent: this._panel, x: 0, y: this.panelH / 2 - 110,
            width: this.CONTENT_W, viewH: 700, gap: this.ROW_GAP,
            minScrollH: 160, minPanelH: 380, maxPanelH: 1040,
            titleReserve: 110, bottomReserve: 30, align: 'center',
        });
    }

    show(getTitle: () => string, getCells: () => GridCellData[], onSelect: (id: string) => void): void {
        this._getTitle = getTitle;
        this._getCells = getCells;
        this._onSelect = onSelect;
        super.show(getTitle());
    }

    refresh(): void {
        if (!this.node.active) return;
        this.render();
    }

    protected onHide(): void {
        this._getTitle = null;
        this._getCells = null;
        this._onSelect = null;
    }

    protected render(): void {
        if (this._titleLbl && this._getTitle) this._titleLbl.string = this._getTitle();
        const cells = this._getCells ? this._getCells() : [];
        const usableW = this.CONTENT_W - 2 * this.MARGIN_X;

        const rows = cells.map((cell) => {
            const isDisabled = cell.state === 'disabled';
            const item = ITEM_DATA[cell.id];
            const itemType = (item as any)?.type as string || '';
            const hasDur = !!(cell.durability && cell.durability.max > 0);
            const isEquipped = !!cell.isEquipped;

            // 副行：[已装备] badge（可选）+ 耐久 / 类型标签。disabled 不显示。
            // 拼接顺序：[已装备] · 耐久 cur/max   或   [已装备] · 类型
            let subText: string | undefined;
            if (!isDisabled) {
                const parts: string[] = [];
                if (isEquipped) parts.push('[已装备]');
                if (hasDur) parts.push(`耐久 ${Math.max(0, cell.durability!.cur)}/${cell.durability!.max}`);
                else if (item?.desc) parts.push(this.getTypeLabel(itemType));
                if (parts.length > 0) subText = parts.join(' · ');
            }

            const id = cell.id;
            const onTap = (id !== 'empty' && id !== 'msg')
                ? () => { if (this._onSelect) this._onSelect(id); }
                : undefined;

            return new ModalRow({
                width: usableW,
                name: cell.name,
                nameSize: this.NAME_SIZE,
                nameColor: isDisabled ? C.cellTextDisabled : C.cellText,
                align: 'left',
                leftIcon: BagPanel.TYPE_COLORS[itemType] || C.cellCount,
                leftIconSize: this.ICON_SIZE,
                subText,
                subSize: this.SUB_SIZE,
                subColor: new Color(140, 130, 115),
                meta: typeof cell.count === 'number' ? `×${cell.count}` : undefined,
                metaSize: this.COUNT_SIZE,
                metaColor: C.cellCount,
                bg: isDisabled ? C.cellBgDisabled : C.cellBg,
                stroke: isDisabled ? C.cellStrokeDisabled : C.cellStroke,
                strokeW: 0.5,
                radius: 6,
                disabled: isDisabled,
                onTap,
            });
        });

        this._list.setRows(rows);
    }

    /** 取类型中文短标签（用于副标题显示） */
    private getTypeLabel(type: string): string {
        const map: Record<string, string> = {
            weapon: '武器', equip: '装备', head: '头部', body: '身体',
            foot: '足部', neck: '颈部', tool: '工具', food: '食物',
            cooked: '熟食', mat: '材料', met: '材料', material: '材料',
            quest: '任务道具', special: '特殊', art: '艺术品',
        };
        return map[type] || type || '';
    }
}
