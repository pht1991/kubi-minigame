// 云函数 kubiSave —— KuBi 小游戏云存档
// 部署：微信开发者工具中右键本目录 → 上传并部署：云端安装依赖
// 权限：云函数以管理员身份读写数据库，无需配置集合安全规则

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return { ok: false, err: 'no openid' };

    const col = db.collection('kubi_saves');
    const action = event.action;

    if (action === 'put') {
        const existing = await col.where({ _openid: OPENID }).get();
        const data = {
            save: event.save,
            updatedAt: event.savedAt || Date.now(),
        };
        if (existing.data && existing.data.length) {
            await col.doc(existing.data[0]._id).update({ data });
        } else {
            await col.add({ data: { ...data, _openid: OPENID } });
        }
        return { ok: true, updatedAt: data.updatedAt };
    }

    if (action === 'get' || action === 'meta') {
        const existing = await col.where({ _openid: OPENID }).get();
        if (!existing.data || !existing.data.length) {
            return { ok: true, save: null, updatedAt: 0 };
        }
        const d = existing.data[0];
        return {
            ok: true,
            save: action === 'get' ? d.save : undefined,
            updatedAt: d.updatedAt,
        };
    }

    return { ok: false, err: 'unknown action' };
};
