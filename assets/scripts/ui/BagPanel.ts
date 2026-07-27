import { _decorator, Node, UITransform } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { S } from './theme';
import { GridCellData } from '../data/types';
import { UIGrid, UILabel, UIShape } from './widgets';

const { ccclass } = _decorator;

/**
 * 背包弹窗面板（独立于 GridNavigator 导航栈的模态窗口）
 * 目的：背包以弹窗形式呈现，不再 push 进导航栈，避免污染面包屑「主页 > xxx」逻辑。
 * 用法：show(getTitle, getCells, onSelect)，内部保存三个回调，refresh() 可原地重建列表。
 */
@ccclass('BagPanel')
export class BagPanel extends ModalPanel {
    protected buildContentContainer = false;   // 使用自带滚动视图，不需要基类 _content
    private _getTitle: (() => string) | null = null;
    private _getCells: (() => GridCellData[]) | null = null;
    private _onSelect: ((id: string) => void) | null = null;

    private _contentNode: Node | null = null;
    private _scrollNode: Node | null = null;
    private _scrollT: UITransform | null = null;

    // 网格布局参数
    private readonly COLS = 4;
    private readonly CONTENT_W = 600;
    private readonly MARGIN_X = 12;
    private readonly GAP_X = 8;
    private readonly GAP_Y = 10;
    private readonly CELL_H = 108;
    private readonly TOP_PADDING = 20;
    private readonly BOTTOM_PADDING = 24;

    protected buildSkeleton(): void {
        super.buildSkeleton();
        const s = this.mkScroll(this._panel, 0, this.panelH / 2 - 110, this.CONTENT_W, 700);
        this._scrollNode = s.view;
        this._scrollT = s.view.getComponent(UITransform);
        this._contentNode = s.content;
    }

    /**
     * 显示背包弹窗
     * @param getTitle  返回标题（每次 refresh 重新求值，物品数变化时同步）
     * @param getCells  返回背包格子数据（每次 refresh 重新求值）
     * @param onSelect  点击某物品格子后的回调，参数为 itemId
     */
    show(getTitle: () => string, getCells: () => GridCellData[], onSelect: (id: string) => void): void {
        this._getTitle = getTitle;
        this._getCells = getCells;
        this._onSelect = onSelect;
        super.show(getTitle());
    }

    /** 原地重建列表（装备/使用/丢弃后调用，无需重新 show） */
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
        const rows = Math.max(1, Math.ceil(cells.length / this.COLS));
        const totalHeight = this.TOP_PADDING + rows * this.CELL_H + (rows - 1) * this.GAP_Y + this.BOTTOM_PADDING;

        const actualScrollH = this.updateLayout(totalHeight);

        const contentT = this._contentNode.getComponent(UITransform);
        if (contentT) contentT.setContentSize(this.CONTENT_W, Math.max(totalHeight, actualScrollH));

        const usable = this.CONTENT_W - 2 * this.MARGIN_X;
        const cellW = (usable - (this.COLS - 1) * this.GAP_X) / this.COLS;

        // 网格布局：UIGrid 自动算行列坐标，不再手写 startX/x/y
        const grid = new UIGrid().cols(this.COLS).cellSize(cellW, this.CELL_H)
            .gap(this.GAP_X, this.GAP_Y)
            .padding(this.TOP_PADDING, this.BOTTOM_PADDING, this.MARGIN_X, this.MARGIN_X);
        for (const cell of cells) grid.add(this.buildCell(cell, cellW));
        grid.mount(this._contentNode);
        grid.pos(0, -grid.h / 2, 0);   // content anchor(0.5,1)，网格顶贴容器顶

        if (this._contentNode) this._contentNode.setPosition(0, 0, 0);
    }

    /** 构建单个背包格（UIShape 底 + 名称/数量/耐久条），可点击 */
    private buildCell(cell: GridCellData, cellW: number): UIShape {
        const isDisabled = cell.state === 'disabled';
        const box = new UIShape(`Cell_${cell.id}`).rect(
            cellW, this.CELL_H, isDisabled ? C.cellBgDisabled : C.cellBg, S.cellRadius,
            isDisabled ? C.cellStrokeDisabled : C.cellStroke, 1,
        );

        const hasDur = !!(cell.durability && cell.durability.max > 0);
        // 名称（有耐久时上移并压缩高度，给底部耐久条留出空间）
        const nameH = hasDur ? 44 : 64;
        const name = new UILabel(cell.name, {
            size: S.font.cellName, width: cellW - 12, height: nameH,
            color: isDisabled ? C.cellTextDisabled : C.cellText, align: 'left',
        });
        name.pos(0, hasDur ? 20 : 10);
        box.add(name);

        if (typeof cell.count === 'number') {
            // 数量：有耐久时上移到耐久条之上（y=-14），避免与底部耐久条(y≈-48)重叠
            const cnt = new UILabel(`×${cell.count}`, { size: S.font.cellCount, width: 50, height: 24, color: C.cellCount, align: 'right' });
            cnt.pos(cellW / 2 - 6 - 25, hasDur ? -14 : -this.CELL_H / 2 + 12);
            box.add(cnt);
        }

        if (hasDur) {
            const cur = Math.max(0, cell.durability!.cur);
            const ratio = Math.min(1, cur / cell.durability!.max);
            const barW = cellW - 16;
            const barH = 7;
            const barY = -this.CELL_H / 2 + 6; // -48：下移到格子底部，远离名称与数量

            const track = new UIShape('DurTrack').rect(barW, barH, C.durTrack, 3);
            track.pos(0, barY);
            const fillW = Math.max(2, barW * ratio);
            const fillColor = ratio > 0.5 ? C.durHigh : ratio > 0.25 ? C.durMid : C.durLow;
            const fill = new UIShape('DurFill').rect(fillW, barH, fillColor, 3);
            fill.pos(-barW / 2 + fillW / 2, barY);
            const durTxt = new UILabel(`${cur}/${cell.durability!.max}`, { size: S.font.durText, width: barW - 4, height: 14, color: C.durText, align: 'left' });
            durTxt.pos(0, barY + 13);
            box.add(track, fill, durTxt);
        }

        if (!isDisabled && cell.id !== 'empty' && cell.id !== 'msg') {
            box.onTap(() => { if (this._onSelect) this._onSelect(cell.id); });
        }
        return box;
    }

    /** 根据内容高度自适应面板与滚动区域尺寸 */
    private updateLayout(contentTotal: number): number {
        const titleReserve = 110;
        const bottomReserve = 30;
        const minScrollH = 240;
        const minPanelH = 400;
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
