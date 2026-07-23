/**
 * EventDetailPanel.ts - NPC 事件详情面板（专用对话界面）
 *
 * 继承 ModalPanel，用 Graphics + Label 手绘完整的 NPC 对话界面：
 *   - 标题栏显示 NPC 名
 *   - 对话气泡区（带圆角浅底，展示 d_1 / desc）
 *   - 需求 / 奖励信息行
 *   - 底部操作按钮（交谈 / 触发）
 *
 * 完全脱离 GridCell 网格，作为模态弹窗覆盖在页面上方。
 */

import { _decorator, Color, Label, Node, UITransform } from 'cc';
import { ModalPanel } from './ModalPanel';
import { C, S, BtnStyle } from './theme';
import { DialogOption } from './DialogPanel';
import { ActionEvent } from '../actions/ActionEvent';
import { EVENT_DATA, ITEM_DATA } from '../data/data';

const { ccclass } = _decorator;

/** 对话气泡样式 */
const DIALOG_BG = new Color(250, 245, 235, 255);
const DIALOG_BORDER = new Color(220, 200, 170, 180);
const DIALOG_TEXT = new Color(60, 45, 30, 255);
const LABEL_BG = new Color(240, 234, 222, 255);
const LABEL_TEXT = new Color(100, 80, 60, 255);

/** 按钮预设 */
const TALK_STYLE: BtnStyle = { bg: C.tabOn, border: C.btnBorder, borderW: 2, text: C.body, radius: S.btnRadius, fontSize: 22 };
const TRIGGER_STYLE: BtnStyle = { bg: C.accent, border: C.btnBorder, borderW: 2, text: C.white, radius: S.btnRadius, fontSize: 22 };
const DISABLED_STYLE: BtnStyle = { bg: C.disabled, border: new Color(170, 165, 158), borderW: 2, text: new Color(140, 135, 130), radius: S.btnRadius, fontSize: 22 };

export interface EventDetailParams {
    eventId: string;
    onTrigger?: () => void;
    onClose?: () => void;
}

@ccclass('EventDetailPanel')
export class EventDetailPanel extends ModalPanel {

    protected panelW = 620;
    protected panelH = 560;       // 默认高度，render 时自适应
    protected showMask = true;
    protected maskClose = false;   // 不允许点遮罩关闭（必须点按钮）
    protected showClose = true;

    private _params: EventDetailParams | null = null;
    private _eventId = '';
    private _experienced = false;
    private _canTrigger = false;

    /** 显示事件详情面板 */
    public showDetail(params: EventDetailParams): void {
        this._params = params;
        this._eventId = params.eventId;
        const data = EVENT_DATA[this._eventId];
        if (!data) return;

        const dialogInfo = ActionEvent.instance.getDialogInfo(this._eventId);
        this._experienced = !!this.gm.eventSaveData[this._eventId]?.experienced;
        const want = data.want || {};
        this._canTrigger = !this._experienced && this.gm.checkHaveResource(want);

        super.show(data.name);
    }

    protected onHide(): void {
        if (this._params?.onClose) this._params.onClose();
        this._params = null;
    }

    protected render(): void {
        if (!this._content) return;
        this.clearContent();

        const data = EVENT_DATA[this._eventId];
        if (!data) return;
        const dialogInfo = ActionEvent.instance.getDialogInfo(this._eventId);
        const want = data.want || {};
        const cw = this.panelW - 48; // 内容可用宽度

        let y = 0; // 从 _content 顶部(anchor 0.5,1)向下递增

        // ── 1. 对话气泡区 ──
        const talkTexts = dialogInfo.dialogBefore.length > 0
            ? dialogInfo.dialogBefore
            : (data.desc ? [data.desc] : []);

        if (talkTexts.length > 0) {
            // 气泡背景节点
            const bubbleNode = new Node('Bubble');
            const bt = bubbleNode.addComponent(UITransform);
            bt.setContentSize(cw, 160); bt.setAnchorPoint(0.5, 1);
            bubbleNode.setPosition(0, y, 0); bubbleNode.setParent(this._content);
            const bgGfx = bubbleNode.addComponent(Graphics);
            this.mkRect(bgGfx, -cw / 2, -160, cw, 160, 12, DIALOG_BG, DIALOG_BORDER, 1.5);

            // 对话文本（左对齐，在气泡内）
            const fullText = talkTexts.map(t => `"${t}"`).join('\n');
            const talkLbl = this.mkText(bubbleNode, -cw / 2 + 20, -16, cw - 40, 140,
                fullText, S.font.body, DIALOG_TEXT, { align: 'left', bold: false });
            talkLbl.enableWrapText = true;
            talkLbl.overflow = Label.Overflow.CLAMP;
            talkLbl.lineHeight = 32;

            y -= 176; // 160 + 16 gap
        }

        // ── 2. 需求行 ──
        if (Object.keys(want).length > 0) {
            const wantStr = Object.entries(want).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join('、');
            y -= this._buildLabelRow(cw, y, '需求', wantStr, this._canTrigger ? C.body : C.warn);
        }

        // ── 3. 奖励行 ──
        if (data.get) {
            const getStr = Object.entries(data.get).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join('、');
            y -= this._buildLabelRow(cw, y, '奖励', getStr, C.accent2);
        }

        // ── 4. 已完成标记 ──
        if (this._experienced) {
            y -= this._buildLabelRow(cw, y, '', '(已完成)', C.sub);
        }

        // ── 5. 底部按钮区 ──
        y -= 24; // 按钮区上方间距

        const hasTalk = talkTexts.length > 0;
        const btnW = 150;
        const btnH = 52;
        const btnGap = 24;

        if (hasTalk) {
            // [交谈/回顾对话]
            const talkLbl = this._experienced ? '回顾对话' : '交谈';
            this.mkBtn(this._content, -btnW / 2 - btnGap / 2, y - btnH / 2, btnW, btnH, talkLbl, TALK_STYLE, () => {
                this._showTalkDialog(dialogInfo);
            });
        }

        // [触发/已完成/需求不足]
        if (this._experienced) {
            this.mkBtn(this._content,
                hasTalk ? btnGap / 2 + btnW / 2 : 0,
                y - btnH / 2, btnW, btnH, '已完成', DISABLED_STYLE, () => {});
        } else if (!this._canTrigger) {
            this.mkBtn(this._content,
                hasTalk ? btnGap / 2 + btnW / 2 : 0,
                y - btnH / 2, btnW, btnH, '触发(不足)', DISABLED_STYLE, () => {});
        } else {
            this.mkBtn(this._content,
                hasTalk ? btnGap / 2 + btnW / 2 : 0,
                y - btnH / 2, btnW, btnH, '触发交付', TRIGGER_STYLE, () => {
                    this._doTrigger(dialogInfo);
                });
        }

        // 自适应面板高度
        const totalContentH = Math.abs(y) + btnH + 28;
        const minPanelH = 380;
        const targetH = Math.max(minPanelH, totalContentH + 120);
        if (Math.abs(targetH - this.panelH) > 4) {
            this.resizePanel(targetH);
        }
    }

    /** 构建一行「标签: 内容」信息条 */
    private _buildLabelRow(cw: number, topY: number, label: string, value: string, valueColor: Color): number {
        const rowH = 44;
        const rowNode = new Node('InfoRow');
        const rt = rowNode.addComponent(UITransform);
        rt.setContentSize(cw, rowH); rt.setAnchorPoint(0.5, 1);
        rowNode.setPosition(0, topY, 0); rowNode.setParent(this._content);

        // 浅底
        const rgfx = rowNode.addComponent(Graphics);
        this.mkRect(rgfx, -cw / 2, -rowH, cw, rowH, 6, LABEL_BG);

        // 标签
        if (label) {
            this.mkInline(rowNode, -cw / 2 + 16, -rowH / 2, 60, rowH, label, S.font.sub, LABEL_TEXT, true);
        }
        // 值
        const valX = label ? -cw / 2 + 80 : -cw / 2 + 16;
        this.mkInline(rowNode, valX, -rowH / 2, cw - (label ? 96 : 32), rowH, value, S.font.body, valueColor);

        return rowH + 10; // 返回占用高度+间距
    }

    /** 显示完整对话弹窗（复用 DialogPanel 的选项列表模式） */
    private _showTalkDialog(dialogInfo: { dialogBefore: string[]; dialogAfter: string[] }): void {
        const data = EVENT_DATA[this._eventId];
        const talkTexts = dialogInfo.dialogBefore.length > 0
            ? dialogInfo.dialogBefore
            : (data?.desc ? [data.desc] : []);
        const options: DialogOption[] = talkTexts.map(text => ({
            label: text,
            data: null,
            disabled: true,
        }));
        if (!this._experienced && this._canTrigger) {
            options.push({ label: '→ 交付并触发', data: { action: 'trigger' } });
        }
        if (this._experienced && dialogInfo.dialogAfter.length > 0) {
            dialogInfo.dialogAfter.forEach(text => {
                options.push({ label: text, data: null, disabled: true });
            });
        }
        options.push({ label: '关闭', data: { action: 'close' } });

        this.dialogPanel?.show(
            data?.name || '事件',
            options,
            (d) => {
                if (d?.action === 'trigger' && !this._experienced) {
                    this._doTrigger(dialogInfo);
                }
            },
            () => {}
        );
    }

    /** 执行触发动作 */
    private _doTrigger(dialogInfo: { dialogBefore: string[]; dialogAfter: string[] }): void {
        const r = ActionEvent.instance.trigger(this._eventId);
        this.setMsg(r.message);
        this.hide();
        // 触发后回调（让调用方刷新页面）
        if (this._params?.onTrigger) this._params.onTrigger();
        // 显示 d_2 后续对话
        if (dialogInfo.dialogAfter.length > 0) {
            this._showAfterDialog(dialogInfo.dialogAfter);
        }
    }

    /** 显示完成后对话 */
    private _showAfterDialog(dialogAfter: string[]): void {
        const options: DialogOption[] = dialogAfter.map(text => ({
            label: text,
            data: null,
            disabled: true,
        }));
        options.push({ label: '继续', data: { action: 'close' } });
        this.dialogPanel?.show(
            `${EVENT_DATA[this._eventId]?.name || '事件'} - 完成`,
            options,
            () => {},
            () => {}
        );
    }
}
