/**
 * index.ts - 数据层统一导出
 * 从原项目 src/data_*.js 迁移
 */

// 基础配置与游戏数据（建筑/技能/贸易/状态/烹饪/陷阱/作物/酿酒等）
export * from './data';

// 物品数据
export * from './data_item';

// 制造/炼金/魔法/科技配方
export * from './data_studio';

// 事件数据
export * from './data_event';

// 怪物数据
export * from './data_mst';

// 地点数据
export * from './data_place';

// 地牢数据
export * from './data_dungeon';

// 类型定义
export * from './types';
