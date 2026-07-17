/**
 * TradePanel.ts - 交易面板（独立模态窗口，仿 BagPanel / DialogPanel）
 *
 * 交互设计：还原原版「清晰易货」思路 + 移动端滑动条
 *   - 头部：商人名 + 出售物/单价/库存（始终可见）
 *   - 两个标签：金币购买 / 以物易物
 *   - 金币购买：滑动条 + 步进器 + 实时预览「花费X→获得Y」
 *   - 以物易物：选物品 → 定数量 → 预览「给A×q→换B×r」
 *   - give==='gold' 特殊商人：直接领取
 *
 * 布局：单 content 容器 + 游标 Y 顺序构建，避免多层区域节点叠加遮挡。
 */

import {
    _decorator, Component, Node, Label, UITransform, Color, Graphics, Vec3, EventTouch, NodeEventType, Mask, ScrollView,
} from 'cc';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';

const { ccclass } = _decorator;

// ── 主题色 ──
const C = {
    panelBg:   new Color(255, 248, 240, 255),
    border:     new Color(200, 168, 130, 255),
    title:      new Color(92, 61, 30, 255),
    body:       new Color(50, 40, 30, 255),
    sub:        new Color(120, 100, 80, 255),
    warn:       new Color(180, 70, 50, 255),
    accent:     new Color(196, 132, 64, 255),
    accent2:    new Color(76, 128, 72, 255),
    tabOn:      new Color(210, 162, 110, 255),
    tabOff:     new Color(228, 218, 205, 255),
    track:      new Color(216, 206, 190, 255),
    fill:       new Color(200, 140, 70, 255),
    handle:     new Color(120, 80, 50, 255),
    disabled:   new Color(180, 175, 168, 255),
    white:      new Color(255, 252, 245, 255),
};

const PANEL_W = 680;
const PANEL_H = 1000;

// ═════════════════ 自制滑动条 ═════════════════
class QSlider {
    public node: Node;
    private fillGfx: Graphics;
    private handleNode: Node;
    private _min = 1;
    private _max = 1;
    private _value = 1;
    private _onChange: (v: number) => void;
    private readonly W = 480;
    private readonly H = 44;

    constructor(parent: Node, y: number, onChange: (v: number) => void) {
        this._onChange = onChange;
        this.node = new Node('Slider');
        const t = this.node.addComponent(UITransform);
        t.setContentSize(this.W, this.H + 16);
        t.setAnchorPoint(0.5, 0.5);
        this.node.setPosition(0, y, 0);
        this.node.setParent(parent);

        // 轨道
        const track = new Node('Track');
        const tt = track.addComponent(UITransform);
        tt.setContentSize(this.W, this.H);
        tt.setAnchorPoint(0.5, 0.5);
        track.setPosition(0, 0, 0);
        track.setParent(this.node);
        const tg = track.addComponent(Graphics);
        tg.fillColor = C.track;
        tg.roundRect(-this.W / 2, -this.H / 2, this.W, this.H, this.H / 2);
        tg.fill();

        // 填充
        const fillN = new Node('Fill');
        fillN.addComponent(UITransform).setContentSize(this.W, this.H);
        fillN.setAnchorPoint(0.5, 0.5);
        fillN.setPosition(0, 0, 0);
        fillN.setParent(track);
        this.fillGfx = fillN.addComponent(Graphics);

        // 手柄
        this.handleNode = new Node('Handle');
        const ht = this.handleNode.addComponent(UITransform);
        ht.setContentSize(40, 40);
        ht.setAnchorPoint(0.5, 0.5);
        this.handleNode.setParent(track);
        const hg = this.handleNode.addComponent(Graphics);
        hg.fillColor = C.handle;
        hg.circle(0, 0, 20);
        hg.fill();
        hg.lineWidth = 2;
        hg.strokeColor = C.white;
        hg.circle(0, 0, 20);
        hg.stroke();

        track.on(NodeEventType.TOUCH_START, (e) => this._onTouch(e), this);
        track.on(NodeEventType.TOUCH_MOVE, (e) => this._onTouch(e), this);
        track.on(NodeEventType.TOUCH_END, () => this._onChange(this._value), this);
        track.on(NodeEventType.TOUCH_CANCEL, () => this._onChange(this._value), this);
    }

    setRange(min: number, max: number, val: number): void {
        this._min = Math.max(1, min);
        this._max = Math.max(this._min, max);
        this._value = Math.min(this._max, Math.max(this._min, val));
        this._draw();
    }

    get value(): number { return this._value; }
    setValue(v: number): void { this.setRange(this._min, this._max, v); }

    private _onTouch(e: EventTouch): void {
        const ui = this.node.getComponent(UITransform)!;
        const loc = e.getUILocation();
        const local = ui.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        const ratio = Math.min(1, Math.max(0, (local.x + this.W / 2) / this.W));
        this._value = Math.round(this._min + ratio * (this._max - this._min));
        this._draw();
        this._onChange(this._value);
    }

    private _draw(): void {
        const r = this._max > this._min ? (this._value - this._min) / (this._max - this._min) : 0;
        const hx = -this.W / 2 + r * this.W;
        this.handleNode.setPosition(hx, 0, 0);
        this.fillGfx.clear();
        this.fillGfx.fillColor = C.fill;
        const fw = this.W / 2 + hx;
        if (fw > 0.5) {
            this.fillGfx.roundRect(-this.W / 2, -this.H / 2, fw, this.H, Math.min(this.H / 2, fw / 2));
            this.fillGfx.fill();
        }
    }

    destroy(): void {
        this.node.destroy();
    }
}

// ═════════════════ TradePanel ═════════════════
@ccclass('TradePanel')
export class TradePanel extends Component {

    private _maskNode: Node | null = null;
    private _panel: Node | null = null;
    private _titleLabel: Label | null = null;
    private _content: Node | null = null;      // 单一内容容器

    // 数据状态
    private _traderId = '';
    private _give = '';
    private _giveName = '';
    private _price = 0;
    private _isGold = false;
    private _mode: 'gold' | 'barter' = 'gold';
    private _barterStage: 'choose' | 'amount' = 'choose';
    private _barterOffer: string | null = null;
    private _qty = 1;
    private _maxQty = 1;
    private _minQty = 1;

    private _slider: QSlider | null = null;
    private _onTraded: ((msg: string) => void) | null = null;

    // 引用（用于动态更新样式）
    private _tabGoldBtn: { node: Node; gfx: Graphics; lbl: Label } | null = null;
    private _tabBarterBtn: { node: Node; gfx: Graphics; lbl: Label } | null = null;
    private _confirmRef: { node: Node; label: Label; gfx: Graphics } | null = null;
    private _qtyLabel: Label | null = null;

    onLoad(): void { this._buildSkeleton(); }

    // ═════ 骨架（只创建一次）═════
    private _buildSkeleton(): void {
        // 遮罩
        this._maskNode = new Node('Mask');
        const mt = this._maskNode.addComponent(UITransform);
        mt.setContentSize(750, 1334);
        this._maskNode.setParent(this.node);
        const mg = this._maskNode.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 100);
        mg.rect(-375, -667, 750, 1334);
        mg.fill();
        this._maskNode.on(NodeEventType.TOUCH_END, () => this.hide());

        // 面板
        this._panel = new Node('Panel');
        const pt = this._panel.addComponent(UITransform);
        pt.setContentSize(PANEL_W, PANEL_H);
        pt.setAnchorPoint(0.5, 0.5);
        this._panel.setPosition(0, 0, 0);
        this._panel.setParent(this.node);
        const pg = this._panel.addComponent(Graphics);
        pg.fillColor = C.panelBg;
        pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 16);
        pg.fill();
        pg.lineWidth = 2.5;
        pg.strokeColor = C.border;
        pg.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 16);
        pg.stroke();
        this._panel.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });

        // 标题栏
        const titleN = new Node('Title');
        titleN.addComponent(UITransform).setContentSize(520, 52);
        this._titleLabel = titleN.addComponent(Label);
        Object.assign(this._titleLabel, {
            fontSize: 30, lineHeight: 38, color: C.title,
            horizontalAlign: Label.HorizontalAlign.LEFT,
            verticalAlign: Label.VerticalAlign.CENTER, string: '',
            isBold: true,
        });
        titleN.setPosition(-PANEL_W / 2 + 36, PANEL_H / 2 - 42, 0);
        titleN.setParent(this._panel);

        // 关闭按钮
        const closeN = new Node('Close');
        closeN.addComponent(UITransform).setContentSize(44, 44);
        closeN.setPosition(PANEL_W / 2 - 34, PANEL_H / 2 - 34, 0);
        closeN.setParent(this._panel);
        const cg = closeN.addComponent(Graphics);
        cg.fillColor = new Color(200, 160, 130, 220);
        cg.circle(0, 0, 20); cg.fill();
        cg.lineWidth = 1.5; cg.strokeColor = new Color(160, 120, 90);
        cg.circle(0, 0, 20); cg.stroke();
        const cl = new Node('CL'); cl.setParent(closeN);
        cl.addComponent(UITransform).setContentSize(44, 44);
        const clbl = cl.addComponent(Label);
        Object.assign(clbl, { string: '\u00d7', fontSize: 28, color: C.white, isBold: true,
            horizontalAlign: Label.HorizontalAlign.CENTER, verticalAlign: Label.VerticalAlign.CENTER });
        closeN.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.hide(); });

        // 内容容器
        this._content = new Node('Content');
        const ct = this._content.addComponent(UITransform);
        ct.setContentSize(PANEL_W - 48, PANEL_H - 140);
        ct.setAnchorPoint(0.5, 1);
        this._content.setPosition(0, PANEL_H / 2 - 90, 0);
        this._content.setParent(this._panel);

        this.node.active = false;
    }

    // ═════ 对外接口 ═════
    show(traderId: string, onTraded?: (msg: string) => void): void {
        this._traderId = traderId;
        this._onTraded = onTraded || null;
        const d = TRADE_DATA[traderId];
        this._give = d?.give || '';
        this._giveName = ITEM_DATA[this._give]?.name || this._give;
        this._price = ActionTrade.instance.getPrice(this._give);
        this._isGold = this._give === 'gold';
        this._mode = 'gold';
        this._barterStage = 'choose';
        this._barterOffer = null;
        if (this._titleLabel) this._titleLabel.string = d?.name || '\u5546\u4eba';

        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent!.children.length - 1);
        this._renderAll();
    }

    hide(): void {
        this.node.active = false;
    }

    // ═════ 全量渲染（每次 show / 模式切换 / 交易完成后调用）═════
    private _renderAll(): void {
        if (!this._content) return;
        this._content.removeAllChildren();
        this._slider = null;
        this._tabGoldBtn = null;
        this._tabBarterBtn = null;
        this._confirmRef = null;
        this._qtyLabel = null;

        let y = 0;  // 游标：从 content 顶部(anchor=1) 向下递减

        // ── 1. 商品信息头部（始终显示）──
        const stock = ActionTrade.instance.getStock(this._traderId);
        if (this._isGold) {
            y = this._lbl(y, `\U0001f4e6 \u56de\u6536\uff1a\u4efb\u610f\u7269\u54c1 \u2192 \u91d1\u5e01`, 26, C.title, true);
            y = this._lbl(y, `\u6536\u76ca\uff1a\u91d1\u5e01 \u00d7${stock.available}\uff08\u968f\u65f6\u53ef\u9886\u53d6\uff09`, 21, C.body);
        } else {
            y = this._lbl(y, `\U0001f4e6 \u51fa\u552e\uff1a${this._giveName}`, 26, C.title, true);
            y = this._lbl(y, `\u5355\u4ef7\uff1a${this._price} \u91d1\u5e01 / \u4e2a`, 21, C.body);
            const st = stock.soldOut
                ? `\u5df2\u552e\u7f44\uff0c${stock.restockHours}h \u540e\u8865\u8d27`
                : `\u5269\u4f59 ${stock.available}/${stock.max}`;
            y = this._lbl(y, `\u5e93\u5b58\uff1a${st}`, 21, stock.soldOut ? C.warn : C.sub);
        }
        y -= 16; // 间距

        // ── 2. 标签栏（非金币商人才显示）──
        if (!this._isGold) {
            const tabY = y;
            const tabW = 300, tabH = 52, gap = 14;
            this._tabGoldBtn = this._tabBtn(-gap / 2 - tabW / 2, tabY, tabW, tabH, '\u91d1\u5e01\u8d2d\u4e70', () => this._switchMode('gold'));
            this._tabBarterBtn = this._tabBtn(gap / 2 + tabW / 2, tabY, tabW, tabH, '\u4ee5\u7269\u6613\u8d27', () => this._switchMode('barter'));
            this._refreshTabs();
            y = tabY - tabH - 14;
        }

        // ── 3. 动态内容区 ──
        if (this._isGold) {
            y = this._buildGoldSpecial(y);
        } else if (this._mode === 'gold') {
            y = this._buildGoldBuy(y);
        } else if (this._barterStage === 'choose') {
            y = this._buildBarterList(y);
        } else {
            y = this._buildBarterAmount(y);
        }
    }

    // ═════ 标签切换 ═════
    private _switchMode(m: 'gold' | 'barter'): void {
        if (this._mode === m) return;
        this._mode = m;
        this._barterStage = 'choose';
        this._barterOffer = null;
        this._renderAll();
    }

    private _refreshTabs(): void {
        if (this._tabGoldBtn) this._styleTab(this._tabGoldBtn, this._mode === 'gold');
        if (this._tabBarterBtn) this._styleTab(this._tabBarterBtn, this._mode === 'barter');
    }

    private _styleTab(tab: { node: Node; gfx: Graphics; lbl: Label }, on: boolean): void {
        tab.gfx.clear();
        tab.gfx.fillColor = on ? C.tabOn : C.tabOff;
        const w = 300, h = 52;
        tab.gfx.roundRect(-w / 2, -h / 2, w, h, 12);
        tab.gfx.fill();
        tab.gfx.lineWidth = 2;
        tab.gfx.strokeColor = on ? C.accent : C.border;
        tab.gfx.roundRect(-w / 2, -h / 2, w, h, 12);
        tab.gfx.stroke();
        tab.lbl.color = on ? C.white : C.body;
    }

    // ═════ 金币商人（特殊）═════
    private _buildGoldSpecial(y: number): number {
        y = this._lbl(y, `\u53ef\u9886\u53d6\uff1a\u91d1\u5e01 \u00d7${ActionTrade.instance.getStock(this._traderId).available}`, 24, C.body, false, 12);
        y -= 10;
        this._confirmRef = this._btn(y, 340, 84, '\u9886\u53d6\u6536\u76ca', C.accent2, () => this._doConfirm());
        return y - 100;
    }

    // ═════ 金币购买 ═════
    private _buildGoldBuy(y: number): number {
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const stock = ActionTrade.instance.getStock(this._traderId);
        const maxByGold = this._price > 0 ? Math.floor(gold / this._price) : 0;
        this._maxQty = Math.max(0, Math.min(stock.available, maxByGold));
        this._minQty = 1;
        this._qty = this._maxQty > 0 ? 1 : 0;

        // 商品摘要行
        const summary = `\u6301\u6709 ${gold} \u91d1\u5e01 | \u5355\u4ef7 ${this._price} | \u6700\u591a\u53ef\u4e70 ${this._maxQty} \u4e2a`;
        y = this._lbl(y, summary, 20, C.sub);

        if (this._maxQty <= 0) {
            const reason = stock.soldOut ? '\u5546\u4eba\u8d27\u7269\u5df2\u552e\u7f44' : '\u91d1\u5e01\u4e0d\u8db3';
            y -= 8;
            y = this._lbl(y, reason, 23, C.warn, true, 10);
            y -= 12;
            this._confirmRef = this._btn(y, 320, 76, '\u5173\u95ed', C.disabled, () => this.hide());
            return y - 90;
        }

        // 数量选择区
        y -= 6;
        y = this._lbl(y, '\u8d2d\u4e70\u6570\u91cf', 22, C.title, true);
        y -= 8;

        // 滑动条
        this._slider = new QSlider(this._content!, y, (v) => {
            this._qty = v;
            if (this._qtyLabel) this._qtyLabel.string = `\u00d7${v}`;
            this._updateGoldPreview();
        });
        this._slider.setRange(this._minQty, this._maxQty, this._qty);
        y -= 40;

        // 步进器 + 数量显示
        const stepY = y;
        this._mkStep(stepY - 56, -115, -1);
        this._mkStep(stepY - 56, 115, 1);
        this._qtyLabel = this._lblInline(stepY - 56, 0, 110, 52, `\u00d7${this._qty}`, 28, C.title);
        y = stepY - 90;

        // 预览区
        y = this._lbl(y, '', 22, C.body); // placeholder for preview
        this._updateGoldPreview();
        y -= 50;

        // 确认按钮
        this._confirmRef = this._btn(y, 400, 84, '\u786e\u8ba4\u8d2d\u4e70', C.accent2, () => this._doConfirm());
        this._updateGoldConfirm();
        return y - 100;
    }

    private _updateGoldPreview(): void {
        if (!this._content) return;
        const old = this._content.getChildByName('_gp');
        if (old) old.destroy();
        const pn = new Node('_gp');
        pn.setParent(this._content!);
        const cost = this._price * this._qty;
        this._lblIn(pn, -PANEL_W / 2 + 24, -6, `\u8393\u8d39\uff1a${cost} \u91d1\u5e01`, 21, C.body);
        this._lblIn(pn, -PANEL_W / 2 + 24, -34, `\u2192 \u83b7\u5f97\uff1a${this._giveName} \u00d7${this._qty}`, 21, C.accent2, true);
        this._updateGoldConfirm();
    }

    private _updateGoldConfirm(): void {
        if (!this._confirmRef) return;
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const ok = gold >= this._price * this._qty && this._qty > 0;
        this._confirmRef.label.string = ok ? `\u786e\u8ba4\u8d2d\u4e70\uff08${this._price * this._qty} \u91d1\uff09` : '\u91d1\u5e01\u4e0d\u8db3';
        this._confirmRef.gfx.clear();
        this._confirmRef.gfx.fillColor = ok ? C.accent2 : C.disabled;
        this._confirmRef.gfx.roundRect(-200, -42, 400, 84, 14);
        this._confirmRef.gfx.fill();
    }

    // ═════ 易货：选物品列表 ═════
    private _buildBarterList(y: number): number {
        y = this._lbl(y, '\u9009\u62e9\u8981\u4ea4\u6362\u7684\u7269\u54c1', 22, C.title, true);
        y -= 10;

        const bag = GameManager.instance.boxSaveData['bag'] || {};
        const items = Object.keys(bag)
            .filter(id => (bag[id] || 0) > 0 && id !== 'gold' && ActionTrade.instance.getPrice(id) > 0)
            .sort((a, b) => (bag[b] || 0) - (bag[a] || 0));

        if (items.length === 0) {
            y = this._lbl(y, '\u80cc\u5305\u91cc\u6ca1\u6709\u53ef\u7528\u4e8e\u4ea4\u6362\u7684\u7269\u54c1', 21, C.warn);
            y -= 14;
            this._btn(y, 280, 72, '\u5173\u95ed', C.disabled, () => this.hide());
            return y - 90;
        }

        // 列表容器（ScrollView）
        const listH = 500, rowH = 76;
        const sv = new Node('BList');
        const svt = sv.addComponent(UITransform);
        svt.setContentSize(PANEL_W - 56, listH);
        svt.setAnchorPoint(0.5, 1);
        sv.setPosition(0, y, 0);
        sv.setParent(this._content!);
        sv.addComponent(Mask);
        const sc = sv.addComponent(ScrollView);
        sc.horizontal = false; sc.vertical = true;
        sc.verticalScrollBar = null; sc.horizontalScrollBar = null;
        sc.inertia = true; sc.brake = 0.3;

        const cnt = new Node('BCnt');
        const cntT = cnt.addComponent(UITransform);
        const totalH = Math.max(listH, items.length * rowH + 16);
        cntT.setContentSize(PANEL_W - 56, totalH);
        cntT.setAnchorPoint(0.5, 1);
        cnt.setParent(sv);
        sc.content = cnt;

        items.forEach((id, i) => {
            const q = bag[id] || 0;
            const nm = ITEM_DATA[id]?.name || id;
            const out = ActionTrade.instance.previewBarter(this._traderId, id, q);
            const row = new Node(`br_${id}`);
            const rt = row.addComponent(UITransform);
            rt.setContentSize(PANEL_W - 76, rowH - 6);
            rt.setAnchorPoint(0.5, 1);
            row.setPosition(0, -i * rowH - 8, 0);
            row.setParent(cnt);
            const rg = row.addComponent(Graphics);
            rg.fillColor = new Color(255, 252, 245);
            rg.roundRect(-(PANEL_W - 76) / 2, -(rowH - 6) / 2, PANEL_W - 76, rowH - 6, 10);
            rg.fill();
            rg.lineWidth = 1.5; rg.strokeColor = C.border;
            rg.roundRect(-(PANEL_W - 76) / 2, -(rowH - 6) / 2, PANEL_W - 76, rowH - 6, 10);
            rg.stroke();
            const lbl = new Node('L');
            lbl.setParent(row);
            lbl.addComponent(UITransform).setContentSize(PANEL_W - 110, rowH - 6);
            lbl.setPosition(-18, 0, 0);
            const l = lbl.addComponent(Label);
            l.string = out >= 1
                ? `${nm} \u00d7${q}    \u2192 \u6362 ${this._giveName} \u00d7${out}`
                : `${nm} \u00d7${q}    \uff08\u4ef7\u503c\u4e0d\u8db3\uff09`;
            l.fontSize = 19; l.color = out >= 1 ? C.body : C.disabled;
            l.horizontalAlign = Label.HorizontalAlign.LEFT;
            l.verticalAlign = Label.VerticalAlign.CENTER;
            l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP; l.lineHeight = 25;
            row.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                this._barterOffer = id;
                this._barterStage = 'amount';
                this._renderAll();
            });
        });

        y -= listH + 8;
        const mp = Math.round(ActionTrade.instance.getBarterMargin() * 100);
        this._lbl(y, `\u63d0\u793a\uff1a\u4ee5\u7269\u6613\u8d27\u4e0d\u5982\u300c\u5356\u8d27\u6362\u91d1\u5e01\u518d\u4e70\u300d\u7b97\u7b97\uff08\u5546\u4eba\u6536\u53d6\u7ea6 ${mp}%\u5dee\u4ef7\uff09`, 16, C.sub);
        return y - 40;
    }

    // ═════ 易货：定数量 ═════
    private _buildBarterAmount(y: number): number {
        const offerNm = ITEM_DATA[this._barterOffer!]?.name || this._barterOffer!;
        y = this._lbl(y, `\u4ea4\u6362\u7269\uff1a${offerNm}`, 22, C.title, true);

        const bagQ = GameManager.instance.boxSaveData['bag']?.[this._barterOffer!] || 0;
        this._maxQty = Math.max(1, bagQ);
        this._minQty = 1;
        this._qty = 1;

        y -= 8;
        this._slider = new QSlider(this._content!, y, (v) => {
            this._qty = v;
            if (this._qtyLabel) this._qtyLabel.string = `\u00d7${v}`;
            this._updateBarterPreview();
        });
        this._slider.setRange(this._minQty, this._maxQty, this._qty);
        y -= 40;

        const stepY = y;
        this._mkStep(stepY - 56, -115, -1);
        this._mkStep(stepY - 56, 115, 1);
        this._qtyLabel = this._lblInline(stepY - 56, 0, 110, 52, `\u00d7${this._qty}`, 28, C.title);
        y = stepY - 90;

        // 预览
        y = this._lbl(y, '', 22, C.body);
        this._updateBarterPreview();
        y -= 50;

        // 按钮
        this._btn(y - 20, 190, 68, '\u2190 \u91cd\u65b0\u9009\u62e9', C.tabOff, () => {
            this._barterStage = 'choose'; this._barterOffer = null; this._renderAll();
        });
        this._confirmRef = this._btn(y - 20, 280, 68, '\u786e\u8ba4\u6613\u8d27', C.accent, () => this._doConfirm());
        this._updateBarterConfirm();
        return y - 110;
    }

    private _updateBarterPreview(): void {
        if (!this._content) return;
        const old = this._content.getChildByName('_bp');
        if (old) old.destroy();
        const pn = new Node('_bp');
        pn.setParent(this._content!);
        const offerNm = ITEM_DATA[this._barterOffer!]?.name || this._barterOffer!;
        const out = ActionTrade.instance.previewBarter(this._traderId, this._barterOffer!, this._qty);
        this._lblIn(pn, -PANEL_W / 2 + 24, -6, `\u7ed9\uff1a${offerNm} \u00d7${this._qty}`, 21, C.body);
        this._lblIn(pn, -PANEL_W / 2 + 24, -34,
            out >= 1 ? `\u2192 \u6362\uff1a${this._giveName} \u00d7${out}` : `\u2192 \u6362\uff1a\u4ef7\u503c\u4e0d\u8db3`,
            21, out >= 1 ? C.accent : C.warn, true);
        this._updateBarterConfirm();
    }

    private _updateBarterConfirm(): void {
        if (!this._confirmRef) return;
        const out = ActionTrade.instance.previewBarter(this._traderId, this._barterOffer!, this._qty);
        const ok = out >= 1;
        this._confirmRef.label.string = ok ? '\u786e\u8ba4\u6613\u8d27' : '\u65e0\u6cd5\u4ea4\u6362';
        this._confirmRef.gfx.clear();
        this._confirmRef.gfx.fillColor = ok ? C.accent : C.disabled;
        this._confirmRef.gfx.roundRect(-140, -34, 280, 68, 12);
        this._confirmRef.gfx.fill();
    }

    // ═════ 确认交易 ═════
    private _doConfirm(): void {
        let r;
        if (this._isGold) r = ActionTrade.instance.trade(this._traderId);
        else if (this._mode === 'gold') r = ActionTrade.instance.trade(this._traderId, this._qty);
        else r = ActionTrade.instance.barter(this._traderId, this._barterOffer!, this._qty);

        if (this._onTraded) this._onTraded(r.message);

        // 刷新面板（保持当前模式）
        this._renderAll();
    }

    // ═════ 工具方法：标签（添加到 _content，返回下一个 Y）═════
    private _lbl(y: number, text: string, size: number, color: Color, bold = false, padT = 0): number {
        if (!this._content) return y;
        const n = new Node('L');
        n.addComponent(UITransform).setContentSize(PANEL_W - 48, size * 1.6 + padT * 2);
        n.setAnchorPoint(0.5, 1);
        n.setPosition(0, -y, 0);
        n.setParent(this._content);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.verticalAlign = Label.VerticalAlign.TOP;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = size * 1.45;
        if (bold) l.isBold = true;
        return y + size * 1.6 + padT * 2 + 8;
    }

    /** 内联标签：用于预览区等子节点内 */
    private _lblIn(parent: Node, x: number, y: number, text: string, size: number, color: Color, bold = false): Label {
        const n = new Node('IL');
        const t = n.addComponent(UITransform);
        t.setContentSize(PANEL_W - 72, size * 1.6);
        t.setAnchorPoint(0, 0.5);
        n.setPosition(x, y, 0);
        n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = size * 1.4;
        if (bold) l.isBold = true;
        return l;
    }

    /** 内联居中标签 */
    private _lblInline(parent: Node | undefined, x: number, y: number, w: number, h: number, text: string, size: number, color: Color): Label {
        const target = parent || this._content!;
        const n = new Node('ILC');
        const t = n.addComponent(UITransform);
        t.setContentSize(w, h);
        t.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        n.setParent(target);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        if (size >= 28) l.isBold = true;
        return l;
    }

    // ═════ 工具方法：按钮 ═════
    private _btn(y: number, w: number, h: number, text: string, bg: Color, cb: () => void): { node: Node; label: Label; gfx: Graphics } {
        const n = new Node('Btn');
        n.addComponent(UITransform).setContentSize(w, h);
        n.setAnchorPoint(0.5, 1);
        n.setPosition(0, -y, 0);
        n.setParent(this._content!);
        const g = n.addComponent(Graphics);
        g.fillColor = bg;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();
        g.lineWidth = 2; g.strokeColor = new Color(150, 110, 70, 200);
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.stroke();
        const lbl = this._lblIn(n, 0, 0, text, Math.min(25, h * 0.42), C.white, true);
        // 覆盖对齐为居中
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; cb(); });
        return { node: n, label: lbl, gfx: g };
    }

    // ═════ 工具方法：标签按钮 ═════
    private _tabBtn(x: number, y: number, w: number, h: number, text: string, cb: () => void): { node: Node; gfx: Graphics; lbl: Label } {
        const n = new Node('Tab');
        n.addComponent(UITransform).setContentSize(w, h);
        n.setAnchorPoint(0.5, 1);
        n.setPosition(x, -y, 0);
        n.setParent(this._content!);
        const g = n.addComponent(Graphics);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = 23; l.color = C.body;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER; l.isBold = true;
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; cb(); });
        return { node: n, gfx: g, lbl: l };
    }

    // ═════ 工具方法：步进按钮 ═════
    private _mkStep(y: number, x: number, sign: number): void {
        const n = new Node('Step');
        n.addComponent(UITransform).setContentSize(60, 60);
        n.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        n.setParent(this._content!);
        const g = n.addComponent(Graphics);
        g.fillColor = C.tabOn;
        g.roundRect(-30, -30, 60, 60, 12);
        g.fill();
        g.lineWidth = 2; g.strokeColor = C.accent;
        g.roundRect(-30, -30, 60, 60, 12);
        g.stroke();
        const l = n.addComponent(Label);
        l.string = sign > 0 ? '+' : '\u2212';
        l.fontSize = 34; l.color = C.white;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER; l.isBold = true;
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            const nv = Math.min(this._maxQty, Math.max(this._minQty, this._qty + sign));
            if (nv !== this._qty && this._slider) this._slider.setValue(nv);
        });
    }
}
