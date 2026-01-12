/**
 * 服务启动入口
 * 优化点：
 * 1. 移除重复的 app.listen 调用，避免端口冲突
 * 2. 修复变量作用域问题，统一日志输出
 * 3. 完善服务器启动错误捕获（如端口被占用）
 * 4. 增强进程退出信号监听（SIGINT/SIGTERM/SIGQUIT）
 * 5. 捕获数据库连接关闭的错误，避免未处理Promise拒绝
 * 6. 统一错误输出（优先日志，日志未初始化则用console）
 * 7. 标记服务器实例，避免重复启动
 */
const app = require('./app');
const { initLogger, getLogger } = require('./config/logger');
const { initDB, getSequelize } = require('./config/db');
require('dotenv').config();

// 核心配置
const PORT = process.env.PORT || 3000;
let serverInstance = null; // 标记服务器实例，避免重复启动
let logger = null; // 全局logger变量

/**
 * 优雅关闭服务（统一处理进程退出）
 */
async function gracefulShutdown(signal) {
  logger?.info(`[进程退出] 接收到 ${signal} 信号，开始优雅关闭服务...`);

  try {
    // 1. 关闭HTTP服务器，停止接收新请求
    if (serverInstance) {
      await new Promise((resolve, reject) => {
        serverInstance.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger?.info('[HTTP服务器] 已关闭，停止接收新请求');
    }

    // 2. 关闭数据库连接
    const sequelize = getSequelize();
    if (sequelize) {
      await sequelize.close();
      logger?.info('[数据库] 连接已关闭');
    }

    logger?.info('[服务关闭] 所有资源释放完成，进程退出');
    process.exit(0);
  } catch (error) {
    logger?.error(`[优雅关闭失败] ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
}

/**
 * 异步启动服务（保证顺序：日志 → 数据库 → HTTP服务）
 */
async function startServer() {
  try {
    // 1. 初始化日志（第一步，确保后续所有操作有日志）
    // 第一步：强制初始化Logger（确保后续模块使用的是完整实例）
    const loggerModule = require('./config/logger');
    await loggerModule.initLogger(); // 主动调用初始化
    const logger = loggerModule.getLogger(); // 此时已初始化完成

    // 2. 初始化数据库
    logger.info('[服务启动] 初始化数据库连接...');
    await initDB();
    const sequelize = getSequelize();
    logger.info('[服务启动] 数据库初始化成功');
    
    //  3. 初始化邮件服务
    await require('./config/mail').initMailTransporter();



    // 4. 启动HTTP服务器（仅启动一次）
    logger.info(`[服务启动] 启动HTTP服务器，监听端口 ${PORT}...`);
    serverInstance = app.listen(PORT, () => {
      logger.info(`服务器启动成功 🚀，访问地址：http://localhost:${PORT}`);
      logger.info(`Swagger文档地址：http://localhost:${PORT}/api-docs`);
    });

    // 捕获服务器启动错误（如端口被占用、权限不足）
    serverInstance.on('error', (error) => {
      logger.error(`[HTTP服务器启动失败] ${error.message}`, { stack: error.stack });
      // 端口被占用的特殊处理
      if (error.code === 'EADDRINUSE') {
        logger.error(`端口 ${PORT} 已被占用，请更换端口后重试`);
      }
      process.exit(1);
    });

    // 5. 监听进程退出信号（覆盖常见退出场景）
    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
      process.on(signal, () => gracefulShutdown(signal));
    });

    // 6. 兜底捕获未处理异常（最后一道防线）
    process.on('uncaughtException', (error) => {
      logger?.error(`[未捕获异常] ${error.message}`, { stack: error.stack });
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger?.error(`[未处理Promise拒绝] ${reason?.message || reason}`, {
        promise: promise,
        stack: reason?.stack
      });
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    // 统一错误输出：优先用日志，日志未初始化则用console
    const errorMsg = `[服务启动失败] ${error.message}`;
    if (logger) {
      logger.error(errorMsg, { stack: error.stack });
    } else {
      console.error(errorMsg, error.stack);
    }
    process.exit(1);
  }
}

// 启动服务（仅执行一次）
startServer();
