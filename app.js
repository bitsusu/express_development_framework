const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { mountSwagger } = require('./config/swagger');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();
console.log('app实例是否有效：', !!app); // 应打印true
console.log('app实例类型：', typeof app); // 应打印object
console.log('app是否有use方法：', typeof app.use === 'function'); // 应打印true
console.log('=================================');


// 中间件
app.use(cors()); // 跨域
app.use(express.json()); // 解析JSON请求体
app.use(express.urlencoded({ extended: true })); // 解析表单请求体

// Swagger文档
// 挂载Swagger文档（需在路由挂载前）
mountSwagger(app);

// 打印所有路由
/**
 * 安全打印Express所有路由（修复stack undefined问题）
 * @param {Express.Application | Express.Router} target - Express app实例 或 Router实例
 * @param {string} basePath - 路由基础前缀（内部递归使用）
 */
const printRoutes = (target, basePath = '') => {
  // ❶ 容错1：检查target是否有效，无效则直接返回
  if (!target) {
    console.warn('[打印路由] 无效的参数：target为空');
    return;
  }

  // ❷ 兼容app实例和Router实例（app实例需取_router）
  const router = target._router || target;
  // 容错2：检查router.stack是否存在
  if (!router || !router.stack) {
    console.warn('[打印路由] 未找到路由栈（可能路由未挂载）');
    return;
  }

  // 遍历路由栈
  router.stack.forEach(layer => {
    // 情况1：直接定义的路由（如app.post('/test', ...)）
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      const path = `${basePath}${layer.route.path}`;
      console.log(`[路由] ${methods.padEnd(8)} → ${path}`); // 格式化输出，更美观
    }

    // 情况2：挂载的子Router（如app.use('/api', router)）
    else if (layer.name === 'router' && layer.handle && layer.regexp) {
      // ❸ 容错3：处理layer.regexp.source的兼容（避免replace出错）
      let newBase = layer.regexp.source || '';
      // 清理正则表达式中的特殊字符，提取实际路径前缀
      newBase = newBase
        .replace(/\\\/|\/|\^|\$|\\|\+|\?/g, '') // 移除正则特殊字符
        .replace('undefined', '') // 兼容极端情况
        .trim();
      // 拼接基础路径（避免空字符串/多余斜杠）
      newBase = basePath + (newBase ? `/${newBase}` : '');
      // 递归打印子Router的路由
      printRoutes(layer.handle, newBase);
    }
  });
};


// 挂载路由
app.use('/api', routes);
// 临时加一个测试路由（强制创建app._router）
app.get('/test', (req, res) => res.send('test')); 
// 打印路由
// ❷ 第二步：调用printRoutes，传入app实例（核心！）
console.log('======= 手动验证路由栈 =======');
console.log('app._router存在：', !!app._router);
console.log('路由栈长度：', app._router?.stack?.length || 0);
console.log('===============================')
console.log('======= 已注册的路由列表 =======');
printRoutes(app); // 直接传app实例，函数内部会自动取app._router
console.log('===============================');


// 全局错误处理
app.use(errorHandler);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: `接口${req.originalUrl}不存在`
  });
});

module.exports = app;
