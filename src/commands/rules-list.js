/**
 * rules list 命令实现
 */

const fs = require('fs');
const path = require('path');

async function rulesListCommand(options) {
  const configPath = path.join(process.cwd(), options.config || 'config/match-rules.json');

  if (!fs.existsSync(configPath)) {
    console.error(`❌ 配置文件不存在: ${configPath}`);
    process.exit(1);
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    console.log('\n📋 匹配规则配置:');
    console.log('═══════════════════════════════════════════════════════\n');

    // 全局规则
    if (config.global) {
      console.log('🌐 全局规则:');
      if (config.global.ignoreProps && config.global.ignoreProps.length > 0) {
        console.log(`  忽略属性: ${config.global.ignoreProps.join(', ')}`);
      }
      if (config.global.description) {
        console.log(`  说明: ${config.global.description}`);
      }
      console.log('');
    }

    // 接口规则
    if (config.interfaces && config.interfaces.length > 0) {
      console.log('🔧 接口规则:');
      config.interfaces.forEach((rule, index) => {
        console.log(`\n  ${index + 1}. ${rule.interfaceName}`);
        if (rule.ignoreProps && rule.ignoreProps.length > 0) {
          console.log(`     忽略属性: ${rule.ignoreProps.join(', ')}`);
        }
        if (rule.essentialProps && rule.essentialProps.length > 0) {
          console.log(`     必需属性: ${rule.essentialProps.join(', ')}`);
        }
        if (rule.deepIgnore !== undefined) {
          console.log(`     深度忽略: ${rule.deepIgnore}`);
        }
        if (rule.sortProps && rule.sortProps.length > 0) {
          console.log(`     排序配置: ${JSON.stringify(rule.sortProps)}`);
        }
        if (rule.description) {
          console.log(`     说明: ${rule.description}`);
        }
      });
    } else {
      console.log('  (无接口规则)');
    }

    console.log('\n═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error(`❌ 读取配置文件失败: ${error.message}`);
    process.exit(1);
  }
}

module.exports = rulesListCommand;

