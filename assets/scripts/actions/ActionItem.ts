import { t } from './../../../../../../../../D:/Projects/demos/front_end/kubi-minigame/assets/scripts/actions/i18n';
/**
 * ActionItem.ts - 物品动作
 * 覆盖：使用（食物/状态道具/容量道具/技能书等）、丢弃、装备/卸下
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { ITEM_DATA, BIG_BOX_BASE_SIZE, BAG_BASE_SIZE } from '../data/data';
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
        if (!item) return { success: false, message: t('物品不存在') };
        // 大箱扩容道具：消耗 1 个，永久提升大箱子容量
        if ((item as any).type === 'bigBoxSizeBonus') {
            const gain = (item as any).value || 4;
            this._gm.boxSize['bigBox'] = (this._gm.boxSize['bigBox'] || BIG_BOX_BASE_SIZE) + gain;
            this._gm.changeItem(o(itemId, -1), 'bag');
            this._eventBus.emit(GameEvents.UI_REFRESH);
            return { success: true, message: `${t('大箱子容量增加了 ')}${gain}` };
        }
        // 背包扩容道具：消耗 1 个，永久提升背包种类上限
        if ((item as any).type === 'bagSizeBonus') {
            const gain = (item as any).value || 1;
            this._gm.boxSize['bag'] = (this._gm.boxSize['bag'] || BAG_BASE_SIZE) + gain;
            this._gm.changeItem(o(itemId, -1), 'bag');
            this._eventBus.emit(GameEvents.UI_REFRESH);
            return { success: true, message: `${t('背包容量增加了 ')}${gain}${t('（上限 ')}${this._gm.boxSize['bag']}${t(' 种）')}` };
        }
        if ((this._gm.boxSaveData['bag'][itemId] || 0) <= 0) {
            return { success: false, message: t('没有该物品') };
        }

        // 技能升级类（upgrade：指南/黑魔法书/精华均可，无论是否饮品）：永久提升对应技能
        const upgrade = (item as any).upgrade as string | undefined;
        if (upgrade) {
            const gain = (item as any).value || 1;
            this._gm.skill[upgrade] = (this._gm.getSkillLevel(upgrade)) + gain;
            const r = this._exec.execute({}, o(itemId, 1), 0, { refreshUI: false });
            if (r.success) {
                this._eventBus.emit(GameEvents.SKILL_CHANGE, this._gm.skill);
                this._eventBus.emit(GameEvents.UI_REFRESH);
                return { success: true, message: `${t('永久提升了【')}${upgrade}${t('】技能 +')}${gain}` };
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
            return { success: false, message: t('该物品无法直接食用') };
        }

        // 消耗 1 个
        const require = o(itemId, 1);
        return this._exec.execute(canGet, require, 0);
    }

    /** 丢弃物品 */
    drop(itemId: string, count: number = 1): ActionResult {
        if ((this._gm.boxSaveData['bag'][itemId] || 0) < count) {
            return { success: false, message: t('数量不足') };
        }
        this._gm.changeItem(o(itemId, -count), 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `${t('丢弃了 ')}${count}${t(' 个')}` };
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
        if (!item) return { success: false, message: t('物品不存在') };
        const slot = this.getEquipSlot(itemId);
        if (!slot) return { success: false, message: t('该物品无法装备') };

        // 已装备同一物品：不可重复装备
        if (this._gm.currentEquip[slot] === itemId) {
            return { success: false, message: `${item.name}${t(' 已装备')}` };
        }
        // 同类型槽位已被其它装备占用：不可重复装备，需先卸下
        if (this._gm.currentEquip[slot]) {
            const SLOT_LABEL: Record<string, string> = { hand: t('手部'), head: t('头部'), body: t('身体'), foot: t('足部'), neck: t('颈部') };
            const curName = ITEM_DATA[this._gm.currentEquip[slot]]?.name || t('其它装备');
            const slotLabel = SLOT_LABEL[slot] || t('该部位');
            return { success: false, message: `${slotLabel}${t('已装备【')}${curName}${t('】，请先卸下')}` };
        }

        // 装备时初始化/恢复耐久度（未初始化或为 0 视为损坏/未初始化，恢复满耐久）
        if (item.durable !== undefined && (this._gm.durableSaveData[itemId] === undefined || this._gm.durableSaveData[itemId] <= 0)) {
            this._gm.durableSaveData[itemId] = item.durable;
        }
        this._gm.currentEquip[slot] = itemId;
        this._eventBus.emit(GameEvents.EQUIP_CHANGE, this._gm.currentEquip);
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `${t('装备了 ')}${item.name}` };
    }

    /** 卸下指定槽位装备 */
    unequip(slot: string): ActionResult {
        const itemId = this._gm.currentEquip[slot];
        if (!itemId) return { success: false, message: t('该槽位没有装备') };
        const name = ITEM_DATA[itemId]?.name || '';
        delete this._gm.currentEquip[slot];
        this._eventBus.emit(GameEvents.EQUIP_CHANGE, this._gm.currentEquip);
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `${t('卸下了 ')}${name}` };
    }
}
