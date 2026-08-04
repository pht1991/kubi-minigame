/**
 * types.ts - 游戏数据类型定义
 * 基于原项目 data_*.js 数据结构推导
 */

/** 物品类型 */
export interface TypeData {
    name: string;
    color: string;
}

/** 建筑数据 */
export interface BuildingData {
    name: string;
    desc: string;
    require: Record<string, number>;
    timeNeed?: number;
    building?: string; // 前置建筑
}

/** 建筑升级数据 */
export interface BuildingUpdateData {
    name: string;
    desc: string;
    require: Record<string, number>;
    timeNeed?: number;
    science?: string; // 前置科技
}

/** 陷阱数据 */
export interface TrapData {
    name: string;
    desc: string;
    require: Record<string, number>;
    get: Record<string, number>;
    chance: number;
    science?: string;
}

/** 农作物数据 */
export interface CropData {
    name: string;
    desc: string;
    timeNeed: number;
    require: Record<string, number>;
    get: string;
    amount: number;
}

/** 酿酒数据 */
export interface AlcoData {
    name: string;
    desc: string;
    timeNeed: number;
    require: Record<string, number>;
    get: string;
    amount: number;
}

/** 角色状态数据 */
export interface StateData {
    name: string;
    desc: string;
}

/** 烹饪配方 */
export interface CookData {
    name: string;
    require: Record<string, number>;
    get: string;
    amount?: number;
}

/** 贸易数据 */
export interface TradeData {
    name: string;
    get: string;
    max: number;
    interval: number;
    require?: Record<string, number>;
    season?: string;
    action?: string;
}

/** 技能数据 */
export interface SkillData {
    name: string;
    desc: string;
    buff: number;
    only?: boolean;
    cost?: number;
    costInc?: number;
    initCost?: number;
}

/** 温度状态数据 */
export interface TempData {
    name: string;
    desc: string;
}

/** 装备类型 */
export interface EquipTypeData {
    name: string;
}

/** 物品数据 */
export interface ItemData {
    name: string;
    desc?: string;
    type: string;
    durable?: number;
    equip?: string;
    /** 装备槽位（body/hand/foot/head/neck），原数据用 equipType 标记 */
    equipType?: string;
    /** 武器基础伤害 */
    damage?: number;
    /** 武器类型 melee/magic/shoot */
    weaponType?: string;
    /** 随轮回次数增加伤害/攻击的比例 */
    reiToDmg?: number;
    reiToAtk?: number;
    /** 随轮回次数增加防御的比例（原版防御减免） */
    reiToDef?: number;
    /** 按武器类型的伤害倍率 */
    meleeMul?: number;
    magicMul?: number;
    shootMul?: number;
    /** 受到伤害倍率（<1 即减伤），原版 dmgMul */
    dmgMul?: number;
    value?: Record<string, number>;
    attack?: number;
    range?: number;
    def?: number;
    san?: number;
    heal?: number;
    full?: number;
    moist?: number;
    ps?: number;
    temp?: number;
    amount?: number;
    science?: string;
    /** 使用产出（食物/药剂的状态变化，如 {full:15} / {hp:-2}），原数据存于 effect 子对象 */
    effect?: Record<string, number>;
    /** 是否可被右键/点击使用 */
    canUse?: boolean;
}

/** 制造配方 */
export interface MakeData {
    name: string;
    desc: string;
    require: Record<string, number>;
    get: string;
    amount?: number;
    timeNeed: number;
    building?: string;
    science?: string;
}

/** 炼金配方 */
export interface AlchemyData extends MakeData {}

/** 魔法配方 */
export interface MagicData extends MakeData {}

/** 科技数据 */
export interface ScienceData {
    name: string;
    desc: string;
    require: Record<string, number>;
    timeNeed: number;
    science?: string;
}

/** 事件数据 */
export interface EventData {
    name: string;
    desc?: string;
    type?: string;
    skill?: string;
    require?: Record<string, number>;
    get?: Record<string, number>;
    timeNeed?: number;
    place?: string;
    event?: string;
}

/** 怪物前缀数据 */
export interface PrefixData {
    name: string;
    buff: Record<string, number>;
}

/** 怪物数据 */
export interface MstData {
    name: string;
    hp: number;
    dmg: number;
    range?: number;
    get?: Record<string, any>;
    drop?: Record<string, any>;
    skill?: string;
    desc?: string;
}

/** 地点数据 */
export interface PlaceData {
    name: string;
    desc: string;
    discover?: number;
    action?: Record<string, any>;
    place?: string[];
    building?: string;
    event?: string;
}

/** 地牢数据 */
export interface DungeonData {
    name: string;
    desc?: string;
    mst?: string[];
    event?: string[];
    get?: Record<string, number>;
    place?: string[];
}

/** 玩家状态 */
export interface PlayerState {
    temp: number;
    hp: number;
    full: number;
    moist: number;
    ps: number;
    san: number;
}

/** 存档数据 */
export interface SaveData {
    version: string;
    /** 本地存档时间戳（ms），用于与云端存档比对新旧 */
    savedAt?: number;
    playerState: PlayerState;
    currentEquip: Record<string, string>;
    skill: Record<string, number>;
    boxSaveData: Record<string, Record<string, number>>;
    /** 各箱子容量上限（背包/大箱子等），由对应扩容道具提升；仅大箱子强制容量 */
    boxSize: Record<string, number>;
    buildingSaveData: Record<string, any>;
    durableSaveData: Record<string, number>;
    eventSaveData: Record<string, any>;
    /** 地点探索进度（资源剩余量、已访问等） */
    placeSaveData: Record<string, any>;
    dungeonSaveData: Record<string, any>;
    /** 商人交易库存：已售量 + 上次补货时间 */
    tradeSaveData: Record<string, { sold: number; day: number; hour: number }>;
    campSaveData: string;
    alcoSaveData: any[];
    coolDownSaveData: Record<string, number>;
    timeData: { day: number; hour: number; season: number };
    maouLevel: number;
    settings: { autoSave: boolean; volume: number };
}

/** 网格格子数据 */
export interface GridCellData {
    id: string;
    name: string;
    icon?: string;
    count?: number;
    state?: 'normal' | 'selected' | 'disabled' | 'cooldown';
    /**
     * 格子类型（旧字段，保留兼容）：默认 normal（方格），list 为列表行（满宽横条）。
     * 新代码优先读 layout；layout 未填时由 type 推导（list→bar，其它→tile）。
     */
    type?: 'normal' | 'list';
    /**
     * 布局描述（新字段）：'tile' | 'bar' 预设名，或覆盖对象 Partial<CellLayoutStyle>。
     * 不填则回退到 type 推导。详见 ui/cellLayout.ts。
     */
    layout?: 'tile' | 'bar' | Partial<import('../ui/cellLayout').CellLayoutStyle>;
    badge?: boolean;
    /** 是否显示「新」红色 badge（地图未探索地点等），与 badge 互斥展示 */
    isNew?: boolean;
    cooldown?: number;
    data?: any;
    /** list 类型时是否跳过 truncateForList 自动截断（长条富文本行如地图详情应设为 true） */
    noTruncate?: boolean;
    /** 背包耐久度（工具/武器类）：cur 当前耐久 / max 满耐久，用于格子底部绘制耐久条 */
    durability?: { cur: number; max: number };
    /** 是否已装备（背包视图：装备中的物品在 subText 渲染 [已装备] badge，不再把 \n[已装备] 塞到 name 里造成 3 行布局） */
    isEquipped?: boolean;
}

/** 网格页定义 */
export interface GridPage {
    title: string;
    breadcrumb: string;
    columns: number;
    cells: GridCellData[];
    onCellClick?: (index: number, cell: GridCellData) => void;
    /** 刷新回调：UI_REFRESH 重新渲染时调用，返回最新 cells（用于 pop 回列表后刷新数据/msg） */
    rebuild?: () => GridCellData[];
    /** 是否为主页（用于导航变化后同步底栏「出门/回家」按钮状态） */
    home?: boolean;
    /**
     * 标题栏升级按钮（渲染在页面标题右侧，公共可复用）。
     * 床铺/大箱子/水井等可升级建筑统一走此接口，无需各页自行实现升级 UI。
     * undefined 时标题栏无升级按钮。
     */
    upgradeInfo?: {
        /** 按钮文字，如 "升级 +4容量" / "升级" */
        label: string;
        /** normal=可点击, disabled=材料不足, maxed=已满级(显示灰色标签不可点) */
        state: 'normal' | 'disabled' | 'maxed';
    };
    /** 升级按钮点击回调（由页面实现具体升级逻辑：校验→ActionBuilding.upgrade→replace刷新） */
    onUpgradeClick?: () => void;
    /**
     * 页脚固定区域（渲染在 ScrollView 可视区域下方，不随内容滚动）。
     * 适用于「升级按钮」等需常驻底部、不被滚动淹没的操作入口。
     * 返回 null/undefined 时无页脚。
     */
    footer?: () => GridCellData[] | null;
    /** 页脚格子点击回调 */
    onFooterClick?: (index: number, cell: GridCellData) => void;
}
