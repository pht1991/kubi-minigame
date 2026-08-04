/**
 * ActionDungeon.ts - 地牢与战斗系统动作
 * 简化但真实可玩的战斗：武器攻击×技能加成 vs 怪物伤害×防御减免，命中率受射程影响。
 * 覆盖：进入地牢(enter)、下层(descend)、探索房间(explore→战斗/宝箱)、战斗(battle)。
 *
 * 原项目的房间/楼梯/前缀/陷阱是复杂状态机，这里收敛为：
 *   enter → 每层 explore 有概率遭遇战斗或发现宝箱 → descend 进入更深一层。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { ActionCombat } from './ActionCombat';
import { MST_DATA, DUNGEON_DATA, ITEM_DATA, UPPER_CHANCE, TRADE_DATA, PREFIX_DATA } from '../data/data';

export class ActionDungeon {
    private static _instance: ActionDungeon;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;

    static get instance(): ActionDungeon {
        if (!this._instance) this._instance = new ActionDungeon();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
    }

    /** 进入地牢：初始化进度 */
    enter(): ActionResult {
        this._gm.dungeonSaveData = {
            stairCount: 1,
            roomCount: 1,
            deepest: 1,
            stairData: {},
        };
        this._eventBus.emit('dungeon_change', this._gm.dungeonSaveData);
        return { success: true, message: '进入了地牢第 1 层' };
    }

    /** 下层 */
    descend(): ActionResult {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { success: false, message: '尚未进入地牢' };
        ds.stairCount += 1;
        ds.roomCount = 0;
        ds.deepest = Math.max(ds.deepest, ds.stairCount);
        this._eventBus.emit('dungeon_change', ds);
        return { success: true, message: `下到了第 ${ds.stairCount} 层` };
    }

    /** 探索当前层房间：60% 遭遇战斗，40% 发现宝箱 */
    explore(): ActionResult {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { success: false, message: '尚未进入地牢' };
        ds.roomCount += 1;

        if (Math.random() < 0.6) {
            // 遭遇战斗：按层数抽怪
            const mstId = this.pickDungeonMst(ds.stairCount);
            if (mstId) {
                const prefix = this.rollPrefix();
                this._eventBus.emit('dungeon_change', ds);
                return this.battle(mstId, prefix || undefined);
            }
        }
        // 发现宝箱
        const reward = this.rollReward(ds.stairCount);
        if (Object.keys(reward).length > 0) {
            this._gm.changeItem(reward, 'bag');
            this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            this._eventBus.emit('dungeon_change', ds);
            const names = Object.keys(reward).map(k => `${ITEM_DATA[k]?.name || k}×${reward[k]}`).join(' ');
            return { success: true, message: `发现宝箱：${names}` };
        }
        this._eventBus.emit('dungeon_change', ds);
        return { success: true, message: '这个房间空空如也' };
    }

    /**
     * 探测探索（不自动战斗）：60% 概率遭遇战斗
     * 返回 beastMstId 给 BattlePanel 使用，而不是直接自动解算。
     * @returns 遭遇的怪物 ID，null = 没有遭遇战斗
     */
    probeExplore(): { mstId: string | null; mstName: string; reward?: string } {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { mstId: null, mstName: '' };
        ds.roomCount += 1;

        if (Math.random() < 0.6) {
            const mstId = this.pickDungeonMst(ds.stairCount);
            if (mstId) {
                const mst = MST_DATA[mstId];
                this._eventBus.emit('dungeon_change', ds);
                return { mstId, mstName: mst?.name || mstId };
            }
        }
        // 宝箱
        const reward = this.rollReward(ds.stairCount);
        if (Object.keys(reward).length > 0) {
            this._gm.changeItem(reward, 'bag');
            this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            this._eventBus.emit('dungeon_change', ds);
            const names = Object.keys(reward).map(k => `${ITEM_DATA[k]?.name || k}×${reward[k]}`).join(' ');
            return { mstId: null, mstName: '', reward: names };
        }
        this._eventBus.emit('dungeon_change', ds);
        return { mstId: null, mstName: '' };
    }

    /**
     * 增强版探测探索：战斗(含前缀怪物)/陷阱/宝箱/地牢商人/空房间
     * 每 5 个房间或 12% 概率遇到地牢商人；约 48% 战斗；14% 陷阱；宝箱/空房其余。
     */
    probeExploreEnhanced(): { type: 'battle' | 'treasure' | 'merchant' | 'empty' | 'trap'; mstId?: string; mstName?: string; reward?: string; prefix?: string } {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { type: 'empty' };
        ds.roomCount += 1;

        const roll = Math.random();
        // 每 5 个房间或 12% 概率遇到商人
        if (ds.roomCount % 5 === 0 || roll < 0.12) {
            this._eventBus.emit('dungeon_change', ds);
            return { type: 'merchant' };
        }
        if (roll < 0.60) {
            // 战斗（按层数抽怪，可能带前缀）
            const mstId = this.pickDungeonMst(ds.stairCount);
            if (mstId) {
                const mst = MST_DATA[mstId];
                const prefix = this.rollPrefix();
                const pname = prefix ? (PREFIX_DATA as any)[prefix]?.name || '' : '';
                this._eventBus.emit('dungeon_change', ds);
                return { type: 'battle', mstId, mstName: `${pname}${mst?.name || mstId}`, prefix: prefix || undefined };
            }
        }
        if (roll < 0.74) {
            // 陷阱：按层数缩放伤害
            const trapDmg = Math.round((8 + ds.stairCount * 4) * (0.8 + Math.random() * 0.4));
            this._gm.playerStateChange({ hp: -trapDmg });
            this._eventBus.emit(GameEvents.UI_REFRESH);
            this._eventBus.emit('dungeon_change', ds);
            return { type: 'trap', reward: `踩中陷阱，受到 ${trapDmg} 点伤害！` };
        }
        // 宝箱
        const reward = this.rollReward(ds.stairCount);
        if (Object.keys(reward).length > 0) {
            this._gm.changeItem(reward, 'bag');
            this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            this._eventBus.emit('dungeon_change', ds);
            const names = Object.keys(reward).map(k => `${ITEM_DATA[k]?.name || k}×${reward[k]}`).join(' ');
            return { type: 'treasure', reward: names };
        }
        this._eventBus.emit('dungeon_change', ds);
        return { type: 'empty' };
    }

    /**
     * 掷前缀怪物：约 25% 概率出现前缀（atk/fat/def/magic/agile），upper 表示乱入层不在此列
     */
    private rollPrefix(): string | null {
        if (Math.random() < 0.25) {
            const keys = Object.keys(PREFIX_DATA).filter(k => k !== 'upper');
            if (keys.length) return keys[Math.floor(Math.random() * keys.length)];
        }
        return null;
    }

    /** 获取地牢商人可交易列表（TRADE_DATA 中 type==='dungeon' 的项） */
    getDungeonMerchants(): string[] {
        return Object.keys(TRADE_DATA).filter(id => (TRADE_DATA as any)[id].type === 'dungeon');
    }

    /** 获取楼层信息（怪物列表 + 奖励预览） */
    getFloorInfo(floor: number): { mstNames: string[]; hasReward: boolean } {
        const data = (DUNGEON_DATA as any)[floor];
        if (!data) return { mstNames: [], hasReward: false };
        const mstNames = data.mst ? Object.keys(data.mst).map(id => MST_DATA[id]?.name || id) : [];
        const hasReward = data.reward && data.reward.length > 0;
        return { mstNames, hasReward };
    }

    /** 获取最深层数 */
    getMaxFloor(): number {
        return Object.keys(DUNGEON_DATA).length;
    }

    /** 按层数抽取地牢怪物 */
    private pickDungeonMst(stair: number): string | null {
        const step = 10;
        let i = Math.ceil(stair / step);
        if (Math.random() < UPPER_CHANCE) i += 1; // 乱入层
        let mstList: Record<string, number> | undefined;
        do {
            mstList = DUNGEON_DATA[i]?.mst;
            i--;
        } while (!mstList && i > 0);
        if (!mstList) return null;
        const keys = Object.keys(mstList);
        return keys[Math.floor(Math.random() * keys.length)];
    }

    /** 按层数摇宝箱奖励 */
    private rollReward(stair: number): Record<string, number> {
        const rewardLevel = Math.ceil(stair / 10);
        const list: any[] = [];
        for (let i = rewardLevel; i > 0; i--) {
            const arr = DUNGEON_DATA[i]?.reward;
            if (arr) list.push(...arr);
        }
        const result: Record<string, number> = {};
        for (const tmp of list) {
            const things = tmp.things;
            for (const attr in things) {
                for (let j = things[attr] - 1; j >= 0; j--) {
                    if (Math.random() < tmp.chance) {
                        result[attr] = (result[attr] || 0) + 1;
                    }
                }
            }
        }
        return result;
    }

    /**
     * 与怪物战斗（简化回合解算，公式与 ActionCombat 完全一致：
     * 前缀加成 / 装备减伤 / 武器·防具耐久消耗均已接入，确保事件、地图、地牢遇怪与面板战结果一致）
     * @param mstId   MST_DATA 键
     * @param prefix  前缀怪物 key（可选，与交互式战斗统一）
     */
    battle(mstId: string, prefix?: string): ActionResult {
        const mst = MST_DATA[mstId];
        if (!mst) return { success: false, message: '怪物不存在' };

        // 怪物血量 + 前缀修正（与 ActionCombat.init 同一公式）
        const pf = ActionCombat.applyPrefix(prefix, mst);
        const mstHp0 = pf.mstHp;
        const mstDmgAdj = pf.mstDmg;          // 已含 atk/agile 前缀加成
        const prefixPlayerDmgMul = pf.prefixPlayerDmgMul;
        const prefixName = pf.prefixName;

        // 玩家命中率（武器射程 vs 怪物射程）
        const weaponId = this._gm.currentEquip['hand'];
        const weapon = weaponId ? ITEM_DATA[weaponId] : undefined;
        const wRange = weapon?.range || 1;
        const mRange = mst.range || 1;
        const pHit = wRange >= mRange ? 0.9 : 0.6;

        const log: string[] = [`与 ${prefixName}${mst.name} 交战中…`];
        let curHp = this._gm.playerState.hp;
        let mstHp = mstHp0;
        let turns = 0;
        while (curHp > 0 && mstHp > 0 && turns < 60) {
            // 玩家攻击（每回合重算：武器损坏后自动降级为徒手）
            const atk = ActionCombat.calcPlayerAtk(this._gm) * prefixPlayerDmgMul;
            ActionCombat.decayWeapon(this._gm, log);
            if (Math.random() < pHit) mstHp -= atk * (0.85 + Math.random() * 0.3);
            if (mstHp > 0) {
                // 怪物反击（应用装备减伤，与 ActionCombat 一致）
                if (Math.random() < 0.85) {
                    const dmg = Math.round(mstDmgAdj * (0.85 + Math.random() * 0.3) * ActionCombat.calcDamageReduce(this._gm));
                    curHp -= dmg;
                }
                ActionCombat.decayArmor(this._gm, log);
            }
            turns++;
        }

        const oldHp = this._gm.playerState.hp;

        if (curHp <= 0) {
            // 玩家阵亡
            this._gm.playerStateChange({ hp: -oldHp });
            this._eventBus.emit(GameEvents.BATTLE_END, { win: false, mst: mstId });
            return { success: false, message: `你被 ${prefixName}${mst.name} 击败了` };
        }

        // 胜利：扣除失血
        const lost = oldHp - curHp;
        if (lost > 0) this._gm.playerStateChange({ hp: -lost });

        // 奖励
        if (mst.reward) this._gm.changeItem(mst.reward, 'bag');
        if (mst.chanceGet) {
            for (const k in mst.chanceGet) {
                if (Math.random() < (mst.chanceGet as any)[k]) {
                    this._gm.changeItem({ [k]: 1 }, 'bag');
                }
            }
        }
        // 嗜血/吸收 天赋
        const skill = this._gm.skill;
        if (skill.blood) this._gm.playerStateChange({ hp: Math.round(oldHp * 0.2) });
        if (skill.absorb) this._gm.playerStateChange({ san: Math.round(this._gm.playerState.san * 0.2) });

        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this._eventBus.emit(GameEvents.BATTLE_END, { win: true, mst: mstId });
        return { success: true, message: `击败了 ${prefixName}${mst.name}` };
    }
}
