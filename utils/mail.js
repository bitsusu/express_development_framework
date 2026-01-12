/**
 * 邮件发送工具层（适配新版 config/mail.js）
 * 核心优化点：
 * 1. 复用 config/mail.js 封装的 sendMail 方法，继承重试、模拟发送、配置校验等核心能力
 * 2. 扩展入参支持，兼容 text/cc/bcc/附件/自定义发件人等通用场景
 * 3. 完善入参校验，提前拦截无效参数，降低底层错误率
 * 4. 增强日志维度，补充收件人、标题、重试次数等关键信息，便于排查
 * 5. 结构化返回结果，与底层配置层保持一致，降低业务层适配成本
 * 6. 简化逻辑，避免重复封装，统一邮件发送入口
 * 7. 保留错误类型和重试信息，便于业务层精准处理失败场景
 */
const { sendMail: coreSendMail, getMailConfig } = require('../config/mail');
const { getLogger } = require('../config/logger');
require('dotenv').config();

// 全局 logger 实例（确保已初始化）
const logger = getLogger();

/**
 * 通用邮件发送方法（适配新版核心层，扩展通用场景）
 * @param {Object} options - 邮件配置项（兼容所有 nodemailer 标准配置）
 * @param {string|string[]} options.to - 收件人（必填，支持数组）
 * @param {string} options.subject - 邮件标题（必填）
 * @param {string} [options.html] - HTML 正文（与 text 二选一）
 * @param {string} [options.text] - 纯文本正文（与 html 二选一）
 * @param {string} [options.from] - 自定义发件人（覆盖 config 中的默认值）
 * @param {string[]} [options.cc] - 抄送列表
 * @param {string[]} [options.bcc] - 密送列表
 * @param {Object[]} [options.attachments] - 附件列表（格式参考 nodemailer）
 * @returns {Object} 结构化发送结果
 *   - success: boolean - 是否发送成功
 *   - messageId: string - 邮件 ID（成功时返回，模拟发送为 MOCK 前缀）
 *   - retryCount: number - 实际重试次数
 *   - error: Object - 错误信息（失败时返回）
 *     - type: string - 错误类型（invalid_params/send_failed 等）
 *     - message: string - 错误描述
 * @throws {Error} 仅在核心层抛出致命错误时（如配置完全失效）抛错，非业务失败不抛错
 */
async function sendMail(options) {
  try {
    // ========== 1. 入参校验（提前拦截无效参数） ==========
    const validateErrors = [];
    if (!options.to) validateErrors.push('收件人（to）不能为空');
    if (!options.subject) validateErrors.push('邮件标题（subject）不能为空');
    if (!options.html && !options.text) validateErrors.push('HTML正文（html）或纯文本正文（text）至少填一项');

    if (validateErrors.length > 0) {
      const errorMsg = `邮件发送参数校验失败：${validateErrors.join('；')}`;
      logger.warn(errorMsg, { receiver: options.to, subject: options.subject });
      return {
        success: false,
        retryCount: 0,
        error: {
          type: 'invalid_params',
          message: errorMsg
        }
      };
    }

    // ========== 2. 调用核心层发送方法（继承所有核心能力） ==========
    const result = await coreSendMail(options);

    // ========== 3. 增强日志输出（补充关键维度） ==========
    if (result.success) {
      logger.info(
        `[邮件工具层] 发送成功 | 收件人：${options.to} | 标题：${options.subject} | 邮件ID：${result.messageId} | 重试次数：${result.retryCount}`,
        { isRealSend: getMailConfig().realSend }
      );
    } else {
      logger.error(
        `[邮件工具层] 发送失败 | 收件人：${options.to} | 标题：${options.subject} | 错误类型：${result.error.type} | 重试次数：${result.error.retryCount} | 原因：${result.error.message}`
      );
    }

    // ========== 4. 返回结构化结果（与核心层一致） ==========
    return result;

  } catch (fatalError) {
    // 捕获核心层致命错误（如配置完全失效）
    const errorMsg = `[邮件工具层] 致命错误：${fatalError.message}`;
    logger.fatal(errorMsg, { stack: fatalError.stack });
    // 仅致命错误抛错，业务失败（如发送重试耗尽）返回结构化结果，由业务层决定是否抛错
    throw new Error(errorMsg);
  }
}

/**
 * 快捷发送验证码邮件（业务封装示例，可根据实际需求扩展）
 * @param {string} to - 收件人邮箱
 * @param {string} code - 验证码
 * @param {number} [expireMinutes=5] - 验证码有效期（分钟）
 * @returns {Object} 发送结果
 */
async function sendVerifyCode(to, code, expireMinutes = 5) {
  return sendMail({
    to,
    subject: `【CFC App】验证码（${expireMinutes}分钟内有效）`,
    html: `<div style="padding: 20px; font-family: Arial;">
      <h3>你的验证码是：</h3>
      <p style="font-size: 24px; font-weight: bold; color: #0066cc;">${code}</p>
      <p>该验证码${expireMinutes}分钟内有效，请及时使用，请勿泄露给他人。</p>
    </div>`,
    text: `你的验证码是：${code}，${expireMinutes}分钟内有效，请及时使用。`
  });
}

module.exports = {
  // 通用发送方法（推荐）
  sendMail,
  // 业务快捷方法（按需扩展）
  sendVerifyCode
};
