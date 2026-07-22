/**
 * MainScene.ts - 主场景控制器
 * 初始化一级网格（主页），定义各功能入口的跳转逻辑
 */

import { _decorator, Component, Node, Label, UITransform, view, ResolutionPolicy, Layers, Camera, Vec3, Graphics, Widget } from 'cc';
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
import { QuantityPanel } from './QuantityPanel';
import { Toast } from './Toast';
import { SaveIndicator } from './SaveIndicator';
import { ProgressOverlay } from './ProgressOverlay';
import { ResultModal } from './ResultModal';
import { GridPage, GridCellData } from '../data/types';
import { PageContext } from './pages/PageContext';
import { C } from './theme';
import { CookPage } from './pages/CookPage';
import { CraftPage } from './pages/CraftPage';
import { FarmPage } from './pages/FarmPage';
import { TrapPage } from './pages/TrapPage';
import { BrewPage } from './pages/BrewPage';
import { OutdoorPage } from './pages/OutdoorPage';
import { DungeonPage } from './pages/DungeonPage';
import { SkillPage } from './pages/SkillPage';
import { EventPage } from './pages/EventPage';
import { BuildPage } from './pages/BuildPage';
import { MenuPage } from './pages/MenuPage';
import { RestPage } from './pages/RestPage';
import { BagPage } from './pages/BagPage';
import { BigBoxPage } from './pages/BigBoxPage';
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

    /**
     * 建立显式 UI 分层容器，替代原先靠 setSiblingIndex 时序竞争管理层级的脆弱方式。
     * 层级从底到顶（sibling index 递增）：
     *   _contentLayer  (index 0, 占位语义层；实际导航内容由场景预置的 GridComponent/StatusBar 承载)
     *   [GridComponent / StatusBar]  —— 场景预置的导航主内容 + 顶部状态栏
     *   _bottomBarLayer —— 固定底部快捷栏
     *   _modalLayer    —— 所有模态弹窗（Bag/Dialog/Battle/Trade），show 时仍可在层内 setSiblingIndex 抢置顶
     *   _toastLayer    —— 全局浮层（Toast / SaveIndicator），永远最顶
     * 各层相对层级由本方法固定的 addChild 顺序保证，不再依赖任何运行时的 setSiblingIndex。
     */
    private createUILayers(): void {
        const mk = (name: string): Node => {
            const n = new Node(name);
            n.layer = this.node.layer;
            return n;
        };
        // Content 层：空占位语义节点，置于最底（在场景预置内容节点之前）
        this._contentLayer = mk('UILayer_Content');
        this.node.insertChild(this._contentLayer, 0);
        // BottomBar 层（Content 之上）
        this._bottomBarLayer = mk('UILayer_BottomBar');
        this.node.addChild(this._bottomBarLayer);
        // Modal 层（BottomBar 之上，盖住底栏）
        this._modalLayer = mk('UILayer_Modal');
        this.node.addChild(this._modalLayer);
        // Progress 层（Modal 之上、Toast 之下：进度条遮罩盖住弹窗，但自身不挡 Toast 浮层）
        this._progressLayer = mk('UILayer_Progress');
        this.node.addChild(this._progressLayer);
        // Toast 层（永远最顶）
        this._toastLayer = mk('UILayer_Toast');
        this.node.addChild(this._toastLayer);
    }

    /** 创建全局 Toast 弹窗（挂 _toastLayer，永远最顶层，跨页面常驻） */
    private createToast(): void {
        const toastNode = new Node('Toast');
        toastNode.layer = this.node.layer;
        this._toastLayer!.addChild(toastNode);
        toastNode.setPosition(0, 360, 0); // 屏幕中上部
        toastNode.addComponent(Toast);    // onLoad 内自动构建背景/文字/透明
    }

    /** 创建常驻角落存档状态指示器（挂 _toastLayer，在 Toast 之下由层内创建顺序保证，静默不弹窗） */
    private createSaveIndicator(): void {
        const node = new Node('SaveIndicator');
        node.layer = this.node.layer;
        this._toastLayer!.addChild(node);
        // 右下角：x 靠右留 20px 边距（屏幕半宽 375，节点半宽 95 → x=260），y 在底部快捷栏上方
        node.setPosition(260, -560, 0);
        node.addComponent(SaveIndicator);  // onLoad 内自动构建

        // 接线：仅 SAVE_COMPLETE 静默刷新时间（不显示「保存中」状态，避免每次操作跳动）
        this._eventBus.on(GameEvents.SAVE_COMPLETE, (savedAt: number, ok: boolean = true) => {
            let t: string | undefined;
            if (savedAt && ok) {
                const d = new Date(savedAt);
                const p = (n: number) => (n < 10 ? '0' + n : '' + n);
                t = `${p(d.getHours())}:${p(d.getMinutes())}`;
            }
            SaveIndicator.instance?.showSaved(t);
        });

        // 初始文案：若本地已有存档则显示上次保存时间
        const last = this._saveMgr.localSavedAt;
        let initT: string | undefined;
        if (last) {
            const d = new Date(last);
            const p = (n: number) => (n < 10 ? '0' + n : '' + n);
            initT = `${p(d.getHours())}:${p(d.getMinutes())}`;
        }
        SaveIndicator.instance?.setInitial(initT);
    }

    /** 操作弹窗面板 */
    private _dialogPanel: DialogPanel | null = null;

    /** 背包弹窗面板（独立于导航栈的模态） */
    private _bagPanel: BagPanel | null = null;

    /** 战斗面板 */
    private _battlePanel: BattlePanel | null = null;

    /** 交易面板（独立模态，替代原网格式交易页） */
    private _tradePanel: TradePanel | null = null;

    /** 操作结果确认弹窗（长文案/需确认结果，由 OPERATION_DONE 触发） */
    private _resultModal: ResultModal | null = null;

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
    private _buildPage: BuildPage | null = null;
    private _menuPage: MenuPage | null = null;
    private _restPage: RestPage | null = null;
    private _bagPage: BagPage | null = null;
    private _bigBoxPage: BigBoxPage | null = null;

    /** 是否已死亡（防止死亡界面重复触发） */
    private _isDead: boolean = false;

    /** 底部快捷操作栏 */
    private _bottomBar: Node | null = null;

    /** 显式分层容器：Content(导航主内容) < BottomBar(固定底栏) < Modal(弹窗) < Progress(进度条) < Toast(全局浮层) */
    private _contentLayer: Node | null = null;
    private _bottomBarLayer: Node | null = null;
    private _modalLayer: Node | null = null;
    private _progressLayer: Node | null = null;
    private _toastLayer: Node | null = null;

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
        // 先建立显式分层容器（Content < BottomBar < Modal < Toast），消除 setSiblingIndex 时序竞争
        this.createUILayers();

        // 先创建常驻存档指示器（早于 Toast，保证 Toast 在最顶层）
        this.createSaveIndicator();

        // 创建全局 Toast（置顶），确保后续 _lastMsg 赋值能即时弹窗
        this.createToast();

        // 诊断并修复 UI Camera
        this.setupUICamera();

        // 注意：initHomeGrid() 依赖 _buildPage，须在所有 Page 创建之后调用（见下方 pageCtx 构建段末尾）

        // 创建背包弹窗（先于 DialogPanel 创建，物品操作弹窗层级更高）
        const bagNode = new Node('BagPanel');
        bagNode.layer = this.node.layer;
        this._bagPanel = bagNode.addComponent(BagPanel);
        this._modalLayer!.addChild(bagNode);

        // 创建操作弹窗
        const dialogNode = new Node('DialogPanel');
        dialogNode.layer = this.node.layer;
        this._dialogPanel = dialogNode.addComponent(DialogPanel);
        this._modalLayer!.addChild(dialogNode);

        // 创建战斗面板
        const battleNode = new Node('BattlePanel');
        battleNode.layer = this.node.layer;
        this._battlePanel = battleNode.addComponent(BattlePanel);
        this._battlePanel.onEnd = (win) => this.onBattleEnd(win);
        this._modalLayer!.addChild(battleNode);

        // 创建交易面板（独立模态窗口）
        const tradeNode = new Node('TradePanel');
        tradeNode.layer = this.node.layer;
        this._tradePanel = tradeNode.addComponent(TradePanel);
        this._modalLayer!.addChild(tradeNode);

        // 创建交易数量选择弹窗（TradePanel 内部懒取，挂同级 modalLayer）
        const qtyNode = new Node('TradeQty');
        qtyNode.layer = this.node.layer;
        const qtyPanel = qtyNode.addComponent(QuantityPanel);
        this._modalLayer!.addChild(qtyNode);
        this._tradePanel.setQtyPanel(qtyPanel);

        // 创建操作结果确认弹窗（挂 modalLayer，由 OPERATION_DONE 统一触发）
        const resultNode = new Node('ResultModal');
        resultNode.layer = this.node.layer;
        this._resultModal = resultNode.addComponent(ResultModal);
        this._modalLayer!.addChild(resultNode);

        // 创建公共进度条（挂独立 _progressLayer，盖住弹窗但不挡 Toast 浮层）
        const progressNode = new Node('ProgressOverlay');
        progressNode.layer = this.node.layer;
        progressNode.setPosition(0, 0, 0);
        this._progressLayer!.addChild(progressNode);
        progressNode.addComponent(ProgressOverlay);

        // 订阅耗时动作完成事件：长/需确认 → ResultModal；其余 → Toast(SHRINK)
        this._eventBus.on(GameEvents.OPERATION_DONE, (payload: { title: string; message: string; modal: boolean }) => {
            if (payload.modal) {
                this._resultModal?.showResult(payload.title || '操作完成', payload.message);
            } else {
                Toast.instance?.show(payload.message);
            }
            this._saveMgr.save(); // 行为反馈时立即存档，确保数据及时落盘
        });

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
        this._buildPage = new BuildPage(pageCtx);
        this._menuPage = new MenuPage(pageCtx);
        this._restPage = new RestPage(pageCtx);
        pageCtx.buildPage = this._buildPage;
        pageCtx.menuPage = this._menuPage;
        pageCtx.restPage = this._restPage;
        this._bagPage = new BagPage(pageCtx);
        pageCtx.bagPage = this._bagPage;
        this._bigBoxPage = new BigBoxPage(pageCtx);
        pageCtx.bigBoxPage = this._bigBoxPage;
        pageCtx.onHomeCellClick = (id: string) => this.onHomeCellClick(id);
        pageCtx.refreshGoButton = () => this.refreshGoButton();
        pageCtx.modalLayer = this._modalLayer!;

        // 初始化一级网格（须在所有 Page 创建之后，依赖 _buildPage）
        this.initHomeGrid();

        // 创建底部快捷操作栏
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

        const BAR_W = 750;            // 拉满画布宽度，不留两侧空隙
        const BAR_H = 70;
        const BTN_W = 230;            // 3 按钮均分 750px，留 ~15px 边距：spacing=(750-690)/4≈15
        const BTN_H = 56;             // 按钮高度略增，与栏高比例更协调

        // 容器
        this._bottomBar = new Node('BottomBar');
        this._bottomBar.layer = this.node.layer;
        const barTf = this._bottomBar.addComponent(UITransform);
        barTf.setContentSize(BAR_W, BAR_H);
        barTf.setAnchorPoint(0.5, 0.5);   // 还原默认锚点

        // 挂载到 _bottomBarLayer（显式分层：Content < BottomBar < Modal < Toast）。
        // 底栏位于导航内容之上、弹窗之下，由层级容器顺序固定，无需 setSiblingIndex。
        this._bottomBarLayer!.addChild(this._bottomBar);

        // 绝对坐标定位（不依赖 Widget，避免 ScrollView 边界缓存失效）
        // 设计分辨率 750×1334，锚点默认(0.5,0.5)，Canvas 中心为原点
        const BOTTOM_MARGIN = 3;
        this._bottomBar.setPosition(0, -1334 / 2 + BAR_H / 2 + BOTTOM_MARGIN, 0);

        // 背景（暖色）
        const gfx = this._bottomBar.addComponent(Graphics);
        gfx.fillColor = C.barBg;
        gfx.rect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H);
        gfx.fill();
        gfx.strokeColor = C.barBorder;
        gfx.lineWidth = 1.5;
        gfx.rect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H);
        gfx.stroke();

        // 按钮定义（3 个：背包 / 出门(回家) / 菜单）
        // 注：「休息」已移除——休息仅限在家（床铺）使用，不应全局暴露（可卡 bug 随地恢复）
        const buttons: { label: string; action: () => void }[] = [
            { label: '背包', action: () => this.onBottomAction('bag') },
            { label: '出门', action: () => this.onBottomAction('goout') },
            { label: '菜单', action: () => this.onBottomAction('menu') },
        ];

        const spacing = (BAR_W - buttons.length * BTN_W) / (buttons.length + 1);
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const bx = -BAR_W / 2 + spacing + i * (BTN_W + spacing) + BTN_W / 2;
            const by = 0;

            const btnNode = new Node(`Btn_${btn.label}`);
            btnNode.layer = this.node.layer;
            const btnTf = btnNode.addComponent(UITransform);
            btnTf.setContentSize(BTN_W, BTN_H);

            // 按钮背景（圆角矩形）
            const btnGfx = btnNode.addComponent(Graphics);
            btnGfx.fillColor = C.barBtnBg;
            btnGfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
            btnGfx.fill();
            btnGfx.strokeColor = C.barBtnBorder;
            btnGfx.lineWidth = 1;
            btnGfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
            btnGfx.stroke();

            // 【关键修复3】Label 用独立子节点（避免与 Graphics 同节点渲染冲突导致文字不显示）
            const lblNode = new Node('Lbl');
            lblNode.layer = this.node.layer;
            const lbl = lblNode.addComponent(Label);
            lbl.string = btn.label;
            lbl.fontSize = 22;
            lbl.color = C.barBtnText; // 深棕
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
            this._bagPage?.openBagPanel();
            return;
        }

        // 户外时「出门」按钮已变为「回家」，点击直接回主页（不 popTo 清理后再 push 地图）
        if (action === 'goout' && this._outdoorPage?.isOutdoors) {
            if (this._buildPage) this._navigator.setRoot(this._buildPage.buildHomePage());
            return; // buildHomePage 内部已重置 _isOutdoors=false 并刷新按钮
        }

        // 先清到根页，确保栈始终为 [主页, 当前页]，面包屑干净「主页 > xxx」
        this._navigator.popTo(1);

        switch (action) {
            case 'rest':
                // 休息/睡觉 → 复用休息页（床铺恢复 或 原地等待）
                if (this._restPage) this._navigator.push(this._restPage.openRestPage());
                break;
            case 'goout':
                this._outdoorPage?.openGoOutList();
                break;
            case 'menu':
                this._menuPage?.openMenuGrid();
                break;
        }
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
        if (this._buildPage) this._navigator.setRoot(this._buildPage.buildHomePage());
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
            home_box:     () => this._bigBoxPage?.openBigBoxGrid(),   // 大箱子=独立导航页
            home_well:    () => this._outdoorPage?.openBuildingGrid(), // 取水在建筑详情
            home_toilet:  () => this._outdoorPage?.openBuildingGrid(),
            home_sleep:   () => { if (this._restPage) this._navigator.push(this._restPage.openRestPage()); },
        };
        if (facilityRoutes[id]) { facilityRoutes[id](); return; }

        switch (id) {
            case 'build': this._buildPage?.openBuildList(); break;
            case 'goOut': this._outdoorPage?.openGoOutList(); break;
            case 'menu': this._menuPage?.openMenuGrid(); break;
            // 以下为菜单内直达快捷方式（保留兼容）
            case 'bag': this._bagPage?.openBagPanel(); break;
            case 'craft': this._craftPage?.openCraftGrid(); break;
            case 'cook': this._cookPage?.openCookPanel(); break;
            case 'building': this._outdoorPage?.openBuildingGrid(); break;
            case 'map': this._outdoorPage?.openMapGrid(); break;
            case 'skill': this._skillPage?.openSkillGrid(); break;
            case 'dungeon': this._dungeonPage?.openDungeonGrid(); break;
            case 'quest': this._eventPage?.openQuestGrid(); break;
            case 'battle': this.openBattleGrid(); break;
            case 'equip': this._bagPage?.openEquipPanel(); break;
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
                    if (this._buildPage) this._navigator.setRoot(this._buildPage.buildHomePage());
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
