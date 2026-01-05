/**
 * rules add 命令实现
 */

const fs = require('fs');
const path = require('path');

async function rulesAddCommand(options) {
  const configPath = path.join(process.cwd(), options.config || 'config/match-rules.json');

  // 加载现有配置
  let config = {
    global: { ignoreProps: [] },
    interfaces: []
  };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (error) {
      console.error(`❌ 读取配置文件失败: ${error.message}`);
      process.exit(1);
    }
  }

  // 确保 interfaces 数组存在
  if (!config.interfaces) {
    config.interfaces = [];
  }

  // 检查接口是否已存在
  const existingIndex = config.interfaces.findIndex(
    r => r.interfaceName === options.interface
  );

  const newRule = {
    interfaceName: options.interface
  };

  if (options.ignore) {
    newRule.ignoreProps = options.ignore.split(',').map(s => s.trim());
  }

  if (options.essential) {
    newRule.essentialProps = options.essential.split(',').map(s => s.trim());
  }

  if (options.deepIgnore !== undefined) {
    newRule.deepIgnore = options.deepIgnore;
  }

  if (existingIndex >= 0) {
    // 更新现有规则
    config.interfaces[existingIndex] = {
      ...config.interfaces[existingIndex],
      ...newRule
    };
    console.log(`✅ 更新接口规则: ${options.interface}`);
  } else {
    // 添加新规则
    config.interfaces.push(newRule);
    console.log(`✅ 添加接口规则: ${options.interface}`);
  }

  // 保存配置
  try {
    // 确保目录存在
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ 配置已保存: ${configPath}`);
  } catch (error) {
    console.error(`❌ 保存配置文件失败: ${error.message}`);
    process.exit(1);
  }
}

module.exports = rulesAddCommand;

