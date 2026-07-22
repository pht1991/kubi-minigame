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
import { PLACE_DATA, PICK_TIME, MST_DATA } from '../data/data';
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

        // 产出不直接入背包：进度结束后弹「收获」弹窗，由玩家自行取舍（参照原版取全部/取部分交互）
        const r = this._exec.execute({ ...canGet }, { ...require }, timeNeed, {
            title: '采集中',
            skipOutput: true,
            silent: true,
            onDone: () => {
                // 确保资源条目存在（兼容旧存档/缺失字段），懒初始化后递减
                const pd = this._gm.placeSaveData[placeId];
                if (pd) {
                    if (!pd.resource) pd.resource = {};
                    if (!pd.resource[resourceName]) pd.resource[resourceName] = { amount: res.initAmount ?? 30, count: 0 };
                    pd.resource[resourceName].amount -= 1;
                }
                this._eventBus.emit('place_change', placeId);
                // 弹出收获选择弹窗（携带完整 loot，不裁剪）
                this._eventBus.emit(GameEvents.HARVEST_READY, { title: `采集 · ${res.name || resourceName}`, loot: { ...canGet } });
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

        // 产出不直接入背包：进度结束后弹「收获」弹窗，由玩家自行取舍
        const r = this._exec.execute({ ...canGet }, { ...pickReq }, PICK_TIME, {
            title: '拾荒中',
            skipOutput: true,
            silent: true,
            onDone: () => {
                this._eventBus.emit('place_change', placeId);
                this._eventBus.emit(GameEvents.HARVEST_READY, { title: '拾荒收获', loot: { ...canGet } });
            },
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
