/**
 * ActionMap.ts - 地图探索系统动作
 * 覆盖：资源采集（gather）、拾荒（scavenge）、狩猎（hunt→战斗）
 * 范式对齐原 PlaceComponent：
 *   - 采集：消耗 resource.require（含 ps 体力 / 工具）→ 产出 resource.things → 该资源点 amount-1
 *   - 拾荒：消耗 pickRequire（默认 ps:3）→ 随机获得地点散落物品
 *   - 狩猎：从地点 mst 列表随机抽怪 → 交由 ActionDungeon 战斗
 */

import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { ActionExecutor, ActionResult } from './ActionExecutor';
import { PLACE_DATA, PICK_TIME, MST_DATA, ITEM_DATA } from '../data/data';
import { ActionDungeon } from './ActionDungeon';

export class ActionMap {
    private static _instance: ActionMap;
    private _gm: GameManager;
    private _exec: ActionExecutor;
    private _eventBus: EventBus;
    private _dungeon: ActionDungeon;

    static get instance(): ActionMap {
        if (!this._instance) this._instance = new ActionMap();
        return this._instance;
    }

    private constructor() {
        this._gm = GameManager.instance;
        this._exec = ActionExecutor.instance;
        this._eventBus = EventBus.instance;
        this._dungeon = ActionDungeon.instance;
    }

    /** 资源采集 */
    gather(placeId: string, resourceName: string): ActionResult {
        const placeData = PLACE_DATA[placeId];
        const res = placeData?.resource?.[resourceName];
        if (!res) return { success: false, message: '资源点不存在' };

        // 与 UI (buildPlaceDetailPage) 保持一致的 fallback 链：
        //   saveData.resource[name].amount → PLACE_DATA.resource[name].initAmount → 0
        // 避免存档缺少 resource 子字段时误判"资源已耗尽"
        const psd = this._gm.placeSaveData[placeId]?.resource?.[resourceName];
        const amount = psd?.amount ?? res.initAmount ?? 0;
        if (amount <= 0) return { success: false, message: '资源已耗尽' };

        const require = res.require || {};
        const canGet = res.things || {};
        const timeNeed = res.timeNeed || 1;

        // 按背包种类容量裁剪：背包未满尽量全收，满了只取能放下的（其余丢弃）
        const clamped = this._gm.clampToBag(canGet);

        const r = this._exec.execute({ ...clamped.taken }, { ...require }, timeNeed, {
            title: '采集中',
            successMessage: this.buildGetMessage(clamped, '采集'),
            resultModal: clamped.full,
            onDone: () => {
                // 确保资源条目存在（兼容旧存档/缺失字段），懒初始化后递减
                const pd = this._gm.placeSaveData[placeId];
                if (pd) {
                    if (!pd.resource) pd.resource = {};
                    if (!pd.resource[resourceName]) pd.resource[resourceName] = { amount: res.initAmount ?? 30, count: 0 };
                    pd.resource[resourceName].amount -= 1;
                }
                this._eventBus.emit('place_change', placeId);
            },
        });
        return r.success ? { success: true, message: '' } : r;
    }

    /** 拾荒：随机获得地点散落物品 */
    scavenge(placeId: string): ActionResult {
        const placeData = PLACE_DATA[placeId];
        const things = placeData?.things;
        if (!things || Object.keys(things).length === 0) {
            return { success: false, message: '这里没有可拾取的东西' };
        }
        const pickReq = placeData.pickRequire || { ps: 3 };

        // 随机挑选若干物品（每种 1~3 个）
        const keys = Object.keys(things);
        const canGet: Record<string, number> = {};
        const n = Math.min(keys.length, 2 + Math.floor(Math.random() * 2));
        for (let i = 0; i < n; i++) {
            const k = keys[Math.floor(Math.random() * keys.length)];
            canGet[k] = (canGet[k] || 0) + 1 + Math.floor(Math.random() * 3);
        }

        // 按背包种类容量裁剪：背包已满则只取能放下的，其余丢弃
        const clamped = this._gm.clampToBag(canGet);

        const r = this._exec.execute({ ...clamped.taken }, { ...pickReq }, PICK_TIME, {
            title: '拾荒中',
            successMessage: this.buildGetMessage(clamped, '拾荒'),
            resultModal: clamped.full,
            onDone: () => this._eventBus.emit('place_change', placeId),
        });
        return r.success ? { success: true, message: '' } : r;
    }

    /** 狩猎：从地点随机抽一只怪进入战斗 */
    hunt(placeId: string): ActionResult {
        const mstList = this._gm.placeSaveData[placeId]?.mst;
        const keys = mstList ? Object.keys(mstList).filter(k => (mstList[k].amount ?? 0) > 0) : [];
        if (keys.length === 0) return { success: false, message: '附近没有怪物' };
        const mstId = keys[Math.floor(Math.random() * keys.length)];
        return this._dungeon.battle(mstId, {});
    }

    /** 将物品ID→数量映射格式化为中文显示（如 "树皮2 木头5"） */
    private formatGetNames(items: Record<string, number>): string {
        return Object.entries(items)
            .map(([id, cnt]) => `${ITEM_DATA[id]?.name || id}${cnt > 1 ? cnt : ''}`)
            .join(' ');
    }

    /**
     * 构造采集/拾荒的获得反馈文案（经 OPERATION_DONE 弹 Toast / ResultModal）
     * - 全部放入：verb + 「获得了 X Y」
     * - 仅取部分（背包满）：追加「背包已满，未能带走：A B」
     */
    private buildGetMessage(clamped: { taken: Record<string, number>; dropped: Record<string, number>; full: boolean }, verb: string): string {
        const nameOf = (id: string) => ITEM_DATA[id]?.name || id;
        const takenStr = Object.entries(clamped.taken)
            .map(([id, cnt]) => `${nameOf(id)}${cnt > 1 ? cnt : ''}`)
            .join(' ');
        let msg = `${verb}获得了 ${takenStr}`;
        if (clamped.full) {
            const droppedStr = Object.entries(clamped.dropped)
                .map(([id, cnt]) => `${nameOf(id)}${cnt > 1 ? cnt : ''}`)
                .join(' ');
            const cap = this._gm.boxSize['bag'] || 12;
            msg += `\n背包已满（${cap}格），未能带走：${droppedStr}`;
        }
        return msg;
    }

    /** 探测狩猎（不自动战斗）：随机抽怪，返回怪物 ID 供 BattlePanel 使用 */
    probeHunt(placeId: string): { mstId: string | null; mstName: string } {
        const mstList = this._gm.placeSaveData[placeId]?.mst;
        const keys = mstList ? Object.keys(mstList).filter(k => (mstList[k].amount ?? 0) > 0) : [];
        if (keys.length === 0) return { mstId: null, mstName: '' };
        const mstId = keys[Math.floor(Math.random() * keys.length)];
        const mst = MST_DATA[mstId];
        return { mstId, mstName: mst?.name || mstId };
    }
}
