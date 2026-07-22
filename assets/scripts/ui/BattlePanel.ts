/**
 * BattlePanel.ts - 战斗面板（继承 ModalPanel 的公共外壳）
 * 全屏覆盖式战斗界面：怪物信息 + 玩家 HP + 战斗日志 + 操作网格
 * 通过 ActionCombat 状态机驱动回合制战斗。
 */

import { Node, Label, UITransform, Color, Graphics, EventTouch, NodeEventType, view } from 'cc';
import { ModalPanel, C } from './ModalPanel';
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

        // —— 继续按钮 ——
        this._continueBtn = new Node('ContinueBtn');
        this._continueBtn.setParent(panel);
        const cBtnT = this._continueBtn.addComponent(UITransform);
        cBtnT.setContentSize(200, 60);
        this._continueBtn.setPosition(0, -100, 0);
        const cBtnGfx = this._continueBtn.addComponent(Graphics);
        this.mkRect(cBtnGfx, -100, -30, 200, 60, 0, new Color(200, 140, 80, 255), new Color(140, 80, 40, 255), 2);
        this.mkCenter(this._continueBtn, 0, 0, 200, 40, '继续', 26, new Color(255, 255, 255), true);
        this._continueBtn.active = false;
        this._continueBtn.on(NodeEventType.TOUCH_END, () => { this.close(); });

        // —— 操作网格 ——
        this._actionGrid = new Node('ActionGrid');
        this._actionGrid.setParent(panel);
        const agT = this._actionGrid.addComponent(UITransform);
        agT.setContentSize(640, 180);
        this._actionGrid.setPosition(0, -300, 0);

        const actions = [
            { id: 'attack', name: '攻击', color: C.actAttack },
            { id: 'skill', name: '技能', color: C.actSkill },
            { id: 'item', name: '道具', color: C.actItem },
            { id: 'flee', name: '逃跑', color: C.actFlee },
        ];
        for (let i = 0; i < actions.length; i++) {
            const btn = this.makeActionBtn(actions[i], i);
            btn.setParent(this._actionGrid);
        }
    }

    private makeActionBtn(cfg: { id: string; name: string; color: Color }, idx: number): Node {
        const spacing = 160;
        const x = (idx - 1.5) * spacing;
        const ref = this.mkButton(this._actionGrid!, x, 0, 140, 150, cfg.name, cfg.color, () => {
            if (!this._combat.state || this._combat.state.ended) return;
            switch (cfg.id) {
                case 'attack': this._combat.attack(); break;
                case 'skill': this.showSkillGrid(); return;
                case 'item': this.showItemGrid(); return;
                case 'flee': this._combat.flee(); break;
            }
            this.refreshUI();
        });
        return ref.node;
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

        const recent = s.log.slice(-5);
        for (let i = 0; i < recent.length; i++) {
            const line = new Node(`Log_${i}`);
            line.setParent(this._logContent);
            const lT = line.addComponent(UITransform);
            lT.setContentSize(580, 36);
            lT.setAnchorPoint(0.5, 1);
            line.setPosition(0, -i * 38, 0);
            const lbl = line.addComponent(Label);
            lbl.string = recent[i];
            lbl.fontSize = 18; lbl.lineHeight = 26;
            lbl.color = new Color(220, 210, 190, 255);
        }
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
