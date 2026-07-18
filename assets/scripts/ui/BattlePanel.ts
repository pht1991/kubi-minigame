/**
 * BattlePanel.ts - 战斗面板
 * 全屏覆盖式战斗界面：怪物信息 + 玩家 HP + 战斗日志 + 操作网格
 * 通过 ActionCombat 状态机驱动回合制战斗。
 */

import { _decorator, Component, Node, Label, UITransform, Color, Graphics, ScrollView } from 'cc';
import { ActionCombat, CombatState } from '../actions/ActionCombat';
import { GameManager } from '../core/GameManager';
import { ITEM_DATA } from '../data/data';
import { DialogPanel } from './DialogPanel';

const { ccclass, property } = _decorator;

@ccclass('BattlePanel')
export class BattlePanel extends Component {
    /** 战斗结束回调：win→true 胜利, false→失败/逃跑 */
    onEnd: ((win: boolean) => void) | null = null;

    private get _combat(): ActionCombat { return ActionCombat.instance; }
    private _bgNode: Node | null = null;
    private _panelNode: Node | null = null;
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

    onLoad(): void {
        this.createUI();
    }

    /** 开始战斗（prefix 为地牢前缀怪物 key，可选） */
    startBattle(mstId: string, prefix?: string): void {
        if (!this._combat.init(mstId, prefix)) return;
        this.refreshUI();
        this.node.active = true;
    }

    private createUI(): void {
        const W = 750, H = 1334;

        // —— 遮罩背景 ——
        this._bgNode = new Node('BattleBg');
        const bgT = this._bgNode.addComponent(UITransform);
        bgT.setContentSize(W, H);
        this._bgNode.setParent(this.node);
        const bgGfx = this._bgNode.addComponent(Graphics);
        bgGfx.fillColor = new Color(20, 15, 10, 230);
        bgGfx.rect(-W / 2, -H / 2, W, H);
        bgGfx.fill();

        // —— 主面板 ——
        this._panelNode = new Node('BattlePanel');
        const pT = this._panelNode.addComponent(UITransform);
        pT.setContentSize(680, 1100);
        pT.setAnchorPoint(0.5, 0.5);
        this._panelNode.setPosition(0, 40, 0);
        this._panelNode.setParent(this.node);
        const pGfx = this._panelNode.addComponent(Graphics);
        pGfx.fillColor = new Color(255, 248, 238, 255);
        pGfx.rect(-340, -550, 680, 1100);
        pGfx.fill();
        // 边框
        pGfx.strokeColor = new Color(180, 140, 100, 255);
        pGfx.lineWidth = 4;
        pGfx.rect(-340, -550, 680, 1100);
        pGfx.stroke();
        // 面板 Mask：裁剪子内容到面板矩形内
        this._panelNode.addComponent(Mask).type = Mask.Type.RECT;

        // —— 标题 ——
        const titleNode = new Node('Title');
        titleNode.setParent(this._panelNode);
        const tT = titleNode.addComponent(UITransform);
        tT.setContentSize(640, 50);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '⚔ 战斗 ⚔';
        titleLabel.fontSize = 36;
        titleLabel.color = new Color(160, 30, 30, 255);
        titleNode.setPosition(0, 500, 0);

        // —— 怪物信息区 ——
        const mstSection = new Node('MstSection');
        mstSection.setParent(this._panelNode);

        this._mstNameLabel = this.makeLabel('MstName', '', 30, new Color(80, 40, 30), mstSection, 0, 440, 640, 40);

        // 怪物 HP 条
        const mstHpBg = new Node('MstHpBg');
        mstHpBg.setParent(mstSection);
        const mstHpBgT = mstHpBg.addComponent(UITransform);
        mstHpBgT.setContentSize(500, 24);
        mstHpBg.setPosition(0, 400, 0);
        const mstHpBgGfx = mstHpBg.addComponent(Graphics);
        mstHpBgGfx.fillColor = new Color(80, 80, 80, 200);
        mstHpBgGfx.rect(-250, -12, 500, 24);
        mstHpBgGfx.fill();

        this._mstHpBar = new Node('MstHpBar');
        this._mstHpBar.setParent(mstHpBg);
        const mstHpBarT = this._mstHpBar.addComponent(UITransform);
        mstHpBarT.setContentSize(500, 24);
        mstHpBarT.setAnchorPoint(0, 0.5);
        this._mstHpBar.setPosition(-250, 0, 0);
        this._mstHpBarGfx = this._mstHpBar.addComponent(Graphics);

        this._mstHpLabel = this.makeLabel('MstHpLbl', '', 20, new Color(60, 40, 30), mstSection, 0, 370, 640, 30);

        // —— 玩家 HP 区 ——
        const plSection = new Node('PlSection');
        plSection.setParent(this._panelNode);

        const plHpBg = new Node('PlHpBg');
        plHpBg.setParent(plSection);
        const plHpBgT = plHpBg.addComponent(UITransform);
        plHpBgT.setContentSize(500, 24);
        plHpBg.setPosition(0, 330, 0);
        const plHpBgGfx = plHpBg.addComponent(Graphics);
        plHpBgGfx.fillColor = new Color(80, 80, 80, 200);
        plHpBgGfx.rect(-250, -12, 500, 24);
        plHpBgGfx.fill();

        this._playerHpBar = new Node('PlHpBar');
        this._playerHpBar.setParent(plHpBg);
        const plHpBarT = this._playerHpBar.addComponent(UITransform);
        plHpBarT.setContentSize(500, 24);
        plHpBarT.setAnchorPoint(0, 0.5);
        this._playerHpBar.setPosition(-250, 0, 0);
        this._playerHpBarGfx = this._playerHpBar.addComponent(Graphics);

        this._playerHpLabel = this.makeLabel('PlHpLbl', '', 22, new Color(40, 80, 40), plSection, 0, 295, 640, 30);
        this.makeLabel('PlLabel', '玩家', 22, new Color(40, 80, 40), plSection, 0, 350, 640, 30);

        // —— 分隔线 ——
        const sep = new Node('Separator');
        sep.setParent(this._panelNode);
        const sepGfx = sep.addComponent(Graphics);
        sepGfx.strokeColor = new Color(180, 140, 100, 200);
        sepGfx.lineWidth = 2;
        sepGfx.moveTo(-310, 260);
        sepGfx.lineTo(310, 260);
        sepGfx.stroke();

        // —— 战斗日志区（ScrollView） ——
        const logContainer = new Node('LogContainer');
        logContainer.setParent(this._panelNode);

        // view
        const logView = new Node('LogView');
        logView.setParent(logContainer);
        const logViewT = logView.addComponent(UITransform);
        logViewT.setContentSize(620, 220);
        logViewT.setAnchorPoint(0.5, 0.5);
        logView.setPosition(0, 120, 0);
        const logMask = logView.addComponent(Graphics);
        logMask.fillColor = new Color(40, 35, 30, 180);
        logMask.rect(-310, -110, 620, 220);
        logMask.fill();

        // content
        this._logContent = new Node('LogContent');
        this._logContent.setParent(logView);
        const logCT = this._logContent.addComponent(UITransform);
        logCT.setContentSize(600, 1000);
        logCT.setAnchorPoint(0.5, 1);
        this._logContent.setPosition(0, 110, 0);

        // ScrollView
        const logSv = logContainer.addComponent(ScrollView);
        logSv.content = this._logContent;
        logSv.horizontal = false;
        logSv.vertical = true;
        logSv.inertia = true;
        logSv.brake = 0.5;
        logSv.elastic = true;

        // —— 结果文字（覆盖在面板上） ——
        this._resultLabel = this.makeLabel('Result', '', 28, new Color(160, 30, 30), this._panelNode, 0, 0, 600, 80);
        (this._resultLabel.node.getComponent(UITransform)!).setContentSize(600, 80);
        this._resultLabel.node.active = false;

        // —— 继续按钮 ——
        this._continueBtn = new Node('ContinueBtn');
        this._continueBtn.setParent(this._panelNode);
        const cBtnT = this._continueBtn.addComponent(UITransform);
        cBtnT.setContentSize(200, 60);
        this._continueBtn.setPosition(0, -100, 0);
        const cBtnGfx = this._continueBtn.addComponent(Graphics);
        cBtnGfx.fillColor = new Color(200, 140, 80, 255);
        cBtnGfx.rect(-100, -30, 200, 60);
        cBtnGfx.fill();
        cBtnGfx.strokeColor = new Color(140, 80, 40, 255);
        cBtnGfx.lineWidth = 2;
        cBtnGfx.rect(-100, -30, 200, 60);
        cBtnGfx.stroke();
        const cBtnLbl = this.makeLabel('ContinueLbl', '继续', 26, new Color(255, 255, 255), this._continueBtn, 0, 0, 200, 40);
        this._continueBtn.active = false;
        this._continueBtn.on(Node.EventType.TOUCH_END, () => {
            this.close();
        });

        // —— 操作网格 ——
        this._actionGrid = new Node('ActionGrid');
        this._actionGrid.setParent(this._panelNode);
        const agT = this._actionGrid.addComponent(UITransform);
        agT.setContentSize(640, 180);
        this._actionGrid.setPosition(0, -300, 0);

        const actions = [
            { id: 'attack', name: '攻击', color: new Color(200, 60, 40) },
            { id: 'skill', name: '技能', color: new Color(60, 120, 200) },
            { id: 'item', name: '道具', color: new Color(60, 160, 80) },
            { id: 'flee', name: '逃跑', color: new Color(150, 150, 150) },
        ];

        for (let i = 0; i < actions.length; i++) {
            const btn = this.makeActionBtn(actions[i], i);
            btn.setParent(this._actionGrid);
        }

        this.node.active = false;
    }

    private makeActionBtn(cfg: { id: string; name: string; color: Color }, idx: number): Node {
        const btn = new Node(`Btn_${cfg.id}`);
        const t = btn.addComponent(UITransform);
        t.setContentSize(140, 150);
        const spacing = 160;
        btn.setPosition((idx - 1.5) * spacing, 0, 0);

        const gfx = btn.addComponent(Graphics);
        gfx.fillColor = new Color(cfg.color.r, cfg.color.g, cfg.color.b, 220);
        gfx.rect(-70, -75, 140, 150);
        gfx.fill();
        gfx.strokeColor = new Color(255, 255, 255, 200);
        gfx.lineWidth = 2;
        gfx.rect(-70, -75, 140, 150);
        gfx.stroke();

        const lbl = new Node('Label');
        lbl.setParent(btn);
        const lT = lbl.addComponent(UITransform);
        lT.setContentSize(120, 40);
        lbl.setPosition(0, 0, 0);
        const lComp = lbl.addComponent(Label);
        lComp.string = cfg.name;
        lComp.fontSize = 26;
        lComp.color = new Color(255, 255, 255, 255);

        btn.on(Node.EventType.TOUCH_END, () => {
            if (!this._combat.state || this._combat.state.ended) return;
            switch (cfg.id) {
                case 'attack':
                    this._combat.attack();
                    break;
                case 'skill':
                    this.showSkillGrid();
                    return; // 技能选择由子网格接管
                case 'item':
                    this.showItemGrid();
                    return;
                case 'flee':
                    this._combat.flee();
                    break;
            }
            this.refreshUI();
        });

        return btn;
    }

    /** 弹出技能选择子网格（含冷却显示 + 防御/敏捷姿态技能） */
    private showSkillGrid(): void {
        if (!this._combat.state || this._combat.state.ended) return;
        const skill = this._gm.skill;
        const cds = this._combat.state.cds || {};

        // 全部可学战斗技能（被动数值 + 主动效果）
        const allSkills: { id: string; name: string }[] = [
            { id: 'melee', name: '格斗' },
            { id: 'magic', name: '魔法' },
            { id: 'shot', name: '射击' },
            { id: 'def', name: '防御' },
            { id: 'agile', name: '敏捷' },
        ];
        const availableSkills = allSkills.filter(s => (skill[s.id] || 0) > 0);

        if (availableSkills.length === 0) {
            // 没有战斗技能，弹出提示（不消耗回合）
            const root = this.node.scene;
            const dialogPanel = root.getComponentInChildren(DialogPanel);
            if (dialogPanel) {
                dialogPanel.node.setSiblingIndex(dialogPanel.node.parent!.children.length - 1);
                dialogPanel.show('提示', [{ label: '你没有可用的战斗技能', data: null }], () => {});
            }
            return;
        }

        // 弹出技能选择弹窗（显示等级与冷却）
        const options = availableSkills.map(s => {
            const lv = skill[s.id];
            const cd = cds[s.id] || 0;
            const label = cd > 0
                ? `${s.name} 等级${lv} (冷却${cd})`
                : `${s.name} 等级${lv}`;
            return {
                label,
                data: s.id,
                disabled: cd > 0,
            };
        });

        // 通过类构造器查找 DialogPanel（字符串查找在 Cocos 3.x 中不可靠）
        const root = this.node.scene;
        const dialogPanel = root.getComponentInChildren(DialogPanel);
        if (dialogPanel) {
            // 将弹窗节点提升到最上层，避免被战斗面板遮挡
            dialogPanel.node.setSiblingIndex(dialogPanel.node.parent!.children.length - 1);
            dialogPanel.show('选择技能', options, (data: string) => {
                const res = this._combat.useSkill(data);
                if (res && res.includes('冷却中')) {
                    // 冷却中点了（理论上 disabled 已拦截），刷新日志
                    this._combat.state?.log.push(res);
                }
                this.refreshUI();
            });
        }
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
            // 可使用的道具（食物/药剂/有 effect 的）
            const canUse = !!(d as any).effect || d.type === 'food' || d.type === 'cooked' || d.type === 'potion';
            if (canUse) {
                healItems.push({ id: itemId, name: `${d.name} ×${bag[itemId]}`, count: bag[itemId] });
            }
        }

        if (healItems.length === 0) {
            // 没有可用道具
            this._combat.state.log.push('背包中没有可用道具！');
            this.refreshUI();
            return;
        }

        const options = healItems.map(h => ({
            label: h.name,
            data: h.id,
        }));

        const root = this.node.scene;
        const dialogPanel = root.getComponentInChildren(DialogPanel);
        if (dialogPanel) {
            // 将弹窗节点提升到最上层，避免被战斗面板遮挡
            dialogPanel.node.setSiblingIndex(dialogPanel.node.parent!.children.length - 1);
            dialogPanel.show('使用道具', options, (data: string) => {
                this._combat.useItem(data);
                this.refreshUI();
            });
        }
    }

    /** 刷新 UI */
    private refreshUI(): void {
        const s = this._combat.state;
        if (!s) { this.close(); return; }

        // 怪物
        if (this._mstNameLabel) this._mstNameLabel.string = s.mstName;
        if (this._mstHpLabel) this._mstHpLabel.string = `生命 ${Math.max(0, Math.round(s.mstHp))} / ${s.mstMaxHp}`;
        this.updateHpBar(this._mstHpBar!, this._mstHpBarGfx!, Math.max(0, s.mstHp), s.mstMaxHp, new Color(200, 60, 40, 255));

        // 玩家
        if (this._playerHpLabel) this._playerHpLabel.string = `生命 ${Math.max(0, Math.round(s.playerCurHp))} / ${s.playerMaxHp}`;
        this.updateHpBar(this._playerHpBar!, this._playerHpBarGfx!, Math.max(0, s.playerCurHp), s.playerMaxHp, new Color(60, 180, 60, 255));

        // 战斗日志
        this.refreshLog(s);

        // 结果状态
        if (s.ended) {
            if (this._actionGrid) this._actionGrid.active = false;
            if (this._resultLabel) {
                this._resultLabel.node.active = true;
                this._resultLabel.string = s.win ? '🎉 胜利！' : '💀 被击败了…';
                this._resultLabel.color = s.win ? new Color(40, 140, 40, 255) : new Color(200, 40, 40, 255);
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
        gfx.rect(0, -12, 500 * ratio, 24);
        gfx.fill();
    }

    private refreshLog(s: CombatState): void {
        if (!this._logContent) return;
        // 清空
        for (const c of [...this._logContent.children]) c.destroy();

        const recent = s.log.slice(-5); // 只显示最近 5 条
        for (let i = 0; i < recent.length; i++) {
            const line = new Node(`Log_${i}`);
            line.setParent(this._logContent);
            const lT = line.addComponent(UITransform);
            lT.setContentSize(580, 36);
            lT.setAnchorPoint(0.5, 1);
            line.setPosition(0, -i * 38, 0);
            const lbl = line.addComponent(Label);
            lbl.string = recent[i];
            lbl.fontSize = 18;
            lbl.lineHeight = 26;
            lbl.color = new Color(220, 210, 190, 255);
        }
    }

    private close(): void {
        this._combat.clear();
        this.node.active = false;
        if (this.onEnd) {
            const win = this._combat.state?.win ?? false;
            this._combat.clear();
            this.onEnd(win);
        }
    }

    private get _gm() { return GameManager.instance; }

    private makeLabel(name: string, text: string, fontSize: number, color: Color, parent: Node, x: number, y: number, w: number, h: number): Label {
        const node = new Node(name);
        node.setParent(parent);
        const t = node.addComponent(UITransform);
        t.setContentSize(w, h);
        node.setPosition(x, y, 0);
        const lbl = node.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.color = color;
        return lbl;
    }
}
