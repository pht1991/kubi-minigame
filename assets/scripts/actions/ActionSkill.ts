/**
 * ActionSkill.ts - 技能系统动作
 * 两类学习路径，与原项目一致：
 *   1) 教师事件类（melee/shoot/def/agile/magic/farm/alco）：支付递增的 want 物资 → 等级+1
 *   2) 纯天赋类（greedy/lucky/durable/.../fighter/blood/absorb）：支付金子（cost+costInc×等级，cost 单位 gold 物品）→ 等级+1
 * one:true 的技能（blood/absorb）仅可学一次。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { SKILL_DATA, EVENT_DATA } from '../data/data';

export class ActionSkill {
    private static _instance: ActionSkill;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;
    /** skillId → 教师事件的 want（用于递增成本） */
    private _teacherWant: Record<string, Record<string, number>> = {};

    static get instance(): ActionSkill {
        if (!this._instance) this._instance = new ActionSkill();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
        // 扫描 EVENT_DATA，建立「技能 → 教师事件 want」映射
        for (const evId in EVENT_DATA) {
            const ev = EVENT_DATA[evId];
            if (ev.skill && ev.want) {
                this._teacherWant[ev.skill] = ev.want;
            }
        }
    }

    /** 学习/升级一个技能 */
    learn(skillId: string): ActionResult {
        const data = SKILL_DATA[skillId];
        if (!data) return { success: false, message: '技能不存在' };
        const level = this._gm.skill[skillId] || 0;

        // one:true 只能学一次
        if ((data as any).only && level > 0) {
            return { success: false, message: '已经学会了' };
        }

        // 计算成本
        let cost: Record<string, number>;
        if (this._teacherWant[skillId]) {
            // 递增：want × (1+lv)*(1+0.001*lv)
            const base = this._teacherWant[skillId];
            const mul = (1 + level) * (1 + 0.001 * level);
            cost = {};
            for (const k in base) cost[k] = Math.max(1, Math.round(base[k] * mul));
        } else {
            // 金子成本（gold 物品）
            const c = (data.cost || 1) + (data.costInc || 0) * level;
            cost = { gold: c };
        }

        if (!this._gm.checkHaveResource(cost)) {
            return { success: false, message: '资源不足' };
        }

        const r = this._exec.execute({}, cost, 0.1, {
            onDone: () => {
                this._gm.skill[skillId] = level + 1;
                this._eventBus.emit(GameEvents.SKILL_CHANGE, this._gm.skill);
            },
        });
        return r.success ? { success: true, message: `习得 ${data.name} Lv.${level + 1}` } : r;
    }

    /** 公开预览学习成本（已掌握/不可学返回 null），供 UI 展示 */
    previewCost(skillId: string): Record<string, number> | null {
        const data = SKILL_DATA[skillId];
        if (!data) return null;
        const level = this._gm.skill[skillId] || 0;
        if ((data as any).only && level > 0) return null;
        if (this._teacherWant[skillId]) {
            const base = this._teacherWant[skillId];
            const mul = (1 + level) * (1 + 0.001 * level);
            const cost: Record<string, number> = {};
            for (const k in base) cost[k] = Math.max(1, Math.round(base[k] * mul));
            return cost;
        }
        return { gold: (data.cost || 1) + (data.costInc || 0) * level };
    }
}
