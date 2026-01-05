/**
 * config generate 命令实现
 */

const path = require('path');
const { generateConfig } = require('../../scripts/generate-config');

async function configGenerateCommand(options) {
  const opts = {
    rootDir: options.root || process.cwd(),
    outputPath: path.join(process.cwd(), options.output || 'proxy.config.json'),
    libraryId: parseInt(options.libraryId || '2773'),
    startId: parseInt(options.startId || '1')
  };

  try {
    generateConfig(opts);
    console.log('\n✨ 配置生成完成！');
  } catch (error) {
    console.error('\n❌ 配置生成失败:', error.message);
    process.exit(1);
  }
}

module.exports = configGenerateCommand;

