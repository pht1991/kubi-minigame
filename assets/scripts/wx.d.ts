// 微信小游戏全局对象：仅构建期类型声明，运行时由微信基础库提供。
// 项目在微信平台下大量使用 wx.cloud / wx.getFileSystemManager 等，
// 类型壳（node_modules/cc）未声明该全局变量，故在此做环境声明。
declare const wx: any;
