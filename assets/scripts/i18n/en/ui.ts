/**
 * 英文 · UI 层覆盖表（第一批：菜单 / 设置 / 阵营 / 通用）
 *
 * 与 t('ui.xxx', '中文') 的 key 一一对应。未列出的 key 运行时会回退到
 * 调用处传入的中文原文（见 i18n/index.ts 的 t()），因此 UI 的迁移可以逐页推进，
 * 半迁移状态也不会破版。
 */
export const EN_UI: Record<string, string> = {
    // 菜单主页
    'ui.menu.title': 'Menu',
    'ui.menu.skills': 'Skills',
    'ui.menu.settings': 'Settings',
    'ui.menu.breadcrumb': 'Home > Menu',
    'ui.menu.breadcrumb.skills': 'Menu > Skills',
    'ui.menu.breadcrumb.settings': 'Menu > Settings',

    // 技能页
    'ui.skill.talent': '(Talent)',
    'ui.skill.empty': 'No skills learned yet',

    // 设置页
    'ui.settings.title': 'Settings',
    'ui.settings.save': 'Save Game',
    'ui.settings.load': 'Load Game',
    'ui.settings.cloud': 'Cloud Save',
    'ui.settings.autoSave': 'Auto Save: {state}',
    'ui.settings.volLabel': 'Volume: {pct}',
    'ui.settings.volUp': 'Vol +',
    'ui.settings.volDown': 'Vol -',
    'ui.settings.stats': 'Statistics',
    'ui.settings.help': 'Help',
    'ui.settings.reincarnation': 'Reincarnate',
    'ui.settings.reincarnationLocked': 'Reincarnate (Locked)',
    'ui.settings.camp': 'Faction: {c}',
    'ui.settings.chooseCamp': 'Choose Faction',

    // 通用
    'ui.on': 'On',
    'ui.off': 'Off',
    'ui.fire': 'Fire Faction',
    'ui.ice': 'Ice Faction',

    // 底栏快捷操作（首页常驻）
    'ui.bar.bag': 'Bag',
    'ui.bar.goOut': 'Go Out',
    'ui.bar.goHome': 'Go Home',
    'ui.bar.menu': 'Menu',

    // 提示消息
    'ui.msg.saved': 'Game Saved',
    'ui.msg.loaded': 'Game Loaded',
    'ui.msg.autoSaveOn': 'Auto Save On',
    'ui.msg.autoSaveOff': 'Auto Save Off',

    // 阵营选择弹窗
    'ui.camp.title': 'Choose Your Faction',
    'ui.camp.already': 'You already belong to {c}; cannot change.',
    'ui.camp.fireDesc': 'Warmer body (harder to freeze); stable metabolism cuts Fullness/Moisture loss by 15%; +5% attack in combat.',
    'ui.camp.iceDesc': 'Calm mind slows Sanity decay by 50%; more stable in the cold.',

    // 状态栏六个属性标签
    'ui.status.hp': 'HP',
    'ui.status.full': 'Full',
    'ui.status.moist': 'Moist',
    'ui.status.ps': 'Stam',
    'ui.status.san': 'San',
    'ui.status.temp': 'Temp',

    // 时间 / 季节
    'ui.time.spring': 'Spring',
    'ui.time.summer': 'Summer',
    'ui.time.autumn': 'Autumn',
    'ui.time.winter': 'Winter',
    'ui.time.morning': 'Morning',
    'ui.time.forenoon': 'AM',
    'ui.time.noon': 'Noon',
    'ui.time.afternoon': 'PM',
    'ui.time.dusk': 'Dusk',
    'ui.time.night': 'Night',
    'ui.time.format': '{season} Day {day} · {period}',

    // 离线收益结算弹窗
    'ui.offline.title': 'While You Were Away',
    'ui.offline.head': 'You were away about {real} hours; {game} hours passed in-game.',
    'ui.offline.arrived': 'Arrived at Day {day} ({season})',
    'ui.offline.down': 'Down',
    'ui.offline.up': 'Up',
    'ui.offline.brewsGrew': '{n} brews finished aging',
    'ui.offline.brewsReady': '{n} brews ready to harvest',
    'ui.offline.harvestBrewery': 'Harvest at the brewery',
    'ui.offline.ok': 'Got it',
};
