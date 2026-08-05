/**
 * TradePanel.ts - 交易面板（继承 ModalPanel 的公共模态外壳）
 *
 * 布局：固定分区绝对定位（Header / Tab / Body 三区独立坐标，杜绝游标累加重叠）
 *   - Header: y=0~130   （商品信息，始终可见）
 *   - Tab:   y=148      （金币购买 / 以物易货）
 *   - Body:  y=225+     （动态内容区：特殊商人领取 / 购买入口 / 易货列表）
 *
 * 数量选择复用公共 QuantityPanel 弹窗。
 *
 * 本次优化：易货行用 ModalRow、列表用 ModalScrollList、Tab 用 ModalTab，
 * 去掉原手绘 Graphics 选中态与重复的 UIShape+UILabel 行构建。
 */

import { ModalPanel, C } from './ModalPanel';
import { Color, Label, Node } from 'cc';
import { ModalRow, ModalTab, ModalScrollList } from './widgets';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';
import { QuantityPanel, QtyOptions } from './QuantityPanel';

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

    /** 懒创建的数量选择弹窗（与 TradePanel 同级挂 modalLayer） */
    private _qtyPanel: QuantityPanel | null = null;

    /** 外部注入数量弹窗（MainScene 创建后调用） */
    public setQtyPanel(p: QuantityPanel): void { this._qtyPanel = p; }

    private _getQty(): QuantityPanel {
        if (!this._qtyPanel) {
            this._qtyPanel = new Node('TradeQty').addComponent(QuantityPanel);
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
            const g = new ModalTab('金币购买', tw, th, () => this._sw('gold'));
            const b = new ModalTab('以物易货', tw, th, () => this._sw('barter'));
            g.node.setParent(this._content); g.node.setPosition(-gap / 2 - tw / 2, -ty, 0);
            b.node.setParent(this._content); b.node.setPosition(gap / 2 + tw / 2, -ty, 0);
            g.setActive(this._mode === 'gold'); b.setActive(this._mode === 'barter');
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

    // ════ Body: 金币特殊商人（直接领取）═════
    private _bGoldSpec(by: number): void {
        this._tx(by, `可领取：金币 ×${ActionTrade.instance.getStock(this._tid).available}`, 23, C.body);
        this._btn(by + 48, 340, 84, '领取收益', C.accent2, () => this._do());
    }

    // ════ Body: 金币购买（入口 → 弹出数量弹窗）═════
    private _bGoldEntry(by: number): void {
        const gold = GameManager.instance.boxSaveData['bag']?.['gold'] || 0;
        const stock = ActionTrade.instance.getStock(this._tid);
        const mbg = this._price > 0 ? Math.floor(gold / this._price) : 0;
        const mqty = Math.max(0, Math.min(stock.available, mbg));

        this._tx(by, `持有 ${gold} 金 | 单价 ${this._price} | 最多 ${mqty} 个`, 19, C.sub);

        if (mqty <= 0) {
            const r = stock.soldOut ? '商人货物已售罄' : '金币不足';
            this._tx(by + 34, r, 23, C.warn, true);
            return;
        }

        // 「选择数量」按钮 → 弹出 QuantityPanel
        this._btn(by + 50, 400, 84, '选择数量', C.accent, () => {
            const opts: QtyOptions = {
                infoLines: [`持有 ${gold} 金 | 单价 ${this._price} | 最多 ${mqty} 个`],
                confirmLabel: '确认购买',
                getPreview: (q) => [
                    `花费：${this._price * q} 金`,
                    `→ 获得：${this._gName} ×${q}`,
                ],
            };
            this._getQty().show(`购买：${this._gName}`, mqty, (q) => this._doWithQty(q, 'gold'), opts);
        });
    }

    // ════ Body: 易货列表（选物品 → 弹出数量弹窗）═════
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

        const rowW = PW - 68;
        const rows = items.map(id => {
            const q = bag[id] || 0, nm = ITEM_DATA[id]?.name || id;
            const out = ActionTrade.instance.previewBarter(this._tid, id, q);
            return new ModalRow({
                width: rowW,
                name: out >= 1 ? `${nm} ×${q}  → 换 ${this._gName} ×${out}` : `${nm} ×${q}  (价值不足)`,
                align: 'left',
                bg: C.white, stroke: C.panelBorder, radius: 10,
                disabled: out < 1,
                onTap: () => {
                    const opts: QtyOptions = {
                        infoLines: [`持有 ${q} 个`],
                        confirmLabel: '确认易货',
                        getPreview: (qty) => {
                            const r = ActionTrade.instance.previewBarter(this._tid, id, qty);
                            return r >= 1
                                ? [`给：${nm} ×${qty}`, `→ 换：${this._gName} ×${r}`]
                                : [`给：${nm} ×${qty}`, `→ 价值不足`];
                        },
                    };
                    this._getQty().show(`交换物：${nm}`, q, (qty) => this._doWithOffer(id, qty), opts);
                },
            });
        });

        // 列表用 ModalScrollList（固定面板，不随内容 resize）
        const list = this.createScrollList({
            parent: this._content!, x: 0, y: -(by + 34),
            width: PW - 48, viewH: 480, gap: 6, padT: 6,
            autoResizePanel: false, repositionScroll: false, align: 'center',
        });
        const listH = list.setRows(rows);

        const mp = Math.round(ActionTrade.instance.getBarterMargin() * 100);
        this._tx(by + listH + 44, `提示：易货 >> 卖货换金币再买 (${mp}%差价)`, 15, C.sub);
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
    private _btn(y: number, w: number, h: number, text: string, bg: Color, cb: () => void): void {
        this.mkButton(this._content!, 0, -y, w, h, text, bg, cb);
    }
}
