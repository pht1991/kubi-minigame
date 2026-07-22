import { _decorator, Node, Label, UITransform, Graphics, EventTouch, NodeEventType } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { S } from './theme';
import { GridCellData } from '../data/types';

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
        const startX = -this.CONTENT_W / 2 + this.MARGIN_X + cellW / 2;

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const col = i % this.COLS;
            const row = Math.floor(i / this.COLS);
            const x = startX + col * (cellW + this.GAP_X);
            const y = -this.TOP_PADDING - this.CELL_H / 2 - row * (this.CELL_H + this.GAP_Y);

            const cellNode = new Node(`Cell_${i}`);
            const cellT = cellNode.addComponent(UITransform);
            cellT.setContentSize(cellW, this.CELL_H);
            cellT.setAnchorPoint(0.5, 0.5);
            cellNode.setPosition(x, y, 0);
            cellNode.setParent(this._contentNode);

            const isDisabled = cell.state === 'disabled';

            const bgGfx = cellNode.addComponent(Graphics);
            this.mkRect(
                bgGfx, -cellW / 2, -this.CELL_H / 2, cellW, this.CELL_H, S.cellRadius,
                isDisabled ? C.cellBgDisabled : C.cellBg,
                isDisabled ? C.cellStrokeDisabled : C.cellStroke, 1,
            );

            const hasDur = !!cell.durability;
            // 有耐久时名字区上移并加高，给底部耐久条留出独立空间
            const nameY = hasDur ? 22 : 10;
            const nameH = hasDur ? 50 : 64;
            this.mkInline(
                cellNode, -cellW / 2 + 6, nameY, cellW - 12, nameH,
                cell.name, S.font.cellName, isDisabled ? C.cellTextDisabled : C.cellText,
            );

            if (typeof cell.count === 'number') {
                // 数量标签贴在格子右下角（anchorX=1 右对齐）
                this.mkText(
                    cellNode, cellW / 2 - 6, -this.CELL_H / 2 + 12, 50, 24,
                    `×${cell.count}`, S.font.cellCount, C.cellCount,
                    { align: 'right', anchorX: 1, anchorY: 0.5 },
                );
            }

            if (cell.durability && cell.durability.max > 0) {
                const cur = Math.max(0, cell.durability.cur);
                const ratio = Math.min(1, cur / cell.durability.max);
                const barW = cellW - 16;
                const barH = 7;
                const barY = -this.CELL_H / 2 + 8;

                const trackNode = new Node('DurTrack');
                const trackT = trackNode.addComponent(UITransform);
                trackT.setContentSize(barW, barH);
                trackNode.setPosition(0, barY, 0);
                trackNode.setParent(cellNode);
                const trackG = trackNode.addComponent(Graphics);
                trackG.fillColor = C.durTrack;
                trackG.roundRect(-barW / 2, -barH / 2, barW, barH, 3); trackG.fill();

                const fillW = Math.max(2, barW * ratio);
                const fillColor = ratio > 0.5 ? C.durHigh
                    : ratio > 0.25 ? C.durMid
                    : C.durLow;
                const fillNode = new Node('DurFill');
                const fillT = fillNode.addComponent(UITransform);
                fillT.setContentSize(fillW, barH);
                fillNode.setPosition(-barW / 2 + fillW / 2, barY, 0);
                fillNode.setParent(cellNode);
                const fillG = fillNode.addComponent(Graphics);
                fillG.fillColor = fillColor;
                fillG.roundRect(-fillW / 2, -barH / 2, fillW, barH, 3); fillG.fill();

                // 耐久文字放在进度条上方，不与名字区重叠
                this.mkInline(cellNode, -barW / 2 + 2, barY + 13, barW - 4, 14, `${cur}/${cell.durability.max}`, S.font.durText, C.durText);
            }

            if (!isDisabled && cell.id !== 'empty' && cell.id !== 'msg') {
                cellNode.on(NodeEventType.TOUCH_END, (event: EventTouch) => {
                    event.propagationStopped = true;
                    if (this._onSelect) this._onSelect(cell.id);
                });
            }
        }

        if (this._contentNode) this._contentNode.setPosition(0, 0, 0);
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
