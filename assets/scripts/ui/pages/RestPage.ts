/**
 * RestPage.ts - 休息/床铺域页面模块
 *
 * 从 MainScene 抽离：床铺详情页（等级显示 + 睡觉恢复 + 升级）。
 * 入口 openRestPage 返回 GridPage，由 MainScene（facilityRoutes home_sleep）push 打开；
 * 未建床铺时点击「前往建造」经 ctx.buildPage 跳转到建造列表。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
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
        // 注意：升级系统写入的等级键是 "sleepPlaceUpdate_level"（与 BUILDING_UPDATE_DATA 键一致），
        // 不能用 getBuildingLevel('sleepPlace')（该键从未写入，会恒为 0）。
        const level = this.gm.getBuildingLevel('sleepPlaceUpdate');
        const updateGroup = BUILDING_UPDATE_DATA['sleepPlaceUpdate'];
        // 等级键顺序：bed_1(0), bed_2(1), bed_3(2), bed_4(3)
        const levelKeys = updateGroup ? Object.keys(updateGroup) : [];
        const currentLevelName = level >= levelKeys.length ? '已满级' :
            (level === 0 ? '地板' : ITEM_DATA[levelKeys[level - 1]]?.name || `Lv.${level}`);

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
            [70, 50, 1],  // Lv4 满级床（bed_4）
        ];
        const restIdx = Math.min(level, REST_TABLE.length - 1);
        const [restPs, restSan, restHours] = REST_TABLE[restIdx];
        // 升级后（下一级）每觉恢复量，用于升级弹窗的效果描述
        const nextRestIdx = Math.min(level + 1, REST_TABLE.length - 1);
        const [nextRestPs, nextRestSan] = REST_TABLE[nextRestIdx];
        cells.push({
            id: 'sleep',
            name: `[睡觉]  恢复约 +${restPs}体力 +${restSan}精神  推进${restHours}小时`,
            state: 'normal',
            type: 'list',
            noTruncate: true,
            data: { restPs, restSan, restHours },
        });

        // （返回由底栏「主页」按钮提供，不重复添加 cell）

        return {
            title: '床铺',
            breadcrumb: '主页 > 床铺',
            columns: 1,
            cells,
            // 升级按钮走公共标题栏接口（与大箱子/厨房/井/卫生间统一），替代旧内联升级格
            ...this.makeUpgradeInfo('sleepPlaceUpdate', {
                title: '床铺升级',
                effectText: `升级后每觉恢复 体力+${nextRestPs} / 精神+${nextRestSan}`,
                onUpgraded: () => this.navigator.replace(this.openRestPage()),
            }),
            onCellClick: (idx, cell) => {
                if (cell.id === 'sleep') {
                    // 睡觉：按床铺等级定量恢复，推进时间
                    const d = cell.data as any;
                    const rp = d.restPs || 15;
                    const rs = d.restSan || 10;
                    const rh = d.restHours || 1;
                    const oldPs = this.gm.playerState.ps;
                    const oldSan = this.gm.playerState.san;
                    // 传差值：playerStateChange 内部累加并按 MAX_STATE 封顶
                    this.gm.playerStateChange({
                        ps: rp,
                        san: rs,
                    });
                    this.timeSys.advance(rh);
                    const actualPs = Math.min(rp, 100 - oldPs);
                    const actualSan = Math.min(rs, 100 - oldSan);
                    this.setMsg(`你在${currentLevelName}上睡了一觉，恢复了 ${actualPs} 点体力和 ${actualSan} 点精神`);
                    this.navigator.replace(this.openRestPage());
                    this.eventBus.emit(GameEvents.UI_REFRESH);
                }
            },
        };
    }
}
