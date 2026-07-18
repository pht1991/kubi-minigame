/**
 * RestPage.ts - 休息/床铺域页面模块
 *
 * 从 MainScene 抽离：床铺详情页（等级显示 + 睡觉恢复 + 升级）。
 * 入口 openRestPage 返回 GridPage，由 MainScene（facilityRoutes home_sleep）push 打开；
 * 未建床铺时点击「前往建造」经 ctx.buildPage 跳转到建造列表。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionBuilding } from '../../actions/ActionBuilding';
import { BUILDING_UPDATE_DATA, ITEM_DATA } from '../../data/data';
import { GameEvents } from '../../core/EventBus';

export class RestPage extends BasePage {
    /** 床铺详情页（原版 UI：等级显示 + 睡觉操作 + 升级） */
    public openRestPage(): GridPage {
        const hasBed = !!this.gm.buildingSaveData['sleepPlace']?.own;
        if (!hasBed) {
            // 未建造 → 提示去建造
            return {
                title: '休息',
                breadcrumb: '主页 > 休息',
                columns: 1,
                cells: [
                    { id: 'hint', name: '你还没有床铺\n请先在「建造」中建造一个', state: 'disabled', type: 'list' },
                    { id: 'goBuild', name: '前往建造', state: 'normal', type: 'list' },
                ],
                onCellClick: (idx, cell) => {
                    if (cell.id === 'goBuild') {
                        this.navigator.pop();
                        this.ctx.buildPage?.openBuildList();
                    }
                },
            };
        }

        // ===== 已建床铺：等级 + 睡觉 + 升级 =====
        const level = this.gm.getBuildingLevel('sleepPlace');
        const updateGroup = BUILDING_UPDATE_DATA['sleepPlaceUpdate'];
        // 等级键顺序：bed_1(0), bed_2(1), bed_3(2), bed_4(3)
        const levelKeys = updateGroup ? Object.keys(updateGroup) : [];
        const currentLevelName = level >= levelKeys.length ? '已满级' :
            (level === 0 ? '地板' : ITEM_DATA[levelKeys[level - 1]]?.name || `Lv.${level}`);
        const nextLevelId = levelKeys[level];
        const canUpgrade = !!(updateGroup && nextLevelId);

        const cells: GridCellData[] = [];

        // ── 顶行：当前等级 ──
        cells.push({ id: 'levelInfo', name: `当前床铺等级：${currentLevelName}`, state: 'disabled', type: 'list' });

        // ── 睡觉操作（恢复量按等级递增，不直接回满） ──
        // 等级恢复表：[体力恢复, 精神恢复, 推进小时]
        const REST_TABLE: [number, number, number][] = [
            [15, 10, 1],   // Lv0 地板
            [25, 18, 1],  // Lv1 木床
            [35, 25, 1],  // Lv2 弹簧床
            [50, 35, 1],  // Lv3 大床
        ];
        const restIdx = Math.min(level, REST_TABLE.length - 1);
        const [restPs, restSan, restHours] = REST_TABLE[restIdx];
        cells.push({
            id: 'sleep',
            name: `[睡觉]  恢复约 +${restPs}体力 +${restSan}精神  推进${restHours}小时`,
            state: 'normal',
            type: 'list',
            noTruncate: true,
            data: { restPs, restSan, restHours },
        });

        // ── 升级区（有下一级时显示） ──
        if (canUpgrade && nextLevelId) {
            const upData = updateGroup[nextLevelId];
            const nextItem = ITEM_DATA[nextLevelId];
            const reqParts = Object.entries(upData.require || {})
                .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`)
                .join(' ');
            cells.push({
                id: `upgrade_${nextLevelId}`,
                name: `${nextItem?.name || nextLevelId}    ${reqParts || ''}\n${nextItem?.desc || ''}`,
                state: this.gm.checkHaveResource(upData.require || {}) ? 'normal' : 'disabled',
                type: 'list',
                noTruncate: true,
                data: { action: 'upgrade', targetId: nextLevelId },
            });
        } else if (!canUpgrade && level > 0) {
            cells.push({ id: 'maxed', name: '床铺已达最高等级', state: 'disabled', type: 'list' });
        }

        // （返回由底栏「主页」按钮提供，不重复添加 cell）

        return {
            title: '床铺',
            breadcrumb: '主页 > 床铺',
            columns: 1,
            cells,
            onCellClick: (idx, cell) => {
                if (cell.id === 'sleep') {
                    // 睡觉：按床铺等级定量恢复，推进时间
                    const d = cell.data as any;
                    const rp = d.restPs || 15;
                    const rs = d.restSan || 10;
                    const rh = d.restHours || 1;
                    const oldPs = this.gm.playerState.ps;
                    const oldSan = this.gm.playerState.san;
                    // 增量加法，上限100
                    this.gm.playerStateChange({
                        ps: Math.min(oldPs + rp, 100),
                        san: Math.min(oldSan + rs, 100),
                    });
                    this.timeSys.advance(rh);
                    const actualPs = Math.min(rp, 100 - oldPs);
                    const actualSan = Math.min(rs, 100 - oldSan);
                    this.setMsg(`你在${currentLevelName}上睡了一觉，恢复了 ${actualPs} 点体力和 ${actualSan} 点精神`);
                    this.navigator.replace(this.openRestPage());
                    this.eventBus.emit(GameEvents.UI_REFRESH);
                } else if (cell.data?.action === 'upgrade') {
                    const r = ActionBuilding.instance.upgrade('sleepPlaceUpdate', cell.data.targetId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.openRestPage());
                }
            },
        };
    }
}
