/**
 * BattlePanel.ts - 战斗面板（继承 ModalPanel 的公共外壳）
 * 全屏覆盖式战斗界面：怪物信息 + 玩家 HP + 战斗日志 + 操作网格
 * 通过 ActionCombat 状态机驱动回合制战斗。
 */

import { Node, Label, UITransform, Color, Graphics, EventTouch, NodeEventType, view } from 'cc';
import { ModalPanel, C } from './ModalPanel';
import { S } from './theme';
import { UIVStack, UIHStack, UILabel, UIButton } from './widgets';
import { ActionCombat, CombatState } from '../actions/ActionCombat';
import { GameManager } from '../core/GameManager';
import { ITEM_DATA } from '../data/data';
import { DialogPanel } from './DialogPanel';

export class BattlePanel extends ModalPanel {
    /** 战斗结束回调：win→true 胜利, false→失败/逃跑 */
    onEnd: ((win: boolean) => void) | null = null;

    private get _combat(): ActionCombat { return ActionCombat.instance; }
    private _bgNode: Node | null = null;
    private _mstNameLabel: Label | null = null;
    private _mstHpLabel: Label | null = null;
    private _mstHpBar: Node | null = null;
    private _mstHpBarGfx: Graphics | null = null;
    private _playerHpLabel: Label | null = null;
    private _playerHpBar: Node | null = null;
    private _playerHpBarGfx: Graphics | null = null;
    private _logContent: Node | null = null;
    private _actionGrid: Node | null = null;
    private _resultLabel: Label | null = null;
    private _continueBtn: Node | null = null;

    protected panelW = 680;
    protected panelH = 1100;
    protected showMask = false;   // 战斗界面自带不透明背景，不需要半透明遮罩
    protected showClose = false;  // 战斗中不提供关闭按钮（防误触）
    protected buildContentContainer = false;

    protected buildSkeleton(): void {
        super.buildSkeleton();

        const vs = view.getVisibleSize();
        const sw = vs.width, sh = vs.height;
        const hw = sw / 2, hh = sh / 2;

        // 不透明战斗背景（置于最底层，拦截所有点击）
        this._bgNode = new Node('BattleBg');
        const bgT = this._bgNode.addComponent(UITransform);
        bgT.setContentSize(sw, sh);
        this._bgNode.setParent(this.node);
        const bgGfx = this._bgNode.addComponent(Graphics);
        bgGfx.fillColor = C.battleBg;
        bgGfx.rect(-hw, -hh, sw, sh); bgGfx.fill();
        this._bgNode.on(NodeEventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });
        this.node.insertChild(this._bgNode, 0); // 放到面板之下

        // 标题（战斗界面居中显示）
        if (this._titleLbl) {
            this._titleLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._titleNode.setPosition(0, this.panelH / 2 - 50, 0);
            this._titleLbl.color = C.battleTitle;
        }

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

        // —— 怪物信息区 ——
        const mstSection = new Node('MstSection');
        mstSection.setParent(panel);

        this._mstNameLabel = this.mkCenter(mstSection, 0, 440, 640, 40, '', 30, new Color(80, 40, 30), true);

        const mstHpBg = new Node('MstHpBg');
        mstHpBg.setParent(mstSection);
        const mstHpBgT = mstHpBg.addComponent(UITransform);
        mstHpBgT.setContentSize(500, 24);
        mstHpBg.setPosition(0, 400, 0);
        const mstHpBgGfx = mstHpBg.addComponent(Graphics);
        mstHpBgGfx.fillColor = new Color(80, 80, 80, 200);
        mstHpBgGfx.rect(-250, -12, 500, 24); mstHpBgGfx.fill();

        this._mstHpBar = new Node('MstHpBar');
        this._mstHpBar.setParent(mstHpBg);
        const mstHpBarT = this._mstHpBar.addComponent(UITransform);
        mstHpBarT.setContentSize(500, 24);
        mstHpBarT.setAnchorPoint(0, 0.5);
        this._mstHpBar.setPosition(-250, 0, 0);
        this._mstHpBarGfx = this._mstHpBar.addComponent(Graphics);

        this._mstHpLabel = this.mkCenter(mstSection, 0, 370, 640, 30, '', 20, new Color(60, 40, 30));

        // —— 玩家 HP 区 ——
        const plSection = new Node('PlSection');
        plSection.setParent(panel);

        const plHpBg = new Node('PlHpBg');
        plHpBg.setParent(plSection);
        const plHpBgT = plHpBg.addComponent(UITransform);
        plHpBgT.setContentSize(500, 24);
        plHpBg.setPosition(0, 330, 0);
        const plHpBgGfx = plHpBg.addComponent(Graphics);
        plHpBgGfx.fillColor = new Color(80, 80, 80, 200);
        plHpBgGfx.rect(-250, -12, 500, 24); plHpBgGfx.fill();

        this._playerHpBar = new Node('PlHpBar');
        this._playerHpBar.setParent(plHpBg);
        const plHpBarT = this._playerHpBar.addComponent(UITransform);
        plHpBarT.setContentSize(500, 24);
        plHpBarT.setAnchorPoint(0, 0.5);
        this._playerHpBar.setPosition(-250, 0, 0);
        this._playerHpBarGfx = this._playerHpBar.addComponent(Graphics);

        this._playerHpLabel = this.mkCenter(plSection, 0, 295, 640, 30, '', 22, new Color(40, 80, 40));
        this.mkCenter(plSection, 0, 350, 640, 30, '玩家', 22, new Color(40, 80, 40));

        // —— 分隔线 ——
        const sep = new Node('Separator');
        sep.setParent(panel);
        const sepGfx = sep.addComponent(Graphics);
        sepGfx.strokeColor = C.battleSep;
        sepGfx.lineWidth = 2;
        sepGfx.moveTo(-310, 260); sepGfx.lineTo(310, 260); sepGfx.stroke();

        // —— 战斗日志区（ScrollView） ——
        const logContainer = new Node('LogContainer');
        logContainer.setParent(panel);

        const { view: logView, content: logContent } = this.mkScroll(logContainer, 0, 120, 620, 220);
        this._logContent = logContent;
        const logMask = logView.getComponent(Graphics);
        if (logMask) { logMask.fillColor = C.battleLogMask; logMask.clear(); logMask.rect(-310, -110, 620, 220); logMask.fill(); }

        // —— 结果文字（覆盖在面板上） ——
        this._resultLabel = this.mkCenter(panel, 0, 0, 600, 80, '', 28, C.battleTitle);
        this._resultLabel.node.active = false;

        // —— 继续按钮（widgets） ——
        const contBtn = new UIButton('继续',
            { bg: new Color(200, 140, 80, 255), border: new Color(140, 80, 40, 255), borderW: 2, text: C.white, radius: 0, fontSize: 26 },
            () => this.close(), 200, 60);
        contBtn.mount(panel).pos(0, -100, 0);
        this._continueBtn = contBtn.node;
        this._continueBtn.active = false;

        // —— 操作按钮行（UIHStack 自动排布） ——
        const actions = [
            { id: 'attack', name: '攻击', color: C.actAttack },
            { id: 'skill', name: '技能', color: C.actSkill },
            { id: 'item', name: '道具', color: C.actItem },
            { id: 'flee', name: '逃跑', color: C.actFlee },
        ];
        const actRow = new UIHStack().gap(20);
        for (const cfg of actions) {
            actRow.add(new UIButton(cfg.name,
                { bg: cfg.color, border: C.btnBorder, borderW: S.btnBorderW, text: C.white, radius: S.btnRadius, fontSize: 26 },
                () => {
                    if (!this._combat.state || this._combat.state.ended) return;
                    switch (cfg.id) {
                        case 'attack': this._combat.attack(); break;
                        case 'skill': this.showSkillGrid(); return;
                        case 'item': this.showItemGrid(); return;
                        case 'flee': this._combat.flee(); break;
                    }
                    this.refreshUI();
                }, 140, 150));
        }
        actRow.mount(panel).pos(0, -300, 0);
        this._actionGrid = actRow.node;
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
            list.add(new UILabel(text, { size: 18, width: 580, height: 36, color: new Color(220, 210, 190, 255), align: 'center', lineHeight: 26 }));
        }
        list.mount(this._logContent);
        list.pos(0, -list.h / 2, 0);
    }

    private close(): void {
        this._combat.clear();
        const win = this._combat.state?.win ?? false;
        this.node.active = false;
        if (this.onEnd) this.onEnd(win);
    }

    private get _gm() { return GameManager.instance; }

    // ModalPanel 要求的抽象方法（战斗界面由 buildSkeleton 静态构建，show 不动态渲染）
    protected render(): void {}
}
