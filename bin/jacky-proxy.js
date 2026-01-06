#!/usr/bin/env node

/**
 * Jacky Proxy CLI 工具入口文件
 * 使用 commander.js 构建命令行界面
 */

const { Command } = require('commander');
const path = require('path');

const program = new Command();

// 设置程序信息
program
  .name('jacky-proxy')
  .description('通用 Mock 服务器 CLI 工具 - 用于管理 Mock 数据和启动服务器')
  .version(require('../package.json').version);

// migrate 命令
program
  .command('migrate')
  .description('从 Raw 文件夹生成 Mock 数据文件')
  .option('-s, --scenario <name>', '场景名称')
  .option('-t, --target <path>', '目标文件夹路径')
  .option('-r, --raw <path>', 'Raw 文件夹路径（可选，会自动检测）')
  .option('--ignore <interfaces>', '要忽略的接口（逗号分隔）', '')
  .option('-i, --interactive', '交互式模式（默认）', true)
  .option('--no-interactive', '禁用交互式模式')
  .action(async (options) => {
    const migrateCommand = require('../src/commands/migrate');
    await migrateCommand(options);
  });

// start 命令
program
  .command('start [mock-id-or-path]')
  .description('启动 Mock 服务器（支持直接启动 Raw 文件夹或 mock-id）')
  .option('-p, --port <port>', '监听端口', '5000')
  .option('-m, --mock-id <id>', '接口集 ID（如果未在命令中指定）')
  .option('-c, --config <path>', '配置文件路径', 'proxy.config.json')
  .option('-s, --scenario <name>', '场景名称（当启动 Raw 文件夹时使用）', '默认场景')
  .option('-t, --target <path>', '目标文件夹路径（当启动 Raw 文件夹时使用）', 'mocks/test-folder')
  .option('--ignore <interfaces>', '要忽略的接口（逗号分隔，当启动 Raw 文件夹时使用）', '')
  .option('--no-migrate', '不自动迁移，直接启动（如果指定的是 Raw 文件夹）')
  .option('--debug', '开启 Debug 模式，输出详细的请求日志')
  .action(async (mockIdOrPath, options) => {
    const startCommand = require('../src/commands/start');
    await startCommand(mockIdOrPath || options.mockId || '1', options);
  });

// config 命令组
const configCommand = program
  .command('config')
  .description('管理接口集配置');

configCommand
  .command('generate')
  .description('生成配置文件')
  .option('-r, --root <dir>', '根目录', process.cwd())
  .option('-o, --output <path>', '输出文件路径', 'proxy.config.json')
  .option('-l, --library-id <id>', '库 ID', '2773')
  .option('-s, --start-id <id>', '起始 ID', '1')
  .action(async (options) => {
    const configGenerateCommand = require('../src/commands/config-generate');
    await configGenerateCommand(options);
  });

configCommand
  .command('validate')
  .description('验证配置文件')
  .option('-c, --config <path>', '配置文件路径', 'proxy.config.json')
  .action(async (options) => {
    const configValidateCommand = require('../src/commands/config-validate');
    await configValidateCommand(options);
  });

configCommand
  .command('merge')
  .description('合并配置')
  .option('-r, --root <dir>', '根目录', process.cwd())
  .option('-c, --config <path>', '配置文件路径', 'proxy.config.json')
  .action(async (options) => {
    const configMergeCommand = require('../src/commands/config-merge');
    await configMergeCommand(options);
  });

// rules 命令组（新功能）
const rulesCommand = program
  .command('rules')
  .description('管理匹配规则配置');

rulesCommand
  .command('list')
  .description('列出所有匹配规则')
  .option('-c, --config <path>', '配置文件路径', 'config/match-rules.json')
  .action(async (options) => {
    const rulesListCommand = require('../src/commands/rules-list');
    await rulesListCommand(options);
  });

rulesCommand
  .command('add')
  .description('添加匹配规则')
  .requiredOption('-i, --interface <name>', '接口名称')
  .option('-c, --config <path>', '配置文件路径', 'config/match-rules.json')
  .option('--ignore <props>', '要忽略的属性（逗号分隔）')
  .option('--essential <props>', '必需属性（逗号分隔）')
  .option('--deep-ignore', '启用深度忽略')
  .action(async (options) => {
    const rulesAddCommand = require('../src/commands/rules-add');
    await rulesAddCommand(options);
  });

rulesCommand
  .command('remove')
  .description('删除匹配规则')
  .requiredOption('-i, --interface <name>', '接口名称')
  .option('-c, --config <path>', '配置文件路径', 'config/match-rules.json')
  .action(async (options) => {
    const rulesRemoveCommand = require('../src/commands/rules-remove');
    await rulesRemoveCommand(options);
  });

rulesCommand
  .command('test')
  .description('测试匹配规则')
  .requiredOption('-i, --interface <name>', '接口名称')
  .requiredOption('-r, --request <path>', '请求文件路径')
  .option('-c, --config <path>', '配置文件路径', 'config/match-rules.json')
  .action(async (options) => {
    const rulesTestCommand = require('../src/commands/rules-test');
    await rulesTestCommand(options);
  });

// 在解析之前，检查第一个参数是否是 Raw 文件夹路径
// 如果是，自动调用 start 命令
const args = process.argv.slice(2);
if (args.length > 0) {
  const firstArg = args[0];
  const fs = require('fs');
  const path = require('path');
  
  // 检查是否是已知命令
  const knownCommands = ['migrate', 'start', 'config', 'rules'];
  const isKnownCommand = knownCommands.includes(firstArg);
  
  // 如果不是已知命令，检查是否是 Raw 文件夹路径
  if (!isKnownCommand) {
    // 规范化路径，确保正确处理相对路径（包括 ./ 开头的路径）
    const fullPath = path.isAbsolute(firstArg) 
      ? path.resolve(firstArg)
      : path.resolve(process.cwd(), firstArg);
    
    // 检查是否是 Raw 文件夹路径：路径必须以 .folder 结尾，且路径存在且是目录
    const isRawFolderPath = (firstArg.endsWith('.folder') || path.basename(fullPath).endsWith('.folder')) &&
      fs.existsSync(fullPath) && 
      fs.statSync(fullPath).isDirectory();
    
    if (isRawFolderPath) {
      // 将路径作为 start 命令的参数（使用规范化后的路径）
      const startCommand = require('../src/commands/start');
      const startOptions = {};
      
      // 解析其他选项（使用 commander 的选项解析逻辑）
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--port' || arg === '-p') {
          startOptions.port = args[++i];
        } else if (arg === '--scenario' || arg === '-s') {
          startOptions.scenario = args[++i];
        } else if (arg === '--target' || arg === '-t') {
          startOptions.target = args[++i];
        } else if (arg === '--ignore') {
          startOptions.ignore = args[++i];
        } else if (arg === '--debug') {
          startOptions.debug = true;
        } else if (arg === '--no-migrate') {
          startOptions.noMigrate = true;
        } else if (arg === '--config' || arg === '-c') {
          startOptions.config = args[++i];
        } else if (arg.startsWith('--port=')) {
          startOptions.port = arg.split('=')[1];
        } else if (arg.startsWith('--scenario=')) {
          startOptions.scenario = arg.split('=')[1];
        } else if (arg.startsWith('--target=')) {
          startOptions.target = arg.split('=')[1];
        } else if (arg.startsWith('--ignore=')) {
          startOptions.ignore = arg.split('=')[1];
        } else if (arg.startsWith('--config=')) {
          startOptions.config = arg.split('=')[1];
        }
      }
      
      // 调用 start 命令，传递原始参数（startCommand 内部会再次解析）
      startCommand(firstArg, startOptions).catch((error) => {
        console.error('启动失败:', error);
        process.exit(1);
      });
      return;
    }
  }
}

// 解析命令行参数
program.parse();

