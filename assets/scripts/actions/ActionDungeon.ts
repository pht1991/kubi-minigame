/**
 * ActionDungeon.ts - 地牢与战斗系统动作
 *
 * 完整还原原版 main.js `DungeonComponent` 的房间/楼梯/探索度/前缀/钥匙/绳索机制：
 *   - 进入地牢(enter) → 探索(search/sneak) / 下楼(descend, 耗钥匙) / 绳索穿洞(ropeGo)
 *   - 探索一步 = 先独立判定战斗(battleChance 受探索度惩罚) + 再独立生成房间(奖励/空/回家/商人/捡钥匙/用钥匙/陷阱)
 *   - 每层有探索度 stairData（上限 MAX_DISCOVER=45），奖励/战斗/陷阱胜利都 discoverInc(+1)，
 *     战/奖概率乘 (1 - 探索度/MAX_DISCOVER)；每推进时间各层探索度衰减 DUNGEON_DEC
 *   - 战斗抽怪 enermyLevel=ceil(层/10) + UPPER_CHANCE 乱入；前缀可叠加多个（prefix 为对象）
 *
 * 注：battle() 自动解算版仍被地图狩猎(ActionMap) 与事件战斗(ActionEvent) 复用，保留不动。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { ActionCombat } from './ActionCombat';
import { MST_DATA, DUNGEON_DATA, ITEM_DATA, UPPER_CHANCE, TRADE_DATA, PREFIX_DATA, MAX_DISCOVER, DUNGEON_DEC } from '../data/data';

/** 地牢房间类型（对齐原版 getNewRoom） */
export type DungeonRoomType = 'reward' | 'getKey' | 'useKey' | 'trap' | 'empty' | 'seller' | 'home';

/** 房间解析结果（含已执行的副作用数据，供 UI 展示） */
export interface DungeonRoom {
    type: DungeonRoomType;
    reward?: Record<string, number>;
    item?: string;       // trap 掉落物 key（gem/gold）
    amount?: number;     // trap 数量
    damaged?: boolean;   // trap 是否受伤
    damage?: number;     // trap 伤害值
}

/** 一次探索行动的结果：可能遇敌 + 一个房间类型（房间副作用在战斗胜利后才由 UI 调 resolveRoom 执行，对齐原版"先战斗后生成房间"） */
export interface DungeonExploreResult {
    battle?: { mstId: string; prefix?: Record<string, boolean> };
    roomType: DungeonRoomType;
}

/** 按权重随机选取一个 key（对齐原版 getRandomThing） */
function weightedPick(table: Record<string, number>): string {
    let total = 0;
    for (const k in table) total += table[k];
    let r = Math.random() * total;
    for (const k in table) {
        r -= table[k];
        if (r < 0) return k;
    }
    return Object.keys(table)[0];
}

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

    /** 进入地牢：初始化进度（对齐原版 stairCount=1/roomCount=1/deepest=1/stairData={}） */
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

    /** 下楼：消耗 1 把地牢钥匙（对齐原版 handleChoice.downStair 的 useItem({dungeonKey:1})） */
    descend(): ActionResult {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { success: false, message: '尚未进入地牢' };
        const keys = this._gm.boxSaveData['bag']?.['dungeonKey'] || 0;
        if (keys <= 0) return { success: false, message: '下楼需要地牢钥匙' };
        this._gm.changeItem({ dungeonKey: -1 }, 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        ds.stairCount += 1;
        ds.roomCount = 0;
        ds.deepest = Math.max(ds.deepest, ds.stairCount);
        this._eventBus.emit('dungeon_change', ds);
        return { success: true, message: `下到了第 ${ds.stairCount} 层` };
    }

    /**
     * 绳索穿洞：消耗 1 根 dungeonRope 穿越到 deepest 之前任意层
     * 时间消耗 time = |to - from|^0.7，上限 20（对齐原版 handleRopeGo）
     * 时间推进由调用方（DungeonPage）负责，这里只处理消耗与层数。
     */
    ropeGo(toFloor: number): ActionResult {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { success: false, message: '尚未进入地牢' };
        const ropes = this._gm.boxSaveData['bag']?.['dungeonRope'] || 0;
        if (ropes <= 0) return { success: false, message: '需要地牢绳索' };
        if (toFloor <= ds.stairCount || toFloor >= ds.deepest) return { success: false, message: '目标层无效' };
        this._gm.changeItem({ dungeonRope: -1 }, 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        ds.stairCount = toFloor;
        ds.roomCount = 1;
        this._eventBus.emit('dungeon_change', ds);
        return { success: true, message: `空降到了第 ${toFloor} 层` };
    }

    /** 绳索穿越耗时（对齐原版 time = |Δ|^0.7，上限 20） */
    ropeTime(toFloor: number, fromFloor: number): number {
        let t = Math.pow(Math.abs(toFloor - fromFloor), 0.7);
        if (t >= 20) t = 20;
        return Math.round(t * 10) / 10;
    }

    /** 增加当前层探索度（cap 在 MAX_DISCOVER，对齐原版 discoverInc） */
    discoverInc(amount: number): void {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return;
        const k = ds.stairCount;
        ds.stairData[k] = Math.min(MAX_DISCOVER, (ds.stairData[k] || 0) + amount);
        this._eventBus.emit('dungeon_change', ds);
    }

    /**
     * 探索一步（search 普通/ sneak 潜行）：先独立判定战斗，再独立生成房间类型。
     * 二者都可能发生（对齐原版 handleChoice：if(random<battleChance)战斗 → getNewRoom）。
     * 房间副作用留待战斗胜利后由 UI 调 resolveRoom 执行。
     */
    explore(choice: 'search' | 'sneak'): DungeonExploreResult {
        const ds = this._gm.dungeonSaveData;
        if (!ds || !ds.stairCount) return { roomType: 'empty' };
        ds.roomCount += 1;
        let battle: DungeonExploreResult['battle'];
        if (Math.random() < this.getBattleChance(choice)) {
            const b = this.rollDungeonBattle();
            if (b) battle = b;
        }
        const roomType = this.rollRoom(choice);
        return { battle, roomType };
    }

    /** 战斗概率（对齐原版 getBattleChance：base × 装备 mul × (1 - 探索度/MAX_DISCOVER)） */
    private getBattleChance(choice: 'search' | 'sneak'): number {
        const ds = this._gm.dungeonSaveData;
        const stair = ds?.stairCount || 1;
        const base = choice === 'sneak' ? 0.1 : 0.6;
        const mul = this.equipMul('battleChanceMul');
        const disc = 1 - (ds?.stairData?.[stair] || 0) / MAX_DISCOVER;
        return Math.max(0, (1 - (1 - base) * mul) * disc);
    }

    /** 奖励概率（对齐原版 getRewardChance：base × 装备 mul × (1 - 探索度/MAX_DISCOVER)） */
    private getRewardChance(choice: 'search' | 'sneak'): number {
        const ds = this._gm.dungeonSaveData;
        const stair = ds?.stairCount || 1;
        const base = choice === 'sneak' ? 0.3 : 0.4;
        const mul = this.equipMul('rewardChanceMul');
        const disc = 1 - (ds?.stairData?.[stair] || 0) / MAX_DISCOVER;
        return Math.max(0, (1 - (1 - base) * mul) * disc);
    }

    /** 遍历当前装备，累乘 battleChanceMul / rewardChanceMul（对齐原版 getBattleChance/rewardChance 的 equip 循环） */
    private equipMul(field: 'battleChanceMul' | 'rewardChanceMul'): number {
        let mul = 1;
        const eq = this._gm.currentEquip;
        for (const slot in eq) {
            const id = eq[slot];
            if (!id) continue;
            const f = (ITEM_DATA[id] as any)?.[field];
            if (f) mul *= f;
        }
        return mul;
    }

    /** 按层数抽怪 + 前缀（对齐原版 getDungeonBattle：enermyLevel=ceil(层/10)，乱入，前缀可叠加） */
    private rollDungeonBattle(): { mstId: string; prefix?: Record<string, boolean> } | null {
        const ds = this._gm.dungeonSaveData;
        const stair = ds?.stairCount || 1;
        const step = 10;
        let i = Math.ceil(stair / step);
        const isUpper = Math.random() < UPPER_CHANCE;
        if (isUpper) i += 1;
        let mstList: Record<string, number> | undefined;
        do {
            mstList = DUNGEON_DATA[i]?.mst;
            i--;
        } while (!mstList && i > 0);
        if (!mstList) return null;
        const mstId = weightedPick(mstList);
        const prefix: Record<string, boolean> = {};
        const prefixChance = (stair % step) / step;
        let time = Math.floor(Math.random() * prefixChance * 5);
        const o: Record<string, any> = { ...(PREFIX_DATA as any) };
        delete o.upper;
        if (isUpper) { time -= 1; prefix.upper = true; }
        const keys = Object.keys(o);
        for (let k = time; k > 0; k--) {
            const key = keys[Math.floor(Math.random() * keys.length)];
            if (key) prefix[key] = true;
        }
        return { mstId, prefix };
    }

    /** 生成房间类型（对齐原版 getNewRoom：先判 rewardChance → 加权房间 + 钥匙重抽 + 探索度惩罚覆盖） */
    private rollRoom(choice: 'search' | 'sneak'): DungeonRoomType {
        const ds = this._gm.dungeonSaveData;
        const stair = ds?.stairCount || 1;
        const hasKey = (this._gm.boxSaveData['bag']?.['dungeonKey'] || 0) > 0;
        let room: DungeonRoomType;
        if (Math.random() < this.getRewardChance(choice)) {
            room = 'reward';
        } else {
            const table: Record<string, number> = { empty: 5, home: 1, seller: 2, getKey: 2, useKey: 2, trap: 1 };
            do {
                room = weightedPick(table) as DungeonRoomType;
            } while ((room === 'useKey' && !hasKey) || (room === 'getKey' && hasKey));
        }
        // 探索度惩罚：探索越透越"安全"，有钥匙→空房、无钥匙→捡钥匙（对齐原版 line 4505）
        if (Math.random() < (ds?.stairData?.[stair] || 0) / MAX_DISCOVER) {
            room = hasKey ? 'empty' : 'getKey';
        }
        return room;
    }

    /** 把房间类型解析为结果并执行副作用（useKey 需玩家二次确认，仅返回类型） */
    resolveRoom(type: DungeonRoomType): DungeonRoom {
        const ds = this._gm.dungeonSaveData;
        const stair = ds?.stairCount || 1;
        switch (type) {
            case 'reward': {
                const reward = this.getReward(stair);
                this._gm.changeItem(reward, 'bag');
                this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
                this.discoverInc(1);
                return { type: 'reward', reward };
            }
            case 'getKey':
                this._gm.changeItem({ dungeonKey: 1 }, 'bag');
                this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
                return { type: 'getKey' };
            case 'useKey':
                return { type: 'useKey' };   // 等待玩家用钥匙开宝箱（UI 二次确认）
            case 'trap': {
                const item = weightedPick({ gem: 200, gold: 200 });
                const amount = Math.ceil(Math.pow(stair, 0.2) + 1);
                const damaged = Math.random() < 0.5;
                const damage = Math.ceil(Math.random() * Math.floor((1 - Math.pow(0.9, stair)) * 100));
                if (damaged) this._gm.playerStateChange({ hp: -damage });
                this._eventBus.emit(GameEvents.UI_REFRESH);
                this._gm.changeItem({ [item]: amount }, 'bag');
                this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
                this.discoverInc(1);
                return { type: 'trap', item, amount, damaged, damage };
            }
            default:
                return { type };   // empty / seller / home
        }
    }

    /** 用钥匙开上锁宝箱：消耗 1 钥匙 + 双倍奖励 + 探索度 +1（对齐原版 useKey 的 cloneMul(get,2)） */
    useKeyChest(): DungeonRoom {
        const ds = this._gm.dungeonSaveData;
        const stair = ds?.stairCount || 1;
        const keys = this._gm.boxSaveData['bag']?.['dungeonKey'] || 0;
        if (keys <= 0) return { type: 'empty' };
        this._gm.changeItem({ dungeonKey: -1 }, 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        const get = this.getReward(stair);
        const doubled: Record<string, number> = {};
        for (const k in get) doubled[k] = get[k] * 2;
        this._gm.changeItem(doubled, 'bag');
        this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
        this.discoverInc(1);
        return { type: 'reward', reward: doubled };
    }

    /** 宝箱奖励（对齐原版 getReward：必保底至少 1 件，每层可获之前层宝物） */
    private getReward(stair: number): Record<string, number> {
        const rewardLevel = Math.ceil(stair / 10);
        const list: any[] = [];
        for (let i = rewardLevel; i > 0; i--) {
            const arr = DUNGEON_DATA[i]?.reward;
            if (arr) list.push(...arr);
        }
        const result: Record<string, number> = {};
        let guard = 0;
        while (Object.keys(result).length === 0 && guard < 50) {
            guard++;
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
        }
        return result;
    }

    /** 获取地牢商人可交易列表（TRADE_DATA 中 type==='dungeon' 的项） */
    getDungeonMerchants(): string[] {
        return Object.keys(TRADE_DATA).filter(id => (TRADE_DATA as any)[id].type === 'dungeon');
    }

    /** 获取楼层信息（怪物列表 + 奖励预览） */
    getFloorInfo(floor: number): { mstNames: string[]; hasReward: boolean } {
        const data = (DUNGEON_DATA as any)[floor];
        if (!data) return { mstNames: [], hasReward: false };
        const mstNames = data.mst ? Object.keys(data.mst).map((id: string) => MST_DATA[id]?.name || id) : [];
        const hasReward = !!data.reward && data.reward.length > 0;
        return { mstNames, hasReward };
    }

    /** 获取最深层数 */
    getMaxFloor(): number {
        return Object.keys(DUNGEON_DATA).length;
    }

    /** 按层数抽取地牢怪物（保留给地图/事件战斗的旧接口，地牢内部已内联 rollDungeonBattle） */
    private pickDungeonMst(stair: number): string | null {
        const step = 10;
        let i = Math.ceil(stair / step);
        if (Math.random() < UPPER_CHANCE) i += 1;
        let mstList: Record<string, number> | undefined;
        do {
            mstList = DUNGEON_DATA[i]?.mst;
            i--;
        } while (!mstList && i > 0);
        if (!mstList) return null;
        const keys = Object.keys(mstList);
        return keys[Math.floor(Math.random() * keys.length)];
    }

    /**
     * 与怪物战斗（自动解算版，公式与 ActionCombat 完全一致）：
     * 前缀加成 / 装备减伤 / 武器·防具耐久消耗均已接入。被地图狩猎(ActionMap) 与事件战斗(ActionEvent) 复用。
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
