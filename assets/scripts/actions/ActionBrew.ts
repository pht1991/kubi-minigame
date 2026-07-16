/**
 * ActionBrew.ts - 酿酒系统动作
 * 时间型生产：放入材料 → 等待 timeMax 小时 → 收获酒类
 * 范式类比农田（plantDay/plantHour/timeMax），产出受「酿酒技巧」加成。
 */

import { GameManager } from '../core/GameManager';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { TimeSystem } from '../systems/TimeSystem';
import { EventBus, GameEvents } from '../core/EventBus';
import { ALCO_DATA, ITEM_DATA } from '../data/data';

/** 一个酿造槽位 */
export interface BrewSlot {
    recipeId: string;
    plantDay: number;
    plantHour: number;
    timeMax: number;
}

export class ActionBrew {
    private static _instance: ActionBrew;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _ts: TimeSystem;
    private _eventBus: EventBus;

    /** 同时进行的酿造上限 */
    static readonly MAX_SLOTS = 3;

    static get instance(): ActionBrew {
        if (!this._instance) this._instance = new ActionBrew();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._ts = TimeSystem.instance;
        this._eventBus = EventBus.instance;
    }

    /** 酿酒桶是否已建造 */
    isBuilt(): boolean {
        return !!this._gm.buildingSaveData['alco']?.own;
    }

    /** 开始酿造一份配方 */
    brew(recipeId: string): ActionResult {
        if (!this.isBuilt()) return { success: false, message: '需要先建造酿酒桶' };
        const recipe = ALCO_DATA[recipeId];
        if (!recipe) return { success: false, message: '配方不存在' };

        const slots = this._gm.alcoSaveData as BrewSlot[];
        if (slots.length >= ActionBrew.MAX_SLOTS) {
            return { success: false, message: `酿造槽已满（最多 ${ActionBrew.MAX_SLOTS} 份）` };
        }
        if (!this._gm.checkHaveResource(recipe.require || {})) {
            return { success: false, message: '材料不足' };
        }

        const ts = this._ts;
        const slot: BrewSlot = {
            recipeId,
            plantDay: ts.day,
            plantHour: ts.hour,
            timeMax: recipe.timeMax,
        };
        // 消耗材料（即时）
        const r = this._exec.execute({}, recipe.require, 0, { refreshUI: false });
        if (!r.success) return r;

        slots.push(slot);
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `开始酿造 ${ITEM_DATA[recipe.itemGet]?.name || recipe.itemGet}` };
    }

    /** 收获已完成的酿造 */
    harvestBrew(slotIndex: number): ActionResult {
        const slots = this._gm.alcoSaveData as BrewSlot[];
        const slot = slots[slotIndex];
        if (!slot) return { success: false, message: '槽位不存在' };

        const recipe = ALCO_DATA[slot.recipeId];
        if (!recipe) return { success: false, message: '配方数据异常' };

        const elapsed = (this._ts.day - slot.plantDay) * 24 + (this._ts.hour - slot.plantHour);
        if (elapsed < slot.timeMax) {
            return { success: false, message: '尚未酿成' };
        }

        // 产出：itemAmount × (1 + 酿酒技巧等级 × 15%)
        const alcoLevel = this._gm.getSkillLevel('alco');
        const amount = Math.floor(recipe.itemAmount * (1 + alcoLevel * 0.15));
        this._gm.changeItem({ [recipe.itemGet]: amount }, 'bag');

        slots.splice(slotIndex, 1);
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this._eventBus.emit(GameEvents.UI_REFRESH);
        const name = ITEM_DATA[recipe.itemGet]?.name || recipe.itemGet;
        return { success: true, message: `收获了 ${name} ×${amount}` };
    }

    /** 当前所有酿造槽信息（供 UI 展示） */
    getBrewSlots(): { recipeId: string; recipeDesc: string; progress: number; ready: boolean; remaining: number }[] {
        const slots = this._gm.alcoSaveData as BrewSlot[];
        return slots.map(slot => {
            const recipe = ALCO_DATA[slot.recipeId];
            const elapsed = (this._ts.day - slot.plantDay) * 24 + (this._ts.hour - slot.plantHour);
            const pct = Math.min(100, Math.floor((elapsed / slot.timeMax) * 100));
            return {
                recipeId: slot.recipeId,
                recipeDesc: recipe ? `${recipe.desc} ${ITEM_DATA[recipe.itemGet]?.name || recipe.itemGet}` : slot.recipeId,
                progress: pct,
                ready: elapsed >= slot.timeMax,
                remaining: Math.max(0, Math.ceil(slot.timeMax - elapsed)),
            };
        });
    }
}
