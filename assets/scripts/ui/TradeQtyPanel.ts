/**
 * TradeQtyPanel.ts - 带滑块的交易数量选择弹窗（继承 ModalPanel）
 *
 * 用于替代 TradePanel 内嵌的「金币购买数量」和「易货数量」两个 body 渲染。
 * 作为独立弹窗弹出在 TradePanel 上方，确认后回调数量，关闭后 TradePanel 自动刷新。
 *
 * 布局（固定分区，anchor(0.5,0.5) 面板坐标系）：
 *   y=0       标题（粗体）
 *   y=36      信息行（灰色副文本）
 *   y=70      分割线
 *   y=100     滑块 QSlider
 *   y=170     −  ×N  +
 *   y=240     预览区（动态 1~2 行）
 *   y=310     ← 重选 / 确认 按钮
 */

import {
    Node, Label, UITransform, Color, Graphics, NodeEventType, EventTouch,
} from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { QSlider } from './QSlider';

export interface TradeQtyConfig {
    /** 弹窗标题，如 "购买：出售草药" / "交换物：面包" */
    title: string;
    /** 信息行（可选），如 ["持有 50 金 | 单价 20 | 最多 2 个"] */
    infoLines?: string[];
    /** 最小值，默认 1 */
    min?: number;
    /** 最大值 */
    max: number;
    /** 初始值，默认 1 */
    initial?: number;
    /** 实时预览文本生成器（每次数量变化调用） */
    getPreview: (qty: number) => string[];
    /** 确认按钮文字，默认 "确定" */
    confirmLabel?: string;
    /** 确认按钮背景色，默认 C.accent2 */
    confirmColor?: Color;
    /** 确认回调 */
    onConfirm: (qty: number) => void;
    /** 返回按钮文字（不设则无返回按钮） */
    backLabel?: string;
    /** 返回回调 */
    onBack?: () => void;
}


export class TradeQtyPanel extends ModalPanel {
    protected panelW = 520;
    protected panelH = 420;
    protected showClose = true;

    private _cfg: TradeQtyConfig | null = null;
    private _qty = 1;
    private _slider: QSlider | null = null;
    private _qLbl: Label | null = null;
    private _cf: { n: Node; l: Label; g: Graphics } | null = null;
    private _previewNode: Node | null = null;

    /** 打开弹窗 */
    public show(cfg: TradeQtyConfig): void {
        this._cfg = cfg;
        const mn = cfg.min ?? 1;
        this._qty = Math.min(cfg.max, Math.max(mn, cfg.initial ?? 1));
        super.show(cfg.title);
    }

    protected render(): void {
        if (!this._content || !this._cfg) return;
        const c = this._cfg;
        const W = this.panelW - 48;  // 内容区可用宽

        // ── 标题 ──
        this.mkText(this._content!, 0, 0, W, 40, c.title, 24, C.title, { bold: true, align: 'center' });

        // ── 信息行 ──
        let iy = 38;
        if (c.infoLines) {
            for (const line of c.infoLines) {
                this.mkText(this._content!, 0, -iy, W, 28, line, 18, C.sub, { align: 'center' });
                iy += 26;
            }
        }

        // ── 分割线 ──
        const dy = iy + 10;
        const sep = new Node('Sep');
        const st = sep.addComponent(UITransform); st.setContentSize(W - 40, 1); st.setAnchorPoint(0.5, 0.5);
        sep.setPosition(0, -dy, 0); sep.setParent(this._content!);
        const sg = sep.addComponent(Graphics); sg.strokeColor = new Color(200, 180, 160, 150);
        sg.lineWidth = 1; sg.moveTo(-(W - 40) / 2, 0); sg.lineTo((W - 40) / 2, 0); sg.stroke();

        // ── 滑块 ──
        const sy = dy + 38;
        this._slider = new QSlider(this._content!, -sy, (v) => {
            this._qty = v;
            if (this._qLbl) this._qLbl.string = `\u00d7${v}`;
            this._refreshPreview();
            this._refreshConfirm();
        });
        this._slider.setRange(c.min ?? 1, c.max, this._qty);

        // ── ±1 + 数量显示 ──
        const ny = sy + 62;
        this._mkStep(ny, -110, -1);
        this._mkStep(ny, 110, 1);
        this._qLbl = this.mkCenter(this._content!, 0, -ny, 120, 52, `\u00d7${this._qty}`, 28, C.title);

        // ── 预览区 ──
        this._previewNode = new Node('Prev');
        const pt = this._previewNode.addComponent(UITransform);
        pt.setContentSize(W, 60); pt.setAnchorPoint(0.5, 0.5);
        this._previewNode.setPosition(0, -(ny + 56), 0);
        this._previewNode.setParent(this._content!);
        this._refreshPreview();

        // ── 按钮 ──
        const by = ny + 112;
        const bw = c.backLabel ? 190 : 280;
        const bx = c.backLabel ? -105 : 0;
        if (c.backLabel && c.onBack) {
            this.mkButton(this._content!, bx - 90, -by, 160, 64, c.backLabel, C.tabOff, () => {
                this.hide();
                c.onBack!();
            });
        }
        this._cfBtn(by, bx, bw, c.confirmLabel || '\u786e\u5b9a', c.confirmColor || C.accent2, () => {
            this.hide();
            c.onConfirm(this._qty);
        });
    }

    // ──── 内部方法 ────

    /** 刷新预览文本 */
    private _refreshPreview(): void {
        if (!this._previewNode || !this._cfg) return;
        // 清除旧子节点
        const children = [...this._previewNode.children];
        children.forEach(ch => ch.destroy());
        const lines = this._cfg.getPreview(this._qty);
        lines.forEach((line, i) => {
            this.mkInline(this._previewNode!, -(this.panelW - 48) / 2 + 16, -8 - i * 24,
                this.panelW - 72, 24, line, 19, i === lines.length - 1 ? C.accent2 : C.body);
        });
    }

    /** 刷新确认按钮状态 */
    private _refreshConfirm(): void {
        if (!this._cf) return;
        // 默认态：子类可覆盖以实现动态禁用逻辑
    }

    /** 确认按钮创建引用 */
    private _cfBtn(y: number, x: number, w: number, text: string, bg: Color, cb: () => void): void {
        const r = this.mkButton(this._content!, x, -y, w, 64, text, bg, cb);
        this._cf = { n: r.node, l: r.label, g: r.gfx };
    }

    /** 步进按钮 */
    private _mkStep(y: number, x: number, sign: number): void {
        const n = new Node('Step');
        const nt = n.addComponent(UITransform); nt.setContentSize(56, 56); nt.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, -y, 0); n.setParent(this._content!);
        const g = n.addComponent(Graphics);
        this.mkRect(g, -28, -28, 56, 56, 12, C.tabOn, C.accent, 2);
        this.mkCenter(n, 0, 0, 56, 56, sign > 0 ? '+' : '\u2212', 32, C.white, true);
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (!this._cfg) return;
            const mn = this._cfg.min ?? 1;
            const nv = Math.min(this._cfg.max, Math.max(mn, this._qty + sign));
            if (nv !== this._qty && this._slider) {
                this._slider.setValue(nv);
            }
        });
    }
}
