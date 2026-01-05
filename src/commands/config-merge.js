/**
 * config merge 命令实现
 */

const fs = require('fs');
const path = require('path');
const { generateConfig, mergeConfig } = require('../../scripts/generate-config');

async function configMergeCommand(options) {
  const configPath = path.join(process.cwd(), options.config || 'proxy.config.json');
  
  if (!fs.existsSync(configPath)) {
    console.error('❌ 现有配置文件不存在');
    process.exit(1);
  }

  const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const newConfig = generateConfig({ 
    rootDir: options.root || process.cwd(),
    outputPath: null // 不保存，只返回配置对象
  });
  const mergedConfig = mergeConfig(existingConfig, newConfig);

  fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
  console.log('\n✅ 配置合并完成');
}

module.exports = configMergeCommand;

