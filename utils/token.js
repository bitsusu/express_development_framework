/**
 * Token 工具类
 * 优化点：
 * 1. 严格校验输入参数，避免无效参数导致隐性错误
 * 2. 整合JWT完整配置（issuer/audience/algorithms等），提升Token安全性
 * 3. 精细化错误分类（过期/签名错误/格式错误等），便于业务层针对性处理
 * 4. 新增Token刷新功能（生产环境常用）
 * 5. 封装Bearer前缀处理，统一Token格式规范
 * 6. 加入日志记录，便于排查Token相关问题
 * 7. 补充类型注解和详细注释，提升可读性
 */
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const logger = require('../config/logger');

// 封装Token常量（统一管理，避免硬编码）
const TOKEN_CONSTANTS = {
  BEARER_PREFIX: 'Bearer ', // Token前缀
  REFRESH_LEEWAY: 60 * 1000 // 刷新Token的时间宽限（1分钟），避免刚好过期无法刷新
};

/**
 * 生成JWT Token
 * @param {Object} payload - Token载荷（需为对象，不能包含敏感信息如密码）
 * @param {Object} [options={}] - 自定义JWT选项（覆盖默认配置）
 * @returns {string} 生成的Token字符串
 * @throws {Error} 当payload非对象/为空时抛出错误
 */
function generateToken(payload, options = {}) {
  // 1. 严格校验payload参数
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const errorMsg = '生成Token失败：payload必须是非空的纯对象';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // 2. 整合默认配置和自定义配置
  const jwtOptions = {
    expiresIn: jwtConfig.expiresIn,
    algorithm: jwtConfig.algorithms[0],
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
    ...options // 允许自定义覆盖（如临时设置更短的过期时间）
  };

  try {
    const token = jwt.sign(payload, jwtConfig.secret, jwtOptions);
    logger.info(`Token生成成功 | 签发者: ${jwtOptions.issuer} | 过期时间: ${jwtOptions.expiresIn}`);
    return token;
  } catch (error) {
    const errorMsg = `Token生成失败：${error.message}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * 验证JWT Token
 * @param {string} token - 待验证的Token（支持带/不带Bearer前缀）
 * @returns {Object} 验证结果
 *   - valid: boolean - 是否有效
 *   - decoded: Object - 解析后的载荷（valid为true时存在）
 *   - error: Object - 错误信息（valid为false时存在）
 *     - type: string - 错误类型（expired/invalid_signature/invalid_token/other）
 *     - message: string - 错误描述
 */
function verifyToken(token) {
  // 1. 校验token参数
  if (!token || typeof token !== 'string') {
    const errorMsg = '验证Token失败：token必须是非空字符串';
    logger.warn(errorMsg);
    return {
      valid: false,
      error: {
        type: 'invalid_token',
        message: errorMsg
      }
    };
  }

  // 2. 移除Bearer前缀（兼容前端传参习惯）
  const pureToken = token.startsWith(TOKEN_CONSTANTS.BEARER_PREFIX) 
    ? token.slice(TOKEN_CONSTANTS.BEARER_PREFIX.length).trim() 
    : token.trim();

  // 3. 验证Token
  try {
    const decoded = jwt.verify(pureToken, jwtConfig.secret, {
      algorithms: jwtConfig.algorithms, // 严格校验算法，防止算法篡改攻击
      issuer: jwtConfig.issuer, // 校验签发者
      audience: jwtConfig.audience, // 校验受众
      ignoreExpiration: jwtConfig.ignoreExpiration // 遵循环境配置的过期忽略规则
    });

    logger.info(`Token验证成功 | 用户ID: ${decoded.user_id || '未知'}`);
    return {
      valid: true,
      decoded
    };
  } catch (error) {
    // 4. 精细化错误分类
    let errorType = 'other';
    let errorMessage = error.message;

    switch (error.name) {
      case 'TokenExpiredError':
        errorType = 'expired';
        errorMessage = `Token已过期（过期时间：${error.expiredAt}）`;
        logger.warn(`Token验证失败 - 过期 | 过期时间: ${error.expiredAt}`);
        break;
      case 'JsonWebTokenError':
        if (error.message.includes('signature')) {
          errorType = 'invalid_signature';
          errorMessage = 'Token签名无效（可能被篡改）';
          logger.error(`Token验证失败 - 签名无效 | 原因: ${error.message}`);
        } else {
          errorType = 'invalid_token';
          logger.warn(`Token验证失败 - 格式无效 | 原因: ${error.message}`);
        }
        break;
      case 'NotBeforeError':
        errorType = 'not_active';
        errorMessage = `Token尚未生效（生效时间：${error.date}）`;
        logger.warn(`Token验证失败 - 未生效 | 生效时间: ${error.date}`);
        break;
      default:
        logger.error(`Token验证失败 - 未知错误 | 原因: ${error.message}`);
    }

    return {
      valid: false,
      error: {
        type: errorType,
        message: errorMessage
      }
    };
  }
}

/**
 * 刷新Token（生产环境常用：无感刷新，避免用户重新登录）
 * @param {string} oldToken - 原Token（支持带/不带Bearer前缀）
 * @param {Object} [newPayload={}] - 需新增/覆盖的载荷字段
 * @returns {Object} 刷新结果
 *   - success: boolean - 是否成功
 *   - newToken: string - 新Token（success为true时存在）
 *   - error: Object - 错误信息（success为false时存在）
 */
function refreshToken(oldToken, newPayload = {}) {
  // 1. 先验证原Token（即使过期，也允许在宽限期内刷新）
  const verifyResult = verifyToken(oldToken);
  
  // 2. 处理验证结果：过期但在宽限期内，或有效 → 允许刷新
  if (!verifyResult.valid) {
    const { error } = verifyResult;
    // 仅允许“过期”类型的Token在宽限期内刷新
    if (error.type !== 'expired') {
      return {
        success: false,
        error: {
          type: error.type,
          message: `无法刷新Token：${error.message}`
        }
      };
    }

    // 检查是否在刷新宽限期内（原Token过期时间 + 宽限期 > 当前时间）
    const expiredAt = new Date(verifyResult.error.message.match(/过期时间：(.*)/)[1]);
    const leewayEnd = new Date(expiredAt.getTime() + TOKEN_CONSTANTS.REFRESH_LEEWAY);
    if (new Date() > leewayEnd) {
      return {
        success: false,
        error: {
          type: 'refresh_expired',
          message: `Token刷新宽限期已过（宽限期至：${leewayEnd}），请重新登录`
        }
      };
    }
  }

  // 3. 解析原Token载荷（不验证签名，仅解析）
  let oldPayload;
  try {
    const pureToken = oldToken.startsWith(TOKEN_CONSTANTS.BEARER_PREFIX) 
      ? oldToken.slice(TOKEN_CONSTANTS.BEARER_PREFIX.length).trim() 
      : oldToken.trim();
    oldPayload = jwt.decode(pureToken);
    if (!oldPayload) {
      throw new Error('原Token载荷解析失败');
    }
  } catch (error) {
    logger.error(`Token刷新失败 - 解析原载荷失败 | 原因: ${error.message}`);
    return {
      success: false,
      error: {
        type: 'decode_failed',
        message: `刷新Token失败：${error.message}`
      }
    };
  }

  // 4. 整合载荷（保留原载荷，覆盖/新增字段）
  const finalPayload = {
    ...oldPayload,
    ...newPayload,
    iat: Math.floor(Date.now() / 1000) // 重置签发时间
  };
  // 移除jwt内置字段（避免冲突）
  delete finalPayload.iat;
  delete finalPayload.exp;
  delete finalPayload.iss;
  delete finalPayload.aud;

  // 5. 生成新Token
  try {
    const newToken = generateToken(finalPayload);
    logger.info(`Token刷新成功 | 用户ID: ${finalPayload.user_id || '未知'}`);
    return {
      success: true,
      newToken
    };
  } catch (error) {
    logger.error(`Token刷新失败 - 生成新Token失败 | 原因: ${error.message}`);
    return {
      success: false,
      error: {
        type: 'generate_failed',
        message: `刷新Token失败：${error.message}`
      }
    };
  }
}

/**
 * 提取Token中的载荷（仅解析，不验证签名，用于非敏感场景）
 * @param {string} token - 待解析的Token（支持带/不带Bearer前缀）
 * @returns {Object|null} 解析后的载荷（失败返回null）
 */
function decodeToken(token) {
  if (!token || typeof token !== 'string') {
    logger.warn('解析Token载荷失败：token必须是非空字符串');
    return null;
  }

  const pureToken = token.startsWith(TOKEN_CONSTANTS.BEARER_PREFIX) 
    ? token.slice(TOKEN_CONSTANTS.BEARER_PREFIX.length).trim() 
    : token.trim();

  try {
    return jwt.decode(pureToken);
  } catch (error) {
    logger.error(`解析Token载荷失败 | 原因: ${error.message}`);
    return null;
  }
}

module.exports = {
  // 核心功能
  generateToken,
  verifyToken,
  // 扩展功能
  refreshToken,
  decodeToken,
  // 常量导出（便于外部使用）
  TOKEN_CONSTANTS
};
