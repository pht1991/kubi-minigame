/**
 * ActionCraft.ts - 制造系统动作
 * 覆盖：普通制造(MAKE)、炼金(ALCHEMY)、魔法(MAGIC)
 * 科技(SCIENCE)属于研究，走 ActionSkill。
 */

import { GameManager } from '../core/GameManager';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { MakeData } from '../data/types';

export class ActionCraft {
    private static _instance: ActionCraft;
    private _gm: GameManager;
    private _exec: ActionExecutor;

    static get instance(): ActionCraft {
        if (!this._instance) this._instance = new ActionCraft();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
    }

    /**
     * 制造一个配方
     * @param recipeId   配方 id
     * @param recipeData 对应配方表（MAKE_DATA / ALCHEMY_DATA / MAGIC_DATA）
     * @param count      制造数量（默认 1）
     */
    make(recipeId: string, recipeData: Record<string, MakeData>, count: number = 1): ActionResult {
        const recipe = recipeData[recipeId];
        if (!recipe) return { success: false, message: '配方不存在' };

        // 前置建筑
        if (recipe.building && !this._gm.buildingSaveData[recipe.building]) {
            return { success: false, message: '需要先建造对应建筑' };
        }
        // 前置科技（科技技能统一存于 skill map，由 ActionSkill.learn 写入）
        if (recipe.science && !this._gm.skill[recipe.science]) {
            return { success: false, message: '需要先研究对应科技' };
        }

        // 批量材料
        const scaledRequire: Record<string, number> = {};
        if (recipe.require) {
            for (const k in recipe.require) {
                scaledRequire[k] = recipe.require[k] * count;
            }
        }
        if (!this._gm.checkHaveResource(scaledRequire)) {
            return { success: false, message: '材料不足' };
        }

        // 执行：产出 get × amount × count
        const canGet: Record<string, number> = {};
        canGet[recipe.get] = (recipe.amount || 1) * count;
        return this._exec.execute(canGet, scaledRequire, recipe.timeNeed * count);
    }
}
