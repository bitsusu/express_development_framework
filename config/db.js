/**
 * 数据库连接配置（Sequelize v6 终极极简版）
 * 核心：仅保留连接+单例+基础重试，移除所有事件监听/钩子，确保v6兼容
 */
const { Sequelize } = require('sequelize');
const process = require('process');
require('dotenv').config();

// ===================== 1. 极简Logger（仅依赖console，避免日志模块问题） =====================
const logger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  fatal: console.error
};

// ===================== 2. 基础配置 =====================
const env = process.env.NODE_ENV || 'development';
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || 3306, 10),
  database: process.env.DB_NAME || 'cfc_app',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  timezone: '+08:00'
};

// ===================== 3. 单例模式（核心） =====================
let sequelizeInstance = null;

/**
 * 创建纯基础的Sequelize实例（无任何钩子/事件）
 */
const createSequelizeInstance = () => {
  if (sequelizeInstance) return sequelizeInstance;

  // 仅保留必选配置，所有可选配置全部移除
  const sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.user,
    dbConfig.password,
    {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: 'mysql',
      // 仅保留基础方言配置，避免兼容问题
      dialectOptions: {
        timezone: dbConfig.timezone,
        connectTimeout: 10000
      },
      timezone: dbConfig.timezone,
      // 开发环境打印SQL，生产环境关闭
      logging: env === 'development' ? (sql, timing) => logger.debug(`[SQL] 耗时${timing}ms: ${sql}`) : false,
      // 极简连接池（仅基础参数，无钩子）
      pool: {
        max: env === 'development' ? 10 : 20,
        min: env === 'development' ? 2 : 5,
        idle: 30000,
        acquire: 60000
      },
      // 基础Model配置（仅必要项）
      define: {
        timestamps: true,
        createdAt: 'create_time',
        updatedAt: 'update_time',
        underscored: true,
        freezeTableName: true
      }
    }
  );

  sequelizeInstance = sequelize;
  return sequelizeInstance;
};

/**
 * 测试连接（带基础重试，无事件监听）
 */
const testConnection = async (sequelize, attempts = 0) => {
  const MAX_ATTEMPTS = 5;
  const RETRY_INTERVAL = 3000;

  try {
    await sequelize.authenticate();
    logger.info('[数据库] 连接成功 ✅');
    return sequelize;
  } catch (error) {
    if (attempts >= MAX_ATTEMPTS) {
      logger.fatal(`[数据库] 连接失败（已重试${MAX_ATTEMPTS}次）：${error.message}`);
      process.exit(1);
    }

    logger.warn(`[数据库] 连接失败（第${attempts+1}次）：${error.message}，${RETRY_INTERVAL/1000}秒后重试`);
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    return testConnection(sequelize, attempts + 1);
  }
};

// ===================== 4. 初始化 =====================
const initDB = async () => {
  try {
    logger.info('[数据库] 开始初始化', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: '*'.repeat(dbConfig.user.length)
    });

    const sequelize = createSequelizeInstance();
    // 测试连接（核心）
    await testConnection(sequelize);
    // 同步模型（仅创建不存在的表，禁用force/alter）
    await sequelize.sync({ force: false, alter: false });
    logger.info('[数据库] 模型同步完成');

    return sequelize;
  } catch (error) {
    logger.fatal('[数据库] 初始化失败 ❌', error.message);
    process.exit(1);
  }
};

// ===================== 5. 导出（适配models/index.js） =====================
// 自动初始化（异步）
let initializedSequelize = null;
initDB().then(instance => {
  initializedSequelize = instance;
}).catch(err => logger.error('[数据库] 自动初始化失败', err.message));

module.exports = {
  // 核心：导出实例（适配解构）
  get sequelize() {
    if (!initializedSequelize) {
      logger.warn('[数据库] 实例尚未初始化，返回基础实例');
      return createSequelizeInstance();
    }
    return initializedSequelize;
  },
  Sequelize,
  initDB,
  getSequelize: () => {
    if (!sequelizeInstance) throw new Error('请先调用 initDB() 初始化数据库');
    return sequelizeInstance;
  }
};
