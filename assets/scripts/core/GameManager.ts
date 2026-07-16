/**
 * GameManager.ts - 全局游戏状态管理
 * 替代原项目 React Context，集中管理所有运行时状态
 */

import { EventBus, GameEvents } from './EventBus';
import {
    PlayerState,
    SaveData,
} from '../data/types';
import {
    MAX_STATE,
    BOX_INIT,
    PLAYER_STATE_INIT,
    BUILDING_INIT,
    DURABLE_INIT,
    EVENT_INIT,
    PLACE_INIT,
    COOL_DOWN_INIT,
    ROBBER_INIT,
    DEBUG_SKILL,
    ITEM_DATA,
} from '../data/data';
// PLACE_INIT 已在 data.ts 末尾初始化（visited/amount/resource/things/mst），与 PLACE_DATA 配套

export class GameManager {
    private static _instance: GameManager;
    private _eventBus: EventBus;

    // ===== 运行时状态 =====
    /** 玩家状态 */
    playerState: PlayerState;
    /** 当前装备 */
    currentEquip: Record<string, string>;
    /** 技能等级 */
    skill: Record<string, number>;
    /** 所有箱子数据 */
    boxSaveData: Record<string, Record<string, number>>;
    /** 建筑数据 */
    buildingSaveData: Record<string, any>;
    /** 物品耐久度 */
    durableSaveData: Record<string, number>;
    /** 事件进度 */
    eventSaveData: Record<string, any>;
    /** 地点探索进度（资源剩余量、已访问等） */
    placeSaveData: Record<string, any>;
    /** 地牢数据 */
    dungeonSaveData: Record<string, any>;
    /** 阵营 */
    campSaveData: string;
    /** 酿酒（时间型，类比农田） */
    alcoSaveData: any[];
    /** 盗贼事件 */
    robberSaveData: Record<string, any>;
    /** 冷却数据 */
    coolDownSaveData: Record<string, number>;
    /** 时间数据 */
    timeData: { day: number; hour: number; season: number };
    /** 魔王轮回等级 */
    maouLevel: number;
    /** 游戏设置 */
    settings: { autoSave: boolean; volume: number };

    // ===== 场景/UI 状态 =====
    /** 当前场景 */
    currentScene: string;
    /** 是否在战斗中 */
    isDueling: boolean;
    /** 当前怪物状态 */
    mstState: any;

    static get instance(): GameManager {
        if (!this._instance) {
            this._instance = new GameManager();
        }
        return this._instance;
    }

    private constructor() {
        this._eventBus = EventBus.instance;
        this.resetToInit();
    }

    /** 重置为初始状态 */
    resetToInit(): void {
        // PLAYER_STATE_INIT 是嵌套结构 {hp:{amount:100}}，需要展平为 {hp:100}
        this.playerState = {
            temp: PLAYER_STATE_INIT.temp.amount,
            hp: PLAYER_STATE_INIT.hp.amount,
            full: PLAYER_STATE_INIT.full.amount,
            moist: PLAYER_STATE_INIT.moist.amount,
            ps: PLAYER_STATE_INIT.ps.amount,
            san: PLAYER_STATE_INIT.san.amount,
        };
        this.currentEquip = {};
        this.skill = DEBUG_SKILL ? { ...DEBUG_SKILL } : {};
        // BOX_INIT.bag.things 是物品数据，需要深拷贝
        this.boxSaveData = { bag: JSON.parse(JSON.stringify(BOX_INIT.bag.things)) };
        this.boxSaveData.cooker = {}; // 炊具箱：烹饪专用容器
        this.buildingSaveData = JSON.parse(JSON.stringify(BUILDING_INIT));
        this.durableSaveData = JSON.parse(JSON.stringify(DURABLE_INIT));
        this.eventSaveData = JSON.parse(JSON.stringify(EVENT_INIT));
        this.placeSaveData = JSON.parse(JSON.stringify(PLACE_INIT));
        this.dungeonSaveData = {};
        this.campSaveData = '';
        this.alcoSaveData = [];
        this.robberSaveData = JSON.parse(JSON.stringify(ROBBER_INIT));
        this.coolDownSaveData = JSON.parse(JSON.stringify(COOL_DOWN_INIT));
        this.timeData = { day: 1, hour: 6, season: 0 };
        this.maouLevel = 0;
        this.settings = { autoSave: true, volume: 1 };
        this.currentScene = 'home';
        this.isDueling = false;
        this.mstState = null;
    }

    // ===== 玩家状态 =====

    /** 修改玩家状态（带上下限检查） */
    playerStateChange(delta: Partial<PlayerState>): void {
        for (const key in delta) {
            const k = key as keyof PlayerState;
            this.playerState[k] += delta[k]!;
            // temp 可以为负（寒冷），其余限制在 0~MAX_STATE
            if (k !== 'temp') {
                this.playerState[k] = Math.max(0, Math.min(MAX_STATE, this.playerState[k]));
            } else if (this.campSaveData === 'fire') {
                // 火之阵营：体温下限保护，不易冻毙
                this.playerState[k] = Math.max(-5, this.playerState[k]);
            }
        }
        this._eventBus.emit(GameEvents.STATE_CHANGE, this.playerState);
        this.checkDeath();
    }

    /** 设置玩家状态（绝对值） */
    setPlayerState(state: Partial<PlayerState>): void {
        for (const key in state) {
            const k = key as keyof PlayerState;
            this.playerState[k] = state[k]!;
            if (k !== 'temp') {
                this.playerState[k] = Math.max(0, Math.min(MAX_STATE, this.playerState[k]));
            }
        }
        this._eventBus.emit(GameEvents.STATE_CHANGE, this.playerState);
        this.checkDeath();
    }

    /** 检查死亡 */
    checkDeath(): void {
        if (this.playerState.hp <= 0) {
            this._eventBus.emit(GameEvents.PLAYER_DEATH);
        }
    }

    /** 当前阵营（'' 表示未选择） */
    get camp(): string {
        return this.campSaveData;
    }

    /**
     * 选择阵营（冰/火二选一，仅可一次）
     * 火之阵营：体温更暖（下限保护 -5），代谢稳定使满腹/水分消耗略减；
     * 冰之阵营：精神衰减减半（冷静），低温环境更稳。
     */
    chooseCamp(camp: 'ice' | 'fire'): { success: boolean; message: string } {
        if (this.campSaveData) {
            return { success: false, message: '阵营已选择，无法更改' };
        }
        if (camp !== 'ice' && camp !== 'fire') {
            return { success: false, message: '无效阵营' };
        }
        this.campSaveData = camp;
        this._eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: camp === 'fire' ? '你选择了【火之阵营】' : '你选择了【冰之阵营】' };
    }

    /** 玩家死亡后重生：恢复满状态继续游戏（不重置进度/技能） */
    respawn(): void {
        this.playerState = {
            temp: PLAYER_STATE_INIT.temp.amount,
            hp: PLAYER_STATE_INIT.hp.amount,
            full: PLAYER_STATE_INIT.full.amount,
            moist: PLAYER_STATE_INIT.moist.amount,
            ps: PLAYER_STATE_INIT.ps.amount,
            san: PLAYER_STATE_INIT.san.amount,
        };
        this._eventBus.emit(GameEvents.STATE_CHANGE, this.playerState);
    }

    // ===== 物品系统 =====

    /** 修改物品数量 */
    changeItem(items: Record<string, number>, boxType: string = 'bag'): void {
        if (!this.boxSaveData[boxType]) {
            this.boxSaveData[boxType] = {};
        }
        const box = this.boxSaveData[boxType];
        for (const item in items) {
            box[item] = (box[item] || 0) + items[item];
            if (box[item] <= 0) delete box[item];
        }
        this._eventBus.emit(GameEvents.ITEM_CHANGE, boxType);
    }

    /** 检查是否拥有足够资源 */
    checkHaveResource(require: Record<string, number>, boxType: string = 'bag'): boolean {
        const box = this.boxSaveData[boxType] || {};
        for (const item in require) {
            if ((box[item] || 0) < require[item]) return false;
        }
        return true;
    }

    /** 消耗资源（背包物品类） */
    useItemThatPlayerHave(require: Record<string, number>, boxType: string = 'bag'): void {
        const neg: Record<string, number> = {};
        for (const item in require) {
            neg[item] = -require[item];
        }
        this.changeItem(neg, boxType);
    }

    // ===== 工具耐久系统 =====
    // 工具（斧头/镐子/锤子等）不按数量消耗，而是装备后扣耐久、可多次使用，耐久归零才损坏

    /** 推导物品应装备到的槽位（与 ActionItem.getEquipSlot 一致） */
    private _getEquipSlot(itemId: string): string | null {
        const item = ITEM_DATA[itemId];
        if (!item) return null;
        if ((item as any).equipType) return (item as any).equipType;
        if (item.type === 'weapon') return 'hand';
        if (['head', 'body', 'foot', 'neck'].includes(item.type as string)) return item.type as string;
        return null;
    }

    /** 判断物品是否为可装备工具（有耐久且能装备槽位） */
    isToolItem(itemId: string): boolean {
        const item = ITEM_DATA[itemId];
        if (!item || item.durable === undefined) return false;
        return this._getEquipSlot(itemId) !== null;
    }

    /**
     * 检查 require 中的「工具类」是否都已装备且有足够耐久
     * 返回 { ok, msg }：ok=false 时 msg 说明缺什么
     */
    canUseTools(require: Record<string, number>): { ok: boolean; msg: string } {
        for (const item in require) {
            if (!this.isToolItem(item)) continue; // 非工具走背包逻辑
            const slot = this._getEquipSlot(item);
            const equippedId = this.currentEquip[slot || ''];
            const name = ITEM_DATA[item]?.name || item;
            if (equippedId !== item) {
                return { ok: false, msg: `需要先装备【${name}】` };
            }
            // 耐久兜底：已装备但 durableSaveData 缺失或为 0（旧存档 / 非 equip 路径 / DURABLE_INIT 旧版预置 0）
            // 一律视为「未初始化」并恢复满耐久。注：useTools 在耐久归零时走 delete（而非置 0），故 0 不可能是真实损坏态。
            if (this.durableSaveData[item] === undefined || this.durableSaveData[item] <= 0) {
                this.durableSaveData[item] = (ITEM_DATA[item] as any)?.durable ?? 0;
            }
            const cur = this.durableSaveData[item];
            if (cur < require[item]) {
                return { ok: false, msg: `【${name}】耐久不足` };
            }
        }
        return { ok: true, msg: '' };
    }

    /**
     * 消耗 require 中工具的耐久（调用前需先 canUseTools 校验）
     * 耐久归零则删除并自动卸下对应槽位
     */
    useTools(require: Record<string, number>): void {
        for (const item in require) {
            if (!this.isToolItem(item)) continue;
            // 耐久兜底初始化（与 canUseTools 一致：undefined 或 ≤0 均视为未初始化，恢复满耐久后再扣减）
            if (this.durableSaveData[item] === undefined || this.durableSaveData[item] <= 0) {
                this.durableSaveData[item] = (ITEM_DATA[item] as any)?.durable ?? 0;
            }
            const cur = this.durableSaveData[item];
            const next = cur - require[item];
            if (next <= 0) {
                delete this.durableSaveData[item];
                const slot = this._getEquipSlot(item);
                if (slot && this.currentEquip[slot] === item) {
                    delete this.currentEquip[slot];
                }
            } else {
                this.durableSaveData[item] = next;
            }
        }
        this._eventBus.emit(GameEvents.EQUIP_CHANGE, this.currentEquip);
    }

    // ===== 技能 =====

    /** 获取技能等级 */
    getSkillLevel(skillName: string): number {
        return this.skill[skillName] || 0;
    }

    /** 获取科技等级 */
    getScienceLevel(scienceName: string): number {
        return this.buildingSaveData[scienceName] ? 1 : 0;
    }

    /** 获取建筑等级 */
    getBuildingLevel(buildingName: string): number {
        return this.buildingSaveData[buildingName + '_level'] || 0;
    }

    // ===== 存档 =====

    /** 序列化为存档数据 */
    toSaveData(): SaveData {
        return {
            version: '1.0.0',
            playerState: { ...this.playerState },
            currentEquip: { ...this.currentEquip },
            skill: { ...this.skill },
            boxSaveData: JSON.parse(JSON.stringify(this.boxSaveData)),
            buildingSaveData: JSON.parse(JSON.stringify(this.buildingSaveData)),
            durableSaveData: { ...this.durableSaveData },
            eventSaveData: JSON.parse(JSON.stringify(this.eventSaveData)),
            dungeonSaveData: JSON.parse(JSON.stringify(this.dungeonSaveData)),
            campSaveData: this.campSaveData,
            alcoSaveData: JSON.parse(JSON.stringify(this.alcoSaveData)),
            coolDownSaveData: { ...this.coolDownSaveData },
            timeData: { ...this.timeData },
            maouLevel: this.maouLevel,
            settings: { ...this.settings },
        };
    }

    /** 从存档数据恢复 */
    fromSaveData(data: SaveData): void {
        this.playerState = data.playerState;
        this.currentEquip = data.currentEquip;
        this.skill = data.skill;
        this.boxSaveData = data.boxSaveData;
        this.buildingSaveData = data.buildingSaveData;
        this.durableSaveData = data.durableSaveData;
        this.eventSaveData = data.eventSaveData;
        this.dungeonSaveData = data.dungeonSaveData;
        this.campSaveData = data.campSaveData;
        this.alcoSaveData = data.alcoSaveData || [];
        this.coolDownSaveData = data.coolDownSaveData;
        this.timeData = data.timeData;
        this.maouLevel = data.maouLevel;
        this.settings = data.settings;
        this._eventBus.emit(GameEvents.LOAD_COMPLETE);
        this._eventBus.emit(GameEvents.UI_REFRESH);
    }
}
