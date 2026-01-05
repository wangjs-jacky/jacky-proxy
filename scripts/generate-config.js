/**
 * 配置生成工具
 * 自动扫描目录，发现包含 .mock.ts 文件的文件夹，生成 proxy.config.json 配置文件
 */

const fs = require('fs');
const path = require('path');

/**
 * 扫描目录，查找包含 .mock.ts 文件的文件夹
 * @param {string} rootDir - 根目录路径
 * @param {string} basePath - 基础路径（用于生成相对路径）
 * @returns {Array} 包含 Mock 文件的文件夹列表
 */
function scanForMockFolders(rootDir, basePath = '') {
  const mockFolders = [];
  const visited = new Set();

  function scanDirectory(dir, relativePath) {
    // 避免重复扫描
    const normalizedPath = path.normalize(dir);
    if (visited.has(normalizedPath)) {
      return;
    }
    visited.add(normalizedPath);

    if (!fs.existsSync(dir)) {
      return;
    }

    try {
      const items = fs.readdirSync(dir);

      let hasMockFiles = false;
      const mockFiles = [];

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          // 递归扫描子目录
          const subRelativePath = path.join(relativePath, item).replace(/\\/g, '/');
          scanDirectory(itemPath, subRelativePath);
        } else if (item.endsWith('.mock.ts') || item.endsWith('.mock.js')) {
          hasMockFiles = true;
          mockFiles.push(item);
        }
      }

      // 如果当前目录包含 Mock 文件，添加到列表
      if (hasMockFiles) {
        const folderPath = relativePath || '.';
        const folderName = path.basename(dir) || 'Root';

        // 检查是否已存在（避免重复）
        const existingIndex = mockFolders.findIndex(f => f.path === folderPath);
        if (existingIndex === -1) {
          mockFolders.push({
            path: folderPath,
            name: folderName,
            mockFiles: mockFiles,
            fullPath: dir
          });
        }
      }
    } catch (error) {
      console.warn(`扫描目录失败: ${dir}`, error.message);
    }
  }

  scanDirectory(rootDir, basePath);
  return mockFolders;
}

/**
 * 生成配置文件
 * @param {Object} options - 配置选项
 * @param {string} options.rootDir - 扫描的根目录（默认：当前目录）
 * @param {string} options.outputPath - 输出文件路径（默认：proxy.config.json）
 * @param {number} options.libraryId - 库 ID（默认：2773）
 * @param {number} options.startId - 起始 ID（默认：1）
 * @param {Array} options.excludePaths - 要排除的路径（默认：['node_modules', '.git', 'dist']）
 * @returns {Object} 生成的配置对象
 */
function generateConfig(options = {}) {
  const {
    rootDir = process.cwd(),
    outputPath = path.join(process.cwd(), 'proxy.config.json'),
    libraryId = 2773,
    startId = 1,
    excludePaths = ['node_modules', '.git', 'dist', 'base-data', 'utils', 'config', 'scripts']
  } = options;

  console.log('\n🔍 开始扫描目录...');
  console.log(`📂 根目录: ${rootDir}`);

  // 扫描包含 Mock 文件的文件夹
  const mockFolders = scanForMockFolders(rootDir);

  // 过滤排除的路径
  const filteredFolders = mockFolders.filter(folder => {
    const folderPath = folder.path.toLowerCase();
    return !excludePaths.some(exclude => 
      folderPath.includes(exclude.toLowerCase()) || 
      folder.fullPath.includes(exclude)
    );
  });

  console.log(`\n✅ 找到 ${filteredFolders.length} 个包含 Mock 文件的文件夹`);

  // 生成配置对象
  const config = {
    libraryId: libraryId,
    folders: {
      list: filteredFolders.map((folder, index) => ({
        id: startId + index,
        path: folder.path,
        name: folder.name || path.basename(folder.path) || `Mock Folder ${startId + index}`
      }))
    }
  };

  // 输出信息
  console.log('\n📋 生成的配置:');
  config.folders.list.forEach(folder => {
    console.log(`  - ID: ${folder.id}, 路径: ${folder.path}, 名称: ${folder.name}`);
  });

  // 保存配置文件
  try {
    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`\n✅ 配置文件已保存: ${outputPath}`);
  } catch (error) {
    console.error(`\n❌ 保存配置文件失败:`, error.message);
    throw error;
  }

  return config;
}

/**
 * 合并现有配置（保留已有的 ID 和配置）
 * @param {Object} existingConfig - 现有配置
 * @param {Object} newConfig - 新扫描的配置
 * @returns {Object} 合并后的配置
 */
function mergeConfig(existingConfig, newConfig) {
  const existingPaths = new Set(
    existingConfig.folders.list.map(f => f.path)
  );

  // 保留现有配置
  const mergedList = [...existingConfig.folders.list];

  // 添加新发现的文件夹
  let nextId = Math.max(...existingConfig.folders.list.map(f => f.id), 0) + 1;
  newConfig.folders.list.forEach(folder => {
    if (!existingPaths.has(folder.path)) {
      mergedList.push({
        ...folder,
        id: nextId++
      });
    }
  });

  return {
    libraryId: existingConfig.libraryId,
    folders: {
      list: mergedList
    }
  };
}

/**
 * 验证配置文件
 * @param {string} configPath - 配置文件路径
 * @returns {Object} 验证结果
 */
function validateConfig(configPath) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    if (!fs.existsSync(configPath)) {
      result.valid = false;
      result.errors.push('配置文件不存在');
      return result;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // 验证结构
    if (!config.folders || !config.folders.list) {
      result.valid = false;
      result.errors.push('配置文件格式错误：缺少 folders.list');
      return result;
    }

    // 验证每个配置项
    config.folders.list.forEach((folder, index) => {
      if (!folder.id) {
        result.errors.push(`配置项 ${index + 1}: 缺少 id`);
      }
      if (!folder.path) {
        result.errors.push(`配置项 ${index + 1}: 缺少 path`);
      }

      // 检查路径是否存在
      const fullPath = path.join(path.dirname(configPath), folder.path);
      if (!fs.existsSync(fullPath)) {
        result.warnings.push(`配置项 ${index + 1}: 路径不存在 - ${folder.path}`);
      } else {
        // 检查是否包含 Mock 文件
        const files = fs.readdirSync(fullPath);
        const hasMockFiles = files.some(f => 
          f.endsWith('.mock.ts') || f.endsWith('.mock.js')
        );
        if (!hasMockFiles) {
          result.warnings.push(`配置项 ${index + 1}: 路径下没有 Mock 文件 - ${folder.path}`);
        }
      }
    });

    result.valid = result.errors.length === 0;
  } catch (error) {
    result.valid = false;
    result.errors.push(`解析配置文件失败: ${error.message}`);
  }

  return result;
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'generate' || !command) {
    // 生成配置
    const options = {
      rootDir: process.cwd(),
      outputPath: path.join(process.cwd(), 'proxy.config.json'),
      libraryId: 2773,
      startId: 1
    };

    // 解析命令行参数
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--root' && args[i + 1]) {
        options.rootDir = args[++i];
      } else if (arg === '--output' && args[i + 1]) {
        options.outputPath = args[++i];
      } else if (arg === '--library-id' && args[i + 1]) {
        options.libraryId = parseInt(args[++i]);
      } else if (arg === '--start-id' && args[i + 1]) {
        options.startId = parseInt(args[++i]);
      }
    }

    try {
      generateConfig(options);
      console.log('\n✨ 配置生成完成！');
    } catch (error) {
      console.error('\n❌ 配置生成失败:', error.message);
      process.exit(1);
    }
  } else if (command === 'validate') {
    // 验证配置
    const configPath = args[1] || path.join(process.cwd(), 'proxy.config.json');
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
  } else if (command === 'merge') {
    // 合并配置
    const existingPath = path.join(process.cwd(), 'proxy.config.json');
    if (!fs.existsSync(existingPath)) {
      console.error('❌ 现有配置文件不存在');
      process.exit(1);
    }

    const existingConfig = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    const newConfig = generateConfig({ rootDir: process.cwd() });
    const mergedConfig = mergeConfig(existingConfig, newConfig);

    fs.writeFileSync(existingPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
    console.log('\n✅ 配置合并完成');
  } else {
    console.log(`
用法:
  node scripts/generate-config.js [command] [options]

命令:
  generate    生成配置文件（默认）
  validate    验证配置文件
  merge        合并新发现的配置到现有配置

选项:
  --root <dir>         扫描的根目录（默认：当前目录）
  --output <path>       输出文件路径（默认：proxy.config.json）
  --library-id <id>     库 ID（默认：2773）
  --start-id <id>       起始 ID（默认：1）

示例:
  node scripts/generate-config.js generate
  node scripts/generate-config.js generate --root ./mocks
  node scripts/generate-config.js validate
  node scripts/generate-config.js merge
    `);
  }
}

module.exports = {
  generateConfig,
  validateConfig,
  mergeConfig,
  scanForMockFolders
};

