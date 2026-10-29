/**
 * OfflineModal.ts - 离线收益结算弹窗
 *
 * 继承 ModalPanel。游戏启动时若检测到距上次存档已超过阈值，
 * 由 MainScene._handleOfflineProgress 调用 TimeSystem.settleOffline 推进离线时光，
 * 再本弹窗汇总展示：离开时长、游戏内推进、到达日期/季节、状态变化、已熟成酿造份数。
 * 纯展示 + 单个「知道了」关闭按钮（不可点遮罩关闭，确保玩家看到结算）。
 */

import { Node, UITransform } from 'cc';
import { ModalPanel } from './ModalPanel';
import { C, Btn } from './theme';
import { Layout } from './layoutConfig';
import { ModalRow, ModalScrollList, UIButton, UIHStack } from './widgets';
import { OfflineReport } from '../systems/TimeSystem';
import { t } from '../i18n';

export class OfflineModal extends ModalPanel {
    protected panelW = 640;
    protected panelH = 720;
    protected showMask = true;
    protected maskClose = false;   // 必须点「知道了」关闭，确保玩家看到结算
    protected showClose = false;

    private _report: OfflineReport | null = null;
    private _list!: ModalScrollList;
    /** 以面板中心(0,0)为原点的私有根容器：不走基类 _content，避免 resizePanel 后 _content 下移导致坐标基准错乱 */
    private _root: Node | null = null;

    protected render(): void {
        const r = this._report;
        if (!r) { this.hide(); return; }

        // 私有根容器：以面板中心(0,0)为原点，挂到 _panel。
        // 关键：基类 _content 在 resizePanel 后会随 panelH 下移(y = panelH/2-90)，
        // 若把列表/按钮挂 _content 而用「相对面板中心」的 listTop 定位，会产生双重偏移
        // —— 列表被推到面板顶之上(顶出边界)且底部留大片空白。故自建 _root 统一基准。
        if (!this._root || !this._root.isValid) {
            this._root = new Node('OfflineRoot');
            this._root.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
            this._root.setPosition(0, 0, 0);
            this._root.setParent(this._panel);
        } else {
            for (const c of [...this._root.children]) c.destroy();
        }

        const listW = this.panelW - 56;

        const rows: ModalRow[] = [];
        rows.push(new ModalRow({
            width: listW,
            name: t('ui.offline.arrived', '来到了 第{day}日（{season}季）', { day: r.dayAfter, season: r.seasonName }),
            align: 'left',
            bg: C.optionBg, stroke: C.optionStroke,
        }));

        // 状态变化（只列有变化的维度）
        const sd = r.stateDelta;
        const fmt = (v: number) => (v <= 0 ? `−${Math.round(-v)}` : `+${Math.round(v)}`);
        const stateItems: [string, number][] = [
            [t('ui.status.full', '满腹'), sd.full],
            [t('ui.status.moist', '水分'), sd.moist],
            [t('ui.status.san', '精神'), sd.san],
            [t('ui.status.temp', '体温'), sd.temp],
        ];
        for (const [name, v] of stateItems) {
            if (Math.abs(v) < 0.5) continue;
            const down = v < 0;
            rows.push(new ModalRow({
                width: listW, name, align: 'left',
                meta: fmt(v), metaColor: down ? C.danger : C.accent2,
                subText: down ? t('ui.offline.down', '下降') : t('ui.offline.up', '回升'), subColor: C.sub, subSize: 18,
                bg: C.optionBg, stroke: C.optionStroke,
            }));
        }

        // 酿造熟成提示
        if (r.brewsGrew > 0) {
            rows.push(new ModalRow({
                width: listW, name: t('ui.offline.brewsGrew', '{n} 份酿造已熟成', { n: r.brewsGrew }), align: 'left',
                subText: t('ui.offline.harvestBrewery', '去酿酒桶收获'), subColor: C.accent2, subSize: 18,
                bg: C.optionBg, stroke: C.optionStroke,
            }));
        } else if (r.brewsReady > 0) {
            rows.push(new ModalRow({
                width: listW, name: t('ui.offline.brewsReady', '{n} 份酿造已可收获', { n: r.brewsReady }), align: 'left',
                subText: t('ui.offline.harvestBrewery', '去酿酒桶收获'), subColor: C.accent2, subSize: 18,
                bg: C.optionBg, stroke: C.optionStroke,
            }));
        }

        // 弹窗布局：标题区(topMargin) → 列表(viewH) → 按钮区(92)，全部相对面板中心(_root 原点)
        const topMargin = 70;            // 标题区预留（标题在面板内顶部）
        // 底部按钮区预留 = 16 间距 + 60 按钮高 + 16 底边距 = 92（少了按钮会溢出面板底边）
        const maxPanelH = Math.max(320, this._vsH - Layout.webNavInsetDesign - 32);
        const maxViewH = Math.max(160, maxPanelH - topMargin - 92);
        // 先按行数估算内容高（行高≈54 + 间距10），再定列表可视高：尽量完整显示，超限则内部滚动
        const estListH = Math.max(60, rows.length * 64 - 10);
        const viewH = Math.min(estListH, maxViewH);
        const panelH = this.resizePanel(Math.min(maxPanelH, topMargin + viewH + 92));

        // 头部：离开时长（紧接标题下方，相对面板中心）
        const realH = Math.max(1, Math.round(r.realMs / 3_600_000));
        const gameH = Math.round(r.hours);
        this.mkText(
            this._root, 0, panelH / 2 - 56, listW, 44,
            t('ui.offline.head', '你离开了约 {real} 小时，游戏内时光推进了 {game} 小时', { real: realH, game: gameH }),
            20, C.sub,
            { anchorY: 1, align: 'center' },
        );

        const listTop = panelH / 2 - topMargin;   // 列表可视区顶（相对面板中心 = _root 原点）

        this._list = this.createScrollList({
            parent: this._root, x: 0, y: listTop,
            width: listW, viewH, gap: 10,
            autoResizePanel: false, repositionScroll: false, align: 'center',
        });
        this._list.setRows(rows);

        // 底部「知道了」按钮：紧贴列表可视区下方（listTop - viewH = 可视区底，再留 16 间距 + 半高）
        const btnW = 240;
        const btnRow = new UIHStack().gap(0)
            .add(new UIButton(t('ui.offline.ok', '知道了'), Btn.confirm, () => this.hide(), btnW, 60));
        btnRow.mount(this._root);
        btnRow.pos(0, listTop - viewH - 16 - 30, 0);
    }

    /** 展示离线结算报告 */
    public showReport(report: OfflineReport): void {
        this._report = report;
        this.show(t('ui.offline.title', '你离开的这段时间'));
    }
}
