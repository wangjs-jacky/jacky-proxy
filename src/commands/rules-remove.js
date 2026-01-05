/**
 * rules remove 命令实现
 */

const fs = require('fs');
const path = require('path');

async function rulesRemoveCommand(options) {
  const configPath = path.join(process.cwd(), options.config || 'config/match-rules.json');

  if (!fs.existsSync(configPath)) {
    console.error(`❌ 配置文件不存在: ${configPath}`);
    process.exit(1);
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!config.interfaces) {
      console.log('⚠️  配置中没有接口规则');
      return;
    }

    const index = config.interfaces.findIndex(
      r => r.interfaceName === options.interface
    );

    if (index === -1) {
      console.log(`⚠️  未找到接口规则: ${options.interface}`);
      return;
    }

    config.interfaces.splice(index, 1);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ 已删除接口规则: ${options.interface}`);
  } catch (error) {
    console.error(`❌ 操作失败: ${error.message}`);
    process.exit(1);
  }
}

module.exports = rulesRemoveCommand;

