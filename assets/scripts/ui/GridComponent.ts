/**
 * GridComponent.ts - 通用网格容器
 * 核心组件：接收 GridPage 数据，动态生成/复用 GridCell，处理触摸事件
 */

import { _decorator, Component, Node, Label, Prefab, instantiate, ScrollView, Vec3, UITransform, Sprite, Color, ScrollBar, Graphics, Widget } from 'cc';
import { GridPage, GridCellData } from '../data/types';
import { GridCell } from './GridCell';
import { GridNavigator } from '../core/GridNavigator';
import { EventBus, GameEvents } from '../core/EventBus';

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

    onLoad(): void {
        // 监听 UI 刷新事件
        this._eventBus.on(GameEvents.UI_REFRESH, this.onUIRefresh.bind(this));

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
            gfx.fillColor = new Color(245, 240, 230, 255);
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
            handleSprite.color = new Color(180, 160, 130, 160);
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
        this._eventBus.off(GameEvents.UI_REFRESH, this.onUIRefresh.bind(this));
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
            this.titleLabel.color = new Color(107, 68, 35, 255);
        }
        // 面包屑（浅棕小字，完全不透明确保可读）
        if (this.breadcrumbLabel) {
            this.breadcrumbLabel.string = this._navigator.breadcrumbs.join(' > ');
            this.breadcrumbLabel.color = new Color(156, 139, 110, 255);
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
