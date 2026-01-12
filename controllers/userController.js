/**
 * 用户控制器层（适配 service/user.js 完整功能）
 * 核心优化点：
 * 1. 修正服务层引入路径，解决模块找不到问题
 * 2. 补充前置参数校验，提前拦截无效请求（减少服务层压力）
 * 3. 传递 req.ip 到服务层，满足日志审计需求
 * 4. 集成日志模块，记录接口调用关键信息（参数、IP、响应状态）
 * 5. 补充所有核心接口：忘记密码、重置密码、修改密码、修改信息、禁用用户等
 * 6. 优化入参处理：ID转数字、解析分页参数，适配服务层逻辑
 * 7. 统一响应格式：所有接口返回结构一致，错误提示更友好
 * 8. 细化错误处理：区分参数错误/业务错误，返回精准提示
 */
const userService = require('../services/userService'); // 修正引入路径
const { generateToken } = require('../utils/token');
const { getLogger } = require('../config/logger');
const logger = getLogger();

// 通用工具：参数非空校验
const validateRequired = (params, requiredFields) => {
  const missing = requiredFields.filter(field => !params[field]);
  if (missing.length > 0) {
    throw new Error(`必填参数缺失：${missing.join('、')}`);
  }
};

// ===================== 基础接口：注册/登录 =====================
/**
 * 用户注册接口
 * @route POST /api/user/register
 */
exports.register = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 前置参数校验
    validateRequired(req.body, ['user_name', 'user_password', 'user_email']);
    logger.info(`[用户注册接口] 接收到注册请求 | IP：${ip} | 用户名：${req.body.user_name}`, { ip, body: req.body });

    // 2. 调用服务层（传递IP）
    const result = await userService.registerUser(req.body, ip);

    // 3. 统一响应
    res.status(201).json({
      code: 201,
      message: '用户注册成功，请登录',
      data: result
    });
  } catch (error) {
    logger.error(`[用户注册接口] 失败 | IP：${ip} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

/**
 * 用户登录接口
 * @route POST /api/user/login
 */
exports.login = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 前置参数校验
    validateRequired(req.body, ['user_name', 'user_password']);
    const { user_name, user_password } = req.body;
    logger.info(`[用户登录接口] 接收到登录请求 | IP：${ip} | 用户名：${user_name}`, { ip, body: req.body });

    // 2. 调用服务层（传递IP）
    const { user, role_id } = await userService.loginUser(user_name, user_password, ip);

    // 3. 生成Token
    const token = generateToken({
      user_id: user.user_id,
      user_name: user.user_name,
      role_id
    });

    // 4. 统一响应
    res.status(200).json({
      code: 200,
      message: '登录成功，欢迎回来',
      data: { token, user }
    });
  } catch (error) {
    logger.error(`[用户登录接口] 失败 | IP：${ip} | 用户名：${req.body.user_name} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

// ===================== 扩展接口：忘记/重置密码 =====================
/**
 * 忘记密码（发送验证码）
 * @route POST /api/user/forget-password
 */
exports.forgetPassword = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 前置参数校验
    validateRequired(req.body, ['user_email']);
    const { user_email } = req.body;
    logger.info(`[忘记密码接口] 接收到验证码请求 | IP：${ip} | 邮箱：${user_email}`, { ip, body: req.body });

    // 2. 调用服务层
    const result = await userService.forgetPassword(user_email, ip);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: result.message,
      data: result
    });
  } catch (error) {
    logger.error(`[忘记密码接口] 失败 | IP：${ip} | 邮箱：${req.body.user_email} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

/**
 * 重置密码（验证验证码+修改密码）
 * @route POST /api/user/reset-password
 */
exports.resetPassword = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 前置参数校验
    validateRequired(req.body, ['user_email', 'verifyCode', 'newPassword']);
    const { user_email, verifyCode, newPassword } = req.body;
    logger.info(`[重置密码接口] 接收到重置请求 | IP：${ip} | 邮箱：${user_email}`, { ip, body: { ...req.body, newPassword: '***' } }); // 密码脱敏

    // 2. 调用服务层
    const result = await userService.resetPassword(user_email, verifyCode, newPassword, ip);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: result.message,
      data: result
    });
  } catch (error) {
    logger.error(`[重置密码接口] 失败 | IP：${ip} | 邮箱：${req.body.user_email} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

/**
 * 修改密码（验证旧密码）
 * @route POST /api/user/change-password
 * @header Authorization: Bearer {token}
 */
exports.changePassword = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 前置参数校验（从Token解析用户ID，需确保JWT中间件已验证）
    const userId = req.user?.user_id; // 假设JWT中间件将用户信息挂载到req.user
    validateRequired({ ...req.body, userId }, ['userId', 'oldPassword', 'newPassword']);
    const { oldPassword, newPassword } = req.body;
    logger.info(`[修改密码接口] 接收到修改请求 | IP：${ip} | 用户ID：${userId}`, { ip, body: { oldPassword: '***', newPassword: '***' } });

    // 2. 调用服务层
    const result = await userService.changePassword(userId, oldPassword, newPassword, ip);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: result.message,
      data: result
    });
  } catch (error) {
    logger.error(`[修改密码接口] 失败 | IP：${ip} | 用户ID：${req.user?.user_id} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

// ===================== 基础接口：用户列表/详情 =====================
/**
 * 获取用户列表（支持分页+筛选）
 * @route GET /api/user/list
 * @query page: 页码, pageSize: 每页条数, keyword: 搜索关键词
 */
exports.getUserList = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 解析分页/筛选参数（默认值兜底）
    const params = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 10,
      keyword: req.query.keyword || ''
    };
    logger.info(`[获取用户列表接口] 接收到查询请求 | IP：${ip} | 参数：${JSON.stringify(params)}`, { ip, query: req.query });

    // 2. 调用服务层
    const result = await userService.getUserList(params);

    // 3. 统一响应（空数据兜底）
    res.status(200).json({
      code: 200,
      message: result.list.length > 0 ? '用户列表查询成功' : '暂无用户数据',
      data: result
    });
  } catch (error) {
    logger.error(`[获取用户列表接口] 失败 | IP：${ip} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

/**
 * 根据ID获取用户详情
 * @route GET /api/user/:id
 */
exports.getUserById = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 解析并校验用户ID（转为数字）
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      throw new Error('用户ID必须为数字');
    }
    logger.info(`[获取用户详情接口] 接收到查询请求 | IP：${ip} | 用户ID：${userId}`, { ip, params: req.params });

    // 2. 调用服务层
    const result = await userService.getUserById(userId);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: '用户详情查询成功',
      data: result
    });
  } catch (error) {
    logger.error(`[获取用户详情接口] 失败 | IP：${ip} | 用户ID：${req.params.id} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

// ===================== 扩展接口：修改信息/禁用/删除 =====================
/**
 * 修改用户基本信息
 * @route PUT /api/user/:id
 * @header Authorization: Bearer {token}
 */
exports.updateUserInfo = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 解析并校验用户ID
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      throw new Error('用户ID必须为数字');
    }
    logger.info(`[修改用户信息接口] 接收到修改请求 | IP：${ip} | 用户ID：${userId}`, { ip, params: req.params, body: req.body });

    // 2. 调用服务层
    const result = await userService.updateUserInfo(userId, req.body, ip);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: '用户信息修改成功',
      data: result
    });
  } catch (error) {
    logger.error(`[修改用户信息接口] 失败 | IP：${ip} | 用户ID：${req.params.id} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

/**
 * 禁用/启用用户
 * @route PUT /api/user/:id/status
 * @header Authorization: Bearer {token}
 */
exports.toggleUserStatus = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 解析并校验参数
    const userId = parseInt(req.params.id);
    const { status, operator } = req.body;
    validateRequired({ userId, status }, ['userId', 'status']);
    if (isNaN(userId)) throw new Error('用户ID必须为数字');
    if (![0, 1].includes(status)) throw new Error('状态值只能是0（禁用）或1（启用）');

    logger.info(`[禁用/启用用户接口] 接收到操作请求 | IP：${ip} | 用户ID：${userId} | 目标状态：${status} | 操作人：${operator}`, { ip, params: req.params, body: req.body });

    // 2. 调用服务层
    const result = await userService.toggleUserStatus(userId, status, operator, ip);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: result.message,
      data: result
    });
  } catch (error) {
    logger.error(`[禁用/启用用户接口] 失败 | IP：${ip} | 用户ID：${req.params.id} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};

/**
 * 删除用户（软删除）
 * @route DELETE /api/user/:id
 * @header Authorization: Bearer {token}
 */
exports.deleteUser = async (req, res, next) => {
  const ip = req.ip;
  try {
    // 1. 解析并校验用户ID
    const userId = parseInt(req.params.id);
    const { operator } = req.body;
    if (isNaN(userId)) throw new Error('用户ID必须为数字');
    if (!operator) throw new Error('操作人不能为空');

    logger.info(`[删除用户接口] 接收到删除请求 | IP：${ip} | 用户ID：${userId} | 操作人：${operator}`, { ip, params: req.params, body: req.body });

    // 2. 调用服务层
    const result = await userService.deleteUser(userId, operator, ip);

    // 3. 统一响应
    res.status(200).json({
      code: 200,
      message: result.message,
      data: result
    });
  } catch (error) {
    logger.error(`[删除用户接口] 失败 | IP：${ip} | 用户ID：${req.params.id} | 原因：${error.message}`, { ip, stack: error.stack });
    next(error);
  }
};
