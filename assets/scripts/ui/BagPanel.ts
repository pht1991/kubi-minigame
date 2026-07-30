import { _decorator, Node, Color, UITransform } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { S } from './theme';
import { GridCellData } from '../data/types';
import { UILabel, UIShape, UIVStack } from './widgets';
import { ITEM_DATA } from '../data/data';

const { ccclass } = _decorator;

/**
 * BagPanel.ts - 背包弹窗（列表视图版）
 *
 * 从 4 列网格改为单列列表视图，每行一个物品：
 *   [类型色块] 名称 · 类型标签  [+耐久条]  ...  ×数量
 *
 * 解决原网格 138px 格子宽度导致中文名/副标题截断的问题。
 * 列表行宽 ~568px，可容纳 25+ 汉字，彻底消除截断。
 */
@ccclass('BagPanel')
export class BagPanel extends ModalPanel {
    protected buildContentContainer = false;
    private _getTitle: (() => string) | null = null;
    private _getCells: (() => GridCellData[]) | null = null;
    private _onSelect: ((id: string) => void) | null = null;

    private _contentNode: Node | null = null;
    private _scrollNode: Node | null = null;
    private _scrollT: UITransform | null = null;

    // 列表布局参数（充分利用 750 设计分辨率屏宽）
    protected override panelW = 710;       // 覆盖基类默认 640，弹窗更宽
    private readonly CONTENT_W = 680;      // 内容区宽度（≈panelW - 30 左右边距）
    private readonly MARGIN_X = 14;
    private readonly ROW_H = 68;           // 每行高度（舒适列表）
    private readonly ROW_GAP = 6;         // 行间距
    private readonly ICON_SIZE = 36;      // 左侧类型色块尺寸
    private readonly TOP_PADDING = 16;
    private readonly BOTTOM_PADDING = 16;

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
        const s = this.mkScroll(this._panel, 0, this.panelH / 2 - 110, this.CONTENT_W, 700);
        this._scrollNode = s.view;
        this._scrollT = s.view.getComponent(UITransform);
        this._contentNode = s.content;
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
        if (!this._contentNode) return;
        if (this._titleLbl && this._getTitle) this._titleLbl.string = this._getTitle();

        for (const child of [...this._contentNode.children]) child.destroy();

        const cells = this._getCells ? this._getCells() : [];
        const totalHeight = this.TOP_PADDING + cells.length * this.ROW_H + (cells.length - 1) * this.ROW_GAP + this.BOTTOM_PADDING;

        const actualScrollH = this.updateLayout(totalHeight);

        const contentT = this._contentNode.getComponent(UITransform);
        if (contentT) contentT.setContentSize(this.CONTENT_W, Math.max(totalHeight, actualScrollH));

        // 垂直堆叠各行
        let y = -this.TOP_PADDING - this.ROW_H / 2;  // 从顶部开始向下排列
        for (let i = 0; i < cells.length; i++) {
            const row = this.buildListRow(cells[i]);
            row.pos(0, y, 0);
            this._contentNode!.addChild(row.node);
            y -= this.ROW_H + this.ROW_GAP;
        }

        if (this._contentNode) this._contentNode.setPosition(0, 0, 0);
    }

    /** 构建一行物品列表项：[色块图标] 名称+副标题 [+耐久] [数量] */
    private buildListRow(cell: GridCellData): UIShape {
        const isDisabled = cell.state === 'disabled';
        const item = ITEM_DATA[cell.id];
        const itemType = (item as any)?.type as string || '';
        const hasDur = !!(cell.durability && cell.durability.max > 0);

        const usableW = this.CONTENT_W - 2 * this.MARGIN_X;
        const row = new UIShape(`Row_${cell.id}`).rect(
            usableW, this.ROW_H,
            isDisabled ? C.cellBgDisabled : C.cellBg, 6,
            isDisabled ? C.cellStrokeDisabled : C.cellStroke, 0.5,
        );

        // ---- 左侧：类型色块 (28x28) ----
        const typeColor = BagPanel.TYPE_COLORS[itemType] || C.cellCount;
        const icon = new UIShape('Icon').rect(this.ICON_SIZE, this.ICON_SIZE, typeColor, 4);
        icon.pos(-usableW / 2 + this.MARGIN_X + this.ICON_SIZE / 2 + 2, 0);
        row.add(icon);

        // ---- 中部：名称 + 副标签 ----
        const textLeft = -usableW / 2 + this.MARGIN_X + this.ICON_SIZE + 10;
        const textMaxW = usableW - this.ICON_SIZE - 10 - 60;  // 右侧留 60px 给数量

        // 主名称行
        const nameLbl = new UILabel(cell.name, {
            size: 18, width: textMaxW, height: 26,
            color: isDisabled ? C.cellTextDisabled : C.cellText, align: 'left',
        });
        nameLbl.pos(textLeft + textMaxW / 2, 11);  // 上半区
        row.add(nameLbl);

        // 副标签行：类型名 或 耐久度
        if (hasDur) {
            const cur = Math.max(0, cell.durability!.cur);
            const max = cell.durability!.max;
            const ratio = Math.min(1, cur / max);
            const barW = Math.min(70, textMaxW * 0.45);
            const barH = 5;

            const track = new UIShape('DT').rect(barW, barH, C.durTrack, 2);
            track.pos(textLeft + barW / 2, -13);
            const fillW = Math.max(2, barW * ratio);
            const fColor = ratio > 0.5 ? C.durHigh : ratio > 0.25 ? C.durMid : C.durLow;
            const fill = new UIShape('DF').rect(fillW, barH, fColor, 2);
            fill.pos(textLeft + barW / 2 - barW / 2 + fillW / 2, -13);
            const durTxt = new UILabel(`${cur}/${max}`, {
                size: 12, width: 44, height: 14, color: C.durText, align: 'left',
            });
            durTxt.pos(textLeft + barW + 20, -13);
            row.add(track, fill, durTxt);
        } else if (!isDisabled && item?.desc) {
            // 无耐久时显示简短类型标签（取 desc 前 12 字或类型中文名）
            const typeLabel = this.getTypeLabel(itemType);
            const subLbl = new UILabel(typeLabel, {
                size: 13, width: textMaxW, height: 18,
                color: new Color(140, 130, 115), align: 'left',
            });
            subLbl.pos(textLeft + textMaxW / 2, -13);  // 下半区
            row.add(subLbl);
        }

        // ---- 右侧：数量 ----
        if (typeof cell.count === 'number') {
            const cnt = new UILabel(`×${cell.count}`, {
                size: S.font.cellCount, width: 60, height: 26,
                color: C.cellCount, align: 'right',
            });
            cnt.pos(usableW / 2 - this.MARGIN_X - 30, 0);  // 靠右
            row.add(cnt);
        }

        // 点击事件
        if (!isDisabled && cell.id !== 'empty' && cell.id !== 'msg') {
            row.onTap(() => { if (this._onSelect) this._onSelect(cell.id); });
        }
        return row;
    }

    /** 取类型中文短标签（用于副标题显示） */
    private getTypeLabel(type: string): string {
        const map: Record<string, string> = {
            weapon: '武器', equip: '装备', head: '头部', body: '身体',
            foot: '足部', neck: '颈部', tool: '工具', food: '食物',
            cooked: '熟食', mat: '材料', material: '材料', quest: '任务道具',
            special: '特殊', art: '艺术品',
        };
        return map[type] || type || '';
    }

    /** 根据内容高度自适应面板与滚动区域尺寸 */
    private updateLayout(contentTotal: number): number {
        const titleReserve = 110;
        const bottomReserve = 30;
        const minScrollH = 160;
        const minPanelH = 380;
        const maxPanelH = 1040;

        const scrollH = Math.max(contentTotal, minScrollH);
        let panelH = titleReserve + scrollH + bottomReserve;
        if (panelH < minPanelH) panelH = minPanelH;
        if (panelH > maxPanelH) panelH = maxPanelH;
        const actualScrollH = Math.min(scrollH, panelH - titleReserve - bottomReserve);

        this.resizePanel(panelH);

        if (this._scrollT) this._scrollT.setContentSize(this.CONTENT_W, actualScrollH);
        if (this._scrollNode) this._scrollNode.setPosition(0, panelH / 2 - titleReserve, 0);

        return actualScrollH;
    }
}
