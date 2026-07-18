/**
 * TradePanel.ts - 交易面板（继承 ModalPanel 的公共模态外壳）
 *
 * 布局：固定分区绝对定位（Header / Tab / Body 三区独立坐标，杜绝游标累加重叠）
 *   - Header: y=0~130   （商品信息，始终可见）
 *   - Tab:   y=148      （金币购买 / 以物易货）
 *   - Body:  y=225+     （动态内容区：特殊商人领取 / 购买入口 / 易货列表）
 *
 * 数量选择已抽离为独立弹窗 TradeQtyPanel：
 *   - 金币购买 → 点击后弹出 TradeQtyPanel（滑块选数量 → 确认交易）
 *   - 以物易物 → 选物品后弹出 TradeQtyPanel（滑块选数量 → 确认/重选）
 */

import {
    Node, Label, UITransform, Color, Graphics, EventTouch, NodeEventType,
} from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';
import { TradeQtyPanel, TradeQtyConfig } from './TradeQtyPanel';

const PW = 680;    // 面板宽
const PH = 1000;   // 面板高


// ═════════════════ TradePanel ═══════════════
export class TradePanel extends ModalPanel {
    protected panelW = PW;
    protected panelH = PH;

    private _tid = '';
    private _give = '';
    private _gName = '';
    private _price = 0;
    private _isGold = false;
    private _mode: 'gold' | 'barter' = 'gold';

    private _onTrade: ((msg: string) => void) | null = null;
    private _tG: { n: Node; g: Graphics; l: Label } | null = null;
    private _tB: { n: Node; g: Graphics; l: Label } | null = null;

    /** 懒创建的数量选择弹窗（与 TradePanel 同级挂 modalLayer） */
    private _qtyPanel: TradeQtyPanel | null = null;

    /** 外部注入数量弹窗（MainScene 创建后调用） */
    public setQtyPanel(p: TradeQtyPanel): void { this._qtyPanel = p; }

    private _getQty(): TradeQtyPanel {
        if (!this._qtyPanel) {
            this._qtyPanel = new Node('TradeQty').addComponent(TradeQtyPanel);
            // 挂到与 TradePanel 同级（modalLayer），确保遮罩完整覆盖
            (this._qtyPanel.node.parent = this.node.parent) && null;
        }
        return this._qtyPanel;
    }

    // ════ 对外接口 ════
    show(traderId: string, onTraded?: (msg: string) => void): void {
        this._tid = traderId; this._onTrade = onTraded || null;
        const d = TRADE_DATA[traderId];
        this._give = d?.give || ''; this._gName = ITEM_DATA[this._give]?.name || this._give;
        this._price = ActionTrade.instance.getPrice(this._give); this._isGold = this._give === 'gold';
        this._mode = 'gold';
        super.show(d?.name || '商人');
    }

    // ════ 全量渲染（固定分区绝对定位）═════
    protected render(): void {
        if (!this._content) return;
        this.clearContent();
        this._tG = null; this._tB = null;

        const stock = ActionTrade.instance.getStock(this._tid);

        // ════ Zone 1: Header (y=0 ~ 130) ════
        if (this._isGold) {
            this._tx(0, `[回收] \u4efb\u610f\u7269\u54c1 \u2192 \u91d1\u5e01`, 26, C.title, true);
            this._tx(36, `\u6536\u76ca\uff1a\u91d1\u5e01 \u00d7${stock.available}\uff08\u968f\u65f6\u53ef\u9886\u53d6\uff09`, 21, C.body);
        } else {
            this._tx(0, `[\u51fa\u552e] ${this._gName}`, 26, C.title, true);
            this._tx(36, `\u5355\u4ef7\uff1a${this._price} \u91d1\u5e01 / \u4e2a`, 21, C.body);
            const st = stock.soldOut ? `\u5df2\u552e\u7b4c\uff0c${stock.restockHours}h \u540e\u8865\u8d27` : `\u5e93\u5b58\uff1a\u5269\u4f59 ${stock.available}/${stock.max}`;
            this._tx(68, st, 21, stock.soldOut ? C.warn : C.sub);
        }

        // ════ Zone 2: Tab (y=148) ════
        if (!this._isGold) {
            const ty = 148, tw = 300, th = 54, gap = 14;
            this._tG = this._tabN(-gap / 2 - tw / 2, ty, tw, th, '\u91d1\u5e01\u8d2d\u4e70', () => this._sw('gold'));
            this._tB = this._tabN(gap / 2 + tw / 2, ty, tw, th, '\u4ee5\u7269\u6613\u8d27', () => this._sw('barter'));
            this._rstab();
        }

        // ════ Zone 3: Body ════
        const bodyY = !this._isGold ? 225 : 150;
        if (this._isGold) this._bGoldSpec(bodyY);
        else if (this._mode === 'gold') this._bGoldEntry(bodyY);
        else this._bBarterList(bodyY);
    }

    // ════ 标签切换 ════
    private _sw(m: 'gold' | 'barter'): void {
        if (this._mode === m) return;
        this._mode = m;
        this.render();
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

    // ════ Body: 金币特殊商人（直接领取）═════
    private _bGoldSpec(by: number): void {
        this._tx(by, `\u53ef\u9886\u53d6\uff1a\u91d1\u5e01 \u00d7${ActionTrade.instance.getStock(this._tid).available}`, 23, C.body);
        this._btn(by + 48, 340, 84, '\u9886\u53d6\u6536\u76ca', C.accent2, () => this._do());
    }

    // ════ Body: 金币购买（入口 → 弹出数量弹窗）═════
    private _bGoldEntry(by: number): void {
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const stock = ActionTrade.instance.getStock(this._tid);
        const mbg = this._price > 0 ? Math.floor(gold / this._price) : 0;
        const mqty = Math.max(0, Math.min(stock.available, mbg));

        this._tx(by, `\u6301\u6709 ${gold} \u91d1 | \u5355\u4ef7 ${this._price} | \u6700\u591a ${mqty} \u4e2a`, 19, C.sub);

        if (mqty <= 0) {
            const r = stock.soldOut ? '\u5546\u4eba\u8d27\u7269\u5df2\u552e\u7b4c' : '\u91d1\u5e01\u4e0d\u8db3';
            this._tx(by + 34, r, 23, C.warn, true);
            return;
        }

        // 「选择数量」按钮 → 弹出 TradeQtyPanel
        this._btn(by + 50, 400, 84, '\u9009\u62e9\u6570\u91cf', C.accent, () => {
            const cfg: TradeQtyConfig = {
                title: `\u8d2d\u4e70\uff1a${this._gName}`,
                infoLines: [`\u6301\u6709 ${gold} \u91d1 | \u5355\u4ef7 ${this._price} | \u6700\u591a ${mqty} \u4e2a`],
                max: mqty,
                initial: 1,
                getPreview: (q) => [
                    `\u82b1\u8d39\uff1a${this._price * q} \u91d1`,
                    `\u2192 \u83b7\u5f97\uff1a${this._gName} \u00d7${q}`,
                ],
                confirmLabel: '\u786e\u8ba4\u8d2d\u4e70',
                confirmColor: C.accent2,
                onConfirm: (q) => { this._doWithQty(q, 'gold'); },
            };
            this._getQty().show(cfg);
        });
    }

    // ════ Body: 易货列表（选物品 → 弹出数量弹窗）═════
    private _bBarterList(by: number): void {
        this._tx(by, '\u9009\u62e9\u8981\u4ea4\u6362\u7684\u7269\u54c1', 22, C.title, true);

        const bag = GameManager.instance.boxSaveData['bag'] || {};
        const items = Object.keys(bag)
            .filter(id => (bag[id] || 0) > 0 && id !== 'gold' && ActionTrade.instance.getPrice(id) > 0)
            .sort((a, b) => (bag[b] || 0) - (bag[a] || 0));

        if (items.length === 0) {
            this._tx(by + 34, '\u80cc\u5305\u91cc\u6ca1\u6709\u53ef\u7528\u4e8e\u4ea4\u6362\u7684\u7269\u54c1', 21, C.warn);
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
                out >= 1 ? `${nm} \u00d7${q}  \u2192 \u6362 ${this._gName} \u00d7${out}` : `${nm} \u00d7${q}  (\u4ef7\u503c\u4e0d\u8db3)`,
                19, out >= 1 ? C.body : C.disabled);

            row.on(NodeEventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                // 弹出数量选择弹窗
                const bq = bag[id] || 0;
                const onm = ITEM_DATA[id]?.name || id;
                const cfg: TradeQtyConfig = {
                    title: `\u4ea4\u6362\u7269\uff1a${onm}`,
                    infoLines: [`\u6301\u6709 ${q} \u4e2a`],
                    max: Math.max(1, bq),
                    initial: 1,
                    getPreview: (qty) => {
                        const r = ActionTrade.instance.previewBarter(this._tid, id, qty);
                        return r >= 1
                            ? [`\u7ed9\uff1a${onm} \u00d7${qty}`, `\u2192 \u6362\uff1a${this._gName} \u00d7${r}`]
                            : [`\u7ed9\uff1a${onm} \u00d7${qty}`, `\u2192 \u4ef7\u503c\u4e0d\u8db3`];
                    },
                    confirmLabel: '\u786e\u8ba4\u6613\u8d27',
                    confirmColor: C.accent,
                    backLabel: '\u2190 \u91cd\u9009',
                    onBack: () => { /* 返回列表，无需额外操作 */ },
                    onConfirm: (qty) => { this._doWithOffer(id, qty); },
                };
                this._getQty().show(cfg);
            });
        });

        const mp = Math.round(ActionTrade.instance.getBarterMargin() * 100);
        this._tx(by + lh + 44, `\u63d0\u793a\uff1a\u6613\u8d27 >> \u5356\u8d27\u6362\u91d1\u5e01\u518d\u4e70 (${mp}%\u5dee\u4ef7)`, 15, C.sub);
    }

    // ════ 执行交易（带数量的版本）═════
    private _doWithQty(qty: number, mode: 'gold'): void {
        let r;
        if (mode === 'gold') r = ActionTrade.instance.trade(this._tid, qty);
        else r = ActionTrade.instance.barter(this._tid, '', qty); // unreachable guard
        if (this._onTrade) this._onTrade(r.message);
        this.render();
    }
    private _doWithOffer(offerId: string, qty: number): void {
        const r = ActionTrade.instance.barter(this._tid, offerId, qty);
        if (this._onTrade) this._onTrade(r.message);
        this.render();
    }

    // ════ 兼容旧接口（特殊商人无数量）═════
    private _do(): void {
        const r = ActionTrade.instance.trade(this._tid);
        if (this._onTrade) this._onTrade(r.message);
        this.render();
    }

    // ═════ 薄封装：对接基类公共助手 ═════
    private _tx(y: number, text: string, sz: number, clr: Color, bold = false): Label {
        return this.mkText(this._content!, 0, -y, PW - 48, Math.ceil(sz * 2.2) + 8, text, sz, clr, { bold, align: 'left' });
    }
    private _btn(y: number, w: number, h: number, text: string, bg: Color, cb: () => void): { n: Node; l: Label; g: Graphics } {
        const r = this.mkButton(this._content!, 0, -y, w, h, text, bg, cb);
        return { n: r.node, l: r.label, g: r.gfx };
    }
    private _tabN(x: number, y: number, w: number, h: number, text: string, cb: () => void): { n: Node; g: Graphics; l: Label } {
        const r = this.mkTab(this._content!, x, -y, w, h, text, cb);
        return { n: r.node, g: r.gfx, l: r.label };
    }
}
