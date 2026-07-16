/**
 * MainScene.ts - 主场景控制器
 * 初始化一级网格（主页），定义各功能入口的跳转逻辑
 */

import { _decorator, Component, Node, Label, Color, UITransform, view, ResolutionPolicy, Layers, Camera, Vec3, Graphics, Widget } from 'cc';
import { GridNavigator } from '../core/GridNavigator';
import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { SaveManager } from '../core/SaveManager';
import { CloudSaveProvider } from '../core/CloudSaveProvider';
import { TimeSystem } from '../systems/TimeSystem';
import { ActionCraft } from '../actions/ActionCraft';
import { ActionItem } from '../actions/ActionItem';
import { ActionBuilding } from '../actions/ActionBuilding';
import { ActionCook } from '../actions/ActionCook';
import { ActionTrade } from '../actions/ActionTrade';
import { ActionSkill } from '../actions/ActionSkill';
import { ActionMap } from '../actions/ActionMap';
import { ActionDungeon } from '../actions/ActionDungeon';
import { ActionCombat } from '../actions/ActionCombat';
import { ActionEvent } from '../actions/ActionEvent';
import { ActionBrew } from '../actions/ActionBrew';
import { ActionExecutor } from '../actions/ActionExecutor';
import { DialogPanel, DialogOption } from './DialogPanel';
import { BagPanel } from './BagPanel';
import { BattlePanel } from './BattlePanel';
import { Toast } from './Toast';
import { SaveIndicator } from './SaveIndicator';
import { GridPage, GridCellData } from '../data/types';
import {
    BUILDING_DATA,
    SKILL_DATA,
    ITEM_DATA,
    TRADE_DATA,
    MAKE_DATA,
    ALCHEMY_DATA,
    MAGIC_DATA,
    SCIENCE_DATA,
    COOK_DATA,
    PLACE_DATA,
    MST_DATA,
    EVENT_DATA,
    DUNGEON_DATA,
    ALCO_DATA,
    EQUIP_TYPE_DATA,
    BAG_BASE_SIZE,
    BUILDING_UPDATE_DATA,
    CROP_DATA,
    TRAP_DATA,
} from '../data/data';

const { ccclass, property } = _decorator;

/** 物品类型 → 中文显示名（物品详情弹窗中"类型"字段） */
const ITEM_TYPE_LABEL: Record<string, string> = {
    tool: '工具',
    food: '食物',
    cooked: '熟食',
    met: '材料',
    mat: '材料',
    material: '材料',
    quest: '任务道具',
    bullet: '弹药',
    equip: '装备',
    weapon: '武器',
    head: '头部装备',
    body: '身体装备',
    foot: '足部装备',
    poizon: '毒药',
    securityBox: '保险箱',
    makeSpeed: '制造加速',
    collectDec: '采集减耗',
    trapGet: '陷阱收获',
    trapChance: '陷阱几率',
    lockUpdate: '开锁升级',
    cookerUpdate: '烹饪升级',
    unknownBonus: '未知加成',
    durableUpdate: '耐久升级',
    magicDurableUpdate: '魔法耐久',
    bagSizeBonus: '背包扩容',
    trapSizeBonus: '陷阱扩容',
    farmSizeBonus: '农田扩容',
    alcoSizeBonus: '酿酒扩容',
    bigBoxSizeBonus: '大箱扩容',
    mapBonus: '地图加成',
    beaconMax: '信标上限',
    wellBonus: '水井加成',
    showerPlace: '淋浴场所',
    sleepPlace: '睡眠场所',
    art: '艺术品',
    special: '特殊',
};

/** 状态键 → 中文显示名（物品"效果"字段，如 full/moist/san/temp/hp） */
const STATE_LABEL: Record<string, string> = {
    hp: '生命',
    full: '饱腹',
    moist: '水分',
    san: '精神',
    temp: '体温',
    mp: '魔力',
    str: '力量',
    def: '防御',
    agi: '敏捷',
    luck: '幸运',
};

@ccclass('MainScene')
export class MainScene extends Component {
    private get _navigator(): GridNavigator { return GridNavigator.instance; }
    private get _gm(): GameManager { return GameManager.instance; }
    private get _eventBus(): EventBus { return EventBus.instance; }
    private get _saveMgr(): SaveManager { return SaveManager.instance; }
    private get _timeSys(): TimeSystem { return TimeSystem.instance; }

    /** 是否在户外（已出门进入地图/地点）——用于控制底栏第3按钮显示「出门」或「回家」 */
    private _isOutdoors: boolean = false;
    /** 本次出门随机摇出的在场商人 key 列表（回家清空，再出门重摇；保证出门期间稳定） */
    private _rolledTraders: string[] = [];
    /** 底栏第3个按钮（出门/回家）的 Label 引用，用于动态改文字 */
    private _goBtnLabel: Label | null = null;

    /** 最近一次动作反馈（显示在各面板；赋值时自动弹 Toast + 立即存档） */
    private _lastMsgValue: string = '';
    private get _lastMsg(): string { return this._lastMsgValue; }
    private set _lastMsg(v: string) {
        this._lastMsgValue = v;
        if (v) {
            Toast.instance?.show(v);
            this._saveMgr.save(); // 行为反馈时立即存档，确保数据及时落盘
        }
    }

    /** 创建全局 Toast 弹窗（Canvas 下置顶，跨页面常驻） */
    private createToast(): void {
        const toastNode = new Node('Toast');
        toastNode.layer = this.node.layer;
        const canvas = this.node.scene?.getChildByName('Canvas');
        if (canvas) {
            canvas.addChild(toastNode);
            toastNode.setSiblingIndex(canvas.children.length - 1); // 置顶
        } else {
            this.node.addChild(toastNode);
            toastNode.setSiblingIndex(this.node.children.length - 1);
        }
        toastNode.setPosition(0, 360, 0); // 屏幕中上部
        toastNode.addComponent(Toast);    // onLoad 内自动构建背景/文字/透明
    }

    /** 创建常驻角落存档状态指示器（保存中↔已保存，静默不弹窗） */
    private createSaveIndicator(): void {
        const node = new Node('SaveIndicator');
        node.layer = this.node.layer;
        const canvas = this.node.scene?.getChildByName('Canvas');
        if (canvas) {
            canvas.addChild(node);
            node.setSiblingIndex(canvas.children.length - 1); // 置顶（仍在 Toast 之下由创建顺序保证）
        } else {
            this.node.addChild(node);
            node.setSiblingIndex(this.node.children.length - 1);
        }
        // 右下角：x 靠右、y 在底部快捷栏上方
        node.setPosition(285, -560, 0);
        node.addComponent(SaveIndicator);  // onLoad 内自动构建

        // 接线：SAVE_START→保存中，SAVE_COMPLETE→已保存
        this._eventBus.on(GameEvents.SAVE_START, () => {
            SaveIndicator.instance?.showSaving();
        });
        this._eventBus.on(GameEvents.SAVE_COMPLETE, (savedAt: number, ok: boolean = true) => {
            let t: string | undefined;
            if (savedAt && ok) {
                const d = new Date(savedAt);
                const p = (n: number) => (n < 10 ? '0' + n : '' + n);
                t = `${p(d.getHours())}:${p(d.getMinutes())}`;
            }
            SaveIndicator.instance?.showSaved(t, ok);
        });

        // 初始文案：若本地已有存档则显示上次保存时间
        const last = this._saveMgr.localSavedAt;
        if (last) {
            const d = new Date(last);
            const p = (n: number) => (n < 10 ? '0' + n : '' + n);
            SaveIndicator.instance?.setInitial(`已保存 · ${p(d.getHours())}:${p(d.getMinutes())}`);
        } else {
            SaveIndicator.instance?.setInitial('已保存');
        }
    }

    /** 操作弹窗面板 */
    private _dialogPanel: DialogPanel | null = null;

    /** 背包弹窗面板（独立于导航栈的模态） */
    private _bagPanel: BagPanel | null = null;

    /** 战斗面板 */
    private _battlePanel: BattlePanel | null = null;

    /** 是否已死亡（防止死亡界面重复触发） */
    private _isDead: boolean = false;

    /** 底部快捷操作栏 */
    private _bottomBar: Node | null = null;

    @property(Node)
    statusBarNode: Node | null = null;

    onLoad(): void {
        // 设置适配模式：SHOW_ALL 保持 750×1334 宽高比，非竖屏窗口留黑边但全部可见
        view.setDesignResolutionSize(750, 1334, ResolutionPolicy.SHOW_ALL);

        // 尝试加载存档
        if (!this._saveMgr.load()) {
        }

        // 启动自动存档
        this._saveMgr.startAutoSave(60000);

        // 监听玩家死亡
        this._eventBus.on(GameEvents.PLAYER_DEATH, this.onPlayerDeath.bind(this));
    }

    /** start 在所有组件 onLoad 之后执行，确保 GridComponent 已注册监听 */
    start(): void {
        // 先创建常驻存档指示器（早于 Toast，保证 Toast 在最顶层）
        this.createSaveIndicator();

        // 创建全局 Toast（置顶），确保后续 _lastMsg 赋值能即时弹窗
        this.createToast();

        // 诊断并修复 UI Camera
        this.setupUICamera();

        // 初始化一级网格（发出 UI_REFRESH 事件）
        this.initHomeGrid();

        // 创建背包弹窗（先于 DialogPanel 创建，物品操作弹窗层级更高）
        const bagNode = new Node('BagPanel');
        bagNode.layer = this.node.layer;
        this._bagPanel = bagNode.addComponent(BagPanel);
        this.node.addChild(bagNode);

        // 创建操作弹窗
        const dialogNode = new Node('DialogPanel');
        dialogNode.layer = this.node.layer;
        this._dialogPanel = dialogNode.addComponent(DialogPanel);
        this.node.addChild(dialogNode);

        // 创建战斗面板
        const battleNode = new Node('BattlePanel');
        battleNode.layer = this.node.layer;
        this._battlePanel = battleNode.addComponent(BattlePanel);
        this._battlePanel.onEnd = (win) => this.onBattleEnd(win);
        this.node.addChild(battleNode);

        // 创建底部快捷操作栏（固定在屏幕底部，不受 ScrollView 滚动影响）
        this.createBottomBar();

        // 注册导航变化回调：返回主页时同步底栏「出门/回家」按钮状态
        this._navigator.onChange = () => this.onNavChanged();

        // 启动后检测云端是否有更新的存档（非阻塞）
        void this.checkCloudOnLaunch();

        // 换季提示
        this._eventBus.on(GameEvents.SEASON_CHANGE, this.onSeasonChange.bind(this));
    }

    /** 换季公告（冬季预警停产，春季恢复） */
    private onSeasonChange(season: number): void {
        const names = ['春', '夏', '秋', '冬'];
        const name = names[season] ?? '春';
        let msg = `${name}季来临。`;
        if (season === 3) {
            msg += '土地封冻，农田与井水停产，请靠交易、拾荒、狩猎与陷阱求生。';
        } else if (season === 0) {
            msg += '大地回春，农田与井水恢复生产。';
        }
        this._lastMsg = msg;
        this._dialogPanel?.show(
            `${name}季`,
            [{ label: '知道了', data: 'ok' }],
            () => {},
            () => {}
        );
    }

    /** 启动后检测云端新存档，若有则弹窗询问是否覆盖本地 */
    private async checkCloudOnLaunch(): Promise<void> {
        if (!CloudSaveProvider.instance.enabled) return;
        const offer = await this._saveMgr.shouldOfferCloudRestore();
        if (!offer) return;
        const meta = await CloudSaveProvider.instance.fetchMeta();
        const timeStr = meta?.updatedAt ? this._fmtCloudTime(meta.updatedAt) : '未知时间';
        this._dialogPanel?.show(
            '发现云端存档',
            [
                { label: '下载云端存档', data: 'download', desc: `云端存档更新于 ${timeStr}，将覆盖当前本地进度` },
                { label: '保留本地进度', data: 'ignore', desc: '忽略云端，继续使用当前本地进度' },
            ],
            async (data: string) => {
                if (data === 'download') {
                    const ok = await this._saveMgr.downloadFromCloud();
                    this._lastMsg = ok ? '已从云端恢复存档' : '云端恢复失败';
                    if (ok) this._eventBus.emit(GameEvents.UI_REFRESH);
                } else {
                    this._lastMsg = '已保留本地进度';
                }
                this.refreshGrid();
            },
            () => {
                this._lastMsg = '已保留本地进度';
                this.refreshGrid();
            }
        );
    }

    /** 重新渲染当前所在网格页（云存档恢复后刷新 UI） */
    private refreshGrid(): void {
        this._eventBus.emit(GameEvents.UI_REFRESH);
    }

    private _fmtCloudTime(t: number): string {
        const d = new Date(t);
        const p = (n: number) => (n < 10 ? '0' + n : '' + n);
        return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /** 创建底部固定快捷操作栏（休息 / 背包 / 状态） */
    private createBottomBar(): void {
        // 防重入：如果已创建则跳过
        if (this._bottomBar && this._bottomBar.isValid) return;

        const BAR_H = 70;
        const BTN_W = 155;            // 4 按钮均分 700px：spacing=(700-620)/5=16
        const BTN_H = 50;

        // 容器
        this._bottomBar = new Node('BottomBar');
        this._bottomBar.layer = this.node.layer;
        const barTf = this._bottomBar.addComponent(UITransform);
        barTf.setContentSize(700, BAR_H);
        barTf.setAnchorPoint(0.5, 0.5);   // 还原默认锚点

        // 挂载到 Canvas 下（有固定尺寸，定位基准正确）
        const canvas = this.node.scene?.getChildByName('Canvas');
        if (canvas) {
            canvas.addChild(this._bottomBar);
        } else {
            this.node.addChild(this._bottomBar);
        }

        // 绝对坐标定位（不依赖 Widget，避免 ScrollView 边界缓存失效）
        // 设计分辨率 750×1334，锚点默认(0.5,0.5)，Canvas 中心为原点
        const BOTTOM_MARGIN = 3;
        this._bottomBar.setPosition(0, -1334 / 2 + BAR_H / 2 + BOTTOM_MARGIN, 0);

        // 提升渲染层级（确保在最上层不被其他 UI 遮挡）
        if (this._bottomBar.parent) {
            this._bottomBar.setSiblingIndex(this._bottomBar.parent.children.length - 1);
        }

        // 背景（暖色）
        const gfx = this._bottomBar.addComponent(Graphics);
        const bg = new Color(255, 248, 240, 255);
        const border = new Color(200, 168, 130, 255);
        gfx.fillColor = bg;
        gfx.rect(-350, -BAR_H / 2, 700, BAR_H);
        gfx.fill();
        gfx.strokeColor = border;
        gfx.lineWidth = 1.5;
        gfx.rect(-350, -BAR_H / 2, 700, BAR_H);
        gfx.stroke();

        // 按钮定义（4 个：休息/背包/出门/菜单）
        const buttons: { label: string; action: () => void }[] = [
            { label: '休息', action: () => this.onBottomAction('rest') },
            { label: '背包', action: () => this.onBottomAction('bag') },
            { label: '出门', action: () => this.onBottomAction('goout') },
            { label: '菜单', action: () => this.onBottomAction('menu') },
        ];

        const spacing = (700 - buttons.length * BTN_W) / (buttons.length + 1);
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const bx = -350 + spacing + i * (BTN_W + spacing) + BTN_W / 2;
            const by = 0;

            const btnNode = new Node(`Btn_${btn.label}`);
            btnNode.layer = this.node.layer;
            const btnTf = btnNode.addComponent(UITransform);
            btnTf.setContentSize(BTN_W, BTN_H);

            // 按钮背景
            const btnGfx = btnNode.addComponent(Graphics);
            const btnBg = new Color(230, 220, 205, 255);
            const btnBorder = new Color(180, 160, 130, 255);
            btnGfx.fillColor = btnBg;
            btnGfx.rect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H);
            btnGfx.fill();
            btnGfx.strokeColor = btnBorder;
            btnGfx.lineWidth = 1;
            btnGfx.rect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H);
            btnGfx.stroke();

            // 【关键修复3】Label 用独立子节点（避免与 Graphics 同节点渲染冲突导致文字不显示）
            const lblNode = new Node('Lbl');
            lblNode.layer = this.node.layer;
            const lbl = lblNode.addComponent(Label);
            lbl.string = btn.label;
            lbl.fontSize = 20;
            lbl.color = new Color(74, 55, 40, 255); // 深棕
            lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
            lbl.verticalAlign = Label.VerticalAlign.CENTER;
            lbl.overflow = Label.Overflow.CLAMP;
            const lblTf = lblNode.getComponent(UITransform);
            if (lblTf) {
                lblTf.setContentSize(BTN_W, BTN_H);
            }
            lblNode.setPosition(0, 0, 0);

            // 保存第3个按钮（出门/回家）的 Label 引用，供动态切换文字
            if (i === 2) this._goBtnLabel = lbl;

            btnNode.setPosition(bx, by, 0);
            btnNode.addChild(lblNode);     // Label 作为按钮子节点
            this._bottomBar.addChild(btnNode); // 按钮加入底栏

            // 点击事件
            btnNode.on(Node.EventType.TOUCH_END, btn.action);
            btnNode.on(Node.EventType.TOUCH_CANCEL, btn.action);
        }
    }

    /** 刷新底栏第3按钮文字（出门 ↔ 回家） */
    private refreshGoButton(): void {
        if (this._goBtnLabel) {
            this._goBtnLabel.string = this._isOutdoors ? '回家' : '出门';
        }
    }

    /**
     * 导航栈变化时同步底栏「出门/回家」状态。
     * 返回主页（home）时必然不在户外 → 重置为「出门」；
     * 其它情况不动 _isOutdoors（户外页进入时已显式设 true，背包/菜单等从不设，保持原样）。
     * 解决了「出门后点顶部返回页回到主页，但底栏仍显示『回家』」的问题。
     */
    private onNavChanged(): void {
        const cur = this._navigator.current;
        if (cur && (cur as any).home) {
            this._isOutdoors = false;
            this._rolledTraders = []; // 回家清空在场商人，下次出门重新随机
        }
        this.refreshGoButton();
    }

    /** 底部快捷栏按钮处理 —— 标签式导航（清栈后push，不堆叠面包屑） */
    private onBottomAction(action: string): void {
        // 背包为模态弹窗，独立于导航栈：直接打开，不动当前页/面包屑
        if (action === 'bag') {
            this.openBagPanel();
            return;
        }

        // 户外时「出门」按钮已变为「回家」，点击直接回主页（不 popTo 清理后再 push 地图）
        if (action === 'goout' && this._isOutdoors) {
            this._navigator.setRoot(this.buildHomePage());
            return; // buildHomePage 内部已重置 _isOutdoors=false 并刷新按钮
        }

        // 先清到根页，确保栈始终为 [主页, 当前页]，面包屑干净「主页 > xxx」
        this._navigator.popTo(1);

        switch (action) {
            case 'rest':
                // 休息/睡觉 → 复用休息页（床铺恢复 或 原地等待）
                this._navigator.push(this.openRestPage());
                break;
            case 'goout':
                this.openGoOutList();
                break;
            case 'menu':
                this.openMenuGrid();
                break;
        }
    }

    /** 床铺详情页（原版 UI：等级显示 + 睡觉操作 + 升级） */
    private openRestPage(): GridPage {
        const hasBed = !!this._gm.buildingSaveData['sleepPlace']?.own;
        if (!hasBed) {
            // 未建造 → 提示去建造
            return {
                title: '休息',
                breadcrumb: '主页 > 休息',
                columns: 1,
                cells: [
                    { id: 'hint', name: '你还没有床铺\n请先在「建造」中建造一个', state: 'disabled', type: 'list' },
                    { id: 'goBuild', name: '前往建造', state: 'normal', type: 'list' },
                ],
                onCellClick: (idx, cell) => {
                    if (cell.id === 'goBuild') {
                        this._navigator.pop();
                        this.openBuildList();
                    }
                },
            };
        }

        // ===== 已建床铺：等级 + 睡觉 + 升级 =====
        const level = this._gm.getBuildingLevel('sleepPlace');
        const updateGroup = BUILDING_UPDATE_DATA['sleepPlaceUpdate'];
        // 等级键顺序：bed_1(0), bed_2(1), bed_3(2), bed_4(3)
        const levelKeys = updateGroup ? Object.keys(updateGroup) : [];
        const currentLevelName = level >= levelKeys.length ? '已满级' :
            (level === 0 ? '地板' : ITEM_DATA[levelKeys[level - 1]]?.name || `Lv.${level}`);
        const nextLevelId = levelKeys[level];
        const canUpgrade = !!(updateGroup && nextLevelId);

        const cells: GridCellData[] = [];

        // ── 顶行：当前等级 ──
        cells.push({ id: 'levelInfo', name: `当前床铺等级：${currentLevelName}`, state: 'disabled', type: 'list' });

        // ── 睡觉操作（恢复量按等级递增，不直接回满） ──
        // 等级恢复表：[体力恢复, 精神恢复, 推进小时]
        const REST_TABLE: [number, number, number][] = [
            [15, 10, 1],   // Lv0 地板
            [25, 18, 1],  // Lv1 木床
            [35, 25, 1],  // Lv2 弹簧床
            [50, 35, 1],  // Lv3 大床
        ];
        const restIdx = Math.min(level, REST_TABLE.length - 1);
        const [restPs, restSan, restHours] = REST_TABLE[restIdx];
        cells.push({
            id: 'sleep',
            name: `[睡觉]  恢复约 +${restPs}体力 +${restSan}精神  推进${restHours}小时`,
            state: 'normal',
            type: 'list',
            noTruncate: true,
            data: { restPs, restSan, restHours },
        });

        // ── 升级区（有下一级时显示） ──
        if (canUpgrade && nextLevelId) {
            const upData = updateGroup[nextLevelId];
            const nextItem = ITEM_DATA[nextLevelId];
            const reqParts = Object.entries(upData.require || {})
                .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`)
                .join(' ');
            cells.push({
                id: `upgrade_${nextLevelId}`,
                name: `${nextItem?.name || nextLevelId}    ${reqParts || ''}\n${nextItem?.desc || ''}`,
                state: this._gm.checkHaveResource(upData.require || {}) ? 'normal' : 'disabled',
                type: 'list',
                noTruncate: true,
                data: { action: 'upgrade', targetId: nextLevelId },
            });
        } else if (!canUpgrade && level > 0) {
            cells.push({ id: 'maxed', name: '床铺已达最高等级', state: 'disabled', type: 'list' });
        }

        // ── 返回 ──
        cells.push({ id: 'back', name: '返回', state: 'normal', type: 'list' });

        return {
            title: '床铺',
            breadcrumb: '主页 > 床铺',
            columns: 1,
            cells,
            onCellClick: (idx, cell) => {
                if (cell.id === 'sleep') {
                    // 睡觉：按床铺等级定量恢复，推进时间
                    const d = cell.data as any;
                    const rp = d.restPs || 15;
                    const rs = d.restSan || 10;
                    const rh = d.restHours || 1;
                    const oldPs = this._gm.playerState.ps;
                    const oldSan = this._gm.playerState.san;
                    // 增量加法，上限100
                    this._gm.playerStateChange({
                        ps: Math.min(oldPs + rp, 100),
                        san: Math.min(oldSan + rs, 100),
                    });
                    this._timeSys.advance(rh);
                    const actualPs = Math.min(rp, 100 - oldPs);
                    const actualSan = Math.min(rs, 100 - oldSan);
                    this._lastMsg = `你在${currentLevelName}上睡了一觉，恢复了 ${actualPs} 点体力和 ${actualSan} 点精神`;
                    this._navigator.replace(this.openRestPage());
                    this._eventBus.emit(GameEvents.UI_REFRESH);
                } else if (cell.data?.action === 'upgrade') {
                    const r = ActionBuilding.instance.upgrade('sleepPlaceUpdate', cell.data.targetId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.openRestPage());
                } else if (cell.id === 'back') {
                    this._navigator.pop();
                }
            },
        };
    }

    /** 检查并设置 UI Camera */
    private setupUICamera(): void {
        const canvas = this.node.scene.getChildByName('Canvas');
        if (!canvas) {
            return;
        }

        // 检查场景中所有 Camera
        const cameras = this.node.scene.getComponentsInChildren(Camera);

        if (cameras.length > 0) {
            const cam = cameras[0];

            // 如果 Camera 不渲染 UI_2D，加上
            if ((cam.visibility & Layers.Enum.UI_2D) === 0) {
                cam.visibility = cam.visibility | Layers.Enum.UI_2D;
            }

            // 改为正交投影（projection=0），适合 2D UI 渲染
            if (cam.projection !== 0) {
                cam.projection = 0;
            }
        } else {
            // 没有 Camera，创建一个
            const cameraNode = new Node('UICamera');
            cameraNode.layer = Layers.Enum.UI_2D;
            const cam = cameraNode.addComponent(Camera);
            cam.projection = 0; // ORTHO
            cam.visibility = Layers.Enum.UI_2D;
            cam.priority = 1 << 30;
            cameraNode.setParent(canvas);
            cameraNode.setPosition(0, 0, 1000);
        }
    }

    /** 初始化主页一级网格 */
    private initHomeGrid(): void {
        this._navigator.setRoot(this.buildHomePage());
    }

    /** 一级网格点击处理（首页 + 设施入口） */
    private onHomeCellClick(id: string): void {
        this._lastMsg = ''; // 切换系统时清空旧反馈

        // 已建设施入口 → 对应功能（已建设施直接打开详情弹窗，跳过中间列表页）
        const facilityRoutes: Record<string, () => void> = {
            home_craft:   () => this.openCraftGrid('makeTable'),
            home_alchemy: () => this.openCraftGrid('alchemyTable'),
            home_magic:   () => this.openCraftGrid('magicTable'),
            home_science: () => this.openCraftGrid('scienceTable'),
            home_cook:    () => this.openCookPanel(),
            home_farm:    () => this.openBuildingGrid(), // 农田在建筑详情里管理种植/收获
            home_alco:    () => this.openBrewPanel(),
            home_trap:    () => this.openBuildingGrid(), // 陷阱检查在建筑详情
            home_box:     () => this.openBagPanel(),      // 大箱子=背包弹窗
            home_well:    () => this.openBuildingGrid(), // 取水在建筑详情
            home_toilet:  () => this.openBuildingGrid(),
            home_sleep:   () => this._navigator.push(this.openRestPage()),
        };
        if (facilityRoutes[id]) { facilityRoutes[id](); return; }

        switch (id) {
            case 'build': this.openBuildList(); break;
            case 'goOut': this.openGoOutList(); break;
            case 'menu': this.openMenuGrid(); break;
            // 以下为菜单内直达快捷方式（保留兼容）
            case 'bag': this.openBagPanel(); break;
            case 'craft': this.openCraftGrid(); break;
            case 'cook': this.openCookPanel(); break;
            case 'building': this.openBuildingGrid(); break;
            case 'map': this.openMapGrid(); break;
            case 'skill': this.openSkillGrid(); break;
            case 'dungeon': this.openDungeonGrid(); break;
            case 'quest': this.openQuestGrid(); break;
            case 'battle': this.openBattleGrid(); break;
            case 'equip': this.openEquipPanel(); break;
        }
    }

    // ===== 状态面板（非网格，弹窗）=====
    private openStatePanel(): void {
        const s = this._gm.playerState;
        const cells: GridCellData[] = [
            { id: 'hp', name: `生命 ${Math.round(s.hp)}`, state: 'normal' },
            { id: 'full', name: `满腹 ${Math.round(s.full)}`, state: 'normal' },
            { id: 'moist', name: `水分 ${Math.round(s.moist)}`, state: 'normal' },
            { id: 'ps', name: `体力 ${Math.round(s.ps)}`, state: 'normal' },
            { id: 'san', name: `精神 ${Math.round(s.san)}`, state: 'normal' },
            { id: 'temp', name: `体温 ${s.temp}`, state: 'normal' },
        ];
        this._navigator.push({
            title: '状态',
            breadcrumb: '状态',
            columns: 4,
            cells,
        });
    }

    // ===== 背包 =====
    /** 构建背包格子列表（供 push 与 rebuild 共用） */
    private buildBagCells(): GridCellData[] {
        const bag = this._gm.boxSaveData['bag'] || {};
        const equippedIds = new Set(Object.values(this._gm.currentEquip).filter(Boolean) as string[]);
        const cells: GridCellData[] = Object.keys(bag).map(itemId => {
            const baseName = ITEM_DATA[itemId]?.name || itemId;
            const isEquipped = equippedIds.has(itemId);
            const item = ITEM_DATA[itemId];
            // 工具/武器类展示耐久度条（未初始化视为满耐久）
            let durability: { cur: number; max: number } | undefined;
            if (item && item.durable !== undefined) {
                // 0 视为未初始化（旧 DURABLE_INIT 预置 / 尚未装备），按满耐久显示
                durability = { cur: this._gm.durableSaveData[itemId] || item.durable, max: item.durable };
            }
            return {
                id: itemId,
                name: isEquipped ? `${baseName}\n[已装备]` : baseName,
                count: bag[itemId],
                state: 'normal' as const,
                data: itemId,
                durability,
            };
        });
        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '背包是空的', state: 'disabled' });
        }
        return cells;
    }

    /**
     * 打开背包弹窗（模态，独立于导航栈，不污染面包屑「主页 > xxx」）
     * 标题与格子用回调传入，装备/使用/丢弃后 refresh() 原地重建。
     */
    private openBagPanel(): void {
        this._lastMsg = '';
        this._bagPanel?.show(
            () => `背包 (${Object.keys(this._gm.boxSaveData['bag'] || {}).length})`,
            () => this.buildBagCells(),
            (id) => this.onItemClick(id),
        );
    }

    /** 物品点击 → DialogPanel 弹出操作选项 */
    private onItemClick(itemId: string): void {
        const itemData = ITEM_DATA[itemId];
        if (!itemData) return;

        const canUse = !!(itemData as any).effect || itemData.type === 'food' || itemData.type === 'cooked';
        const canEquip = !!(itemData as any).equipType || itemData.type === 'equip' || itemData.type === 'weapon'
            || itemData.type === 'head' || itemData.type === 'body' || itemData.type === 'foot';
        const isEquipped = Object.values(this._gm.currentEquip).includes(itemId);

        // 构建物品信息文本
        const infoLines: string[] = [itemData.name];
        if (itemData.desc) infoLines.push(itemData.desc);
        infoLines.push(`类型: ${ITEM_TYPE_LABEL[itemData.type] || itemData.type || '未知'}`);
        if (itemData.attack) infoLines.push(`攻击: ${itemData.attack}`);
        if (itemData.def) infoLines.push(`防御: ${itemData.def}`);
        if (itemData.heal) infoLines.push(`回复HP: ${itemData.heal}`);
        if ((itemData as any).effect) {
            const eff = (itemData as any).effect as Record<string, number>;
            for (const k in eff) {
                const sign = eff[k] > 0 ? '+' : '';
                infoLines.push(`效果·${STATE_LABEL[k] || k}: ${sign}${eff[k]}`);
            }
        }

        // 操作选项
        const options: DialogOption[] = [];
        // 信息行（disabled 展示）
        for (const line of infoLines) {
            options.push({ label: line, data: null, disabled: true });
        }
        if (isEquipped) {
            // 已装备：仅提供状态标识与卸下，避免同类型重复装备
            options.push({ label: '状态：已装备', data: null, disabled: true });
            options.push({ label: '卸下', data: { action: 'unequip' } });
        } else {
            if (canUse) options.push({ label: '食用', data: { action: 'use' } });
            if (canEquip) options.push({ label: '装备', data: { action: 'equip' } });
            options.push({ label: '丢弃', data: { action: 'drop' } });
        }

        this._dialogPanel?.show(
            `${itemData.name} ×${this._gm.boxSaveData['bag']?.[itemId] || 0}`,
            options,
            (data) => {
                this.onItemAction(data.action, itemId);
            },
            () => {}
        );
    }

    /** 物品具体操作执行（弹窗内回调，执行后刷新当前页面） */
    private onItemAction(action: string, itemId: string): void {
        switch (action) {
            case 'use': {
                const r = ActionItem.instance.use(itemId);
                this._lastMsg = r.message;
                break;
            }
            case 'equip': {
                const r = ActionItem.instance.equip(itemId);
                this._lastMsg = r.message;
                break;
            }
            case 'unequip': {
                // 反查该物品所在槽位后卸下
                let slot: string | null = null;
                for (const k in this._gm.currentEquip) {
                    if (this._gm.currentEquip[k] === itemId) { slot = k; break; }
                }
                if (slot) {
                    const r = ActionItem.instance.unequip(slot);
                    this._lastMsg = r.message;
                }
                break;
            }
            case 'drop': {
                const r = ActionItem.instance.drop(itemId);
                this._lastMsg = r.message;
                break;
            }
        }
        // 操作完成后：背包弹窗原地刷新（[已装备]标记/数量/空态），并广播 UI_REFRESH
        // 让当前导航页（如地点详情的 canGather）随装备变化重算
        this._bagPanel?.refresh();
        this._eventBus.emit(GameEvents.UI_REFRESH);
    }

    // ===== 装备栏 =====
    /** 构建装备栏格子（各槽位当前装备 + 耐久） */
    private buildEquipCells(): GridCellData[] {
        const slots = ['body', 'hand', 'foot', 'head', 'neck'] as const;

        // 武器攻击汇总（含轮回加成）
        const handId = this._gm.currentEquip['hand'];
        let atkInfo = '徒手（攻击 5）';
        if (handId) {
            const w = ITEM_DATA[handId];
            const base = (w?.damage ?? w?.attack ?? 0) + (w?.reiToDmg ? w.reiToDmg * this._gm.maouLevel : 0);
            atkInfo = `武器攻击：${base}`;
        }

        const cells: GridCellData[] = [
            { id: 'summary', name: atkInfo, state: 'disabled' },
        ];

        for (const slot of slots) {
            const itemId = this._gm.currentEquip[slot];
            const item = itemId ? ITEM_DATA[itemId] : null;
            const maxDur = item?.durable;
            const dur = itemId ? (this._gm.durableSaveData[itemId] ?? maxDur) : undefined;
            const durStr = (item && maxDur !== undefined) ? ` [耐久 ${dur}/${maxDur}]` : '';
            const name = item ? item.name : '（空）';
            cells.push({
                id: `equip_${slot}`,
                name: `${EQUIP_TYPE_DATA[slot]}：${name}${durStr}`,
                state: item ? 'normal' : 'disabled',
                data: slot,
            });
        }

        return cells;
    }

    /** 装备栏格子点击：已装备的槽位弹窗可卸下 */
    private onEquipCellClick(cell: GridCellData): void {
        if (!cell.id.startsWith('equip_')) return;
        const slot = cell.data as string;
        const itemId = this._gm.currentEquip[slot];
        if (!itemId) return;
        const item = ITEM_DATA[itemId];

        const options: DialogOption[] = [
            { label: item?.name || '', data: null, disabled: true },
        ];
        if (item?.desc) options.push({ label: item.desc, data: null, disabled: true });
        options.push({ label: '卸下', data: { action: 'unequip', slot } });
        options.push({ label: '返回', data: null });

        this._dialogPanel?.show(
            item?.name || '装备',
            options,
            (data) => {
                if (data && data.action === 'unequip') {
                    const r = ActionItem.instance.unequip(slot);
                    this._lastMsg = r.message;
                    this._navigator.replace({
                        title: '装备',
                        breadcrumb: '装备',
                        columns: 4,
                        cells: this.buildEquipCells(),
                        onCellClick: (index, c) => this.onEquipCellClick(c),
                    });
                }
            },
            () => {}
        );
    }

    /** 打开装备栏 */
    private openEquipPanel(): void {
        this._lastMsg = '';
        this._navigator.push({
            title: '装备',
            breadcrumb: '装备',
            columns: 4,
            cells: this.buildEquipCells(),
            onCellClick: (index, cell) => this.onEquipCellClick(cell),
        });
    }

    // ===== 制造 =====
    /** 构建制造工作台格子列表（供 push 与 rebuild 共用） */
    private buildCraftCells(): GridCellData[] {
        const cells: GridCellData[] = [];
        const workbenches = ['makeTable', 'alchemyTable', 'magicTable', 'scienceTable'];
        for (const wb of workbenches) {
            const built = this._gm.buildingSaveData[wb];
            cells.push({
                id: wb,
                name: BUILDING_DATA[wb]?.name || wb,
                state: built ? 'normal' : 'disabled',
                data: wb,
            });
        }
        return cells;
    }

    private openCraftGrid(workbench?: string): void {
        // 如果指定了工作台且已建设 → 跳过列表页，直接打开配方弹窗
        if (workbench && this._gm.buildingSaveData[workbench]) {
            this.openRecipeGrid(workbench);
            return;
        }

        this._lastMsg = ''; // 进入制造时清空旧反馈，防止跨系统串显
        this._navigator.push({
            title: '制造',
            breadcrumb: '制造',
            columns: 4,
            cells: this.buildCraftCells(),
            rebuild: () => this.buildCraftCells(),
            onCellClick: (index, cell) => this.openRecipeGrid(cell.id),
        });
    }

    /** 获取工作台对应的配方表 */
    private getRecipeData(workbench: string): Record<string, any> {
        switch (workbench) {
            case 'makeTable': return MAKE_DATA;
            case 'alchemyTable': return ALCHEMY_DATA;
            case 'magicTable': return MAGIC_DATA;
            case 'scienceTable': return SCIENCE_DATA;
            case 'alco': return ALCO_DATA;
            default: return {};
        }
    }

    /** 配方弹窗 */
    private openRecipeGrid(workbench: string): void {
        const recipeData = this.getRecipeData(workbench);

        const options: DialogOption[] = Object.keys(recipeData).map(key => {
            const recipe = recipeData[key];
            const canMake = this._gm.checkHaveResource(recipe.require || {});
            const reqStr = recipe.require && Object.keys(recipe.require).length > 0
                ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '无';
            return {
                label: `${ITEM_DATA[key]?.name || key}  [需求: ${reqStr}]`,
                data: { workbench, recipeId: key, recipe },
                disabled: !canMake,
            };
        });

        this._dialogPanel?.show(
            BUILDING_DATA[workbench]?.name || '制造',
            options,
            (data) => {
                // 先选数量，再制造
                const countOptions: DialogOption[] = [
                    { label: '制造 ×1', data: { ...data, count: 1 } },
                    { label: '制造 ×5', data: { ...data, count: 5 } },
                    { label: '制造 ×10', data: { ...data, count: 10 } },
                    { label: '制造 ×20', data: { ...data, count: 20 } },
                ];
                this._dialogPanel?.show(
                    '选择数量',
                    countOptions,
                    (cd) => {
                        const r = ActionCraft.instance.make(cd.recipeId, recipeData, cd.count);
                        this._lastMsg = r.message;
                        this._eventBus.emit(GameEvents.UI_REFRESH);
                    },
                    () => {}
                );
            },
            () => {}
        );
    }

    /** 配方详情网格（需求/产出/耗时 + 制造按钮） */
    private openRecipeDetail(workbench: string, recipeId: string): void {
        const recipeData = this.getRecipeData(workbench);
        const recipe = recipeData[recipeId];
        if (!recipe) return;

        const requireStr = recipe.require && Object.keys(recipe.require).length > 0
            ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const canMake = this._gm.checkHaveResource(recipe.require || {});

        const cells: GridCellData[] = [
            { id: 'req', name: `需求: ${requireStr}`, state: 'disabled' },
            { id: 'get', name: `产出: ${ITEM_DATA[recipe.get]?.name || recipe.get}×${recipe.amount || 1}`, state: 'disabled' },
            { id: 'time', name: `耗时: ${recipe.timeNeed} 小时`, state: 'disabled' },
            { id: 'make', name: '制造', state: canMake ? 'normal' : 'disabled' },
        ];

        this._navigator.push({
            title: ITEM_DATA[recipeId]?.name || recipeId,
            breadcrumb: ITEM_DATA[recipeId]?.name || recipeId,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'make') {
                    const r = ActionCraft.instance.make(recipeId, recipeData);
                    this._lastMsg = r.message;
                    this._navigator.pop(); // 返回配方列表（材料变化会刷新）
                }
            },
        });
    }

    // ===== 烹饪（两步选择食材 + 配方匹配） =====
    private _cookIngredient1: string | null = null;

    private openCookPanel(): void {
        this._cookIngredient1 = null;
        this._navigator.push(this.buildCookHubPage());
    }

    /** 烹饪主页（炊具箱管理 + 开始烹饪） */
    private buildCookHubPage(): GridPage {
        const cooker = this._gm.boxSaveData['cooker'] || {};
        const cookerItems = Object.keys(cooker).filter(k => (cooker[k] || 0) > 0);
        const cells: GridCellData[] = [];

        cells.push({ id: 'add', name: '添加食材', state: 'normal' });
        cells.push({ id: 'cook', name: '开始烹饪', state: cookerItems.length >= 1 ? 'normal' : 'disabled' });
        cells.push({ id: 'book', name: '📖 菜谱书', state: 'normal' });
        if (cookerItems.length > 0) {
            cells.push({ id: 'clear', name: '清空炊具', state: 'normal' });
            cells.push({ id: 'label', name: '── 炊具内 ──', state: 'disabled' });
            for (const itemId of cookerItems) {
                const d = ITEM_DATA[itemId];
                cells.push({ id: `c_${itemId}`, name: `${d?.name || itemId} ×${cooker[itemId]}`, state: 'disabled' });
            }
        } else {
            cells.push({ id: 'empty', name: '炊具空空如也，先添加食材', state: 'disabled' });
        }

        return {
            title: '烹饪（炊具）',
            breadcrumb: '烹饪',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'add') {
                    this.openCookAdd();
                } else if (cell.id === 'cook') {
                    // 炊具内仅 1 种食材（如尸体/龙鳞）→ 直接匹配单食材配方
                    if (cookerItems.length === 1) {
                        this.showCookResult([cookerItems[0]]);
                    } else {
                        this.openCookStep1();
                    }
                } else if (cell.id === 'book') {
                    this.openRecipeBook();
                } else if (cell.id === 'clear') {
                    for (const itemId of cookerItems) {
                        this._gm.changeItem({ [itemId]: cooker[itemId] }, 'bag');
                    }
                    this._lastMsg = '已清空炊具，食材退回背包';
                    this._navigator.replace(this.buildCookHubPage());
                }
            },
        };
    }

    /** 从背包挑选食材放入炊具 */
    private openCookAdd(): void {
        const bag = this._gm.boxSaveData['bag'] || {};
        const cells: GridCellData[] = [];
        for (const itemId in bag) {
            if (!bag[itemId]) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            const isIngredient = d.type === 'food' || d.type === 'cooked' || d.type === 'mat' || d.type === 'material';
            if (isIngredient) {
                cells.push({ id: itemId, name: `${d.name} ×${bag[itemId]}`, state: 'normal', data: itemId });
            }
        }
        if (cells.length === 0) cells.push({ id: 'empty', name: '背包没有可用食材', state: 'disabled' });

        this._navigator.push({
            title: '添加食材到炊具',
            breadcrumb: '添加食材',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'empty') {
                    this._gm.changeItem({ [cell.id]: 1 }, 'cooker');
                    this._gm.changeItem({ [cell.id]: -1 }, 'bag');
                    this._eventBus.emit(GameEvents.ITEM_CHANGE, 'cooker');
                    this._eventBus.emit(GameEvents.UI_REFRESH);
                    this._navigator.replace(this.buildCookHubPage());
                }
            },
        });
    }


    /** 第二步：选第二个食材 */
    /** 第一步：从炊具箱选第一个食材 */
    private openCookStep1(): void {
        const cooker = this._gm.boxSaveData['cooker'] || {};
        const cells: GridCellData[] = [];
        for (const itemId in cooker) {
            if (!cooker[itemId]) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            cells.push({
                id: itemId,
                name: `${d.name} ×${cooker[itemId]}`,
                state: 'normal',
                data: itemId,
            });
        }
        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '炊具中没有食材', state: 'disabled' });
        }

        this._navigator.push({
            title: '烹饪 · 选择第一种食材',
            breadcrumb: '烹饪1',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'empty') {
                    this._cookIngredient1 = cell.id;
                    this.openCookStep2();
                }
            },
        });
    }

    /** 第二步：从炊具箱选第二个食材（与第一个不同） */
    private openCookStep2(): void {
        const cooker = this._gm.boxSaveData['cooker'] || {};
        const cells: GridCellData[] = [];
        for (const itemId in cooker) {
            if (!cooker[itemId] || itemId === this._cookIngredient1) continue;
            const d = ITEM_DATA[itemId];
            if (!d) continue;
            cells.push({
                id: itemId,
                name: `${d.name} ×${cooker[itemId]}`,
                state: 'normal',
                data: itemId,
            });
        }
        if (cells.length === 0) {
            cells.push({ id: 'none', name: '没有其他食材', state: 'disabled' });
        }

        const name1 = ITEM_DATA[this._cookIngredient1!]?.name || this._cookIngredient1;

        this._navigator.push({
            title: `烹饪 · ${name1} + ?`,
            breadcrumb: '烹饪2',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'none') {
                    this.showCookResult([this._cookIngredient1!, cell.id]);
                }
            },
        });
    }

    /** 第三步：显示匹配的配方（支持任意食材数量，含单食材配方） */
    private showCookResult(ings: string[]): void {
        const nameList = ings.map(id => ITEM_DATA[id]?.name || id);
        const cells: GridCellData[] = [];

        // 查找匹配的配方（食材集合完全一致，顺序无关，长度也一致）
        const ingredients = [...ings].sort();
        const matched: typeof COOK_DATA = [];
        for (const recipe of COOK_DATA) {
            const req = [...recipe.require].sort();
            if (req.length === ingredients.length && req.every((r, i) => r === ingredients[i])) {
                matched.push(recipe);
            }
        }

        if (matched.length === 0) {
            cells.push({ id: 'no_match', name: `${nameList.join(' + ')} 没有匹配的配方`, state: 'disabled' });
        } else {
            for (const recipe of matched) {
                const outName = ITEM_DATA[recipe.name]?.name || recipe.name;
                const requireDict: Record<string, number> = {};
                for (const r of recipe.require) requireDict[r] = (requireDict[r] || 0) + 1;
                const canCook = this._gm.checkHaveResource(requireDict, 'cooker');
                cells.push({
                    id: `cook_${recipe.name}`,
                    name: `${outName}`,
                    state: canCook ? 'normal' : 'disabled',
                    data: recipe,
                });
            }
        }

        this._navigator.push({
            title: nameList.join(' + '),
            breadcrumb: '结果',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.data) {
                    const recipe = cell.data as { name: string; require: string[] };
                    const r = ActionCook.instance.cook(recipe, 1);
                    this._lastMsg = r.message;
                    // 返回炊具主页（食材已扣，可继续烹饪）
                    this._navigator.replace(this.buildCookHubPage());
                }
            },
        });
    }

    /** 配方书：列出全部可烹饪料理（菜名+食用效果+所有配方变体），数据来自 COOK_DATA + ITEM_DATA */
    private openRecipeBook(): void {
        // 按料理名聚合：效果 + 所有配方变体
        const byName: Record<string, { key: string; effect: Record<string, number> | null; variants: string[] }> = {};
        for (const recipe of COOK_DATA) {
            const key = recipe.name;
            if (!byName[key]) {
                byName[key] = {
                    key,
                    effect: (ITEM_DATA[key] && (ITEM_DATA[key] as any).effect) || null,
                    variants: [],
                };
            }
            byName[key].variants.push(recipe.require.map(id => ITEM_DATA[id]?.name || id).join(' + '));
        }

        const cells: GridCellData[] = [];
        for (const key of Object.keys(byName)) {
            const info = byName[key];
            const outName = ITEM_DATA[key]?.name || key;
            const effStr = info.effect ? this.formatEffect(info.effect) : '（无食用效果）';
            const recipeStr = info.variants.join('  /  ');
            const text = `${outName}\n效果: ${effStr}\n配方: ${recipeStr}`;
            cells.push({ id: `rb_${key}`, name: text, state: 'disabled', type: 'list' });
        }

        this._navigator.push({
            title: '📖 菜谱书',
            breadcrumb: '菜谱书',
            columns: 1,
            cells,
            onCellClick: () => {},
        });
    }

    /** 把 effect 对象格式化为中文串，如 {full:15, san:25} → "满腹+15 精神+25" */
    private formatEffect(effect: Record<string, number>): string {
        const cn: Record<string, string> = { full: '满腹', moist: '水分', temp: '体温', san: '精神', hp: '生命', ps: '体力' };
        const parts: string[] = [];
        for (const k of ['full', 'moist', 'temp', 'san', 'hp', 'ps']) {
            if (effect[k] !== undefined) {
                const v = effect[k];
                parts.push(`${cn[k]}${v > 0 ? '+' : ''}${v}`);
            }
        }
        return parts.join(' ') || '—';
    }

    /** 原版首页：动态设施区 + 建造 + 出门 + 菜单 */
    private buildHomePage(): GridPage {
        // 回主页 → 必然不在户外，重置底栏按钮为「出门」
        this._isOutdoors = false;
        this._rolledTraders = []; // 回家清空在场商人，下次出门重新随机
        this.refreshGoButton();

        const cells: GridCellData[] = [];

        // 1. 已建设施动态入口（建了什么出现什么）
        const facilityMap: Record<string, { label: string; id: string }> = {
            makeTable:  { label: '制造台', id: 'home_craft' },
            alchemyTable: { label: '炼金台', id: 'home_alchemy' },
            magicTable:  { label: '秘术台', id: 'home_magic' },
            scienceTable:{ label: '科研台', id: 'home_science' },
            cooker:     { label: '炊具箱', id: 'home_cook' },
            farm:       { label: '农田',   id: 'home_farm' },
            alco:       { label: '酿酒桶', id: 'home_alco' },
            trap:       { label: '陷阱',   id: 'home_trap' },
            bigBox:     { label: '大箱子', id: 'home_box' },
            well:       { label: '水井',   id: 'home_well' },
            toilet:     { label: '厕所',   id: 'home_toilet' },
            sleepPlace: { label: '床铺',   id: 'home_sleep' },
        };
        for (const [key, info] of Object.entries(facilityMap)) {
            if (this._gm.buildingSaveData[key]?.own) {
                // 有新提示？
                const hint = this._gm.buildingSaveData[key]?.hint;
                cells.push({
                    id: info.id,
                    name: hint ? `${info.label} !` : info.label,
                    state: 'normal',
                    data: key,
                });
            }
        }

        // 3. 固定动作按钮（出门/菜单已移到底栏快捷入口，不再重复）
        cells.push({ id: 'build', name: '建造', state: 'normal' });

        return {
            title: '超苦逼冒险者',
            breadcrumb: '主页',
            columns: 4,
            cells,
            home: true,
            onCellClick: (index, cell) => this.onHomeCellClick(cell.id),
        };
    }

    // ===== 建造（网格形式：仅未建建筑，每格展示名称+需求摘要）=====
    private openBuildList(): void {
        const cells: GridCellData[] = [];
        for (const key in BUILDING_DATA) {
            if (key === 'build') continue; // 'build' 是分类入口，非真实建筑
            const d = BUILDING_DATA[key];
            const built = this._gm.buildingSaveData[key]?.own;
            if (built) continue; // 已建的不显示（已在首页动态区）

            const preBuilt = !d.building || this._gm.buildingSaveData[d.building]?.own;
            const hasMat = this._gm.checkHaveResource(d.require || {});
            const canBuild = preBuilt && hasMat;

            // 简短需求摘要：如 "木头×8" 或 "木头×10 零件×4"
            const reqStr = d.require && Object.keys(d.require).length > 0
                ? Object.entries(d.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '';

            cells.push({
                id: `build_${key}`,
                name: `${d.name}${reqStr ? '\n' + reqStr : ''}${d.desc ? '\n' + d.desc : ''}`,
                state: canBuild ? 'normal' : 'disabled',
                type: 'list',  // 列表行：满宽展示完整信息
                data: { key, canBuild },
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '所有建筑均已建造', state: 'disabled', type: 'list' });
        }


        this._navigator.push({
            title: '建造',
            breadcrumb: '主页 > 建造',
            columns: 1,  // 单列：每行一个建筑，横向撑满展示完整信息
            cells,
            onCellClick: (index, cell) => {
                if (!cell.data?.canBuild) return;
                this.doBuild(cell.data.key);
            },
        });
    }

    /** 执行建造动作（复用 ActionBuilding 完整逻辑） */
    private doBuild(buildingId: string): void {
        const r = ActionBuilding.instance.build(buildingId);
        this._lastMsg = r.message;
        // 刷新首页（设施动态区会更新）
        this._navigator.setRoot(this.buildHomePage());
        this._eventBus.emit(GameEvents.UI_REFRESH);
    }

    // ===== 出门 / 地点列表（渐进解锁，网格形式）=====
    /** 商人是否在当前户外页可见（过滤地牢专属 / 季节 / 天数） */
    private isTraderVisible(key: string): boolean {
        const d = TRADE_DATA[key];
        if (!d) return false;
        if (d.type === 'dungeon') return false; // 地牢专属商人仅地牢商人弹窗出现
        if (d.season) {
            const SEASON_EN = ['spring', 'summer', 'autumn', 'winter'];
            if (d.season !== SEASON_EN[this._gm.timeData.season]) return false;
        }
        if (d.day && this._gm.timeData.day < d.day) return false; // 第N天后才出现
        return true;
    }

    /**
     * 随机摇出当前在场商人（参照原版贸易系统：商人随机出现，不是全部列出）。
     * 每个可见商人按出现概率掷骰，命中的进入在场列表。
     * 概率优先级：TRADE_DATA[key].prob（可选，便于精确还原原版各商人概率）> 类别默认值。
     */
    private rollVisibleTraders(): string[] {
        const visible = Object.keys(TRADE_DATA).filter(k => this.isTraderVisible(k));
        const rolled = visible.filter(k => {
            const d = TRADE_DATA[k] as any;
            const p = d.prob ?? this.defaultTraderProb(d);
            return Math.random() < p;
        });
        // 极端兜底：若全部未命中（概率极低），至少随机保留一个在场，避免空场导致无法交易
        if (rolled.length === 0 && visible.length > 0) {
            rolled.push(visible[Math.floor(Math.random() * visible.length)]);
        }
        return rolled;
    }

    /** 未显式指定 prob 时的默认出现概率（参照原版：核心商必现、资源商约半数到场） */
    private defaultTraderProb(d: any): number {
        if (d.give === 'gold') return 1;        // 金币商队必出（核心金币来源，保证玩家总能卖货换金）
        if (d.season) return 1;                 // 季节限定商人必出（本身稀缺）
        if (d.type === 'upgrade') return 0.6;   // 升级商人较常出现
        return 0.5;                             // 其余资源/功能商人默认 50%
    }

    private openGoOutList(): void {
        // 进入地图列表即视为「出门在外」，底栏按钮变「回家」
        this._isOutdoors = true;
        this.refreshGoButton();

        // 本次出门随机摇出在场商人（回家后缓存清空，再出门重摇）
        if (this._rolledTraders.length === 0) this._rolledTraders = this.rollVisibleTraders();

        const cells: GridCellData[] = [];
        for (const key in PLACE_DATA) {
            const p = PLACE_DATA[key];

            // requireEvent 过滤：未满足解锁条件的不显示
            if (p.requireEvent) {
                const eventDone = this._gm.eventSaveData[p.requireEvent]?.experienced;
                if (!eventDone) continue;
            }

            const psd = this._gm.placeSaveData[key] || {};
            const visited = !!psd.visited;
            const timeNeed = p.timeNeed || 1;

            // 资源概要标签（简短）
            let resHint = '';
            if (p.resource) {
                const resCount = Object.keys(p.resource).length;
                if (resCount >= 3) resHint = '资源丰富';
                else if (resCount >= 2) resHint = '资源较多';
                else if (resCount >= 1) resHint = '有资源';
            }
            if (p.mst && Object.keys(p.mst).length > 0) resHint += resHint ? ' 有怪' : '危险';

            cells.push({
                id: `place_${key}`,
                name: `${p.name}\n${resHint || '未知'} 耗时${timeNeed}h`,
                state: 'normal',
                type: 'list',  // 列表行：满宽展示
                isNew: !visited, // 未探索地点显示红色「新」badge
                data: { placeKey: key, timeNeed },
            });
        }

        // 商人（与地点平铺，点击进交易二级页；仅展示本次随机在场的一批）
        for (const key of this._rolledTraders) {
            const d = TRADE_DATA[key];
            const giveName = d.give === 'gold' ? '金币' : (ITEM_DATA[d.give]?.name || d.give);
            const refresh = d.time ? ` 每${d.time}h补货` : '';
            const stock = ActionTrade.instance.getStock(key);
            const stockStr = d.give === 'gold' ? '领取金币' : `剩余${stock.available}/${stock.max}`;
            cells.push({
                id: `trader_${key}`,
                name: `${d.name}\n出售:${giveName} · ${stockStr}${refresh}`,
                state: 'normal',
                type: 'list',
                data: { traderId: key },
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '还没有可前往的地点', state: 'disabled', type: 'list' });
        }

        this._navigator.push({
            title: '出门',
            breadcrumb: '主页 > 出门',
            columns: 1,  // 单列：每行一个地点，横向撑满展示完整信息
            cells,
            onCellClick: (index, cell) => {
                if (cell.data?.traderId) {
                    this.openTradeDetail(cell.data.traderId);
                } else if (cell.data?.placeKey) {
                    this.travelToPlace(cell.data.placeKey, cell.data.timeNeed);
                }
            },
        });
    }

    /** 前往地点（消耗时间 + 进入详情页） */
    private travelToPlace(placeKey: string, timeNeed: number): void {
        // 消耗旅行时间
        ActionExecutor.instance.execute({}, {}, timeNeed);
        // 标记访问
        if (!this._gm.placeSaveData[placeKey]) this._gm.placeSaveData[placeKey] = {};
        this._gm.placeSaveData[placeKey].visited = true;
        // 进入地点详情
        this.openPlaceDetail(placeKey);
    }

    // ===== 建筑（原有：建筑详情/升级/子功能入口，保留兼容）=====
    private openBuildingGrid(): void {
        const cells: GridCellData[] = Object.keys(BUILDING_DATA)
            .filter(key => key !== 'build') // 'build' 是原 UI 分类入口，非真实建筑
            .map(key => {
                const d = BUILDING_DATA[key];
                const built = this._gm.buildingSaveData[key]?.own;
                const preBuilt = !d.building || this._gm.buildingSaveData[d.building]?.own;
                const hasMat = this._gm.checkHaveResource(d.require || {});
                const canBuild = !built && preBuilt && hasMat;
                return {
                    id: key,
                    name: d.name,
                    state: (built || canBuild) ? 'normal' : 'disabled',
                    data: key,
                };
            });

        this._navigator.push({
            title: '建筑',
            breadcrumb: '建筑',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openBuildingDetail(cell.id),
        });
    }

    /** 建筑详情 + 建造/升级动作 */
    private openBuildingDetail(buildingId: string): void {
        this._navigator.push(this.buildBuildingDetailPage(buildingId));
    }

    private buildBuildingDetailPage(buildingId: string): GridPage {
        const d = BUILDING_DATA[buildingId];
        const built = this._gm.buildingSaveData[buildingId]?.own;
        const reqStr = d.require && Object.keys(d.require).length > 0
            ? Object.entries(d.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '无';
        const timeNeed = d.timeNeed || 4;

        const cells: GridCellData[] = [];
        cells.push(
            { id: 'name', name: d.name, state: 'disabled' },
            { id: 'desc', name: d.desc || '', state: 'disabled' },
        );
        if (!built) {
            const preName = d.building ? BUILDING_DATA[d.building]?.name || d.building : null;
            const canBuild = (!preName || this._gm.buildingSaveData[d.building]?.own)
                && this._gm.checkHaveResource(d.require || {});
            cells.push(
                { id: 'pre', name: preName ? `前置: ${preName}` : '前置: 无', state: 'disabled' },
                { id: 'req', name: `材料: ${reqStr}`, state: 'disabled' },
                { id: 'time', name: `耗时: ${timeNeed} 小时`, state: 'disabled' },
                { id: 'build', name: '建造', state: canBuild ? 'normal' : 'disabled' },
            );
        } else {
            cells.push({ id: 'built', name: '已建造', state: 'disabled' });
            // 农田子功能入口
            if (buildingId === 'farm') {
                const farmData = this._gm.buildingSaveData['farm'];
                const slots = ActionBuilding.instance.getFarmSlots();
                const readyCount = slots.filter(s => s.ready).length;
                cells.push({
                    id: 'farm_manage',
                    name: `农田管理 (${slots.length}/${farmData?.size || 2}${readyCount > 0 ? ` · ${readyCount}可收` : ''})`,
                    state: 'normal',
                });
            }
            // 陷阱子功能入口
            if (buildingId === 'trap') {
                const trapData = this._gm.buildingSaveData['trap'];
                const slots = ActionBuilding.instance.getTrapSlots();
                const canCheckCount = slots.filter(s => s.canCheck).length;
                cells.push({
                    id: 'trap_manage',
                    name: `陷阱管理 (${slots.length}/${trapData?.size || 2}${canCheckCount > 0 ? ` · ${canCheckCount}可查` : ''})`,
                    state: 'normal',
                });
            }
            // 酿酒子功能入口
            if (buildingId === 'alco') {
                const slots = ActionBrew.instance.getBrewSlots();
                const readyCount = slots.filter(s => s.ready).length;
                cells.push({
                    id: 'brew_manage',
                    name: `酿酒管理 (${slots.length}/${ActionBrew.MAX_SLOTS}${readyCount > 0 ? ` · ${readyCount}可收` : ''})`,
                    state: 'normal',
                });
            }
            // 水井子功能入口
            if (buildingId === 'well') {
                const frozen = TimeSystem.instance.isWinter();
                cells.push({
                    id: 'well_collect',
                    name: frozen ? '取水 (冬季封冻)' : '取水',
                    state: frozen ? 'disabled' : 'normal',
                });
            }
        }

        // 升级链（BUILDING_UPDATE_DATA[buildingId + 'Update']）
        const upType = `${buildingId}Update`;
        const upGroup = BUILDING_UPDATE_DATA[upType];
        if (upGroup) {
            const level = this._gm.getBuildingLevel(upType);
            const keys = Object.keys(upGroup);
            if (level < keys.length) {
                const nextId = keys[level];
                const nextData = upGroup[nextId];
                const nextReqStr = Object.entries(nextData.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                cells.push(
                    { id: 'lv', name: `升级至 Lv.${level + 1}`, state: 'disabled' },
                    { id: 'upreq', name: `材料: ${nextReqStr}`, state: 'disabled' },
                    { id: 'upgrade', name: '升级', state: this._gm.checkHaveResource(nextData.require) ? 'normal' : 'disabled' },
                );
            } else {
                cells.push({ id: 'max', name: '已升至满级', state: 'disabled' });
            }
        }

        return {
            title: d.name,
            breadcrumb: d.name,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'build') {
                    const r = ActionBuilding.instance.build(buildingId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildBuildingDetailPage(buildingId));
                } else if (cell.id === 'upgrade') {
                    const lvl = this._gm.getBuildingLevel(upType);
                    const next = Object.keys(upGroup)[lvl];
                    const r = ActionBuilding.instance.upgrade(upType, next);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildBuildingDetailPage(buildingId));
                } else if (cell.id === 'farm_manage') {
                    this.openFarmPanel();
                } else if (cell.id === 'trap_manage') {
                    this.openTrapPanel();
                } else if (cell.id === 'brew_manage') {
                    this.openBrewPanel();
                } else if (cell.id === 'well_collect') {
                    const r = ActionBuilding.instance.collectWell();
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildBuildingDetailPage(buildingId));
                }
            },
        };
    }

    // ===== 农田管理 =====
    private openFarmPanel(): void {
        this._lastMsg = '';
        this._navigator.push(this.buildFarmPage());
    }

    private buildFarmPage(): GridPage {
        const farmData = this._gm.buildingSaveData['farm'];
        const slots = ActionBuilding.instance.getFarmSlots();
        const cells: GridCellData[] = [];


        // 已种植的作物（可收获/查看进度）
        cells.push({ id: 'slot_label', name: `── 已种植 (${slots.length}/${farmData?.size || 2}) ──`, state: 'disabled' });
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s.ready) {
                cells.push({ id: `harvest_${i}`, name: `${s.cropDesc} [可收获]`, state: 'normal' });
            } else {
                const pct = Math.floor(s.progress * 100);
                cells.push({ id: `slot_${i}`, name: `${s.cropDesc} 生长${pct}% (${Math.ceil(s.remaining)}h)`, state: 'disabled' });
            }
        }

        // 可种植的作物列表
        if (slots.length < (farmData?.size || 2)) {
            cells.push({ id: 'plant_label', name: '── 可种植 ──', state: 'disabled' });
            for (const cropId in CROP_DATA) {
                const crop = CROP_DATA[cropId];
                const canPlant = this._gm.checkHaveResource(crop.require);
                const reqStr = Object.entries(crop.require)
                    .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                cells.push({
                    id: `plant_${cropId}`,
                    name: `${crop.desc} [${reqStr}]`,
                    state: canPlant ? 'normal' : 'disabled',
                });
            }
        }

        return {
            title: '农田管理',
            breadcrumb: '农田',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id.startsWith('harvest_')) {
                    const slotIdx = parseInt(cell.id.replace('harvest_', ''));
                    const r = ActionBuilding.instance.harvestCrop(slotIdx);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildFarmPage());
                } else if (cell.id.startsWith('plant_')) {
                    const cropId = cell.id.replace('plant_', '');
                    const r = ActionBuilding.instance.plantCrop(cropId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildFarmPage());
                }
            },
        };
    }

    // ===== 陷阱管理 =====
    private openTrapPanel(): void {
        this._lastMsg = '';
        this._navigator.push(this.buildTrapPage());
    }

    private buildTrapPage(): GridPage {
        const trapData = this._gm.buildingSaveData['trap'];
        const slots = ActionBuilding.instance.getTrapSlots();
        const cells: GridCellData[] = [];


        // 已放置的陷阱
        cells.push({ id: 'slot_label', name: `── 已放置 (${slots.length}/${trapData?.size || 2}) ──`, state: 'disabled' });
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (s.canCheck) {
                cells.push({ id: `check_${i}`, name: `${s.trapDesc} [可检查]`, state: 'normal' });
            } else if (s.checked) {
                cells.push({ id: `remove_${i}`, name: `${s.trapDesc} [已检查·移除]`, state: 'normal' });
            } else {
                const hoursLeft = Math.max(0, 6 - s.elapsed);
                cells.push({ id: `slot_${i}`, name: `${s.trapDesc} 等待中(${Math.ceil(hoursLeft)}h)`, state: 'disabled' });
            }
        }

        // 可放置的陷阱列表
        if (slots.length < (trapData?.size || 2)) {
            cells.push({ id: 'place_label', name: '── 可放置 ──', state: 'disabled' });
            for (const trapId in TRAP_DATA) {
                const trap = TRAP_DATA[trapId];
                const canPlace = this._gm.checkHaveResource(trap.require);
                const reqStr = Object.entries(trap.require)
                    .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                const getStr = Object.entries(trap.itemGet)
                    .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ');
                cells.push({
                    id: `place_${trapId}`,
                    name: `${trap.desc} 诱[${reqStr}] → ${getStr}`,
                    state: canPlace ? 'normal' : 'disabled',
                });
            }
        }

        return {
            title: '陷阱管理',
            breadcrumb: '陷阱',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id.startsWith('check_')) {
                    const slotIdx = parseInt(cell.id.replace('check_', ''));
                    const r = ActionBuilding.instance.checkTrap(slotIdx);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTrapPage());
                } else if (cell.id.startsWith('remove_')) {
                    const slotIdx = parseInt(cell.id.replace('remove_', ''));
                    const r = ActionBuilding.instance.removeTrap(slotIdx);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTrapPage());
                } else if (cell.id.startsWith('place_')) {
                    const trapId = cell.id.replace('place_', '');
                    const r = ActionBuilding.instance.placeTrap(trapId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTrapPage());
                }
            },
        };
    }

    // ===== 酿酒管理 =====
    private openBrewPanel(): void {
        if (!ActionBrew.instance.isBuilt()) {
            this._lastMsg = '需要先建造【酿酒桶】';
            this._navigator.replace(this.buildBuildingDetailPage('alco'));
            return;
        }
        this._lastMsg = '';
        this._navigator.push(this.buildBrewPage());
    }

    private buildBrewPage(): GridPage {
        const slots = ActionBrew.instance.getBrewSlots();
        const cells: GridCellData[] = [];


        cells.push({ id: 'start', name: '开始酿造', state: 'normal' });
        cells.push({ id: 'slot_label', name: `── 酿造中 (${slots.length}/${ActionBrew.MAX_SLOTS}) ──`, state: 'disabled' });
        if (slots.length === 0) {
            cells.push({ id: 'empty', name: '暂无酿造', state: 'disabled' });
        }
        slots.forEach((s, i) => {
            if (s.ready) {
                cells.push({ id: `harvest_${i}`, name: `${s.recipeDesc} [可收获]`, state: 'normal' });
            } else {
                cells.push({ id: `slot_${i}`, name: `${s.recipeDesc} 酿造${s.progress}% (${Math.ceil(s.remaining)}h)`, state: 'disabled' });
            }
        });

        return {
            title: '酿酒管理',
            breadcrumb: '酿酒',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'start') {
                    this.openBrewRecipeList();
                } else if (cell.id.startsWith('harvest_')) {
                    const slotIdx = parseInt(cell.id.replace('harvest_', ''));
                    const r = ActionBrew.instance.harvestBrew(slotIdx);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildBrewPage());
                }
            },
        };
    }

    /** 选择要酿造的配方 */
    private openBrewRecipeList(): void {
        const options: DialogOption[] = Object.keys(ALCO_DATA).map(key => {
            const recipe = ALCO_DATA[key];
            const canBrew = this._gm.checkHaveResource(recipe.require || {});
            const reqStr = recipe.require && Object.keys(recipe.require).length > 0
                ? Object.entries(recipe.require).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
                : '无';
            const outName = ITEM_DATA[recipe.itemGet]?.name || recipe.itemGet;
            return {
                label: `${recipe.desc} ${outName} [${reqStr}]`,
                data: key,
                disabled: !canBrew,
            };
        });
        this._dialogPanel?.show(
            '选择酿造配方',
            options,
            (data: string) => {
                const r = ActionBrew.instance.brew(data);
                this._lastMsg = r.message;
                this._navigator.replace(this.buildBrewPage());
            },
            () => {}
        );
    }

    // ===== 地图辅助方法 =====

    /**
     * 检查资源需求是否满足（混合：属性 + 物品）
     * require 中：
     *   - 'ps' = 玩家体力属性 → 用 playerState.ps 对比
     *   - 其余键 = 背包物品ID → 用 checkHaveResource 检查库存
     */
    private canMeetResourceRequire(require: Record<string, number> | undefined): boolean {
        return this.checkResourceRequireDetail(require).ok;
    }

    /**
     * 详细校验资源需求，返回 { ok, msg }。ok=false 时 msg 说明第一个未满足的原因。
     * 用于资源格点击时给出「需要先装备【斧头】/耐久不足/体力不足/材料不足」等具体提示。
     */
    private checkResourceRequireDetail(require: Record<string, number> | undefined): { ok: boolean; msg: string } {
        if (!require || Object.keys(require).length === 0) return { ok: true, msg: '' };
        for (const [key, need] of Object.entries(require)) {
            if (key === 'ps') {
                if (this._gm.playerState.ps < need) return { ok: false, msg: `体力不足（需要 ${need}）` };
            } else if (this._gm.isToolItem(key)) {
                const toolCheck = this._gm.canUseTools({ [key]: need });
                if (!toolCheck.ok) return { ok: false, msg: toolCheck.msg };
            } else {
                if (!this._gm.checkHaveResource({ [key]: need })) {
                    const name = ITEM_DATA[key]?.name || key;
                    return { ok: false, msg: `缺少材料【${name}】` };
                }
            }
        }
        return { ok: true, msg: '' };
    }

    /** 根据资源 circle 值返回生长状态文本 */
    private growthStatus(circle: number, amount: number): string {
        if (amount <= 0) return '枯竭';
        if (circle <= 0) return '停止';
        if (circle >= 1) return '较快';
        if (circle >= 0.5) return '正常';
        if (circle >= 0.2) return '较慢';
        return '非常慢';
    }

    /** 格式化需求字段：{ps:5, axe:1} → "体力5 斧头1" */
    private formatRequire(require: Record<string, number> | undefined): string {
        if (!require || Object.keys(require).length === 0) return '无';
        const parts: string[] = [];
        for (const [k, v] of Object.entries(require)) {
            if (k === 'ps') {
                parts.push(`体力${v}`);
            } else {
                const itemName = ITEM_DATA[k]?.name || k;
                parts.push(`${itemName}${v > 1 ? v : ''}`);
            }
        }
        return parts.join(' ');
    }

    /** 格式化获得物：{bark:2, wood:5} → "树皮2 木头5" */
    private formatThings(things: Record<string, number> | undefined): string {
        if (!things) return '';
        const parts: string[] = [];
        for (const [id, cnt] of Object.entries(things)) {
            const itemName = ITEM_DATA[id]?.name || id;
            parts.push(`${itemName}${cnt > 1 ? cnt : ''}`);
        }
        return parts.join(' ');
    }

    /** 格式化资源行详细信息（不含标题行） */
    private formatResourceRow(res: any, amount: number): string {
        const growth = this.growthStatus(res.circle ?? 0.1, amount);
        const things = this.formatThings(res.things);
        const req = this.formatRequire(res.require);

        const lines: string[] = [];
        lines.push(`总量:${amount}  ${growth}`);
        if (things) lines.push(`获得: ${things}`);
        lines.push(`需要: ${req}`);

        return lines.join('\n');
    }

    /** 简单截断（按字符数） */
    private truncate(str: string, maxLen: number): string {
        if (!str) return str;
        return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
    }

    // ===== 地图（地点列表 + 探索进度）=====
    private openMapGrid(): void {
        this._isOutdoors = true;
        this.refreshGoButton();

        // 本次出门随机摇出在场商人（与出门页共用缓存，保证两入口看到同一批）
        if (this._rolledTraders.length === 0) this._rolledTraders = this.rollVisibleTraders();

        const cells: GridCellData[] = [];
        for (const key in PLACE_DATA) {
            const p = PLACE_DATA[key];
            const psd = this._gm.placeSaveData[key] || {};
            const visited = !!psd.visited;

            cells.push({
                id: key,
                name: `${p.name}${visited ? ' ✓' : ''}`,
                state: visited ? 'normal' : 'selected',
                data: key,
            });
        }

        // 商人（与地点同网格平铺，点击进交易二级页；仅展示本次随机在场的一批）
        for (const key of this._rolledTraders) {
            const d = TRADE_DATA[key];
            cells.push({
                id: `trader_${key}`,
                name: d.name,
                state: 'normal',
                data: { traderId: key },
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '没有可探索的地点', state: 'disabled' });
        }

        this._navigator.push({
            title: '地图',
            breadcrumb: '地图',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.data?.traderId) {
                    this.openTradeDetail(cell.data.traderId);
                    return;
                }
                if (cell.id !== 'empty') {
                    if (!this._gm.placeSaveData[cell.id]?.visited) {
                        if (!this._gm.placeSaveData[cell.id]) this._gm.placeSaveData[cell.id] = {};
                        this._gm.placeSaveData[cell.id].visited = true;
                    }
                    this.openPlaceDetail(cell.id);
                }
            },
        });
    }

    /** 按筛选条件列出地点（内部复用，不再作为独立导航层） */
    private openMapFiltered(filter: string): void {
        const cells: GridCellData[] = [];
        for (const key in PLACE_DATA) {
            const p = PLACE_DATA[key];
            const psd = this._gm.placeSaveData[key] || {};
            const visited = !!psd.visited;

            if (filter === 'visited' && !visited) continue;
            if (filter === 'new' && visited) continue;

            cells.push({
                id: key,
                name: `${p.name}${visited ? ' ✓' : ''}`,
                state: 'normal',
                data: key,
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '该筛选下无地点', state: 'disabled' });
        }

        const filterNames: Record<string, string> = { all: '全部', visited: '已探索', new: '未探索' };

        this._navigator.push({
            title: `地图·${filterNames[filter] || filter}`,
            breadcrumb: filterNames[filter] || filter,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'empty') {
                    // 标记为已访问
                    if (!this._gm.placeSaveData[cell.id]?.visited) {
                        if (!this._gm.placeSaveData[cell.id]) this._gm.placeSaveData[cell.id] = {};
                        this._gm.placeSaveData[cell.id].visited = true;
                    }
                    this.openPlaceDetail(cell.id);
                }
            },
        });
    }

    /** 地点详情：采集 / 拾荒 / 狩猎 / 事件 */
    private openPlaceDetail(placeId: string): void {
        this._isOutdoors = true;
        this.refreshGoButton();

        this._lastMsg = ''; // 进入地点时清空旧反馈，防止跨系统串显
        this._navigator.push(this.buildPlaceDetailPage(placeId));
    }

    private buildPlaceDetailPage(placeId: string): GridPage {
        const p = PLACE_DATA[placeId];

        // ── 构建 cells（可被 rebuild 反复调用以刷新动态状态） ──
        const buildCells = (): GridCellData[] => {
            const psd = this._gm.placeSaveData[placeId] || {};
            const cells: GridCellData[] = [];

            // 地点描述
            if (p.desc) cells.push({ id: 'desc', name: p.desc, state: 'disabled', type: 'list' });

            // 资源采集（每资源一行）
            // 交互设计：资源未枯竭时格子始终可点，点击时才校验需求并提示具体原因
            //（装备/耐久/体力不足等），避免「置灰但看不到原因」；仅枯竭时才 disabled
            if (p.resource) {
                for (const resName in p.resource) {
                    const res = p.resource[resName];
                    const amount = psd.resource?.[resName]?.amount ?? res.initAmount ?? 0;
                    const depleted = amount <= 0;
                    const lines = this.formatResourceRow(res, amount);
                    const actionLabel = res.action || '采集';
                    cells.push({
                        id: `gather_${resName}`,
                        name: `${res.name}  [${actionLabel}]\n${lines}`,
                        state: depleted ? 'disabled' : 'normal',
                        type: 'list',
                        data: { action: 'gather', resName },
                    });
                }
            }

            // 拾荒（无特殊需求，始终可用）
            if (p.things && Object.keys(p.things).length > 0) {
                const thingParts = Object.entries(p.things).map(([id, cnt]) => {
                    const itemName = ITEM_DATA[id]?.name || id;
                    const qtyDesc = cnt >= 10 ? '大量' : cnt >= 5 ? '较多' : cnt >= 3 ? '少量' : '较少';
                    return `${itemName}${qtyDesc}`;
                });
                cells.push({
                    id: 'scavenge',
                    name: `拾荒  [拾荒]\n获得: ${thingParts.join('  ') || '未知'}`,
                    state: 'normal',
                    type: 'list',
                });
            }

            // 狩猎
            const mstList = psd.mst;
            const activeMonsters: string[] = [];
            if (mstList) {
                for (const mstId in mstList) {
                    const m = mstList[mstId];
                    if ((m.amount ?? 0) > 0) {
                        const mstName = MST_DATA[mstId]?.name || mstId;
                        const qty = m.amount ?? 0;
                        const qtyDesc = qty >= 10 ? '大量' : qty >= 5 ? '较多' : '较少';
                        activeMonsters.push(`${mstName}${qtyDesc}`);
                    }
                }
            }
            if (activeMonsters.length > 0) {
                cells.push({ id: 'hunt', name: `狩猎  [狩猎]\n发现: ${activeMonsters.join('  ')}`, state: 'normal', type: 'list' });
            } else {
                cells.push({ id: 'hunt', name: `狩猎  [狩猎]\n附近没有怪物`, state: 'disabled', type: 'list' });
            }

            // 事件
            if (p.event) {
                for (const evId in p.event) {
                    if (EVENT_DATA[evId] && !this._gm.eventSaveData[evId]?.experienced) {
                        const ev = EVENT_DATA[evId];
                        cells.push({
                            id: `event_${evId}`,
                            name: `事件·${ev.name}  [对话]\n${ev.desc ? this.truncate(ev.desc, 40) : ''}`,
                            state: 'normal',
                            type: 'list',
                            data: { action: 'event', evId },
                        });
                    }
                }
            }

            // 长条富文本行统一跳过截断
            for (const c of cells) { if (c.type === 'list') c.noTruncate = true; }
            return cells;
        };

        return {
            title: p.name,
            breadcrumb: p.name,
            columns: 1,
            cells: buildCells(),
            rebuild: buildCells,  // pop 回来 / UI_REFRESH 时重评 canGather 等动态状态
            onCellClick: (index, cell) => {
                const data = cell.data as any;
                if (data?.action === 'gather') {
                    // 点击时校验需求，不满足则提示具体原因（装备/耐久/体力/材料），不消耗
                    const res = PLACE_DATA[placeId]?.resource?.[data.resName];
                    const check = this.checkResourceRequireDetail(res?.require);
                    if (!check.ok) {
                        this._lastMsg = check.msg;
                        this._navigator.replace(this.buildPlaceDetailPage(placeId));
                        return;
                    }
                    const r = ActionMap.instance.gather(placeId, data.resName);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildPlaceDetailPage(placeId));
                } else if (cell.id === 'scavenge') {
                    const r = ActionMap.instance.scavenge(placeId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildPlaceDetailPage(placeId));
                } else if (cell.id === 'hunt') {
                    // 狩猎：随机抽怪后用交互式战斗面板
                    const hunted = ActionMap.instance.probeHunt(placeId);
                    if (hunted.mstId) {
                        this._lastMsg = `遭遇了 ${hunted.mstName}！`;
                        this._navigator.replace(this.buildPlaceDetailPage(placeId));
                        this.triggerBattle(hunted.mstId);
                        return;
                    }
                    this._lastMsg = '附近没有怪物';
                    this._navigator.replace(this.buildPlaceDetailPage(placeId));
                } else if (data?.action === 'event') {
                    const r = ActionEvent.instance.trigger(data.evId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildPlaceDetailPage(placeId));
                }
            },
        };
    }

    // ===== 贸易 =====
    /** 商人详情 + 购买动作 */
    private openTradeDetail(traderId: string): void {
        this._navigator.push(this.buildTradeDetailPage(traderId));
    }

    private buildTradeDetailPage(traderId: string): GridPage {
        const detail = TRADE_DATA[traderId];
        const give = detail.give;
        const max = detail.max || 100;
        const gold = this._gm.boxSaveData['bag']?.['gold'] || 0;
        const cells: GridCellData[] = [];

        // 库存 / 刷新信息（基于商人库存系统）
        const stock = ActionTrade.instance.getStock(traderId);
        const giveName = ITEM_DATA[give]?.name || give;
        if (give === 'gold') {
            cells.push({ id: 'stock', name: `收益: 金币 ×${max}（随时可领取）`, state: 'disabled' });
        } else if (stock.soldOut) {
            cells.push({ id: 'stock', name: `已售罄，${stock.restockHours} 小时后补货`, state: 'disabled' });
        } else {
            const refreshDesc = detail.time ? `每 ${detail.time} 小时补货` : '库存有限';
            cells.push({ id: 'stock', name: `库存: ${stock.available}/${stock.max} · ${refreshDesc}`, state: 'disabled' });
        }

        if (give === 'gold') {
            cells.push(
                { id: 'give', name: `收益: 金币 ×${max}`, state: 'disabled' },
                { id: 'buy', name: '领取收益', state: 'normal' },
            );
        } else {
            const price = ActionTrade.instance.getPrice(give);
            const canBuy = gold >= price && !stock.soldOut && stock.available > 0;
            cells.push(
                { id: 'give', name: `换取: ${giveName} (上限 ${max})`, state: 'disabled' },
                { id: 'price', name: `单价: ${price} 金`, state: 'disabled' },
                { id: 'gold', name: `持有金币: ${gold}`, state: 'disabled' },
            );

            // 购买选项（受商人库存与金币双重限制）
            const a = stock.available;
            cells.push({ id: 'buy1', name: `×1 (${price}金)`, state: (canBuy && a >= 1) ? 'normal' : 'disabled' });
            cells.push({ id: 'buy5', name: `×5 (${price * 5}金)`, state: (canBuy && a >= 5) ? 'normal' : 'disabled' });
            cells.push({ id: 'buy10', name: `×10 (${price * 10}金)`, state: (canBuy && a >= 10) ? 'normal' : 'disabled' });
            if (max > 10) {
                cells.push({ id: 'buy20', name: `×20 (${price * 20}金)`, state: (canBuy && a >= 20) ? 'normal' : 'disabled' });
                cells.push({ id: 'buy_max', name: `买满 ×${Math.min(max, a)}`, state: canBuy ? 'normal' : 'disabled' });
            }

            // 易货（以物易物）：列出背包中可估值交换的物品
            cells.push({ id: 'barter_hdr', name: '— 易货（以物易物）—', state: 'disabled' });
            const bagB = this._gm.boxSaveData['bag'] || {};
            const offered = Object.keys(bagB).filter(id => (bagB[id] || 0) > 0 && id !== 'gold' && ActionTrade.instance.getPrice(id) > 0);
            let shownB = 0;
            for (const id of offered) {
                if (shownB >= 12) break;
                const q = bagB[id] || 0;
                cells.push({ id: `barter:${id}`, name: `易货 ${ITEM_DATA[id]?.name || id} ×${q}`, state: 'normal', data: id });
                shownB++;
            }
            if (shownB === 0) cells.push({ id: 'barter_none', name: '背包无可用易货物品', state: 'disabled' });
        }

        return {
            title: detail.name,
            breadcrumb: detail.name,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (typeof cell.id === 'string' && cell.id.startsWith('barter:')) {
                    this.showBarterDialog(traderId, cell.data as string);
                    return;
                }
                if (cell.id === 'buy1') {
                    const r = ActionTrade.instance.trade(traderId, 1);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTradeDetailPage(traderId));
                } else if (cell.id === 'buy5') {
                    const r = ActionTrade.instance.trade(traderId, 5);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTradeDetailPage(traderId));
                } else if (cell.id === 'buy10') {
                    const r = ActionTrade.instance.trade(traderId, 10);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTradeDetailPage(traderId));
                } else if (cell.id === 'buy20') {
                    const r = ActionTrade.instance.trade(traderId, 20);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTradeDetailPage(traderId));
                } else if (cell.id === 'buy_max' || cell.id === 'buy') {
                    const r = ActionTrade.instance.trade(traderId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildTradeDetailPage(traderId));
                }
            },
        };
    }

    // ===== 技能（全部技能一览 + 天赋/普通标识）=====
    private openSkillGrid(): void {
        const cells: GridCellData[] = [];
        for (const key in SKILL_DATA) {
            const data = SKILL_DATA[key];
            const isTalent = !!(data as any).isTalent;
            const level = this._gm.skill[key] || 0;
            const tag = isTalent ? '【天】' : '【技】';
            const levelStr = level > 0 ? ` Lv.${level}` : '';
            cells.push({
                id: key,
                name: `${tag}${data.name}${levelStr}`,
                state: 'normal',
                data: key,
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '暂无技能', state: 'disabled' });
        }

        this._navigator.push({
            title: `技能 (${cells.length})`,
            breadcrumb: '技能',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openSkillDetail(cell.id),
        });
    }

    /** 技能详情 + 学习动作 */
    private openSkillDetail(skillId: string): void {
        this._navigator.push(this.buildSkillDetailPage(skillId));
    }

    private buildSkillDetailPage(skillId: string): GridPage {
        const data = SKILL_DATA[skillId];
        const level = this._gm.skill[skillId] || 0;
        const cost = ActionSkill.instance.previewCost(skillId);
        const costStr = cost
            ? Object.entries(cost).map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`).join(' ')
            : '已满学/不可学';
        const canLearn = !!cost && this._gm.checkHaveResource(cost);
        const isTalent = !!(data as any).isTalent;
        const isOne = !!(data as any).one;
        const cells: GridCellData[] = [];
        cells.push(
            { id: 'name', name: `${data.name} [${isTalent ? '天赋' : '技能'}]`, state: 'disabled' },
            { id: 'desc', name: data.desc || '', state: 'disabled' },
            { id: 'lv', name: `当前等级: ${level}${isOne ? ' (唯一)' : ''}`, state: 'disabled' },
        );
        if ((data as any).buff) {
            const buffVal = (data as any).buff;
            const buffStr = isTalent
                ? `每级加成: +${Math.round(buffVal * 100)}%`
                : `每级效果: ${buffVal < 1 ? `×${buffVal}` : `+${Math.round(buffVal * 100)}%`}`;
            cells.push({ id: 'buff', name: buffStr, state: 'disabled' });
        }
        cells.push(
            { id: 'cost', name: `学习成本: ${costStr}`, state: 'disabled' },
            { id: 'learn', name: level > 0 ? '升级' : '学习', state: canLearn ? 'normal' : 'disabled' },
        );

        return {
            title: data.name,
            breadcrumb: data.name,
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'learn') {
                    const r = ActionSkill.instance.learn(skillId);
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildSkillDetailPage(skillId));
                }
            },
        };
    }

    // ===== 地牢（楼层选择网格 + 增强探索 + 地牢商人）=====
    private openDungeonGrid(): void {
        this._navigator.push(this.buildDungeonPage());
    }

    private buildDungeonPage(): GridPage {
        const ds = this._gm.dungeonSaveData;
        const entered = !!(ds && ds.stairCount);
        const maxFloor = ActionDungeon.instance.getMaxFloor();
        const cells: GridCellData[] = [];


        if (!entered) {
            cells.push({ id: 'enter', name: '进入地牢', state: 'normal' });
        } else {
            // 操作按钮
            cells.push({ id: 'explore', name: '探索房间', state: 'normal' });
            cells.push({ id: 'descend', name: '下层', state: 'normal' });
            cells.push({ id: 'leave', name: '离开地牢', state: 'normal' });

            // 进度信息
            cells.push({ id: 'info1', name: `当前层数: ${ds.stairCount} · 房间: ${ds.roomCount}`, state: 'disabled' });
            cells.push({ id: 'info2', name: `最深: ${ds.deepest}`, state: 'disabled' });
            cells.push({ id: 'info3', name: '⚠ 房间可能遇前缀怪物/陷阱', state: 'disabled' });

            // 楼层总览（弹窗，不再嵌入网格）
            cells.push({ id: 'floors', name: '查看楼层总览', state: 'normal' });
        }

        return {
            title: '地牢',
            breadcrumb: '地牢',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'enter') {
                    const r = ActionDungeon.instance.enter();
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildDungeonPage());
                    return;
                }
                if (cell.id === 'explore') {
                    this.doDungeonExplore();
                    return;
                }
                if (cell.id === 'descend') {
                    const r = ActionDungeon.instance.descend();
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildDungeonPage());
                    return;
                }
                if (cell.id === 'leave') {
                    this._gm.dungeonSaveData = {};
                    this._lastMsg = '已离开地牢';
                    this._navigator.replace(this.buildDungeonPage());
                    return;
                }
                // 点击楼层总览 → 弹出楼层选择弹窗
                if (cell.id === 'floors') {
                    this.showFloorOverview();
                    return;
                }
            },
        };
    }

    /** 执行地牢探索（增强版：战斗/宝箱/商人/空房间） */
    private doDungeonExplore(): void {
        const probe = ActionDungeon.instance.probeExploreEnhanced();
        switch (probe.type) {
            case 'battle':
                if (probe.mstId) {
                    this._lastMsg = `遭遇了 ${probe.mstName}！`;
                    this._navigator.replace(this.buildDungeonPage());
                    this.triggerBattle(probe.mstId, probe.prefix);
                }
                break;
            case 'treasure':
                this._lastMsg = `发现宝箱：${probe.reward}`;
                this._navigator.replace(this.buildDungeonPage());
                break;
            case 'trap':
                this._lastMsg = probe.reward || '踩中陷阱！';
                this._navigator.replace(this.buildDungeonPage());
                break;
            case 'merchant':
                this._lastMsg = '遇到了地牢商人！';
                this._navigator.replace(this.buildDungeonPage());
                this.showDungeonMerchant();
                break;
            default:
                this._lastMsg = '这个房间空空如也';
                this._navigator.replace(this.buildDungeonPage());
                break;
        }
    }

    /** 显示楼层详情弹窗 */
    private showFloorDetail(floor: number): void {
        const info = ActionDungeon.instance.getFloorInfo(floor);
        const ds = this._gm.dungeonSaveData;
        const isCurrent = ds?.stairCount === floor;
        const isReached = floor <= (ds?.deepest || 0);
        const descParts: string[] = [];
        descParts.push(`第 ${floor} 层`);
        if (isCurrent) descParts.push('【当前层】');
        else if (isReached) descParts.push('【已探索】');
        else descParts.push('【未到达】');
        if (info.mstNames.length > 0) {
            descParts.push(`怪物: ${info.mstNames.join('、')}`);
        }
        descParts.push(info.hasReward ? '有宝箱奖励' : '无宝箱奖励');

        const infoOptions: DialogOption[] = descParts.map(text => ({
            label: text,
            data: null,
            disabled: true,
        }));
        infoOptions.push({ label: '返回', data: { action: 'close' } });
        this._dialogPanel?.show(`${floor}F 详情`, infoOptions, () => {}, () => {});
    }

    /** 楼层总览弹窗（所有楼层一览，点击查看详情） */
    private showFloorOverview(): void {
        const ds = this._gm.dungeonSaveData;
        const maxFloor = ActionDungeon.instance.getMaxFloor();
        const options: DialogOption[] = [];

        for (let f = 1; f <= maxFloor; f++) {
            const info = ActionDungeon.instance.getFloorInfo(f);
            const isCurrent = f === ds?.stairCount;
            const isReached = f <= (ds?.deepest || 0);
            const mstPreview = info.mstNames.length > 0
                ? info.mstNames.slice(0, 2).join('/') + (info.mstNames.length > 2 ? '…' : '')
                : '无';
            const label = isCurrent
                ? `▶ ${f}F [${mstPreview}] ★当前`
                : isReached
                    ? `  ${f}F [${mstPreview}]`
                    : `  ${f}F ???`;
            options.push({
                label,
                data: { floor: f },
                disabled: !isReached && !isCurrent,
            });
        }
        options.push({ label: '─────', data: null, disabled: true });
        options.push({ label: '关闭', data: { action: 'close' } });

        this._dialogPanel?.show(
            `楼层总览 (最深 ${ds?.deepest || 0}F)`,
            options,
            (data) => {
                if (data.floor != null) {
                    this.showFloorDetail(data.floor);
                }
            },
            () => {}
        );
    }

    /** 显示地牢商人交易弹窗 */
    private showDungeonMerchant(): void {
        const merchantIds = ActionDungeon.instance.getDungeonMerchants();
        const gold = this._gm.boxSaveData['bag']?.['gold'] || 0;
        const options: DialogOption[] = merchantIds.map(id => {
            const trade = TRADE_DATA[id];
            const price = ActionTrade.instance.getPrice(trade.give);
            const giveName = ITEM_DATA[trade.give]?.name || trade.give;
            const canBuy = gold >= price;
            return {
                label: `${trade.name}：${giveName} ×1 (${price}金)`,
                data: { action: 'buy', traderId: id },
                disabled: !canBuy,
            };
        });
        options.push({ label: '离开商人', data: { action: 'leave' } });

        this._dialogPanel?.show(
            `地牢商人 (持有 ${gold} 金)`,
            options,
            (data) => {
                if (data.action === 'buy') {
                    const r = ActionTrade.instance.trade(data.traderId, 1);
                    this._lastMsg = r.message;
                    this._eventBus.emit(GameEvents.UI_REFRESH);
                    // 继续显示商人（刷新金币）
                    this.showDungeonMerchant();
                }
            },
            () => {}
        );
    }

    /** 显示易货弹窗：选择提供数量，预览可换得的商人货品 */
    private showBarterDialog(traderId: string, offerItem: string): void {
        const detail = TRADE_DATA[traderId];
        const give = detail.give;
        const maxOut = detail.max || 100;
        const offerName = ITEM_DATA[offerItem]?.name || offerItem;
        const giveName = ITEM_DATA[give]?.name || give;
        const offerPrice = ActionTrade.instance.getPrice(offerItem);
        const unitValue = ActionTrade.instance.getPrice(give);
        const bagQty = this._gm.boxSaveData['bag']?.[offerItem] || 0;

        const options: DialogOption[] = [];
        if (offerPrice <= 0 || unitValue <= 0) {
            options.push({ label: '该物品或货品无法估值', data: null, disabled: true });
        } else {
            const tiers = [1, 5, 10];
            for (const q of tiers) {
                if (bagQty < q) continue;
                const out = Math.min(maxOut, Math.floor((q * offerPrice) / unitValue));
                if (out < 1) continue;
                options.push({ label: `给 ${offerName} ×${q} → 换得 ${giveName} ×${out}`, data: { q } });
            }
            // 换满
            const qForMax = Math.ceil((maxOut * unitValue) / offerPrice);
            if (bagQty >= qForMax) {
                options.push({ label: `换满：给 ${offerName} ×${qForMax} → 换得 ${giveName} ×${maxOut}`, data: { q: qForMax } });
            } else if (bagQty > 0) {
                const out = Math.min(maxOut, Math.floor((bagQty * offerPrice) / unitValue));
                if (out >= 1) options.push({ label: `全部：给 ${offerName} ×${bagQty} → 换得 ${giveName} ×${out}`, data: { q: bagQty } });
            }
        }
        options.push({ label: '─────', data: null, disabled: true });
        options.push({ label: '返回', data: { action: 'back' } });

        this._dialogPanel?.show(
            `易货：${offerName} (持有 ${bagQty})`,
            options,
            (data) => {
                if (data && data.q) {
                    const r = ActionTrade.instance.barter(traderId, offerItem, data.q);
                    this._lastMsg = r.message;
                    this._eventBus.emit(GameEvents.UI_REFRESH);
                    // 继续显示易货弹窗（刷新数量）
                    this.showBarterDialog(traderId, offerItem);
                }
            },
            () => {}
        );
    }

    // ===== 事件（主页"事件"入口：可触发事件总览）=====
    private openQuestGrid(): void {
        const cells: GridCellData[] = Object.keys(EVENT_DATA)
            .filter(id => !this._gm.eventSaveData[id]?.experienced)
            .map(id => ({
                id,
                name: EVENT_DATA[id].name,
                state: 'normal',
                data: id,
            }));
        if (cells.length === 0) cells.push({ id: 'none', name: '暂无可触发事件', state: 'disabled' });

        this._navigator.push({
            title: '事件',
            breadcrumb: '事件',
            columns: 4,
            cells,
            onCellClick: (index, cell) => this.openEventDetail(cell.id),
        });
    }

    /** 事件详情 + 对话弹窗 + 触发动作 */
    private openEventDetail(eventId: string): void {
        this._navigator.push(this.buildEventDetailPage(eventId));
    }

    private buildEventDetailPage(eventId: string): GridPage {
        const data = EVENT_DATA[eventId];
        const dialogInfo = ActionEvent.instance.getDialogInfo(eventId);
        const experienced = !!this._gm.eventSaveData[eventId]?.experienced;
        const want = data.want || {};
        const canTrigger = !experienced && this._gm.checkHaveResource(want);
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
                    this._dialogPanel?.show(
                        `${data.name}`,
                        dialogOptions,
                        (d) => {
                            if (d?.action === 'trigger' && !experienced) {
                                const r = ActionEvent.instance.trigger(eventId);
                                this._lastMsg = r.message;
                                this._navigator.replace(this.buildEventDetailPage(eventId));
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
                    this._lastMsg = r.message;
                    this._navigator.replace(this.buildEventDetailPage(eventId));
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
        this._dialogPanel?.show(
            `${EVENT_DATA[eventId]?.name || '事件'} - 完成`,
            options,
            () => {},
            () => {}
        );
    }

    // ===== 菜单（原版风格：技能 + 设置 两页）=====
    private openMenuGrid(): void {
        this._navigator.push(this.buildMenuPage());
    }

    private buildMenuPage(): GridPage {
        // 原版菜单只有两个入口：技能 / 设置
        const cells: GridCellData[] = [
            { id: 'skill', name: '技能', state: 'normal' },
            { id: 'settings', name: '设置', state: 'normal' },
        ];


        return {
            title: '菜单',
            breadcrumb: '主页 > 菜单',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'skill') {
                    this._navigator.push(this.buildMenuSkillPage());
                } else if (cell.id === 'settings') {
                    this._navigator.push(this.buildMenuSettingsPage());
                }
            },
        };
    }

    /** 菜单 → 技能页 */
    private buildMenuSkillPage(): GridPage {
        const cells: GridCellData[] = [];
        for (const key in SKILL_DATA) {
            const d = SKILL_DATA[key];
            const level = this._gm.skill[key] || 0;
            // 原版：初始技能为空，后续根据条件获得（含天赋，也需习得 level>0 才显示）
            if (level <= 0) continue;

            const maxLv = d.maxLevel || 10;
            const talentMark = d.isTalent ? '(天赋)' : '';
            cells.push({
                id: `skill_${key}`,
                name: `${d.name}${talentMark}\nLv.${level}/${maxLv}\n${d.desc || ''}`,
                state: level > 0 ? 'normal' : 'disabled',
                type: 'list',
            });
        }

        if (cells.length === 0) {
            cells.push({ id: 'empty', name: '尚未习得任何技能', state: 'disabled', type: 'list' });
        }

        return {
            title: '技能',
            breadcrumb: '菜单 > 技能',
            columns: 1,  // 单列列表
            cells,
            onCellClick: (index, cell) => {},
        };
    }

    /** 菜单 → 设置页（参照原版：存档/读档/云存档/音量/统计/帮助/转生/阵营/返回） */
    private buildMenuSettingsPage(): GridPage {
        const s = this._gm.settings;
        const canReincarnate = ActionEvent.instance.canReincarnate();
        const cells: GridCellData[] = [
            { id: 'save', name: '保存游戏', state: 'normal' },
            { id: 'load', name: '读取存档', state: 'normal' },
            { id: 'cloud', name: '云存档', state: CloudSaveProvider.instance.enabled ? 'normal' : 'disabled' },
            { id: 'autoSave', name: `自动存档: ${s.autoSave ? '开' : '关'}`, state: 'normal' },
            { id: 'volLabel', name: `音量: ${Math.round(s.volume * 100)}%`, state: 'disabled' },
            { id: 'volUp', name: '音量+', state: 'normal' },
            { id: 'volDown', name: '音量-', state: 'normal' },
            { id: 'stats', name: '游戏统计', state: 'normal' },
            { id: 'help', name: '游戏帮助', state: 'normal' },
            { id: 'reincarnation', name: canReincarnate ? '转生' : '转生(未满足条件)', state: canReincarnate ? 'normal' : 'disabled' },
            { id: 'camp', name: this._gm.camp ? `阵营: ${this._gm.camp === 'fire' ? '火之阵营' : '冰之阵营'}` : '选择阵营', state: this._gm.camp ? 'disabled' : 'normal' },
        ];


        return {
            title: '设置',
            breadcrumb: '菜单 > 设置',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                switch (cell.id) {
                    case 'save':
                        this._saveMgr.save();
                        this._lastMsg = '存档已保存';
                        this._navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'load':
                        this._saveMgr.load();
                        this._lastMsg = '已读档';
                        this._eventBus.emit(GameEvents.UI_REFRESH);
                        this._navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'cloud':
                        this.openCloudPanel();
                        break;
                    case 'autoSave':
                        this._gm.settings.autoSave = !this._gm.settings.autoSave;
                        if (this._gm.settings.autoSave) this._saveMgr.startAutoSave(60000);
                        else this._saveMgr.stopAutoSave();
                        this._lastMsg = `自动存档已${this._gm.settings.autoSave ? '开启' : '关闭'}`;
                        this._navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'volUp':
                        this._gm.settings.volume = Math.min(1, this._gm.settings.volume + 0.1);
                        this._navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'volDown':
                        this._gm.settings.volume = Math.max(0, this._gm.settings.volume - 0.1);
                        this._navigator.replace(this.buildMenuSettingsPage());
                        break;
                    case 'stats':
                        this.openStatsPanel();
                        break;
                    case 'help':
                        this.openHelpPanel();
                        break;
                    case 'reincarnation':
                        if (canReincarnate) this.openReincarnationPanel();
                        break;
                    case 'camp':
                        this.openCampDialog();
                        break;
                }
            },
        };
    }

    /** 设置面板 */
    /** 阵营选择弹窗（仅未选择时有效） */
    private openCampDialog(): void {
        if (this._gm.camp) {
            this._lastMsg = `你已属于【${this._gm.camp === 'fire' ? '火之阵营' : '冰之阵营'}】，无法更改`;
            this._navigator.replace(this.buildMenuPage());
            return;
        }
        const options: DialogOption[] = [
            { label: '🔥 火之阵营', data: 'fire', desc: '体温更暖（不易冻毙），代谢稳定使满腹/水分消耗 -15%，战斗中攻击 +5%' },
            { label: '❄ 冰之阵营', data: 'ice', desc: '冷静使精神衰减 -50%，低温环境更稳' },
        ];
        this._dialogPanel?.show(
            '选择你的阵营',
            options,
            (data: string) => {
                const r = this._gm.chooseCamp(data as 'ice' | 'fire');
                this._lastMsg = r.message;
                this._navigator.replace(this.buildMenuPage());
            },
            () => {}
        );
    }

    /** 云存档面板 */
    private openCloudPanel(): void {
        this._navigator.push(this.buildCloudPage());
    }

    private buildCloudPage(): GridPage {
        const cells: GridCellData[] = [
            { id: 'c_status', name: `状态: ${this._saveMgr.cloudStatusText()}`, state: 'disabled' },
            { id: 'c_upload', name: '立即上传', state: 'normal' },
            { id: 'c_download', name: '下载云端', state: 'normal' },
        ];

        return {
            title: '云存档',
            breadcrumb: '云存档',
            columns: 4,
            cells,
            onCellClick: async (index, cell) => {
                if (cell.id === 'c_upload') {
                    const ok = await this._saveMgr.uploadToCloud();
                    this._lastMsg = ok ? '已上传到云端' : '上传失败，检查网络/云配置';
                    this._navigator.replace(this.buildCloudPage());
                } else if (cell.id === 'c_download') {
                    const ok = await this._saveMgr.downloadFromCloud();
                    this._lastMsg = ok ? '已从云端恢复' : '下载失败/云端无存档';
                    if (ok) this._eventBus.emit(GameEvents.UI_REFRESH);
                    this._navigator.replace(this.buildCloudPage());
                }
            },
        };
    }

    /** 转生面板 */
    private openReincarnationPanel(): void {
        const canReincarnate = ActionEvent.instance.canReincarnate();
        const maouLevel = this._gm.maouLevel;
        const cells: GridCellData[] = [
            { id: 'info', name: `当前轮回: 第 ${maouLevel} 世`, state: 'disabled' },
            { id: 'cond', name: canReincarnate ? '条件已满足，可以转生' : '需到达地牢10层或击败魔王', state: 'disabled' },
            { id: 'desc', name: '转生将重置地牢进度与状态，但保留技能与魔王等级', state: 'disabled' },
            { id: 'doReincarnate', name: '确认转生', state: canReincarnate ? 'normal' : 'disabled' },
        ];

        this._navigator.push({
            title: '转生',
            breadcrumb: '转生',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id === 'doReincarnate' && canReincarnate) {
                    const r = ActionEvent.instance.doReincarnation();
                    this._lastMsg = r.message;
                    this._navigator.setRoot(this.buildHomePage());
                }
            },
        });
    }

    /** 统计面板 */
    private openStatsPanel(): void {
        const s = this._gm.playerState;
        const td = this._gm.timeData;
        const bag = this._gm.boxSaveData['bag'] || {};
        const itemCount = Object.keys(bag).length;
        const skillCount = Object.keys(this._gm.skill).filter(k => this._gm.skill[k] > 0).length;
        const eventCount = Object.keys(this._gm.eventSaveData).filter(k => this._gm.eventSaveData[k]?.experienced).length;
        const totalEvents = Object.keys(EVENT_DATA).length;
        const ds = this._gm.dungeonSaveData;

        const cells: GridCellData[] = [
            { id: 'time', name: `游戏时间: ${td.day}天 ${td.hour}时`, state: 'disabled' },
            { id: 'season', name: `季节: ${['春', '夏', '秋', '冬'][td.season]}`, state: 'disabled' },
            { id: 'hp', name: `生命: ${Math.round(s.hp)}/100`, state: 'disabled' },
            { id: 'full', name: `满腹: ${Math.round(s.full)}/100`, state: 'disabled' },
            { id: 'moist', name: `水分: ${Math.round(s.moist)}/100`, state: 'disabled' },
            { id: 'ps', name: `体力: ${Math.round(s.ps)}/100`, state: 'disabled' },
            { id: 'san', name: `精神: ${Math.round(s.san)}/100`, state: 'disabled' },
            { id: 'maou', name: `轮回: 第 ${this._gm.maouLevel} 世`, state: 'disabled' },
            { id: 'items', name: `背包物品: ${itemCount} 种`, state: 'disabled' },
            { id: 'skills', name: `已学技能: ${skillCount} 项`, state: 'disabled' },
            { id: 'events', name: `已完成事件: ${eventCount}/${totalEvents}`, state: 'disabled' },
            { id: 'dungeon', name: `地牢最深: ${ds?.deepest || 0} 层`, state: 'disabled' },
        ];

        this._navigator.push({
            title: '统计',
            breadcrumb: '统计',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {},
        });
    }

    /** 帮助面板 */
    private openHelpPanel(): void {
        const cells: GridCellData[] = [
            { id: 'h1', name: '【操作说明】', state: 'disabled' },
            { id: 'h2', name: '点击网格格子进入对应功能', state: 'disabled' },
            { id: 'h3', name: '弹窗可点击右上角×或蒙层关闭', state: 'disabled' },
            { id: 'h4', name: '【生存指南】', state: 'disabled' },
            { id: 'h5', name: '满腹/水分/精神随时间下降', state: 'disabled' },
            { id: 'h6', name: '通过采集/狩猎/烹饪获取食物', state: 'disabled' },
            { id: 'h7', name: '建造农田可稳定生产食材', state: 'disabled' },
            { id: 'h8', name: '【战斗指南】', state: 'disabled' },
            { id: 'h9', name: '装备武器提升攻击力', state: 'disabled' },
            { id: 'h10', name: '学习技能获得永久加成', state: 'disabled' },
            { id: 'h11', name: '地牢每层有战斗和宝箱', state: 'disabled' },
            { id: 'h12', name: '【进阶提示】', state: 'disabled' },
            { id: 'h13', name: '陷阱可捕获小动物', state: 'disabled' },
            { id: 'h14', name: '完成事件解锁新内容', state: 'disabled' },
            { id: 'h15', name: '到达地牢深层可转生', state: 'disabled' },
        ];

        this._navigator.push({
            title: '帮助',
            breadcrumb: '帮助',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {},
        });
    }

    // ===== 战斗面板 =====
    /** 战斗列表：列出所有可战斗的怪物（测试/主动挑战用） */
    private openBattleGrid(): void {
        const cells: GridCellData[] = Object.keys(MST_DATA).map(id => ({
            id,
            name: MST_DATA[id].name,
            state: 'normal' as const,
            data: id,
        }));
        cells.unshift({ id: 'info', name: '选择对手作战', state: 'disabled' });

        this._navigator.push({
            title: '战斗',
            breadcrumb: '战斗',
            columns: 4,
            cells,
            onCellClick: (index, cell) => {
                if (cell.id !== 'info') {
                    this.triggerBattle(cell.id);
                }
            },
        });
    }

    /** 启动交互式战斗面板（prefix 为地牢前缀怪物 key，可选） */
    triggerBattle(mstId: string, prefix?: string): void {
        if (this._battlePanel) {
            this._battlePanel.startBattle(mstId, prefix);
        }
    }

    /** 战斗结束回调 */
    private onBattleEnd(_win: boolean): void {
        // 战斗结束后刷新状态栏和当前页面
        this._eventBus.emit(GameEvents.UI_REFRESH);
    }

    /** 玩家死亡处理 */
    private onPlayerDeath(): void {
        if (this._isDead) return;
        this._isDead = true;
        // 结束任何进行中的战斗
        ActionCombat.instance.clear();
        if (this._battlePanel) this._battlePanel.node.active = false;
        this.showDeathScreen();
    }

    /** 展示死亡结算界面（强制选择，蒙层/× 关闭时重新展示） */
    private showDeathScreen(): void {
        if (!this._dialogPanel) return;
        const td = this._gm.timeData;
        const canReincarnate = ActionEvent.instance.canReincarnate();
        const options: DialogOption[] = [
            { label: '☠ 你死了', data: null, disabled: true },
            { label: `存活时间：${td.day} 天 ${td.hour} 时`, data: null, disabled: true },
            { label: `轮回次数：第 ${this._gm.maouLevel} 世`, data: null, disabled: true },
            { label: `死因：${this.getDeathCause()}`, data: null, disabled: true },
            { label: '————————', data: null, disabled: true },
        ];
        if (canReincarnate) {
            options.push({ label: '转生（重置进度，保留技能/轮回）', data: 'reincarnate' });
        }
        options.push({ label: '重生（恢复状态，继续游戏）', data: 'respawn' });

        this._dialogPanel.show(
            '你死了',
            options,
            (data) => {
                if (data === 'reincarnate') {
                    const r = ActionEvent.instance.doReincarnation();
                    this._lastMsg = r.message;
                    this._isDead = false;
                    this._dialogPanel?.hide();
                    this._navigator.setRoot(this.buildHomePage());
                } else if (data === 'respawn') {
                    this._gm.respawn();
                    this._isDead = false;
                    this._dialogPanel?.hide();
                    this._eventBus.emit(GameEvents.UI_REFRESH);
                }
            },
            () => { if (this._isDead) this.showDeathScreen(); } // 死亡态下不允许直接关闭，强制选择
        );
    }

    /** 推断死因（仅展示用，不影响死亡判定） */
    private getDeathCause(): string {
        const s = this._gm.playerState;
        if (s.full <= 0) return '饥饿致死';
        if (s.moist <= 0) return '脱水而亡';
        if (s.san <= 0) return '精神崩溃';
        if (s.temp <= 0) return '冻毙荒野';
        return '伤重不治';
    }

    onDestroy(): void {
        this._saveMgr.stopAutoSave();
        this._eventBus.off(GameEvents.PLAYER_DEATH, this.onPlayerDeath.bind(this));
    }
}
