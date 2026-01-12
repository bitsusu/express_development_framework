/**
 * JWT 配置文件
 * 优化点：
 * 1. 增加核心配置校验，避免空值导致运行时错误
 * 2. 为非必填项设置合理默认值
 * 3. 校验 expiresIn 格式合法性
 * 4. 补充常用 JWT 配置项（issuer/audience）
 * 5. 增加类型检查，提升配置可靠性
 */
require('dotenv').config();

// 核心配置校验函数
const validateJwtConfig = () => {
  // 1. 校验 JWT_SECRET （必填项，无默认值）
  if (!process.env.JWT_SECRET) {
    throw new Error('[JWT配置错误] 未配置 JWT_SECRET 环境变量，请在 .env 文件中设置');
  }

  // 2. 校验 JWT_SECRET 类型（必须是字符串）
  if (typeof process.env.JWT_SECRET !== 'string') {
    throw new Error('[JWT配置错误] JWT_SECRET 必须是字符串类型');
  }

  // 3. 校验 expiresIn 格式（可选，有默认值）
  const validExpiresInPattern = /^\d+[smhdwy]$/; // 匹配 10s/15m/24h/7d/30w/1y 等格式
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  if (!validExpiresInPattern.test(expiresIn)) {
    console.warn(
      '[JWT配置警告] JWT_EXPIRES_IN 格式不合法（示例：24h/7d/30m），已自动使用默认值 24h'
    );
    return '24h';
  }
  return expiresIn;
};

// 初始化并校验配置
const jwtConfig = (() => {
  try {
    const expiresIn = validateJwtConfig();
    
    return {
      // 核心加密密钥（必填）
      secret: process.env.JWT_SECRET.trim(), // 去除首尾空格，避免配置失误
      // 过期时间（有默认值 + 格式校验）
      expiresIn: expiresIn,
      // 加密算法（固定值，避免配置错误）
      algorithms: ['HS256'],
      // 补充常用配置项（提升 JWT 安全性）
      issuer: process.env.JWT_ISSUER || 'cfc_app', // 签发者（默认值：项目名）
      audience: process.env.JWT_AUDIENCE || 'cfc_app_users', // 受众（默认值：项目用户）
      // Token 刷新窗口（可选，用于无感刷新 Token）
      refreshWindow: process.env.JWT_REFRESH_WINDOW || '1h',
      // 是否允许 Token 过期后宽限（生产环境建议关闭）
      ignoreExpiration: process.env.NODE_ENV === 'production' ? false : false
    };
  } catch (error) {
    console.error('[JWT配置初始化失败]', error.message);
    process.exit(1); // 配置错误时终止进程，避免运行时崩溃
  }
})();

module.exports = jwtConfig;
