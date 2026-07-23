/**
 * EventDetailPanel.ts - NPC 事件详情面板（专用对话界面，纯视图）
 *
 * ★ 组件库 POC：内容区已迁移到 ui/widgets/（UIVStack/UILabel/UIButton/UIShape），
 *   布局由 VStack 自动排列，不再手写绝对 y。外壳仍复用 ModalPanel 骨架。
 *
 * 结构：
 *   - 标题栏显示 NPC 名（ModalPanel 骨架）
 *   - 对话气泡区（UIShape 圆角浅底 + UILabel，高度随文本量自适应，钳制 80~280）
 *   - 需求 / 奖励信息行（UIShape 行底 + 标签/内容 UILabel）
 *   - 底部操作按钮（UIHStack + UIButton：交谈 / 触发）
 *
 * 本面板不持有 gm / dialogPanel，所有状态由调用方通过 EventDetailParams 传入，
 * 交谈 / 触发 / 关闭均通过回调上抛给调用方处理，避免面板误用未注入的依赖。
 */

import { _decorator, Color, view } from 'cc';
import { ModalPanel } from './ModalPanel';
import { C, S, BtnStyle } from './theme';
import { ITEM_DATA } from '../data/data';
import { UIVStack, UIHStack, UILabel, UIButton, UIShape } from './widgets';

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
    /** NPC 名（标题栏） */
    title: string;
    /** 对话前文本（d_1 或 desc） */
    dialogs: string[];
    /** 对话后文本（d_2） */
    dialogAfter: string[];
    /** 需求物品表 */
    want: Record<string, number>;
    /** 奖励物品表（无则 undefined） */
    reward?: Record<string, number>;
    /** 是否已触发过 */
    experienced: boolean;
    /** 当前是否满足需求 */
    canTrigger: boolean;
    /** 点「交谈」回调（由调用方用 dialogPanel 弹对话） */
    onTalk?: () => void;
    /** 点「触发交付」回调（由调用方执行 ActionEvent.trigger + 刷新） */
    onTrigger?: () => void;
    /** 关闭回调 */
    onClose?: () => void;
}

@ccclass('EventDetailPanel')
export class EventDetailPanel extends ModalPanel {

    protected panelW = 620;
    protected panelH = 560;       // 默认高度，render 时自适应
    /** 气泡区最小 / 最大高度（动态计算时钳制） */
    private static readonly BUBBLE_MIN_H = 80;
    private static readonly BUBBLE_MAX_H = 280;
    /** 面板最大可用高度（不超过屏幕可用空间的 82%） */
    private _maxPanelH = 900;     // onLoad 后由可见尺寸更新
    protected showMask = true;
    protected maskClose = false;   // 不允许点遮罩关闭（必须点按钮）
    protected showClose = true;

    private _p: EventDetailParams | null = null;

    /** onLoad 时根据屏幕可用空间限制面板最大高度 */
    onLoad(): void {
        super.onLoad();   // ⚠️ 必须先建骨架（_panelBgGfx 等），否则首次 show 时 drawPanelBg 崩溃
        const vs = view.getVisibleSize();
        // 面板不超过屏幕高度的 85%，留出标题栏+底栏+边距
        this._maxPanelH = Math.floor(vs.height * 0.82);
    }

    /** 显示事件详情面板 */
    public showDetail(params: EventDetailParams): void {
        this._p = params;
        super.show(params.title);
    }

    protected onHide(): void {
        if (this._p?.onClose) this._p.onClose();
        this._p = null;
    }

    protected render(): void {
        if (!this._content || !this._p) return;
        this.clearContent();

        const p = this._p;
        const cw = this.panelW - 48; // 内容可用宽度

        // 声明式垂直栈：气泡 → 需求 → 奖励 → 已完成 → 按钮，布局自动排
        const stack = new UIVStack().gap(14).align('center').fixedWidth(cw);

        // ── 1. 对话气泡区（高度随文本量，钳制 min~max） ──
        if (p.dialogs.length > 0) {
            const fullText = p.dialogs.map(t => `"${t}"`).join('\n');
            const fontSize = S.font.body;
            const lineHeight = 32;
            const textW = cw - 40;                 // 气泡内左右各 20 padding
            // 估算文本高度（汉字≈fontSize*0.6 宽）
            const charPerLine = Math.max(1, Math.floor(textW / (fontSize * 0.6)));
            const totalChars = fullText.replace(/\n/g, '').length;
            const newlines = (fullText.match(/\n/g) || []).length;
            const estLines = Math.ceil(totalChars / charPerLine) + newlines;
            const textH = Math.min(EventDetailPanel.BUBBLE_MAX_H - 32, estLines * lineHeight);
            const bubbleH = Math.max(EventDetailPanel.BUBBLE_MIN_H, textH + 32);

            const bubble = new UIShape('Bubble').rect(cw, bubbleH, DIALOG_BG, 12, DIALOG_BORDER, 1.5);
            bubble.add(new UILabel(fullText, {
                size: fontSize, width: textW, height: textH,
                color: DIALOG_TEXT, align: 'left', lineHeight,
            }));
            stack.add(bubble);
        }

        // ── 2. 需求行 ──
        if (Object.keys(p.want).length > 0) {
            const wantStr = Object.entries(p.want).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join('、');
            stack.add(this._infoRow(cw, '需求', wantStr, p.canTrigger ? C.body : C.warn));
        }

        // ── 3. 奖励行 ──
        if (p.reward) {
            const getStr = Object.entries(p.reward).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join('、');
            stack.add(this._infoRow(cw, '奖励', getStr, C.accent2));
        }

        // ── 4. 已完成标记 ──
        if (p.experienced) {
            stack.add(this._infoRow(cw, '', '(已完成)', C.sub));
        }

        // ── 5. 底部按钮区 ──
        const btnRow = new UIHStack().gap(24).padding(10, 0, 0, 0);
        const hasTalk = p.dialogs.length > 0;
        if (hasTalk) {
            btnRow.add(new UIButton(p.experienced ? '回顾对话' : '交谈', TALK_STYLE, () => {
                this._p?.onTalk?.();
            }));
        }
        if (p.experienced) {
            btnRow.add(new UIButton('已完成', DISABLED_STYLE).setEnabled(false));
        } else if (!p.canTrigger) {
            btnRow.add(new UIButton('触发(不足)', DISABLED_STYLE).setEnabled(false));
        } else {
            btnRow.add(new UIButton('触发交付', TRIGGER_STYLE, () => {
                this._p?.onTrigger?.();
                this.hide();
            }));
        }
        stack.add(btnRow);

        // 挂载（mount 时自动递归 layout），顶部对齐 _content(anchor 0.5,1) 原点
        stack.mount(this._content);
        stack.pos(0, -stack.h / 2, 0);

        // 自适应面板高度（钳制不超过屏幕 82%）
        const minPanelH = 380;
        const rawH = Math.max(minPanelH, stack.h + 150); // 150 = 标题区 90 + 底部留白
        const targetH = Math.min(this._maxPanelH, rawH);
        if (Math.abs(targetH - this.panelH) > 4) {
            this.resizePanel(targetH);
            // resizePanel 后 _content 顶点位置不变（仍为局部原点），stack 无需重新定位
        }
    }

    /** 构建一行「标签: 内容」信息条（UIShape 行底 + 标签/内容 UILabel 手动内嵌） */
    private _infoRow(cw: number, label: string, value: string, valueColor: Color): UIShape {
        const rowH = 44;
        const row = new UIShape('InfoRow').rect(cw, rowH, LABEL_BG, 6);
        if (label) {
            const tag = new UILabel(label, { size: S.font.sub, color: LABEL_TEXT, bold: true });
            tag.pos(-cw / 2 + 16 + tag.w / 2, 0);
            row.add(tag);
        }
        const valW = cw - (label ? 96 : 32);
        const val = new UILabel(value, { size: S.font.body, width: valW, height: rowH, color: valueColor, align: 'left' });
        val.pos(-cw / 2 + (label ? 80 : 16) + valW / 2, 0);
        row.add(val);
        return row;
    }
}
