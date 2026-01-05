/**
 * rules test 命令实现
 */

const fs = require('fs');
const path = require('path');

async function rulesTestCommand(options) {
  const configPath = path.join(process.cwd(), options.config || 'config/match-rules.json');
  const requestPath = path.join(process.cwd(), options.request);

  // 加载配置
  if (!fs.existsSync(configPath)) {
    console.error(`❌ 配置文件不存在: ${configPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(requestPath)) {
    console.error(`❌ 请求文件不存在: ${requestPath}`);
    process.exit(1);
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const requestData = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));

    // 查找接口规则
    const interfaceRule = config.interfaces?.find(
      r => r.interfaceName === options.interface
    );

    if (!interfaceRule) {
      console.log(`⚠️  未找到接口规则: ${options.interface}`);
      console.log('   使用全局规则进行测试');
    }

    console.log('\n🧪 测试匹配规则:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`接口名称: ${options.interface}`);
    console.log(`请求文件: ${options.request}`);
    console.log('\n配置的规则:');

    if (interfaceRule) {
      if (interfaceRule.ignoreProps) {
        console.log(`  忽略属性: ${interfaceRule.ignoreProps.join(', ')}`);
      }
      if (interfaceRule.essentialProps) {
        console.log(`  必需属性: ${interfaceRule.essentialProps.join(', ')}`);
      }
      if (interfaceRule.deepIgnore !== undefined) {
        console.log(`  深度忽略: ${interfaceRule.deepIgnore}`);
      }
    } else {
      console.log('  (使用全局规则)');
      if (config.global?.ignoreProps) {
        console.log(`  全局忽略属性: ${config.global.ignoreProps.join(', ')}`);
      }
    }

    console.log('\n请求数据:');
    console.log(JSON.stringify(requestData, null, 2));

    console.log('\n✅ 测试完成（此命令仅显示配置信息，实际匹配需要在服务器运行时测试）');
    console.log('═══════════════════════════════════════════════════════');
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`);
    process.exit(1);
  }
}

module.exports = rulesTestCommand;

