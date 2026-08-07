/**
 * TradePanel.ts - 交易面板（继承 ModalPanel 的公共模态外壳）
 *
 * 还原原版纯以物易物：每个商人只有一种可给物品 give（黄金/宝石/木材/升级书…），
 * 玩家把背包里的多种物品放进“易货篮”（对应原版 register），商人按 0.75 兑换率把
 * 付出总价值折算成 give 数量给你。没有“金币购买 / 以物易物”两种模式的区分。
 *
 * 布局（固定分区绝对定位，杜绝游标累加重叠）：
 *   - Header: y=0~100  （商人名 / 出售 give + 兑换率 / 库存 / 实时换算摘要）
 *   - Body:   y=130+    （单一滚动列表：易货篮条目(可移除) + 背包物品(点选加入)）
 *   - Footer: y≈472     （成交 / 清空）
 *
 * 数量选择复用公共 QuantityPanel 弹窗。
 */

import { ModalPanel, C } from './ModalPanel';
import { Color, Node } from 'cc';
import { ModalRow, ModalScrollList, UINode } from './widgets';
import { ITEM_DATA, TRADE_DATA } from '../data/data';
import { ActionTrade } from '../actions/ActionTrade';
import { GameManager } from '../core/GameManager';
import { QuantityPanel, QtyOptions } from './QuantityPanel';

const PW = 680;    // 面板宽
const PH = 1040;   // 面板高


// ═════════════════ TradePanel ═══════════════
export class TradePanel extends ModalPanel {
    protected panelW = PW;
    protected panelH = PH;

    private _tid = '';
    private _give = '';
    private _gName = '';
    /** 易货篮：物品ID → 数量（成交前不消耗，仅预览） */
    private _basket: Record<string, number> = {};

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
        this._tid = traderId;
        this._onTrade = onTraded || null;
        this._basket = {};                 // 每次打开清空易货篮
        const d = TRADE_DATA[traderId];
        this._give = d?.give || '';
        this._gName = ITEM_DATA[this._give]?.name || this._give;
        super.show(d?.name || '商人');
    }

    // ════ 全量渲染 ════
    protected render(): void {
        if (!this._content) return;
        this.clearContent();

        const stock = ActionTrade.instance.getStock(this._tid);
        const preview = ActionTrade.instance.previewBasket(this._tid, this._basket);

        // ════ Header (y=0 ~ 100) ════
        this._tx(0, `[交易] ${TRADE_DATA[this._tid]?.name || '商人'}`, 26, C.title, true);
        this._tx(34, `出售：${this._gName} · 兑换率 75%`, 21, C.body);
        const st = stock.soldOut ? `已售罄，${stock.restockHours}h 后补货` : `库存：剩余 ${stock.available}/${stock.max}`;
        this._tx(66, st, 21, stock.soldOut ? C.warn : C.sub);
        // 实时换算摘要
        const summary = preview.giveQty >= 1
            ? `付出估值 ${preview.offeredValue} → 可换 ${this._gName} ×${preview.giveQty}${preview.capped ? '（库存已满）' : ''}`
            : `付出估值 ${preview.offeredValue} → 还不足以交换`;
        this._tx(100, summary, 20, preview.giveQty >= 1 ? C.accent2 : C.sub, true);

        // ════ Body: 单一滚动列表（易货篮 + 背包）═════
        const bag = GameManager.instance.boxSaveData['bag'] || {};
        const rows: UINode[] = [];

        // —— 易货篮分区 ——
        rows.push(this._headerRow('易货篮（点条目可移除）'));
        const basketIds = Object.keys(this._basket).filter(id => this._basket[id] > 0);
        if (basketIds.length === 0) {
            rows.push(this._hintRow('点下方物品加入易货篮'));
        } else {
            for (const id of basketIds) {
                const q = this._basket[id];
                const nm = ITEM_DATA[id]?.name || id;
                rows.push(new ModalRow({
                    width: PW - 68,
                    name: `${nm} ×${q}`,
                    align: 'left',
                    bg: C.white, stroke: C.panelBorder, radius: 10,
                    meta: '移除',
                    metaColor: C.warn,
                    onTap: () => this._removeFromBasket(id),
                }));
            }
        }

        // —— 背包分区 ——
        rows.push(this._headerRow('背包物品（点选加入易货篮）'));
        const bagIds = Object.keys(bag)
            .filter(id => (bag[id] || 0) > 0)
            .sort((a, b) => (bag[b] || 0) - (bag[a] || 0));
        if (bagIds.length === 0) {
            rows.push(this._hintRow('背包是空的'));
        } else {
            for (const id of bagIds) {
                const q = bag[id] || 0;
                const inB = this._basket[id] || 0;
                const nm = ITEM_DATA[id]?.name || id;
                const remain = q - inB;
                rows.push(new ModalRow({
                    width: PW - 68,
                    name: `${nm} ×${q}`,
                    align: 'left',
                    bg: C.white, stroke: C.panelBorder, radius: 10,
                    meta: inB > 0 ? `篮+${inB}` : (remain > 0 ? '加入' : '已满'),
                    metaColor: inB > 0 ? C.accent2 : C.sub,
                    disabled: remain <= 0,
                    onTap: () => this._addPrompt(id, remain),
                }));
            }
        }

        const list = this.createScrollList({
            parent: this._content!, x: 0, y: -130,
            width: PW - 48, viewH: 300, gap: 6, padT: 6,
            autoResizePanel: false, repositionScroll: false, align: 'center',
        });
        list.setRows(rows);

        // ════ Footer: 成交 / 清空 ════
        const by = PH / 2 - 48;
        this._btn(by, 280, 72, '成交', C.accent, () => this._deal(), -150);
        this._btn(by, 200, 72, '清空', C.panelBorder, () => this._clearBasket(), 170);
    }

    // ════ 易货篮操作 ════
    private _removeFromBasket(id: string): void {
        delete this._basket[id];
        this.render();
    }

    private _clearBasket(): void {
        this._basket = {};
        this.render();
    }

    /** 点背包物品 → 弹出数量选择（加入易货篮的数量，上限 = 持有 - 已在篮内） */
    private _addPrompt(id: string, remain: number): void {
        if (remain <= 0) return;
        const nm = ITEM_DATA[id]?.name || id;
        const inB = this._basket[id] || 0;
        const opts: QtyOptions = {
            infoLines: [`持有 ${remain + inB} 个（篮内 ${inB}）`],
            confirmLabel: '加入易货篮',
            getPreview: (q) => [
                `加入：${nm} ×${q}`,
                `篮内合计：${inB + q}`,
            ],
        };
        this._getQty().show(`加入：${nm}`, remain, (q) => {
            this._basket[id] = (this._basket[id] || 0) + q;
            this.render();
        }, opts);
    }

    /** 成交：统一易货（扣付出 + 给 give） */
    private _deal(): void {
        const r = ActionTrade.instance.trade(this._tid, this._basket);
        if (this._onTrade) this._onTrade(r.message);
        if (r.success) this._basket = {};   // 成功后清空篮；失败保留篮以便调整
        this.render();
    }

    // ════ 列表内分区标题 / 提示行 ════
    private _headerRow(text: string): UINode {
        const row = new ModalRow({
            width: PW - 68,
            name: text,
            nameSize: 20,
            nameColor: C.title,
            align: 'left',
            bg: C.panelBg, stroke: C.panelBorder, radius: 10,
        });
        return row;
    }
    private _hintRow(text: string): UINode {
        return new ModalRow({
            width: PW - 68,
            name: text,
            nameSize: 19,
            nameColor: C.sub,
            align: 'center',
            bg: C.white, stroke: C.panelBorder, radius: 10,
        });
    }

    // ═════ 薄封装：对接基类公共助手 ═════
    private _tx(y: number, text: string, sz: number, clr: Color, bold = false): void {
        this.mkText(this._content!, 0, -y, PW - 48, Math.ceil(sz * 2.2) + 8, text, sz, clr, { bold, align: 'left' });
    }
    private _btn(y: number, w: number, h: number, text: string, bg: Color, cb: () => void, x = 0): void {
        this.mkButton(this._content!, x, -y, w, h, text, bg, cb);
    }
}
