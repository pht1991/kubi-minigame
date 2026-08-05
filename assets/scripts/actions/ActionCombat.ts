/**
 * ActionCombat.ts - 回合制战斗状态机
 * 将 ActionDungeon.battle 的自动解算改为单回合驱动，供 BattlePanel 交互式调用。
 *
 * P1-3 增强：战斗技能独立效果 + 冷却
 *   - melee 格斗：猛击，伤害 ×(1+0.6×lv)，冷却 2
 *   - magic 魔法：爆发，伤害 ×(1+0.6×lv)，无视怪物魔法抵抗，冷却 3
 *   - shot  射击：精准，伤害 ×(1+0.6×lv)，命中率 95%，冷却 2
 *   - def   防御：防御姿态，本回合怪物反击伤害减半，冷却 3
 *   - agile 敏捷：闪避姿态，本回合怪物命中率骤降，冷却 2
 * 前缀怪物（地牢 rollPrefix）修正：atk→怪物伤害↑、fat→怪物HP↑、def→玩家伤害↓、magic→魔法抵抗、agile→怪物略强。
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ITEM_DATA, MST_DATA, PREFIX_DATA } from '../data/data';

/** 各战斗技能冷却回合数 */
const SKILL_CD: Record<string, number> = {
    melee: 2,
    magic: 3,
    shot: 2,
    def: 3,
    agile: 2,
};

export interface CombatState {
    mstId: string;
    mstName: string;
    mstHp: number;
    mstMaxHp: number;
    mstDmg: number;
    playerAtk: number;
    playerMaxHp: number;
    playerCurHp: number;
    /** 玩家命中率 */
    pHit: number;
    /** 当前回合数 */
    turn: number;
    /** 战斗日志 */
    log: string[];
    /** 是否结束 */
    ended: boolean;
    /** 玩家获胜？ */
    win: boolean;
    /** 奖励（战斗结束后填充） */
    rewards: string[];
    /** 技能冷却：skillId → 剩余回合 */
    cds: Record<string, number>;
    /** 本回合防御姿态：怪物下次攻击减半 */
    guard: boolean;
    /** 本回合闪避姿态：怪物命中骤降 */
    dodge: boolean;
    /** 前缀怪物名称前缀（如 "残暴的 "） */
    prefixName: string;
    /** 玩家对该怪物伤害倍率（坚硬前缀 <1） */
    prefixPlayerDmgMul: number;
    /** 怪物魔法抵抗比例（抗魔前缀 >0） */
    prefixMagicResist: number;
}

export class ActionCombat {
    private static _instance: ActionCombat;
    private _gm: GameManager;
    private _eventBus: EventBus;

    /** 当前战斗状态，null = 不在战斗中 */
    state: CombatState | null = null;

    static get instance(): ActionCombat {
        if (!this._instance) this._instance = new ActionCombat();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._eventBus = EventBus.instance;
    }

    /** 开始与指定怪物战斗（prefix 为地牢前缀怪物 key，可选） */
    init(mstId: string, prefix?: string): boolean {
        const mst = MST_DATA[mstId];
        if (!mst) return false;

        // 怪物血量 + 前缀怪物修正（与 ActionDungeon.battle 共用同一套公式）
        const pf = ActionCombat.applyPrefix(prefix, mst);
        let mstHp = pf.mstHp;
        let mstDmg = pf.mstDmg;
        let prefixName = pf.prefixName;
        let prefixPlayerDmgMul = pf.prefixPlayerDmgMul;
        let prefixMagicResist = pf.prefixMagicResist;

        // 命中率（基于武器射程 vs 怪物射程）
        const weaponId = this._gm.currentEquip['hand'];
        const weapon = weaponId ? ITEM_DATA[weaponId] : undefined;
        const wRange = weapon?.range || 1;
        const mRange = mst.range || 1;
        const pHit = wRange >= mRange ? 0.9 : 0.6;

        const curHp = this._gm.playerState.hp;

        this.state = {
            mstId,
            mstName: `${prefixName}${mst.name}`,
            mstHp,
            mstMaxHp: mstHp,
            mstDmg,
            playerAtk: ActionCombat.calcPlayerAtk(this._gm),
            playerMaxHp: curHp,
            playerCurHp: curHp,
            pHit,
            turn: 0,
            log: [`遭遇了 ${prefixName}${mst.name}！`],
            ended: false,
            win: false,
            rewards: [],
            cds: {},
            guard: false,
            dodge: false,
            prefixName,
            prefixPlayerDmgMul,
            prefixMagicResist,
        };

        this._eventBus.emit('combat_start', this.state);
        return true;
    }

    /** 计算玩家当前攻击力（武器基础值 + 轮回加成 + 技能 + 装备倍率） */
    static calcPlayerAtk(gm: GameManager): number {
        const weaponId = gm.currentEquip['hand'];
        const weapon = weaponId ? ITEM_DATA[weaponId] : undefined;
        let dmg = weapon?.damage ?? weapon?.attack ?? 5;
        if (weapon?.reiToDmg) dmg += weapon.reiToDmg * gm.maouLevel;
        const skill = gm.skill;
        dmg *= 1 + (skill.melee || 0) * 0.15 + (skill.fighter || 0) * 1;
        if (weapon?.type === 'magic' || weapon?.type === 'staff' || weapon?.weaponType === 'magic') {
            dmg *= 1 + (skill.magic || 0) * 0.15;
        }
        const wm = weapon?.weaponType;
        if (wm === 'melee' && weapon?.meleeMul) dmg *= (1 + weapon.meleeMul);
        else if (wm === 'magic' && weapon?.magicMul) dmg *= (1 + weapon.magicMul);
        else if (wm === 'shoot' && weapon?.shootMul) dmg *= (1 + weapon.shootMul);
        if (weapon?.reiToAtk) dmg *= (1 + weapon.reiToAtk * gm.maouLevel);
        // 火之阵营：攻击 +5%
        if (gm.camp === 'fire') dmg *= 1.05;
        return Math.max(1, Math.round(dmg));
    }

    /** 计算玩家受到伤害的减免系数（防具 dmgMul + 轮回防御 + 防御技能） */
    static calcDamageReduce(gm: GameManager): number {
        let reduce = 1;
        const skill = gm.skill;
        reduce *= Math.pow(0.9, skill.def || 0);
        for (const slot of ['body', 'head', 'foot', 'neck'] as const) {
            const id = gm.currentEquip[slot];
            if (!id) continue;
            const it = ITEM_DATA[id];
            if (!it) continue;
            if (it.dmgMul) reduce *= it.dmgMul;
            if (it.reiToDef) reduce *= Math.max(0, 1 - it.reiToDef * gm.maouLevel);
        }
        return reduce;
    }

    /**
     * 前缀怪物修正（与 ActionDungeon.battle 共用，统一战斗公式）
     * atk→怪物伤害↑、fat→怪物HP↑、def→玩家伤害↓、magic→魔法抵抗、agile→怪物略强
     */
    static applyPrefix(prefix: string | undefined, mst: any): { mstHp: number; mstDmg: number; prefixName: string; prefixPlayerDmgMul: number; prefixMagicResist: number } {
        let mstHp = mst.maxHp;
        if (mst.hpMul) mstHp = Math.ceil(mstHp * mst.hpMul * (1 + GameManager.instance.maouLevel));
        let mstDmg = mst.damage;
        let prefixName = '';
        let prefixPlayerDmgMul = 1;
        let prefixMagicResist = 0;
        if (prefix && PREFIX_DATA[prefix]) {
            const p = PREFIX_DATA[prefix];
            prefixName = p.name || '';
            const buff = (p as any).buff ?? 0.4;
            switch (prefix) {
                case 'atk':   mstDmg *= (1 + buff); break;                 // 残暴：伤害↑
                case 'fat':   mstHp *= (1 + buff); break;                   // 肥胖：HP↑
                case 'def':   prefixPlayerDmgMul = 1 / (1 + buff); break;   // 坚硬：玩家伤害↓
                case 'magic': prefixMagicResist = buff; break;              // 抗魔：魔法抵抗
                case 'agile': mstDmg *= (1 + buff * 0.5); break;            // 狡猾：略强
                default: break;
            }
        }
        return { mstHp, mstDmg, prefixName, prefixPlayerDmgMul, prefixMagicResist };
    }

    /** 战斗中使用武器 → 消耗耐久，归零则损坏卸下（log 可选，自动解算时用于回传战斗日志） */
    static decayWeapon(gm: GameManager, log?: string[]): void {
        const id = gm.currentEquip['hand'];
        if (!id) return;
        const max = ITEM_DATA[id]?.durable;
        if (max === undefined) return;
        const cur = gm.durableSaveData[id] ?? max;
        const next = cur - 1;
        if (next <= 0) {
            delete gm.currentEquip['hand'];
            delete gm.durableSaveData[id];
            if (log) log.push(`${ITEM_DATA[id]?.name || id} 损坏了！`);
        } else {
            gm.durableSaveData[id] = next;
        }
        EventBus.instance.emit(GameEvents.EQUIP_CHANGE, gm.currentEquip);
    }

    /** 受到攻击 → 消耗所有已装备防具耐久，归零则损坏卸下（log 可选） */
    static decayArmor(gm: GameManager, log?: string[]): void {
        for (const slot of ['body', 'head', 'foot', 'neck'] as const) {
            const id = gm.currentEquip[slot];
            if (!id) continue;
            const max = ITEM_DATA[id]?.durable;
            if (max === undefined) continue;
            const cur = gm.durableSaveData[id] ?? max;
            const next = cur - 1;
            if (next <= 0) {
                delete gm.currentEquip[slot];
                delete gm.durableSaveData[id];
                if (log) log.push(`${ITEM_DATA[id]?.name || id} 损坏了！`);
            } else {
                gm.durableSaveData[id] = next;
            }
            EventBus.instance.emit(GameEvents.EQUIP_CHANGE, gm.currentEquip);
        }
    }

    /** 每回合结束递减所有技能冷却 */
    private tickCd(): void {
        if (!this.state) return;
        for (const k in this.state.cds) {
            if (this.state.cds[k] > 0) this.state.cds[k] -= 1;
        }
    }

    /** 怪物反击（应用防御/闪避/装备减伤）——同步调用版本，外部传入玩家动作消息 */
    private _applyCounter(msg: string): string {
        const s = this.state!;
        if (s.mstHp > 0) {
            const hitChance = s.dodge ? 0.25 : 0.85;
            if (Math.random() < hitChance) {
                let dmg = s.mstDmg * (0.85 + Math.random() * 0.3) * ActionCombat.calcDamageReduce(this._gm);
                if (s.guard) dmg *= 0.5;
                dmg = Math.round(dmg);
                s.playerCurHp -= dmg;
                msg += ` ${s.mstName} 反击，造成 ${dmg} 伤害。`;
            } else {
                msg += ` ${s.mstName} 攻击落空了！`;
            }
            ActionCombat.decayArmor(this._gm, this.state?.log);
        }
        s.guard = false;
        s.dodge = false;
        this.tickCd();
        s.log.push(msg);
        return this.checkEnd();
    }

    /**
     * 玩家攻击部分（仅玩家动作：扣 mstHp + push 玩家 log "你攻击了..."，不触发反击）
     * 用于 BattlePanel "先玩家再延迟反击"的交互模式：调 playerAttack() 后立即 refreshUI，
     * 0.8s 后再调 monsterCounter() 让反击生效。
     */
    playerAttack(): string {
        if (!this.state || this.state.ended) return '战斗已结束';
        const s = this.state;
        s.turn++;
        s.playerAtk = ActionCombat.calcPlayerAtk(this._gm);
        const pdm = s.prefixPlayerDmgMul || 1;
        let msg = '';
        if (Math.random() < s.pHit) {
            const dmg = Math.round(s.playerAtk * pdm * (0.85 + Math.random() * 0.3));
            s.mstHp -= dmg;
            msg += `你攻击了 ${s.mstName}，造成 ${dmg} 伤害。`;
        } else {
            msg += '你的攻击落空了！';
        }
        ActionCombat.decayWeapon(this._gm, this.state?.log);
        s.log.push(msg);
        return msg;
    }

    /**
     * 怪物反击（无参）：从 state.log 取最后一条玩家消息作前缀，
     * 扣 playerCurHp + 用反击段替换最后一条 log。
     * 必须配合 playerAttack()/playerUseSkill()/playerUseItem() 使用。
     */
    monsterCounter(): string {
        const s = this.state;
        if (!s || s.ended) return s?.log[s.log.length - 1] || '';
        const lastIdx = s.log.length - 1;
        const baseMsg = s.log[lastIdx] || '';
        let msg = baseMsg;
        if (s.mstHp > 0) {
            const hitChance = s.dodge ? 0.25 : 0.85;
            if (Math.random() < hitChance) {
                let dmg = s.mstDmg * (0.85 + Math.random() * 0.3) * ActionCombat.calcDamageReduce(this._gm);
                if (s.guard) dmg *= 0.5;
                dmg = Math.round(dmg);
                s.playerCurHp -= dmg;
                msg += ` ${s.mstName} 反击，造成 ${dmg} 伤害。`;
            } else {
                msg += ` ${s.mstName} 攻击落空了！`;
            }
            ActionCombat.decayArmor(this._gm, s.log);
        }
        s.guard = false;
        s.dodge = false;
        this.tickCd();
        s.log[lastIdx] = msg;            // 替换玩家条 log 为完整消息
        return this.checkEnd();
    }

    /** 普通攻击（同步攻击+反击，给自动战斗 / ActionDungeon.battle 兼容用） */
    attack(): string {
        const playerMsg = this.playerAttack();
        return this._applyCounter(playerMsg);
    }

    /** 使用技能（独立效果 + 冷却） */
    useSkill(skillId: string): string {
        if (!this.state || this.state.ended) return '战斗已结束';
        const s = this.state;
        const skill = this._gm.skill;
        const lv = skill[skillId] || 0;
        if (lv <= 0) return '你还未学会该技能';
        if ((s.cds[skillId] || 0) > 0) {
            return `${this.skillName(skillId)}冷却中（剩 ${s.cds[skillId]} 回合）`;
        }

        s.turn++;
        s.playerAtk = ActionCombat.calcPlayerAtk(this._gm);
        const pdm = s.prefixPlayerDmgMul || 1;
        const magicResist = s.prefixMagicResist || 0;
        const roll = () => (0.85 + Math.random() * 0.3);

        let msg = '';
        switch (skillId) {
            case 'melee': {
                const dmg = Math.round(s.playerAtk * (1 + 0.6 * lv) * pdm * roll());
                if (Math.random() < s.pHit) { s.mstHp -= dmg; msg = `格斗猛击 ${s.mstName}，造成 ${dmg} 伤害。`; }
                else msg = '格斗攻击落空了！';
                s.cds[skillId] = SKILL_CD.melee;
                break;
            }
            case 'magic': {
                const dmg = Math.round(s.playerAtk * (1 + 0.6 * lv) * pdm * (1 - magicResist) * roll());
                if (Math.random() < s.pHit) { s.mstHp -= dmg; msg = `魔法爆发命中 ${s.mstName}，造成 ${dmg} 伤害。`; }
                else msg = '魔法吟唱失败！';
                s.cds[skillId] = SKILL_CD.magic;
                break;
            }
            case 'shot': {
                const dmg = Math.round(s.playerAtk * (1 + 0.6 * lv) * pdm * roll());
                if (Math.random() < 0.95) { s.mstHp -= dmg; msg = `精准射击 ${s.mstName}，造成 ${dmg} 伤害。`; }
                else msg = '射击偏离了目标！';
                s.cds[skillId] = SKILL_CD.shot;
                break;
            }
            case 'def': {
                s.guard = true;
                msg = '你摆出防御姿态，下次受击伤害减半。';
                s.cds[skillId] = SKILL_CD.def;
                break;
            }
            case 'agile': {
                s.dodge = true;
                msg = '你进入闪避姿态，本次怪物极难命中。';
                s.cds[skillId] = SKILL_CD.agile;
                break;
            }
            default:
                return '未知技能';
        }

        // 仅攻击类技能消耗武器耐久；防御/敏捷姿态不磨损武器
        if (skillId === 'melee' || skillId === 'magic' || skillId === 'shot') ActionCombat.decayWeapon(this._gm, this.state?.log);
        // 防御/闪避姿态在本回合怪物反击中生效
        return this._applyCounter(msg);
    }

    /** 使用道具（回复类） */
    useItem(itemId: string): string {
        if (!this.state || this.state.ended) return '战斗已结束';
        const item = ITEM_DATA[itemId];
        if (!item) return '物品不存在';

        const s = this.state;
        s.turn++;

        let msg = `使用了 ${item.name}。`;
        const bag = this._gm.boxSaveData['bag'] || {};
        if (!bag[itemId] || bag[itemId] <= 0) return `背包中没有 ${item.name}`;

        this._gm.changeItem({ [itemId]: -1 }, 'bag');

        if (item.heal) { s.playerCurHp = Math.min(s.playerCurHp + item.heal, s.playerMaxHp); msg += ` 回复 ${item.heal} HP。`; }
        if (item.effect) {
            for (const k in item.effect) {
                if (k === 'hp') { s.playerCurHp = Math.min(s.playerCurHp + item.effect[k], s.playerMaxHp); msg += ` ${item.effect[k] > 0 ? '+' : '-'}${Math.abs(item.effect[k])} HP。`; }
            }
        }

        // 能量球：为匹配武器恢复满耐久（原版战斗内允许；原版 durableSaveData=0 为笔误，此处按描述“恢复所有耐久度”实现为充满）
        const d = item as any;
        if (d.durableRec) {
            const rec = d.durableRec as string;
            const weaponIds = new Set<string>();
            for (const k in this._gm.durableSaveData) weaponIds.add(k);
            for (const slot of ['hand', 'head', 'body', 'foot', 'neck'] as const) {
                const id = this._gm.currentEquip[slot];
                if (id) weaponIds.add(id);
            }
            let charged = 0;
            for (const wid of weaponIds) {
                const w = ITEM_DATA[wid] as any;
                if (!w || w.weaponType === undefined) continue;
                const wt = w.weaponType as string;
                const match = rec === wt || (rec === 'unmagic' && (wt === 'melee' || wt === 'shoot'));
                if (match && w.durable !== undefined) {
                    this._gm.durableSaveData[wid] = w.durable;
                    charged++;
                }
            }
            if (charged > 0) {
                EventBus.instance.emit(GameEvents.EQUIP_CHANGE, this._gm.currentEquip);
                msg += ` 为 ${charged} 把武器恢复了耐久。`;
            }
        }

        // 升级书：永久提升对应技能（原版战斗内允许）
        if (d.upgrade) {
            const up = d.upgrade as string;
            const gain = (d.value as number) || 1;
            this._gm.skill[up] = this._gm.getSkillLevel(up) + gain;
            EventBus.instance.emit(GameEvents.SKILL_CHANGE, this._gm.skill);
            msg += ` 永久提升【${up}】技能 +${gain}。`;
        }

        if (s.mstHp > 0) {
            if (Math.random() < (s.dodge ? 0.25 : 0.85)) {
                let dmg = s.mstDmg * (0.85 + Math.random() * 0.3) * ActionCombat.calcDamageReduce(this._gm);
                if (s.guard) dmg *= 0.5;
                dmg = Math.round(dmg);
                s.playerCurHp -= dmg;
                msg += ` ${s.mstName} 攻击，造成 ${dmg} 伤害。`;
            }
            ActionCombat.decayArmor(this._gm, this.state?.log);
        }
        s.guard = false;
        s.dodge = false;
        this.tickCd();
        s.log.push(msg);
        return this.checkEnd();
    }

    /** 逃跑 */
    flee(): string {
        if (!this.state || this.state.ended) return '战斗已结束';
        const s = this.state;
        if (Math.random() < 0.5) {
            s.ended = true;
            s.win = false;
            s.log.push('你成功逃跑了！');
            this._eventBus.emit(GameEvents.BATTLE_END, { win: false, mst: s.mstId, fled: true });
            return '成功逃跑了！';
        }
        s.turn++;
        let msg = '逃跑失败！';
        if (Math.random() < (s.dodge ? 0.25 : 0.85)) {
            let dmg = s.mstDmg * (0.85 + Math.random() * 0.3) * ActionCombat.calcDamageReduce(this._gm);
            if (s.guard) dmg *= 0.5;
            dmg = Math.round(dmg);
            s.playerCurHp -= dmg;
            msg += ` ${s.mstName} 趁机攻击，造成 ${dmg} 伤害。`;
            ActionCombat.decayArmor(this._gm, this.state?.log);
        }
        s.guard = false;
        s.dodge = false;
        this.tickCd();
        s.log.push(msg);
        return this.checkEnd();
    }

    /** 技能中文名 */
    private skillName(id: string): string {
        const map: Record<string, string> = { melee: '格斗', magic: '魔法', shot: '射击', def: '防御', agile: '敏捷' };
        return map[id] || id;
    }

    /** 检查战斗是否结束 */
    private checkEnd(): string {
        if (!this.state) return '';
        const s = this.state;

        if (s.playerCurHp <= 0) {
            s.ended = true;
            s.win = false;
            const oldHp = this._gm.playerState.hp;
            this._gm.playerStateChange({ hp: -oldHp });
            s.log.push('你被击败了！');
            this._eventBus.emit(GameEvents.BATTLE_END, { win: false, mst: s.mstId });
            return '你被击败了！';
        }

        if (s.mstHp <= 0) {
            s.ended = true;
            s.win = true;

            const oldHp = this._gm.playerState.hp;
            const lost = oldHp - s.playerCurHp;
            if (lost > 0) this._gm.playerStateChange({ hp: -lost });
            if (lost < 0) this._gm.playerStateChange({ hp: -lost });

            const mst = MST_DATA[s.mstId];
            const rewardItems: string[] = [];
            if (mst) {
                if (mst.reward) {
                    this._gm.changeItem(mst.reward, 'bag');
                    for (const k in mst.reward) {
                        rewardItems.push(`${ITEM_DATA[k]?.name || k}×${mst.reward[k]}`);
                    }
                }
                if (mst.chanceGet) {
                    const cg = mst.chanceGet as any;
                    for (const k in cg) {
                        if (Math.random() < cg[k]) {
                            this._gm.changeItem({ [k]: 1 }, 'bag');
                            rewardItems.push(`${ITEM_DATA[k]?.name || k}×1`);
                        }
                    }
                }
            }
            s.rewards = rewardItems;

            const skill = this._gm.skill;
            if (skill.blood) this._gm.playerStateChange({ hp: Math.round(this._gm.playerState.hp * 0.2) });
            if (skill.absorb) this._gm.playerStateChange({ san: Math.round(this._gm.playerState.san * 0.2) });

            this._eventBus.emit(GameEvents.ITEM_CHANGE, 'bag');
            this._eventBus.emit(GameEvents.BATTLE_END, { win: true, mst: s.mstId });
            s.log.push(`击败了 ${s.mstName}！`);
            if (rewardItems.length > 0) s.log.push(`获得：${rewardItems.join(' ')}`);
            return `击败了 ${s.mstName}！`;
        }

        return s.log[s.log.length - 1] || '';
    }

    /** 清除战斗状态 */
    clear(): void {
        this.state = null;
    }
}
