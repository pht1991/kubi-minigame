/**
 * ActionExecutor.ts - 通用动作执行器
 * 从原 main.js ActionComponent.act 提取的通用范式：
 *   消耗时间 → 在回调中产出（状态类/物品类）→ 消耗材料 → 设置冷却
 * 所有"消耗时间换取产出"的动作（制造/烹饪/采集/贸易/技能）都走这里。
 */

import { GameManager } from '../core/GameManager';
import { TimeSystem } from '../systems/TimeSystem';
import { EventBus, GameEvents } from '../core/EventBus';
import { PlayerState } from '../data/types';

/** 玩家状态键（用于区分"状态类产出"与"物品类产出"） */
const STATE_KEYS = new Set(['temp', 'hp', 'full', 'moist', 'ps', 'san']);

export interface ActionOptions {
    /** 冷却 actionId（对应 coolDownSaveData 的键） */
    coolDownId?: string;
    /** 冷却时长（小时） */
    coolDownHours?: number;
    /** 产出放入哪个箱子，默认 bag */
    outputBox?: string;
    /** 是否在执行后触发 UI 刷新（默认 true） */
    refreshUI?: boolean;
    /** 完成回调 */
    onDone?: () => void;
}

export interface ActionResult {
    success: boolean;
    message: string;
}

export class ActionExecutor {
    private static _instance: ActionExecutor;
    private _gm: GameManager;
    private _ts: TimeSystem;
    private _eventBus: EventBus;

    static get instance(): ActionExecutor {
        if (!this._instance) this._instance = new ActionExecutor();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._ts = TimeSystem.instance;
        this._eventBus = EventBus.instance;
    }

    /**
     * 执行一个动作
     * @param canGet  产出（可能含状态类 hp/full/moist/ps/san 与物品类）
     * @param require 消耗材料（物品类，来自 bag）
     * @param timeNeed 耗时（小时），0 表示即时
     * @param options 额外配置
     */
    execute(
        canGet: Record<string, number>,
        require: Record<string, number>,
        timeNeed: number,
        options: ActionOptions = {}
    ): ActionResult {
        // 拆分 require：状态类(ps/temp/hp 等) vs 物品类
        const stateRequire: Record<string, number> = {};
        const itemRequire: Record<string, number> = {};
        for (const k in require) {
            if (STATE_KEYS.has(k)) stateRequire[k] = require[k];
            else itemRequire[k] = require[k];
        }

        // 物品类再拆：工具类（靠耐久，装备后多次使用）vs 普通材料（从背包扣）
        const toolRequire: Record<string, number> = {};
        const matRequire: Record<string, number> = {};
        for (const k in itemRequire) {
            if (this._gm.isToolItem(k)) toolRequire[k] = itemRequire[k];
            else matRequire[k] = itemRequire[k];
        }

        // 普通材料检查（背包）
        if (Object.keys(matRequire).length > 0 && !this._gm.checkHaveResource(matRequire)) {
            return { success: false, message: '材料不足' };
        }
        // 工具检查（需已装备且有足够耐久）
        const toolCheck = this._gm.canUseTools(toolRequire);
        if (!toolCheck.ok) {
            return { success: false, message: toolCheck.msg };
        }
        // 状态消耗检查（如采集要扣体力 ps）
        for (const k in stateRequire) {
            if ((this._gm.playerState as any)[k] < stateRequire[k]) {
                return { success: false, message: '状态不足' };
            }
        }

        // 拆分：状态类产出 vs 物品类产出
        const stateCanGet: Record<string, number> = {};
        const itemCanGet: Record<string, number> = {};
        for (const attr in canGet) {
            if (STATE_KEYS.has(attr)) {
                stateCanGet[attr] = canGet[attr];
            } else {
                itemCanGet[attr] = Math.floor(canGet[attr]);
            }
        }

        const outputBox = options.outputBox || 'bag';

        this._ts.useTime(() => {
            if (Object.keys(stateCanGet).length > 0) {
                this._gm.playerStateChange(stateCanGet as Partial<PlayerState>);
            }
            if (Object.keys(itemCanGet).length > 0) {
                this._gm.changeItem(itemCanGet, outputBox);
            }
            if (Object.keys(matRequire).length > 0) {
                this._gm.useItemThatPlayerHave(matRequire, 'bag');
            }
            if (Object.keys(toolRequire).length > 0) {
                this._gm.useTools(toolRequire);
            }
            if (Object.keys(stateRequire).length > 0) {
                // 状态类消耗：取负值
                const neg: Record<string, number> = {};
                for (const k in stateRequire) neg[k] = -stateRequire[k];
                this._gm.playerStateChange(neg as Partial<PlayerState>);
            }
            if (options.coolDownId && options.coolDownHours) {
                this._gm.coolDownSaveData[options.coolDownId] = options.coolDownHours;
                this._eventBus.emit(GameEvents.TIME_PASS, this._gm.timeData);
            }
            options.onDone?.();
            if (options.refreshUI !== false) {
                this._eventBus.emit(GameEvents.UI_REFRESH);
            }
        }, timeNeed);

        return { success: true, message: '完成' };
    }
}
