/**
 * 日志配置模块（基于Winston）
 * 优化点：
 * 1. 异步创建日志目录（避免同步阻塞，添加错误处理）
 * 2. 区分开发/生产环境配置（开发控制台友好、生产JSON格式+按日期轮转）
 * 3. 丰富日志维度（进程ID、请求ID、日志级别、模块名）
 * 4. 日志文件按日期+大小轮转（解决单一文件过大问题）
 * 5. 敏感信息过滤（自动屏蔽密码、token等敏感字段）
 * 6. 配置参数校验+默认值（避免环境变量缺失导致崩溃）
 * 7. 捕获未处理异常/拒绝，统一记录到日志
 * 8. 模块化配置（拆分格式/传输器，提升可维护性）
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file'); // 需安装：npm i winston-daily-rotate-file
const path = require('path');
const fs = require('fs').promises; // 使用异步fs
const process = require('process');
require('dotenv').config();

// ===================== 1. 基础配置与参数校验 =====================
const DEFAULT_CONFIG = {
  LOG_LEVEL: 'info',
  LOG_DIR: path.join(process.cwd(), 'logs'), // 默认日志目录：项目根目录/logs
  LOG_MAX_SIZE: '5m', // 单文件最大5MB（支持单位：k/m/g）
  LOG_MAX_FILES: '7d', // 保留7天日志
  LOG_DATE_PATTERN: 'YYYY-MM-DD', // 日志文件日期格式
  LOG_FILE_PERMISSIONS: '0644', // 日志文件权限
  SENSITIVE_FIELDS: ['password', 'token', 'secret', 'key', 'authorization'] // 敏感字段列表
};

// 合并环境变量与默认配置，做类型校验
const logConfig = {
  level: process.env.LOG_LEVEL?.toLowerCase() || DEFAULT_CONFIG.LOG_LEVEL,
  dir: process.env.LOG_DIR || DEFAULT_CONFIG.LOG_DIR,
  maxSize: process.env.LOG_MAX_SIZE || DEFAULT_CONFIG.LOG_MAX_SIZE,
  maxFiles: process.env.LOG_MAX_FILES || DEFAULT_CONFIG.LOG_MAX_FILES,
  datePattern: process.env.LOG_DATE_PATTERN || DEFAULT_CONFIG.LOG_DATE_PATTERN,
  filePermissions: process.env.LOG_FILE_PERMISSIONS || DEFAULT_CONFIG.LOG_FILE_PERMISSIONS,
  sensitiveFields: DEFAULT_CONFIG.SENSITIVE_FIELDS
};

// 校验日志级别合法性
const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
if (!validLevels.includes(logConfig.level)) {
  console.error(`[日志配置警告] LOG_LEVEL=${logConfig.level} 不合法，自动使用默认值: ${DEFAULT_CONFIG.LOG_LEVEL}`);
  logConfig.level = DEFAULT_CONFIG.LOG_LEVEL;
}

// ===================== 2. 工具函数 =====================
/**
 * 异步创建日志目录（避免同步阻塞，添加错误处理）
 */
const createLogDir = async () => {
  try {
    await fs.access(logConfig.dir);
  } catch (err) {
    // 目录不存在则创建（递归创建多级目录）
    await fs.mkdir(logConfig.dir, { recursive: true, mode: 0o755 });
    console.log(`[日志配置] 日志目录创建成功: ${logConfig.dir}`);
  }
};

/**
 * 敏感信息过滤（递归替换对象/字符串中的敏感字段）
 * @param {any} data - 待过滤的数据（字符串/对象/数组）
 * @returns {any} 过滤后的数据
 */
const filterSensitiveData = (data) => {
  if (typeof data === 'string') {
    try {
      // 尝试解析为JSON，再过滤
      const parsed = JSON.parse(data);
      return JSON.stringify(filterSensitiveData(parsed));
    } catch (e) {
      // 非JSON字符串，直接替换敏感字段值
      let filtered = data;
      logConfig.sensitiveFields.forEach(field => {
        const regex = new RegExp(`${field}[\\s]*[:=][\\s]*['"]?([^'"\s,]+)['"]?`, 'gi');
        filtered = filtered.replace(regex, `${field}="***"`);
      });
      return filtered;
    }
  }

  if (typeof data === 'object' && data !== null) {
    // 递归处理对象/数组
    return Array.isArray(data)
      ? data.map(item => filterSensitiveData(item))
      : Object.keys(data).reduce((acc, key) => {
          const lowerKey = key.toLowerCase();
          acc[key] = logConfig.sensitiveFields.some(field => lowerKey.includes(field))
            ? '***'
            : filterSensitiveData(data[key]);
          return acc;
        }, {});
  }

  return data;
};

// ===================== 3. 日志格式配置 =====================
/**
 * 开发环境格式（控制台友好：带颜色、简洁）
 */
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), // 精确到毫秒
  winston.format.errors({ stack: true }), // 显示错误栈
  winston.format.metadata({ fillExcept: ['timestamp', 'level', 'message'] }), // 元数据分离
  winston.format.printf(({ timestamp, level, message, metadata, stack }) => {
    // 过滤敏感信息
    const filteredMsg = filterSensitiveData(message);
    const filteredMeta = filterSensitiveData(metadata);
    
    let logStr = `[${timestamp}] [${level.toUpperCase()}] [PID:${process.pid}] ${filteredMsg}`;
    // 有错误栈则追加
    if (stack) logStr += `\n${stack}`;
    // 有元数据则追加
    if (Object.keys(filteredMeta).length > 0) {
      logStr += ` | Meta: ${JSON.stringify(filteredMeta)}`;
    }
    return logStr;
  }),
  winston.format.colorize({ all: true }) // 全字段着色
);

/**
 * 生产环境格式（JSON格式：便于日志收集工具解析）
 */
const prodFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata(),
  // 过滤敏感信息
  winston.format((info) => {
    info.message = filterSensitiveData(info.message);
    info.metadata = filterSensitiveData(info.metadata);
    return info;
  })(),
  winston.format.json() // JSON格式输出
);

// 根据环境选择格式
const getLogFormat = () => {
  return process.env.NODE_ENV === 'production' ? prodFormat : devFormat;
};

// ===================== 4. 日志传输器配置 =====================
/**
 * 获取控制台传输器（开发环境启用，生产环境可选）
 */
const getConsoleTransport = () => {
  return new winston.transports.Console({
    level: logConfig.level,
    format: getLogFormat(),
    silent: process.env.NODE_ENV === 'production' // 生产环境关闭控制台输出
  });
};

/**
 * 获取按日期轮转的文件传输器
 * @param {string} level - 日志级别
 * @param {string} filename - 文件名前缀
 * @returns {DailyRotateFile}
 */
const getRotateFileTransport = (level, filename) => {
  return new DailyRotateFile({
    level: level,
    filename: path.join(logConfig.dir, `${filename}-%DATE%.log`), // 文件名示例：error-2026-01-08.log
    datePattern: logConfig.datePattern,
    maxSize: logConfig.maxSize,
    maxFiles: logConfig.maxFiles,
    permissions: logConfig.filePermissions,
    format: prodFormat, // 文件日志统一用JSON格式（便于解析）
    handleExceptions: true, // 捕获未处理异常
    handleRejections: true // 捕获未处理Promise拒绝
  });
};

// ===================== 5. 创建Logger实例 =====================
let loggerInstance;
// 降级日志（当Winston初始化失败时使用）
const fallbackLogger = {
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
  info: (msg, meta) => console.info(`[INFO] ${msg}`, meta || ''),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta || ''),
  http: (msg, meta) => console.log(`[HTTP] ${msg}`, meta || ''),
  verbose: (msg, meta) => console.log(`[VERBOSE] ${msg}`, meta || ''),
  silly: (msg, meta) => console.log(`[SILLY] ${msg}`, meta || '')
};

const createLogger = async () => {
  // 先创建日志目录
  await createLogDir();

  // 初始化传输器
  const transports = [
    getConsoleTransport(),
    getRotateFileTransport('error', 'error'), // 错误日志单独存储
    getRotateFileTransport('info', 'combined') // 所有日志（info及以上）
  ];

  // 创建logger
  const logger = winston.createLogger({
    level: logConfig.level,
    levels: winston.config.npm.levels, // 使用npm标准日志级别
    format: getLogFormat(),
    transports: transports,
    exitOnError: false // 捕获异常后不退出进程
  });

  // 捕获全局未处理异常/拒绝，记录到日志
  process.on('uncaughtException', (err) => {
    logger.error('未捕获的异常', { error: err.stack });
    // 生产环境建议：记录日志后退出进程（避免僵尸进程）
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => process.exit(1), 1000);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝', {
      promise: promise,
      reason: reason?.stack || reason
    });
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => process.exit(1), 1000);
    }
  });

  console.log(`[日志配置] Logger初始化成功 | 级别: ${logConfig.level} | 目录: ${logConfig.dir}`);
  return logger;
};

// ===================== 6. 导出实例（单例模式） =====================
// 自动初始化logger（异步，不阻塞主线程）
createLogger().then(logger => {
  loggerInstance = logger;
}).catch(() => {
  loggerInstance = fallbackLogger;
});

// 导出初始化函数和获取实例的方法
module.exports = {

 // 同步获取logger实例（核心：适配现有代码直接调用 logger.error）
  ...fallbackLogger, // 先挂载降级方法，避免初始化完成前调用报错
  get logger() { // 自定义getter，优先返回初始化后的实例
    return loggerInstance || fallbackLogger;
  },

  // 初始化logger（需在项目启动时调用）
  initLogger: async () => {
    if (!loggerInstance) {
      loggerInstance = await createLogger();
    }
    return loggerInstance;
  },
  // 获取logger实例（确保已初始化）
  getLogger: () => {
    if (!loggerInstance) {
      console.warn('⚠️ Logger尚未初始化，临时使用降级日志（建议启动时先调用initLogger()）');
      return fallbackLogger; // 核心：返回降级日志，不抛错
    }
    return loggerInstance;
  },
  // 导出配置（便于外部扩展）
  logConfig,
    // 兼容默认导出
  default: loggerInstance || fallbackLogger
};
