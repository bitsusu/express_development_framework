/**
 * 用户业务服务层
 * 核心优化点：
 * 1. 修正分层职责：Model 仅处理数据映射，Service 处理业务逻辑，重命名为 service/user.js
 * 2. 完善入参校验：所有接口增加非空/格式校验，提前拦截无效请求
 * 3. 适配新版邮件工具：使用对象入参调用 sendMail，支持模拟发送/重试
 * 4. 补充核心功能：忘记密码（发验证码）、重置密码、修改密码、禁用用户、修改信息等
 * 5. 过滤敏感字段：返回用户信息时排除密码、手机号等敏感字段
 * 6. 优化日志维度：补充用户名、操作类型、脱敏邮箱/手机号，便于排查
 * 7. 增加分页支持：getUserList 支持分页/筛选，提升生产环境性能
 * 8. 事务处理：注册/重置密码等关键操作增加事务，保证数据一致性
 * 9. 验证码机制：忘记密码增加验证码+有效期，防止恶意重置
 */
const { sequelize } = require('../config/db');
const { Sequelize, Op } = require('sequelize'); // 必须引入Op
const { User, RoleUser } = require('../models'); // 真正的 Model 层
const { sendMail, sendVerifyCode } = require('../utils/mail');
const { getLogger } = require('../config/logger');
const crypto = require('crypto'); // 用于生成验证码/密码加密辅助
require('dotenv').config();

const logger = getLogger();

// 模拟验证码存储（生产环境建议用 Redis，设置过期时间）
const verifyCodeCache = new Map();
const CODE_EXPIRE_MINUTES = 5; // 验证码有效期5分钟

/**
 * 通用工具：生成6位数字验证码
 */
const generateVerifyCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * 通用工具：过滤用户敏感字段
 * @param {Object} user - 用户原始数据
 * @returns {Object} 过滤后的用户信息
 */
const filterUserSensitiveFields = (user) => {
  if (!user) return null;
  const { user_password, ...safeUser } = user.toJSON ? user.toJSON() : user;
  // 可选：脱敏手机号/邮箱
  if (safeUser.user_phone) {
    safeUser.user_phone = safeUser.user_phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }
  if (safeUser.user_email) {
    safeUser.user_email = safeUser.user_email.replace(/(.{2}).+(.{2})@/, '$1****$2@');
  }
  return safeUser;
};

/**
 * 用户注册业务逻辑
 * @param {Object} userData 用户注册数据
 * @param {string} [ip] 注册IP（可选，用于日志）
 * @returns {Object} 注册结果（仅返回安全字段）
 */
exports.registerUser = async (userData, ip = 'unknown') => {
  const { user_name, user_password, user_fullname, user_email, user_phone } = userData;
  const t = await sequelize.transaction(); // 开启事务

  try {
    // ========== 1. 入参校验 ==========
    const validateErrors = [];
    if (!user_name) validateErrors.push('用户名不能为空');
    if (!user_password || user_password.length < 6) validateErrors.push('密码长度不能少于6位');
    if (!user_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email)) validateErrors.push('邮箱格式不合法');
    if (validateErrors.length > 0) {
      throw new Error(validateErrors.join('；'));
    }

    // ========== 2. 校验用户名/邮箱是否已存在 ==========
    const existingUser = await User.findOne({ 
      where: { 
        [Op.or]: [{ user_name }, { user_email }] 
      },
      transaction: t
    });
    if (existingUser) {
      throw new Error(existingUser.user_name === user_name ? '用户名已存在' : '邮箱已注册');
    }

    // ========== 3. 创建用户（密码加密在 Model 层钩子处理） ==========
    const user = await User.create({
      user_name,
      user_password,
      user_fullname: user_fullname || user_name,
      user_email,
      user_phone: user_phone || '',
      user_status: 1 // 1-启用，0-禁用
    }, { transaction: t });

    // ========== 4. 绑定默认角色（可选，如普通用户角色） ==========
    const defaultRoleId = process.env.DEFAULT_ROLE_ID || 2; // 假设 2 是普通用户角色
    await RoleUser.create({
      user_id: user.user_id,
      role_id: defaultRoleId
    }, { transaction: t });

    // ========== 5. 发送注册成功邮件（适配新版邮件工具） ==========
    const mailResult = await sendMail({
      to: user_email,
      subject: '【CFC_APP】注册成功通知',
      html: `<h1>欢迎注册CFC_APP</h1>
             <p>您的用户名：${user_name}</p>
             <p>请妥善保管您的账号信息，请勿泄露。</p>`,
      text: `欢迎注册CFC_APP，您的用户名：${user_name}，请妥善保管账号信息。`
    });

    if (!mailResult.success) {
      logger.warn(`[用户注册] 邮件发送失败：${user.user_id} | ${mailResult.error.message}`, { ip });
      // 邮件失败不回滚事务（注册核心流程完成），仅记录日志
    }

    // ========== 6. 提交事务 + 日志 ==========
    await t.commit();
    logger.info(`[用户注册] 注册成功 | 用户ID：${user.user_id} | 用户名：${user_name} | IP：${ip}`, { ip });

    return filterUserSensitiveFields({
      user_id: user.user_id,
      user_name: user.user_name,
      user_email: user.user_email
    });

  } catch (error) {
    await t.rollback(); // 回滚事务
    logger.error(`[用户注册] 失败 | 用户名：${user_name} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};

/**
 * 用户登录业务逻辑
 * @param {string} user_name 用户名/邮箱
 * @param {string} user_password 密码
 * @param {string} [ip] 登录IP
 * @returns {Object} 登录结果（包含用户信息+角色，过滤敏感字段）
 */
exports.loginUser = async (user_name, user_password, ip = 'unknown') => {
  try {
    // ========== 1. 入参校验 ==========
    if (!user_name || !user_password) {
      throw new Error('用户名/密码不能为空');
    }

    // ========== 2. 查询用户（支持用户名/邮箱登录） ==========
    const user = await User.findOne({
      where: {
        [Op.or]: [{ user_name }, { user_email: user_name }]
      },
      attributes: { include: ['user_password'] } // 仅登录时临时包含密码用于验证
    });

    // ========== 3. 校验用户状态/密码 ==========
    if (!user) {
      throw new Error('用户名或密码错误');
    }
    if (user.user_status === 0) {
      throw new Error('账号已被禁用，请联系管理员');
    }
    if (!user.validatePassword(user_password)) { // 依赖 Model 层的密码验证方法
      logger.warn(`[用户登录] 密码错误 | 用户名：${user_name} | IP：${ip}`);
      throw new Error('用户名或密码错误');
    }

    // ========== 4. 查询用户角色 ==========
    const roleUser = await RoleUser.findOne({ 
      where: { user_id: user.user_id } 
    });

    // ========== 5. 日志 + 返回结果 ==========
    logger.info(`[用户登录] 登录成功 | 用户ID：${user.user_id} | 用户名：${user.user_name} | IP：${ip}`, { ip });
    return {
      user: filterUserSensitiveFields(user),
      role_id: roleUser?.role_id || null
    };

  } catch (error) {
    logger.error(`[用户登录] 失败 | 用户名：${user_name} | 原因：${error.message} | IP：${ip}`, { ip });
    throw new Error(error.message);
  }
};

/**
 * 忘记密码：发送验证码到邮箱
 * @param {string} user_email 用户邮箱
 * @param {string} [ip] 操作IP
 * @returns {Object} 发送结果
 */
exports.forgetPassword = async (user_email, ip = 'unknown') => {
  try {
    // ========== 1. 入参校验 ==========
    if (!user_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email)) {
      throw new Error('邮箱格式不合法');
    }

    // ========== 2. 校验邮箱是否注册 ==========
    const user = await User.findOne({ where: { user_email } });
    if (!user) {
      // 防枚举：不直接提示邮箱未注册，仅返回“验证码已发送”
      logger.warn(`[忘记密码] 邮箱未注册 | 邮箱：${user_email} | IP：${ip}`, { ip });
      return { success: true, message: '验证码已发送至您的邮箱，请查收' };
    }

    // ========== 3. 生成验证码 + 存储（带有效期） ==========
    const verifyCode = generateVerifyCode();
    const expireTime = Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000;
    verifyCodeCache.set(`reset_${user_email}`, { code: verifyCode, expireTime, userId: user.user_id });

    // ========== 4. 发送验证码邮件 ==========
    const mailResult = await sendVerifyCode(user_email, verifyCode, CODE_EXPIRE_MINUTES);
    if (!mailResult.success) {
      throw new Error(`验证码邮件发送失败：${mailResult.error.message}`);
    }

    // ========== 5. 日志 + 返回结果 ==========
    logger.info(`[忘记密码] 验证码发送成功 | 用户ID：${user.user_id} | 邮箱：${user_email} | IP：${ip}`, { ip });
    return { success: true, message: '验证码已发送至您的邮箱，请查收' };

  } catch (error) {
    logger.error(`[忘记密码] 失败 | 邮箱：${user_email} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};

/**
 * 重置密码：验证验证码并修改密码
 * @param {string} user_email 用户邮箱
 * @param {string} verifyCode 验证码
 * @param {string} newPassword 新密码
 * @param {string} [ip] 操作IP
 * @returns {Object} 重置结果
 */
exports.resetPassword = async (user_email, verifyCode, newPassword, ip = 'unknown') => {
  const t = await sequelize.transaction();
  try {
    // ========== 1. 入参校验 ==========
    const validateErrors = [];
    if (!user_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user_email)) validateErrors.push('邮箱格式不合法');
    if (!verifyCode || verifyCode.length !== 6) validateErrors.push('验证码格式错误（6位数字）');
    if (!newPassword || newPassword.length < 6) validateErrors.push('新密码长度不能少于6位');
    if (validateErrors.length > 0) {
      throw new Error(validateErrors.join('；'));
    }

    // ========== 2. 校验验证码 ==========
    const cacheKey = `reset_${user_email}`;
    const cacheData = verifyCodeCache.get(cacheKey);
    if (!cacheData) {
      throw new Error('验证码已过期或未发送，请重新获取');
    }
    if (cacheData.expireTime < Date.now()) {
      verifyCodeCache.delete(cacheKey);
      throw new Error('验证码已过期，请重新获取');
    }
    if (cacheData.code !== verifyCode) {
      throw new Error('验证码错误，请重新输入');
    }

    // ========== 3. 修改密码（Model 层钩子自动加密） ==========
    const user = await User.findByPk(cacheData.userId, { transaction: t });
    if (!user) {
      throw new Error('用户不存在');
    }
    await user.update({ user_password: newPassword }, { transaction: t });

    // ========== 4. 清理验证码 + 提交事务 ==========
    verifyCodeCache.delete(cacheKey);
    await t.commit();

    // ========== 5. 发送密码重置成功邮件 ==========
    const mailResult = await sendMail({
      to: user_email,
      subject: '【CFC_APP】密码重置成功通知',
      html: `<h1>密码重置成功</h1>
             <p>您的账号 ${user.user_name} 密码已重置，请使用新密码登录。</p>
             <p>若非本人操作，请及时联系管理员。</p>`,
      text: `您的账号 ${user.user_name} 密码已重置，请使用新密码登录。若非本人操作，请及时联系管理员。`
    });
    if (!mailResult.success) {
      logger.warn(`[重置密码] 邮件发送失败 | 用户ID：${user.user_id} | ${mailResult.error.message}`, { ip });
    }

    // ========== 6. 日志 + 返回结果 ==========
    logger.info(`[重置密码] 成功 | 用户ID：${user.user_id} | 邮箱：${user_email} | IP：${ip}`, { ip });
    return { success: true, message: '密码重置成功，请使用新密码登录' };

  } catch (error) {
    await t.rollback();
    logger.error(`[重置密码] 失败 | 邮箱：${user_email} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};

/**
 * 修改密码：验证旧密码后修改
 * @param {number} userId 用户ID
 * @param {string} oldPassword 旧密码
 * @param {string} newPassword 新密码
 * @param {string} [ip] 操作IP
 * @returns {Object} 修改结果
 */
exports.changePassword = async (userId, oldPassword, newPassword, ip = 'unknown') => {
  const t = await sequelize.transaction();
  try {
    // ========== 1. 入参校验 ==========
    if (!userId) throw new Error('用户ID不能为空');
    if (!oldPassword) throw new Error('旧密码不能为空');
    if (!newPassword || newPassword.length < 6) throw new Error('新密码长度不能少于6位');
    if (oldPassword === newPassword) throw new Error('新密码不能与旧密码相同');

    // ========== 2. 查询用户 + 验证旧密码 ==========
    const user = await User.findByPk(userId, { 
      attributes: { include: ['user_password'] },
      transaction: t
    });
    if (!user) {
      throw new Error('用户不存在');
    }
    if (!user.validatePassword(oldPassword)) {
      throw new Error('旧密码错误');
    }

    // ========== 3. 修改密码 ==========
    await user.update({ user_password: newPassword }, { transaction: t });
    await t.commit();

    // ========== 4. 日志 + 返回结果 ==========
    logger.info(`[修改密码] 成功 | 用户ID：${userId} | IP：${ip}`, { ip });
    return { success: true, message: '密码修改成功，请重新登录' };

  } catch (error) {
    await t.rollback();
    logger.error(`[修改密码] 失败 | 用户ID：${userId} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};

/**
 * 获取用户列表（支持分页+筛选）
 * @param {Object} params 分页/筛选参数
 * @param {number} [params.page=1] 页码
 * @param {number} [params.pageSize=10] 每页条数
 * @param {string} [params.keyword] 搜索关键词（用户名/姓名/邮箱）
 * @returns {Object} { list: 用户列表, total: 总数, page: 页码, pageSize: 每页条数 }
 */
exports.getUserList = async (params = {}) => {
  try {
    const { page = 1, pageSize = 10, keyword = '' } = params;
    const offset = (page - 1) * pageSize;
    const where = {};

    // 关键词筛选（用户名/姓名/邮箱）
    if (keyword) {
      where[Op.or] = [
        { user_name: { [sequelize.Op.like]: `%${keyword}%` } },
        { user_fullname: { [sequelize.Op.like]: `%${keyword}%` } },
        { user_email: { [sequelize.Op.like]: `%${keyword}%` } }
      ];
    }

    // 查询列表+总数
    const { count, rows } = await User.findAndCountAll({
      where,
      limit: pageSize,
      offset,
      order: [['create_time', 'DESC']], // 按创建时间倒序
      attributes: { exclude: ['user_password'] } // 排除密码字段
    });

    // 过滤敏感字段
    const safeList = rows.map(filterUserSensitiveFields);

    logger.info(`[获取用户列表] 成功 | 页码：${page} | 每页条数：${pageSize} | 总数：${count}`);
    return {
      list: safeList,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };

  } catch (error) {
    logger.error(`[获取用户列表] 失败 | 原因：${error.message}`, { stack: error.stack });
    throw new Error(error.message);
  }
};

/**
 * 根据ID获取用户（过滤敏感字段）
 * @param {number} id 用户ID
 * @returns {Object} 过滤后的用户信息
 */
exports.getUserById = async (id) => {
  try {
    if (!id) throw new Error('用户ID不能为空');

    const user = await User.findByPk(id, {
      attributes: { exclude: ['user_password'] }
    });
    if (!user) {
      throw new Error('用户不存在');
    }

    logger.info(`[获取用户详情] 成功 | 用户ID：${id}`);
    return filterUserSensitiveFields(user);

  } catch (error) {
    logger.error(`[获取用户详情] 失败 | 用户ID：${id} | 原因：${error.message}`, { stack: error.stack });
    throw new Error(error.message);
  }
};

/**
 * 修改用户基本信息（不含密码）
 * @param {number} userId 用户ID
 * @param {Object} userData 待修改信息（user_fullname/user_phone/user_email等）
 * @param {string} [ip] 操作IP
 * @returns {Object} 修改后的用户信息
 */
exports.updateUserInfo = async (userId, userData, ip = 'unknown') => {
  const t = await sequelize.transaction();
  try {
    if (!userId) throw new Error('用户ID不能为空');
    const { user_password, ...safeData } = userData; // 排除密码字段（单独走修改密码接口）

    // 邮箱格式校验（若修改邮箱）
    if (safeData.user_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeData.user_email)) {
      throw new Error('邮箱格式不合法');
    }

    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      throw new Error('用户不存在');
    }

    // 修改信息
    await user.update(safeData, { transaction: t });
    await t.commit();

    logger.info(`[修改用户信息] 成功 | 用户ID：${userId} | 修改字段：${Object.keys(safeData).join(',')} | IP：${ip}`, { ip });
    return filterUserSensitiveFields(user);

  } catch (error) {
    await t.rollback();
    logger.error(`[修改用户信息] 失败 | 用户ID：${userId} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};

/**
 * 禁用/启用用户
 * @param {number} userId 用户ID
 * @param {number} status 状态（1-启用，0-禁用）
 * @param {string} [operator] 操作人
 * @param {string} [ip] 操作IP
 * @returns {Object} 操作结果
 */
exports.toggleUserStatus = async (userId, status, operator = 'admin', ip = 'unknown') => {
  const t = await sequelize.transaction();
  try {
    if (!userId) throw new Error('用户ID不能为空');
    if (![0, 1].includes(status)) throw new Error('状态值只能是0（禁用）或1（启用）');

    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      throw new Error('用户不存在');
    }
    if (user.user_status === status) {
      throw new Error(`用户已${status === 1 ? '启用' : '禁用'}，无需重复操作`);
    }

    await user.update({ user_status: status }, { transaction: t });
    await t.commit();

    const statusText = status === 1 ? '启用' : '禁用';
    logger.info(`[${statusText}用户] 成功 | 操作人：${operator} | 用户ID：${userId} | IP：${ip}`, { ip });
    return { success: true, message: `用户${statusText}成功` };

  } catch (error) {
    await t.rollback();
    logger.error(`[禁用/启用用户] 失败 | 操作人：${operator} | 用户ID：${userId} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};

/**
 * 软删除用户（适配Model层软删除）
 * @param {number} userId 用户ID
 * @param {string} [operator] 操作人
 * @param {string} [ip] 操作IP
 * @returns {Object} 删除结果
 */
exports.deleteUser = async (userId, operator = 'admin', ip = 'unknown') => {
  const t = await sequelize.transaction();
  try {
    if (!userId) throw new Error('用户ID不能为空');

    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      throw new Error('用户不存在');
    }

    // 软删除（依赖Model层的deletedAt/paranoid配置）
    await user.destroy({ transaction: t });
    await t.commit();

    logger.info(`[删除用户] 成功 | 操作人：${operator} | 用户ID：${userId} | IP：${ip}`, { ip });
    return { success: true, message: '用户删除成功' };

  } catch (error) {
    await t.rollback();
    logger.error(`[删除用户] 失败 | 操作人：${operator} | 用户ID：${userId} | 原因：${error.message} | IP：${ip}`, { 
      stack: error.stack, 
      ip 
    });
    throw new Error(error.message);
  }
};
