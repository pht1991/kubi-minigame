import { _decorator, Component, Node, Label, UITransform, Color, Graphics, ScrollView, Mask } from 'cc';
import { GridCellData } from '../data/types';

const { ccclass } = _decorator;

/**
 * 背包弹窗面板（独立于 GridNavigator 导航栈的模态窗口）
 * 目的：背包以弹窗形式呈现，不再 push 进导航栈，避免污染面包屑「主页 > xxx」逻辑。
 * 用法：show(getTitle, getCells, onSelect)，内部保存三个回调，refresh() 可原地重建列表。
 */
@ccclass('BagPanel')
export class BagPanel extends Component {
    private _maskNode: Node | null = null;
    private _panelNode: Node | null = null;
    private _titleLabel: Label | null = null;
    private _contentNode: Node | null = null;
    private _scrollView: ScrollView | null = null;
    private _panelGfx: Graphics | null = null;
    private _titleNode: Node | null = null;
    private _closeBtn: Node | null = null;
    private _scrollNode: Node | null = null;
    private _scrollT: UITransform | null = null;

    private _getTitle: (() => string) | null = null;
    private _getCells: (() => GridCellData[]) | null = null;
    private _onSelect: ((id: string) => void) | null = null;

    // 网格布局参数
    private readonly COLS = 4;
    private readonly CONTENT_W = 600;
    private readonly MARGIN_X = 12;
    private readonly GAP_X = 8;
    private readonly GAP_Y = 10;
    private readonly CELL_H = 96;
    private readonly TOP_PADDING = 20;
    private readonly BOTTOM_PADDING = 24;

    onLoad(): void {
        this.createUI();
    }

    private createUI(): void {
        // 全屏遮罩（点击关闭）
        this._maskNode = new Node('Mask');
        const maskT = this._maskNode.addComponent(UITransform);
        maskT.setContentSize(750, 1334);
        this._maskNode.setParent(this.node);
        const maskGfx = this._maskNode.addComponent(Graphics);
        maskGfx.fillColor = new Color(0, 0, 0, 90);
        maskGfx.rect(-375, -667, 750, 1334);
        maskGfx.fill();
        this._maskNode.on(Node.EventType.TOUCH_END, (event) => {
            if (event.target === this._maskNode) { event.propagationStopped = true; this.hide(); }
        });

        // 面板
        this._panelNode = new Node('Panel');
        const panelT = this._panelNode.addComponent(UITransform);
        panelT.setContentSize(640, 900);
        panelT.setAnchorPoint(0.5, 0.5);
        this._panelNode.setPosition(0, 0, 0);
        this._panelNode.setParent(this.node);
        this._panelGfx = this._panelNode.addComponent(Graphics);
        this._panelNode.on(Node.EventType.TOUCH_END, (event) => {
            event.propagationStopped = true;
        });
        // 面板 Mask：裁剪子内容到面板矩形内
        this._panelNode.addComponent(Mask).type = Mask.Type.RECT;

        // 标题
        this._titleNode = new Node('Title');
        const titleT = this._titleNode.addComponent(UITransform);
        titleT.setContentSize(560, 60);
        this._titleLabel = this._titleNode.addComponent(Label);
        this._titleLabel.fontSize = 32;
        this._titleLabel.lineHeight = 40;
        this._titleLabel.color = new Color(92, 61, 30, 255);
        this._titleLabel.string = '';
        this._titleNode.setPosition(-30, 415, 0);
        this._titleNode.setParent(this._panelNode);

        // 关闭按钮
        this._closeBtn = new Node('CloseBtn');
        const closeT = this._closeBtn.addComponent(UITransform);
        closeT.setContentSize(44, 44);
        this._closeBtn.setPosition(295, 420, 0);
        this._closeBtn.setParent(this._panelNode);
        const closeGfx = this._closeBtn.addComponent(Graphics);
        closeGfx.fillColor = new Color(200, 160, 130, 200);
        closeGfx.circle(0, 0, 20);
        closeGfx.fill();
        closeGfx.strokeColor = new Color(160, 120, 90, 255);
        closeGfx.lineWidth = 1.5;
        closeGfx.circle(0, 0, 20);
        closeGfx.stroke();
        const closeLbl = new Node('CloseLbl');
        closeLbl.setParent(this._closeBtn);
        const closeLblT = closeLbl.addComponent(UITransform);
        closeLblT.setContentSize(44, 44);
        const closeLblComp = closeLbl.addComponent(Label);
        closeLblComp.string = '×';
        closeLblComp.fontSize = 28;
        closeLblComp.color = new Color(255, 255, 255, 255);
        closeLblComp.isBold = true;
        this._closeBtn.on(Node.EventType.TOUCH_END, (event) => {
            event.propagationStopped = true;
            this.hide();
        });

        // 滚动视图
        this._scrollNode = new Node('ScrollView');
        this._scrollT = this._scrollNode.addComponent(UITransform);
        this._scrollT.setContentSize(this.CONTENT_W, 700);
        this._scrollT.setAnchorPoint(0.5, 1);
        this._scrollNode.setPosition(0, 340, 0);
        this._scrollNode.setParent(this._panelNode);
        this._scrollNode.addComponent(Mask).type = Mask.Type.RECT;
        this._scrollView = this._scrollNode.addComponent(ScrollView);
        this._scrollView.horizontal = false;
        this._scrollView.vertical = true;
        this._scrollView.inertia = true;
        this._scrollView.brake = 0.3;
        this._scrollView.elastic = true;
        this._scrollView.elasticBounceTime = 0.5;

        // 内容区域
        this._contentNode = new Node('Content');
        const contentT = this._contentNode.addComponent(UITransform);
        contentT.setContentSize(this.CONTENT_W, 700);
        contentT.setAnchorPoint(0.5, 1);
        this._contentNode.setPosition(0, 0, 0);
        this._contentNode.setParent(this._scrollNode);
        this._scrollView.content = this._contentNode;
        this._scrollView.verticalScrollBar = null;
        this._scrollView.horizontalScrollBar = null;

        this.node.active = false;
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

        const panelT = this._panelNode ? this._panelNode.getComponent(UITransform) : null;
        if (panelT) panelT.setContentSize(640, panelH);
        if (this._panelGfx) {
            this._panelGfx.clear();
            this._panelGfx.fillColor = new Color(255, 248, 240, 255);
            this._panelGfx.rect(-320, -panelH / 2, 640, panelH);
            this._panelGfx.fill();
            this._panelGfx.lineWidth = 3;
            this._panelGfx.strokeColor = new Color(200, 168, 130, 255);
            this._panelGfx.rect(-320, -panelH / 2, 640, panelH);
            this._panelGfx.stroke();
        }

        const topY = panelH / 2 - 40;
        if (this._titleNode) this._titleNode.setPosition(-30, topY, 0);
        if (this._closeBtn) this._closeBtn.setPosition(295, topY, 0);

        if (this._scrollT) this._scrollT.setContentSize(this.CONTENT_W, actualScrollH);
        if (this._scrollNode) this._scrollNode.setPosition(0, panelH / 2 - titleReserve, 0);

        return actualScrollH;
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
        this.node.active = true;
        // 置顶，确保盖在网格与底栏之上
        this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
        this.render();
    }

    /** 原地重建列表（装备/使用/丢弃后调用，无需重新 show） */
    refresh(): void {
        if (!this.node.active) return;
        this.render();
    }

    hide(): void {
        this.node.active = false;
        this._getTitle = null;
        this._getCells = null;
        this._onSelect = null;
    }

    /** 弹窗是否正在显示 */
    isShowing(): boolean {
        return this.node.active;
    }

    private render(): void {
        if (!this._contentNode) return;
        if (this._titleLabel && this._getTitle) this._titleLabel.string = this._getTitle();

        // 清除旧格子
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

            // 背景 + 边框
            const bgGfx = cellNode.addComponent(Graphics);
            bgGfx.fillColor = isDisabled ? new Color(232, 228, 222, 255) : new Color(253, 248, 240, 255);
            bgGfx.roundRect(-cellW / 2, -this.CELL_H / 2, cellW, this.CELL_H, 8);
            bgGfx.fill();
            bgGfx.lineWidth = 1;
            bgGfx.strokeColor = isDisabled ? new Color(200, 196, 190, 255) : new Color(212, 196, 176, 255);
            bgGfx.roundRect(-cellW / 2, -this.CELL_H / 2, cellW, this.CELL_H, 8);
            bgGfx.stroke();

            // 名称（有耐久条时上移并缩小，给底部耐久条留空间）
            const hasDur = !!cell.durability;
            const nameNode = new Node('Name');
            const nameT = nameNode.addComponent(UITransform);
            nameT.setContentSize(cellW - 12, this.CELL_H - (hasDur ? 44 : 24));
            nameT.setAnchorPoint(0.5, 0.5);
            nameNode.setPosition(0, hasDur ? 18 : 8, 0);
            const nameLbl = nameNode.addComponent(Label);
            nameLbl.string = cell.name;
            nameLbl.fontSize = 20;
            nameLbl.lineHeight = 24;
            nameLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
            nameLbl.verticalAlign = Label.VerticalAlign.CENTER;
            nameLbl.overflow = Label.Overflow.SHRINK;
            nameLbl.color = isDisabled ? new Color(90, 85, 80, 255) : new Color(50, 40, 30, 255);
            nameNode.setParent(cellNode);

            // 数量（右下角 ×N）
            if (typeof cell.count === 'number') {
                const cntNode = new Node('Count');
                const cntT = cntNode.addComponent(UITransform);
                cntT.setContentSize(cellW - 12, 24);
                cntT.setAnchorPoint(1, 0.5);
                cntNode.setPosition(cellW / 2 - 8, -this.CELL_H / 2 + 16, 0);
                const cntLbl = cntNode.addComponent(Label);
                cntLbl.string = `×${cell.count}`;
                cntLbl.fontSize = 18;
                cntLbl.lineHeight = 22;
                cntLbl.horizontalAlign = Label.HorizontalAlign.RIGHT;
                cntLbl.color = new Color(150, 110, 70, 255);
                cntNode.setParent(cellNode);
            }

            // 耐久度条（工具/武器类）：底部轨道 + 比例填充 + 数值，按剩余比例变色
            if (cell.durability && cell.durability.max > 0) {
                const cur = Math.max(0, cell.durability.cur);
                const ratio = Math.min(1, cur / cell.durability.max);
                const barW = cellW - 16;
                const barH = 6;
                const barY = -this.CELL_H / 2 + 9;
                // 轨道
                const trackNode = new Node('DurTrack');
                const trackT = trackNode.addComponent(UITransform);
                trackT.setContentSize(barW, barH);
                trackNode.setPosition(0, barY, 0);
                trackNode.setParent(cellNode);
                const trackG = trackNode.addComponent(Graphics);
                trackG.fillColor = new Color(214, 204, 192, 255);
                trackG.roundRect(-barW / 2, -barH / 2, barW, barH, 3);
                trackG.fill();
                // 填充（按剩余比例变色：绿>50% 黄>25% 红）
                const fillW = Math.max(2, barW * ratio);
                const fillColor = ratio > 0.5 ? new Color(96, 168, 96, 255)
                    : ratio > 0.25 ? new Color(216, 168, 64, 255)
                    : new Color(200, 80, 70, 255);
                const fillNode = new Node('DurFill');
                const fillT = fillNode.addComponent(UITransform);
                fillT.setContentSize(fillW, barH);
                fillNode.setPosition(-barW / 2 + fillW / 2, barY, 0);
                fillNode.setParent(cellNode);
                const fillG = fillNode.addComponent(Graphics);
                fillG.fillColor = fillColor;
                fillG.roundRect(-fillW / 2, -barH / 2, fillW, barH, 3);
                fillG.fill();
                // 数值（底部左侧，与右下角数量不冲突）
                const durNode = new Node('DurText');
                const durT = durNode.addComponent(UITransform);
                durT.setContentSize(barW, 14);
                durT.setAnchorPoint(0, 0.5);
                durNode.setPosition(-barW / 2, barY + 12, 0);
                const durLbl = durNode.addComponent(Label);
                durLbl.string = `${cur}/${cell.durability.max}`;
                durLbl.fontSize = 11;
                durLbl.lineHeight = 14;
                durLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
                durLbl.verticalAlign = Label.VerticalAlign.CENTER;
                durLbl.color = new Color(80, 60, 40, 255);
                durNode.setParent(cellNode);
            }

            if (!isDisabled && cell.id !== 'empty' && cell.id !== 'msg') {
                cellNode.on(Node.EventType.TOUCH_END, (event) => {
                    event.propagationStopped = true;
                    if (this._onSelect) this._onSelect(cell.id);
                });
            }
        }

        // 重置到顶部
        if (this._contentNode) this._contentNode.setPosition(0, 0, 0);
    }
}
