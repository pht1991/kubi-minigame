/**
 * ActionTrade.ts - 贸易系统动作（还原原版纯以物易物）
 *
 * 原版机制（kubi-original-src/src/main.js · TradeComponent）：
 *   每个商人只有一种可给物品 give（黄金/宝石/木材/升级书…），玩家把背包里的物品
 *   放进“寄存栏”(register) 作为付出，商人按 TRADE_MUL=0.75 的兑换率，把付出总价值
 *   折算成 give 物品数量给你；上限 max 受信标(beaconMax)与商业大亨(seller)科技影响。
 *   原版没有“金币”这种独立货币——黄金只是 give 之一，所谓“购买”本质也是以物易物。
 *
 * 本实现还原该模式：移除“金币购买 / 以物易物”两种模式，统一为单一易货。
 * 交互上用“易货篮”承载多种付出物品（对应原版 register），成交时才真正消耗并给 give。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionResult } from './ActionExecutor';
import { ITEM_DATA, TRADE_DATA, SKILL_DATA } from '../data/data';

export class ActionTrade {
    private static _instance: ActionTrade;

    /** 原版兑换率：玩家付出价值只值 0.75 倍（谈判劣势，商人吃差价） */
    private static readonly TRADE_MUL = 0.75;

    static get instance(): ActionTrade {
        if (!this._instance) this._instance = new ActionTrade();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._eventBus = EventBus.instance;
    }

    private _gm: GameManager;
    private _eventBus: EventBus;

    /**
     * 物品交易价值（对齐原版 getValue）：
     *   优先数字 value（ITEM_DATA[id].value） → 否则 effect 正项求和(hp/full/moist/ps/san)
     *   → 否则基线 2（无显式价值的原材料/食物仍可按地板价参与易货，保证“一篮子东西都能换”）。
     */
    valueOf(itemId: string): number {
        const item = (ITEM_DATA as any)[itemId];
        if (!item) return 0;
        if (item.value && item.value > 0) return item.value;
        if (item.effect) {
            let v = 0;
            for (const k of ['hp', 'full', 'moist', 'ps', 'san'] as const) {
                const e = (item.effect as any)[k];
                if (e && e > 0) v += e;
            }
            if (v > 0) return v;
        }
        return 2;
    }

    /** 确保商人库存记录存在，并按刷新周期(time)补货（重置 sold） */
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

    /**
     * 商人当前可交易库存。
     * 动态上限（还原原版意图）：基础 max × (1 + 0.5×信标等级) × (1 + 商业大亨加成)。
     * 黄金等特殊商人不再“免费每日领”，而是与其它商人一样按易货给 give、受 sold 上限约束。
     */
    getStock(traderId: string): { available: number; max: number; soldOut: boolean; restockHours: number } {
        const detail = TRADE_DATA[traderId];
        if (!detail) return { available: 0, max: 0, soldOut: true, restockHours: 0 };
        const baseMax = detail.max || 100;
        const beacon = this._gm.getScienceLevel('beaconMax');           // 0 / 1
        const seller = (this._gm.skill['seller'] || 0) * (SKILL_DATA.seller?.buff || 1);
        const max = Math.round(baseMax * (0.5 * beacon + 1) * (1 + seller));
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

    /**
     * 预览易货篮结果（不扣物品）：给定付出篮，计算可换得 give 数量。
     * giveQty = floor( Σ valueOf(offer)×qty × TRADE_MUL / valueOf(give) )，并受库存 available 上限。
     */
    previewBasket(traderId: string, basket: Record<string, number>): { giveQty: number; offeredValue: number; capped: boolean } {
        const detail = TRADE_DATA[traderId];
        if (!detail) return { giveQty: 0, offeredValue: 0, capped: false };
        const give = detail.give;
        const giveVal = this.valueOf(give);
        if (giveVal <= 0) return { giveQty: 0, offeredValue: 0, capped: false };
        let offered = 0;
        for (const id in basket) offered += this.valueOf(id) * basket[id];
        const stock = this.getStock(traderId);
        const raw = Math.floor((offered * ActionTrade.TRADE_MUL) / giveVal);
        const giveQty = Math.max(0, Math.min(stock.available, raw));
        return { giveQty, offeredValue: offered, capped: raw > stock.available };
    }

    /**
     * 执行易货（统一接口，替代原金币购买/以物易物两模式）：
     * 校验背包拥有足够付出 → 预览换算 → 一次性结算（扣付出 + 给 give×giveQty）→ 累加 sold。
     * @param traderId TRADE_DATA 的键
     * @param basket   付出篮：物品ID → 数量（成交前不消耗，仅预览）
     */
    trade(traderId: string, basket: Record<string, number>): ActionResult {
        const detail = TRADE_DATA[traderId];
        if (!detail) return { success: false, message: '商人不存在' };
        const give = detail.give;
        const bag = this._gm.boxSaveData['bag'] || {};

        // 校验背包是否拥有足够付出，并归集有效付出
        const offers: Record<string, number> = {};
        for (const id in basket) {
            const q = basket[id];
            if (q <= 0) continue;
            if ((bag[id] || 0) < q) {
                return { success: false, message: `背包中 ${ITEM_DATA[id]?.name || id} 不足 ${q}` };
            }
            offers[id] = q;
        }
        if (Object.keys(offers).length === 0) return { success: false, message: '易货篮是空的' };

        const { giveQty, capped } = this.previewBasket(traderId, offers);
        if (giveQty < 1) {
            return { success: false, message: capped ? `${detail.name} 库存不足` : '付出的价值不足以交换（兑换率 75%）' };
        }

        // 一次性结算：扣付出 + 给 give（changeItem 支持单调用混合正负增减）
        const delta: Record<string, number> = {};
        for (const id in offers) delta[id] = -offers[id];
        delta[give] = giveQty;
        this._gm.changeItem(delta, 'bag');
        this._gm.tradeSaveData[traderId].sold += giveQty;
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');

        const offerStr = Object.keys(offers).map(id => `${ITEM_DATA[id]?.name || id}×${offers[id]}`).join('、');
        return { success: true, message: `用 ${offerStr} 换得 ${ITEM_DATA[give]?.name || give} ×${giveQty}` };
    }
}
