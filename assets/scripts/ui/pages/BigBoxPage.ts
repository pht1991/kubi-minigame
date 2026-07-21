/**
 * BigBoxPage.ts - 大箱子仓储域页面模块
 *
 * 从 BagPage 抽离的大箱子仓储逻辑，改为独立导航页（与事件/背包同级）。
 * 入口 openBigBoxGrid 被 MainScene（onHomeCellClick / home_box）委托调用。
 * 点击物品 → DialogPanel「取出到背包」→ QuantityPanel 选数量 → bigBox→bag 转移。
 * 存入大箱子（bag→bigBox）仍保留在 BagPage（背包内操作），保持原有入口不变。
 */

import { Node } from 'cc';
import { BasePage } from './BasePage';
import { GridPage, GridCellData } from '../../data/types';
import { ITEM_DATA, BIG_BOX_BASE_SIZE, BUILDING_UPDATE_DATA } from '../../data/data';
import { GameEvents } from '../../core/EventBus';
import { ActionBuilding } from '../../actions/ActionBuilding';
import { DialogOption } from '../DialogPanel';
import { QuantityPanel } from '../QuantityPanel';

export class BigBoxPage extends BasePage {
    /** 公开入口：打开大箱子网格页（导航页，与事件/背包同级） */
    public openBigBoxGrid(): void {
        this.setMsg('');
        this.navigator.push(this.buildBigBoxPage());
    }

    /** 构建大箱子导航页（push / rebuild / replace 共用） */
    private buildBigBoxPage(): GridPage {
        const hasBigBox = !!this.gm.buildingSaveData['bigBox']?.own;
        if (!hasBigBox) {
            // 未建造 → 提示去建造（对齐 RestPage「床铺」未建范式）
            return {
                title: '大箱子',
                breadcrumb: '大箱子',
                columns: 1,
                cells: [
                    { id: 'hint', name: '你还没有大箱子\n请先在「建造」中建造', state: 'disabled', type: 'list' },
                    { id: 'goBuild', name: '前往建造', state: 'normal', type: 'list' },
                ],
                onCellClick: (idx, cell) => {
                    if (cell.id === 'goBuild') {
                        this.navigator.pop();
                        this.ctx.buildPage?.openBuildList();
                    }
                },
            };
        }

        // 物品格子：纯网格4列，不含升级格
        const cells = this.buildBigBoxCells();

        return {
            title: `大箱子 (${this.bigBoxCount()}/${this.bigBoxCap()})`,
            breadcrumb: '大箱子',
            columns: 4,
            cells,
            rebuild: () => this.buildBigBoxCells(),
            onCellClick: (index, cell) => this.onBigBoxItemClick(cell.data),
            // 公共升级按钮（标题栏右侧，替代突兀的 footer 页脚）
            ...this.buildUpgradeInfo(),
        };
    }

    /**
     * 构建公共升级按钮信息（标题栏右侧，与 RestPage/其他可升级建筑统一接口）。
     * 返回 { upgradeInfo, onUpgradeClick } 供 GridPage 展开使用。
     * 点击升级按钮 → 弹 DialogPanel 显示详情+材料需求 → 确认后执行升级。
     */
    private buildUpgradeInfo(): Partial<Pick<GridPage, 'upgradeInfo' | 'onUpgradeClick'>> {
        const level = this.gm.getBuildingLevel('bigBoxUpdate');
        const updateGroup = BUILDING_UPDATE_DATA['bigBoxUpdate'];
        const levelKeys = updateGroup ? Object.keys(updateGroup) : [];
        const nextLevelId = levelKeys[level];

        if (!nextLevelId) {
            return {
                upgradeInfo: { label: '', state: 'maxed' },
            };
        }

        const upData = updateGroup[nextLevelId];
        const nextItem = ITEM_DATA[nextLevelId];
        const canMake = this.gm.checkHaveResource(upData.require || {});
        const reqParts = Object.entries(upData.require || {})
            .map(([k, v]) => `${ITEM_DATA[k]?.name || k}×${v}`)
            .join('  ');

        return {
            upgradeInfo: {
                label: `升级 +4容量`,
                state: canMake ? 'normal' : 'disabled',
            },
            onUpgradeClick: () => {
                // 点击升级按钮 → 弹详情确认面板（含材料需求）
                const options: DialogOption[] = [];
                options.push({ label: nextItem?.name || nextLevelId, data: null, disabled: true });
                if (nextItem?.desc) options.push({ label: nextItem.desc, data: null, disabled: true });
                options.push({ label: `容量 +4`, data: null, disabled: true });
                options.push({ label: `需求: ${reqParts}`, data: null, disabled: true, noTruncate: true });
                if (canMake) {
                    options.push({ label: '[确认升级]', data: { action: 'confirm', targetId: nextLevelId } });
                } else {
                    options.push({ label: '材料不足', data: null, disabled: true });
                }
                options.push({ label: '取消', data: null });

                this.dialogPanel?.show(
                    '大箱子升级',
                    options,
                    (data) => {
                        if (data?.action === 'confirm') {
                            const r = ActionBuilding.instance.upgrade('bigBoxUpdate', data.targetId);
                            this.setMsg(r.message);
                            this.navigator.replace(this.buildBigBoxPage());
                        }
                    },
                    () => {}
                );
            },
        };
    }

    private bigBoxCount(): number {
        return Object.keys(this.gm.boxSaveData['bigBox'] || {}).length;
    }
    private bigBoxCap(): number {
        return this.gm.boxSize['bigBox'] || BIG_BOX_BASE_SIZE;
    }

    /** 构建大箱子格子（含耐久），空箱自然留白（不渲染占位 cell） */
    private buildBigBoxCells(): GridCellData[] {
        const box = this.gm.boxSaveData['bigBox'] || {};
        const cells: GridCellData[] = Object.keys(box).map(itemId => {
            const baseName = ITEM_DATA[itemId]?.name || itemId;
            const item = ITEM_DATA[itemId];
            // 工具/武器类展示耐久度条（未初始化视为满耐久）
            let durability: { cur: number; max: number } | undefined;
            if (item && item.durable !== undefined) {
                durability = { cur: this.gm.durableSaveData[itemId] || item.durable, max: item.durable };
            }
            return {
                id: itemId,
                name: baseName,
                count: box[itemId],
                state: 'normal' as const,
                data: itemId,
                durability,
            };
        });
        return cells;
    }

    /** 大箱子物品点击 → 弹「取出到背包」 */
    private onBigBoxItemClick(itemId: string): void {
        const itemData = ITEM_DATA[itemId];
        if (!itemData) return;
        const count = this.gm.boxSaveData['bigBox']?.[itemId] || 0;

        const options: DialogOption[] = [];
        options.push({ label: itemData.name, data: null, disabled: true });
        if (itemData.desc) options.push({ label: itemData.desc, data: null, disabled: true });
        options.push({ label: `数量: ${count}`, data: null, disabled: true });
        options.push({ label: '取出到背包', data: { action: 'takeOut', itemId } });

        this.dialogPanel?.show(
            `${itemData.name} ×${count}`,
            options,
            (data) => {
                if (data && data.action === 'takeOut') {
                    this.openTakeOut(itemId);
                }
            },
            () => {}
        );
    }

    /** 数量选择后取出（bigBox → bag）：弹出 QuantityPanel 选 N 个 */
    private openTakeOut(itemId: string): void {
        const have = this.gm.boxSaveData['bigBox']?.[itemId] || 0;
        if (have < 1) { this.setMsg('大箱子中没有该物品'); return; }
        const itemName = ITEM_DATA[itemId]?.name || itemId;
        const panel = this.ensureQtyPanel();
        panel.show(
            `取出【${itemName}】到背包`,
            have,
            (qty) => {
                const r = this.takeOut(itemId, qty);
                this.setMsg(r.message);
                // 取出后刷新标题(计数)与格子
                this.navigator.replace(this.buildBigBoxPage());
            },
            {
                getPreview: (qty) => [
                    `大箱子剩余：${Math.max(0, have - qty)}`,
                    `背包新增：${qty}`,
                ],
            }
        );
    }

    /** 大箱子 → 背包（取出不受容量限制，只校验数量足够） */
    private takeOut(itemId: string, qty: number): { success: boolean; message: string } {
        const src = this.gm.boxSaveData['bigBox'] || {};
        const have = src[itemId] || 0;
        if (have < qty) return { success: false, message: '数量不足' };
        this.gm.changeItem({ [itemId]: -qty }, 'bigBox');
        this.gm.changeItem({ [itemId]: qty }, 'bag');
        this.eventBus.emit(GameEvents.UI_REFRESH);
        return { success: true, message: `已取出 ${qty} 个到背包` };
    }

    /** 懒创建数量选择弹窗（挂在 modalLayer，盖住底栏） */
    private ensureQtyPanel(): QuantityPanel {
        if (!this._qtyPanel) {
            const node = new Node('BigBoxQtyPanel');
            this.ctx.modalLayer!.addChild(node);
            this._qtyPanel = node.addComponent(QuantityPanel);
        }
        return this._qtyPanel;
    }
    private _qtyPanel: QuantityPanel | null = null;
}
