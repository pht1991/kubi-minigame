/**
 * ProgressOverlay.ts - 公共操作进度条
 *
 * 所有「消耗时间换取产出」的动作（烹饪/制造/采集/拾荒/建造/种植/放陷阱…）统一在此播放进度：
 *   - 全屏半透明遮罩拦截触摸（防止操作途中误触底栏/返回）
 *   - 居中圆角面板：标题 + 进度条(动态绘制) + 可选百分比
 *   - 百分比数字是否展示由实例属性 `showPercent` 控制，默认不展示
 *   - play(title, durationMs, onComplete) 用 tween 把进度从 0 动画到 1，结束后回调并隐藏
 *
 * 动画结束才触发真正的结果（ActionExecutor 在 onComplete 内推进时间 + 发产出 + 弹反馈），
 * 解决原本「点击即完成、无体验感」的问题。
 *
 * 由 MainScene 在独立 _progressLayer（Modal 之上、Toast 之下）创建单例。
 */

import { _decorator, Component, Node, UITransform, Graphics, tween, Color, NodeEventType, view } from 'cc';
import { C, S } from './theme';
import { UIShape, UILabel } from './widgets';

const { ccclass } = _decorator;

@ccclass('ProgressOverlay')
export class ProgressOverlay extends Component {
    private static _instance: ProgressOverlay | null = null;
    static get instance(): ProgressOverlay | null { return ProgressOverlay._instance; }

    private _titleLbl: UILabel | null = null;
    private _pctLbl: UILabel | null = null;
    private _barGfx: Graphics | null = null;
    private _barW = 460;
    private _barH = 28;
    private _playing = false;
    /** 是否在进度条下方展示百分比数字（默认 false 不展示，调用方可按需置 true） */
    showPercent = false;

    onLoad(): void {
        ProgressOverlay._instance = this;

        const vs = view.getVisibleSize();
        const sw = vs.width, sh = vs.height;
        const hw = sw / 2, hh = sh / 2;

        let tf = this.node.getComponent(UITransform);
        if (!tf) tf = this.node.addComponent(UITransform);
        tf.setContentSize(sw, sh);
        tf.setAnchorPoint(0.5, 0.5);

        // 全屏遮罩：拦截触摸，覆盖全屏（进度期间禁止任何底层交互）
        const mask = new Node('PMask');
        const mt = mask.addComponent(UITransform);
        mt.setContentSize(sw, sh); mt.setAnchorPoint(0.5, 0.5);
        mask.setPosition(0, 0, 0); mask.setParent(this.node);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = new Color(0, 0, 0, 150);
        mg.rect(-hw, -hh, sw, sh); mg.fill();
        const stop = (e: any) => { e.propagationStopped = true; };
        mask.on(NodeEventType.TOUCH_START, stop);
        mask.on(NodeEventType.TOUCH_END, stop);

        // 面板
        const panelW = 540, panelH = 210;
        const panel = new Node('PPanel');
        const pt = panel.addComponent(UITransform);
        pt.setContentSize(panelW, panelH); pt.setAnchorPoint(0.5, 0.5);
        panel.setPosition(0, 0, 0); panel.setParent(this.node);
        const panelBg = new UIShape('PPanelBg').rect(panelW, panelH, C.panelBg, S.panelRadius, C.panelBorder, S.panelBorderW);
        panelBg.mount(panel);

        // 标题
        const titleLbl = new UILabel('', { size: 26, bold: true, color: C.title, align: 'center', width: 480 });
        titleLbl.pos(0, 55).mount(panel);
        this._titleLbl = titleLbl;

        // 进度条轨道（背景）
        const barY = -5;
        const barBg = new UIShape('PBarBg').rect(this._barW, this._barH, C.track, this._barH / 2);
        barBg.pos(0, barY).mount(panel);

        // 进度条填充（动态绘制，保留原生 Graphics 做增量重绘）
        const fill = new Node('PBarFill');
        const ft = fill.addComponent(UITransform);
        ft.setContentSize(this._barW, this._barH); ft.setAnchorPoint(0.5, 0.5);
        fill.setPosition(0, barY, 0); fill.setParent(panel);
        const fg = fill.addComponent(Graphics);
        this._barGfx = fg;

        // 百分比文字（是否展示由 showPercent 控制，默认隐藏）
        const pctLbl = new UILabel('0%', { size: 18, color: C.sub, align: 'center', width: 160 });
        pctLbl.pos(0, barY - 30).mount(panel);
        pctLbl.node.active = this.showPercent;
        this._pctLbl = pctLbl;

        this.node.active = false;
    }

    onDestroy(): void {
        if (ProgressOverlay._instance === this) ProgressOverlay._instance = null;
    }

    /** 是否正在播放 */
    get isPlaying(): boolean { return this._playing; }

    /**
     * 播放一次进度动画
     * @param title 标题（如「烹饪」「采集中」）
     * @param durationMs 真实时长(ms)
     * @param onComplete 动画结束后回调（此时才推进时间 + 应用产出）
     */
    play(title: string, durationMs: number, onComplete: () => void): void {
        if (this._playing) return; // 防重入：进行中忽略新请求
        this._playing = true;
        if (this._titleLbl) this._titleLbl.setText(title || '操作中…');
        this._drawBar(0);
        if (this._pctLbl) this._pctLbl.node.active = this.showPercent;
        if (this.showPercent && this._pctLbl) this._pctLbl.setText('0%');
        this.node.active = true;
        // 置于 _progressLayer 最顶（层内顺序由 MainScene 固定，这里仅保证本层内置顶）
        this.node.setSiblingIndex(this.node.parent!.children.length - 1);

        const prog = { v: 0 };
        tween(prog)
            .to(Math.max(0.05, durationMs / 1000), { v: 1 }, {
                easing: 'linear',
                onUpdate: () => {
                    this._drawBar(prog.v);
                    if (this.showPercent && this._pctLbl) this._pctLbl.setText(Math.round(prog.v * 100) + '%');
                },
            })
            .call(() => {
                this._drawBar(1);
                if (this.showPercent && this._pctLbl) this._pctLbl.string = '100%';
                this.node.active = false;
                this._playing = false;
                onComplete();   // 先隐藏进度条，再触发结果（避免 ResultModal 被进度遮罩短暂盖住）
            })
            .start();
    }

    /** 绘制进度条填充（左→右增长） */
    private _drawBar(v: number): void {
        if (!this._barGfx) return;
        const g = this._barGfx;
        g.clear();
        const w = this._barW * Math.max(0, Math.min(1, v));
        if (w <= 0) return;
        g.fillColor = C.fill;
        g.roundRect(-this._barW / 2, -this._barH / 2, w, this._barH, this._barH / 2);
        g.fill();
    }
}
