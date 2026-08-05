/**
 * ModalScrollList.ts - 弹窗可滚动列表容器（复用 UIVStack + ModalPanel.mkScroll）
 *
 * 封装「mkScroll 创建 + VStack 装载行 + content 高度自适应 + 面板 resizePanel 自适应」整套逻辑，
 * 消除 DialogPanel.updateLayout / BagPanel.updateLayout 中重复的「算 scrollH → 钳 min/max →
 * resizePanel → 重定位 scroll」数学。
 *
 * 用法（在 ModalPanel 子类 buildSkeleton 里）：
 *   this._list = this.createScrollList({ parent: this._panel, width: 600, viewH: 700, ... });
 * 在 render 里：
 *   this._list.setRows(rows);   // rows: UINode[]（如 ModalRow[]）
 *
 * 自适应高度逻辑抽成可配 min/max 边界，适配不同弹窗（DialogPanel max 900 / BagPanel max 1040）。
 * autoResizePanel=false 时只管 content 尺寸、不动面板（如 HarvestModal 固定 panelH）。
 */

import { Node, UITransform, ScrollView } from 'cc';
import { UIVStack } from './UILayout';
import { UINode } from './UINode';

export interface ListLayoutResult {
    /** 内容高度（含最小占位 minScrollH） */
    scrollH: number;
    /** 面板高度（钳 min/max 后） */
    panelH: number;
    /** 实际滚动视口高度（铺满分配给滚动区的区域） */
    actualScrollH: number;
}

/**
 * 弹窗滚动区高度推导——全局唯一真相源。
 * 输入内容总高 + 预留参数，输出面板高与视口高。
 * 调用方必须把 view(视口) 高度设为 actualScrollH、content 高度设为 max(totalH, actualScrollH)，
 * 否则 content < view 会出现「未铺满」空白，且 view 可能高过面板导致 Mask 裁剪错位。
 */
export function computeListLayout(totalH: number, o: ModalScrollListOpts): ListLayoutResult {
    const titleReserve = o.titleReserve ?? 110;
    const bottomReserve = o.bottomReserve ?? 30;
    const minScrollH = o.minScrollH ?? 160;
    const minPanelH = o.minPanelH ?? 380;
    const maxPanelH = o.maxPanelH ?? 1040;

    const scrollH = Math.max(totalH, minScrollH);
    let panelH = titleReserve + scrollH + bottomReserve;
    panelH = Math.max(minPanelH, Math.min(maxPanelH, panelH));
    const actualScrollH = Math.min(scrollH, panelH - titleReserve - bottomReserve);
    return { scrollH, panelH, actualScrollH };
}

export interface ModalScrollListOpts {
    /** 列表区宽度 */
    width: number;
    /** 初始可视高度（内容不足时的滚动视口高度） */
    viewH?: number;
    /** 行间距 */
    gap?: number;
    /** 内容上下内边距 */
    padT?: number;
    padB?: number;
    /** 滚动区最小高度（内容不足时撑到此值） */
    minScrollH?: number;
    /** 面板最小 / 最大高度（钳制） */
    minPanelH?: number;
    maxPanelH?: number;
    /** 面板顶到滚动区顶的预留（标题区） */
    titleReserve?: number;
    /** 面板底预留 */
    bottomReserve?: number;
    align?: 'left' | 'center' | 'right';
    /** 是否随内容自适应面板高度（默认 true） */
    autoResizePanel?: boolean;
    /** 是否由本组件重定位 scroll（默认 true；自定义位置如 HarvestModal 传 false） */
    repositionScroll?: boolean;
}

export class ModalScrollList {
    readonly view: Node;
    readonly content: Node;
    readonly sv: ScrollView;
    private _o: ModalScrollListOpts;
    private _resizePanel: (h: number) => void;

    constructor(
        nodes: { view: Node; content: Node; sv: ScrollView },
        resizePanel: (h: number) => void,
        o: ModalScrollListOpts,
    ) {
        this.view = nodes.view;
        this.content = nodes.content;
        this.sv = nodes.sv;
        this._resizePanel = resizePanel;
        this._o = o;
    }

    /** 装载行并自适应尺寸。返回实际滚动可视高度。 */
    setRows(rows: UINode[]): number {
        for (const c of [...this.content.children]) c.destroy();

        const o = this._o;
        const vstack = new UIVStack()
            .gap(o.gap ?? 8)
            .align(o.align ?? 'center')
            .fixedWidth(o.width);
        for (const r of rows) vstack.add(r);
        vstack.mount(this.content);
        vstack.pos(0, -vstack.h / 2, 0);

        const totalH = vstack.h;
        const vt = this.view.getComponent(UITransform);
        const ct = this.content.getComponent(UITransform);

        // 自管面板模式（HarvestModal/TradePanel）：view 是 mkScroll 代码创建（非场景节点），
        // 无 Mask 坑，安全让视口高度跟随内容——内容少时收缩、消除底部「未铺满」死区；
        // content 始终用真实内容高（多于视口时正常可滚）。
        if (o.autoResizePanel === false) {
            const viewH = o.viewH ?? 600;
            const actualViewH = Math.min(totalH, viewH);
            if (vt) vt.setContentSize(o.width, actualViewH);
            if (ct) ct.setContentSize(o.width, totalH);
            return actualViewH;
        }

        // 自适应面板模式：高度推导全部走 computeListLayout（唯一真相源）
        const titleReserve = o.titleReserve ?? 110;
        const { panelH, actualScrollH } = computeListLayout(totalH, o);

        // 关键修复：视口高度 = 实际滚动高度（铺满分配给它的区域，消除「未铺满」空白）
        if (vt) vt.setContentSize(o.width, actualScrollH);
        // 内容高度 = 内容真实高（≥ 视口高时可滚，< 视口高时恰好铺满）
        if (ct) ct.setContentSize(o.width, Math.max(totalH, actualScrollH));

        this._resizePanel(panelH);
        if (o.repositionScroll !== false) {
            this.view.setPosition(this.view.position.x, panelH / 2 - titleReserve, 0);
        }
        return actualScrollH;
    }
}
