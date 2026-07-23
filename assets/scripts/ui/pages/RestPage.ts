/**
 * RestPage.ts - 休息/床铺域页面模块
 *
 * 从 MainScene 抽离：床铺详情页（等级显示 + 睡觉恢复 + 升级）。
 * 入口 openRestPage 返回 GridPage，由 MainScene（facilityRoutes home_sleep）push 打开；
 * 未建床铺时点击「前往建造」经 ctx.buildPage 跳转到建造列表。
 *
 * 睡觉为「耗时功能」：
 *   - 开始前用公共数量选择（QuantityPanel）选睡觉时长（1~8 小时）；
 *   - 确认后走 ActionExecutor.execute（timeNeed=小时），弹进度条，动画结束才推进时间 + 恢复状态；
 *   - 恢复量 = 床铺等级对应的「每小时恢复速率 × 选定小时」（随设定时间倍数增长，封顶 MAX_STATE）。
 */

import { Node } from 'cc';
import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { BUILDING_UPDATE_DATA, ITEM_DATA, MAX_STATE } from '../../data/data';
import { ActionExecutor } from '../../actions/ActionExecutor';
import { QuantityPanel } from '../QuantityPanel';

/**
 * 睡觉恢复速率表（模块级常量，供 openRestPage / openSleepDurationPicker / doSleep 共用）：
 * [每小时体力恢复, 每小时精神恢复]。1 小时恢复量与旧版一致，时长越长按倍数增长。
 */
const REST_TABLE_REF: [number, number][] = [
    [15, 10],   // Lv0 地板
    [25, 18],   // Lv1 木床
    [35, 25],   // Lv2 弹簧床
    [50, 35],   // Lv3 大床
    [70, 50],   // Lv4 满级床（bed_4）
];

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
        const currentLevelName = this.levelName(level);

        const cells: GridCellData[] = [];

        // ── 顶行：当前等级 ──
        cells.push({ id: 'levelInfo', name: `当前床铺等级：${currentLevelName}`, state: 'disabled', type: 'list' });

        // ── 睡觉操作（恢复速率按等级递增，实际恢复量随选定小时倍数增长） ──
        // 等级恢复速率表（模块级 REST_TABLE_REF）：[每小时体力, 每小时精神]
        const restIdx = Math.min(level, REST_TABLE_REF.length - 1);
        const [psPerH, sanPerH] = REST_TABLE_REF[restIdx];
        // 升级后（下一级）每小时恢复量，用于升级弹窗的效果描述
        const nextRestIdx = Math.min(level + 1, REST_TABLE_REF.length - 1);
        const [nextPsPerH, nextSanPerH] = REST_TABLE_REF[nextRestIdx];
        cells.push({
            id: 'sleep',
            name: `[睡觉]  每小时约恢复 体力+${psPerH} 精神+${sanPerH}（可选 1~8 小时）`,
            state: 'normal',
            type: 'list',
            noTruncate: true,
            data: { psPerH, sanPerH },
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
                effectText: `升级后每小时恢复 体力+${nextPsPerH} / 精神+${nextSanPerH}`,
                onUpgraded: () => this.navigator.replace(this.openRestPage()),
            }),
            onCellClick: (idx, cell) => {
                if (cell.id === 'sleep') {
                    // 睡觉：先选时长（1~8 小时），再走进度条耗时恢复
                    this.openSleepDurationPicker();
                }
            },
        };
    }

    /** 当前床铺等级名（Lv0=地板，逐级取升级物品名，满级=已满级） */
    private levelName(level: number): string {
        const updateGroup = BUILDING_UPDATE_DATA['sleepPlaceUpdate'];
        const levelKeys = updateGroup ? Object.keys(updateGroup) : [];
        return level >= levelKeys.length ? '已满级' :
            (level === 0 ? '地板' : ITEM_DATA[levelKeys[level - 1]]?.name || `Lv.${level}`);
    }

    /** 打开睡觉时长的公共数量选择（1~8 小时），确认后执行睡觉 */
    private openSleepDurationPicker(): void {
        const level = this.gm.getBuildingLevel('sleepPlaceUpdate');
        const restIdx = Math.min(level, REST_TABLE_REF.length - 1);
        const [psPerH, sanPerH] = REST_TABLE_REF[restIdx];
        const panel = this.ensureQtyPanel();
        panel.show(
            '选择睡觉时长',
            8,
            (hours) => this.doSleep(hours),
            {
                infoLines: [
                    `床铺：${this.levelName(level)}`,
                    `每小时约恢复 体力+${psPerH} / 精神+${sanPerH}`,
                ],
                confirmLabel: '开始睡觉',
                getPreview: (h: number) => {
                    const tPs = Math.round(psPerH * h);
                    const tSan = Math.round(sanPerH * h);
                    return [
                        `睡觉 ${h} 小时`,
                        `预计恢复 体力+${tPs} / 精神+${tSan}`,
                    ];
                },
            }
        );
    }

    /** 执行睡觉（耗时功能：进度条 + 恢复随小时倍数增长） */
    private doSleep(hours: number): void {
        const safeHours = Math.max(1, Math.min(8, Math.floor(hours)));
        const level = this.gm.getBuildingLevel('sleepPlaceUpdate');
        const restIdx = Math.min(level, REST_TABLE_REF.length - 1);
        const [psPerH, sanPerH] = REST_TABLE_REF[restIdx];

        const oldPs = this.gm.playerState.ps;
        const oldSan = this.gm.playerState.san;
        const totalPs = Math.round(psPerH * safeHours);
        const totalSan = Math.round(sanPerH * safeHours);
        // 实际恢复（封顶 MAX_STATE）仅用于反馈文案；ActionExecutor 内部同样封顶
        const actualPs = Math.max(0, Math.min(totalPs, MAX_STATE - oldPs));
        const actualSan = Math.max(0, Math.min(totalSan, MAX_STATE - oldSan));

        const msg = `你睡了${safeHours}小时（${this.levelName(level)}），恢复 体力+${actualPs} / 精神+${actualSan}`;

        // 耗时动作：进度条播放真实时长，结束才推进时间 + 恢复；完成后刷新本页
        ActionExecutor.instance.execute(
            { ps: totalPs, san: totalSan },
            {},
            safeHours,
            {
                title: '睡觉',
                successMessage: msg,
                onDone: () => this.navigator.replace(this.openRestPage()),
            }
        );
    }

    /** 懒创建数量选择弹窗（挂在 modalLayer，盖住底栏/内容） */
    private ensureQtyPanel(): QuantityPanel {
        if (!this._qtyPanel) {
            const node = new Node('RestQtyPanel');
            this.ctx.modalLayer!.addChild(node);
            this._qtyPanel = node.addComponent(QuantityPanel);
        }
        return this._qtyPanel;
    }
    private _qtyPanel: QuantityPanel | null = null;
}
