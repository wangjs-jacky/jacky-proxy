/**
 * config validate 命令实现
 */

const path = require('path');
const { validateConfig } = require('../../scripts/generate-config');

async function configValidateCommand(options) {
  const configPath = path.join(process.cwd(), options.config || 'proxy.config.json');
  const result = validateConfig(configPath);

  if (result.valid) {
    console.log('\n✅ 配置文件验证通过');
    if (result.warnings.length > 0) {
      console.log('\n⚠️  警告:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }
  } else {
    console.error('\n❌ 配置文件验证失败:');
    result.errors.forEach(e => console.error(`  - ${e}`));
    if (result.warnings.length > 0) {
      console.log('\n⚠️  警告:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }
    process.exit(1);
  }
}

module.exports = configValidateCommand;

