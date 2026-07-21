/**
 * GridComponent.ts - 通用网格容器
 * 核心组件：接收 GridPage 数据，动态生成/复用 GridCell，处理触摸事件
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, ScrollView, Vec3, UITransform, Sprite, ScrollBar, Graphics, Widget } from 'cc';
import { GridPage, GridCellData } from '../data/types';
import { GridCell } from './GridCell';
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

    @property(Prefab)
    cellPrefab: Prefab | null = null;

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

    /** 列表行默认高度（type='list' 时的最小行高，实际高度按文字行数自适应） */
    @property
    listRowHeight: number = 80;

    /** 列表行左右内边距（距 content 边缘） */
    @property
    listPaddingX: number = 16;

    /** 列表模式每行文字高度估算（用于动态计算格子高度） */
    @property
    listLineHeight: number = 24;

    private get _navigator(): GridNavigator { return GridNavigator.instance; }
    private get _eventBus(): EventBus { return EventBus.instance; }
    private _cells: GridCell[] = [];
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
        const viewNode = this.scrollView.view;
        // 仅做防御：移除可能残留的 Widget（避免和 ScrollView 引擎预期冲突）
        const oldWidget = viewNode.getComponent(Widget);
        if (oldWidget) {
            viewNode.removeComponent(Widget);
        }
        // 不设置 contentSize / position —— 完全交给场景编辑器原始配置
    }

    /** 给 ScrollView 可视区域加暖色底纹 */
    private styleContentBg(): void {
        if (!this.scrollView || this._contentBgReady) return;
        const viewNode = this.scrollView.view;
        if (!viewNode) return;

        // 防御：检查节点上是否已有任意渲染组件（Graphics/Sprite/Label 等）
        // 如果已有 Graphics 则复用，否则尝试新建
        let gfx = viewNode.getComponent(Graphics);
        if (!gfx) {
            // 检查是否有其他渲染组件占用（避免 "Can't add renderable" 警告）
            const hasRenderable = viewNode.getComponent(Sprite)
                || viewNode.getComponent(Label);
            if (hasRenderable) {
                // 已有其他渲染组件，跳过 Graphics 背景绘制
                this._contentBgReady = true;
                return;
            }
            gfx = viewNode.addComponent(Graphics);
        }
        this._contentBgReady = true;
        const t = viewNode.getComponent(UITransform);
        if (t) {
            gfx.clear();
            gfx.fillColor = C.infoBg;
            const ax = t.width * t.anchorX;
            const ay = t.height * t.anchorY;
            gfx.rect(-ax, -ay, t.width, t.height);
            gfx.fill();
        }
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
        this.clearFooter();
        if (this._upgradeBtnNode) { this._upgradeBtnNode.destroy(); this._upgradeBtnNode = null; }
    }

    /** UI 刷新回调 */
    private onUIRefresh(): void {
        const page = this._navigator.current;
        if (page) {
            this.renderPage(page);
        }
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

    /** 渲染格子列表 */
    private renderCells(cells: GridCellData[], onClick?: (index: number, cell: GridCellData) => void): void {
        // 清除旧格子（只销毁追踪到的节点，不破坏 contentNode 结构）
        this.clearCells();

        if (!this.contentNode || !this.cellPrefab) {
            return;
        }

        // 清除 content 上残留的 Label 组件
        const labels = this.contentNode.getComponents(Label);
        for (const lbl of labels) { if (lbl.isValid) lbl.destroy(); }

        // 检测是否为列表模式 → 用局部变量调整参数（不污染实例属性）
        const isListMode = cells.some(c => c.type === 'list');
        const effColumns = isListMode ? 1 : this.columns;
        const effCellW = isListMode ? 660 : this.cellWidth;   // 列表满宽
        const effCellH = isListMode ? 120 : this.cellHeight;   // 列表行高足够容纳3-4行文字

        // ---- 统一走网格布局引擎 ----
        const totalRows = Math.ceil(cells.length / effColumns);
        const contentHeight = Math.max(
            this.topPadding + totalRows * effCellH + (totalRows - 1) * this.cellSpacing + this.bottomPadding,
            500
        );
        const contentWidth = effColumns * (effCellW + this.cellSpacing) + 32;

        // 设置 content 容器 —— 只设置尺寸
        // 锚点和位置由编辑器配置管理（anchor=(0.5,0.5), position=(0,0)），
        // 符合 Cocos ScrollView 的标准预期，滚动边界计算才能正确。
        // 绝不修改 anchor 或 position——ScrollView 引擎依赖这些值做滚动计算。
        let contentTransform = this.contentNode.getComponent(UITransform);
        if (!contentTransform) {
            contentTransform = this.contentNode.addComponent(UITransform);
        }
        contentTransform.setContentSize(contentWidth, contentHeight);

        // ---- 逐格创建 ----
        // 子节点定位公式适配 content 的编辑器锚点 (0.5, 0.5)：
        //   anchor(0.5,0.5) 表示 y=0 在 content 中心
        //   正 y 向上（靠近 content 顶部），负 y 向下（靠近底部）
        const halfH = contentHeight / 2;
        for (let i = 0; i < cells.length; i++) {
            const cellData = cells[i];
            const node = instantiate(this.cellPrefab);
            node.setParent(this.contentNode);

            let cellTransform = node.getComponent(UITransform);
            if (!cellTransform) {
                cellTransform = node.addComponent(UITransform);
            }
            // 【关键】强制设置尺寸（不依赖 prefab 初始值）
            cellTransform.setContentSize(effCellW, effCellH);

            // 定位公式（content 锚点 0.5,0.5 → y=0 在中心，正数向上/顶部方向）
            const row = Math.floor(i / effColumns);
            const col = i % effColumns;
            const x = (col - (effColumns - 1) / 2) * (effCellW + this.cellSpacing);
            const y = halfH - this.topPadding - effCellH / 2 - row * (effCellH + this.cellSpacing);
            node.setPosition(new Vec3(x, y, 0));

            const cell = node.getComponent(GridCell) || node.addComponent(GridCell);
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
        // 必须在 content 尺寸更新之后、且等 LayoutSystem 把尺寸传播到 ScrollView 边界后再滚，
        // 否则 scrollToTop 会基于旧边界计算出错偏移（长页偏底空白、短页只露1条）。
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

        // 定位：从场景布局常量推算，彻底不读运行时坐标（本构建 Node.getPosition/position 不可用）。
        // TitleLabel 与升级按钮同为 GridContainer(GridComponent 挂载节点) 的子节点，
        // TitleLabel 局部坐标 y=515（见 MainScene.scene），故按钮 Y 直接用该常量对齐标题中线。
        // X：标题居中 → 右缘 = titleW/2；按钮中心 = titleW/2 + 8 + BTN_W/2（titleW 从 UITransform 读，getComponent 可用）。
        const TITLE_Y = 515;
        const titleTf = this.titleLabel ? this.titleLabel.getComponent(UITransform) : null;
        const titleW = titleTf ? titleTf.width : 112;
        btn.setPosition(titleW / 2 + 8 + BTN_W / 2, TITLE_Y, 0);

        // 背景 Graphics（暖杏色药丸）
        let gfx = btn.getComponent(Graphics);
        if (!gfx) gfx = btn.addComponent(Graphics);
        gfx.clear();
        const R = 10; // 圆角半径
        if (info.state === 'maxed') {
            // 已满级：灰色标签
            gfx.fillColor.set(220, 218, 212); // 浅灰
            gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, R);
            gfx.fill();
            gfx.strokeColor.set(190, 188, 182);
            gfx.lineWidth = 1;
            gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, R);
            gfx.stroke();
        } else if (info.state === 'disabled') {
            // 材料不足：浅杏色+灰边
            gfx.fillColor.fromHEX('#EDE8D5');
            gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, R);
            gfx.fill();
            gfx.strokeColor.fromHEX('#D0C9B0');
            gfx.lineWidth = 1;
            gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, R);
            gfx.stroke();
        } else {
            // normal：暖杏色实心+金描边
            gfx.fillColor.fromHEX('#EDE8D5');
            gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, R);
            gfx.fill();
            gfx.strokeColor.fromHEX('#C9B87A');
            gfx.lineWidth = 1;
            gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, R);
            gfx.stroke();
        }

        // 文字 Label
        let lbl = btn.getComponent(Label);
        if (!lbl) lbl = btn.addComponent(Label);
        lbl.string = info.state === 'maxed' ? '已满级' : info.label;
        lbl.fontSize = 14;
        lbl.overflow = Label.Overflow.CLAMP;
        if (info.state === 'maxed') {
            lbl.color.fromHEX('#888780'); // 灰色文字
        } else if (info.state === 'disabled') {
            lbl.color.fromHEX('#A89F80'); // 暗杏色文字
        } else {
            lbl.color.fromHEX('#8B6914'); // 金棕色文字
        }
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;

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
            const viewTf = this.scrollView.view.getComponent(UITransform);
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

        // 给页脚加背景
        let fgfx = this._footerNode.getComponent(Graphics);
        if (!fgfx) fgfx = this._footerNode.addComponent(Graphics);
        fgfx.clear();
        fgfx.fillColor = C.panelBg;
        fgfx.roundRect(-footerW / 2, -totalFooterH / 2, footerW, totalFooterH, 10);
        fgfx.fill();
        fgfx.strokeColor = C.panelBorder;
        fgfx.lineWidth = 1;
        fgfx.roundRect(-footerW / 2, -totalFooterH / 2, footerW, totalFooterH, 10);
        fgfx.stroke();

        // 逐格创建页脚格子（复用 cellPrefab）
        if (!this.cellPrefab) return;

        const halfFH = totalFooterH / 2;
        for (let i = 0; i < footerCells.length; i++) {
            const fd = footerCells[i];
            const fnode = instantiate(this.cellPrefab);
            fnode.setParent(this._footerNode);

            let fcTf = fnode.getComponent(UITransform);
            if (!fcTf) fcTf = fnode.addComponent(UITransform);
            fcTf.setContentSize(footerW - 32, rowH);

            // 定位：从顶部开始排列
            const fy = halfFH - 8 - rowH / 2 - i * (rowH + gap);
            fnode.setPosition(0, fy, 0);

            const fcell = fnode.getComponent(GridCell) || fnode.addComponent(GridCell);
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
        // 第一遍：销毁追踪到的动态格子节点
        for (const cell of this._cells) {
            if (cell && cell.node && cell.node.isValid) {
                cell.node.destroy();
            }
        }
        this._cells = [];

        // 清除页脚格子
        for (const cell of this._footerCells) {
            if (cell && cell.node && cell.node.isValid) {
                cell.node.destroy();
            }
        }
        this._footerCells = [];

        // 第二遍：安全网——扫描 contentNode 上所有带 GridCell 组件的子节点
        // 防止任何异常路径导致节点创建了但没进入 _cells[] 追踪数组
        if (this.contentNode && this.contentNode.isValid) {
            const children = [...this.contentNode.children]; // 快照，避免迭代时修改
            for (const child of children) {
                if (child && child.isValid && child.getComponent(GridCell)) {
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
