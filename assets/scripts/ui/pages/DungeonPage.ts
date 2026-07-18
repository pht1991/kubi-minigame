/**
 * DungeonPage.ts - 地牢域页面模块
 *
 * 从 MainScene 抽离：楼层选择网格 + 增强探索 + 楼层详情/总览 + 地牢商人。
 * 入口 openDungeonGrid 被 MainScene（onHomeCellClick）委托调用。
 * 战斗经 this.battlePanel.startBattle 启动（替代原 MainScene.triggerBattle 桥接）。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionDungeon } from '../../actions/ActionDungeon';
import { ActionTrade } from '../../actions/ActionTrade';
import { TRADE_DATA, ITEM_DATA } from '../../data/data';
import { DialogOption } from '../DialogPanel';

export class DungeonPage extends BasePage {
    /** 公开入口：打开地牢网格 */
    public openDungeonGrid(): void {
        this.navigator.push(this.buildDungeonPage());
    }

    private buildDungeonPage(): GridPage {
        const ds = this.gm.dungeonSaveData;
        const entered = !!(ds && ds.stairCount);
        const maxFloor = ActionDungeon.instance.getMaxFloor();
        const cells: GridCellData[] = [];


        if (!entered) {
            cells.push({ id: 'enter', name: '进入地牢', state: 'normal' });
        } else {
            // 操作按钮
            cells.push({ id: 'explore', name: '探索房间', state: 'normal' });
            cells.push({ id: 'descend', name: '下层', state: 'normal' });
            cells.push({ id: 'leave', name: '离开地牢', state: 'normal' });

            // 进度信息
            cells.push({ id: 'info1', name: `当前层数: ${ds.stairCount} · 房间: ${ds.roomCount}`, state: 'disabled' });
            cells.push({ id: 'info2', name: `最深: ${ds.deepest}`, state: 'disabled' });
            cells.push({ id: 'info3', name: '⚠ 房间可能遇前缀怪物/陷阱', state: 'disabled' });

            // 楼层总览（弹窗，不再嵌入网格）
            cells.push({ id: 'floors', name: '查看楼层总览', state: 'normal' });
        }

        return {
            title: '地牢',
            breadcrumb: '地牢',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'enter') {
                    const r = ActionDungeon.instance.enter();
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildDungeonPage());
                    return;
                }
                if (cell.id === 'explore') {
                    this.doDungeonExplore();
                    return;
                }
                if (cell.id === 'descend') {
                    const r = ActionDungeon.instance.descend();
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildDungeonPage());
                    return;
                }
                if (cell.id === 'leave') {
                    this.gm.dungeonSaveData = {};
                    this.setMsg('已离开地牢');
                    this.navigator.replace(this.buildDungeonPage());
                    return;
                }
                // 点击楼层总览 → 弹出楼层选择弹窗
                if (cell.id === 'floors') {
                    this.showFloorOverview();
                    return;
                }
            },
        };
    }

    /** 执行地牢探索（增强版：战斗/宝箱/商人/空房间） */
    private doDungeonExplore(): void {
        const probe = ActionDungeon.instance.probeExploreEnhanced();
        switch (probe.type) {
            case 'battle':
                if (probe.mstId) {
                    this.setMsg(`遭遇了 ${probe.mstName}！`);
                    this.navigator.replace(this.buildDungeonPage());
                    this.battlePanel.startBattle(probe.mstId, probe.prefix);
                }
                break;
            case 'treasure':
                this.setMsg(`发现宝箱：${probe.reward}`);
                this.navigator.replace(this.buildDungeonPage());
                break;
            case 'trap':
                this.setMsg(probe.reward || '踩中陷阱！');
                this.navigator.replace(this.buildDungeonPage());
                break;
            case 'merchant':
                this.setMsg('遇到了地牢商人！');
                this.navigator.replace(this.buildDungeonPage());
                this.showDungeonMerchant();
                break;
            default:
                this.setMsg('这个房间空空如也');
                this.navigator.replace(this.buildDungeonPage());
                break;
        }
    }

    /** 显示楼层详情弹窗 */
    private showFloorDetail(floor: number): void {
        const info = ActionDungeon.instance.getFloorInfo(floor);
        const ds = this.gm.dungeonSaveData;
        const isCurrent = ds?.stairCount === floor;
        const isReached = floor <= (ds?.deepest || 0);
        const descParts: string[] = [];
        descParts.push(`第 ${floor} 层`);
        if (isCurrent) descParts.push('【当前层】');
        else if (isReached) descParts.push('【已探索】');
        else descParts.push('【未到达】');
        if (info.mstNames.length > 0) {
            descParts.push(`怪物: ${info.mstNames.join('、')}`);
        }
        descParts.push(info.hasReward ? '有宝箱奖励' : '无宝箱奖励');

        const infoOptions: DialogOption[] = descParts.map(text => ({
            label: text,
            data: null,
            disabled: true,
        }));
        infoOptions.push({ label: '返回', data: { action: 'close' } });
        this.dialogPanel?.show(`${floor}F 详情`, infoOptions, () => {}, () => {});
    }

    /** 楼层总览弹窗（所有楼层一览，点击查看详情） */
    private showFloorOverview(): void {
        const ds = this.gm.dungeonSaveData;
        const maxFloor = ActionDungeon.instance.getMaxFloor();
        const options: DialogOption[] = [];

        for (let f = 1; f <= maxFloor; f++) {
            const info = ActionDungeon.instance.getFloorInfo(f);
            const isCurrent = f === ds?.stairCount;
            const isReached = f <= (ds?.deepest || 0);
            const mstPreview = info.mstNames.length > 0
                ? info.mstNames.slice(0, 2).join('/') + (info.mstNames.length > 2 ? '…' : '')
                : '无';
            const label = isCurrent
                ? `▶ ${f}F [${mstPreview}] ★当前`
                : isReached
                    ? `  ${f}F [${mstPreview}]`
                    : `  ${f}F ???`;
            options.push({
                label,
                data: { floor: f },
                disabled: !isReached && !isCurrent,
            });
        }
        options.push({ label: '─────', data: null, disabled: true });
        options.push({ label: '关闭', data: { action: 'close' } });

        this.dialogPanel?.show(
            `楼层总览 (最深 ${ds?.deepest || 0}F)`,
            options,
            (data) => {
                if (data.floor != null) {
                    this.showFloorDetail(data.floor);
                }
            },
            () => {}
        );
    }

    /** 显示地牢商人交易弹窗 */
    private showDungeonMerchant(): void {
        const merchantIds = ActionDungeon.instance.getDungeonMerchants();
        const gold = this.gm.boxSaveData['bag']?.['gold'] || 0;
        const options: DialogOption[] = merchantIds.map(id => {
            const trade = TRADE_DATA[id];
            const price = ActionTrade.instance.getPrice(trade.give);
            const giveName = ITEM_DATA[trade.give]?.name || trade.give;
            return {
                label: `${trade.name}：${giveName} ×1 (${price}金)`,
                data: { action: 'open', traderId: id },
                disabled: false,
            };
        });
        options.push({ label: '离开商人', data: { action: 'leave' } });

        this.dialogPanel?.show(
            `地牢商人 (持有 ${gold} 金)`,
            options,
            (data) => {
                if (data.action === 'open') {
                    // 用统一交易面板打开该商人（金币不足可在面板内易货）
                    this.tradePanel?.show(data.traderId, (msg) => { this.setMsg(msg); });
                }
            },
            () => {}
        );
    }
}
