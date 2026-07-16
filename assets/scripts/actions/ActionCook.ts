/**
 * ActionCook.ts - 烹饪系统动作
 * 原项目用独立 cooker 箱匹配配方：把食材放入炊具箱，再从箱内凑齐配方烹饪。
 * 范式：检查炊具箱食材（require 数组）→ 耗时 → 产出料理到背包，并从炊具箱扣除食材。
 * 注：料理均为物品产出，直接产出 name 即可。
 */

import { GameManager } from '../core/GameManager';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { EventBus, GameEvents } from '../core/EventBus';
import { COOK_TIME_NEED, COOK_SPEED_MUL, ITEM_DATA } from '../data/data';

/** 一个烹饪配方（来自 COOK_DATA 数组项） */
export interface CookRecipe {
    name: string;
    require: string[];
}

export class ActionCook {
    private static _instance: ActionCook;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;

    static get instance(): ActionCook {
        if (!this._instance) this._instance = new ActionCook();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
    }

    /**
     * 烹饪一份配方（食材取自炊具箱 cooker）
     * @param recipe  配方对象 {name, require:[...]}
     * @param count   份数（默认 1）
     */
    cook(recipe: CookRecipe, count: number = 1): ActionResult {
        if (!recipe || !recipe.require || recipe.require.length === 0) {
            return { success: false, message: '配方无效' };
        }
        // require 数组 → 材料字典（每个 ×1 ×份数），取自炊具箱
        const require: Record<string, number> = {};
        for (const item of recipe.require) {
            require[item] = (require[item] || 0) + count;
        }
        if (!this._gm.checkHaveResource(require, 'cooker')) {
            return { success: false, message: '炊具中食材不足' };
        }

        // 耗时：基础耗时 × 份数 × 烹饪速度系数（升级 cooker 后更快）
        const cookerLevel = this._gm.getBuildingLevel('cookerUpdate');
        const timeNeed = COOK_TIME_NEED * count * Math.pow(COOK_SPEED_MUL, cookerLevel);

        // 产出：料理 name × 份数到背包，并推进时间
        const canGet: Record<string, number> = {};
        canGet[recipe.name] = count;
        const r = this._exec.execute(canGet, {}, timeNeed, { outputBox: 'bag', refreshUI: false });
        if (!r.success) return r;

        // 从炊具箱扣除食材
        const neg: Record<string, number> = {};
        for (const k in require) neg[k] = -require[k];
        this._gm.changeItem(neg, 'cooker');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'cooker');
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `烹饪了 ${ITEM_DATA[recipe.name]?.name || recipe.name} ×${count}` };
    }
}
