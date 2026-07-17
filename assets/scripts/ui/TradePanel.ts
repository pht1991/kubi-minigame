/**
 * TradePanel.ts - 交易面板（独立模态窗口，仿 BagPanel / DialogPanel）
 *
 * 布局：固定分区绝对定位（Header / Tab / Body 三区独立坐标，杜绝游标累加重叠）
 *   - Header: y=0~130   （商品信息，始终可见）
 *   - Tab:   y=148      （金币购买 / 以物易货）
 *   - Body:  y=225+     （动态内容区）
 *
 * 交互：
 *   - 金币购买：滑动条 + 步进器 + 实时预览「花费X→获得Y」
 *   - 以物易货：选物品(列表) → 定数量 → 预览「给A×q→换B×r」
 *   - give==='gold' 特殊商人：直接领取
 */

import {
    _decorator, Component, Node, Label, UITransform, Color, Graphics, Vec3, EventTouch,
    NodeEventType, Mask, ScrollView, VerticalTextAlignment,
} from 'cc';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';

const { ccclass } = _decorator;

// ── 主题色 ──
const C = {
    panelBg: new Color(255, 248, 240, 255),
    border:   new Color(200, 168, 130, 255),
    title:    new Color(92, 61, 30, 255),
    body:     new Color(50, 40, 30, 255),
    sub:      new Color(120, 100, 80, 255),
    warn:     new Color(180, 70, 50, 255),
    accent:   new Color(196, 132, 64, 255),
    accent2:  new Color(76, 128, 72, 255),
    tabOn:    new Color(210, 162, 110, 255),
    tabOff:   new Color(228, 218, 205, 255),
    track:    new Color(216, 206, 190, 255),
    fill:     new Color(200, 140, 70, 255),
    handle:   new Color(120, 80, 50, 255),
    disabled: new Color(175, 170, 163, 255),
    white:    new Color(255, 252, 245, 255),
};

const PW = 680;    // 面板宽
const PH = 1000;   // 面板高

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

        const track = new Node('Trk');
        const tt = track.addComponent(UITransform);
        tt.setContentSize(this.W, this.H); tt.setAnchorPoint(0.5, 0.5);
        track.setPosition(0, 0, 0); track.setParent(this.node);
        const tg = track.addComponent(Graphics);
        tg.fillColor = C.track;
        tg.roundRect(-this.W / 2, -this.H / 2, this.W, this.H, this.H / 2); tg.fill();

        const fn = new Node('Fl'); fn.addComponent(UITransform).setContentSize(this.W, this.H);
        fn.setAnchorPoint(0.5, 0.5); fn.setPosition(0, 0, 0); fn.setParent(track);
        this.fillGfx = fn.addComponent(Graphics);

        this.handleNode = new Node('Hdl');
        const ht = this.handleNode.addComponent(UITransform);
        ht.setContentSize(40, 40); ht.setAnchorPoint(0.5, 0.5);
        this.handleNode.setParent(track);
        const hg = this.handleNode.addComponent(Graphics);
        hg.fillColor = C.handle; hg.circle(0, 0, 20); hg.fill();
        hg.lineWidth = 2; hg.strokeColor = C.white; hg.circle(0, 0, 20); hg.stroke();

        track.on(NodeEventType.TOUCH_START, (e) => this._onT(e), this);
        track.on(NodeEventType.TOUCH_MOVE, (e) => this._onT(e), this);
        track.on(NodeEventType.TOUCH_END, () => this._onChange(this._value), this);
        track.on(NodeEventType.TOUCH_CANCEL, () => this._onChange(this._value), this);
    }

    setRange(min: number, max: number, val: number): void {
        this._min = Math.max(1, min); this._max = Math.max(this._min, max);
        this._value = Math.min(this._max, Math.max(this._min, val)); this._draw();
    }
    get value(): number { return this._value; }
    setValue(v: number): void { this.setRange(this._min, this._max, v); }

    private _onT(e: EventTouch): void {
        const loc = e.getUILocation();
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        const ratio = Math.min(1, Math.max(0, (local.x + this.W / 2) / this.W));
        this._value = Math.round(this._min + ratio * (this._max - this._min));
        this._draw(); this._onChange(this._value);
    }
    private _draw(): void {
        const r = this._max > this._min ? (this._value - this._min) / (this._max - this._min) : 0;
        const hx = -this.W / 2 + r * this.W;
        this.handleNode.setPosition(hx, 0, 0);
        this.fillGfx.clear(); this.fillGfx.fillColor = C.fill;
        const fw = this.W / 2 + hx;
        if (fw > 0.5) { this.fillGfx.roundRect(-this.W / 2, -this.H / 2, fw, this.H, Math.min(this.H / 2, fw / 2)); this.fillGfx.fill(); }
    }
    destroy(): void { this.node.destroy(); }
}

// ═════════════════ TradePanel ═════════════════
@ccclass('TradePanel')
export class TradePanel extends Component {

    private _mask: Node | null = null;
    private _panel: Node | null = null;
    private _titleLbl: Label | null = null;
    private _c: Node | null = null;          // content 容器

    // 数据
    private _tid = '';
    private _give = '';
    private _gName = '';
    private _price = 0;
    private _isGold = false;
    private _mode: 'gold' | 'barter' = 'gold';
    private _bStage: 'choose' | 'amount' = 'choose';
    private _bOffer: string | null = null;
    private _qty = 1;
    private _mqty = 1;
    private _mnqty = 1;

    private _slider: QSlider | null = null;
    private _onTrade: ((msg: string) => void) | null = null;
    private _tG: { n: Node; g: Graphics; l: Label } | null = null;
    private _tB: { n: Node; g: Graphics; l: Label } | null = null;
    private _cf: { n: Node; l: Label; g: Graphics } | null = null;
    private _qLbl: Label | null = null;

    onLoad(): void { this._buildSK(); }

    // ──── 骨架（只创建一次）────
    private _buildSK(): void {
        // 遮罩
        this._mask = new Node('M');
        const mt = this._mask.addComponent(UITransform); mt.setContentSize(750, 1334);
        this._mask.setParent(this.node);
        const mg = this._mask.addComponent(Graphics); mg.fillColor = new Color(0, 0, 0, 100);
        mg.rect(-375, -667, 750, 1334); mg.fill();
        this._mask.on(NodeEventType.TOUCH_END, () => this.hide());

        // 面板
        this._panel = new Node('P');
        const pt = this._panel.addComponent(UITransform); pt.setContentSize(PW, PH); pt.setAnchorPoint(0.5, 0.5);
        this._panel.setPosition(0, 0, 0); this._panel.setParent(this.node);
        const pg = this._panel.addComponent(Graphics); pg.fillColor = C.panelBg;
        pg.roundRect(-PW / 2, -PH / 2, PW, PH, 16); pg.fill();
        pg.lineWidth = 2.5; pg.strokeColor = C.border;
        pg.roundRect(-PW / 2, -PH / 2, PW, PH, 16); pg.stroke();
        this._panel.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });

        // 标题（左锚点避免宽容器溢出面板左边界）
        const tn = new Node('T');
        const tnt = tn.addComponent(UITransform);
        tnt.setContentSize(PW - 100, 52); tnt.setAnchorPoint(0, 0.5);
        this._titleLbl = tn.addComponent(Label);
        Object.assign(this._titleLbl, {
            fontSize: 28, lineHeight: 36, color: C.title, string: '', isBold: true,
            horizontalAlign: Label.HorizontalAlign.LEFT, verticalAlign: Label.VerticalAlign.CENTER,
        });
        tn.setPosition(-PW / 2 + 36, PH / 2 - 42, 0); tn.setParent(this._panel);

        // 关闭按钮
        const cn = new Node('X'); cn.addComponent(UITransform).setContentSize(44, 44);
        cn.setPosition(PW / 2 - 34, PH / 2 - 34, 0); cn.setParent(this._panel);
        const cg = cn.addComponent(Graphics); cg.fillColor = new Color(200, 160, 130, 220);
        cg.circle(0, 0, 20); cg.fill(); cg.lineWidth = 1.5; cg.strokeColor = new Color(160, 120, 90);
        cg.circle(0, 0, 20); cg.stroke();
        const cln = new Node('XL'); cln.setParent(cn); cln.addComponent(UITransform).setContentSize(44, 44);
        const cll = cln.addComponent(Label);
        Object.assign(cll, { string: '\u00d7', fontSize: 28, color: C.white, isBold: true,
            horizontalAlign: Label.HorizontalAlign.CENTER, verticalAlign: Label.VerticalAlign.CENTER });
        cn.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.hide(); });

        // 内容容器（anchor=0.5,1 即顶部居中）
        this._c = new Node('C');
        const ct = this._c.addComponent(UITransform); ct.setContentSize(PW - 48, PH - 140);
        ct.setAnchorPoint(0.5, 1);
        this._c.setPosition(0, PH / 2 - 90, 0); this._c.setParent(this._panel);

        this.node.active = false;
    }

    // ════ 对外接口 ════
    show(traderId: string, onTraded?: (msg: string) => void): void {
        this._tid = traderId; this._onTrade = onTraded || null;
        const d = TRADE_DATA[traderId];
        this._give = d?.give || ''; this._gName = ITEM_DATA[this._give]?.name || this._give;
        this._price = ActionTrade.instance.getPrice(this._give); this._isGold = this._give === 'gold';
        this._mode = 'gold'; this._bStage = 'choose'; this._bOffer = null;
        if (this._titleLbl) this._titleLbl.string = d?.name || '\u5546\u4eba';
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent!.children.length - 1);
        this._render();
    }
    hide(): void { this.node.active = false; }

    // ════ 全量渲染（固定分区绝对定位）═════
    private _render(): void {
        if (!this._c) return;
        this._c.removeAllChildren();
        this._slider = null; this._tG = null; this._tB = null;
        this._cf = null; this._qLbl = null;

        const stock = ActionTrade.instance.getStock(this._tid);

        // ════ Zone 1: Header (y=0 ~ 130) ════
        if (this._isGold) {
            this._tx(0, `[回收] \u4efb\u610f\u7269\u54c1 \u2192 \u91d1\u5e01`, 26, C.title, true);
            this._tx(36, `\u6536\u76ca\uff1a\u91d1\u5e01 \u00d7${stock.available}\uff08\u968f\u65f6\u53ef\u9886\u53d6\uff09`, 21, C.body);
        } else {
            this._tx(0, `[出售] ${this._gName}`, 26, C.title, true);
            this._tx(36, `\u5355\u4ef7\uff1a${this._price} \u91d1\u5e01 / \u4e2a`, 21, C.body);
            const st = stock.soldOut ? `\u5df2\u552e\u7f44\uff0c${stock.restockHours}h \u540e\u8865\u8d27` : `\u5269\u4f59 ${stock.available}/${stock.max}`;
            this._tx(68, `\u5e93\u5b58\uff1a${st}`, 21, stock.soldOut ? C.warn : C.sub);
        }

        // ════ Zone 2: Tab (y=148) ════
        if (!this._isGold) {
            const ty = 148, tw = 300, th = 54, gap = 14;
            this._tG = this._tabN(-gap / 2 - tw / 2, ty, tw, th, '\u91d1\u5e01\u8d2d\u4e70', () => this._sw('gold'));
            this._tB = this._tabN(gap / 2 + tw / 2, ty, tw, th, '\u4ee5\u7269\u6613\u8d27', () => this._sw('barter'));
            this._rstab();
        }

        // ════ Zone 3: Body (起始 y=225) ════
        const bodyY = !this._isGold ? 225 : 150;
        if (this._isGold) this._bGoldSpec(bodyY);
        else if (this._mode === 'gold') this._bGoldBuy(bodyY);
        else if (this._bStage === 'choose') this._bBarterList(bodyY);
        else this._bBarterAmt(bodyY);
    }

    // ════ 标签切换 ════
    private _sw(m: 'gold' | 'barter'): void {
        if (this._mode === m) return;
        this._mode = m; this._bStage = 'choose'; this._bOffer = null; this._render();
    }
    private _rstab(): void {
        if (this._tG) this._styT(this._tG, this._mode === 'gold');
        if (this._tB) this._styT(this._tB, this._mode === 'barter');
    }
    private _styT(t: { n: Node; g: Graphics; l: Label }, on: boolean): void {
        t.g.clear(); t.g.fillColor = on ? C.tabOn : C.tabOff;
        const w = 300, h = 54;
        t.g.roundRect(-w / 2, -h / 2, w, h, 12); t.g.fill();
        t.g.lineWidth = 2; t.g.strokeColor = on ? C.accent : C.border;
        t.g.roundRect(-w / 2, -h / 2, w, h, 12); t.g.stroke();
        t.l.color = on ? C.white : C.body;
    }

    // ════ Body: 金币特殊商人 ════
    private _bGoldSpec(by: number): void {
        this._tx(by, `\u53ef\u9886\u53d6\uff1a\u91d1\u5e01 \u00d7${ActionTrade.instance.getStock(this._tid).available}`, 23, C.body);
        this._cf = this._btn(by + 48, 340, 84, '\u9886\u53d6\u6536\u76ca', C.accent2, () => this._do());
    }

    // ════ Body: 金币购买 ════
    private _bGoldBuy(by: number): void {
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const stock = ActionTrade.instance.getStock(this._tid);
        const mbg = this._price > 0 ? Math.floor(gold / this._price) : 0;
        this._mqty = Math.max(0, Math.min(stock.available, mbg));
        this._mnqty = 1; this._qty = this._mqty > 0 ? 1 : 0;

        // 摘要行
        this._tx(by, `\u6301\u6709 ${gold} \u91d1 | \u5355\u4ef7 ${this._price} | \u6700\u5917 ${this._mqty} \u4e2a`, 19, C.sub);

        if (this._mqty <= 0) {
            const r = stock.soldOut ? '\u5546\u4eba\u8d27\u7269\u5df2\u552e\u7f44' : '\u91d1\u5e01\u4e0d\u8db3';
            this._tx(by + 34, r, 23, C.warn, true);
            this._cf = this._btn(by + 84, 320, 76, '\u5173\u95ed', C.disabled, () => this.hide());
            return;
        }

        // 数量选择区标题
        this._tx(by + 34, '\u8d2d\u4e65\u6570\u91cf', 22, C.title, true);

        // 滑动条
        this._slider = new QSlider(this._c!, by + 90, (v) => {
            this._qty = v; if (this._qLbl) this._qLbl.string = `\u00d7${v}`; this._updGP();
        });
        this._slider.setRange(this._mnqty, this._mqty, this._qty);

        // 步进器 + 数量显示
        const sy = by + 152;
        this._step(sy, -115, -1); this._step(sy, 115, 1);
        this._qLbl = this._txCI(sy, 0, 110, 52, `\u00d7${this._qty}`, 28, C.title);

        // 预览
        this._updGP();

        // 确认按钮
        this._cf = this._btn(by + 215, 400, 84, '\u786e\u8ba4\u8d2d\u4e70', C.accent2, () => this._do());
        this._updGC();
    }

    private _updGP(): void {
        if (!this._c) return;
        const old = this._c.getChildByName('_gp'); if (old) old.destroy();
        const pn = new Node('_gp'); pn.setParent(this._c!);
        const cost = this._price * this._qty;
        this._txI(pn, -PW / 2 + 28, -5, `\u8393\u8d39\uff1a${cost} \u91d1`, 21, C.body);
        this._txI(pn, -PW / 2 + 28, -33, `\u2192 \u83b7\u5f97\uff1a${this._gName} \u00d7${this._qty}`, 21, C.accent2, true);
        this._updGC();
    }
    private _updGC(): void {
        if (!this._cf) return;
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const ok = gold >= this._price * this._qty && this._qty > 0;
        this._cf.l.string = ok ? `\u786e\u8ba4\u8d2d\u4e70(${this._price * this._qty}\u91d1)` : '\u91d1\u5e01\u4e0d\u8db3';
        this._cf.g.clear(); this._cf.g.fillColor = ok ? C.accent2 : C.disabled;
        this._cf.g.roundRect(-200, -42, 400, 84, 14); this._cf.g.fill();
    }

    // ════ Body: 易货列表 ════
    private _bBarterList(by: number): void {
        this._tx(by, '\u9009\u62e9\u8981\u4ea4\u6362\u7684\u7269\u54c1', 22, C.title, true);

        const bag = GameManager.instance.boxSaveData['bag'] || {};
        const items = Object.keys(bag)
            .filter(id => (bag[id] || 0) > 0 && id !== 'gold' && ActionTrade.instance.getPrice(id) > 0)
            .sort((a, b) => (bag[b] || 0) - (bag[a] || 0));

        if (items.length === 0) {
            this._tx(by + 34, '\u80cc\u5305\u91cc\u6ca1\u6709\u53ef\u7528\u4e8e\u4ea4\u6362\u7684\u7269\u54c1', 21, C.warn);
            this._btn(by + 80, 280, 72, '\u5173\u95ed', C.disabled, () => this.hide());
            return;
        }

        // ScrollView 列表
        const lh = 480, rh = 76;
        const sv = new Node('BL'); const svt = sv.addComponent(UITransform);
        svt.setContentSize(PW - 48, lh); svt.setAnchorPoint(0.5, 1);
        sv.setPosition(0, by + 34, 0); sv.setParent(this._c!);
        sv.addComponent(Mask);
        const sc = sv.addComponent(ScrollView); sc.horizontal = false; sc.vertical = true;
        sc.verticalScrollBar = null; sc.horizontalScrollBar = null; sc.inertia = true; sc.brake = 0.3;

        const cnt = new Node('BC'); const cntT = cnt.addComponent(UITransform);
        cntT.setContentSize(PW - 48, Math.max(lh, items.length * rh + 16));
        cntT.setAnchorPoint(0.5, 1); cnt.setParent(sv); sc.content = cnt;

        items.forEach((id, i) => {
            const q = bag[id] || 0, nm = ITEM_DATA[id]?.name || id;
            const out = ActionTrade.instance.previewBarter(this._tid, id, q);
            const row = new Node(`r_${id}`);
            const rt = row.addComponent(UITransform); rt.setContentSize(PW - 68, rh - 6); rt.setAnchorPoint(0.5, 1);
            row.setPosition(0, -i * rh - 8, 0); row.setParent(cnt);
            const rg = row.addComponent(Graphics); rg.fillColor = new Color(255, 252, 245);
            rg.roundRect(-(PW - 68) / 2, -(rh - 6) / 2, PW - 68, rh - 6, 10); rg.fill();
            rg.lineWidth = 1.5; rg.strokeColor = C.border;
            rg.roundRect(-(PW - 68) / 2, -(rh - 6) / 2, PW - 68, rh - 6, 10); rg.stroke();

            const lb = new Node('lb'); lb.setParent(row);
            lb.addComponent(UITransform).setContentSize(PW - 102, rh - 6);
            lb.setPosition(-16, 0, 0);
            const l = lb.addComponent(Label);
            l.string = out >= 1 ? `${nm} \u00d7${q}  \u2192 \u6362 ${this._gName} \u00d7${out}` : `${nm} \u00d7${q}  (\u4ef7\u503c\u4e0d\u8db3)`;
            l.fontSize = 19; l.color = out >= 1 ? C.body : C.disabled;
            l.horizontalAlign = Label.HorizontalAlign.LEFT;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP; l.lineHeight = 25;
            row.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true; this._bOffer = id; this._bStage = 'amount'; this._render();
            });
        });

        const mp = Math.round(ActionTrade.instance.getBarterMargin() * 100);
        this._tx(by + lh + 44, `\u63d0\u793a\uff1a\u6613\u8d22 \u226b \u5356\u8d27\u6362\u91d1\u518d\u4e70 (${mp}%\u5dee\u4ef7)`, 15, C.sub);
    }

    // ════ Body: 易货数量 ════
    private _bBarterAmt(by: number): void {
        const onm = ITEM_DATA[this._bOffer!]?.name || this._bOffer!;
        this._tx(by, `\u4ea4\u6362\u7269\uff1a${onm}`, 22, C.title, true);

        const bq = GameManager.instance.boxSaveData['bag']?.[this._bOffer!] || 0;
        this._mqty = Math.max(1, bq); this._mnqty = 1; this._qty = 1;

        this._slider = new QSlider(this._c!, by + 42, (v) => {
            this._qty = v; if (this._qLbl) this._qLbl.string = `\u00d7${v}`; this._updBP();
        });
        this._slider.setRange(this._mnqty, this._mqty, this._qty);

        const sy = by + 104;
        this._step(sy, -115, -1); this._step(sy, 115, 1);
        this._qLbl = this._txCI(sy, 0, 110, 52, `\u00d7${this._qty}`, 28, C.title);

        this._updBP();

        this._btn(by + 170, 190, 68, '\u2190 \u91cd\u9009', C.tabOff, () => {
            this._bStage = 'choose'; this._bOffer = null; this._render();
        });
        this._cf = this._btn(by + 170, 280, 68, '\u786e\u8ba4\u6613\u8d27', C.accent, () => this._do());
        this._updBC();
    }

    private _updBP(): void {
        if (!this._c) return;
        const old = this._c.getChildByName('_bp'); if (old) old.destroy();
        const pn = new Node('_bp'); pn.setParent(this._c!);
        const onm = ITEM_DATA[this._bOffer!]?.name || this._bOffer!;
        const out = ActionTrade.instance.previewBarter(this._tid, this._bOffer!, this._qty);
        this._txI(pn, -PW / 2 + 28, -5, `\u7ed9\uff1a${onm} \u00d7${this._qty}`, 21, C.body);
        this._txI(pn, -PW / 2 + 28, -33,
            out >= 1 ? `\u2192 \u6362\uff1a${this._gName} \u00d7${out}` : `\u2192 \u4ef7\u503c\u4e0d\u8db3`,
            21, out >= 1 ? C.accent : C.warn, true);
        this._updBC();
    }
    private _updBC(): void {
        if (!this._cf) return;
        const out = ActionTrade.instance.previewBarter(this._tid, this._bOffer!, this._qty);
        const ok = out >= 1;
        this._cf.l.string = ok ? '\u786e\u8ba4\u6613\u8d27' : '\u65e0\u6cd5\u4ea4\u6362';
        this._cf.g.clear(); this._cf.g.fillColor = ok ? C.accent : C.disabled;
        this._cf.g.roundRect(-140, -34, 280, 68, 12); this._cf.g.fill();
    }

    // ════ 确认交易 ════
    private _do(): void {
        let r;
        if (this._isGold) r = ActionTrade.instance.trade(this._tid);
        else if (this._mode === 'gold') r = ActionTrade.instance.trade(this._tid, this._qty);
        else r = ActionTrade.instance.barter(this._tid, this._bOffer!, this._qty);
        if (this._onTrade) this._onTrade(r.message);
        this._render();
    }

    // ═════ 工具方法 ═════

    /** 文本标签：绝对 Y 定位到 _content */
    private _tx(y: number, text: string, sz: number, clr: Color, bold = false): Label {
        if (!this._c) throw new Error('_c missing');
        const n = new Node('L');
        const nt = n.addComponent(UITransform);
        nt.setContentSize(PW - 48, Math.ceil(sz * 2.2) + 8);
        nt.setAnchorPoint(0.5, 1);
        n.setPosition(0, -y, 0); n.setParent(this._c);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = sz; l.color = clr;
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.verticalAlign = Label.VerticalAlign.TOP;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = Math.ceil(sz * 1.55);
        if (bold) l.isBold = true;
        return l;
    }

    /** 内联文本：添加到指定父节点 */
    private _txI(p: Node, x: number, yy: number, text: string, sz: number, clr: Color, bold = false): Label {
        const n = new Node('iL');
        const t = n.addComponent(UITransform); t.setContentSize(PW - 56, Math.ceil(sz * 2) + 6);
        t.setAnchorPoint(0, 0.5); n.setPosition(x, yy, 0); n.setParent(p);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = sz; l.color = clr;
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        l.enableWrapText = true; l.overflow = Label.Overflow.CLAMP;
        l.lineHeight = Math.ceil(sz * 1.5);
        if (bold) l.isBold = true;
        return l;
    }

    /** 居中内联文本 */
    private _txCI(p: Node | undefined, x: number, yy: number, w: number, h: number, text: string, sz: number, clr: Color): Label {
        const tgt = p || this._c!;
        const n = new Node('ic');
        const t = n.addComponent(UITransform); t.setContentSize(w, h); t.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, yy, 0); n.setParent(tgt);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = sz; l.color = clr;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        if (sz >= 28) l.isBold = true;
        return l;
    }

    /** 按钮 */
    private _btn(y: number, w: number, h: number, text: string, bg: Color, cb: () => void): { n: Node; l: Label; g: Graphics } {
        const n = new Node('Btn');
        const nt = n.addComponent(UITransform); nt.setContentSize(w, h); nt.setAnchorPoint(0.5, 1);
        n.setPosition(0, -y, 0); n.setParent(this._c!);
        const g = n.addComponent(Graphics); g.fillColor = bg;
        g.roundRect(-w / 2, -h / 2, w, h, 14); g.fill();
        g.lineWidth = 2; g.strokeColor = new Color(150, 110, 70, 200);
        g.roundRect(-w / 2, -h / 2, w, h, 14); g.stroke();
        const lbl = this._txI(n, 0, 0, text, Math.min(24, h * 0.43), C.white, true);
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; cb(); });
        return { n, l: lbl, g };
    }

    /** Tab 按钮（Label 用子节点避免与 Graphics 同级冲突） */
    private _tabN(x: number, y: number, w: number, h: number, text: string, cb: () => void): { n: Node; g: Graphics; l: Label } {
        const n = new Node('Tab');
        const nt = n.addComponent(UITransform); nt.setContentSize(w, h); nt.setAnchorPoint(0.5, 1);
        n.setPosition(x, -y, 0); n.setParent(this._c!);
        const g = n.addComponent(Graphics);
        // Label 放在子节点上（与 _btn 同模式），避免 Graphics 覆盖渲染
        const lbl = this._txI(n, 0, 0, text, Math.min(23, h * 0.43), C.body, true);
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        lbl.node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; cb(); });
        return { n, g, l: lbl };
    }

    /** 步进按钮 */
    private _step(y: number, x: number, sign: number): void {
        const n = new Node('Step');
        const nt = n.addComponent(UITransform); nt.setContentSize(60, 60); nt.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0); n.setParent(this._c!);
        const g = n.addComponent(Graphics); g.fillColor = C.tabOn;
        g.roundRect(-30, -30, 60, 60, 12); g.fill();
        g.lineWidth = 2; g.strokeColor = C.accent;
        g.roundRect(-30, -30, 60, 60, 12); g.stroke();
        const l = n.addComponent(Label);
        l.string = sign > 0 ? '+' : '\u2212'; l.fontSize = 34; l.color = C.white;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER; l.isBold = true;
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            const nv = Math.min(this._mqty, Math.max(this._mnqty, this._qty + sign));
            if (nv !== this._qty && this._slider) this._slider.setValue(nv);
        });
    }
}
