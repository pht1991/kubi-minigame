/**
 * widgets/index.ts - 纯代码 UI 组件库统一出口
 *
 * 用法：
 *   import { UINode, UILabel, UIButton, UIShape, UISpacer, UIVStack, UIHStack, UIGrid } from './widgets';
 *
 * 设计目标：彻底脱离 cc 编辑器，所有界面用代码声明式构建，
 * 布局交给容器（VStack/HStack/Grid）自动排布，改布局只改代码，不碰 cc 配置。
 */

export { UINode } from './UINode';
export { UIShape } from './UIShape';
export { UILabel } from './UILabel';
export type { LabelOpts } from './UILabel';
export { UIButton } from './UIButton';
export { UISpacer } from './UISpacer';
export { UIVStack, UIHStack, UIGrid } from './UILayout';
export type { AlignX, AlignY } from './UILayout';
