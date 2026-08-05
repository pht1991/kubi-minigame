/**
 * BattlePanel.ts - 战斗面板（继承 ModalPanel 的公共外壳）
 * 全屏覆盖式战斗界面：怪物信息 + 玩家 HP + 战斗日志 + 操作网格
 * 通过 ActionCombat 状态机驱动回合制战斗。
 */

import { Node, Label, UITransform, Color, Graphics, ScrollView, view } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { S, Btn, BtnStyle } from './theme';
import { UIShape, UIVStack, UIHStack, UILabel, UIButton } from './widgets';
import { ActionCombat, CombatState } from '../actions/ActionCombat';
import { GameManager } from '../core/GameManager';
import { ITEM_DATA } from '../data/data';
import { DialogPanel } from './DialogPanel';

export class BattlePanel extends ModalPanel {
    /** 战斗结束回调：win→true 胜利, false→失败/逃跑 */
    onEnd: ((win: boolean) => void) | null = null;

    private get _combat(): ActionCombat { return ActionCombat.instance; }
    private _mstNameLabel: Label | null = null;
    private _mstHpLabel: Label | null = null;
    private _mstHpBar: Node | null = null;
    private _mstHpBarGfx: Graphics | null = null;
    private _playerHpLabel: Label | null = null;
    private _playerHpBar: Node | null = null;
    private _playerHpBarGfx: Graphics | null = null;
    private _logContent: Node | null = null;
    private _logSv: ScrollView | null = null;
    private _actionGrid: Node | null = null;
    private _resultLabel: Label | null = null;
    private _continueBtn: Node | null = null;
    /** 战斗回合时序（普通攻击）：true 表示"已点攻击、怪物反击等待触发"，期间再次点攻击按钮会被忽略 */
    private _counterPending = false;

    protected panelW = 680;
    protected panelH = 880;          // 拉高 60px，给玩家名+行动按钮之间留 23px 间距（治玩家名 y=-310 被按钮顶部 -304 压 17px）
    protected showMask = true;     // 与其它弹窗一致：半透明遮罩
    protected showClose = false;   // 战斗中不提供关闭按钮（防误触）
    protected buildContentContainer = true;
    protected maskClose = false;   // 战斗界面禁用"点遮罩关闭"——避免和"逃跑"按钮功能冲突（想退出战斗必须走逃跑/继续按钮）

    protected buildSkeleton(): void {
        super.buildSkeleton();

        // 战斗场景视觉：mask 走基类默认的 C.maskDim（半透明黑色），让背后主场景变暗；
        // 弹窗卡片自身由基类 C.panelBg 画米白色圆角矩形（见图2效果）。
        // 注：46661be 改的"mask 浅米黄"是错的——会盖住状态栏/底栏让整屏米黄，视觉糊。

        // 标题颜色由基类 ModalPanel 默认居中布局，这里仅覆写战斗专色
        if (this._titleLbl) this._titleLbl.color = C.battleTitle;

        this.buildCombatUI();
        this.node.active = false;
    }

    /** 开始战斗（prefix 为地牢前缀怪物 key，可选） */
    startBattle(mstId: string, prefix?: string): void {
        if (!this._combat.init(mstId, prefix)) return;
        if (this._titleLbl) this._titleLbl.string = '战斗';
        this.refreshUI();
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent!.children.length - 1);
    }

    private buildCombatUI(): void {
        const panel = this._panel!;
        // 镜像坐标常量（关于 panel 中心 y=0 对称，怪区在 +y、玩区在 -y）
        // 玩家名 y=-310 与按钮区要留 ≥20px 间距，行动按钮已下移至 -380
        // 关键修复（间距对称）：日志区 logView y=0（之前 120）居中，logH 240→340，
        // 让 mstVal 底 y=200 ↔ logView 顶 y=170 = 30px、plVal 顶 y=-200 ↔ logView 底 y=-170 = 30px 镜像对称，
        // 消除之前"上重叠 8px + 下空白 210px"的视觉撕裂。
        const Y = {
            mstName: 310, mstHp: 260, mstVal: 215,
            sepUp: 175,
            logView: 0, logH: 340,
            sepDn: -175,
            plVal: -215, plHp: -260, plName: -310,
            actRow: -380,
            contBtn: -400,
        };

        // —— 怪物信息区（上：名字 → HP 条 → 数值）——
        const mstSection = new Node('MstSection');
        mstSection.setParent(panel);

        this._mstNameLabel = this.mkCenter(mstSection, 0, Y.mstName, 640, 40, '', 24, C.battleName, true);

        const mstHpBgShape = new UIShape('MstHpBg').rect(500, 24, C.hpTrack);
        mstHpBgShape.mount(mstSection).pos(0, Y.mstHp, 0);
        const mstHpBg = mstHpBgShape.node;

        this._mstHpBar = new Node('MstHpBar');
        this._mstHpBar.setParent(mstHpBg);
        const mstHpBarT = this._mstHpBar.addComponent(UITransform);
        mstHpBarT.setContentSize(500, 24);
        mstHpBarT.setAnchorPoint(0, 0.5);
        this._mstHpBar.setPosition(-250, 0, 0);
        this._mstHpBarGfx = this._mstHpBar.addComponent(Graphics);

        this._mstHpLabel = this.mkCenter(mstSection, 0, Y.mstVal, 640, 30, '', 20, C.battleLabel);

        // —— 玩家 HP 区（下：数值 → HP 条 → 名字，镜像对称）——
        const plSection = new Node('PlSection');
        plSection.setParent(panel);

        this._playerHpLabel = this.mkCenter(plSection, 0, Y.plVal, 640, 30, '', 22, C.battleLabel);

        const plHpBgShape = new UIShape('PlHpBg').rect(500, 24, C.hpTrack);
        plHpBgShape.mount(plSection).pos(0, Y.plHp, 0);
        const plHpBg = plHpBgShape.node;

        this._playerHpBar = new Node('PlHpBar');
        this._playerHpBar.setParent(plHpBg);
        const plHpBarT = this._playerHpBar.addComponent(UITransform);
        plHpBarT.setContentSize(500, 24);
        plHpBarT.setAnchorPoint(0, 0.5);
        this._playerHpBar.setPosition(-250, 0, 0);
        this._playerHpBarGfx = this._playerHpBar.addComponent(Graphics);

        this.mkCenter(plSection, 0, Y.plName, 640, 30, '玩家', 22, C.battleName);

        // —— 分隔线（怪/日志、日志/玩）——
        const sepUp = new UIShape('SepUp').line(-310, Y.sepUp, 310, Y.sepUp, C.battleSep, 2);
        sepUp.mount(panel);
        const sepDn = new UIShape('SepDn').line(-310, Y.sepDn, 310, Y.sepDn, C.battleSep, 2);
        sepDn.mount(panel);

        // —— 战斗日志区（ScrollView，居中）——
        const logContainer = new Node('LogContainer');
        logContainer.setParent(panel);

        const { view: logView, content: logContent, sv: logSv } = this.mkScroll(logContainer, 0, Y.logView, 620, Y.logH);
        this._logContent = logContent;
        this._logSv = logSv;
        const logMask = logView.getComponent(Graphics);
        if (logMask) {
            const halfH = Y.logH / 2;
            logMask.fillColor = C.battleLogMask;
            logMask.clear();
            logMask.rect(-310, -halfH, 620, Y.logH);
            logMask.fill();
        }

        // —— 结果文字（覆盖在面板上）——
        this._resultLabel = this.mkCenter(panel, 0, 0, 600, 80, '', 28, C.battleTitle);
        this._resultLabel.node.active = false;

        // —— 继续按钮（战斗结束时显示）——
        const contBtn = new UIButton('继续', Btn.confirm, () => this.close(), 200, 60);
        contBtn.mount(panel).pos(0, Y.contBtn, 0);
        this._continueBtn = contBtn.node;
        this._continueBtn.active = false;

        // —— 操作按钮行（统一暖底色 + 类型彩色描边，扁按钮 72 高）——
        const actions = [
            { id: 'attack', name: '攻击', color: C.actAttack },
            { id: 'skill', name: '技能', color: C.actSkill },
            { id: 'item', name: '道具', color: C.actItem },
            { id: 'flee', name: '逃跑', color: C.actFlee },
        ];
        const actStyle: BtnStyle = { bg: C.btnActionBg, border: C.battleActBorder, borderW: 3, text: C.body, radius: S.btnRadius, fontSize: 24 };
        const actRow = new UIHStack().gap(16);
        for (const cfg of actions) {
            actRow.add(new UIButton(cfg.name,
                { ...actStyle, border: cfg.color },
                () => {
                    if (!this._combat.state || this._combat.state.ended) return;
                    if (this._counterPending) return;     // 攻击反击延迟 0.8s 期间忽略所有按钮
                    switch (cfg.id) {
                        case 'attack': this.doPlayerAttack(); return;
                        case 'skill': this.showSkillGrid(); return;
                        case 'item': this.showItemGrid(); return;
                        case 'flee': this._combat.flee(); break;
                    }
                    this.refreshUI();
                }, 140, 72));
        }
        actRow.mount(panel).pos(0, Y.actRow, 0);
        this._actionGrid = actRow.node;
    }

    /**
     * 玩家普通攻击（带"先玩家动 + 延迟 0.8s 怪物反击"的时序）：
     * 立刻调 playerAttack 扣 mstHp + 入 log "你攻击了..." + refresh；
     * 0.8s 后 scheduleOnce 回调 monsterCounter 扣 playerCurHp + 拼接反击段 + refresh。
     * 期间 _counterPending 锁定所有按钮避免重复触发。
     */
    private doPlayerAttack(): void {
        if (!this._combat.state || this._combat.state.ended) return;
        if (this._counterPending) return;

        // 玩家先动：怪物HP 扣减 + 入玩家动作 log → 立即可见
        this._counterPending = true;
        this._combat.playerAttack();
        this.refreshUI();

        // 怪物反击延迟 0.8s：玩家HP 扣减 + 拼接反击段 → 模拟"对手走一步我再走一步"的交互感
        this.scheduleOnce(() => {
            // 防御：用户在 0.8s 内点"关闭/继续"等导致战斗结束，state 可能为 null
            if (!this._combat.state || this._combat.state.ended) {
                this._counterPending = false;
                return;
            }
            this._combat.monsterCounter();
            this._counterPending = false;
            this.refreshUI();
        }, 0.8);
    }

    /** 弹出技能选择子网格（含冷却显示 + 防御/敏捷姿态技能） */
    private showSkillGrid(): void {
        if (!this._combat.state || this._combat.state.ended) return;
        const skill = this._gm.skill;
        const cds = this._combat.state.cds || {};

        const allSkills: { id: string; name: string }[] = [
            { id: 'melee', name: '格斗' },
            { id: 'magic', name: '魔法' },
            { id: 'shot', name: '射击' },
            { id: 'def', name: '防御' },
            { id: 'agile', name: '敏捷' },
        ];
        const availableSkills = allSkills.filter(s => (skill[s.id] || 0) > 0);

        if (availableSkills.length === 0) {
            const dialogPanel = this._findDialog();
            if (dialogPanel) dialogPanel.show('提示', [{ label: '你没有可用的战斗技能', data: null }], () => {});
            return;
        }

        const options = availableSkills.map(s => {
            const lv = skill[s.id];
            const cd = cds[s.id] || 0;
            const label = cd > 0 ? `${s.name} 等级${lv} (冷却${cd})` : `${s.name} 等级${lv}`;
            return { label, data: s.id, disabled: cd > 0 };
        });

        const dialogPanel = this._findDialog();
        if (dialogPanel) dialogPanel.show('选择技能', options, (data: string) => {
            this._combat.useSkill(data);
            this.refreshUI();
        });
    }

    /** 弹出战斗道具选择 */
    private showItemGrid(): void {
        if (!this._combat.state || this._combat.state.ended) return;
        const bag = this._gm.boxSaveData['bag'] || {};
        const healItems: { id: string; name: string; count: number }[] = [];

        for (const itemId in bag) {
            if (bag[itemId] <= 0) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            const canUse = !!(d as any).effect || d.type === 'food' || d.type === 'cooked' || d.type === 'potion';
            if (canUse) healItems.push({ id: itemId, name: `${d.name} ×${bag[itemId]}`, count: bag[itemId] });
        }

        if (healItems.length === 0) {
            this._combat.state.log.push('背包中没有可用道具！');
            this.refreshUI();
            return;
        }

        const options = healItems.map(h => ({ label: h.name, data: h.id }));
        const dialogPanel = this._findDialog();
        if (dialogPanel) dialogPanel.show('使用道具', options, (data: string) => {
            this._combat.useItem(data);
            this.refreshUI();
        });
    }

    /** 在场景中查找 DialogPanel 实例（统一公共弹窗） */
    private _findDialog(): DialogPanel | null {
        const root = this.node.scene;
        return root.getComponentInChildren(DialogPanel);
    }

    /** 刷新 UI */
    private refreshUI(): void {
        const s = this._combat.state;
        if (!s) { this.close(); return; }

        if (this._mstNameLabel) this._mstNameLabel.string = s.mstName;
        if (this._mstHpLabel) this._mstHpLabel.string = `生命 ${Math.max(0, Math.round(s.mstHp))} / ${s.mstMaxHp}`;
        this.updateHpBar(this._mstHpBar!, this._mstHpBarGfx!, Math.max(0, s.mstHp), s.mstMaxHp, C.hpEnemy);

        if (this._playerHpLabel) this._playerHpLabel.string = `生命 ${Math.max(0, Math.round(s.playerCurHp))} / ${s.playerMaxHp}`;
        this.updateHpBar(this._playerHpBar!, this._playerHpBarGfx!, Math.max(0, s.playerCurHp), s.playerMaxHp, C.hpPlayer);

        this.refreshLog(s);

        if (s.ended) {
            if (this._actionGrid) this._actionGrid.active = false;
            if (this._resultLabel) {
                this._resultLabel.node.active = true;
                this._resultLabel.string = s.win ? '胜利！' : '被击败了…';
                this._resultLabel.color = s.win ? C.win : C.lose;
            }
            if (this._continueBtn) this._continueBtn.active = true;
        } else {
            if (this._actionGrid) this._actionGrid.active = true;
            if (this._resultLabel) this._resultLabel.node.active = false;
            if (this._continueBtn) this._continueBtn.active = false;
        }
    }

    private updateHpBar(node: Node, gfx: Graphics, cur: number, max: number, color: Color): void {
        const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
        const t = node.getComponent(UITransform)!;
        t.setContentSize(500 * ratio, 24);
        gfx.clear();
        gfx.fillColor = color;
        gfx.rect(0, -12, 500 * ratio, 24); gfx.fill();
    }

    private refreshLog(s: CombatState): void {
        if (!this._logContent) return;
        for (const c of [...this._logContent.children]) c.destroy();

        // 日志行：VStack 自动排布（顶部对齐 content anchor(0.5,1)）
        const recent = s.log.slice(-5);
        const list = new UIVStack().gap(2).align('center').fixedWidth(580);
        for (const text of recent) {
            list.add(new UILabel(text, { size: 18, width: 580, height: 36, color: C.battleLogText, align: 'center', lineHeight: 26 }));
        }
        list.mount(this._logContent);
        list.pos(0, -list.h / 2, 0);

        // 滚到底部：战斗日志"最新一行"最重要，Cocos ScrollView 默认显示顶部会截断最新行
        if (this._logSv) this._logSv.scrollToBottom(0.1);
    }

    private close(): void {
        this.unscheduleAllCallbacks();    // 清理"攻击→延迟反击"未触发的 scheduleOnce，避免访问已 null 的 state
        this._counterPending = false;
        this._combat.clear();
        const win = this._combat.state?.win ?? false;
        this.node.active = false;
        if (this.onEnd) this.onEnd(win);
    }

    private get _gm() { return GameManager.instance; }

    // ModalPanel 要求的抽象方法（战斗界面由 buildSkeleton 静态构建，show 不动态渲染）
    protected render(): void {}
}
