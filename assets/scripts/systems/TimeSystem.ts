/**
 * TimeSystem.ts - 时间系统
 * 处理日夜交替、季节循环、状态衰减
 * 从原项目 main.js 的 useTime / 时间推进逻辑迁移
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import {
    FULL_DESC_PER_HOUR,
    MOIST_DESC_PER_HOUR,
    SAN_DESC_PER_HOUR,
    NIGHT_BEGIN,
    NIGHT_END,
    SEASON_CIRCLE,
    MAX_STATE,
    ROBBER_DAY,
    STOLE,
    TRAP_DATA,
    ITEM_DATA,
    DUNGEON_DEC,
} from '../data/data';

/** 冬季每小时体温额外流失（制造"难熬"的低温压力） */
const WINTER_COLD_PER_HOUR = 0.4;
const SEASON_NAMES = ['春', '夏', '秋', '冬'];

export class TimeSystem {
    private static _instance: TimeSystem;
    private _gm: GameManager;
    private _eventBus: EventBus;

    static get instance(): TimeSystem {
        if (!this._instance) this._instance = new TimeSystem();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._eventBus = EventBus.instance;
    }

    /** 获取当前小时 */
    get hour(): number {
        return this._gm.timeData.hour;
    }

    /** 获取当前天数 */
    get day(): number {
        return this._gm.timeData.day;
    }

    /** 获取当前季节 (0~3) */
    get season(): number {
        return this._gm.timeData.season;
    }

    /** 是否夜晚 */
    isNight(): boolean {
        const h = this.hour;
        return h >= NIGHT_BEGIN || h < NIGHT_END;
    }

    /** 是否冬季（season === 3，对应 SEASON_NAMES 的「冬」） */
    isWinter(): boolean {
        return this.season === 3;
    }

    /** 当前季节名 */
    get seasonName(): string {
        return SEASON_NAMES[this.season] || '春';
    }

    /**
     * 消耗时间执行回调
     * @param callback 时间消耗后执行
     * @param hours 消耗的小时数
     */
    useTime(callback: () => void, hours: number): void {
        if (hours <= 0) {
            callback();
            return;
        }
        this.advance(hours);
        callback();
    }

    /**
     * 推进时间
     * 处理小时/天数/季节变化，以及状态衰减
     */
    advance(hours: number): void {
        const td = this._gm.timeData;
        const oldDay = td.day;
        const oldSeason = td.season;

        // 推进小时
        td.hour += hours;
        while (td.hour >= 24) {
            td.hour -= 24;
            td.day += 1;
        }

        // 季节变化（每 SEASON_CIRCLE 天换季）
        td.season = Math.floor((td.day - 1) / SEASON_CIRCLE) % 4;

        // 状态衰减（按小时）
        this.applyDecay(hours);

        // 事件通知
        this._eventBus.emit(GameEvents.TIME_PASS, td);

        if (td.day !== oldDay) {
            this._eventBus.emit(GameEvents.NEW_DAY, td.day);
        }

        // 盗贼突袭：第 ROBBER_DAY 天起自动开启盗贼线（标记 intro 事件已发生，
        // 之后 robberQuest / robberPlace 等盗贼内容即可游玩，原版核心生存压力事件补全）
        if (td.day >= ROBBER_DAY && !this._gm.eventSaveData['robberQuestGet']?.experienced) {
            if (!this._gm.eventSaveData['robberQuestGet']) this._gm.eventSaveData['robberQuestGet'] = {};
            this._gm.eventSaveData['robberQuestGet'].experienced = true;
            this._eventBus.emit(GameEvents.EVENT_TRIGGER, 'robberQuestGet');
        }

        // 盗贼偷家：离开基地期间按周期结算一次洗劫
        this.checkRobberRaid();

        // 地牢探索度随时间衰减（对齐原版每次推进各层 stairData 减 DUNGEON_DEC）
        const ds = this._gm.dungeonSaveData;
        if (ds && ds.stairData) {
            for (const k of Object.keys(ds.stairData)) {
                ds.stairData[k] = Math.max(0, ds.stairData[k] - DUNGEON_DEC);
            }
            this._eventBus.emit('dungeon_change', ds);
        }

        if (td.season !== oldSeason) {
            this._eventBus.emit(GameEvents.SEASON_CHANGE, td.season);
        }
    }

    /**
     * 盗贼偷家：第 ROBBER_DAY 天起，离开基地期间每隔一段天数可能遭盗贼洗劫。
     * - 在基地（isAwayFromBase=false）时只刷新倒计时，不偷窃（对齐原版 currentScene==='home'）；
     * - 已布置防盗陷阱(antiRogue)且未触发过时，陷阱击退盗贼并掉落人肉；
     * - 否则按 STOLE*0.9^securityBox 的速率，对大箱子/炊具箱/沼气池中 food/cooked/met 类物品
     *   按 sqrt(数量)*(0.5~1.5) 抽取被盗数量，累计进 robberSaveData.stoled/stoledAll，并广播 ROBBER_RAID。
     */
    private checkRobberRaid(): void {
        const gm = this._gm;
        const rsd = gm.robberSaveData;
        const day = gm.timeData.day;
        const lockLv = gm.getScienceLevel('lockUpdate');   // 0 或 1
        const secBox = gm.getScienceLevel('securityBox');  // 0 或 1
        const stoledPersont = STOLE * Math.pow(0.9, secBox);
        const deadLine = ROBBER_DAY + lockLv + Math.random() * 3 - Math.random() * 3;

        if (day - (rsd.lastDate ?? 50) > deadLine) {
            rsd.lastDate = day;
            // 仅当玩家离开基地时才真正偷窃
            if (!gm.isAwayFromBase) return;

            // 防盗陷阱拦截
            const trapList: any[] = gm.buildingSaveData['trap']?.list || [];
            for (const trap of trapList) {
                if (trap.trapId === 'antiRogue' && !trap.succeed) {
                    trap.succeed = true;
                    const get = TRAP_DATA.antiRogue.itemGet; // { humanMeat: 2 }
                    gm.changeItem(get, 'bag');
                    if (gm.buildingSaveData['trap']) gm.buildingSaveData['trap'].hint = true;
                    this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
                    this._eventBus.emit(GameEvents.ROBBER_RAID, { defended: true, items: { ...get } });
                    return;
                }
            }

            // 真正偷窃
            const stolen = this.stealFromBase(stoledPersont);
            if (Object.keys(stolen).length > 0) {
                rsd.stoled = rsd.stoled || {};
                rsd.stoledAll = rsd.stoledAll || {};
                for (const k in stolen) {
                    rsd.stoled[k] = (rsd.stoled[k] || 0) + stolen[k];
                    rsd.stoledAll[k] = (rsd.stoledAll[k] || 0) + stolen[k];
                }
                this._eventBus.emit(GameEvents.ROBBER_RAID, { defended: false, items: stolen });
            }
        }
    }

    /** 从基地储物箱中盗取 food/cooked/met 类物品，返回 {物品: 数量} */
    private stealFromBase(rate: number): Record<string, number> {
        const gm = this._gm;
        const total: Record<string, number> = {};
        const boxes = ['bigBox', 'cooker'];
        if (gm.boxSaveData['marshGasTank']) boxes.push('marshGasTank');
        for (const box of boxes) {
            const things = gm.boxSaveData[box];
            if (!things) continue;
            for (const attr of Object.keys(things)) {
                const item = ITEM_DATA[attr];
                if (!item) continue;
                if (item.type !== 'food' && item.type !== 'cooked' && item.type !== 'met') continue;
                const amount = things[attr];
                if (!amount || amount <= 0) continue;
                const stole = Math.round(rate * Math.sqrt(amount) * (0.5 + Math.random()));
                if (stole > 0) {
                    gm.changeItem({ [attr]: -stole }, box);
                    total[attr] = (total[attr] || 0) + stole;
                }
            }
        }
        return total;
    }

    /**
     * 应用状态衰减
     * 满腹 -FULL_DESC_PER_HOUR/h, 水分 -MOIST_DESC_PER_HOUR/h, 精神 -SAN_DESC_PER_HOUR/h
     * 阵营被动：火之阵营代谢稳定（满腹/水分消耗 -15%）；冰之阵营冷静（精神衰减 -50%）
     */
    private applyDecay(hours: number): void {
        let fullMul = 1;
        let moistMul = 1;
        let sanMul = 1;
        const camp = this._gm.camp;
        if (camp === 'fire') {
            fullMul = 0.85;
            moistMul = 0.85;
        } else if (camp === 'ice') {
            sanMul = 0.5;
        }
        const delta = {
            full: -FULL_DESC_PER_HOUR * hours * fullMul,
            moist: -MOIST_DESC_PER_HOUR * hours * moistMul,
            san: -SAN_DESC_PER_HOUR * hours * sanMul,
        };
        this._gm.playerStateChange(delta);

        // 冬季严寒：体温持续流失（制造"难熬"的低温压力，需靠火堆/温酒/保暖维持）
        if (this.season === 3) {
            this._gm.playerStateChange({ temp: -WINTER_COLD_PER_HOUR * hours });
        }
    }

    /** 获取时间描述文字 */
    getTimeDesc(): string {
        const h = this.hour;
        let period = '';
        if (h >= 5 && h < 9) period = '早晨';
        else if (h >= 9 && h < 12) period = '上午';
        else if (h >= 12 && h < 14) period = '中午';
        else if (h >= 14 && h < 18) period = '下午';
        else if (h >= 18 && h < 22) period = '傍晚';
        else period = '夜晚';

        const seasonNames = ['春', '夏', '秋', '冬'];
        return `${seasonNames[this.season]}第${this.day}日 ${period}`;
    }
}
