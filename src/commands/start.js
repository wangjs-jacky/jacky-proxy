/**
 * start 命令实现
 * 启动 Mock 服务器
 * 支持：
 * 1. 直接启动 Raw 文件夹（自动转换后启动）
 * 2. 启动已有的 base-data + mocks 结构（通过 mock-id）
 */

const path = require('path');
const fs = require('fs');

/**
 * 查找项目根目录（包含 server.js 和 package.json 的目录）
 */
function findProjectRoot() {
  // 从当前文件所在目录开始向上查找
  let currentDir = __dirname;
  
  // 当前文件在 src/commands/start.js，所以需要向上两级
  // 但为了更通用，我们向上查找直到找到 server.js 或 package.json
  while (currentDir !== path.dirname(currentDir)) {
    const serverPath = path.join(currentDir, 'server.js');
    const packagePath = path.join(currentDir, 'package.json');
    
    if (fs.existsSync(serverPath) || fs.existsSync(packagePath)) {
      return currentDir;
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  // 如果没找到，返回默认的项目根目录（从 __dirname 向上两级）
  return path.resolve(__dirname, '../..');
}

/**
 * 检查路径是否是 Raw 文件夹（以 .folder 结尾的目录）
 */
function isRawFolder(pathStr) {
  if (!pathStr) return false;
  
  // 检查是否是绝对路径或相对路径
  const fullPath = path.isAbsolute(pathStr) 
    ? pathStr 
    : path.join(process.cwd(), pathStr);
  
  // 检查路径是否存在且是目录
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return false;
  }
  
  // 检查是否以 .folder 结尾
  return path.basename(fullPath).endsWith('.folder');
}

/**
 * 查找默认的 Raw 文件夹（以 .folder 结尾的文件夹）
 */
function findDefaultRawFolder() {
  try {
    const files = fs.readdirSync(process.cwd(), { withFileTypes: true });
    const folderFiles = files
      .filter(dirent => dirent.isDirectory() && dirent.name.endsWith('.folder'))
      .map(dirent => path.join(process.cwd(), dirent.name));
    
    if (folderFiles.length > 0) {
      folderFiles.sort();
      return folderFiles[0];
    }
  } catch (error) {
    // 忽略错误，返回 null
  }
  
  return null;
}

/**
 * start 命令主函数
 */
async function startCommand(mockIdOrPath, options) {
  let finalMockId = mockIdOrPath;
  
  // 检查是否是 Raw 文件夹路径
  if (isRawFolder(mockIdOrPath)) {
    console.log('🔍 检测到 Raw 文件夹，将自动转换后启动...');
    
    const rawFolderPath = path.isAbsolute(mockIdOrPath)
      ? mockIdOrPath
      : path.join(process.cwd(), mockIdOrPath);
    
    // 如果设置了 --no-migrate，直接报错
    if (options.noMigrate) {
      console.error('错误: 指定了 --no-migrate，但提供的是 Raw 文件夹路径');
      console.error('提示: 请先使用 jacky-proxy migrate 命令转换，或移除 --no-migrate 参数');
      process.exit(1);
    }
    
    // 执行迁移
    const migrateCommand = require('./migrate');
    const scenarioName = options.scenario || '场景1';
    const targetFolder = options.target || 'mocks/test-folder';
    const ignoreInterfaces = options.ignore
      ? options.ignore.split(',').map(s => s.trim()).filter(s => s)
      : [];
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  自动迁移 Raw 文件夹');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`场景名称: ${scenarioName}`);
    console.log(`目标文件夹: ${targetFolder}`);
    console.log(`Raw 文件夹: ${rawFolderPath}`);
    if (ignoreInterfaces.length > 0) {
      console.log(`忽略接口: ${ignoreInterfaces.join(', ')}`);
    }
    console.log('');
    
    // 调用迁移命令（非交互式）
    const migrateOptions = {
      scenario: scenarioName,
      target: targetFolder,
      raw: rawFolderPath,
      ignore: options.ignore || '',
      interactive: false
    };
    
    try {
      await migrateCommand(migrateOptions);
      
      // 从配置文件中读取新创建的 mock-id（配置文件在工作目录）
      const workDir = process.cwd();
      const configPath = path.join(workDir, options.config || 'proxy.config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const folder = config.folders.list.find(f => f.path === targetFolder);
        if (folder) {
          finalMockId = String(folder.id);
          console.log(`\n✅ 迁移完成，将使用场景 ID: ${finalMockId}`);
        } else {
          console.warn('警告: 无法在配置文件中找到新创建的场景，使用默认 ID: 1');
          finalMockId = '1';
        }
      } else {
        console.warn('警告: 配置文件不存在，使用默认 ID: 1');
        finalMockId = '1';
      }
    } catch (error) {
      console.error('迁移失败:', error.message);
      process.exit(1);
    }
  } else {
    // 检查是否是数字（mock-id）
    const mockIdNum = parseInt(mockIdOrPath);
    if (isNaN(mockIdNum)) {
      console.warn(`警告: "${mockIdOrPath}" 不是有效的 mock-id，将尝试作为 ID 使用`);
    }
    finalMockId = mockIdOrPath;
  }
  
  // 设置环境变量
  const workDir = process.cwd(); // 保存当前工作目录
  process.env.MOCK_ID = finalMockId;
  process.env.PORT = options.port || '5001';
  process.env.WORK_DIR = workDir; // 设置工作目录环境变量
  process.env.CONFIG_PATH = path.join(workDir, options.config || 'proxy.config.json');
  process.env.DEBUG = options.debug ? 'true' : 'false'; // 设置 Debug 模式

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  启动 Mock 服务器');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`场景 ID: ${finalMockId}`);
  console.log(`端口: ${process.env.PORT}`);
  console.log('');

  // 查找项目根目录
  const projectRoot = findProjectRoot();
  const serverPath = path.join(projectRoot, 'server.js');
  
  // 检查 server.js 是否存在
  if (!fs.existsSync(serverPath)) {
    console.error(`错误: 找不到 server.js 文件`);
    console.error(`  期望位置: ${serverPath}`);
    console.error(`  当前工作目录: ${process.cwd()}`);
    console.error(`  项目根目录: ${projectRoot}`);
    process.exit(1);
  }
  
  // 切换到项目根目录（这样 server.js 中的相对路径才能正确工作）
  const originalCwd = process.cwd();
  process.chdir(projectRoot);
  
  try {
    require(serverPath);
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.chdir(originalCwd); // 恢复原始工作目录
    process.exit(1);
  }
}

module.exports = startCommand;

