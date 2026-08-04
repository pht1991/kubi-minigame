/**
 * ModalPanel.ts - 公共模态弹窗基类
 *
 * 设计目的：把所有弹窗（背包 / 对话 / 交易 / 战斗 / 未来任意新弹窗）共用的
 * 「外壳 + 控件助手」集中到一处，避免同类 bug 在多个文件重复出现：
 *   - 全屏遮罩：点击关闭 + 事件 stopPropagation 防穿透
 *   - 面板：圆角描边 + RECT Mask（裁剪子内容，Cocos 3.x 必须显式设 type）
 *   - 标题 / 关闭按钮（×）
 *   - show() 时 setSiblingIndex 置顶（盖住底栏与同级弹窗）
 *   - 控件助手 mkText / mkButton / mkTab / mkRect / mkScroll / resizePanel
 *     统一内建「Label 必须放子节点（避免与 Graphics 同节点冲突）」「TOUCH 事件 stopPropagation」
 *
 * 子类只需：
 *   1. 用字段初始化设置 panelW/panelH/showMask/showClose/buildContentContainer 等
 *   2. 实现 protected abstract render() 构建自身内容（用基类 _content 或 _panel + 上述助手）
 *   3. 提供自己的 public show(...) 包装（捕获参数后调用 super.show(title)）
 */

import {
    _decorator, Component, Node, Label, UITransform, Color, Graphics,
    Mask, ScrollView, EventTouch, NodeEventType, VerticalTextAlignment, view,
} from 'cc';
import { C, S, Btn, BtnStyle } from './theme';
import { UIButton } from './widgets';
import { ModalScrollList, ModalScrollListOpts } from './widgets/ModalScrollList';
import { GameManager } from '../core/GameManager';
import { EventBus } from '../core/EventBus';
import type { DialogPanel } from './DialogPanel';

const { ccclass } = _decorator;

// 主题色统一在 ./theme 定义，这里仅转发导出以兼容既有 import { C } from './ModalPanel'
export { C };

export interface BtnRef { node: Node; label: Label; gfx: Graphics; }

/**
 * 面板所需的最小上下文（规避「面板误用未注入依赖」类崩溃）：
 * 由 MainScene 在创建面板后调用 attach(ctx) 注入。结构需与 PageContext 兼容。
 */
export interface PanelContextLike {
    gm: GameManager;
    eventBus: EventBus;
    dialogPanel: DialogPanel;
}

@ccclass('ModalPanel')
export abstract class ModalPanel extends Component {

    // ════ 子类可覆盖的配置（字段初始化在 onLoad 前执行）════
    protected panelW = 640;
    protected panelH = 900;
    protected showMask = true;     // 是否创建半透明遮罩
    protected maskClose = true;    // 点击遮罩是否关闭
    protected showClose = true;    // 是否显示右上角关闭按钮
    protected buildContentContainer = true; // 是否创建 _content 内容容器

    /** 动态可见尺寸（FIXED_WIDTH 下高度随设备变化，不再写死 750×1334） */
    protected _vsW = 750;
    protected _vsH = 1334;

    // ════ 外壳节点 ════
    protected _mask: Node | null = null;
    protected _maskGfx: Graphics | null = null;
    protected _panel!: Node;
    protected _panelGfx!: Graphics;        // Mask 形状用（GRAPHICS_RECT 读此 Graphics 做 stencil）
    protected _panelBg!: Node;             // 视觉背景（独立子节点，避免被 Mask 消费）
    protected _panelBgGfx!: Graphics;      // 白色圆角矩形画在这上面
    protected _titleNode!: Node;
    protected _titleLbl!: Label;
    protected _closeNode: Node | null = null;
    protected _content: Node | null = null;   // 子类内容构建区（anchor 0.5,1，位于标题下方）

    // ════ 上下文（由 MainScene 在创建后 attach，提供 gm/eventBus/dialogPanel）════
    // 拦截器：若子类在 attach 之前访问这些 getter，会立即抛出清晰的报错，
    // 而不是在深层嵌套里以 "Cannot read property 'xxx' of undefined" 崩溃。
    private _ctx: PanelContextLike | null = null;
    public attach(ctx: PanelContextLike): void { this._ctx = ctx; }
    protected get gm(): GameManager {
        if (!this._ctx) throw new Error(`[ModalPanel] ${this.constructor.name} 未调用 attach(ctx) 注入上下文`);
        return this._ctx.gm;
    }
    protected get eventBus(): EventBus {
        if (!this._ctx) throw new Error(`[ModalPanel] ${this.constructor.name} 未调用 attach(ctx) 注入上下文`);
        return this._ctx.eventBus;
    }
    protected get dialogPanel(): DialogPanel {
        if (!this._ctx) throw new Error(`[ModalPanel] ${this.constructor.name} 未调用 attach(ctx) 注入上下文`);
        return this._ctx.dialogPanel;
    }

    onLoad(): void {
        // 取实际可见尺寸（FIXED_WIDTH 下高度随屏幕比例变化）
        const vs = view.getVisibleSize();
        this._vsW = vs.width;
        this._vsH = vs.height;
        // 确保根节点有全屏 UITransfer（否则子节点 Graphics 在微信小游戏可能不渲染）
        let rt = this.node.getComponent(UITransform);
        if (!rt) { rt = this.node.addComponent(UITransform); }
        rt.setContentSize(this._vsW, this._vsH);
        rt.setAnchorPoint(0.5, 0.5);
        this.buildSkeleton();
    }

    // ──── 骨架（只创建一次）────
    protected buildSkeleton(): void {
        // 全屏遮罩（点击关闭 / 拦截穿透）。用 Graphics 绘制——
        // 与面板背景(_panelGfx)完全相同的渲染机制，微信小游戏下已验证可靠。
        // 注意：切勿改用 Sprite，其 size 依赖 onLoad 初始化，addComponent 后同步读取必崩。
        if (this.showMask) {
            this._mask = new Node('M');
            const mt = this._mask.addComponent(UITransform);
            mt.setContentSize(this._vsW, this._vsH);
            mt.setAnchorPoint(0.5, 0.5);
            this._mask.setPosition(0, 0, 0);
            this._mask.setParent(this.node);
            this._maskGfx = this._mask.addComponent(Graphics);
            this._drawMask();
            this._mask.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                if (this.maskClose) this.hide();
            });
        }

        // 面板（圆角描边 + RECT Mask 裁剪）
        this._panel = new Node('P');
        const pt = this._panel.addComponent(UITransform);
        pt.setContentSize(this.panelW, this.panelH); pt.setAnchorPoint(0.5, 0.5);
        this._panel.setPosition(0, 0, 0); this._panel.setParent(this.node);

        // ⚠️ 视觉背景必须用独立子节点！
        // 原因：Mask.Type.GRAPHICS_RECT 会把 _panel 自身的 Graphics 绘制消费为 stencil 数据，
        //       不再作为视觉内容渲染。若把白色圆角矩形画在 _panelGfx 上，面板背景不可见。
        this._panelBg = new Node('PBg');
        const pbt = this._panelBg.addComponent(UITransform);
        pbt.setContentSize(this.panelW, this.panelH); pbt.setAnchorPoint(0.5, 0.5);
        this._panelBg.setPosition(0, 0, 0);
        this._panelBg.setParent(this._panel);   // 作为 _panel 第一个子节点（渲染在最底层）
        this._panelBgGfx = this._panelBg.addComponent(Graphics);

        // Mask 形状用的 Graphics（_panel 自身上，GRAPHICS_RECT 读它做 stencil）
        this._panelGfx = this._panel.addComponent(Graphics);
        this.drawPanelBg();                    // 同时绘制视觉背景(_panelBgGfx) + Mask形状(_panelGfx)
        // 面板拦截事件，防止点击面板内部冒泡
        this._panel.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });
        // ⚠️ 关键：Cocos 3.x Mask 必须显式设 type，否则不裁剪
        this._panel.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;

        // 标题（左锚点避免宽容器溢出面板左边界）
        this._titleNode = new Node('T');
        const tnt = this._titleNode.addComponent(UITransform);
        tnt.setContentSize(this.panelW - 100, 52); tnt.setAnchorPoint(0, 0.5);
        this._titleLbl = this._titleNode.addComponent(Label);
        Object.assign(this._titleLbl, {
            fontSize: 28, lineHeight: 36, color: C.title, string: '', isBold: true,
            horizontalAlign: Label.HorizontalAlign.LEFT, verticalAlign: Label.VerticalAlign.CENTER,
        });
        this._titleNode.setPosition(-this.panelW / 2 + 36, this.panelH / 2 - 42, 0);
        this._titleNode.setParent(this._panel);

        // 关闭按钮
        if (this.showClose) this._buildClose();

        // 内容容器（anchor 0.5,1 即顶部居中，位于标题下方）
        if (this.buildContentContainer) {
            this._content = new Node('C');
            const ct = this._content.addComponent(UITransform);
            ct.setContentSize(this.panelW - 48, this.panelH - 140);
            ct.setAnchorPoint(0.5, 1);
            this._content.setPosition(0, this.panelH / 2 - 90, 0);
            this._content.setParent(this._panel);
        }

        this.node.active = false;
    }

    private _buildClose(): void {
        const cn = new Node('X'); cn.addComponent(UITransform).setContentSize(44, 44);
        cn.setPosition(this.panelW / 2 - 34, this.panelH / 2 - 34, 0); cn.setParent(this._panel);
        const cg = cn.addComponent(Graphics); cg.fillColor = C.closeBg;
        cg.circle(0, 0, 20); cg.fill(); cg.lineWidth = 1.5; cg.strokeColor = C.closeStroke;
        cg.circle(0, 0, 20); cg.stroke();
        const cln = new Node('XL'); cln.setParent(cn); cln.addComponent(UITransform).setContentSize(44, 44);
        const cll = cln.addComponent(Label);
        Object.assign(cll, { string: '×', fontSize: 28, color: C.white, isBold: true,
            horizontalAlign: Label.HorizontalAlign.CENTER, verticalAlign: Label.VerticalAlign.CENTER });
        cn.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.hide(); });
        this._closeNode = cn;
    }

    /** 重绘面板背景（自适应高度时调用）—— 同时画视觉背景 + Mask 形状 */
    protected drawPanelBg(): void {
        // 视觉背景：画在 _panelBgGfx（独立子节点，不被 Mask 消费）
        const vg = this._panelBgGfx; vg.clear();
        vg.fillColor = C.panelBg;
        vg.roundRect(-this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, S.panelRadius); vg.fill();
        vg.lineWidth = S.panelBorderW; vg.strokeColor = C.panelBorder;
        vg.roundRect(-this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, S.panelRadius); vg.stroke();
        // Mask 形状：画在 _panelGfx（GRAPHICS_RECT 读此 Graphics 做 stencil 裁剪）
        const mg = this._panelGfx; mg.clear();
        mg.roundRect(-this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, S.panelRadius); mg.fill();
    }

    /** 绘制全屏半透明遮罩（buildSkeleton 与 show 各调用一次，确保激活后渲染可靠） */
    private _drawMask(): void {
        if (!this._mask || !this._maskGfx) return;
        const g = this._maskGfx;
        g.clear();
        g.fillColor = C.maskDim;
        g.rect(-this._vsW / 2, -this._vsH / 2, this._vsW, this._vsH);
        g.fill();
    }

    /** 自适应高度：重绘面板 + 重定位标题/关闭按钮/内容容器。返回可用滚动可视高度推导用的面板高 */
    protected resizePanel(h: number): void {
        this.panelH = h;
        // 同步 _panel 和 _panelBg 的 UITransform 尺寸
        const pt = this._panel.getComponent(UITransform);
        if (pt) pt.setContentSize(this.panelW, h);
        const pbt = this._panelBg.getComponent(UITransform);
        if (pbt) pbt.setContentSize(this.panelW, h);
        this.drawPanelBg();
        if (this._titleNode) this._titleNode.setPosition(-this.panelW / 2 + 36, h / 2 - 42, 0);
        if (this._closeNode) this._closeNode.setPosition(this.panelW / 2 - 34, h / 2 - 34, 0);
        // ⚠️ 同步 _content 内容容器（否则高度变化后内容区错位，被 Mask 截断）
        if (this._content) {
            const ct = this._content.getComponent(UITransform);
            if (ct) ct.setContentSize(this.panelW - 48, h - 140);
            this._content.setPosition(0, h / 2 - 90, 0);
        }
    }

    // ════ 对外接口 ════
    public show(title: string): void {
        if (this._titleLbl) this._titleLbl.string = title;
        this.node.active = true;
        // 置顶：确保盖住底栏与同级其它弹窗
        this.node.setSiblingIndex(this.node.parent!.children.length - 1);
        // 激活后重绘遮罩 + 面板背景（buildSkeleton 已绘一次，这里再确保一次渲染可靠）
        if (this.showMask) this._drawMask();
        this.drawPanelBg();
        this.render();
    }
    public hide(): void {
        this.onHide();
        this.node.active = false;
    }
    /** 弹窗是否正在显示 */
    public isShowing(): boolean { return this.node.active; }
    /** hide 前的钩子（子类可重写，如触发 onCancel） */
    protected onHide(): void {}

    // ════ 子类必须实现：构建具体内容 ════
    protected abstract render(): void;

    /** 清空内容容器（render 开头调用） */
    protected clearContent(): void {
        if (!this._content) return;
        for (const c of [...this._content.children]) c.destroy();
    }

    // ══════════ 公共控件助手（集中修复点）═════════

    /** 文本标签：默认 anchor(0.5,1)，absolute Y 向下为正方向 */
    protected mkText(
        parent: Node, x: number, y: number, w: number, h: number,
        text: string, size: number, color: Color,
        opts?: { bold?: boolean; align?: 'left' | 'center' | 'right'; anchorX?: number; anchorY?: number; fontSize?: number },
    ): Label {
        const n = new Node('L');
        const nt = n.addComponent(UITransform);
        nt.setContentSize(w, h);
        nt.setAnchorPoint(opts?.anchorX ?? 0.5, opts?.anchorY ?? 1);
        n.setPosition(x, y, 0); n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = opts?.fontSize ?? size; l.color = color;
        l.horizontalAlign = opts?.align === 'left' ? Label.HorizontalAlign.LEFT
            : opts?.align === 'right' ? Label.HorizontalAlign.RIGHT
            : Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.TOP;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = Math.ceil(size * 1.5);
        if (opts?.bold) l.isBold = true;
        return l;
    }

    /** 内联文本（常用于某父节点局部坐标，anchor(0,0.5) 默认） */
    protected mkInline(parent: Node, x: number, y: number, w: number, h: number, text: string, size: number, color: Color, bold = false): Label {
        const n = new Node('iL');
        const t = n.addComponent(UITransform); t.setContentSize(w, h);
        t.setAnchorPoint(0, 0.5); n.setPosition(x, y, 0); n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = Math.ceil(size * 1.5);
        if (bold) l.isBold = true;
        return l;
    }

    /** 居中文本（anchor 0.5,0.5） */
    protected mkCenter(parent: Node, x: number, y: number, w: number, h: number, text: string, size: number, color: Color, bold = false): Label {
        const n = new Node('ic');
        const t = n.addComponent(UITransform); t.setContentSize(w, h); t.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0); n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        if (bold || size >= 28) l.isBold = true;
        return l;
    }

    /** 圆角矩形填充 + 描边 */
    protected mkRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, fill: Color, stroke?: Color, sw = 2): void {
        g.fillColor = fill;
        g.roundRect(x, y, w, h, r); g.fill();
        if (stroke) { g.lineWidth = sw; g.strokeColor = stroke; g.roundRect(x, y, w, h, r); g.stroke(); }
    }

    /**
     * 按钮：复用公共组件 UIButton（背景 UIShape + 文字 UILabel，自带 stopPropagation），
     * 返回 BtnRef 兼容结构供旧调用方（TradePanel 等）继续用 .node/.label/.gfx。
     */
    protected mkButton(parent: Node, x: number, y: number, w: number, h: number, text: string, bg: Color, cb: () => void): BtnRef {
        const style: BtnStyle = { bg, border: C.btnBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius, fontSize: Math.min(S.font.button, h * 0.43) };
        const btn = new UIButton(text, style, cb, w, h);
        btn.node.setPosition(x, y, 0); btn.node.setParent(parent);
        return { node: btn.node, label: btn.label.label, gfx: btn.bgGfx };
    }

    /** 按钮（预设样式版）：传入 Btn.* 预设，或 {...Btn.primary, bg: 自定} 覆盖个别字段 */
    protected mkBtn(parent: Node, x: number, y: number, w: number, h: number, text: string, style: BtnStyle, cb: () => void): BtnRef {
        const btn = new UIButton(text, style, cb, w, h);
        btn.node.setPosition(x, y, 0); btn.node.setParent(parent);
        return { node: btn.node, label: btn.label.label, gfx: btn.bgGfx };
    }

    /** Tab 按钮：复用 UIButton；如需选中态切换请用专用 ModalTab 组件（见 TradePanel 用法） */
    protected mkTab(parent: Node, x: number, y: number, w: number, h: number, text: string, cb: () => void): BtnRef {
        const style: BtnStyle = { bg: C.white, border: C.btnBorder, borderW: 2, text: C.body, radius: 12, fontSize: 23 };
        const btn = new UIButton(text, style, cb, w, h);
        btn.node.setPosition(x, y, 0); btn.node.setParent(parent);
        return { node: btn.node, label: btn.label.label, gfx: btn.bgGfx };
    }

    /**
     * 可滚动列表区工厂：创建 mkScroll + 返回 ModalScrollList 控制器。
     * render 时调用 controller.setRows(rows) 即可自动装载 + 自适应高度（去重 updateLayout 数学）。
     */
    protected createScrollList(o: { parent: Node; x?: number; y?: number } & ModalScrollListOpts): ModalScrollList {
        const s = this.mkScroll(o.parent, o.x ?? 0, o.y ?? 0, o.width, o.viewH ?? 600);
        return new ModalScrollList(
            { view: s.view, content: s.content, sv: s.sv },
            (h) => this.resizePanel(h),
            o,
        );
    }

    /** 带圆角的滚动视图（含 RECT Mask + ScrollView）。返回 view / content / sv */
    protected mkScroll(parent: Node, x: number, y: number, w: number, h: number): { view: Node; content: Node; sv: ScrollView } {
        const view = new Node('SV');
        const vt = view.addComponent(UITransform); vt.setContentSize(w, h); vt.setAnchorPoint(0.5, 1);
        view.setPosition(x, y, 0); view.setParent(parent);
        view.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const sv = view.addComponent(ScrollView);
        sv.horizontal = false; sv.vertical = true; sv.inertia = true; sv.brake = 0.3;
        sv.elastic = true; sv.elasticBounceTime = 0.5;
        sv.verticalScrollBar = null; sv.horizontalScrollBar = null;
        const content = new Node('Cnt');
        const ct = content.addComponent(UITransform); ct.setContentSize(w, h); ct.setAnchorPoint(0.5, 1);
        content.setPosition(0, 0, 0); content.setParent(view);
        sv.content = content;
        return { view, content, sv };
    }
}
