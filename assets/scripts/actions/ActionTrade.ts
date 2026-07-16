/**
 * ActionTrade.ts - 贸易系统动作
 *
 * 原项目是易货系统：把物品放进 register 箱，商人按价值比例给你 give 物品（上限 max）。
 * 网格 UI 下简化为「花金币购买商人的 give 物品」——单价取自物品价值(value/effect)，缺省 2 金。
 * 单次购买上限 = TRADE_DATA[id].max（部分特殊商人 give==='gold' 视为返金，直接给到上限）。
 *
 * 这是阶段二的功能性简化实现，老板后续想还原完整易货谈判可在此扩展。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { ITEM_DATA, TRADE_DATA } from '../data/data';

export class ActionTrade {
    private static _instance: ActionTrade;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;

    static get instance(): ActionTrade {
        if (!this._instance) this._instance = new ActionTrade();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
    }

    /** 确保商人库存记录存在，并按刷新周期补货（重置 sold） */
    private ensureStock(traderId: string): { sold: number; day: number; hour: number } {
        const detail = TRADE_DATA[traderId];
        const now = this._gm.timeData;
        let rec = this._gm.tradeSaveData[traderId];
        if (!rec) {
            rec = { sold: 0, day: now.day, hour: now.hour };
            this._gm.tradeSaveData[traderId] = rec;
        }
        // 无刷新周期（time 缺失）→ 不补货，库存售完即止
        if (detail.time && detail.time > 0) {
            const elapsed = (now.day - rec.day) * 24 + (now.hour - rec.hour);
            if (elapsed >= detail.time) {
                rec.sold = 0;
                rec.day = now.day;
                rec.hour = now.hour;
            }
        }
        return rec;
    }

    /** 查询商人当前可购买库存（供 UI 展示与购买上限计算） */
    getStock(traderId: string): { available: number; max: number; soldOut: boolean; restockHours: number } {
        const detail = TRADE_DATA[traderId];
        if (!detail) return { available: 0, max: 0, soldOut: true, restockHours: 0 };
        const max = detail.max || 100;
        if (detail.give === 'gold') {
            return { available: max, max, soldOut: false, restockHours: 0 };
        }
        const rec = this.ensureStock(traderId);
        const available = Math.max(0, max - rec.sold);
        const now = this._gm.timeData;
        let restockHours = 0;
        if (detail.time && detail.time > 0 && available <= 0) {
            const elapsed = (now.day - rec.day) * 24 + (now.hour - rec.hour);
            restockHours = Math.max(0, detail.time - elapsed);
        }
        return { available, max, soldOut: available <= 0, restockHours };
    }

    /** 公开查询物品金币单价（供 UI 展示） */
    getPrice(itemId: string): number {
        return this.priceOf(itemId);
    }

    /** 计算物品金币单价（与原 getValue 简化对齐） */
    private priceOf(itemId: string): number {
        const item = ITEM_DATA[itemId];
        if (!item) return 2;
        if (item.value && item.value.gold) return item.value.gold;
        if (item.effect) {
            let v = 0;
            for (const k of ['hp', 'full', 'moist', 'ps', 'san'] as const) {
                const e = item.effect[k];
                if (e && e > 0) v += e;
            }
            if (v > 0) return Math.max(2, Math.ceil(v / 2));
        }
        return 2; // 原材料基线价
    }

    /**
     * 与商人交易（金币购买，受商人库存与刷新周期限制）
     * @param traderId TRADE_DATA 的键
     * @param amount   购买数量（默认买满可用库存）
     */
    trade(traderId: string, amount?: number): ActionResult {
        const detail = TRADE_DATA[traderId];
        if (!detail) return { success: false, message: '商人不存在' };
        const give = detail.give;
        const max = detail.max || 100;

        // give==='gold' 视为返金（售卖收益），无库存限制、不收金币
        if (give === 'gold') {
            const r = this._exec.execute({ [give]: max }, {}, 0, { outputBox: 'bag' });
            if (r.success) this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            return r.success ? { success: true, message: `获得 ${max} 金币` } : r;
        }

        const stock = this.getStock(traderId);
        if (stock.soldOut) {
            return { success: false, message: `${detail.name} 已售罄，${stock.restockHours} 小时后补货` };
        }

        let buy = amount && amount > 0 ? amount : max;
        buy = Math.min(buy, stock.available);

        const price = this.priceOf(give);
        const cost = price * buy;
        const gold = this._gm.boxSaveData['bag']?.['gold'] || 0;
        if (gold < cost) {
            return { success: false, message: `金币不足（需 ${cost}）` };
        }

        const r = this._exec.execute({ [give]: buy }, { gold: cost }, 0, { outputBox: 'bag' });
        if (r.success) {
            this._gm.tradeSaveData[traderId].sold += buy;
            this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            return { success: true, message: `用 ${cost} 金币换得 ${give} ×${buy}` };
        }
        return r;
    }

    /**
     * 易货（以物易物）：用持有的 offerItem 按估值换商人的 give 物品，受商人库存限制。
     * 换得数量 = min(可用库存, floor(offerQty × priceOf(offer) / priceOf(give)))。
     * @param traderId TRADE_DATA 的键
     * @param offerItem 玩家提供的物品 ID
     * @param offerQty 提供数量
     */
    barter(traderId: string, offerItem: string, offerQty: number): ActionResult {
        const detail = TRADE_DATA[traderId];
        if (!detail) return { success: false, message: '商人不存在' };
        const give = detail.give;
        if (give === 'gold') return { success: false, message: '该商人只收金币，不参与易货' };
        if (offerQty <= 0) return { success: false, message: '数量无效' };

        const offerPrice = this.priceOf(offerItem);
        const unitValue = this.priceOf(give);
        if (offerPrice <= 0) return { success: false, message: '该物品没有交易价值' };
        if (unitValue <= 0) return { success: false, message: '商人货物无法估值' };

        const bag = this._gm.boxSaveData['bag'] || {};
        if ((bag[offerItem] || 0) < offerQty) {
            return { success: false, message: `背包中 ${ITEM_DATA[offerItem]?.name || offerItem} 不足 ${offerQty}` };
        }

        const stock = this.getStock(traderId);
        const offeredValue = offerQty * offerPrice;
        const outQty = Math.min(stock.available, Math.floor(offeredValue / unitValue));
        if (outQty < 1) {
            return { success: false, message: stock.soldOut ? `${detail.name} 已售罄，暂无可换货物` : '物品价值不足以交换' };
        }

        this._gm.changeItem({ [offerItem]: -offerQty, [give]: outQty }, 'bag');
        this._gm.tradeSaveData[traderId].sold += outQty;
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        return {
            success: true,
            message: `用 ${ITEM_DATA[offerItem]?.name || offerItem} ×${offerQty} 换得 ${ITEM_DATA[give]?.name || give} ×${outQty}`,
        };
    }
}
