/**
 * EventBus.ts - 全局事件系统
 * 替代原项目 React Context 的状态更新触发重渲染机制
 * 任意系统可通过 EventBus 发布/订阅事件，实现解耦
 */

type EventHandler = (...args: any[]) => void;

export class EventBus {
    private static _instance: EventBus;
    private handlers: Map<string, Set<EventHandler>> = new Map();

    static get instance(): EventBus {
        if (!this._instance) this._instance = new EventBus();
        return this._instance;
    }

    /** 订阅事件 */
    on(event: string, handler: EventHandler): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);
    }

    /** 订阅事件（仅触发一次） */
    once(event: string, handler: EventHandler): void {
        const wrapper: EventHandler = (...args: any[]) => {
            this.off(event, wrapper);
            handler(...args);
        };
        this.on(event, wrapper);
    }

    /** 取消订阅 */
    off(event: string, handler: EventHandler): void {
        this.handlers.get(event)?.delete(handler);
    }

    /** 发布事件 */
    emit(event: string, ...args: any[]): void {
        this.handlers.get(event)?.forEach(h => {
            try {
                h(...args);
            } catch (e) {
                console.error(`[EventBus] event "${event}" handler error:`, e);
            }
        });
    }

    /** 清除某事件的所有订阅 */
    clear(event?: string): void {
        if (event) {
            this.handlers.delete(event);
        } else {
            this.handlers.clear();
        }
    }
}

/** 全局事件名定义 */
export const GameEvents = {
    // 玩家状态变化
    STATE_CHANGE: 'state_change',
    PLAYER_DEATH: 'player_death',
    // 物品变化
    ITEM_CHANGE: 'item_change',
    EQUIP_CHANGE: 'equip_change',
    // 时间推进
    TIME_PASS: 'time_pass',
    NEW_DAY: 'new_day',
    SEASON_CHANGE: 'season_change',
    // 建筑/科技
    BUILDING_CHANGE: 'building_change',
    SCIENCE_UNLOCK: 'science_unlock',
    // 技能
    SKILL_CHANGE: 'skill_change',
    // 场景/网格
    SCENE_CHANGE: 'scene_change',
    GRID_PUSH: 'grid_push',
    GRID_POP: 'grid_pop',
    // 战斗
    BATTLE_START: 'battle_start',
    BATTLE_END: 'battle_end',
    // 事件系统
    EVENT_TRIGGER: 'event_trigger',
    // 存档
    SAVE_START: 'save_start',
    SAVE_COMPLETE: 'save_complete',
    LOAD_COMPLETE: 'load_complete',
    // UI 刷新
    UI_REFRESH: 'ui_refresh',
} as const;
