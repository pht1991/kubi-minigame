/**
 * ActionBuilding.ts - 建筑系统动作
 * 覆盖：建造（消耗材料 → own=true）、建筑升级（消耗材料 → 等级+1）
 * 范式：前置建筑 / 材料 → 时间推进 → 状态写入 buildingSaveData
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { BUILDING_DATA, BUILDING_UPDATE_DATA, CROP_DATA, TRAP_DATA, ITEM_DATA, BIG_BOX_BASE_SIZE } from '../data/data';
import { TimeSystem } from '../systems/TimeSystem';

export class ActionBuilding {
    private static _instance: ActionBuilding;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;

    static get instance(): ActionBuilding {
        if (!this._instance) this._instance = new ActionBuilding();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
    }

    /** 建造一个建筑 */
    build(buildingId: string): ActionResult {
        const data = BUILDING_DATA[buildingId];
        if (!data) return { success: false, message: '建筑不存在' };
        if (this._gm.buildingSaveData[buildingId]?.own) {
            return { success: false, message: '已经建造过了' };
        }
        // 前置建筑
        if (data.building && !this._gm.buildingSaveData[data.building]?.own) {
            return { success: false, message: `需要先建造 ${BUILDING_DATA[data.building]?.name || data.building}` };
        }
        // 科技前置（科技技能统一存于 skill map，由 ActionSkill.learn 写入）
        if (data.science && !this._gm.skill[data.science]) {
            return { success: false, message: `需要先研究对应科技` };
        }
        // 材料
        if (data.require && !this._gm.checkHaveResource(data.require)) {
            return { success: false, message: '材料不足' };
        }

        const timeNeed = data.timeNeed || 4;
        const r = this._exec.execute({}, data.require || {}, timeNeed, {
            onDone: () => {
                if (!this._gm.buildingSaveData[buildingId]) this._gm.buildingSaveData[buildingId] = {};
                this._gm.buildingSaveData[buildingId].own = true;
                this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
            },
        });
        return r.success ? { success: true, message: `建造了 ${data.name}` } : r;
    }

    /** 升级建筑（BUILDING_UPDATE_DATA[type][id]） */
    upgrade(type: string, id: string): ActionResult {
        const group = BUILDING_UPDATE_DATA[type];
        const data = group?.[id];
        if (!data) return { success: false, message: '升级项不存在' };
        const keys = Object.keys(group);
        const level = this._gm.buildingSaveData[`${type}_level`] || 0;
        // 顺序校验：升级链必须逐级进行（前置升级已完成即等价于当前等级匹配）
        if (keys[level] !== id) {
            return { success: false, message: '请先完成前置升级' };
        }
        if (!this._gm.checkHaveResource(data.require)) {
            return { success: false, message: '材料不足' };
        }

        const timeNeed = data.timeNeed || 4;
        const r = this._exec.execute({}, data.require, timeNeed, {
            onDone: () => {
                const key = `${type}_level`;
                this._gm.buildingSaveData[key] = (this._gm.buildingSaveData[key] || 0) + 1;
                // 大箱子升级：同步扩容（每级 +4，与 bigBoxSizeBonus 道具一致）
                if (type === 'bigBoxUpdate') {
                    this._gm.boxSize['bigBox'] = (this._gm.boxSize['bigBox'] || BIG_BOX_BASE_SIZE) + 4;
                }
                this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
            },
        });
        return r.success ? { success: true, message: `升级了 ${id}` } : r;
    }

    // ===== 农田系统 =====

    /** 种植作物 */
    plantCrop(cropId: string): ActionResult {
        const farmData = this._gm.buildingSaveData['farm'];
        if (!farmData?.own) return { success: false, message: '需要先建造农田' };
        if (TimeSystem.instance.isWinter()) return { success: false, message: '冬季土地封冻，无法种植' };
        const crop = CROP_DATA[cropId];
        if (!crop) return { success: false, message: '作物不存在' };
        if (farmData.list.length >= farmData.size) return { success: false, message: '农田已满' };
        if (!this._gm.checkHaveResource(crop.require)) return { success: false, message: '材料不足' };

        const r = this._exec.execute({}, crop.require, crop.timeNeed, {
            onDone: () => {
                const ts = TimeSystem.instance;
                farmData.list.push({
                    cropId,
                    plantDay: ts.day,
                    plantHour: ts.hour,
                    timeMax: crop.timeMax,
                });
                this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
            },
        });
        return r.success ? { success: true, message: `种植了 ${crop.desc}` } : r;
    }

    /** 收获作物 */
    harvestCrop(slotIndex: number): ActionResult {
        const farmData = this._gm.buildingSaveData['farm'];
        if (!farmData?.own) return { success: false, message: '需要先建造农田' };
        if (TimeSystem.instance.isWinter()) return { success: false, message: '冬季土地封冻，无法收获' };
        const slot = farmData.list[slotIndex];
        if (!slot) return { success: false, message: '该位置没有作物' };
        const crop = CROP_DATA[slot.cropId];
        if (!crop) return { success: false, message: '作物数据异常' };

        const ts = TimeSystem.instance;
        const elapsed = (ts.day - slot.plantDay) * 24 + (ts.hour - slot.plantHour);
        if (elapsed < slot.timeMax) {
            const remaining = slot.timeMax - elapsed;
            return { success: false, message: `作物尚未成熟（还需 ${Math.ceil(remaining)} 小时）` };
        }

        // 计算产量（含耕种技能加成）
        const farmLevel = this._gm.skill['farm'] || 0;
        const yieldAmount = Math.floor(crop.itemAmount * (1 + farmLevel * 0.1));
        this._gm.changeItem({ [crop.itemGet]: yieldAmount }, 'bag');
        farmData.list.splice(slotIndex, 1);
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
        const itemName = ITEM_DATA[crop.itemGet]?.name || crop.itemGet;
        return { success: true, message: `收获了 ${itemName} ×${yieldAmount}` };
    }

    /** 获取农田槽位状态（含生长进度） */
    getFarmSlots(): { cropId: string; cropDesc: string; progress: number; ready: boolean; remaining: number }[] {
        const farmData = this._gm.buildingSaveData['farm'];
        if (!farmData?.own) return [];
        const ts = TimeSystem.instance;
        return farmData.list.map((slot: any) => {
            const crop = CROP_DATA[slot.cropId];
            const elapsed = (ts.day - slot.plantDay) * 24 + (ts.hour - slot.plantHour);
            const progress = Math.min(1, elapsed / slot.timeMax);
            const ready = elapsed >= slot.timeMax;
            const remaining = Math.max(0, slot.timeMax - elapsed);
            return {
                cropId: slot.cropId,
                cropDesc: crop?.desc || slot.cropId,
                progress,
                ready,
                remaining,
            };
        });
    }

    // ===== 水井系统 =====

    /** 从水井取水（每日一次；冬季结冰停产） */
    collectWell(): ActionResult {
        const wellData = this._gm.buildingSaveData['well'];
        if (!wellData?.own) return { success: false, message: '需要先建造水井' };
        if (TimeSystem.instance.isWinter()) return { success: false, message: '井水结冰，冬季无法取水' };

        const ts = TimeSystem.instance;
        const lastDay = this._gm.coolDownSaveData['well'] || 0;
        if (ts.day <= lastDay) return { success: false, message: '今天已经取过水了' };

        const level = this._gm.getBuildingLevel('wellUpdate');
        const amount = 8 + level * 2;
        this._gm.coolDownSaveData['well'] = ts.day;
        this._gm.changeItem({ water: amount }, 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
        return { success: true, message: `取到了清水 ×${amount}` };
    }

    // ===== 陷阱系统 =====

    /** 放置陷阱 */
    placeTrap(trapId: string): ActionResult {
        const trapData = this._gm.buildingSaveData['trap'];
        if (!trapData?.own) return { success: false, message: '需要先建造陷阱' };
        const trap = TRAP_DATA[trapId];
        if (!trap) return { success: false, message: '陷阱不存在' };
        if (trapData.list.length >= trapData.size) return { success: false, message: '陷阱已满' };
        if (!this._gm.checkHaveResource(trap.require)) return { success: false, message: '诱饵不足' };

        const r = this._exec.execute({}, trap.require, 1, {
            onDone: () => {
                const ts = TimeSystem.instance;
                trapData.list.push({
                    trapId,
                    placeDay: ts.day,
                    placeHour: ts.hour,
                    checked: false,
                });
                this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
            },
        });
        return r.success ? { success: true, message: `放置了 ${trap.desc} 陷阱` } : r;
    }

    /** 检查陷阱 */
    checkTrap(slotIndex: number): ActionResult {
        const trapData = this._gm.buildingSaveData['trap'];
        if (!trapData?.own) return { success: false, message: '需要先建造陷阱' };
        const slot = trapData.list[slotIndex];
        if (!slot) return { success: false, message: '该位置没有陷阱' };
        if (slot.checked) return { success: false, message: '陷阱已检查过，请重置' };
        const trap = TRAP_DATA[slot.trapId];
        if (!trap) return { success: false, message: '陷阱数据异常' };

        const ts = TimeSystem.instance;
        const elapsed = (ts.day - slot.placeDay) * 24 + (ts.hour - slot.placeHour);
        // 至少经过 6 小时才能检查
        if (elapsed < 6) {
            return { success: false, message: `陷阱放置不久，再等 ${Math.ceil(6 - elapsed)} 小时` };
        }

        slot.checked = true;
        // 时间越长，捕获概率越高
        const timeBonus = Math.min(0.3, elapsed / 100);
        const catchChance = trap.chance + timeBonus;
        if (Math.random() < catchChance) {
            const itemGet = trap.itemGet || {};
            this._gm.changeItem(itemGet, 'bag');
            this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
            const names = Object.keys(itemGet).map(k => `${ITEM_DATA[k]?.name || k}×${itemGet[k]}`).join(' ');
            return { success: true, message: `陷阱捕获了：${names}` };
        }
        this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
        return { success: true, message: '陷阱空空如也，什么也没抓到' };
    }

    /** 重置陷阱（移除已检查的陷阱，释放槽位） */
    removeTrap(slotIndex: number): ActionResult {
        const trapData = this._gm.buildingSaveData['trap'];
        if (!trapData?.own) return { success: false, message: '需要先建造陷阱' };
        const slot = trapData.list[slotIndex];
        if (!slot) return { success: false, message: '该位置没有陷阱' };
        trapData.list.splice(slotIndex, 1);
        this._eventBus.emit(GameEvents.BUILDING_CHANGE, this._gm.buildingSaveData);
        return { success: true, message: '已移除陷阱' };
    }

    /** 获取陷阱槽位状态 */
    getTrapSlots(): { trapId: string; trapDesc: string; elapsed: number; checked: boolean; canCheck: boolean }[] {
        const trapData = this._gm.buildingSaveData['trap'];
        if (!trapData?.own) return [];
        const ts = TimeSystem.instance;
        return trapData.list.map((slot: any) => {
            const trap = TRAP_DATA[slot.trapId];
            const elapsed = (ts.day - slot.placeDay) * 24 + (ts.hour - slot.placeHour);
            return {
                trapId: slot.trapId,
                trapDesc: trap?.desc || slot.trapId,
                elapsed,
                checked: !!slot.checked,
                canCheck: elapsed >= 6 && !slot.checked,
            };
        });
    }
}
