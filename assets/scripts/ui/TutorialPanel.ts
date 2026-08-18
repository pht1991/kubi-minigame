/**
 * TutorialPanel.ts - 首玩 3 步卡（T5.1）
 *
 * 仅首次进入游戏时弹出（由 MainScene 在 start() 末尾判定 SaveManager 标志后调用）。
 * 非强制、可跳过：遮罩 / 关闭(×) / 「开始游戏」/「跳过」任一都会标记 firstplay 完成并隐藏。
 * 复用 ModalPanel 基类（遮罩 + 置顶 + 控件助手），不新增架构。
 */

import { _decorator, Node } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { Btn } from './theme';
import { Tutorial } from './Tutorial';

const { ccclass } = _decorator;

@ccclass('TutorialPanel')
export class TutorialPanel extends ModalPanel {
    protected panelW = 680;
    protected panelH = 940;

    public show(title?: string): void {
        super.show(title ?? '新手引导');
    }

    /** 任意方式关闭（遮罩 / × / 按钮）都标记完成，避免回访者重复弹 */
    protected onHide(): void {
        Tutorial.markFirstPlayDone();
    }

    protected render(): void {
        const c = this._content;
        if (!c) return;
        this.clearContent();

        const W = this.panelW - 60;
        let y = -8;

        // 欢迎语
        this.mkText(c, 0, y, W, 30, '欢迎来到《库比》——硬核生存，先活下来！', 24, C.title,
            { bold: true, align: 'center', anchorX: 0.5, anchorY: 1 });
        y -= 46;

        // ① 状态释义
        y = this._section(c, y, W, '① 看懂 6 个状态（归零 / 极端会怎样）');
        const order: Array<[string, string]> = [
            ['生命', '归零 = 死亡'],
            ['满腹', '归零 = 持续掉血，去吃东西'],
            ['水分', '归零 = 持续掉血，去喝水'],
            ['体力', '过低 = 受限 / 掉血，注意休息'],
            ['精神', '过低 = 掉血，归零会失控'],
            ['体温', '过热 / 过冷 = 持续掉血'],
        ];
        for (const [n, d] of order) {
            this.mkText(c, 0, y, W, 26, `· ${n}：${d}`, 20, C.body,
                { align: 'left', anchorX: 0.5, anchorY: 1 });
            y -= 30;
        }
        y -= 8;

        // ② 第一个目标
        y = this._section(c, y, W, '② 你的第一个目标');
        this.mkText(c, 0, y, W, 56, '先去【地图】采集或【烹饪】填饱肚子。', 21, C.body,
            { align: 'left', anchorX: 0.5, anchorY: 1 });
        y -= 64;

        // ③ 时间提示
        y = this._section(c, y, W, '③ 时间会流逝');
        this.mkText(c, 0, y, W, 56, '每次操作都会推进时间，注意状态变化。', 21, C.body,
            { align: 'left', anchorX: 0.5, anchorY: 1 });
        y -= 64;

        // 按钮区（跳过 / 开始游戏）
        const by = -540;
        const bw = 240, bh = 60, gap = 30;
        this.mkBtn(c, -bw / 2 - gap / 2, by, bw, bh, '跳过',
            { ...Btn.neutral, bg: C.barBtnBg }, () => this.hide());
        this.mkBtn(c, bw / 2 + gap / 2, by, bw, bh, '开始游戏',
            Btn.primary, () => this.hide());
    }

    /** 小节标题（暖色强调） */
    private _section(parent: Node, y: number, w: number, title: string): number {
        this.mkText(parent, 0, y, w, 28, title, 22, C.accent,
            { bold: true, align: 'left', anchorX: 0.5, anchorY: 1 });
        return y - 36;
    }
}
