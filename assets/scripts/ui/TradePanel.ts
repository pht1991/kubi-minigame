/**
 * TradePanel.ts - 交易面板（继承 ModalPanel 的公共模态外壳）
 *
 * 布局：固定分区绝对定位（Header / Tab / Body 三区独立坐标，杜绝游标累加重叠）
 *   - Header: y=0~130   （商品信息，始终可见）
 *   - Tab:   y=148      （金币购买 / 以物易货）
 *   - Body:  y=225+     （动态内容区）
 *
 * 交互：
 *   - 金币购买：滑动条 + 步进器 + 实时预览「花费X→获得Y」
 *   - 以物易物：选物品(列表) → 定数量 → 预览「给A×q→换B×r」
 *   - give==='gold' 特殊商人：直接领取
 */

import {
    Node, Label, UITransform, Color, Graphics, EventTouch, NodeEventType,
} from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { QSlider } from './QSlider';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';

const PW = 680;    // 面板宽
const PH = 1000;   // 面板高


// ═════════════════ TradePanel ═══════════════
export class TradePanel extends ModalPanel {
    protected panelW = PW;    // 覆盖基类默认 640×900
    protected panelH = PH;

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

    // ════ 对外接口 ════
    show(traderId: string, onTraded?: (msg: string) => void): void {
        this._tid = traderId; this._onTrade = onTraded || null;
        const d = TRADE_DATA[traderId];
        this._give = d?.give || ''; this._gName = ITEM_DATA[this._give]?.name || this._give;
        this._price = ActionTrade.instance.getPrice(this._give); this._isGold = this._give === 'gold';
        this._mode = 'gold'; this._bStage = 'choose'; this._bOffer = null;
        super.show(d?.name || '商人');
    }

    // ════ 全量渲染（固定分区绝对定位）═════
    protected render(): void {
        if (!this._content) return;
        this.clearContent();
        this._slider = null; this._tG = null; this._tB = null;
        this._cf = null; this._qLbl = null;

        const stock = ActionTrade.instance.getStock(this._tid);

        // ════ Zone 1: Header (y=0 ~ 130) ════
        if (this._isGold) {
            this._tx(0, `[回收] 任意物品 → 金币`, 26, C.title, true);
            this._tx(36, `收益：金币 ×${stock.available}（随时可领取）`, 21, C.body);
        } else {
            this._tx(0, `[出售] ${this._gName}`, 26, C.title, true);
            this._tx(36, `单价：${this._price} 金币 / 个`, 21, C.body);
            const st = stock.soldOut ? `已售罄，${stock.restockHours}h 后补货` : `库存：剩余 ${stock.available}/${stock.max}`;
            this._tx(68, st, 21, stock.soldOut ? C.warn : C.sub);
        }

        // ════ Zone 2: Tab (y=148) ════
        if (!this._isGold) {
            const ty = 148, tw = 300, th = 54, gap = 14;
            this._tG = this._tabN(-gap / 2 - tw / 2, ty, tw, th, '金币购买', () => this._sw('gold'));
            this._tB = this._tabN(gap / 2 + tw / 2, ty, tw, th, '以物易货', () => this._sw('barter'));
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
        this._mode = m; this._bStage = 'choose'; this._bOffer = null; this.render();
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
        this._tx(by, `可领取：金币 ×${ActionTrade.instance.getStock(this._tid).available}`, 23, C.body);
        this._cf = this._btn(by + 48, 340, 84, '领取收益', C.accent2, () => this._do());
    }

    // ════ Body: 金币购买 ════
    private _bGoldBuy(by: number): void {
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const stock = ActionTrade.instance.getStock(this._tid);
        const mbg = this._price > 0 ? Math.floor(gold / this._price) : 0;
        this._mqty = Math.max(0, Math.min(stock.available, mbg));
        this._mnqty = 1; this._qty = this._mqty > 0 ? 1 : 0;

        this._tx(by, `持有 ${gold} 金 | 单价 ${this._price} | 最多 ${this._mqty} 个`, 19, C.sub);

        if (this._mqty <= 0) {
            const r = stock.soldOut ? '商人货物已售罄' : '金币不足';
            this._tx(by + 34, r, 23, C.warn, true);
            return;
        }

        this._tx(by + 34, '购买数量', 22, C.title, true);

        this._slider = new QSlider(this._content!, by + 90, (v) => {
            this._qty = v; if (this._qLbl) this._qLbl.string = `×${v}`; this._updGP();
        });
        this._slider.setRange(this._mnqty, this._mqty, this._qty);

        const sy = by + 152;
        this._step(sy, -115, -1); this._step(sy, 115, 1);
        this._qLbl = this._txCI(sy, 0, 110, 52, `×${this._qty}`, 28, C.title);

        this._updGP();

        this._cf = this._btn(by + 215, 400, 84, '确认购买', C.accent2, () => this._do());
        this._updGC();
    }

    private _updGP(): void {
        if (!this._content) return;
        const old = this._content.getChildByName('_gp'); if (old) old.destroy();
        const pn = new Node('_gp'); pn.setParent(this._content!);
        const cost = this._price * this._qty;
        this._txI(pn, -PW / 2 + 28, -5, `花费：${cost} 金`, 21, C.body);
        this._txI(pn, -PW / 2 + 28, -33, `→ 获得：${this._gName} ×${this._qty}`, 21, C.accent2, true);
        this._updGC();
    }
    private _updGC(): void {
        if (!this._cf) return;
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const ok = gold >= this._price * this._qty && this._qty > 0;
        this._cf.l.string = ok ? `确认购买(${this._price * this._qty}金)` : '金币不足';
        this._cf.g.clear(); this._cf.g.fillColor = ok ? C.accent2 : C.disabled;
        this._cf.g.roundRect(-200, -42, 400, 84, 14); this._cf.g.fill();
    }

    // ════ Body: 易货列表 ════
    private _bBarterList(by: number): void {
        this._tx(by, '选择要交换的物品', 22, C.title, true);

        const bag = GameManager.instance.boxSaveData['bag'] || {};
        const items = Object.keys(bag)
            .filter(id => (bag[id] || 0) > 0 && id !== 'gold' && ActionTrade.instance.getPrice(id) > 0)
            .sort((a, b) => (bag[b] || 0) - (bag[a] || 0));

        if (items.length === 0) {
            this._tx(by + 34, '背包里没有可用于交换的物品', 21, C.warn);
            return;
        }

        const lh = 480, rh = 76;
        const { view: sv, content: cnt } = this.mkScroll(this._content!, 0, -(by + 34), PW - 48, lh);
        cnt.getComponent(UITransform)!.setContentSize(PW - 48, Math.max(lh, items.length * rh + 16));

        items.forEach((id, i) => {
            const q = bag[id] || 0, nm = ITEM_DATA[id]?.name || id;
            const out = ActionTrade.instance.previewBarter(this._tid, id, q);
            const row = new Node(`r_${id}`);
            const rt = row.addComponent(UITransform); rt.setContentSize(PW - 68, rh - 6); rt.setAnchorPoint(0.5, 0.5);
            row.setPosition(0, -i * rh - rh / 2 - 6, 0); row.setParent(cnt);
            const rg = row.addComponent(Graphics); rg.fillColor = new Color(255, 252, 245);
            this.mkRect(rg, -(PW - 68) / 2, -(rh - 6) / 2, PW - 68, rh - 6, 10, new Color(255, 252, 245), C.border, 1.5);

            this.mkInline(row, -(PW - 68) / 2 + 12, 0, PW - 102, rh - 6,
                out >= 1 ? `${nm} ×${q}  → 换 ${this._gName} ×${out}` : `${nm} ×${q}  (价值不足)`,
                19, out >= 1 ? C.body : C.disabled);

            row.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true; this._bOffer = id; this._bStage = 'amount'; this.render();
            });
        });

        const mp = Math.round(ActionTrade.instance.getBarterMargin() * 100);
        this._tx(by + lh + 44, `提示：易货 >> 卖货换金币再买 (${mp}%差价)`, 15, C.sub);
    }

    // ════ Body: 易货数量 ════
    private _bBarterAmt(by: number): void {
        const onm = ITEM_DATA[this._bOffer!]?.name || this._bOffer!;
        this._tx(by, `交换物：${onm}`, 22, C.title, true);

        const bq = GameManager.instance.boxSaveData['bag']?.[this._bOffer!] || 0;
        this._mqty = Math.max(1, bq); this._mnqty = 1; this._qty = 1;

        this._slider = new QSlider(this._content!, by + 42, (v) => {
            this._qty = v; if (this._qLbl) this._qLbl.string = `×${v}`; this._updBP();
        });
        this._slider.setRange(this._mnqty, this._mqty, this._qty);

        const sy = by + 104;
        this._step(sy, -115, -1); this._step(sy, 115, 1);
        this._qLbl = this._txCI(sy, 0, 110, 52, `×${this._qty}`, 28, C.title);

        this._updBP();

        this._btn(by + 170, 190, 68, '← 重选', C.tabOff, () => {
            this._bStage = 'choose'; this._bOffer = null; this.render();
        });
        this._cf = this._btn(by + 170, 280, 68, '确认易货', C.accent, () => this._do());
        this._updBC();
    }

    private _updBP(): void {
        if (!this._content) return;
        const old = this._content.getChildByName('_bp'); if (old) old.destroy();
        const pn = new Node('_bp'); pn.setParent(this._content!);
        const onm = ITEM_DATA[this._bOffer!]?.name || this._bOffer!;
        const out = ActionTrade.instance.previewBarter(this._tid, this._bOffer!, this._qty);
        this._txI(pn, -PW / 2 + 28, -5, `给：${onm} ×${this._qty}`, 21, C.body);
        this._txI(pn, -PW / 2 + 28, -33,
            out >= 1 ? `→ 换：${this._gName} ×${out}` : `→ 价值不足`,
            21, out >= 1 ? C.accent : C.warn, true);
        this._updBC();
    }
    private _updBC(): void {
        if (!this._cf) return;
        const out = ActionTrade.instance.previewBarter(this._tid, this._bOffer!, this._qty);
        const ok = out >= 1;
        this._cf.l.string = ok ? '确认易货' : '无法交换';
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
        this.render();
    }

    // ═════ 薄封装：把原私有助手对接到基类公共助手（集中修复点在基类）═════
    private _tx(y: number, text: string, sz: number, clr: Color, bold = false): Label {
        return this.mkText(this._content!, 0, -y, PW - 48, Math.ceil(sz * 2.2) + 8, text, sz, clr, { bold, align: 'left' });
    }
    private _txI(p: Node, x: number, yy: number, text: string, sz: number, clr: Color, bold = false): Label {
        return this.mkInline(p, x, yy, PW - 56, Math.ceil(sz * 2) + 6, text, sz, clr, bold);
    }
    private _txCI(p: Node | undefined, x: number, yy: number, w: number, h: number, text: string, sz: number, clr: Color): Label {
        return this.mkCenter(p || this._content!, x, yy, w, h, text, sz, clr);
    }
    private _btn(y: number, w: number, h: number, text: string, bg: Color, cb: () => void): { n: Node; l: Label; g: Graphics } {
        const r = this.mkButton(this._content!, 0, -y, w, h, text, bg, cb);
        return { n: r.node, l: r.label, g: r.gfx };
    }
    private _tabN(x: number, y: number, w: number, h: number, text: string, cb: () => void): { n: Node; g: Graphics; l: Label } {
        const r = this.mkTab(this._content!, x, -y, w, h, text, cb);
        return { n: r.node, g: r.gfx, l: r.label };
    }
    /** 步进按钮（Label 放子节点，避免与 Graphics 同节点冲突） */
    private _step(y: number, x: number, sign: number): void {
        const n = new Node('Step');
        const nt = n.addComponent(UITransform); nt.setContentSize(60, 60); nt.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0); n.setParent(this._content!);
        const g = n.addComponent(Graphics);
        this.mkRect(g, -30, -30, 60, 60, 12, C.tabOn, C.accent, 2);
        this.mkCenter(n, 0, 0, 60, 60, sign > 0 ? '+' : '−', 34, C.white, true);
        n.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            const nv = Math.min(this._mqty, Math.max(this._mnqty, this._qty + sign));
            if (nv !== this._qty && this._slider) this._slider.setValue(nv);
        });
    }
}
