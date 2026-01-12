/**
 * Swagger 文档配置
 * 核心优化点：
 * 1. 环境差异化配置（开发环境启用，生产环境禁用/隐藏文档）
 * 2. 完善的文档元信息（标题、版本、联系人、许可证等）
 * 3. 集成JWT认证配置，自动适配接口鉴权
 * 4. 配置校验+默认值，避免缺失配置导致文档加载失败
 * 5. 模块化路径配置，支持多目录接口注释扫描
 * 6. 日志集成，记录文档初始化状态
 * 7. 生产环境安全配置（禁用调试、限制访问）
 * 8. 兼容不同环境的访问路径（如域名/端口差异）
 */
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const process = require('process');
require('dotenv').config();

// 引入日志模块（需确保已初始化）
const { getLogger } = require('./logger');

// ===================== 1. 基础配置与校验 =====================
const DEFAULT_SWAGGER_CONFIG = {
  ENABLE: process.env.NODE_ENV !== 'production', // 默认生产环境禁用
  TITLE: 'CFC App 接口文档',
  DESCRIPTION: '基于Node.js + Express + Sequelize的后台系统接口文档',
  VERSION: '1.0.0',
  CONTACT_NAME: '开发团队',
  CONTACT_EMAIL: 'dev@cfc-app.com',
  BASE_PATH: '/', // 接口基础路径
  DOCS_PATH: '/api-docs', // 文档访问路径
  // 接口注释扫描路径（支持多目录）
  APIS: [
    path.join(process.cwd(), 'routes/**/*.js'), // 路由文件
    path.join(process.cwd(), 'controllers/**/*.js'), // 控制器文件
    path.join(process.cwd(), 'models/**/*.js') // 模型文件（数据结构）
  ],
  // JWT认证配置
  JWT_AUTH_NAME: 'Bearer Token',
  JWT_AUTH_LOCATION: 'header',
  JWT_AUTH_DESCRIPTION: '接口鉴权Token（格式：Bearer {token}）'
};

// 合并环境变量与默认配置
const swaggerConfig = {
  enable: process.env.SWAGGER_ENABLE === 'true' || DEFAULT_SWAGGER_CONFIG.ENABLE,
  title: process.env.SWAGGER_TITLE || DEFAULT_SWAGGER_CONFIG.TITLE,
  description: process.env.SWAGGER_DESCRIPTION || DEFAULT_SWAGGER_CONFIG.DESCRIPTION,
  version: process.env.SWAGGER_VERSION || DEFAULT_SWAGGER_CONFIG.VERSION,
  contactName: process.env.SWAGGER_CONTACT_NAME || DEFAULT_SWAGGER_CONFIG.CONTACT_NAME,
  contactEmail: process.env.SWAGGER_CONTACT_EMAIL || DEFAULT_SWAGGER_CONFIG.CONTACT_EMAIL,
  basePath: process.env.SWAGGER_BASE_PATH || DEFAULT_SWAGGER_CONFIG.BASE_PATH,
  docsPath: process.env.SWAGGER_DOCS_PATH || DEFAULT_SWAGGER_CONFIG.DOCS_PATH,
  apis: process.env.SWAGGER_APIS 
    ? process.env.SWAGGER_APIS.split(',').map(p => path.join(process.cwd(), p.trim()))
    : DEFAULT_SWAGGER_CONFIG.APIS,
  jwtAuthName: process.env.SWAGGER_JWT_AUTH_NAME || DEFAULT_SWAGGER_CONFIG.JWT_AUTH_NAME,
  jwtAuthLocation: process.env.SWAGGER_JWT_AUTH_LOCATION || DEFAULT_SWAGGER_CONFIG.JWT_AUTH_LOCATION,
  jwtAuthDescription: process.env.SWAGGER_JWT_AUTH_DESCRIPTION || DEFAULT_SWAGGER_CONFIG.JWT_AUTH_DESCRIPTION
};

// 配置校验
const validateSwaggerConfig = () => {
  const logger = getLogger();
  // 校验核心路径（避免路径格式错误）
  if (!swaggerConfig.basePath.startsWith('/')) {
    logger.warn(`[Swagger配置] BASE_PATH=${swaggerConfig.basePath} 格式不合法，自动修正为 /${swaggerConfig.basePath}`);
    swaggerConfig.basePath = `/${swaggerConfig.basePath}`;
  }
  if (!swaggerConfig.docsPath.startsWith('/')) {
    logger.warn(`[Swagger配置] DOCS_PATH=${swaggerConfig.docsPath} 格式不合法，自动修正为 /${swaggerConfig.docsPath}`);
    swaggerConfig.docsPath = `/${swaggerConfig.docsPath}`;
  }
  // 校验扫描路径是否存在（仅开发环境提示）
  if (process.env.NODE_ENV === 'development') {
    const fs = require('fs');
    swaggerConfig.apis.forEach(apiPath => {
      const dir = path.dirname(apiPath);
      if (!fs.existsSync(dir)) {
        logger.warn(`[Swagger配置] 接口注释扫描目录不存在：${dir}，请检查路径配置`);
      }
    });
  }
};

// ===================== 2. Swagger 核心配置 =====================
/**
 * 初始化Swagger配置
 * @returns {Object} { serve, setup, path, enable }
 */
const initSwagger = () => {
  const logger = getLogger();
  
  // 1. 禁用则直接返回
  if (!swaggerConfig.enable) {
    logger.info('[Swagger] 文档功能已禁用（生产环境默认禁用）');
    return { enable: false };
  }

  try {
    // 2. 配置校验
    validateSwaggerConfig();

    // 3. 定义Swagger规范
    const options = {
      definition: {
        openapi: '3.0.0', // OpenAPI 3.0 规范（最新版）
        info: {
          title: swaggerConfig.title,
          version: swaggerConfig.version,
          description: swaggerConfig.description,
          contact: {
            name: swaggerConfig.contactName,
            email: swaggerConfig.contactEmail
          },
          license: {
            name: 'MIT', // 示例许可证，可根据实际修改
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: `${process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`}${swaggerConfig.basePath}`,
            description: process.env.NODE_ENV === 'production' ? '生产环境' : '开发环境'
          }
        ],
        basePath: swaggerConfig.basePath,
        // 安全配置：集成JWT认证
        components: {
          securitySchemes: {
            jwtAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: swaggerConfig.jwtAuthDescription
            }
          }
        },
        // 全局安全配置（所有接口默认需要JWT认证）
        security: [
          { jwtAuth: [] }
        ]
      },
      // 扫描包含接口注释的文件
      apis: swaggerConfig.apis
    };

    // 4. 生成Swagger规范文档
    const specs = swaggerJsdoc(options);

    // 5. Swagger UI 配置（自定义界面）
    const uiOptions = {
      explorer: true, // 启用接口探索器
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 20px 0; }
      `, // 自定义样式（隐藏顶部栏）
      customSiteTitle: swaggerConfig.title,
      // 生产环境禁用调试功能
      persistAuthorization: process.env.NODE_ENV !== 'production', // 保存认证信息（开发环境）
      tryItOutEnabled: process.env.NODE_ENV !== 'production' // 禁用生产环境的"Try it out"
    };

    logger.info(`[Swagger] 文档初始化成功 | 访问路径：${swaggerConfig.docsPath} | 接口基础路径：${swaggerConfig.basePath}`);
    
    return {
      enable: true,
      path: swaggerConfig.docsPath,
      serve: swaggerUi.serve,
      setup: swaggerUi.setup(specs, uiOptions)
    };
  } catch (error) {
    logger.error(`[Swagger] 文档初始化失败：${error.message}`, { stack: error.stack });
    return { enable: false };
  }
};

// ===================== 3. 挂载到Express应用 =====================
/**
 * 将Swagger文档挂载到Express应用
 * @param {Express.Application} app - Express实例
 */
const mountSwagger = (app) => {
  const swagger = initSwagger();
  if (swagger.enable && app) {
    app.use(swagger.path, swagger.serve, swagger.setup);
    const logger = getLogger();
    logger.info(`[Swagger] 文档已挂载到路径：${swagger.path}`);
  }
};

// ===================== 4. 导出配置 =====================
module.exports = {
  initSwagger,
  mountSwagger,
  swaggerConfig // 导出配置，便于外部查看/扩展
};
