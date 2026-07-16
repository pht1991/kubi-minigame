/**
 * ActionItem.ts - 物品动作
 * 覆盖：使用（食物回状态）、丢弃、装备（占位）
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { ITEM_DATA } from '../data/data';
import { o } from '../core/utils';

export class ActionItem {
    private static _instance: ActionItem;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;

    static get instance(): ActionItem {
        if (!this._instance) this._instance = new ActionItem();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
    }

    /** 使用物品（食物/料理回状态，或精华类永久提升技能，消耗 1 个） */
    use(itemId: string): ActionResult {
        const item = ITEM_DATA[itemId];
        if (!item) return { success: false, message: '物品不存在' };
        if ((this._gm.boxSaveData['bag'][itemId] || 0) <= 0) {
            return { success: false, message: '没有该物品' };
        }

        // 精华类（isDrink + upgrade）：饮用后永久提升对应技能
        const upgrade = (item as any).upgrade as string | undefined;
        if (upgrade && (item as any).isDrink) {
            const gain = (item as any).value || 1;
            this._gm.skill[upgrade] = (this._gm.getSkillLevel(upgrade)) + gain;
            const r = this._exec.execute({}, o(itemId, 1), 0, { refreshUI: false });
            if (r.success) {
                this._eventBus.emit(GameEvents.SKILL_CHANGE, this._gm.skill);
                this._eventBus.emit(GameEvents.UI_REFRESH);
                return { success: true, message: `永久提升了【${upgrade}】技能 +${gain}` };
            }
            return r;
        }

        // 收集状态类产出（原数据状态字段在 effect 子对象中，见 main.js handleItemClick: ITEM_DATA[item].effect）
        const effect = (item as any).effect as Record<string, number> | undefined;
        const canGet: Record<string, number> = {};
        let hasState = false;
        if (effect) {
            for (const k of ['temp', 'hp', 'full', 'moist', 'ps', 'san'] as const) {
                const v = effect[k];
                if (v !== undefined && v !== null) {
                    canGet[k] = v as number;
                    hasState = true;
                }
            }
        }

        if (!hasState) {
            return { success: false, message: '该物品无法直接食用' };
        }

        // 消耗 1 个
        const require = o(itemId, 1);
        return this._exec.execute(canGet, require, 0);
    }

    /** 丢弃物品 */
    drop(itemId: string, count: number = 1): ActionResult {
        if ((this._gm.boxSaveData['bag'][itemId] || 0) < count) {
            return { success: false, message: '数量不足' };
        }
        this._gm.changeItem(o(itemId, -count), 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `丢弃了 ${count} 个` };
    }

    /**
     * 推导物品应装备到的槽位
     * 优先级：数据 equipType → 武器(type:'weapon') 归 hand → 头/身/足/颈(type 直接对应) → 无法装备
     */
    private getEquipSlot(itemId: string): string | null {
        const item = ITEM_DATA[itemId];
        if (!item) return null;
        if (item.equipType) return item.equipType;
        if (item.type === 'weapon') return 'hand';
        if (['head', 'body', 'foot', 'neck'].includes(item.type)) return item.type;
        return null;
    }

    /** 装备物品（写入对应槽位的 currentEquip，并初始化耐久） */
    equip(itemId: string): ActionResult {
        const item = ITEM_DATA[itemId];
        if (!item) return { success: false, message: '物品不存在' };
        const slot = this.getEquipSlot(itemId);
        if (!slot) return { success: false, message: '该物品无法装备' };

        // 已装备同一物品：不可重复装备
        if (this._gm.currentEquip[slot] === itemId) {
            return { success: false, message: `${item.name} 已装备` };
        }
        // 同类型槽位已被其它装备占用：不可重复装备，需先卸下
        if (this._gm.currentEquip[slot]) {
            const SLOT_LABEL: Record<string, string> = { hand: '手部', head: '头部', body: '身体', foot: '足部', neck: '颈部' };
            const curName = ITEM_DATA[this._gm.currentEquip[slot]]?.name || '其它装备';
            const slotLabel = SLOT_LABEL[slot] || '该部位';
            return { success: false, message: `${slotLabel}已装备【${curName}】，请先卸下` };
        }

        // 装备时初始化/恢复耐久度（未初始化或为 0 视为损坏/未初始化，恢复满耐久）
        if (item.durable !== undefined && (this._gm.durableSaveData[itemId] === undefined || this._gm.durableSaveData[itemId] <= 0)) {
            this._gm.durableSaveData[itemId] = item.durable;
        }
        this._gm.currentEquip[slot] = itemId;
        this._eventBus.emit(GameEvents.EQUIP_CHANGE, this._gm.currentEquip);
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `装备了 ${item.name}` };
    }

    /** 卸下指定槽位装备 */
    unequip(slot: string): ActionResult {
        const itemId = this._gm.currentEquip[slot];
        if (!itemId) return { success: false, message: '该槽位没有装备' };
        const name = ITEM_DATA[itemId]?.name || '';
        delete this._gm.currentEquip[slot];
        this._eventBus.emit(GameEvents.EQUIP_CHANGE, this._gm.currentEquip);
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `卸下了 ${name}` };
    }
}
