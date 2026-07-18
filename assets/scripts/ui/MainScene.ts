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
import { TradePanel } from './TradePanel';
import { Toast } from './Toast';
import { SaveIndicator } from './SaveIndicator';
import { GridPage, GridCellData } from '../data/types';
import { PageContext } from './pages/PageContext';
import { CookPage } from './pages/CookPage';
import { CraftPage } from './pages/CraftPage';
import { FarmPage } from './pages/FarmPage';
import { TrapPage } from './pages/TrapPage';
import { BrewPage } from './pages/BrewPage';
import { OutdoorPage } from './pages/OutdoorPage';
import { DungeonPage } from './pages/DungeonPage';
import { SkillPage } from './pages/SkillPage';
import { EventPage } from './pages/EventPage';
import {
    BUILDING_DATA,
    SKILL_DATA,
    ITEM_DATA,
    TRADE_DATA,
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

    /** 交易面板（独立模态，替代原网格式交易页） */
    private _tradePanel: TradePanel | null = null;

    /** 烹饪系统页面模块（从 MainScene 抽离，见 pages/CookPage.ts） */
    private _cookPage: CookPage | null = null;
    private _craftPage: CraftPage | null = null;
    private _farmPage: FarmPage | null = null;
    private _trapPage: TrapPage | null = null;
    private _brewPage: BrewPage | null = null;
    private _outdoorPage: OutdoorPage | null = null;
    private _dungeonPage: DungeonPage | null = null;
    private _skillPage: SkillPage | null = null;
    private _eventPage: EventPage | null = null;

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

        // 创建交易面板（独立模态窗口）
        const tradeNode = new Node('TradePanel');
        tradeNode.layer = this.node.layer;
        this._tradePanel = tradeNode.addComponent(TradePanel);
        this.node.addChild(tradeNode);

        // 构建页面模块共享上下文（PageContext），并创建各业务域 Page 模块
        // —— 把原本散落在 MainScene 的页面构建逻辑按业务域外抽，MainScene 仅做装配与路由
        const pageCtx: PageContext = {
            navigator: this._navigator,
            gm: this._gm,
            eventBus: this._eventBus,
            saveMgr: this._saveMgr,
            timeSys: this._timeSys,
            dialogPanel: this._dialogPanel!,
            bagPanel: this._bagPanel!,
            tradePanel: this._tradePanel!,
            battlePanel: this._battlePanel!,
            setMsg: (msg: string) => { this._lastMsg = msg; },
        };
        this._cookPage = new CookPage(pageCtx);
        this._craftPage = new CraftPage(pageCtx);
        // 回填各 Page 引用到 ctx，供少数跨域导航（如建筑详情打开农田/陷阱/酿酒管理页）
        pageCtx.cookPage = this._cookPage;
        pageCtx.craftPage = this._craftPage;
        this._farmPage = new FarmPage(pageCtx);
        this._trapPage = new TrapPage(pageCtx);
        this._brewPage = new BrewPage(pageCtx);
        pageCtx.farmPage = this._farmPage;
        pageCtx.trapPage = this._trapPage;
        pageCtx.brewPage = this._brewPage;
        this._outdoorPage = new OutdoorPage(pageCtx);
        pageCtx.outdoorPage = this._outdoorPage;
        this._dungeonPage = new DungeonPage(pageCtx);
        this._skillPage = new SkillPage(pageCtx);
        this._eventPage = new EventPage(pageCtx);
        pageCtx.dungeonPage = this._dungeonPage;
        pageCtx.skillPage = this._skillPage;
        pageCtx.eventPage = this._eventPage;
        pageCtx.refreshGoButton = () => this.refreshGoButton();

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

        // 挂载到 MainScene(this.node) 下，与所有弹窗(Bag/Dialog/Battle/Trade)同级。
        // 这样弹窗显示时 setSiblingIndex(父内最后) 置顶即可盖住底栏；
        // 若挂到 Canvas 层并置顶，弹窗(在 MainScene 层)将永远盖不过底栏，导致点击穿透。
        this.node.addChild(this._bottomBar);

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

        // 按钮定义（3 个：背包 / 出门(回家) / 菜单）
        // 注：「休息」已移除——休息仅限在家（床铺）使用，不应全局暴露（可卡 bug 随地恢复）
        const buttons: { label: string; action: () => void }[] = [
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

            // 保存第2个按钮（出门/回家）的 Label 引用，供动态切换文字
            if (i === 1) this._goBtnLabel = lbl;

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
            this._goBtnLabel.string = this._outdoorPage?.isOutdoors ? '回家' : '出门';
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
            this._outdoorPage.isOutdoors = false;
            this._outdoorPage.rolledTraders = []; // 回家清空在场商人，下次出门重新随机
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
        if (action === 'goout' && this._outdoorPage?.isOutdoors) {
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
                this._outdoorPage?.openGoOutList();
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
            home_craft:   () => this._craftPage?.openCraftGrid('makeTable'),
            home_alchemy: () => this._craftPage?.openCraftGrid('alchemyTable'),
            home_magic:   () => this._craftPage?.openCraftGrid('magicTable'),
            home_science: () => this._craftPage?.openCraftGrid('scienceTable'),
            home_cook:    () => this._cookPage?.openCookPanel(),
            home_farm:    () => this._outdoorPage?.openBuildingGrid(), // 农田在建筑详情里管理种植/收获
            home_alco:    () => this._brewPage?.openBrewPanel(),
            home_trap:    () => this._outdoorPage?.openBuildingGrid(), // 陷阱检查在建筑详情
            home_box:     () => this.openBagPanel(),      // 大箱子=背包弹窗
            home_well:    () => this._outdoorPage?.openBuildingGrid(), // 取水在建筑详情
            home_toilet:  () => this._outdoorPage?.openBuildingGrid(),
            home_sleep:   () => this._navigator.push(this.openRestPage()),
        };
        if (facilityRoutes[id]) { facilityRoutes[id](); return; }

        switch (id) {
            case 'build': this.openBuildList(); break;
            case 'goOut': this._outdoorPage?.openGoOutList(); break;
            case 'menu': this.openMenuGrid(); break;
            // 以下为菜单内直达快捷方式（保留兼容）
            case 'bag': this.openBagPanel(); break;
            case 'craft': this._craftPage?.openCraftGrid(); break;
            case 'cook': this._cookPage?.openCookPanel(); break;
            case 'building': this._outdoorPage?.openBuildingGrid(); break;
            case 'map': this._outdoorPage?.openMapGrid(); break;
            case 'skill': this._skillPage?.openSkillGrid(); break;
            case 'dungeon': this._dungeonPage?.openDungeonGrid(); break;
            case 'quest': this._eventPage?.openQuestGrid(); break;
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
    /** 原版首页：动态设施区 + 建造 + 出门 + 菜单 */
    private buildHomePage(): GridPage {
        // 回主页 → 必然不在户外，重置底栏按钮为「出门」
        this._outdoorPage.isOutdoors = false;
        this._outdoorPage.rolledTraders = []; // 回家清空在场商人，下次出门重新随机
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
