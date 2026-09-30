import { t } from '../../i18n';
/**
 * EventPage.ts - 事件域页面模块
 *
 * 从 MainScene 抽离：事件总览网格 + 事件详情（通过 EventDetailPanel 弹窗）。
 * 入口 openQuestGrid 被 MainScene（onHomeCellClick）委托调用。
 * 事件详情走专用 NPC 对话面板（EventDetailPanel），不再用 GridCell 网格。
 *
 * 本页持有 gm / dialogPanel（继承自 BasePage），负责计算事件状态并把数据
 * 喂给面板；面板是纯视图，交谈 / 触发的实际逻辑落在本页。
 */

import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { PageContext } from './PageContext';
import { EVENT_DATA } from '../../data/data';
import { ActionEvent } from '../../actions/ActionEvent';
import { DialogOption } from '../../ui/DialogPanel';
import { GameEvents } from '../../core/EventBus';

export class EventPage extends BasePage {
    /** EVENT_BATTLE_REQUEST 订阅处理器（保存引用，便于必要时 off） */
    private _onEventBattleReq: (mstId: string) => void;

    constructor(ctx: PageContext) {
        super(ctx);
        // 订阅事件战斗请求：ActionEvent 遇 mst 时发出，本页打开交互式 BattlePanel
        this._onEventBattleReq = (mstId: string) => this.openEventBattle(mstId);
        this.eventBus.on(GameEvents.EVENT_BATTLE_REQUEST, this._onEventBattleReq);
    }

    /**
     * 事件触发遇怪时打开交互式战斗面板（与地图/地牢同规则：可放技能/选防御·敏捷/逃跑/用道具）。
     * 事件无 amount 概念，无需 onWin 扣减；onEnd 仅刷新 UI，不二次发放奖励
     * （事件奖励已在 ActionEvent.trigger 的 onDone 内先行结算落档）。
     */
    private openEventBattle(mstId: string): void {
        this.battlePanel.onEnd = () => this.eventBus.emit(GameEvents.UI_REFRESH);
        this.battlePanel.startBattle(mstId);
    }

    /** 公开入口：打开事件总览网格 */
    public openQuestGrid(): void {
        this.navigator.push(this.buildQuestPage());
    }

    /** 构建事件总览网格（openQuestGrid / 触发后刷新共用） */
    private buildQuestPage(): GridPage {
        const cells: GridCellData[] = Object.keys(EVENT_DATA)
            .filter(id => {
                if (this.gm.eventSaveData[id]?.experienced) return false; // 已完成则隐藏
                // 若该事件是某「未完成任务」的连锁下一事件（前置事件未完成），则暂隐藏，待前置完成才解锁
                const lockedByPrev = Object.keys(EVENT_DATA).some(prevId => {
                    const prev = (EVENT_DATA as any)[prevId];
                    return prev && prev.event === id && !this.gm.eventSaveData[prevId]?.experienced;
                });
                return !lockedByPrev;
            })
            .map(id => ({
                id,
                name: EVENT_DATA[id].name,
                state: 'normal',
                data: id,
            }));
        if (cells.length === 0) cells.push({ id: 'none', name: t('暂无可触发事件'), state: 'disabled' });

        return {
            title: t('事件'),
            breadcrumb: t('事件'),
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openEventDetail(cell.id),
        };
    }

    /** 打开事件详情：弹出专用 NPC 对话面板（主页「事件」入口与地图地点事件共用） */
    public openEventDetail(eventId: string): void {
        const data = EVENT_DATA[eventId];
        if (!data) return;
        const dialogInfo = ActionEvent.instance.getDialogInfo(eventId);
        if (!dialogInfo) return;

        const want = data.want || {};
        const reward = data.get;
        const dialogs = dialogInfo.dialogBefore.length > 0
            ? dialogInfo.dialogBefore
            : (data.desc ? [data.desc] : []);

        this.ctx.eventDetailPanel?.showDetail({
            title: data.name,
            dialogs,
            dialogAfter: dialogInfo.dialogAfter,
            want,
            reward,
            experienced: dialogInfo.experienced,
            canTrigger: dialogInfo.canTrigger,
            onTalk: () => this.showEventTalkDialog(eventId, dialogInfo),
            onTrigger: () => this.doEventTrigger(eventId, dialogInfo),
            onClose: () => {
                // 关闭详情时刷新事件列表（若当前仍在事件网格）
                const cur = this.navigator.current;
                if (cur && cur.title === t('事件')) this.navigator.replace(this.buildQuestPage());
            },
        });
    }

    /** 显示 NPC 对话（交谈）弹窗 */
    private showEventTalkDialog(eventId: string, dialogInfo: ReturnType<ActionEvent['getDialogInfo']>): void {
        if (!dialogInfo) return;
        const data = EVENT_DATA[eventId];
        const talkTexts = dialogInfo.dialogBefore.length > 0
            ? dialogInfo.dialogBefore
            : (data?.desc ? [data.desc] : []);
        const options: DialogOption[] = [];
        // 需求 / 奖励摘要（让玩家在对话里明确知道要交付什么、将获得什么）
        if (dialogInfo.wantStr && dialogInfo.wantStr !== t('无')) {
            options.push({ label: `${t('需求：')}${dialogInfo.wantStr}`, data: null, disabled: true });
        }
        if (dialogInfo.getStr && dialogInfo.getStr !== t('无')) {
            options.push({ label: `${t('奖励：')}${dialogInfo.getStr}`, data: null, disabled: true });
        }
        // 对话文本
        talkTexts.forEach(text => {
            options.push({ label: text, data: null, disabled: true });
        });
        if (!dialogInfo.experienced && dialogInfo.canTrigger) {
            options.push({ label: t('→ 交付并触发'), data: { action: 'trigger' } });
        }
        if (dialogInfo.experienced && dialogInfo.dialogAfter.length > 0) {
            dialogInfo.dialogAfter.forEach(text => {
                options.push({ label: text, data: null, disabled: true });
            });
        }
        options.push({ label: t('关闭'), data: { action: 'close' } });

        this.dialogPanel?.show(
            data?.name || t('事件'),
            options,
            (d) => {
                if (d?.action === 'trigger' && !dialogInfo.experienced) {
                    this.doEventTrigger(eventId, dialogInfo);
                }
            },
            () => {}
        );
    }

    /** 执行事件触发：扣需求 → 发奖 → 提示 → 展示后续对话 */
    private doEventTrigger(eventId: string, dialogInfo: ReturnType<ActionEvent['getDialogInfo']>): void {
        const r = ActionEvent.instance.trigger(eventId);
        this.setMsg(r.message);
        // 触发后立即刷新底层事件列表（已触发事件移出），无论详情面板是否仍开
        const cur = this.navigator.current;
        if (cur && cur.title === t('事件')) this.navigator.replace(this.buildQuestPage());
        this.eventBus.emit(GameEvents.UI_REFRESH);
        // 触发后展示 d_2 后续对话
        if (dialogInfo?.dialogAfter.length > 0) {
            this.showEventAfterDialog(eventId, dialogInfo.dialogAfter);
        }
    }

    /** 显示完成后对话 */
    private showEventAfterDialog(eventId: string, dialogAfter: string[]): void {
        const data = EVENT_DATA[eventId];
        const options: DialogOption[] = dialogAfter.map(text => ({
            label: text,
            data: null,
            disabled: true,
        }));
        options.push({ label: t('继续'), data: { action: 'close' } });
        this.dialogPanel?.show(
            `${data?.name || t('事件')}${t(' - 完成')}`,
            options,
            () => {},
            () => {}
        );
    }
}
