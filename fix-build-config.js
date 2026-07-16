// 构建后优化脚本
// 用法: node fix-build-config.js
const fs = require('fs');
const path = require('path');

const WECHAT_DIR = path.join(__dirname, 'build', 'wechatgame');

if (!fs.existsSync(WECHAT_DIR)) {
    console.log('[post-build] build/wechatgame/ 不存在，请先在 Cocos Creator 中构建');
    process.exit(1);
}

let fixes = 0;

// ===== 1. 修复 libVersion =====
const configPath = path.join(WECHAT_DIR, 'project.config.json');
if (fs.existsSync(configPath)) {
    let raw = fs.readFileSync(configPath, 'utf-8');
    let config = JSON.parse(raw);
    if (config.libVersion !== '3.16.2') {
        config.libVersion = '3.16.2';
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log('[1/3] libVersion 已修复为 "3.16.2"');
        fixes++;
    } else {
        console.log('[1/3] libVersion 无需修复');
    }
}

// ===== 2. 包体报告 =====
console.log('\n[2/3] 包体体积报告:');
function du(dir) {
    let total = 0;
    try {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            const st = fs.statSync(fp);
            if (st.isDirectory()) total += du(fp);
            else total += st.size;
        }
    } catch (_) { /* skip */ }
    return total;
}

const categories = {
    'Cocos 引擎 (cocos-js)': path.join(WECHAT_DIR, 'cocos-js'),
    '游戏资源 (assets)': path.join(WECHAT_DIR, 'assets'),
    '项目脚本 (src)': path.join(WECHAT_DIR, 'src'),
};
const totalSize = du(WECHAT_DIR);
for (const [name, p] of Object.entries(categories)) {
    const s = du(p);
    const pct = totalSize ? ((s / totalSize) * 100).toFixed(1) : '0';
    console.log(`  ${(s / 1024).toFixed(0).padStart(5)}K  (${pct}%)  ${name}`);
}
console.log(`  -----`);
console.log(`  ${(totalSize / 1024).toFixed(0).padStart(5)}K  总计`);

// ===== 3. 检查冗余文件 =====
console.log('\n[3/3] 冗余检查:');

// 检查 Bullet & Spine wasm (应该被引擎裁剪移除)
const bulletPath = path.join(WECHAT_DIR, 'cocos-js', 'assets', 'bullet-617b536a.wasm');
const spinePath = path.join(WECHAT_DIR, 'cocos-js', 'assets', 'spine-f02329b9.wasm');
if (fs.existsSync(bulletPath)) {
    console.log('  !! Bullet wasm 仍在，确认引擎模块设置后重新构建');
} else {
    console.log('  ok Bullet wasm 已移除');
    fixes++;
}
if (fs.existsSync(spinePath)) {
    console.log('  !! Spine wasm 仍在，确认引擎模块设置后重新构建');
} else {
    console.log('  ok Spine wasm 已移除');
    fixes++;
}

// 检查 PNG 变体数量
const nativeDir = path.join(WECHAT_DIR, 'assets', 'main', 'native');
if (fs.existsSync(nativeDir)) {
    let pngCount = 0;
    const variantMap = {};
    function scanNative(dir) {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            if (fs.statSync(fp).isDirectory()) { scanNative(fp); continue; }
            if (!f.endsWith('.png')) continue;
            pngCount++;
            // 提取基础 UUID（去掉 @ 后缀）
            const base = f.split('@')[0];
            variantMap[base] = (variantMap[base] || 0) + 1;
        }
    }
    scanNative(nativeDir);
    const maxVariants = Math.max(...Object.values(variantMap), 0);
    const totalSizePNG = du(nativeDir);
    console.log(`  PNG: ${pngCount} 个文件 / ${(totalSizePNG / 1024).toFixed(0)}K`);
    if (maxVariants > 3) {
        console.log(`  TIP: ${maxVariants}x 分辨率变体偏多，建议在 Cocos Creator 中减少支持的缩放档位`);
    }
}

// ===== 总结 =====
console.log(`\n========== 所有后处理完成 (${fixes}项修复) ==========`);
if (totalSize > 4 * 1024 * 1024) {
    console.log('?? 包体 > 4M，微信小游戏有 4M 主包限制，建议继续优化');
}
