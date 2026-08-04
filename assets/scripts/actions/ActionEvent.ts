/**
 * ActionEvent.ts - 事件系统动作
 * 对齐原 EventComponent / GiveComponent：
 *   - want：需先交付的物资
 *   - get + chanceGet：交付后获得的奖励
 *   - skill：习得对应技能（+1 级）
 *   - learn：学会某配方（网格 UI 下配方默认全部可用，仅记录提示）
 *   - place：在地图标出地点（网格 UI 下地点默认可见，仅记录提示）
 *   - mst：交付后触发战斗
 *   - event：连锁下一事件（标记当前 experienced 后即解锁）
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { EVENT_DATA, ITEM_DATA } from '../data/data';
import { ActionDungeon } from './ActionDungeon';

export interface EventDialogInfo {
    name: string;
    desc: string;
    dialogBefore: string[];  // d_1 对话文本
    dialogAfter: string[];   // d_2 对话文本
    wantStr: string;
    getStr: string;
    canTrigger: boolean;
    experienced: boolean;
}

export class ActionEvent {
    private static _instance: ActionEvent;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;
    private _dungeon: ActionDungeon;

    static get instance(): ActionEvent {
        if (!this._instance) this._instance = new ActionEvent();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
        this._dungeon = ActionDungeon.instance;
    }

    /** 触发一个事件 */
    trigger(eventId: string): ActionResult {
        const data = EVENT_DATA[eventId];
        if (!data) return { success: false, message: '事件不存在' };
        if (this._gm.eventSaveData[eventId]?.experienced) {
            return { success: false, message: '已经经历过了' };
        }
        // 需求物资
        if (data.want && !this._gm.checkHaveResource(data.want)) {
            return { success: false, message: '不满足需求' };
        }

        const r = this._exec.execute({}, data.want || {}, 0.1, {
            onDone: () => {
                // 奖励
                if (data.get) this._gm.changeItem(data.get, 'bag');
                if (data.chanceGet) {
                    for (const k in data.chanceGet) {
                        if (Math.random() < (data.chanceGet as any)[k]) {
                            this._gm.changeItem({ [k]: 1 }, 'bag');
                        }
                    }
                }
                // 习得技能
                if (data.skill) {
                    this._gm.skill[data.skill] = (this._gm.skill[data.skill] || 0) + 1;
                    this._eventBus.emit(GameEvents.SKILL_CHANGE, this._gm.skill);
                }
                // 学会配方 / 标出地点（网格 UI 下仅记录提示）
                // 标记已经历
                if (!this._gm.eventSaveData[eventId]) this._gm.eventSaveData[eventId] = {};
                this._gm.eventSaveData[eventId].experienced = true;
                this._eventBus.emit(GameEvents.EVENT_TRIGGER, eventId);
                this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
                // 触发战斗（公式与面板战一致：前缀/减伤/耐久已接入）
                if (data.mst) {
                    this._dungeon.battle(data.mst);
                }
            },
        });
        return r.success ? { success: true, message: `${data.name}` } : r;
    }

    /** 获取事件对话信息（供 UI 展示） */
    getDialogInfo(eventId: string): EventDialogInfo | null {
        const data = EVENT_DATA[eventId];
        if (!data) return null;
        const experienced = !!this._gm.eventSaveData[eventId]?.experienced;
        const want = data.want || {};
        const canTrigger = !experienced && this._gm.checkHaveResource(want);
        const wantStr = Object.keys(want).length > 0
            ? Object.entries(want).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const getStr = data.get
            ? Object.entries(data.get).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        // d_1 / d_2 可能是字符串或数组
        const d1 = data.d_1 ? (Array.isArray(data.d_1) ? data.d_1 : [data.d_1]) : [];
        const d2 = data.d_2 ? (Array.isArray(data.d_2) ? data.d_2 : [data.d_2]) : [];
        return {
            name: data.name,
            desc: data.desc || '',
            dialogBefore: d1,
            dialogAfter: d2,
            wantStr,
            getStr,
            canTrigger,
            experienced,
        };
    }

    /** 检查是否可以转生 */
    canReincarnate(): boolean {
        // 需要击败过魔王 (maouLevel > 0) 或到达地牢最深层
        const ds = this._gm.dungeonSaveData;
        const reachedDeep = ds?.deepest >= 10;
        return this._gm.maouLevel > 0 || reachedDeep;
    }

    /** 执行转生 */
    doReincarnation(): ActionResult {
        if (!this.canReincarnate()) {
            return { success: false, message: '条件不足，无法转生' };
        }
        const oldMaouLevel = this._gm.maouLevel;
        // 转生：魔王等级+1，重置部分进度但保留技能
        this._gm.maouLevel = oldMaouLevel + 1;
        // 重置地牢进度
        this._gm.dungeonSaveData = {};
        // 恢复满状态
        this._gm.setPlayerState({ hp: 100, full: 100, moist: 100, ps: 100, san: 100 });
        this._eventBus.emit(GameEvents.STATE_CHANGE, this._gm.playerState);
        this._eventBus.emit('dungeon_change', this._gm.dungeonSaveData);
        return { success: true, message: `转生成功！当前轮回：第 ${this._gm.maouLevel} 世` };
    }
}
