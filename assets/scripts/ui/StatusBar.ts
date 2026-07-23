/**
 * StatusBar.ts - 顶部状态栏
 * 两行布局：标题行(时间) + 6 个属性(生命/满腹/水分/体力/精神/体温)各 "标题\n数值"
 *
 * 纯代码友好：Label 字段由外部（MainScene.createStatusBar）用 UILabel 创建并赋值，
 * 不再依赖编辑器 @property 绑定或运行时按名查找（场景预置 StatusBar 已移除）。
 */

import { _decorator, Component, Color } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { TimeSystem } from '../systems/TimeSystem';
import { MAX_STATE, TEMP_DATA } from '../data/data';
import { C } from './theme';
import { UILabel } from './widgets';

const { ccclass } = _decorator;

@ccclass('StatusBar')
export class StatusBar extends Component {
    timeLabel: UILabel | null = null;
    hpLabel: UILabel | null = null;
    fullLabel: UILabel | null = null;
    moistLabel: UILabel | null = null;
    psLabel: UILabel | null = null;
    sanLabel: UILabel | null = null;
    tempLabel: UILabel | null = null;

    // 固定引用，避免 onLoad/onDestroy 中 bind 每次生成新函数导致 off 失效
    private _onRefresh = () => this.refresh();

    private get _gm(): GameManager { return GameManager.instance; }
    private get _eventBus(): EventBus { return EventBus.instance; }
    private get _timeSys(): TimeSystem { return TimeSystem.instance; }

    onLoad(): void {
        this._eventBus.on(GameEvents.STATE_CHANGE, this._onRefresh);
        this._eventBus.on(GameEvents.TIME_PASS, this._onRefresh);
        this._eventBus.on(GameEvents.UI_REFRESH, this._onRefresh);
        // 注意：Label 字段由 MainScene.createStatusBar 在 addComponent 之后才赋值，
        // 因此首帧填充延后到外部显式调用 refresh()（见 createStatusBar 末尾）。
    }

    onDestroy(): void {
        this._eventBus.off(GameEvents.STATE_CHANGE, this._onRefresh);
        this._eventBus.off(GameEvents.TIME_PASS, this._onRefresh);
        this._eventBus.off(GameEvents.UI_REFRESH, this._onRefresh);
    }

    /** 刷新状态栏（两行布局：标题行 + 数值行） */
    refresh(): void {
        const s = this._gm?.playerState;
        if (!s) return;

        // 时间（深棕色）
        if (this.timeLabel) {
            this.timeLabel.setText(this._timeSys.getTimeDesc());
            this.timeLabel.setColor(C.body);
        }

        // 两行格式：标题\n数值，按百分比着色
        this.setLabel(this.hpLabel,   `生命\n${Math.round(s.hp)}`,     this.ratioColor(s.hp / MAX_STATE, 0.3));
        this.setLabel(this.fullLabel, `满腹\n${Math.round(s.full)}`, this.ratioColor(s.full / MAX_STATE, 0.25));
        this.setLabel(this.moistLabel,`水分\n${Math.round(s.moist)}`, this.ratioColor(s.moist / MAX_STATE, 0.25));
        this.setLabel(this.psLabel,   `体力\n${Math.round(s.ps)}`,   this.ratioColor(s.ps / MAX_STATE, 0.2));
        this.setLabel(this.sanLabel,  `精神\n${Math.round(s.san)}`,  this.ratioColor(s.san / MAX_STATE, 0.2));

        // 体温（特殊：文字描述）
        if (this.tempLabel) {
            const tempDesc = this.getTempDesc(s.temp);
            this.tempLabel.setText(`体温\n${tempDesc}`);
            this.tempLabel.setColor((s.temp >= 30 || s.temp <= -15) ? C.danger : C.body);
        }
    }

    /** 按比例返回颜色：低于阈值=警告红，正常=深棕 */
    private ratioColor(ratio: number, dangerThreshold: number): Color {
        return ratio <= dangerThreshold ? C.danger : C.body;
    }

    /** 获取体温描述 */
    private getTempDesc(temp: number): string {
        // temp 范围大约 -50 ~ +50，映射到温度状态
        if (temp >= 30) return TEMP_DATA.veryHot?.name || '酷暑';
        if (temp >= 15) return TEMP_DATA.hot?.name || '炎热';
        if (temp >= 5) return TEMP_DATA.warm?.name || '温暖';
        if (temp >= -5) return TEMP_DATA.nice?.name || '舒适';
        if (temp >= -15) return TEMP_DATA.cool?.name || '微凉';
        if (temp >= -30) return TEMP_DATA.cold?.name || '寒冷';
        return TEMP_DATA.veryCold?.name || '极寒';
    }

    private setLabel(label: UILabel | null, text: string, color?: Color): void {
        if (!label) return;
        label.setText(text);
        if (color) label.setColor(color);
    }
}
