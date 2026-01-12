/**
 * 邮件服务配置（基于nodemailer）
 * 核心优化点：
 * 1. 配置校验+默认值，自动适配secure（465=true/587=false）
 * 2. 集成Winston日志，统一日志体系，脱敏敏感信息（账号/密码）
 * 3. 封装通用发送邮件方法，降低调用成本，返回结构化结果
 * 4. 发送失败自动重试，配置最大重试次数（容错性提升）
 * 5. 单例模式，防止重复创建传输器
 * 6. 环境差异化配置（开发环境可模拟发送，避免真实发件）
 * 7. 异步初始化，适配服务启动顺序（日志→邮件服务）
 * 8. 健壮的错误处理，生产环境连接失败触发进程告警
 * 9. 支持邮件模板、附件、抄送/密送等通用场景
 */
const nodemailer = require('nodemailer');
const { getLogger } = require('./logger');
const process = require('process');
require('dotenv').config();

// ===================== 1. 基础配置与校验 =====================
// 默认配置（兜底+规范）
const DEFAULT_MAIL_CONFIG = {
  HOST: 'smtp.163.com',       // 默认SMTP服务器
  PORT: 587,                  // 默认端口（587=非SSL/465=SSL）
  SECURE: false,              // 自动适配，无需手动配置
  USER: '',                   // 邮箱账号（必填）
  PASS: '',                   // 邮箱授权码（必填）
  FROM: 'cfc-app <noreply@cfc-app.com>', // 发件人默认格式
  MAX_RETRY: 3,               // 最大重试次数
  RETRY_INTERVAL: 2000,       // 重试间隔（2秒）
  // 环境差异化：开发环境是否真实发送邮件（false=模拟发送）
  REAL_SEND: process.env.NODE_ENV === 'production'
};

// 合并环境变量与默认配置，做类型/合法性校验
const mailConfig = {
  host: process.env.EMAIL_HOST || DEFAULT_MAIL_CONFIG.HOST,
  port: parseInt(process.env.EMAIL_PORT || DEFAULT_MAIL_CONFIG.PORT, 10),
  user: process.env.EMAIL_USER || DEFAULT_MAIL_CONFIG.USER,
  pass: process.env.EMAIL_PASS || DEFAULT_MAIL_CONFIG.PASS,
  from: process.env.EMAIL_FROM || DEFAULT_MAIL_CONFIG.FROM,
  maxRetry: parseInt(process.env.MAIL_MAX_RETRY || DEFAULT_MAIL_CONFIG.MAX_RETRY, 10),
  retryInterval: parseInt(process.env.MAIL_RETRY_INTERVAL || DEFAULT_MAIL_CONFIG.RETRY_INTERVAL, 10),
  realSend: process.env.MAIL_REAL_SEND === 'true' || DEFAULT_MAIL_CONFIG.REAL_SEND
};

// 配置校验函数
const validateMailConfig = () => {
  const logger = getLogger();
  const errors = [];

  // 1. 校验必填项
  if (!mailConfig.user) errors.push('MAIL_USER（邮箱账号）未配置');
  if (!mailConfig.pass) errors.push('MAIL_PASS（邮箱授权码）未配置');

  // 2. 校验端口合法性
  if (isNaN(mailConfig.port) || mailConfig.port < 1 || mailConfig.port > 65535) {
    logger.warn(`[邮件配置] 端口 ${mailConfig.port} 不合法，自动使用默认端口 587`);
    mailConfig.port = 587;
  }

  // 3. 自动适配secure（465=SSL/587=STARTTLS）
  mailConfig.secure = mailConfig.port === 465;
  logger.info(`[邮件配置] 自动适配secure: ${mailConfig.secure}（端口：${mailConfig.port}）`);

  // 4. 校验重试配置
  if (mailConfig.maxRetry < 1) mailConfig.maxRetry = 1;
  if (mailConfig.retryInterval < 1000) mailConfig.retryInterval = 1000;

  // 5. 校验失败：生产环境终止进程，开发环境仅告警
  if (errors.length > 0) {
    const errorMsg = `[邮件配置错误] ${errors.join('；')}`;
    logger.error(errorMsg);
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('[生产环境] 邮件核心配置缺失，进程终止');
      process.exit(1);
    }
  }

  // 配置脱敏（日志中隐藏敏感信息）
  const desensitizeUser = mailConfig.user.replace(/(.{2}).+(.{2})@/, '$1****$2@');
  logger.info(`[邮件配置] 初始化完成 | 邮箱：${desensitizeUser} | 服务器：${mailConfig.host}:${mailConfig.port}`);
};

// ===================== 2. 单例模式 + 异步初始化 =====================
let transporterInstance = null;
let isInitialized = false;

/**
 * 异步初始化邮件传输器
 * @returns {Promise<nodemailer.Transporter>} 传输器实例
 */
const initMailTransporter = async () => {
  if (transporterInstance && isInitialized) return transporterInstance;

  const logger = getLogger();
  try {
    // 1. 配置校验
    validateMailConfig();

    // 2. 创建传输器（支持更多通用配置）
    transporterInstance = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: {
        user: mailConfig.user,
        pass: mailConfig.pass
      },
      // 连接超时配置
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      // 生产环境启用连接池
      pool: process.env.NODE_ENV === 'production',
      maxConnections: 5 // 连接池最大连接数
    });

    // 3. 测试连接
    await transporterInstance.verify();
    logger.info('[邮件服务] 连接成功 ✅');
    isInitialized = true;
    return transporterInstance;
  } catch (error) {
    const errorMsg = `[邮件服务连接失败] ❌ ${error.message}`;
    logger.error(errorMsg, { stack: error.stack });
    
    // 生产环境邮件服务失败：终止进程（核心服务依赖）
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('[生产环境] 邮件服务连接失败，进程终止');
      process.exit(1);
    }
    throw new Error(errorMsg);
  }
};

// ===================== 3. 通用邮件发送方法（带重试） =====================
/**
 * 发送邮件（通用方法，带自动重试）
 * @param {Object} mailOptions - 邮件配置
 * @param {string|string[]} mailOptions.to - 收件人（支持数组）
 * @param {string} mailOptions.subject - 邮件标题
 * @param {string} [mailOptions.html] - 邮件正文（HTML）
 * @param {string} [mailOptions.text] - 邮件正文（纯文本）
 * @param {string} [mailOptions.from] - 发件人（覆盖默认）
 * @param {string[]} [mailOptions.cc] - 抄送
 * @param {string[]} [mailOptions.bcc] - 密送
 * @param {Object[]} [mailOptions.attachments] - 附件
 * @returns {Object} 发送结果
 *   - success: boolean - 是否成功
 *   - messageId: string - 邮件ID（成功时）
 *   - error: Object - 错误信息（失败时）
 *     - type: string - 错误类型
 *     - message: string - 错误描述
 *     - retryCount: number - 重试次数
 */
const sendMail = async (mailOptions, retryCount = 0) => {
  const logger = getLogger();
  const currentRetry = retryCount || 0;

  // 1. 基础校验
  if (!mailOptions.to || !mailOptions.subject) {
    const errorMsg = '发送邮件失败：收件人/标题不能为空';
    logger.warn(errorMsg);
    return {
      success: false,
      error: {
        type: 'invalid_params',
        message: errorMsg,
        retryCount: currentRetry
      }
    };
  }

  // 2. 开发环境：模拟发送（避免真实发件）
  if (!mailConfig.realSend) {
    const mockMsgId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    logger.info(`[邮件模拟发送] 收件人：${mailOptions.to} | 标题：${mailOptions.subject} | 模拟ID：${mockMsgId}`);
    return {
      success: true,
      messageId: mockMsgId,
      retryCount: currentRetry
    };
  }

  try {
    // 3. 确保传输器已初始化
    const transporter = await initMailTransporter();

    // 4. 合并默认配置
    const finalOptions = {
      from: mailOptions.from || mailConfig.from,
      ...mailOptions
    };

    // 5. 发送邮件
    const result = await transporter.sendMail(finalOptions);
    logger.info(`[邮件发送成功] 收件人：${finalOptions.to} | 标题：${finalOptions.subject} | 邮件ID：${result.messageId}`);
    return {
      success: true,
      messageId: result.messageId,
      retryCount: currentRetry
    };
  } catch (error) {
    // 6. 重试逻辑（未达最大次数则重试）
    if (currentRetry < mailConfig.maxRetry) {
      const nextRetry = currentRetry + 1;
      logger.warn(`[邮件发送失败] 第${currentRetry+1}次 | 收件人：${mailOptions.to} | 原因：${error.message} | 将在${mailConfig.retryInterval/1000}秒后重试`);
      
      // 延迟重试
      await new Promise(resolve => setTimeout(resolve, mailConfig.retryInterval));
      return sendMail(mailOptions, nextRetry);
    }

    // 7. 重试耗尽：返回失败结果
    const errorMsg = `[邮件发送失败] 重试${mailConfig.maxRetry}次后仍失败 | 收件人：${mailOptions.to} | 原因：${error.message}`;
    logger.error(errorMsg, { stack: error.stack });
    return {
      success: false,
      error: {
        type: 'send_failed',
        message: errorMsg,
        retryCount: currentRetry
      }
    };
  }
};

// ===================== 4. 导出API（适配不同使用场景） =====================
module.exports = {
  // 异步初始化（服务启动时调用）
  initMailTransporter,
  // 通用发送方法（推荐调用）
  sendMail,
  // 导出原始传输器（特殊场景使用）
  getTransporter: async () => initMailTransporter(),
  // 配置信息（只读，脱敏）
  getMailConfig: () => ({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    user: mailConfig.user.replace(/(.{2}).+(.{2})@/, '$1****$2@'), // 脱敏
    realSend: mailConfig.realSend
  })
};
