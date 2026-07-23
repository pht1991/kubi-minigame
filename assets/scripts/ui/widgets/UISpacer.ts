/**
 * UISpacer.ts - 布局占位（纯尺寸，无视觉）
 * 用于在 VStack/HStack 中制造固定间距，或撑开对齐。
 */

import { UINode } from './UINode';

export class UISpacer extends UINode {
    constructor(w = 0, h = 8) {
        super('Spacer');
        this.size(w, h);
    }
}
