/**
 * ActionExecutor.ts - 通用动作执行器
 * 从原 main.js ActionComponent.act 提取的通用范式：
 *   消耗时间 → 在回调中产出（状态类/物品类）→ 消耗材料 → 设置冷却
 * 所有"消耗时间换取产出"的动作（制造/烹饪/采集/贸易/技能/建造/种植/陷阱…）都走这里。
 *
 * 【本次改造：公共进度条】
 *   - 校验（材料/工具/状态）同步返回失败；
 *   - timeNeed > 0 时，弹 ProgressOverlay 播放真实时长动画，动画结束才推进游戏时间 + 应用产出；
 *   - 完成后统一 emit GameEvents.OPERATION_DONE({ title, message, modal })，由 MainScene 决定
 *     Toast(SHRINK) 还是 ResultModal（长/需确认）。解决原「点击即完成、无体验感」问题。
 *   - timeNeed <= 0 时同步执行（即时动作），同样 emit OPERATION_DONE。
 */

import { GameManager } from '../core/GameManager';
import { TimeSystem } from '../systems/TimeSystem';
import { EventBus, GameEvents } from '../core/EventBus';
import { PlayerState } from '../data/types';
import { ProgressOverlay } from '../ui/ProgressOverlay';

/** 玩家状态键（用于区分"状态类产出"与"物品类产出"） */
const STATE_KEYS = new Set(['temp', 'hp', 'full', 'moist', 'ps', 'san']);

/** 真实时长映射（游戏小时 → 真实毫秒） */
const REAL_MS_PER_GAME_HOUR = 600;   // 1 游戏小时 ≈ 0.6 秒
const MIN_DUR = 350;                  // 最短动画时长(ms)，保证可见
const MAX_DUR = 3500;                 // 最长动画时长(ms)，避免拖沓
const LOW_STA = 20;                   // 体力低于此值视为「体力不足」，延长耗时
const STA_PENALTY = 1.4;              // 体力不足耗时倍率

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
    /** 进度条标题（如「烹饪」「采集中」）；缺省用「操作中」 */
    title?: string;
    /** 完成后反馈文案（经 OPERATION_DONE 弹 Toast / ResultModal）；缺省「完成」 */
    successMessage?: string;
    /** 是否以「确认弹窗(ResultModal)」形式反馈（长文案/需确认时 true） */
    resultModal?: boolean;
    /** 跳过自动产出：不把 canGet 放入背包（如采集/拾荒改由 HarvestModal 让玩家自行取舍） */
    skipOutput?: boolean;
    /** 静默：完成后不 emit OPERATION_DONE（由调用方自行处理 UI，如收获弹窗） */
    silent?: boolean;
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
     * 计算进度条真实时长
     * - 基础 = 游戏小时数 × 每小真实毫秒（厨房等级等已在 timeNeed 中折算，此处不再处理）
     * - 体力不足(当前 ps < LOW_STA) → × STA_PENALTY
     * - 封顶 [MIN_DUR, MAX_DUR]
     */
    private computeDuration(timeNeed: number): number {
        let dur = timeNeed * REAL_MS_PER_GAME_HOUR;
        if (this._gm.playerState.ps < LOW_STA) dur *= STA_PENALTY;
        return Math.max(MIN_DUR, Math.min(MAX_DUR, dur));
    }

    /** 触发完成反馈（统一出口） */
    private emitDone(message: string, modal: boolean, title: string): void {
        this._eventBus.emit(GameEvents.OPERATION_DONE, { title, message, modal });
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
        const title = options.title || '操作中';
        const successMessage = options.successMessage || '完成';
        const modal = !!options.resultModal;

        // 真正应用产出/消耗的逻辑（同步执行，供两种路径复用）
        const apply = () => {
            if (Object.keys(stateCanGet).length > 0) {
                this._gm.playerStateChange(stateCanGet as Partial<PlayerState>);
            }
            if (!options.skipOutput && Object.keys(itemCanGet).length > 0) {
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
        };

        // 即时动作（timeNeed<=0）：直接应用并反馈
        if (timeNeed <= 0) {
            apply();
            if (!options.silent) this.emitDone(successMessage, modal, title);
            return { success: true, message: successMessage };
        }

        // 耗时动作：先播放进度条，动画结束再推进时间 + 应用 + 反馈
        const ov = ProgressOverlay.instance;
        if (!ov) {
            // 极端兜底：进度条组件未就绪，直接同步执行
            this._ts.useTime(() => apply(), timeNeed);
            if (!options.silent) this.emitDone(successMessage, modal, title);
            return { success: true, message: successMessage };
        }

        const dur = this.computeDuration(timeNeed);
        ov.play(title, dur, () => {
            this._ts.advance(timeNeed);   // 进度结束才推进游戏时间（含衰减/换日）
            apply();
            if (!options.silent) this.emitDone(successMessage, modal, title);
        });

        // 立即返回成功（真正结果在进度结束后经 OPERATION_DONE 反馈）
        return { success: true, message: '' };
    }
}
