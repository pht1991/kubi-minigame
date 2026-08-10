/**
 * DungeonPage.ts - 地牢域页面模块
 *
 * 从 MainScene 抽离：楼层选择网格 + 探索(search/sneak)/下楼(耗钥匙)/绳索穿洞 + 房间结算 + 地牢商人 + 楼层总览。
 * 战斗经 this.battlePanel.startBattle 启动（替代原 MainScene.triggerBattle 桥接），
 * 战斗胜利后由 onEnd 串接房间结算（对齐原版"先战斗后生成房间"）。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionDungeon, DungeonRoom } from '../../actions/ActionDungeon';
import { TRADE_DATA, ITEM_DATA, MST_DATA, PREFIX_DATA, MAX_DISCOVER } from '../../data/data';
import { DialogOption } from '../DialogPanel';
import { TimeSystem } from '../../systems/TimeSystem';

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
            const stair = ds.stairCount;
            const deepest = ds.deepest;
            const hasRope = (this.gm.boxSaveData['bag']?.['dungeonRope'] || 0) > 0;
            const keys = this.gm.boxSaveData['bag']?.['dungeonKey'] || 0;

            // 行动按钮
            cells.push({ id: 'search', name: '探索', state: 'normal' });
            cells.push({ id: 'sneak', name: '潜行', state: 'normal' });
            cells.push({ id: 'descend', name: `下楼(钥匙×${keys})`, state: keys > 0 ? 'normal' : 'disabled' });
            if (hasRope && stair < deepest - 1) {
                cells.push({ id: 'rope', name: '绳索穿洞', state: 'normal' });
            }
            cells.push({ id: 'leave', name: '离开地牢', state: 'normal' });

            // 进度信息
            const disc = Math.round(((ds.stairData?.[stair] || 0) / MAX_DISCOVER) * 100);
            cells.push({ id: 'info1', name: `当前层数: ${stair} · 房间: ${ds.roomCount}`, state: 'disabled' });
            cells.push({ id: 'info2', name: `最深: ${deepest} · 探索度: ${disc}%`, state: 'disabled' });
            cells.push({ id: 'info3', name: '⚠ 探索越透越安全，但奖励越少', state: 'disabled' });

            // 楼层总览（弹窗，不再嵌入网格）
            cells.push({ id: 'floors', name: '查看楼层总览', state: 'normal' });
        }

        return {
            title: '地牢',
            breadcrumb: '地牢',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                switch (cell.id) {
                    case 'enter': {
                        const r = ActionDungeon.instance.enter();
                        this.setMsg(r.message);
                        this.navigator.replace(this.buildDungeonPage());
                        return;
                    }
                    case 'search': this.doExplore('search'); return;
                    case 'sneak': this.doExplore('sneak'); return;
                    case 'descend': this.doDescend(); return;
                    case 'rope': this.showRope(); return;
                    case 'leave': this.leaveDungeon(); return;
                    case 'floors': this.showFloorOverview(); return;
                }
            },
        };
    }

    /** 探索一步（search/sneak）：消耗 2h → 判定战斗/房间，战斗胜利后结算房间 */
    private doExplore(choice: 'search' | 'sneak'): void {
        TimeSystem.instance.advance(2);   // 对齐原版 stepTime=2
        const r = ActionDungeon.instance.explore(choice);
        const finish = () => {
            const room = ActionDungeon.instance.resolveRoom(r.roomType);
            this.showRoom(room);
            this.battlePanel.onEnd = null;
        };
        if (r.battle && r.battle.mstId) {
            this.setMsg(`遭遇了 ${this.mstDisplayName(r.battle.mstId, r.battle.prefix)}！`);
            this.battlePanel.onEnd = (win: boolean) => {
                if (win) ActionDungeon.instance.discoverInc(1);
                finish();
            };
            this.battlePanel.startBattle(r.battle.mstId, r.battle.prefix);
        } else {
            finish();
        }
    }

    /** 下楼：消耗 2h（对齐原版 useTime(timeNeed)） */
    private doDescend(): void {
        const r = ActionDungeon.instance.descend();
        if (!r.success) { this.setMsg(r.message); this.navigator.replace(this.buildDungeonPage()); return; }
        TimeSystem.instance.advance(2);
        this.setMsg(r.message);
        this.navigator.replace(this.buildDungeonPage());
    }

    /** 绳索穿洞：选择目标层 → 消耗绳索 + 穿越 + 时间推进（对齐原版 handleRopeGo） */
    private showRope(): void {
        const ds = this.gm.dungeonSaveData;
        const deepest = ds?.deepest || 1;
        const cur = ds?.stairCount || 1;
        const options: DialogOption[] = [];
        for (let f = cur + 1; f < deepest; f++) {
            options.push({ label: `第 ${f} 层`, data: f });
        }
        if (options.length === 0) {
            this.setMsg('绳索无法在当前位置使用（需已探索更深层的记录）');
            this.navigator.replace(this.buildDungeonPage());
            return;
        }
        options.push({ label: '取消', data: 'cancel' });
        this.dialogPanel?.show(`绳索穿洞（可去 ${cur + 1}~${deepest - 1} 层）`, options, (data) => {
            if (typeof data === 'number') {
                const rr = ActionDungeon.instance.ropeGo(data);
                if (!rr.success) { this.setMsg(rr.message); this.navigator.replace(this.buildDungeonPage()); return; }
                const time = ActionDungeon.instance.ropeTime(data, cur);
                TimeSystem.instance.advance(time);
                this.setMsg(`${rr.message}（耗时 ${time} 小时）`);
            }
            this.navigator.replace(this.buildDungeonPage());
        });
    }

    /** 离开地牢（清空进度，回到入口页） */
    private leaveDungeon(): void {
        this.gm.dungeonSaveData = {};
        this.setMsg('已离开地牢');
        this.navigator.replace(this.buildDungeonPage());
    }

    /** 展示房间结算结果 */
    private showRoom(room: DungeonRoom): void {
        switch (room.type) {
            case 'reward':
                this.setMsg(`发现宝箱：${this.rewardNames(room.reward)}`);
                break;
            case 'getKey':
                this.setMsg('你发现了一把地牢钥匙。');
                break;
            case 'useKey':
                this.showUseKey();
                return;   // 等待玩家二次确认，不立即 rebuild
            case 'trap': {
                const iname = ITEM_DATA[room.item || '']?.name || room.item || '';
                if (room.damaged) this.setMsg(`踩到陷阱！受到 ${room.damage} 点伤害，捡到 ${iname}×${room.amount}`);
                else this.setMsg(`发现 ${iname}×${room.amount}（未触发陷阱）`);
                break;
            }
            case 'seller':
                this.showDungeonMerchant();
                return;
            case 'home':
                this.showHome();
                return;
            default:
                this.setMsg('这个房间空空如也');
                break;
        }
        this.navigator.replace(this.buildDungeonPage());
    }

    /** 上锁宝箱：用钥匙开（双倍奖励，对齐原版 useKey 房） */
    private showUseKey(): void {
        const keys = this.gm.boxSaveData['bag']?.['dungeonKey'] || 0;
        if (keys <= 0) {
            this.setMsg('没有地牢钥匙，无法开启宝箱');
            this.navigator.replace(this.buildDungeonPage());
            return;
        }
        const options: DialogOption[] = [
            { label: `使用钥匙开宝箱（剩 ${keys} 把）`, data: 'use' },
            { label: '放弃', data: 'cancel' },
        ];
        this.dialogPanel?.show('上锁的宝箱', options, (data) => {
            if (data === 'use') {
                const room = ActionDungeon.instance.useKeyChest();
                this.setMsg(`用钥匙打开了宝箱：${this.rewardNames(room.reward)}`);
            } else {
                this.setMsg('你放弃了宝箱');
            }
            this.navigator.replace(this.buildDungeonPage());
        });
    }

    /** 传送装置房间：回家（退出地牢）或继续探索（对齐原版 home 房） */
    private showHome(): void {
        const options: DialogOption[] = [
            { label: '使用传送装置回家', data: 'home' },
            { label: '继续探索', data: 'stay' },
        ];
        this.dialogPanel?.show('古老的传送装置', options, (data) => {
            if (data === 'home') this.leaveDungeon();
            else this.navigator.replace(this.buildDungeonPage());
        });
    }

    private rewardNames(reward?: Record<string, number>): string {
        if (!reward || Object.keys(reward).length === 0) return '（一无所有）';
        return Object.keys(reward).map(k => `${ITEM_DATA[k]?.name || k}×${reward[k]}`).join(' ');
    }

    private mstDisplayName(mstId: string, prefix?: Record<string, boolean>): string {
        const mst = MST_DATA[mstId];
        let pname = '';
        if (prefix) for (const k in prefix) if (prefix[k]) pname += (PREFIX_DATA as any)[k]?.name || '';
        return `${pname}${mst?.name || mstId}`;
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
            const giveName = ITEM_DATA[trade.give]?.name || trade.give;
            const max = trade.max || 1;
            return {
                label: `${trade.name}：${giveName} ×${max}`,
                data: { action: 'open', traderId: id },
                disabled: false,
            };
        });
        options.push({ label: '离开商人', data: { action: 'leave' } });

        this.dialogPanel?.show(
            `地牢商人 (持有 金子×${gold})`,
            options,
            (data) => {
                if (data.action === 'open') {
                    // 用统一交易面板打开该商人（资源不足可在面板内易货）
                    this.tradePanel?.show(data.traderId, (msg) => { this.setMsg(msg); });
                }
            },
            () => {}
        );
    }
}
