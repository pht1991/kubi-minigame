/**
 * EventPage.ts - 事件域页面模块
 *
 * 从 MainScene 抽离：事件总览网格 + 事件详情（对话 + 触发）。
 * 入口 openQuestGrid 被 MainScene（onHomeCellClick）委托调用。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ActionEvent } from '../../actions/ActionEvent';
import { EVENT_DATA, ITEM_DATA } from '../../data/data';
import { DialogOption } from '../DialogPanel';

export class EventPage extends BasePage {
    /** 公开入口：打开事件总览网格 */
    public openQuestGrid(): void {
        const cells: GridCellData[] = Object.keys(EVENT_DATA)
            .filter(id => !this.gm.eventSaveData[id]?.experienced)
            .map(id => ({
                id,
                name: EVENT_DATA[id].name,
                state: 'normal',
                data: id,
            }));
        if (cells.length === 0) cells.push({ id: 'none', name: '暂无可触发事件', state: 'disabled' });

        this.navigator.push({
            title: '事件',
            breadcrumb: '事件',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openEventDetail(cell.id),
        });
    }

    /** 事件详情 + 对话弹窗 + 触发动作 */
    private openEventDetail(eventId: string): void {
        this.navigator.push(this.buildEventDetailPage(eventId));
    }

    private buildEventDetailPage(eventId: string): GridPage {
        const data = EVENT_DATA[eventId];
        const dialogInfo = ActionEvent.instance.getDialogInfo(eventId);
        const experienced = !!this.gm.eventSaveData[eventId]?.experienced;
        const want = data.want || {};
        const canTrigger = !experienced && this.gm.checkHaveResource(want);
        const wantStr = Object.keys(want).length > 0
            ? Object.entries(want).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const getStr = data.get
            ? Object.entries(data.get).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const cells: GridCellData[] = [];
        cells.push(
            { id: 'name', name: data.name, state: 'disabled' },
            { id: 'desc', name: data.desc || '', state: 'disabled' },
            { id: 'want', name: `需求: ${wantStr}`, state: 'disabled' },
            { id: 'get', name: `奖励: ${getStr}`, state: 'disabled' },
        );

        // 如果有 d_1 对话文本，先展示对话再触发；否则直接触发
        if (dialogInfo && dialogInfo.dialogBefore.length > 0) {
            cells.push({ id: 'talk', name: experienced ? '回顾对话' : '交谈', state: 'normal' });
        }
        cells.push({ id: 'trigger', name: experienced ? '已完成' : '触发', state: experienced ? 'disabled' : (canTrigger ? 'normal' : 'disabled') });

        return {
            title: data.name,
            breadcrumb: data.name,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'talk' && dialogInfo) {
                    // 显示对话弹窗
                    const dialogOptions: DialogOption[] = dialogInfo.dialogBefore.map(text => ({
                        label: text,
                        data: null,
                        disabled: true,
                    }));
                    if (!experienced && canTrigger) {
                        dialogOptions.push({ label: '→ 交付并触发', data: { action: 'trigger' } });
                    }
                    if (experienced && dialogInfo.dialogAfter.length > 0) {
                        dialogInfo.dialogAfter.forEach(text => {
                            dialogOptions.push({ label: text, data: null, disabled: true });
                        });
                    }
                    dialogOptions.push({ label: '关闭', data: { action: 'close' } });
                    this.dialogPanel?.show(
                        `${data.name}`,
                        dialogOptions,
                        (d) => {
                            if (d?.action === 'trigger' && !experienced) {
                                const r = ActionEvent.instance.trigger(eventId);
                                this.setMsg(r.message);
                                this.navigator.replace(this.buildEventDetailPage(eventId));
                                // 触发后显示 d_2 对话
                                if (dialogInfo.dialogAfter.length > 0) {
                                    this.showEventAfterDialog(eventId, dialogInfo.dialogAfter);
                                }
                            }
                        },
                        () => {}
                    );
                } else if (cell.id === 'trigger' && !experienced) {
                    const r = ActionEvent.instance.trigger(eventId);
                    this.setMsg(r.message);
                    this.navigator.replace(this.buildEventDetailPage(eventId));
                    // 触发后显示 d_2 对话
                    if (dialogInfo && dialogInfo.dialogAfter.length > 0) {
                        this.showEventAfterDialog(eventId, dialogInfo.dialogAfter);
                    }
                }
            },
        };
    }

    /** 显示事件完成后的对话 */
    private showEventAfterDialog(eventId: string, dialogAfter: string[]): void {
        const options: DialogOption[] = dialogAfter.map(text => ({
            label: text,
            data: null,
            disabled: true,
        }));
        options.push({ label: '继续', data: { action: 'close' } });
        this.dialogPanel?.show(
            `${EVENT_DATA[eventId]?.name || '事件'} - 完成`,
            options,
            () => {},
            () => {}
        );
    }
}
