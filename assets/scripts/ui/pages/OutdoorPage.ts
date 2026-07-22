/**
 * OutdoorPage.ts - 户外域页面模块
 *
 * 从 MainScene 抽离：商人可见性/出门列表/建筑详情/地图/地点详情/交易，及地图辅助 helper。
 * 入口 openGoOutList/openBuildingGrid/openMapGrid 被 MainScene（onHomeCellClick/onBottomAction）委托调用。
 * buildBuildingDetailPage 为 public，供 BrewPage 经 ctx.outdoorPage 跨域跳转建筑详情。
 *
 * 状态归属：isOutdoors / rolledTraders 由本模块管理（原 MainScene 私有字段迁移），
 * MainScene 底栏按钮通过 this._outdoorPage.isOutdoors 读取；设状态后经由 ctx.refreshGoButton() 刷新按钮。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionTrade } from '../../actions/ActionTrade';
import { ActionExecutor } from '../../actions/ActionExecutor';
import { ActionBuilding } from '../../actions/ActionBuilding';
import { ActionBrew } from '../../actions/ActionBrew';
import { ActionMap } from '../../actions/ActionMap';
import { ActionEvent } from '../../actions/ActionEvent';
import {
    TRADE_DATA, PLACE_DATA, ITEM_DATA, BUILDING_DATA,
    MST_DATA, EVENT_DATA,
} from '../../data/data';

/** 每次出门最多出现的商人数（避免扎堆） */
const MAX_TRADERS_PER_OUTING = 4;

export class OutdoorPage extends BasePage {
    /** 是否在户外（由本模块管理，MainScene 底栏按钮据此切换「出门/回家」） */
    public isOutdoors: boolean = false;
    /** 本次出门随机摇出的在场商人 key 列表（回家清空，再出门重摇） */
    public rolledTraders: string[] = [];

    // ===== 商人可见性 =====

    private isTraderVisible(key: string): boolean {
        const d = TRADE_DATA[key];
        if (!d) return false;
        if (d.type === 'dungeon') return false; // 地牢专属商人仅地牢商人弹窗出现
        if (d.season) {
            const SEASON_EN = ['spring', 'summer', 'autumn', 'winter'];
            if (d.season !== SEASON_EN[this.gm.timeData.season]) return false;
        }
        if (d.day && this.gm.timeData.day < d.day) return false; // 第N天后才出现
        return true;
    }

    /**
     * 随机摇出当前在场商人（参照原版贸易系统：商人随机出现，不是全部列出）。
     * 每个可见商人按出现概率掷骰，命中的进入在场列表。
     * 概率优先级：TRADE_DATA[key].prob（可选）> 类别默认值。
     * 最终截取至 MAX_TRADERS_PER_OUTING 个，避免出门页被商人淹没。
     */
    private rollVisibleTraders(): string[] {
        const visible = Object.keys(TRADE_DATA).filter(k => this.isTraderVisible(k));
        const rolled = visible.filter(k => {
            const d = TRADE_DATA[k] as any;
            const p = d.prob ?? this.defaultTraderProb(d);
            return Math.random() < p;
        });
        // 极端兜底：若全部未命中（概率极低），至少随机保留一个在场，避免空场导致无法交易
        if (rolled.length === 0 && visible.length > 0) {
            rolled.push(visible[Math.floor(Math.random() * visible.length)]);
        }
        // 截取上限：随机打乱后取前 N，保证多样性
        if (rolled.length > MAX_TRADERS_PER_OUTING) {
            for (let i = rolled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [rolled[i], rolled[j]] = [rolled[j], rolled[i]];
            }
            rolled.length = MAX_TRADERS_PER_OUTING;
        }
        return rolled;
    }

    /** 未显式指定 prob 时的默认出现概率（低频：每次出门只遇到少数商人） */
    private defaultTraderProb(d: any): number {
        if (d.give === 'gold') return 0.9;       // 金币商队高概率（核心金币来源）
        if (d.season) return 0.5;                // 季节限定商人中等概率（本身稀缺）
        if (d.type === 'upgrade') return 0.25;   // 升级商人较低频
        if (d.type === 'potion' || d.type === 'scroll') return 0.15;  // 特殊商人稀少
        return 0.2;                              // 其余资源/功能商人默认 20%
    }

    // ===== 出门 =====

    /** 公开入口：打开出门列表（地点 + 本次随机在场商人） */
    public openGoOutList(): void {
        // 进入地图列表即视为「出门在外」，底栏按钮变「回家」
        this.isOutdoors = true;
        this.ctx.refreshGoButton();

        // 本次出门随机摇出在场商人（回家后缓存清空，再出门重摇）
        if (this.rolledTraders.length === 0) this.rolledTraders = this.rollVisibleTraders();

        const cells: GridCellData[] = [];
        for (const key in PLACE_DATA) {
            const p = PLACE_DATA[key];

            // requireEvent 过滤：未满足解锁条件的不显示
            if (p.requireEvent) {
                const eventDone = this.gm.eventSaveData[p.requireEvent]?.experienced;
                if (!eventDone) continue;
            }

            const psd = this.gm.placeSaveData[key] || {};
            const visited = !!psd.visited;
            const timeNeed = p.timeNeed || 1;

            let resHint = '';
            if (p.resource) {
                const resCount = Object.keys(p.resource).length;
                if (resCount >= 3) resHint = '资源丰富';
                else if (resCount >= 2) resHint = '资源较多';
                else if (resCount >= 1) resHint = '有资源';
            }
            if (p.mst && Object.keys(p.mst).length > 0) resHint += resHint ? ' 有怪' : '危险';

            cells.push({
                id: `place_${key}`,
                name: `${p.name}\n${resHint || '未知'} 耗时${timeNeed}h`,
                state: 'normal',
                type: 'list',
                isNew: !visited,
                data: { placeKey: key, timeNeed },
            });
        }

        // 商人（与地点平铺，点击进交易二级页；仅展示本次随机在场的一批）
        for (const key of this.rolledTraders) {
            const d = TRADE_DATA[key];
            const giveName = d.give === 'gold' ? '金币' : (ITEM_DATA[d.give]?.name || d.give);
            const refresh = d.time ? ` 每${d.time}h补货` : '';
            const stock = ActionTrade.instance.getStock(key);
            const stockStr = d.give === 'gold' ? '领取金币' : `剩余${stock.available}/${stock.max}`;
            cells.push({
                id: `trader_${key}`,
                name: `${d.name}\n出售:${giveName} · ${stockStr}${refresh}`,
                state: 'normal',
                type: 'list',
                data: { traderId: key },
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '还没有可前往的地点', state: 'disabled', type: 'list' });
        }

        this.navigator.push({
            title: '出门',
            breadcrumb: '主页 > 出门',
            columns: 1,
            cells,
            onCellClick: (index, cell) => {
                if (cell.data?.traderId) {
                    this.openTradeDetail(cell.data.traderId);
                } else if (cell.data?.placeKey) {
                    this.travelToPlace(cell.data.placeKey, cell.data.timeNeed);
                }
            },
        });
    }

    /** 前往地点（消耗时间 + 进入详情页） */
    private travelToPlace(placeKey: string, timeNeed: number): void {
        ActionExecutor.instance.execute({}, {}, timeNeed);
        if (!this.gm.placeSaveData[placeKey]) this.gm.placeSaveData[placeKey] = {};
        this.gm.placeSaveData[placeKey].visited = true;
        this.openPlaceDetail(placeKey);
    }

    // ===== 建筑（原有：建筑详情/升级/子功能入口，保留兼容）=====

    /** 公开入口：打开建筑列表 */
    public openBuildingGrid(): void {
        const cells: GridCellData[] = Object.keys(BUILDING_DATA)
            .filter(key => key !== 'build')
            .map(key => {
                const d = BUILDING_DATA[key];
                const built = this.gm.buildingSaveData[key]?.own;
                const preBuilt = !d.building || this.gm.buildingSaveData[d.building]?.own;
                const hasMat = this.gm.checkHaveResource(d.require || {});
                const canBuild = !built && preBuilt && hasMat;
                return {
                    id: key,
                    name: d.name,
                    state: (built || canBuild) ? 'normal' : 'disabled',
                    data: key,
                };
            });

        this.navigator.push({
            title: '建筑',
            breadcrumb: '建筑',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openBuildingDetail(cell.id),
        });
    }

    /** 建筑详情 + 建造/升级动作 */
    private openBuildingDetail(buildingId: string): void {
        this.navigator.push(this.buildBuildingDetailPage(buildingId));
    }

    /** 建筑详情页（建造/升级/子功能入口：农田·陷阱·酿酒·水井） */
    public buildBuildingDetailPage(buildingId: string): GridPage {
        const d = BUILDING_DATA[buildingId];
        const built = this.gm.buildingSaveData[buildingId]?.own;
        const reqStr = d.require && Object.keys(d.require).length > 0
            ? Object.entries(d.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const timeNeed = d.timeNeed || 4;

        const cells: GridCellData[] = [];
        cells.push(
            { id: 'name', name: d.name, state: 'disabled' },
            { id: 'desc', name: d.desc || '', state: 'disabled' },
        );
        if (!built) {
            const preName = d.building ? BUILDING_DATA[d.building]?.name || d.building : null;
            const canBuild = (!preName || this.gm.buildingSaveData[d.building]?.own)
                && this.gm.checkHaveResource(d.require || {});
            cells.push(
                { id: 'pre', name: preName ? `前置: ${preName}` : '前置: 无', state: 'disabled' },
                { id: 'req', name: `材料: ${reqStr}`, state: 'disabled' },
                { id: 'time', name: `耗时: ${timeNeed} 小时`, state: 'disabled' },
                { id: 'build', name: '建造', state: canBuild ? 'normal' : 'disabled' },
            );
        } else {
            cells.push({ id: 'built', name: '已建造', state: 'disabled' });
            if (buildingId === 'farm') {
                const farmData = this.gm.buildingSaveData['farm'];
                const slots = ActionBuilding.instance.getFarmSlots();
                const readyCount = slots.filter(s => s.ready).length;
                cells.push({
                    id: 'farm_manage',
                    name: `农田管理 (${slots.length}/${farmData?.size || 2}${readyCount > 0 ? ` · ${readyCount}可收` : ''})`,
                    state: 'normal',
                });
            }
            if (buildingId === 'trap') {
                const trapData = this.gm.buildingSaveData['trap'];
                const slots = ActionBuilding.instance.getTrapSlots();
                const canCheckCount = slots.filter(s => s.canCheck).length;
                cells.push({
                    id: 'trap_manage',
                    name: `陷阱管理 (${slots.length}/${trapData?.size || 2}${canCheckCount > 0 ? ` · ${canCheckCount}可查` : ''})`,
                    state: 'normal',
                });
            }
            if (buildingId === 'alco') {
                const slots = ActionBrew.instance.getBrewSlots();
                const readyCount = slots.filter(s => s.ready).length;
                cells.push({
                    id: 'brew_manage',
                    name: `酿酒管理 (${slots.length}/${ActionBrew.MAX_SLOTS}${readyCount > 0 ? ` · ${readyCount}可收` : ''})`,
                    state: 'normal',
                });
            }
            if (buildingId === 'well') {
                const frozen = this.timeSys.isWinter();
                cells.push({
                    id: 'well_collect',
                    name: frozen ? '取水 (冬季封冻)' : '取水',
                    state: frozen ? 'disabled' : 'normal',
                });
            }
        }

        const upType = `${buildingId}Update`;

        // 各建筑升级效果描述（仅作确认弹窗内的说明文案，不塞进按钮）
        const EFFECT_BY_UP: Record<string, string> = {
            wellUpdate: '每次取水 +2 清水（基础 8 + 等级×2）',
            toiletUpdate: '解锁/改善淋浴：洗澡可恢复精神，保持卫生',
        };

        return {
            title: d.name,
            breadcrumb: d.name,
            columns: 4,
            cells,
            // 升级按钮走公共标题栏接口（与所有可升级建筑统一），替代旧内联升级格
            ...this.makeUpgradeInfo(upType, {
                title: `${d.name}升级`,
                effectText: EFFECT_BY_UP[upType],
                onUpgraded: () => this.navigator.replace(this.buildBuildingDetailPage(buildingId)),
            }),
            onCellClick: (index, cell) => {
                if (cell.id === 'build') {
                    const r = ActionBuilding.instance.build(buildingId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildBuildingDetailPage(buildingId));
                } else if (cell.id === 'farm_manage') {
                    this.ctx.farmPage?.openFarmPanel();
                } else if (cell.id === 'trap_manage') {
                    this.ctx.trapPage?.openTrapPanel();
                } else if (cell.id === 'brew_manage') {
                    this.ctx.brewPage?.openBrewPanel();
                } else if (cell.id === 'well_collect') {
                    const r = ActionBuilding.instance.collectWell();
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildBuildingDetailPage(buildingId));
                }
            },
        };
    }

    // ===== 地图辅助方法 =====

    /** 详细校验资源需求，返回 { ok, msg }。ok=false 时 msg 说明第一个未满足的原因。 */
    private checkResourceRequireDetail(require: Record<string, number> | undefined): { ok: boolean; msg: string } {
        if (!require || Object.keys(require).length === 0) return { ok: true, msg: '' };
        for (const [key, need] of Object.entries(require)) {
            if (key === 'ps') {
                if (this.gm.playerState.ps < need) return { ok: false, msg: `体力不足（需要 ${need}）` };
            } else if (this.gm.isToolItem(key)) {
                const toolCheck = this.gm.canUseTools({ [key]: need });
                if (!toolCheck.ok) return { ok: false, msg: toolCheck.msg };
            } else {
                if (!this.gm.checkHaveResource({ [key]: need })) {
                    const name = ITEM_DATA[key]?.name || key;
                    return { ok: false, msg: `缺少材料【${name}】` };
                }
            }
        }
        return { ok: true, msg: '' };
    }

    /** 根据资源 circle 值返回生长状态文本 */
    private growthStatus(circle: number, amount: number): string {
        if (amount <= 0) return '枯竭';
        if (circle <= 0) return '停止';
        if (circle >= 1) return '较快';
        if (circle >= 0.5) return '正常';
        if (circle >= 0.2) return '较慢';
        return '非常慢';
    }

    /** 格式化需求字段：{ps:5, axe:1} → "体力5 斧头1" */
    private formatRequire(require: Record<string, number> | undefined): string {
        if (!require || Object.keys(require).length === 0) return '无';
        const parts: string[] = [];
        for (const [k, v] of Object.entries(require)) {
            if (k === 'ps') {
                parts.push(`体力${v}`);
            } else {
                const itemName = ITEM_DATA[k]?.name || k;
                parts.push(`${itemName}${v > 1 ? v : ''}`);
            }
        }
        return parts.join(' ');
    }

    /** 格式化获得物：{bark:2, wood:5} → "树皮2 木头5" */
    private formatThings(things: Record<string, number> | undefined): string {
        if (!things) return '';
        const parts: string[] = [];
        for (const [id, cnt] of Object.entries(things)) {
            const itemName = ITEM_DATA[id]?.name || id;
            parts.push(`${itemName}${cnt > 1 ? cnt : ''}`);
        }
        return parts.join(' ');
    }

    /** 格式化资源行详细信息（不含标题行） */
    private formatResourceRow(res: any, amount: number): string {
        const growth = this.growthStatus(res.circle ?? 0.1, amount);
        const things = this.formatThings(res.things);
        const req = this.formatRequire(res.require);

        const lines: string[] = [];
        lines.push(`总量:${amount}  ${growth}`);
        if (things) lines.push(`获得: ${things}`);
        lines.push(`需要: ${req}`);

        return lines.join('\n');
    }

    /** 简单截断（按字符数） */
    private truncate(str: string, maxLen: number): string {
        if (!str) return str;
        return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
    }

    // ===== 地图（地点列表 + 探索进度）=====

    /** 公开入口：打开地图 */
    public openMapGrid(): void {
        this.isOutdoors = true;
        this.ctx.refreshGoButton();

        if (this.rolledTraders.length === 0) this.rolledTraders = this.rollVisibleTraders();

        const cells: GridCellData[] = [];
        for (const key in PLACE_DATA) {
            const p = PLACE_DATA[key];
            const psd = this.gm.placeSaveData[key] || {};
            const visited = !!psd.visited;

            cells.push({
                id: key,
                name: `${p.name}${visited ? ' ✓' : ''}`,
                state: visited ? 'normal' : 'selected',
                data: key,
            });
        }

        for (const key of this.rolledTraders) {
            const d = TRADE_DATA[key];
            cells.push({
                id: `trader_${key}`,
                name: d.name,
                state: 'normal',
                data: { traderId: key },
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '没有可探索的地点', state: 'disabled' });
        }

        this.navigator.push({
            title: '地图',
            breadcrumb: '地图',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.data?.traderId) {
                    this.openTradeDetail(cell.data.traderId);
                    return;
                }
                if (cell.id !== 'empty') {
                    if (!this.gm.placeSaveData[cell.id]?.visited) {
                        if (!this.gm.placeSaveData[cell.id]) this.gm.placeSaveData[cell.id] = {};
                        this.gm.placeSaveData[cell.id].visited = true;
                    }
                    this.openPlaceDetail(cell.id);
                }
            },
        });
    }

    /** 按筛选条件列出地点（内部复用，不再作为独立导航层） */
    private openMapFiltered(filter: string): void {
        const cells: GridCellData[] = [];
        for (const key in PLACE_DATA) {
            const p = PLACE_DATA[key];
            const psd = this.gm.placeSaveData[key] || {};
            const visited = !!psd.visited;

            if (filter === 'visited' && !visited) continue;
            if (filter === 'new' && visited) continue;

            cells.push({
                id: key,
                name: `${p.name}${visited ? ' ✓' : ''}`,
                state: 'normal',
                data: key,
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '该筛选下无地点', state: 'disabled' });
        }

        const filterNames: Record<string, string> = { all: '全部', visited: '已探索', new: '未探索' };

        this.navigator.push({
            title: `地图·${filterNames[filter] || filter}`,
            breadcrumb: filterNames[filter] || filter,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'empty') {
                    if (!this.gm.placeSaveData[cell.id]?.visited) {
                        if (!this.gm.placeSaveData[cell.id]) this.gm.placeSaveData[cell.id] = {};
                        this.gm.placeSaveData[cell.id].visited = true;
                    }
                    this.openPlaceDetail(cell.id);
                }
            },
        });
    }

    /** 地点详情：采集 / 拾荒 / 狩猎 / 事件 */
    public openPlaceDetail(placeId: string): void {
        this.isOutdoors = true;
        this.ctx.refreshGoButton();

        this.setMsg(''); // 进入地点时清空旧反馈，防止跨系统串显
        this.navigator.push(this.buildPlaceDetailPage(placeId));
    }

    private buildPlaceDetailPage(placeId: string): GridPage {
        const p = PLACE_DATA[placeId];

        const buildCells = (): GridCellData[] => {
            const psd = this.gm.placeSaveData[placeId] || {};
            const cells: GridCellData[] = [];

            if (p.desc) cells.push({ id: 'desc', name: p.desc, state: 'disabled', type: 'list' });

            if (p.resource) {
                for (const resName in p.resource) {
                    const res = p.resource[resName];
                    const amount = psd.resource?.[resName]?.amount ?? res.initAmount ?? 0;
                    const depleted = amount <= 0;
                    const lines = this.formatResourceRow(res, amount);
                    const actionLabel = res.action || '采集';
                    cells.push({
                        id: `gather_${resName}`,
                        name: `${res.name}  [${actionLabel}]\n${lines}`,
                        state: depleted ? 'disabled' : 'normal',
                        type: 'list',
                        data: { action: 'gather', resName },
                    });
                }
            }

            if (p.things && Object.keys(p.things).length > 0) {
                const thingParts = Object.entries(p.things).map(([id, cnt]) => {
                    const itemName = ITEM_DATA[id]?.name || id;
                    const qtyDesc = cnt >= 10 ? '大量' : cnt >= 5 ? '较多' : cnt >= 3 ? '少量' : '较少';
                    return `${itemName}${qtyDesc}`;
                });
                cells.push({
                    id: 'scavenge',
                    name: `拾荒  [拾荒]\n获得: ${thingParts.join('  ') || '未知'}`,
                    state: 'normal',
                    type: 'list',
                });
            }

            const mstList = psd.mst;
            const activeMonsters: string[] = [];
            if (mstList) {
                for (const mstId in mstList) {
                    const m = mstList[mstId];
                    if ((m.amount ?? 0) > 0) {
                        const mstName = MST_DATA[mstId]?.name || mstId;
                        const qty = m.amount ?? 0;
                        const qtyDesc = qty >= 10 ? '大量' : qty >= 5 ? '较多' : '较少';
                        activeMonsters.push(`${mstName}${qtyDesc}`);
                    }
                }
            }
            if (activeMonsters.length > 0) {
                cells.push({ id: 'hunt', name: `狩猎  [狩猎]\n发现: ${activeMonsters.join('  ')}`, state: 'normal', type: 'list' });
            } else {
                cells.push({ id: 'hunt', name: `狩猎  [狩猎]\n附近没有怪物`, state: 'disabled', type: 'list' });
            }

            if (p.event) {
                for (const evId in p.event) {
                    if (EVENT_DATA[evId] && !this.gm.eventSaveData[evId]?.experienced) {
                        const ev = EVENT_DATA[evId];
                        cells.push({
                            id: `event_${evId}`,
                            name: `事件·${ev.name}  [对话]\n${ev.desc ? this.truncate(ev.desc, 40) : ''}`,
                            state: 'normal',
                            type: 'list',
                            data: { action: 'event', evId },
                        });
                    }
                }
            }

            for (const c of cells) { if (c.type === 'list') c.noTruncate = true; }
            return cells;
        };

        return {
            title: p.name,
            breadcrumb: p.name,
            columns: 1,
            cells: buildCells(),
            rebuild: buildCells,
            onCellClick: (index, cell) => {
                const data = cell.data as any;
                if (data?.action === 'gather') {
                    const res = PLACE_DATA[placeId]?.resource?.[data.resName];
                    const check = this.checkResourceRequireDetail(res?.require);
                    if (!check.ok) {
                        this.setMsg(check.msg);
                        this.navigator.replace(this.buildPlaceDetailPage(placeId));
                        return;
                    }
                    const r = ActionMap.instance.gather(placeId, data.resName);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildPlaceDetailPage(placeId));
                } else if (cell.id === 'scavenge') {
                    const r = ActionMap.instance.scavenge(placeId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildPlaceDetailPage(placeId));
                } else if (cell.id === 'hunt') {
                    const hunted = ActionMap.instance.probeHunt(placeId);
                    if (hunted.mstId) {
                        this.setMsg(`遭遇了 ${hunted.mstName}！`);
                        this.navigator.replace(this.buildPlaceDetailPage(placeId));
                        this.battlePanel.startBattle(hunted.mstId);
                        return;
                    }
                    this.setMsg('附近没有怪物');
                    this.navigator.replace(this.buildPlaceDetailPage(placeId));
                } else if (data?.action === 'event') {
                    const r = ActionEvent.instance.trigger(data.evId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildPlaceDetailPage(placeId));
                }
            },
        };
    }

    // ===== 贸易 =====

    /** 商人详情入口（点击商人格子 → 打开交易面板） */
    public openTradeDetail(traderId: string): void {
        this.tradePanel.show(traderId, (msg) => { this.setMsg(msg); });
    }
}
