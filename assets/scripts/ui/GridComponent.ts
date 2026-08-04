/**
 * GridComponent.ts - 通用网格容器
 * 核心组件：接收 GridPage 数据，动态生成/复用 GridCell，处理触摸事件
 */

import { _decorator, Component, Node, Label, ScrollView, Vec3, UITransform, Sprite, ScrollBar, Color, Widget, Graphics } from 'cc';
import { UIShape, UILabel } from './widgets';
import { GridPage, GridCellData } from '../data/types';
import { GridCell } from './GridCell';
import { resolveCellLayout, CellLayoutContext } from './cellLayout';
import { GridNavigator } from '../core/GridNavigator';
import { EventBus, GameEvents } from '../core/EventBus';
import { C } from './theme';

const { ccclass, property } = _decorator;

@ccclass('GridComponent')
export class GridComponent extends Component {
    @property(Label)
    titleLabel: Label | null = null;

    @property(Label)
    breadcrumbLabel: Label | null = null;

    @property(Node)
    contentNode: Node | null = null;

    @property(Node)
    backButton: Node | null = null;

    @property(ScrollView)
    scrollView: ScrollView | null = null;

    /** 列数 */
    @property
    columns: number = 4;

    /** 格子间距 */
    @property
    cellSpacing: number = 8;

    /** 顶部内边距（首行格子顶部与 content 顶边的距离） */
    @property
    topPadding: number = 80;

    /** 底部内边距（末行格子底部与 content 底边的距离） */
    @property
    bottomPadding: number = 16;

    /** 格子尺寸 */
    @property
    cellWidth: number = 160;
    @property
    cellHeight: number = 160;

    /** 横条（layout='bar'）默认行高 */
    @property
    barHeight: number = 120;

    /** 横条满宽（独立于 columns：纯列表页恒满宽，不受 columns=1 影响） */
    @property
    barWidth: number = 660;

    private get _navigator(): GridNavigator { return GridNavigator.instance; }
    private get _eventBus(): EventBus { return EventBus.instance; }
    private _cells: GridCell[] = [];
    /** 格子节点对象池（渲染时复用，避免每次全量 destroy+instantiate 的 GC 抖动） */
    private _cellPool: Node[] = [];
    /** 刷新节流标记：短时间内多次 UI_REFRESH 合并为一次渲染 */
    private _refreshScheduled = false;
    /** 标记：本帧渲染了新的格子，需要在 lateUpdate（LayoutSystem 刷新后）滚到顶部 */
    private _needScrollTop: boolean = false;
    /** 标记：view 背景已初始化（防止重复 addComponent 触发警告） */
    private _contentBgReady: boolean = false;
    /** 稳定刷新回调引用（供 on/off 精准注销，避免 .bind 每次生成新函数导致泄漏） */
    private _onRefresh = () => this.onUIRefresh();
    /** 页脚容器节点（挂在自身节点下、scrollView 下方，固定不滚动） */
    private _footerNode: Node | null = null;
    /** 页脚追踪的格子组件（用于清除） */
    private _footerCells: GridCell[] = [];
    /** 标题栏升级按钮节点（挂在 titleLabel 同级右侧，公共可复用） */
    private _upgradeBtnNode: Node | null = null;
    private _upgradeShape: UIShape | null = null;
    private _upgradeLabel: UILabel | null = null;

    /**
     * 纯代码创建格子节点（替代旧 prefab instantiate 路径）
     *
     * 优势：彻底脱离 prefab 默认值（之前因 prefab 的 NameLabel width=40 +
     * enableWrapText=true 与对象池复用叠加，导致主页 3 字中文被强制换行成竖排）。
     * 节点结构由 GridCell.onLoad() 内部按需构建，状态可预测。
     */
    private createCellNode(): Node {
        const node = new Node('Cell');
        node.addComponent(UITransform);
        node.addComponent(GridCell);
        return node;
    }

    onLoad(): void {
        // 监听刷新：UI_REFRESH（通用）+ SKILL_CHANGE（科研/事件授技解锁配方）+ EVENT_TRIGGER（事件完成解锁配方）
        this._eventBus.on(GameEvents.UI_REFRESH, this._onRefresh);
        this._eventBus.on(GameEvents.SKILL_CHANGE, this._onRefresh);
        this._eventBus.on(GameEvents.EVENT_TRIGGER, this._onRefresh);

        // 返回按钮
        if (this.backButton) {
            this.backButton.on(Node.EventType.TOUCH_START, this.onBackClick.bind(this));
        }

        // 美化滚动条
        this.styleScrollbar();

        // 内容区暖色底纹
        this.styleContentBg();

        // 【关键】用绝对坐标固定 view 尺寸（不依赖 Widget）
        // Widget 会动态改 view 的 UITransform 尺寸，导致 ScrollView 内部缓存的
        // view 尺寸（用于计算 getMaxScrollOffset / scrollToTop）与实际不符 →
        // scrollToTop 滚不到位、顶部留空白、Mask 裁剪区域错位。
        // 改为绝对定位 + 固定尺寸，ScrollView 边界计算稳定。
        this.setupFixedView();
    }

    /**
     * view 节点回归场景原始尺寸/位置（700×900 + 编辑器配置）
     * 关键：不要在此动态改 view 的 UITransform 尺寸！
     * 动态改尺寸会导致 Mask 裁剪区域与节点尺寸失配 → content/背景 Graphics 溢出 → 遮住标题/面包屑。
     * 场景原始配置下 Mask 正常工作（最初不遮标题的状态）。
     */
    private setupFixedView(): void {
        if (!this.scrollView || !this.scrollView.view) return;
        // ScrollView.view 是 UITransform，取 .node 才是节点
        const viewNode = this.scrollView.view.node;
        // 仅做防御：移除可能残留的 Widget（避免和 ScrollView 引擎预期冲突）
        const oldWidget = viewNode.getComponent(Widget);
        if (oldWidget) {
            viewNode.removeComponent(Widget);
        }
        // 不设置 contentSize / position —— 完全交给场景编辑器原始配置
    }

    /** 给 ScrollView 可视区域加暖色底纹（Graphics 直接画在 view 节点自身，确保在 content 之下） */
    private styleContentBg(): void {
        if (!this.scrollView || this._contentBgReady) return;
        // ScrollView.view 返回 UITransform，取 .node 拿到真正节点
        const t = this.scrollView.view;
        if (!t || !t.isValid) return;
        const viewNode = t.node;
        if (!viewNode || !viewNode.isValid) return;

        // 直接在 view 节点上加 Graphics（不是子节点），确保渲染顺序：节点组件 → 子节点 content
        let gfx = viewNode.getComponent(Graphics);
        if (!gfx) {
            gfx = viewNode.addComponent(Graphics);
        }
        this._contentBgReady = true;

        const ax = t.width * t.anchorX;
        const ay = t.height * t.anchorY;
        gfx.clear();
        gfx.fillColor = C.infoBg;
        gfx.rect(-ax, -ay, t.width, t.height);
        gfx.fill();
    }

    /** 设置滚动条样式：细条 + 半透明 */
    private styleScrollbar(): void {
        if (!this.scrollView) return;

        const bar = this.scrollView.verticalScrollBar;
        if (!bar) return;

        const handle = bar.handle;
        if (!handle) return;

        // 精简 handle 宽度（默认可能太宽）
        const handleTransform = handle.getComponent(UITransform);
        if (handleTransform) {
            handleTransform.setContentSize(6, handleTransform.height);
        }

        // 半透明暖棕滚动条
        const handleSprite = handle.getComponent(Sprite);
        if (handleSprite) {
            handleSprite.color = C.scrollHandle;
        }
    }

    /** start 在所有 onLoad 之后执行，主动检查是否有待渲染的网格页 */
    start(): void {
        const page = this._navigator.current;
        if (page) {
            this.renderPage(page);
        } else {
        }
    }

    onDestroy(): void {
        this._eventBus.off(GameEvents.UI_REFRESH, this._onRefresh);
        this._eventBus.off(GameEvents.SKILL_CHANGE, this._onRefresh);
        this._eventBus.off(GameEvents.EVENT_TRIGGER, this._onRefresh);
        this.unscheduleAllCallbacks();
        this.clearFooter();
        // 释放对象池节点，避免泄漏
        for (const n of this._cellPool) { if (n && n.isValid) n.destroy(); }
        this._cellPool = [];
        if (this._upgradeBtnNode) { this._upgradeBtnNode.destroy(); this._upgradeBtnNode = null; }
    }

    /** UI 刷新回调（节流：短时间内多次 UI_REFRESH 合并为一次渲染，避免长列表全量重建抖动） */
    private onUIRefresh(): void {
        if (this._refreshScheduled) return;
        this._refreshScheduled = true;
        this.scheduleOnce(() => {
            this._refreshScheduled = false;
            const page = this._navigator.current;
            if (page) this.renderPage(page);
        }, 0.05);
    }

    /** 渲染网格页 */
    renderPage(page: GridPage): void {
        // 标题（深棕 + 偏大字号风格）
        if (this.titleLabel) {
            this.titleLabel.string = page.title;
            this.titleLabel.color = C.title;
        }
        // 标题栏升级按钮（公共可复用：床铺/大箱子/水井等可升级建筑统一走此接口）
        this.renderUpgradeBtn(page);
        // 面包屑（浅棕小字，完全不透明确保可读）
        if (this.breadcrumbLabel) {
            this.breadcrumbLabel.string = this._navigator.breadcrumbs.join(' > ');
            this.breadcrumbLabel.color = C.sub;
        }
        // 返回按钮显隐 + 文字（深度=2 时显示「主页」表示直接回首页）
        if (this.backButton) {
            this.backButton.active = this._navigator.canGoBack;
            const depth = this._navigator.depth;
            const lbl = this.backButton.getComponentInChildren(Label);
            if (lbl) {
                lbl.string = depth === 2 ? '主页' : '返回';
            }
        }
        // 列数覆盖
        if (page.columns) {
            this.columns = page.columns;
        }
        // 如果页面提供了 rebuild 回调，刷新 cells（确保 pop 回列表时数据/msg 最新）
        if (page.rebuild) {
            page.cells = page.rebuild();
        }
        // 渲染格子（渲染完成后会在 renderCells 内部重置滚动位置）
        this.renderCells(page.cells, page.onCellClick);
        // 渲染页脚（固定在 scrollView 下方，不随内容滚动）
        this.renderFooter(page);
    }

    /** 渲染格子列表（逐格流式布局，支持方格 + 横条同页混排） */
    private renderCells(cells: GridCellData[], onClick?: (index: number, cell: GridCellData) => void): void {
        // 清除旧格子（只销毁追踪到的节点，不破坏 contentNode 结构）
        this.clearCells();

        if (!this.contentNode) {
            return;
        }

        // 清除 content 上残留的 Label 组件
        const labels = this.contentNode.getComponents(Label);
        for (const lbl of labels) { if (lbl.isValid) lbl.destroy(); }

        // 页面级布局上下文
        const columns = this.columns;
        const tileW = this.cellWidth;
        const tileH = this.cellHeight;
        const spacing = this.cellSpacing;
        const tileGridW = columns * tileW + (columns - 1) * spacing;
        // content 内宽取「方格网格宽」与「横条满宽」的较大者，确保列表页横条不被裁切
        const contentInnerW = Math.max(tileGridW, this.barWidth);
        const ctx: CellLayoutContext = { columns, tileW, tileH, spacing, contentInnerW, barWidth: this.barWidth, barH: this.barHeight };

        // 解析每格布局
        const items = cells.map(c => ({ data: c, L: resolveCellLayout(c, ctx) }));

        // ── 第一遍：流式定位，算出每格的占位宽度/高度/中心 x / 顶部 y（从 content 顶向下计） ──
        const edgePad = 16;
        const halfInner = contentInnerW / 2;
        let topY = this.topPadding;
        let rowH = 0;
        let rowUsedW = 0;
        let xCursor = -halfInner;
        const flow: { L: typeof items[number]['L']; w: number; h: number; cx: number; topY: number }[] = [];
        for (const it of items) {
            const w = it.L.width;
            const h = it.L.height;
            const isFullRow = w >= contentInnerW - 1;            // 整行宽（横条）→ 必须独占一行
            const fitsInRow = xCursor + w <= halfInner + 0.5;    // 右边界不超出内容区内宽
            if (rowUsedW > 0 && (isFullRow || !fitsInRow)) {
                // 换行
                topY += rowH + spacing;
                rowUsedW = 0;
                rowH = 0;
                xCursor = -halfInner;
            }
            const cx = xCursor + w / 2;
            flow.push({ L: it.L, w, h, cx, topY });
            xCursor += w + spacing;
            rowUsedW += w + spacing;
            rowH = Math.max(rowH, h);
        }
        const contentHeight = Math.max(topY + rowH + this.bottomPadding, 500);
        const contentWidth = contentInnerW + edgePad * 2;

        // 设置 content 容器 —— 只设置尺寸（锚点/位置由场景编辑器管理，绝不改）
        let contentTransform = this.contentNode.getComponent(UITransform);
        if (!contentTransform) {
            contentTransform = this.contentNode.addComponent(UITransform);
        }
        contentTransform.setContentSize(contentWidth, contentHeight);

        // ── 第二遍：创建/复用节点、设尺寸、按 content 锚点(0.5,0.5) 定位 ──
        for (let i = 0; i < flow.length; i++) {
            const f = flow[i];
            const cellData = cells[i];
            // 复用对象池节点（无则新建），避免每次全量重建
            const node = this._cellPool.length > 0
                ? this._cellPool.pop()!
                : this.createCellNode();
            node.active = true;
            node.setParent(this.contentNode);
            // 清除上一轮可能残留的触摸监听，防止重复绑定叠加
            node.off(Node.EventType.TOUCH_START);
            node.off(Node.EventType.TOUCH_END);
            node.off(Node.EventType.TOUCH_CANCEL);

            let cellTransform = node.getComponent(UITransform);
            if (!cellTransform) {
                cellTransform = node.addComponent(UITransform);
            }
            // 【关键】按解析布局强制设置尺寸（不依赖任何默认值）
            cellTransform.setContentSize(f.w, f.h);

            // content 锚点 (0.5,0.5)：y=0 在中心，正数向上/顶部方向
            // 该格中心 = contentHeight/2 - (顶部 y + 自身半高)
            const localY = contentHeight / 2 - (f.topY + f.h / 2);
            node.setPosition(new Vec3(f.cx, localY, 0));

            const cell = node.getComponent(GridCell) || node.addComponent(GridCell);
            cell.cancelLongPressDetect();
            cell.setLayout(f.L);
            cell.setData(cellData);
            cell.setOnClick((clickedCell) => {
                if (onClick) {
                    onClick(cells.indexOf(clickedCell.data!), clickedCell.data!);
                }
            });

            node.on(Node.EventType.TOUCH_START, () => { cell.startLongPressDetect(); });
            node.on(Node.EventType.TOUCH_END, () => { cell.cancelLongPressDetect(); cell.handleClick(); });
            node.on(Node.EventType.TOUCH_CANCEL, () => { cell.cancelLongPressDetect(); });

            this._cells.push(cell);
        }
        // 标记：下一帧 lateUpdate（LayoutSystem 刷新 content 尺寸后）滚到顶部。
        this._needScrollTop = true;
    }

    /**
     * 渲染页脚固定区域（ScrollView 外部，不随内容滚动）
     *
     * 布局策略：
     * - 页脚节点挂在 GridComponent 自身节点下，作为 scrollView 的兄弟节点
     * - 定位在 scrollView view 的底部边缘下方（y = viewBottom - footerHeight/2）
     * - 页脚使用 list 样式满宽渲染（每格一个可点击行/按钮）
     */

    /**
     * 渲染标题栏升级按钮（公共可复用）。
     * 挂在 titleLabel 同级右侧，小药丸样式（暖杏色底+描边），点击走 page.onUpgradeClick。
     * 无 upgradeInfo 时隐藏/销毁按钮节点。
     */
    private renderUpgradeBtn(page: GridPage): void {
        if (!page.upgradeInfo) {
            // 无升级需求 → 清理
            if (this._upgradeBtnNode) {
                this._upgradeBtnNode.destroy();
                this._upgradeBtnNode = null;
            }
            return;
        }

        const info = page.upgradeInfo;

        // 创建/复用按钮节点
        if (!this._upgradeBtnNode || !this._upgradeBtnNode.isValid) {
            this._upgradeBtnNode = new Node('UpgradeBtn');
            this.node.addChild(this._upgradeBtnNode);
        }

        const btn = this._upgradeBtnNode;
        btn.active = true;

        // 尺寸与位置：紧贴 titleLabel 右侧
        const BTN_W = 120;
        const BTN_H = 34;
        let btnTf = btn.getComponent(UITransform);
        if (!btnTf) btnTf = btn.addComponent(UITransform);
        btnTf.setContentSize(BTN_W, BTN_H);

        // 定位：紧贴 titleLabel 右侧（动态读取标题 Y 坐标，适配容器缩放后的位置）
        // ⚠️ titleLabel 是 Label【组件】引用，position 在 Node 上 → 必须走 .node.position
        const titleNode = this.titleLabel ? this.titleLabel.node : null;
        const titleY = titleNode ? titleNode.position.y : 515;
        const titleTf = titleNode ? titleNode.getComponent(UITransform) : null;
        const titleW = titleTf ? titleTf.width : 112;
        btn.setPosition(titleW / 2 + 8 + BTN_W / 2, titleY, 0);

        // 背景（UIShape 药丸，按状态着色；复用同一 shape 每次重绘）
        const R = 10;
        if (!this._upgradeShape || !this._upgradeShape.node.isValid) {
            this._upgradeShape = new UIShape('UpgradeBg');
            this._upgradeShape.node.setParent(btn);
        }
        const shape = this._upgradeShape!;
        let fill: Color, stroke: Color;
        if (info.state === 'maxed') {
            fill = new Color(220, 218, 212);        // 浅灰
            stroke = new Color(190, 188, 182);
        } else if (info.state === 'disabled') {
            fill = new Color().fromHEX('#EDE8D5');   // 浅杏色
            stroke = new Color().fromHEX('#D0C9B0');
        } else {
            fill = new Color().fromHEX('#EDE8D5');   // 暖杏色
            stroke = new Color().fromHEX('#C9B87A');  // 金描边
        }
        shape.gfx.clear();
        shape.rect(BTN_W, BTN_H, fill, R, stroke, 1);

        // 文字（UILabel 子节点，居中覆盖药丸；复用同一 label 每次改文字/颜色）
        if (!this._upgradeLabel || !this._upgradeLabel.node.isValid) {
            this._upgradeLabel = new UILabel('', { size: 14, width: BTN_W, height: BTN_H, align: 'center' });
            this._upgradeLabel.node.setParent(btn);
        }
        const ulabel = this._upgradeLabel!;
        ulabel.setText(info.state === 'maxed' ? '已满级' : info.label);
        if (info.state === 'maxed') {
            ulabel.setColor(new Color().fromHEX('#888780')); // 灰色文字
        } else if (info.state === 'disabled') {
            ulabel.setColor(new Color().fromHEX('#A89F80')); // 暗杏色文字
        } else {
            ulabel.setColor(new Color().fromHEX('#8B6914')); // 金棕色文字
        }

        // 点击事件（仅 normal 状态响应）
        // 先移除旧监听防重复绑定
        btn.off(Node.EventType.TOUCH_END);
        if (info.state === 'normal' && page.onUpgradeClick) {
            btn.on(Node.EventType.TOUCH_END, () => page.onUpgradeClick!());
        }
    }

    private renderFooter(page: GridPage): void {
        // 先清除旧页脚
        this.clearFooter();

        if (!page.footer) return;
        const footerCells = page.footer();
        if (!footerCells || footerCells.length === 0) return;

        // 懒创建页脚容器
        if (!this._footerNode || !this._footerNode.isValid) {
            this._footerNode = new Node('GridFooter');
            this.node.addChild(this._footerNode);
        }
        // 清空残留子节点
        const oldChildren = [...this._footerNode.children];
        for (const ch of oldChildren) { if (ch.isValid) ch.destroy(); }
        this._footerCells = [];

        // 页脚参数：满宽(700)，单列列表样式，每行高 70
        const footerW = 700;
        const rowH = 70;
        const gap = 8;
        const totalFooterH = footerCells.length * rowH + (footerCells.length - 1) * gap + 16;

        // 计算 footer 容器位置（中心 y）：紧贴 scrollView view 底部下方。
        // 从场景布局推算：view 是 ScrollView 子节点、ScrollView 是 GridComponent 自身节点子节点，
        // 且三者局部坐标均为 (0,0)、view 锚点 (0.5,0.5)。故 view 中心在 GridComponent 局部坐标 = (0,0)，
        // view 底边 = -viewH*anchorY（常量，无需运行时读 Node 坐标，规避本构建 getPosition 不可用问题）。
        const GAP = 10;
        let footerY = -460; // 兜底：view 约 900 高时底部下方的中心估值
        if (this.scrollView && this.scrollView.view && this.scrollView.view.isValid) {
            const viewTf = this.scrollView.view; // ScrollView.view 本身即 UITransform
            if (viewTf) {
                const viewH = viewTf.height;
                const anchorY = viewTf.anchorY; // 通常 0.5
                const viewBottom = -(viewH * anchorY);
                footerY = viewBottom - GAP - totalFooterH / 2;
            }
        }

        // 页脚容器 UITransform
        let footerTf = this._footerNode.getComponent(UITransform);
        if (!footerTf) footerTf = this._footerNode.addComponent(UITransform);

        footerTf.setContentSize(footerW, totalFooterH);
        this._footerNode.setPosition(0, footerY, 0);

        // 给页脚加背景（UIShape 圆角矩形 + 描边，替代手绘 Graphics）
        const fbg = new UIShape('FooterBg').rect(footerW, totalFooterH, C.panelBg, 10, C.panelBorder, 1);
        fbg.node.setParent(this._footerNode);
        fbg.node.setPosition(0, 0, 0);

        // 逐格创建页脚格子（纯代码工厂，与正文格子一致；页脚统一走横条布局）
        const fctx: CellLayoutContext = {
            columns: 1,
            tileW: footerW - 32,
            tileH: rowH,
            spacing: gap,
            contentInnerW: footerW - 32,
            barWidth: footerW - 32,
            barH: rowH,
        };
        const halfFH = totalFooterH / 2;
        for (let i = 0; i < footerCells.length; i++) {
            const fd = footerCells[i];
            const fnode = this.createCellNode();
            fnode.setParent(this._footerNode);

            const fL = resolveCellLayout(fd, fctx, { defaultKind: 'bar' });

            let fcTf = fnode.getComponent(UITransform);
            if (!fcTf) fcTf = fnode.addComponent(UITransform);
            fcTf.setContentSize(footerW - 32, rowH);

            // 定位：从顶部开始排列
            const fy = halfFH - 8 - rowH / 2 - i * (rowH + gap);
            fnode.setPosition(0, fy, 0);

            const fcell = fnode.getComponent(GridCell) || fnode.addComponent(GridCell);
            fcell.setLayout(fL);
            fcell.setData(fd);
            fcell.setOnClick((clickedCell) => {
                if (page.onFooterClick) {
                    page.onFooterClick(footerCells.indexOf(clickedCell.data!), clickedCell.data!);
                }
            });

            fnode.on(Node.EventType.TOUCH_START, () => { fcell.startLongPressDetect(); });
            fnode.on(Node.EventType.TOUCH_END, () => { fcell.cancelLongPressDetect(); fcell.handleClick(); });
            fnode.on(Node.EventType.TOUCH_CANCEL, () => { fcell.cancelLongPressDetect(); });

            this._footerCells.push(fcell);
        }
    }

    /** 仅清除页脚（不触 cells，供 renderFooter 内部复用） */
    private clearFooter(): void {
        for (const cell of this._footerCells) {
            if (cell && cell.node && cell.node.isValid) {
                cell.node.destroy();
            }
        }
        this._footerCells = [];
        if (this._footerNode && this._footerNode.isValid) {
            this._footerNode.destroy();
            this._footerNode = null;
        }
    }

    lateUpdate(): void {
        if (!this._needScrollTop) return;
        this._needScrollTop = false;

        const sv = this.scrollView;
        if (!sv || !sv.isValid) return;

        // content 锚点已是标准 (0.5,0.5)、position (0,0,0)，
        // 初始时 content 中心与 view 中心重合 → 显示的是内容中段而非顶部。
        // 必须滚到顶部才能看到第一条数据。
        // 延迟到 lateUpdate（LayoutSystem 刷新 content 尺寸、ScrollView 边界重算之后）
        // 再调用，避免基于旧边界算出错误偏移。
        sv.stopAutoScroll();
        sv.scrollToTop(0);
    }

    /** 清除所有格子（双重保险：追踪列表 + 扫描残留） */
    private clearCells(): void {
        // 第一遍：将追踪到的动态格子节点回收到对象池（不销毁，下次渲染复用）
        for (const cell of this._cells) {
            if (cell && cell.node && cell.node.isValid) {
                const node = cell.node;
                node.removeFromParent();
                node.active = false;
                this._cellPool.push(node);
            }
        }
        this._cells = [];

        // 清除页脚格子（数量少，仍走销毁）
        for (const cell of this._footerCells) {
            if (cell && cell.node && cell.node.isValid) {
                cell.node.destroy();
            }
        }
        this._footerCells = [];

        // 第二遍：安全网——扫描 contentNode 上残留的 GridCell 子节点（仅销毁非池化节点）
        if (this.contentNode && this.contentNode.isValid) {
            const children = [...this.contentNode.children]; // 快照，避免迭代时修改
            for (const child of children) {
                if (child && child.isValid && child.getComponent(GridCell)) {
                    child.removeFromParent();
                    child.destroy();
                }
            }
        }
    }

    /** 返回上一级（深度=2 时直接回主页） */
    private onBackClick(): void {
        if (this._navigator.depth === 2) {
            this._navigator.popTo(1);  // 标签页模式：直接回首页
        } else {
            this._navigator.pop();      // 普通层级：返回上一页
        }
    }
}
