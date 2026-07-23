/**
 * ActionScience.ts - 科研台研究动作
 *
 * 科研台（scienceTable）对应的配方表是 SCIENCE_DATA。与制造（MAKE/ALCHEMY/MAGIC，产出物品）
 * 不同，科研台研究的是「科技」：研究完成后在 gm.skill[recipeId] 写入等级，供其他配方/建筑
 * 的 science / building 前置条件（getScienceLevel）校验。
 *
 * 注意：ActionCraft.make 仅处理「产出物品」的配方，不可用于科研；科研必须走本类的 research。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { ITEM_DATA, BUILDING_DATA } from '../data/data';

export class ActionScience {
    private static _instance: ActionScience;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;

    static get instance(): ActionScience {
        if (!this._instance) this._instance = new ActionScience();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
    }

    /**
     * 在科研台研究一项科技
     * @param recipeId   科技 id（即 SCIENCE_DATA 的键，也是 gm.skill 的键）
     * @param recipeData SCIENCE_DATA
     * @param count      研究次数（默认 1；科技为一次性解锁，重复研究无收益，外部应限制为 1）
     */
    research(recipeId: string, recipeData: Record<string, any>, count: number = 1): ActionResult {
        const recipe = recipeData[recipeId];
        if (!recipe) return { success: false, message: '配方不存在' };

        // 已研究过（科技为一次性解锁）
        if (this._gm.skill[recipeId]) {
            return { success: false, message: '已经研究过了' };
        }
        // 前置建筑
        if (recipe.building && !this._gm.buildingSaveData[recipe.building]) {
            return { success: false, message: `需要先建造${BUILDING_DATA[recipe.building]?.name || recipe.building}` };
        }
        // 前置科技
        if (recipe.science && this._gm.getScienceLevel(recipe.science) <= 0) {
            return { success: false, message: '需要先研究前置科技' };
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

        const name = ITEM_DATA[recipeId]?.name || recipe.name || recipeId;
        return this._exec.execute({}, scaledRequire, recipe.timeNeed * count, {
            title: `研究 ${name}`,
            successMessage: `研究完成：${name}`,
            onDone: () => {
                this._gm.skill[recipeId] = (this._gm.skill[recipeId] || 0) + 1;
                this._eventBus.emit(GameEvents.SKILL_CHANGE, this._gm.skill);
            },
        });
    }
}
