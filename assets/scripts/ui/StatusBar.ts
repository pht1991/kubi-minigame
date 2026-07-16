/**
 * StatusBar.ts - 顶部状态栏
 * 两行布局：标题行(HP 满腹 水分...) + 数值行(100 100 100...)，纯数字无进度条
 */

import { _decorator, Component, Label, Node, Color } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventBus, GameEvents } from '../core/EventBus';
import { TimeSystem } from '../systems/TimeSystem';
import { MAX_STATE, TEMP_DATA } from '../data/data';

const { ccclass, property } = _decorator;

@ccclass('StatusBar')
export class StatusBar extends Component {
    @property(Label)
    timeLabel: Label | null = null;

    /** 状态标签 — 两行格式：标题\n数值 */
    @property(Label)
    hpLabel: Label | null = null;
    @property(Label)
    fullLabel: Label | null = null;
    @property(Label)
    moistLabel: Label | null = null;
    @property(Label)
    psLabel: Label | null = null;
    @property(Label)
    sanLabel: Label | null = null;
    @property(Label)
    tempLabel: Label | null = null;

    private get _gm(): GameManager { return GameManager.instance; }
    private get _eventBus(): EventBus { return EventBus.instance; }
    private get _timeSys(): TimeSystem { return TimeSystem.instance; }

    onLoad(): void {
        this._eventBus.on(GameEvents.STATE_CHANGE, this.refresh.bind(this));
        this._eventBus.on(GameEvents.TIME_PASS, this.refresh.bind(this));
        this._eventBus.on(GameEvents.UI_REFRESH, this.refresh.bind(this));
        this.refresh();
    }

    onDestroy(): void {
        this._eventBus.off(GameEvents.STATE_CHANGE, this.refresh.bind(this));
        this._eventBus.off(GameEvents.TIME_PASS, this.refresh.bind(this));
        this._eventBus.off(GameEvents.UI_REFRESH, this.refresh.bind(this));
    }

    /** 刷新状态栏（两行布局：标题行 + 数值行） */
    refresh(): void {
        const s = this._gm.playerState;

        // 时间（深棕色）
        if (this.timeLabel) {
            this.timeLabel.string = this._timeSys.getTimeDesc();
            this.timeLabel.color = new Color(60, 45, 30, 255);
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
            this.tempLabel.string = `体温\n${tempDesc}`;
            this.tempLabel.color = (s.temp >= 30 || s.temp <= -15)
                ? new Color(200, 50, 40, 255)
                : new Color(60, 45, 30, 255);
        }
    }

    /** 按比例返回颜色：低于阈值=警告红，正常=深棕 */
    private ratioColor(ratio: number, dangerThreshold: number): Color {
        return ratio <= dangerThreshold
            ? new Color(200, 50, 40, 255)
            : new Color(70, 55, 40, 255);
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

    private setLabel(label: Label | null, text: string, color?: Color): void {
        if (!label) return;
        label.string = text;
        if (color) label.color = color;
    }
}
