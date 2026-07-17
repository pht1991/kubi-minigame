/**
 * TradePanel.ts - 交易面板（独立模态窗口，仿 BagPanel / DialogPanel）
 *
 * 交互设计目标：还原原版「清晰易货」思路，并补齐移动端友好的滑动条。
 *   - 头部：商人名 + 出售物 + 单价 + 库存（一眼看清「卖什么、多少钱、还剩多少」）
 *   - 两个清晰标签：金币购买 / 以物易物
 *   - 金币购买：滑动条(触摸拖动) + 步进器 + 实时「花费 X 金币 → 获得 Y」预览 + 大号确认
 *   - 以物易物：第一步从背包可选物品列表中选交换物；第二步用滑动条定数量，
 *               实时「给 A×q → 换 B×r」预览 + 确认；可「重新选择」返回
 *   - give==='gold' 的特殊商人：直接「领取收益」
 *
 * 滑动条为自制（Graphics 轨道 + 触摸捕获），不依赖引擎 Slider 组件，避免裁剪引擎缺模块风险。
 */

import {
    _decorator, Component, Node, Label, UITransform, Color, Graphics, Vec3, EventTouch, NodeEventType, Mask, ScrollView,
} from 'cc';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';

const { ccclass } = _decorator;

// ── 主题色（与项目暖羊皮纸风格统一）──
const C = {
    panelBg: new Color(255, 248, 240, 255),
    border: new Color(200, 168, 130, 255),
    title: new Color(92, 61, 30, 255),
    body: new Color(50, 40, 30, 255),
    sub: new Color(120, 100, 80, 255),
    warn: new Color(180, 70, 50, 255),
    accent: new Color(196, 132, 64, 255),   // 主按钮暖橙
    accent2: new Color(96, 140, 92, 255),   // 确认绿
    tabOn: new Color(210, 162, 110, 255),
    tabOff: new Color(228, 218, 205, 255),
    track: new Color(216, 206, 190, 255),
    fill: new Color(200, 140, 70, 255),
    handle: new Color(120, 80, 50, 255),
    disabled: new Color(180, 175, 168, 255),
};

/** 自制滑动条：触摸拖动 + 步进，实时回调 onChange */
class QSlider {
    public node: Node;
    private track: Node;
    private fill: Graphics;
    private handle: Node;
    private min = 1;
    private max = 1;
    private value = 1;
    private onChange: (v: number) => void = () => {};
    private readonly W = 480;
    private readonly H = 48;

    constructor(parent: Node, y: number, onChange: (v: number) => void) {
        this.onChange = onChange;
        this.node = new Node('QSlider');
        const t = this.node.addComponent(UITransform);
        t.setContentSize(this.W, this.H + 20);
        t.setAnchorPoint(0.5, 0.5);
        this.node.setPosition(0, y, 0);
        this.node.setParent(parent);

        this.track = new Node('Track');
        const tt = this.track.addComponent(UITransform);
        tt.setContentSize(this.W, this.H);
        tt.setAnchorPoint(0.5, 0.5);
        this.track.setPosition(0, 0, 0);
        this.track.setParent(this.node);
        const tg = this.track.addComponent(Graphics);
        tg.fillColor = C.track;
        tg.roundRect(-this.W / 2, -this.H / 2, this.W, this.H, this.H / 2);
        tg.fill();

        const fillNode = new Node('Fill');
        const ft = fillNode.addComponent(UITransform);
        ft.setContentSize(this.W, this.H);
        ft.setAnchorPoint(0.5, 0.5);
        fillNode.setPosition(0, 0, 0);
        fillNode.setParent(this.track);
        this.fill = fillNode.addComponent(Graphics);
        this.fill.fillColor = C.fill;

        this.handle = new Node('Handle');
        const ht = this.handle.addComponent(UITransform);
        ht.setContentSize(44, 44);
        ht.setAnchorPoint(0.5, 0.5);
        this.handle.setParent(this.track);
        const hg = this.handle.addComponent(Graphics);
        hg.fillColor = C.handle;
        hg.circle(0, 0, 22);
        hg.fill();
        hg.lineWidth = 3;
        hg.strokeColor = new Color(255, 248, 240, 255);
        hg.circle(0, 0, 22);
        hg.stroke();

        this.track.on(NodeEventType.TOUCH_START, (e: EventTouch) => this.handleTouch(e), this);
        this.track.on(NodeEventType.TOUCH_MOVE, (e: EventTouch) => this.handleTouch(e), this);
        this.track.on(NodeEventType.TOUCH_END, (e: EventTouch) => this.handleTouch(e), this);
        this.track.on(NodeEventType.TOUCH_CANCEL, (e: EventTouch) => this.handleTouch(e), this);
    }

    setRange(min: number, max: number, value: number): void {
        this.min = Math.max(1, min);
        this.max = Math.max(this.min, max);
        this.value = Math.min(this.max, Math.max(this.min, value));
        this.updateHandle();
    }

    get value1(): number { return this.value; }
    setValue(v: number): void { this.setRange(this.min, this.max, v); }

    private handleTouch(e: EventTouch): void {
        const ui = this.track.getComponent(UITransform);
        if (!ui) return;
        const loc = e.getUILocation();
        const local = ui.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        const ratio = Math.min(1, Math.max(0, (local.x + this.W / 2) / this.W));
        const v = Math.round(this.min + ratio * (this.max - this.min));
        if (v !== this.value) {
            this.value = v;
            this.updateHandle();
            this.onChange(v);
        } else if (e.getType() === NodeEventType.TOUCH_START) {
            this.updateHandle();
            this.onChange(v);
        }
    }

    private updateHandle(): void {
        const ratio = this.max > this.min ? (this.value - this.min) / (this.max - this.min) : 0;
        const x = -this.W / 2 + ratio * this.W;
        this.handle.setPosition(x, 0, 0);
        this.fill.clear();
        this.fill.fillColor = C.fill;
        const fillW = this.W / 2 + x;
        if (fillW > 0) {
            this.fill.roundRect(-this.W / 2, -this.H / 2, fillW, this.H, Math.min(this.H / 2, fillW / 2));
            this.fill.fill();
        }
    }

    destroy(): void {
        this.track.off(NodeEventType.TOUCH_START);
        this.track.off(NodeEventType.TOUCH_MOVE);
        this.track.off(NodeEventType.TOUCH_END);
        this.track.off(NodeEventType.TOUCH_CANCEL);
        this.node.destroy();
    }
}

@ccclass('TradePanel')
export class TradePanel extends Component {
    private _maskNode: Node | null = null;
    private _panelNode: Node | null = null;
    private _titleLabel: Label | null = null;
    private _headerNode: Node | null = null;
    private _tabNode: Node | null = null;
    private _dynamicNode: Node | null = null;

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

    private _tabGold: { node: Node; gfx: Graphics } | null = null;
    private _tabBarter: { node: Node; gfx: Graphics } | null = null;
    private _confirmLabelGold: Label | null = null;
    private _confirmNodeGold: Node | null = null;
    private _confirmLabelBarter: Label | null = null;
    private _confirmNodeBarter: Node | null = null;
    private _qtyLabel: Label | null = null;

    private static readonly PANEL_W = 680;
    private static readonly PANEL_H = 1000;

    onLoad(): void { this.createUI(); }

    private createUI(): void {
        this._maskNode = new Node('Mask');
        const maskT = this._maskNode.addComponent(UITransform);
        maskT.setContentSize(750, 1334);
        this._maskNode.setParent(this.node);
        const maskGfx = this._maskNode.addComponent(Graphics);
        maskGfx.fillColor = new Color(0, 0, 0, 95);
        maskGfx.rect(-375, -667, 750, 1334);
        maskGfx.fill();

        this._panelNode = new Node('Panel');
        const panelT = this._panelNode.addComponent(UITransform);
        panelT.setContentSize(TradePanel.PANEL_W, TradePanel.PANEL_H);
        panelT.setAnchorPoint(0.5, 0.5);
        this._panelNode.setPosition(0, 0, 0);
        this._panelNode.setParent(this.node);
        const panelGfx = this._panelNode.addComponent(Graphics);
        panelGfx.fillColor = C.panelBg;
        panelGfx.rect(-TradePanel.PANEL_W / 2, -TradePanel.PANEL_H / 2, TradePanel.PANEL_W, TradePanel.PANEL_H);
        panelGfx.fill();
        panelGfx.lineWidth = 3;
        panelGfx.strokeColor = C.border;
        panelGfx.rect(-TradePanel.PANEL_W / 2, -TradePanel.PANEL_H / 2, TradePanel.PANEL_W, TradePanel.PANEL_H);
        panelGfx.stroke();
        this._panelNode.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });

        const titleNode = new Node('Title');
        const titleT = titleNode.addComponent(UITransform);
        titleT.setContentSize(560, 60);
        this._titleLabel = titleNode.addComponent(Label);
        this._titleLabel.fontSize = 32;
        this._titleLabel.lineHeight = 40;
        this._titleLabel.color = C.title;
        this._titleLabel.string = '';
        this._titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleNode.setPosition(-TradePanel.PANEL_W / 2 + 40, TradePanel.PANEL_H / 2 - 45, 0);
        titleNode.setParent(this._panelNode);

        const closeBtn = new Node('CloseBtn');
        const closeT = closeBtn.addComponent(UITransform);
        closeT.setContentSize(48, 48);
        closeBtn.setPosition(TradePanel.PANEL_W / 2 - 36, TradePanel.PANEL_H / 2 - 36, 0);
        closeBtn.setParent(this._panelNode);
        const closeGfx = closeBtn.addComponent(Graphics);
        closeGfx.fillColor = new Color(200, 160, 130, 220);
        closeGfx.circle(0, 0, 22);
        closeGfx.fill();
        closeGfx.strokeColor = new Color(160, 120, 90, 255);
        closeGfx.lineWidth = 1.5;
        closeGfx.circle(0, 0, 22);
        closeGfx.stroke();
        const closeLbl = new Node('CloseLbl');
        closeLbl.setParent(closeBtn);
        const closeLblT = closeLbl.addComponent(UITransform);
        closeLblT.setContentSize(48, 48);
        const closeLblComp = closeLbl.addComponent(Label);
        closeLblComp.string = '×';
        closeLblComp.fontSize = 30;
        closeLblComp.color = new Color(255, 255, 255, 255);
        closeLblComp.isBold = true;
        closeLblComp.horizontalAlign = Label.HorizontalAlign.CENTER;
        closeLblComp.verticalAlign = Label.VerticalAlign.CENTER;
        closeBtn.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.hide(); });

        // 主体三个分区：头部 / 标签 / 动态内容
        this._headerNode = new Node('Header');
        this.addRegion(this._headerNode, 0, 0);
        this._tabNode = new Node('TabRegion');
        this.addRegion(this._tabNode, 0, 0);
        this._dynamicNode = new Node('Dynamic');
        this.addRegion(this._dynamicNode, 0, 0);

        this.node.active = false;
    }

    private addRegion(n: Node, x: number, y: number): void {
        const t = n.addComponent(UITransform);
        t.setContentSize(TradePanel.PANEL_W, TradePanel.PANEL_H);
        t.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        n.setParent(this._panelNode);
    }

    // ===== 对外接口 =====
    show(traderId: string, onTraded?: (msg: string) => void): void {
        this._traderId = traderId;
        this._onTraded = onTraded || null;
        const detail = TRADE_DATA[traderId];
        this._give = detail?.give || '';
        this._giveName = ITEM_DATA[this._give]?.name || this._give;
        this._price = ActionTrade.instance.getPrice(this._give);
        this._isGold = this._give === 'gold';
        this._mode = 'gold';
        this._barterStage = 'choose';
        this._barterOffer = null;
        this._qty = 1; this._maxQty = 1;
        if (this._titleLabel) this._titleLabel.string = detail?.name || '商人';
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
        this.renderHeader();
        this.renderBody();
    }

    hide(): void {
        this.node.active = false;
        this.clearDynamic();
    }

    // ===== 头部 + 标签 =====
    private renderHeader(): void {
        if (this._headerNode) this._headerNode.removeAllChildren();
        if (this._tabNode) this._tabNode.removeAllChildren();
        this._tabGold = null; this._tabBarter = null;

        const halfW = TradePanel.PANEL_W / 2;
        if (this._isGold) {
            this.mkLabel(this._headerNode!, -halfW + 40, TradePanel.PANEL_H / 2 - 110, 600, 40,
                `📦 回收：任意物品 → 金币`, 26, C.title, 'LEFT', true);
            const stock = ActionTrade.instance.getStock(this._traderId);
            this.mkLabel(this._headerNode!, -halfW + 40, TradePanel.PANEL_H / 2 - 152, 600, 36,
                `收益：金币 ×${stock.available}（随时可领取）`, 22, C.body, 'LEFT');
        } else {
            this.mkLabel(this._headerNode!, -halfW + 40, TradePanel.PANEL_H / 2 - 110, 600, 40,
                `📦 出售：${this._giveName}`, 26, C.title, 'LEFT', true);
            const stock = ActionTrade.instance.getStock(this._traderId);
            const stockText = stock.soldOut
                ? `已售罄，${stock.restockHours}h 后补货`
                : `剩余 ${stock.available}/${stock.max}`;
            this.mkLabel(this._headerNode!, -halfW + 40, TradePanel.PANEL_H / 2 - 150, 600, 34,
                `单价：${this._price} 金币 / 个`, 22, C.body, 'LEFT');
            this.mkLabel(this._headerNode!, -halfW + 40, TradePanel.PANEL_H / 2 - 184, 600, 34,
                `库存：${stockText}`, 22, stock.soldOut ? C.warn : C.sub, 'LEFT');
        }

        if (!this._isGold) {
            const tabY = TradePanel.PANEL_H / 2 - 250;
            const tabW = 320, gap = 12;
            this._tabGold = this.mkTab(-gap / 2 - tabW / 2, tabY, tabW, '金币购买', () => this.switchMode('gold'));
            this._tabBarter = this.mkTab(gap / 2 + tabW / 2, tabY, tabW, '以物易物', () => this.switchMode('barter'));
            this.updateTabStyles();
        }
    }

    private switchMode(mode: 'gold' | 'barter'): void {
        if (this._isGold || this._mode === mode) return;
        this._mode = mode;
        this._barterStage = 'choose';
        this._barterOffer = null;
        this.updateTabStyles();
        this.renderBody();
    }

    private updateTabStyles(): void {
        if (this._tabGold) this.setTabActive(this._tabGold, this._mode === 'gold');
        if (this._tabBarter) this.setTabActive(this._tabBarter, this._mode === 'barter');
    }

    private setTabActive(tab: { node: Node; gfx: Graphics }, active: boolean): void {
        const g = tab.gfx;
        g.clear();
        g.fillColor = active ? C.tabOn : C.tabOff;
        const w = 320, h = 56;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        g.lineWidth = 2; g.strokeColor = active ? C.accent : C.border;
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
        const lbl = tab.node.getComponentInChildren(Label);
        if (lbl) lbl.color = active ? new Color(255, 252, 245, 255) : C.body;
    }

    // ===== 动态 body =====
    private clearDynamic(): void {
        if (this._slider) { this._slider.destroy(); this._slider = null; }
        if (this._dynamicNode) this._dynamicNode.removeAllChildren();
        this._confirmLabelGold = null; this._confirmNodeGold = null;
        this._confirmLabelBarter = null; this._confirmNodeBarter = null;
        this._qtyLabel = null;
    }

    private renderBody(): void {
        this.clearDynamic();
        if (this._isGold) { this.buildGoldBody(); return; }
        if (this._mode === 'gold') this.buildGoldBody();
        else if (this._barterStage === 'choose') this.buildBarterChoose();
        else this.buildBarterAmount();
    }

    private buildGoldBody(): void {
        const parent = this._dynamicNode!;
        const halfW = TradePanel.PANEL_W / 2;

        if (this._isGold) {
            this.mkLabel(parent, 0, 120, 600, 40, `可领取：金币 ×${ActionTrade.instance.getStock(this._traderId).available}`, 24, C.body, 'CENTER', true);
            this.mkButton(parent, 0, 0, 360, 88, '领取收益', C.accent2, () => this.doConfirm());
            return;
        }

        this.mkLabel(parent, -halfW + 40, 150, 600, 36, '购买数量', 24, C.title, 'LEFT', true);

        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const stock = ActionTrade.instance.getStock(this._traderId);
        const maxByGold = this._price > 0 ? Math.floor(gold / this._price) : 0;
        this._maxQty = Math.max(0, Math.min(stock.available, maxByGold));
        this._minQty = 1;
        this._qty = this._maxQty > 0 ? 1 : 0;

        if (this._maxQty <= 0) {
            const reason = stock.soldOut ? '商人的货物已售罄' : '金币不足以购买';
            this.mkLabel(parent, 0, 40, 600, 40, reason, 24, C.warn, 'CENTER', true);
            this.mkButton(parent, 0, -120, 360, 84, '关闭', C.disabled, () => this.hide());
            return;
        }

        this._slider = new QSlider(parent, 90, (v) => { this._qty = v; if (this._qtyLabel) this._qtyLabel.string = `×${v}`; this.updateGoldPreview(); });
        this._slider.setRange(this._minQty, this._maxQty, this._qty);
        this.mkSteppers(parent, 30);
        this.updateGoldPreview();

        const btn = this.mkButton(parent, 0, -200, 420, 88, '确认购买', C.accent2, () => this.doConfirm());
        this._confirmLabelGold = btn.label;
        this._confirmNodeGold = btn.node;
    }

    private updateGoldPreview(): void {
        const parent = this._dynamicNode!;
        const old = parent.getChildByName('goldPrev');
        if (old) old.destroy();
        const prev = new Node('goldPrev');
        prev.setParent(parent);
        const halfW = TradePanel.PANEL_W / 2;
        const cost = this._price * this._qty;
        this.mkLabel(prev, -halfW + 40, -30, 600, 34, `花费：${cost} 金币`, 22, C.body, 'LEFT');
        this.mkLabel(prev, -halfW + 40, -70, 600, 34,
            `→ 获得：${this._giveName} ×${this._qty}`, 22, C.accent2, 'LEFT', true);
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const ok = gold >= cost;
        if (this._confirmLabelGold) this._confirmLabelGold.string = ok ? `确认购买（${cost} 金）` : '金币不足';
        if (this._confirmNodeGold) {
            const g = this._confirmNodeGold.getComponent(Graphics);
            if (g) { g.clear(); g.fillColor = ok ? C.accent2 : C.disabled; g.roundRect(-210, -44, 420, 88, 14); g.fill(); }
        }
    }

    // ===== 以物易物：选择交换物 =====
    private buildBarterChoose(): void {
        const parent = this._dynamicNode!;
        const halfW = TradePanel.PANEL_W / 2;
        this.mkLabel(parent, -halfW + 40, 150, 600, 36, '选择要交换的物品', 24, C.title, 'LEFT', true);

        const bag = GameManager.instance.boxSaveData['bag'] || {};
        const items = Object.keys(bag)
            .filter(id => (bag[id] || 0) > 0 && id !== 'gold' && ActionTrade.instance.getPrice(id) > 0)
            .sort((a, b) => (bag[b] || 0) - (bag[a] || 0));

        if (items.length === 0) {
            this.mkLabel(parent, 0, 20, 600, 40, '背包里没有可用于交换的物品', 22, C.warn, 'CENTER');
            this.mkButton(parent, 0, -120, 320, 80, '关闭', C.disabled, () => this.hide());
            return;
        }

        const listTop = 110, listH = 620, rowH = 84;
        const sv = new Node('BarterList');
        const svt = sv.addComponent(UITransform);
        svt.setContentSize(TradePanel.PANEL_W - 60, listH);
        svt.setAnchorPoint(0.5, 1);
        sv.setPosition(0, listTop, 0);
        sv.setParent(parent);
        sv.addComponent(Mask);
        const scroll = sv.addComponent(ScrollView);
        scroll.horizontal = false; scroll.vertical = true;
        scroll.verticalScrollBar = null; scroll.horizontalScrollBar = null;
        scroll.inertia = true; scroll.brake = 0.3;
        const content = new Node('Content');
        const ct = content.addComponent(UITransform);
        const totalH = Math.max(listH, items.length * rowH + 20);
        ct.setContentSize(TradePanel.PANEL_W - 60, totalH);
        ct.setAnchorPoint(0.5, 1);
        content.setParent(sv);
        scroll.content = content;

        items.forEach((id, i) => {
            const q = bag[id] || 0;
            const name = ITEM_DATA[id]?.name || id;
            const out = ActionTrade.instance.previewBarter(this._traderId, id, q);
            const row = new Node(`row_${id}`);
            const rt = row.addComponent(UITransform);
            rt.setContentSize(TradePanel.PANEL_W - 80, rowH - 8);
            rt.setAnchorPoint(0.5, 1);
            row.setPosition(0, -i * rowH - 10, 0);
            row.setParent(content);
            const rg = row.addComponent(Graphics);
            rg.fillColor = new Color(255, 252, 245, 255);
            rg.roundRect(-(TradePanel.PANEL_W - 80) / 2, -(rowH - 8) / 2, TradePanel.PANEL_W - 80, rowH - 8, 10);
            rg.fill();
            rg.lineWidth = 2; rg.strokeColor = C.border;
            rg.roundRect(-(TradePanel.PANEL_W - 80) / 2, -(rowH - 8) / 2, TradePanel.PANEL_W - 80, rowH - 8, 10);
            rg.stroke();
            const lbl = new Node('Lbl');
            lbl.setParent(row);
            const lt = lbl.addComponent(UITransform);
            lt.setContentSize(TradePanel.PANEL_W - 120, rowH - 8);
            lbl.setPosition(-20, 0, 0);
            const l = lbl.addComponent(Label);
            l.string = out >= 1
                ? `${name} ×${q}    → 换 ${this._giveName} ×${out}`
                : `${name} ×${q}    （价值不足）`;
            l.fontSize = 20; l.color = out >= 1 ? C.body : C.disabled;
            l.horizontalAlign = Label.HorizontalAlign.LEFT;
            l.verticalAlign = Label.VerticalAlign.CENTER;
            l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP; l.lineHeight = 26;
            row.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.selectBarterOffer(id); });
        });

        const marginPct = Math.round(ActionTrade.instance.getBarterMargin() * 100);
        this.mkLabel(parent, -halfW + 40, listTop - listH - 28, 600, 30,
            `提示：以物易物不如「卖货换金币再买」划算（商人收取约 ${marginPct}% 差价）`,
            18, C.sub, 'LEFT');
    }

    private selectBarterOffer(id: string): void {
        this._barterOffer = id;
        this._barterStage = 'amount';
        this.renderBody();
    }

    // ===== 以物易物：定数量 =====
    private buildBarterAmount(): void {
        const parent = this._dynamicNode!;
        const halfW = TradePanel.PANEL_W / 2;
        const offerName = ITEM_DATA[this._barterOffer!]?.name || this._barterOffer!;
        this.mkLabel(parent, -halfW + 40, 150, 600, 36, `交换物：${offerName}`, 24, C.title, 'LEFT', true);

        const bagQty = GameManager.instance.boxSaveData['bag']?.[this._barterOffer!] || 0;
        this._maxQty = Math.max(1, bagQty);
        this._minQty = 1;
        this._qty = 1;

        this._slider = new QSlider(parent, 90, (v) => { this._qty = v; if (this._qtyLabel) this._qtyLabel.string = `×${v}`; this.updateBarterPreview(); });
        this._slider.setRange(this._minQty, this._maxQty, this._qty);
        this.mkSteppers(parent, 30);
        this.updateBarterPreview();

        this.mkButton(parent, -150, -200, 200, 70, '← 重新选择', C.tabOff, () => {
            this._barterStage = 'choose'; this._barterOffer = null; this.renderBody();
        });
        const btn = this.mkButton(parent, 130, -200, 300, 70, '确认易货', C.accent, () => this.doConfirm());
        this._confirmLabelBarter = btn.label;
        this._confirmNodeBarter = btn.node;
        this.updateBarterConfirmState();
    }

    private updateBarterPreview(): void {
        const parent = this._dynamicNode!;
        const old = parent.getChildByName('barterPrev');
        if (old) old.destroy();
        const prev = new Node('barterPrev');
        prev.setParent(parent);
        const halfW = TradePanel.PANEL_W / 2;
        const offerName = ITEM_DATA[this._barterOffer!]?.name || this._barterOffer!;
        const out = ActionTrade.instance.previewBarter(this._traderId, this._barterOffer!, this._qty);
        this.mkLabel(prev, -halfW + 40, -30, 600, 34, `给：${offerName} ×${this._qty}`, 22, C.body, 'LEFT');
        this.mkLabel(prev, -halfW + 40, -70, 600, 34,
            out >= 1 ? `→ 换：${this._giveName} ×${out}` : `→ 换：价值不足（商人利润率过高）`,
            22, out >= 1 ? C.accent : C.warn, 'LEFT', true);
        this.updateBarterConfirmState();
    }

    private updateBarterConfirmState(): void {
        const out = ActionTrade.instance.previewBarter(this._traderId, this._barterOffer!, this._qty);
        const ok = out >= 1;
        if (this._confirmLabelBarter) this._confirmLabelBarter.string = ok ? '确认易货' : '无法交换';
        if (this._confirmNodeBarter) {
            const g = this._confirmNodeBarter.getComponent(Graphics);
            if (g) { g.clear(); g.fillColor = ok ? C.accent : C.disabled; g.roundRect(-150, -35, 300, 70, 12); g.fill(); }
        }
    }

    // ===== 确认交易 =====
    private doConfirm(): void {
        let r;
        if (this._isGold) r = ActionTrade.instance.trade(this._traderId);
        else if (this._mode === 'gold') r = ActionTrade.instance.trade(this._traderId, this._qty);
        else r = ActionTrade.instance.barter(this._traderId, this._barterOffer!, this._qty);

        if (this._onTraded) this._onTraded(r.message);

        if (r.success) {
            this.renderHeader();
            if (this._isGold) this.buildGoldBody();
            else if (this._mode === 'gold') this.renderBody();
            else { this._barterStage = 'choose'; this._barterOffer = null; this.renderBody(); }
        } else {
            // 失败：刷新当前 body 让状态（售罄/不足）更新
            if (this._isGold || this._mode === 'gold') this.buildGoldBody();
            else if (this._barterStage === 'amount') this.buildBarterAmount();
            else this.buildBarterChoose();
        }
    }

    // ===== 工具 =====
    private mkLabel(parent: Node, x: number, y: number, w: number, h: number, text: string,
                    size: number, color: Color, align: 'LEFT' | 'CENTER' = 'LEFT', bold = false): Label {
        const n = new Node('Lbl');
        const t = n.addComponent(UITransform);
        t.setContentSize(w, h);
        t.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = align === 'LEFT' ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = size * 1.3;
        if (bold) l.isBold = true;
        return l;
    }

    private mkButton(parent: Node, x: number, y: number, w: number, h: number, text: string,
                     bg: Color, onClick: () => void): { node: Node; label: Label } {
        const n = new Node('Btn');
        const t = n.addComponent(UITransform);
        t.setContentSize(w, h);
        t.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        n.setParent(parent);
        const g = n.addComponent(Graphics);
        g.fillColor = bg;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();
        g.lineWidth = 2; g.strokeColor = new Color(150, 110, 70, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.stroke();
        const lbl = this.mkLabel(n, 0, 0, w - 20, h, text, Math.min(26, h * 0.42), new Color(255, 252, 245, 255), 'CENTER', true);
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; onClick(); });
        return { node: n, label: lbl };
    }

    private mkSteppers(parent: Node, y: number): void {
        const mk = (x: number, sign: number) => {
            const n = new Node('Step');
            const t = n.addComponent(UITransform);
            t.setContentSize(64, 64);
            n.setPosition(x, y, 0);
            n.setParent(parent);
            const g = n.addComponent(Graphics);
            g.fillColor = C.tabOn;
            g.roundRect(-32, -32, 64, 64, 12);
            g.fill();
            g.lineWidth = 2; g.strokeColor = C.accent;
            g.roundRect(-32, -32, 64, 64, 12); g.stroke();
            const l = n.addComponent(Label);
            l.string = sign > 0 ? '+' : '−';
            l.fontSize = 38; l.color = new Color(255, 252, 245, 255);
            l.horizontalAlign = Label.HorizontalAlign.CENTER;
            l.verticalAlign = Label.VerticalAlign.CENTER; l.isBold = true;
            n.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                const nv = Math.min(this._maxQty, Math.max(this._minQty, this._qty + sign));
                if (nv !== this._qty && this._slider) this._slider.setValue(nv);
            });
        };
        mk(-110, -1);
        mk(110, 1);
        this._qtyLabel = this.mkLabel(parent, 0, y, 120, 64, `×${this._qty}`, 30, C.title, 'CENTER', true);
    }

    private mkTab(x: number, y: number, w: number, text: string, onClick: () => void): { node: Node; gfx: Graphics } {
        const n = new Node('Tab');
        const t = n.addComponent(UITransform);
        t.setContentSize(w, 56);
        n.setPosition(x, y, 0);
        n.setParent(this._tabNode);
        const g = n.addComponent(Graphics);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = 24; l.color = C.body;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER; l.isBold = true;
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; onClick(); });
        return { node: n, gfx: g };
    }
}
