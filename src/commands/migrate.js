/**
 * migrate 命令实现
 * 从 Raw 文件夹生成 Mock 数据文件
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 配置 - 使用当前工作目录（用户运行命令的目录）
// 这样数据会生成到用户的工作目录，而不是 jacky-proxy 项目目录
const WORK_DIR = process.cwd();
const BASE_DATA_DIR = path.join(WORK_DIR, 'base-data');

/**
 * 查找默认的 Raw 文件夹（以 .folder 结尾的文件夹）
 * 在当前工作目录查找
 */
function findDefaultRawFolder() {
  try {
    const files = fs.readdirSync(WORK_DIR, { withFileTypes: true });
    const folderFiles = files
      .filter(dirent => dirent.isDirectory() && dirent.name.endsWith('.folder'))
      .map(dirent => path.join(WORK_DIR, dirent.name));
    
    if (folderFiles.length > 0) {
      folderFiles.sort();
      return folderFiles[0];
    }
  } catch (error) {
    // 忽略错误，返回 null
  }
  
  return null;
}

// 正则表达式
const SOA_FILE_PATTERN = /.*soa2_\d+_\w+\.txt$/;
const SOA_EXTRACT_PATTERN = /soa2_(\d+)_(\w+)/;
const INDEX_PATTERN = /^\[(\d+)\]\s+(Request|Response)/;

/**
 * 从文件中提取 JSON 数据
 */
function extractJsonFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // 找到第一个空行后的第一个 {
    let jsonStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '' && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.startsWith('{')) {
          jsonStartIndex = i + 1;
          break;
        }
      }
    }

    // 如果没找到空行，直接找第一个 {
    if (jsonStartIndex === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('{')) {
          jsonStartIndex = i;
          break;
        }
      }
    }

    if (jsonStartIndex === -1) {
      console.warn(`警告: 在文件 ${filePath} 中未找到 JSON 数据`);
      return null;
    }

    // 从 jsonStartIndex 开始提取 JSON
    const jsonContent = lines.slice(jsonStartIndex).join('\n').trim();

    // 验证 JSON 格式
    try {
      return JSON.parse(jsonContent);
    } catch (e) {
      console.error(`错误: 文件 ${filePath} 的 JSON 格式无效:`, e.message);
      return null;
    }
  } catch (error) {
    console.error(`错误: 读取文件 ${filePath} 失败:`, error.message);
    return null;
  }
}

/**
 * 从文件名中提取接口信息
 */
function extractInterfaceInfo(filename) {
  const indexMatch = filename.match(INDEX_PATTERN);
  if (!indexMatch) {
    return null;
  }

  const index = parseInt(indexMatch[1], 10);
  const type = indexMatch[2].toLowerCase();

  const soaMatch = filename.match(SOA_EXTRACT_PATTERN);
  if (!soaMatch) {
    return null;
  }

  const interfaceId = soaMatch[1];
  let interfaceName = soaMatch[2];
  
  if (interfaceName.startsWith('json_')) {
    interfaceName = interfaceName.substring(5);
  }

  return { index, type, interfaceId, interfaceName };
}

/**
 * 扫描 Raw 文件夹，提取所有 SOA2 接口文件
 */
function scanRawFolder(rawFolderPath) {
  const files = fs.readdirSync(rawFolderPath);
  const soaFiles = [];

  for (const file of files) {
    if (!SOA_FILE_PATTERN.test(file)) {
      continue;
    }

    const info = extractInterfaceInfo(file);
    if (!info) {
      console.warn(`警告: 无法解析文件 ${file}`);
      continue;
    }

    soaFiles.push({
      index: info.index,
      type: info.type,
      interfaceName: info.interfaceName,
      filePath: path.join(rawFolderPath, file),
    });
  }

  return soaFiles;
}

/**
 * 按接口名和序号分组文件
 */
function groupFilesByInterface(files) {
  const grouped = {};

  for (const file of files) {
    const { interfaceName, index, type, filePath } = file;

    if (!grouped[interfaceName]) {
      grouped[interfaceName] = {};
    }

    if (!grouped[interfaceName][index]) {
      grouped[interfaceName][index] = {};
    }

    grouped[interfaceName][index][type] = filePath;
  }

  return grouped;
}

/**
 * 确保目录存在
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 保存 Mock 数据文件
 */
function saveMockData(interfaceName, baseName, dataPairs) {
  const interfaceDir = path.join(BASE_DATA_DIR, interfaceName);
  ensureDirectoryExists(interfaceDir);

  const requestFiles = [];
  const responseFiles = [];

  dataPairs.sort((a, b) => a.index - b.index);

  for (let i = 0; i < dataPairs.length; i++) {
    const { request, response, index } = dataPairs[i];
    const fileIndex = i + 1;

    const responseFileName = `${baseName}-${fileIndex}.json`;
    const responseFilePath = path.join(interfaceDir, responseFileName);

    if (!fs.existsSync(responseFilePath)) {
      fs.writeFileSync(responseFilePath, JSON.stringify(response, null, 2), 'utf-8');
      console.log(`    保存响应文件: ${responseFileName}`);
    } else {
      console.log(`    跳过已存在的响应文件: ${responseFileName}`);
    }
    responseFiles.push(responseFileName);

    const requestFileName = `${baseName}-${fileIndex}-request.json`;
    const requestFilePath = path.join(interfaceDir, requestFileName);

    if (!fs.existsSync(requestFilePath)) {
      fs.writeFileSync(requestFilePath, JSON.stringify(request, null, 2), 'utf-8');
      console.log(`    保存请求文件: ${requestFileName}`);
    } else {
      console.log(`    跳过已存在的请求文件: ${requestFileName}`);
    }
    requestFiles.push(requestFileName);
  }

  return { requestFiles, responseFiles };
}

/**
 * 查找项目根目录（包含 utils 目录的目录）
 */
function findProjectRoot() {
  // 从当前文件所在目录开始向上查找
  let currentDir = __dirname;
  
  // 当前文件在 src/commands/migrate.js，所以需要向上查找
  while (currentDir !== path.dirname(currentDir)) {
    const utilsPath = path.join(currentDir, 'utils');
    const packagePath = path.join(currentDir, 'package.json');
    
    // 检查是否有 utils 目录或 package.json（jacky-proxy 项目）
    if (fs.existsSync(utilsPath) || fs.existsSync(packagePath)) {
      try {
        if (fs.existsSync(packagePath)) {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
          if (packageJson.name === 'jacky-proxy') {
            return currentDir;
          }
        }
      } catch (e) {
        // 忽略解析错误，继续查找
      }
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  // 如果没找到，返回默认的项目根目录（从 __dirname 向上两级）
  return path.resolve(__dirname, '../..');
}

/**
 * 生成 Mock 文件内容
 */
function generateMockFileContent(interfaceName, requestFiles, responseFiles, targetFolder) {
  // 计算从 Mock 文件到 base-data 的相对路径（在工作目录中）
  const folderParts = targetFolder.split(path.sep).filter(p => p);
  const depth = folderParts.length;
  const baseDataRelativePath = '../'.repeat(depth) + 'base-data';

  // 计算从 Mock 文件到项目根目录的相对路径
  const projectRoot = findProjectRoot();
  const mockFileDir = path.join(WORK_DIR, targetFolder);
  const utilsPath = path.join(projectRoot, 'utils/common');
  
  // 计算相对路径
  let utilsRelativePath = path.relative(mockFileDir, utilsPath);
  
  // 将路径转换为使用 / 分隔符（适用于 import 语句）
  let utilsImportPath = utilsRelativePath.split(path.sep).join('/');
  
  // 如果路径不是以 . 开头，说明路径向上超出了工作目录
  // 在这种情况下，我们需要使用绝对路径
  // 使用环境变量 JACKY_PROXY_ROOT 来动态获取项目根目录
  if (!utilsImportPath.startsWith('.')) {
    // 使用环境变量 + 相对路径的方式
    // 在 server.js 中会设置 JACKY_PROXY_ROOT 环境变量
    utilsImportPath = `\${process.env.JACKY_PROXY_ROOT || '${projectRoot}'}/utils/common`;
  }
  
  const normalizedUtilsPath = utilsImportPath;

  const imports = [];
  for (let i = 0; i < requestFiles.length; i++) {
    const requestFile = requestFiles[i];
    const responseFile = responseFiles[i];
    const num = i + 1;
    imports.push(`import response${num} from '${baseDataRelativePath}/${interfaceName}/${responseFile}';`);
    imports.push(`import request${num} from '${baseDataRelativePath}/${interfaceName}/${requestFile}';`);
  }

  const requestListItems = requestFiles.map((_, i) => `request${i + 1}`).join(', ');
  const responseListItems = responseFiles.map((_, i) => `response${i + 1}`).join(', ');

  return `/**
 * ${interfaceName} 接口 Mock 文件
 * 自动生成于 ${new Date().toISOString()}
 */

// 从 base-data 导入请求和响应数据
${imports.join('\n')}

const requestList = [${requestListItems}];
const responseList = [${responseListItems}];

// 使用动态路径导入，支持跨目录的模块解析
const path = require('path');
const matchResponsePath = process.env.JACKY_PROXY_ROOT 
  ? path.join(process.env.JACKY_PROXY_ROOT, 'utils/common/match-response')
  : path.resolve(__dirname, '${normalizedUtilsPath}/match-response');
const { matchResponse } = require(matchResponsePath);

/**
 * Mock 处理函数
 */
export default async (request: any) => {
  const response = matchResponse(request, requestList, responseList, {
    interfaceName: '${interfaceName}',
    deepIgnore: true
  });

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: response,
  };
};
`;
}

/**
 * 创建 Mock 文件
 */
function createMockFiles(targetFolder, interfaceData) {
  const { interfaceName, requestFiles, responseFiles } = interfaceData;

  const targetDir = path.join(WORK_DIR, targetFolder);
  ensureDirectoryExists(targetDir);

  let mockFileName = `${interfaceName}.mock.ts`;
  let mockFilePath = path.join(targetDir, mockFileName);

  if (fs.existsSync(mockFilePath)) {
    let counter = 2;
    while (fs.existsSync(path.join(targetDir, `${interfaceName}-${counter}.mock.ts`))) {
      counter++;
    }
    mockFileName = `${interfaceName}-${counter}.mock.ts`;
    mockFilePath = path.join(targetDir, mockFileName);
  }

  const mockContent = generateMockFileContent(
    interfaceName,
    requestFiles,
    responseFiles,
    targetFolder
  );

  fs.writeFileSync(mockFilePath, mockContent, 'utf-8');

  console.log(`✓ 创建 Mock 文件: ${mockFileName}`);

  return { mockFilePath };
}

/**
 * 交互式输入函数
 */
function askQuestion(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const prompt = defaultValue
      ? `${question} [默认: ${defaultValue}]: `
      : `${question}: `;

    rl.question(prompt, (answer) => {
      const result = answer.trim() || defaultValue;
      resolve(result);
    });
  });
}

/**
 * 交互式收集参数
 */
async function collectParameters() {
  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write('  数据迁移脚本 - jacky-proxy 版本\n');
  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write('\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('💡 提示：场景名称示例：活动详情页秒杀场景、商品列表页、订单详情页等');
    const scenarioName = await askQuestion(rl, '请输入场景名称', 'mock-case');
    if (!scenarioName) {
      console.error('错误: 场景名称不能为空');
      rl.close();
      process.exit(1);
    }

    const targetFolder = await askQuestion(rl, '请输入目标文件夹路径', 'mocks/test-folder');
    if (!targetFolder) {
      console.error('错误: 目标文件夹路径不能为空');
      rl.close();
      process.exit(1);
    }

    const DEFAULT_RAW_FOLDER = findDefaultRawFolder();
    const defaultFolderDisplay = DEFAULT_RAW_FOLDER || '未找到（需要手动输入）';
    const rawFolderPath = await askQuestion(rl, '请输入 Proxyman 下载后的文件夹路径（包含请求和响应）', defaultFolderDisplay);

    console.log('');

    return { scenarioName, targetFolder, rawFolderPath, rl };
  } catch (error) {
    rl.close();
    throw error;
  }
}

/**
 * 交互式选择要处理的接口
 */
async function selectInterfaces(rl, interfaceNames) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  接口选择');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('找到以下接口：');
  interfaceNames.forEach((name, index) => {
    console.log(`  ${index + 1}. ${name}`);
  });
  console.log('');
  console.log('提示：');
  console.log('  - 直接回车：处理所有接口');
  console.log('  - 输入接口编号（用逗号分隔）：如 1,3,5 表示只处理第1、3、5个接口');
  console.log('  - 输入接口名（用逗号分隔）：如 getProductInfo,saveLogInfo');
  console.log('  - 输入 skip:接口名（用逗号分隔）：如 skip:saveLogInfo 表示排除这些接口');
  console.log('');

  const answer = await askQuestion(rl, '请选择要处理的接口', 'all');
  const trimmedAnswer = answer.trim().toLowerCase();

  if (!trimmedAnswer || trimmedAnswer === 'all') {
    return interfaceNames;
  }

  let selectedInterfaces = [];

  if (trimmedAnswer.startsWith('skip:')) {
    const skipNames = trimmedAnswer.substring(5).split(',').map(s => s.trim());
    selectedInterfaces = interfaceNames.filter(name => !skipNames.includes(name));
    if (selectedInterfaces.length === 0) {
      console.error('错误: 排除所有接口后没有可处理的接口');
      rl.close();
      process.exit(1);
    }
    console.log(`已排除: ${skipNames.join(', ')}`);
    console.log(`将处理: ${selectedInterfaces.join(', ')}`);
  } else if (/^\d+([,\d]+)?$/.test(trimmedAnswer.replace(/\s/g, ''))) {
    const indices = trimmedAnswer.split(',').map(s => parseInt(s.trim(), 10) - 1);
    const invalidIndices = indices.filter(idx => idx < 0 || idx >= interfaceNames.length);
    if (invalidIndices.length > 0) {
      console.error(`错误: 无效的接口编号: ${invalidIndices.map(i => i + 1).join(', ')}`);
      rl.close();
      process.exit(1);
    }
    selectedInterfaces = indices.map(idx => interfaceNames[idx]);
    console.log(`将处理: ${selectedInterfaces.join(', ')}`);
  } else {
    const names = trimmedAnswer.split(',').map(s => s.trim());
    const invalidNames = names.filter(name => !interfaceNames.includes(name));
    if (invalidNames.length > 0) {
      console.error(`错误: 无效的接口名: ${invalidNames.join(', ')}`);
      rl.close();
      process.exit(1);
    }
    selectedInterfaces = names;
    console.log(`将处理: ${selectedInterfaces.join(', ')}`);
  }

  console.log('');
  return selectedInterfaces;
}

/**
 * 初始化 match-rules.json 配置文件（如果不存在）
 * @param {Array<string>} interfaceNames - 接口名称列表
 */
function initMatchRulesConfig(interfaceNames = []) {
  const configDir = path.join(WORK_DIR, 'config');
  const configPath = path.join(configDir, 'match-rules.json');
  
  let config = {
    global: {
      ignoreProps: [
        "clientInfo",
        "enviroment",
        "head",
        "tags",
        "traceId",
        "timestamp",
        "ctime",
        "cid",
        "channelId",
        "clientId"
      ],
      description: "全局忽略属性列表，所有接口都会过滤这些随机参数"
    },
    interfaces: []
  };

  // 如果配置文件已存在，读取现有配置
  if (fs.existsSync(configPath)) {
    try {
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = existingConfig;
    } catch (error) {
      console.warn(`警告: 读取现有配置文件失败，将创建新配置: ${error.message}`);
    }
  }

  // 确保 interfaces 数组存在
  if (!config.interfaces) {
    config.interfaces = [];
  }

  // 为每个接口创建配置项（如果不存在）
  const existingInterfaceNames = new Set(config.interfaces.map(i => i.interfaceName));
  let addedCount = 0;
  
  interfaceNames.forEach(interfaceName => {
    if (!existingInterfaceNames.has(interfaceName)) {
      config.interfaces.push({
        interfaceName: interfaceName,
        ignoreProps: [],
        description: `${interfaceName} 接口的匹配规则，可在 ignoreProps 中添加需要忽略的属性`
      });
      addedCount++;
    }
  });

  // 确保目录存在
  ensureDirectoryExists(configDir);

  // 保存配置文件
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    if (addedCount > 0) {
      console.log(`✓ 已更新匹配规则配置文件: ${configPath}`);
      console.log(`  已添加 ${addedCount} 个接口配置，可在 config/match-rules.json 中配置接口匹配规则`);
    } else if (!fs.existsSync(configPath) || interfaceNames.length === 0) {
      console.log(`✓ 已创建匹配规则配置文件: ${configPath}`);
      console.log(`  提示: 可以在 config/match-rules.json 中配置接口匹配规则`);
    }
  } catch (error) {
    console.warn(`警告: 保存匹配规则配置文件失败: ${error.message}`);
  }
}

/**
 * 更新 proxy.config.json，添加新的场景配置
 */
function updateMockConfig(targetFolder, scenarioName) {
  const configPath = path.join(WORK_DIR, 'proxy.config.json');
  let config = {
    libraryId: 2773,
    folders: {
      list: []
    }
  };

  // 如果配置文件存在，读取现有配置
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configContent);
    } catch (error) {
      console.warn(`警告: 读取配置文件失败，将创建新配置: ${error.message}`);
    }
  }

  // 检查是否已存在相同的路径
  const existingFolder = config.folders.list.find(f => f.path === targetFolder);
  if (existingFolder) {
    console.log(`✓ 配置已存在: ID ${existingFolder.id}, 路径: ${targetFolder}`);
    return existingFolder.id;
  }

  // 计算新的 ID（使用最大 ID + 1）
  const maxId = config.folders.list.length > 0
    ? Math.max(...config.folders.list.map(f => f.id))
    : 0;
  const newId = maxId + 1;

  // 添加新配置
  const folderName = scenarioName || path.basename(targetFolder);
  config.folders.list.push({
    id: newId,
    path: targetFolder,
    name: folderName
  });

  // 保存配置文件
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✓ 已更新 proxy.config.json: 新增场景 ID ${newId} (${targetFolder})`);
    return newId;
  } catch (error) {
    console.error(`错误: 保存配置文件失败: ${error.message}`);
    return null;
  }
}

/**
 * 执行迁移任务
 */
async function executeMigration(scenarioName, targetFolder, rawFolderPath, rl = null, ignoreInterfaces = []) {
  if (!fs.existsSync(rawFolderPath)) {
    console.error(`错误: Raw 文件夹不存在: ${rawFolderPath}`);
    process.exit(1);
  }

  console.log('开始迁移数据...');
  console.log(`场景名称: ${scenarioName}`);
  console.log(`目标文件夹: ${targetFolder}`);
  console.log(`Raw 文件夹: ${rawFolderPath}`);
  if (ignoreInterfaces.length > 0) {
    console.log(`忽略接口: ${ignoreInterfaces.join(', ')}`);
  }
  console.log('');

  console.log('扫描 Raw 文件夹...');
  const files = scanRawFolder(rawFolderPath);
  console.log(`找到 ${files.length} 个 SOA2 接口文件`);

  if (files.length === 0) {
    console.error('错误: 未找到任何 SOA2 接口文件');
    process.exit(1);
  }

  const grouped = groupFilesByInterface(files);
  let allInterfaceNames = Object.keys(grouped);
  
  // 应用 ignore 过滤
  if (ignoreInterfaces.length > 0) {
    allInterfaceNames = allInterfaceNames.filter(name => !ignoreInterfaces.includes(name));
    console.log(`过滤后剩余 ${allInterfaceNames.length} 个接口`);
  }
  
  console.log(`找到 ${allInterfaceNames.length} 个不同的接口: ${allInterfaceNames.join(', ')}`);

  let interfaceNames = allInterfaceNames;
  if (rl) {
    interfaceNames = await selectInterfaces(rl, allInterfaceNames);
    if (interfaceNames.length === 0) {
      console.error('错误: 没有选择任何接口');
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('');
  }

  let sharedBaseName = scenarioName;
  if (interfaceNames.length > 0) {
    const firstInterfaceDir = path.join(BASE_DATA_DIR, interfaceNames[0]);
    if (fs.existsSync(firstInterfaceDir)) {
      const testFileName = path.join(firstInterfaceDir, `${scenarioName}-1.json`);
      if (fs.existsSync(testFileName)) {
        let counter = 1;
        while (fs.existsSync(path.join(firstInterfaceDir, `${scenarioName}-${counter + 1}-1.json`))) {
          counter++;
        }
        sharedBaseName = `${scenarioName}-${counter + 1}`;
      }
    }
  }

  for (const interfaceName of interfaceNames) {
    console.log(`处理接口: ${interfaceName}`);

    const interfaceFiles = grouped[interfaceName];
    const indices = Object.keys(interfaceFiles).map(Number).sort((a, b) => a - b);

    const dataPairs = [];

    for (const index of indices) {
      const filePair = interfaceFiles[index];

      if (!filePair.request || !filePair.response) {
        console.warn(`警告: 序号 ${index} 的请求/响应文件不完整，跳过`);
        continue;
      }

      const requestData = extractJsonFromFile(filePair.request);
      const responseData = extractJsonFromFile(filePair.response);

      if (!requestData || !responseData) {
        console.warn(`警告: 序号 ${index} 的数据提取失败，跳过`);
        continue;
      }

      dataPairs.push({ request: requestData, response: responseData, index });
    }

    if (dataPairs.length === 0) {
      console.warn(`警告: 接口 ${interfaceName} 没有有效的数据对，跳过`);
      continue;
    }

    console.log(`  找到 ${dataPairs.length} 组有效数据`);

    const { requestFiles, responseFiles } = saveMockData(
      interfaceName,
      sharedBaseName,
      dataPairs
    );

    console.log(`  保存了 ${requestFiles.length} 个请求文件和 ${responseFiles.length} 个响应文件`);

    createMockFiles(targetFolder, {
      interfaceName,
      requestFiles,
      responseFiles,
    });

    console.log('');
  }

  // 收集所有处理的接口名称（在处理完所有接口后）
  const processedInterfaceNames = interfaceNames;
  
  // 初始化 match-rules.json（如果不存在），并添加接口配置
  console.log('');
  console.log('初始化配置文件...');
  initMatchRulesConfig(processedInterfaceNames);
  
  // 更新 proxy.config.json
  const scenarioId = updateMockConfig(targetFolder, scenarioName);

  console.log('');
  console.log('迁移完成！');
  console.log('');
  console.log('提示：');
  console.log('1. Mock 数据已保存到 base-data/ 目录');
  console.log('2. Mock 文件已创建在 ' + targetFolder + ' 目录');
  if (scenarioId) {
    console.log(`3. 已自动添加到 proxy.config.json，场景 ID: ${scenarioId}`);
    console.log(`4. 可以使用以下命令启动: jacky-proxy start ${scenarioId}`);
  } else {
    console.log('3. 在 proxy.config.json 中添加接口集配置后即可使用');
  }
  console.log('5. 可以在 config/match-rules.json 中配置接口匹配规则');
  
  return scenarioId;
}

/**
 * migrate 命令主函数
 */
async function migrateCommand(options) {
  const DEFAULT_RAW_FOLDER = findDefaultRawFolder();

  let scenarioName, targetFolder, rawFolderPath, rl = null;
  
  // 解析 ignore 参数
  const ignoreInterfaces = options.ignore
    ? options.ignore.split(',').map(s => s.trim()).filter(s => s)
    : [];

  // 判断是否进入交互式模式
  // 如果 interactive 为 true（默认），且用户没有提供任何参数，则进入交互式模式
  const hasProvidedParams = !!(options.scenario || options.target || options.raw);
  const shouldUseInteractive = options.interactive !== false && !hasProvidedParams;

  if (shouldUseInteractive) {
    // 完全交互式模式
    const params = await collectParameters();
    scenarioName = params.scenarioName;
    targetFolder = params.targetFolder;
    rawFolderPath = params.rawFolderPath;
    rl = params.rl;
  } else {
    // 命令行参数模式
    scenarioName = options.scenario || 'mock-case';
    targetFolder = options.target || 'mocks/test-folder';
    rawFolderPath = options.raw || DEFAULT_RAW_FOLDER;

    if (!rawFolderPath) {
      console.error('错误: 未找到 Raw 文件夹，请使用 --raw 参数指定');
      process.exit(1);
    }
  }

  await executeMigration(scenarioName, targetFolder, rawFolderPath, rl, ignoreInterfaces);
  
  if (rl) {
    rl.close();
  }
}

module.exports = migrateCommand;

