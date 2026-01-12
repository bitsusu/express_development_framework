this is a folder for the app middlewares, include rbac / auth/ errorHandler .etc

Express 最全常用中间件（分类讲解 + 用法 + 项目必配，含你的项目适配）
你当前是基于 Express + Sequelize + 逻辑外键 + 迁移脚本 的生产级项目，本次内容会贴合你的项目场景，把 Express 最常用、最核心、项目开发必配 的中间件做「分类整理 + 完整用法 + 代码示例 + 使用场景」，所有示例代码都能无缝接入你现有的项目，内容从基础到进阶，看完就能直接用。

一、先搞懂：Express 中「中间件的核心概念」
1. 中间件是什么？
Express 的核心就是 中间件机制，中间件本质是一个 function(req, res, next) 函数，有 3 个固定参数：
req：请求对象（获取请求参数、请求头、请求体等）
res：响应对象（返回数据、设置响应头、状态码等）
next：放行函数，调用 next() 会让请求「流转」到下一个中间件 / 路由，不调用则请求会被挂起。
2. 中间件的执行规则
按照代码的书写顺序从上到下依次执行
可以全局注册（对所有接口生效）、路由注册（对指定接口生效）
可以处理「请求到来 → 接口响应 → 响应结束」的全生命周期

二、✅ 第一类：Express 内置中间件（无需额外安装，原生自带，必用！）
这类是 Express 官方内置的中间件，不用 npm 安装，直接require('express')调用，零依赖，是所有项目的基础必备，你的项目里已经用到了部分，补全即可。

1. express.json() - 解析 JSON 格式的请求体
✅ 作用
解析前端传来的 JSON格式 请求体数据（如 axios.post 传的{name:"xxx",age:18}），解析后挂载到 req.body 上，否则 req.body 为 undefined。
✅ 使用场景
所有前后端分离的项目必配，99% 的接口都会用到（你的新增用户、创建订单接口全靠它）
✅ 用法（全局注册，写在 app.js 最顶部）
javascript
运行
const express = require('express');
const app = express();
// ✅ 核心内置中间件 - 解析JSON请求体
app.use(express.json());

3. express.urlencoded({ extended: true }) - 解析表单格式的请求体
✅ 作用
解析前端 form 表单提交 / x-www-form-urlencoded 格式的请求体数据，解析后同样挂载到 req.body 上。
extended: true：支持解析嵌套对象格式的表单数据（推荐）
extended: false：仅支持解析普通键值对
✅ 使用场景
兼容前端表单提交、第三方回调通知等场景，和express.json()一起用，全覆盖所有请求体格式。
✅ 用法（和 json 一起注册）
javascript
运行
// ✅ 两个一起写，解析所有格式的请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
4. express.static() - 托管静态资源
✅ 作用
将项目中的静态文件（图片、视频、css、js、pdf 等）对外开放访问，无需写接口就能直接访问文件。
✅ 使用场景
项目中需要展示图片、下载文件、前端静态页面访问等，生产项目必配。
✅ 用法
javascript
运行
// 托管根目录下的public文件夹，访问地址：http://localhost:3000/图片名.png
app.use(express.static(__dirname + '/public'));

// 给静态资源加访问前缀，访问地址：http://localhost:3000/static/图片名.png
app.use('/static', express.static(__dirname + '/public'));
4. express.Router() - 路由中间件（重点）
✅ 作用
路由解耦核心，把项目的所有接口按业务模块拆分（用户模块、订单模块、商品模块），避免所有路由都写在 app.js 里导致代码臃肿，你的项目里已经用到了，是大型项目的必配。
✅ 用法（你的项目标准结构）
javascript
运行
// router/index.js 路由拆分
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userOrder.controller');
// 挂载业务接口
router.post('/create-user-order', userController.createUserAndOrder);
router.get('/user/:userId/orders', userController.getUserWithOrders);
module.exports = router;

// app.js 中注册路由中间件
const router = require('./router/index');
app.use('/api', router); // 所有接口统一加/api前缀

三、✅ 第二类：第三方中间件（npm 安装，高频必用，生产级项目标配）
这类是社区生态最成熟的第三方中间件，需要 npm 安装后使用，是 Express 项目的核心组成部分，你的 Express+Sequelize 项目必须配置，按「重要程度排序」，从必备到常用依次讲解，所有依赖直接复制安装。
✅ 必装核心（5 个，重中之重，无脑装）
1. cors - 解决跨域问题 【⭐⭐⭐必装，无它项目跑不起来】
✅ 问题背景
前端项目（Vue/React）和后端 Express 服务，只要域名 / 端口不同，就会触发浏览器的跨域拦截，接口请求直接失败，这是前端开发的通病。
✅ 作用
快速解决所有跨域问题，支持自定义跨域规则、允许指定域名访问、允许携带 Cookie 等。
✅ 安装
bash
运行
npm install cors --save
✅ 用法（全局注册，写在最顶部，推荐）
javascript
运行
const cors = require('cors');
app.use(cors()); // 允许所有域名跨域访问，开发/生产都能用

// 进阶：配置指定域名跨域（生产环境推荐，更安全）
app.use(cors({
  origin: ['http://localhost:8080', 'https://你的前端域名.com'], // 允许的前端域名
  credentials: true, // 允许前端携带Cookie
  methods: ['GET', 'POST', 'PUT', 'DELETE'] // 允许的请求方式
}));
2. morgan - 接口请求日志 【⭐⭐⭐必装，调试 + 排错神器】
✅ 作用
自动打印所有接口的请求日志，包含：请求方式、请求地址、状态码、响应时间、请求 IP 等，开发时能快速调试接口，生产时能排查接口报错问题，线上项目排错必备。
✅ 安装
bash
运行
npm install morgan --save
✅ 用法（全局注册）
javascript
运行
const morgan = require('morgan');
// 开发环境用 'dev' 格式，简洁清晰；生产环境用 'combined' 格式，日志更完整
app.use(morgan('dev')); 
✅ 日志效果（控制台打印）
plaintext
GET /api/user/1/orders 200 3.567 ms - 200
POST /api/create-user-order 200 5.123 ms - 300
3. helmet - 接口安全防护 【⭐⭐⭐必装，生产环境刚需】
✅ 作用
Express 原生的 HTTP 响应头缺少安全相关配置，容易被 XSS、CSRF 等攻击，helmet 会自动设置几十种安全相关的 HTTP 响应头，大幅提升接口的安全性，一行代码接入，零成本防护。
✅ 安装
bash
运行
npm install helmet --save
✅ 用法（全局注册，一行搞定）
javascript
运行
const helmet = require('helmet');
app.use(helmet()); // 开启所有安全防护
4. express-jwt + jsonwebtoken - 用户身份认证 【⭐⭐⭐必装，登录鉴权核心】
✅ 作用
做 JWT 登录鉴权，是前后端分离项目的标准身份认证方案：
jsonwebtoken：生成 token（用户登录成功后，给前端返回一个 token）
express-jwt：解析 token（拦截所有需要登录的接口，校验 token 是否有效，无效则拒绝访问）
✅ 你的项目场景适配
你的用户 / 订单接口，肯定需要「登录后才能访问」，比如查询自己的订单、删除自己的账号，这个中间件是刚需。
✅ 安装
bash
运行
npm install express-jwt jsonwebtoken --save
✅ 完整用法（重点，可直接复制到你的项目）
javascript
运行
const jwt = require('jsonwebtoken');
const { expressjwt: expressJWT } = require('express-jwt'); // 新版express-jwt写法
// 密钥：自定义，越长越安全，生产环境存在环境变量里
const secretKey = 'your-project-secret-key-2026';

// 1. 生成token（登录接口中使用，写在你的user.service.js/controller.js）
const token = jwt.sign({ userId: 1, username: 'admin' }, secretKey, { expiresIn: '2h' });

// 2. 全局注册JWT中间件，校验token（写在app.js）
// 配置：unless({path:[]}) 里面是「不需要登录就能访问」的接口，比如登录、注册、静态资源
app.use(expressJWT({
  secret: secretKey,
  algorithms: ['HS256'] // 必填，指定加密算法
}).unless({
  path: [/^\/api\/login/, /^\/api\/register/, /^\/static/] 
}));

// 3. JWT校验失败的错误处理中间件（token过期/无效时触发）
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ code: 401, msg: 'token过期或无效，请重新登录' });
  }
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
});
5. multer - 文件上传 【⭐⭐⭐必装，项目必会用到】
✅ 作用
Express 原生不支持文件上传，multer 是 Express 生态中唯一的文件上传中间件，支持单文件、多文件上传，支持自定义上传路径、文件大小限制、文件格式过滤，能上传图片、视频、Excel 等所有文件类型。
✅ 安装
bash
运行
npm install multer --save
✅ 用法（示例：用户头像上传）
javascript
运行
const multer = require('multer');
// 配置上传路径和文件名
const upload = multer({ dest: __dirname + '/public/avatar/' });

// 单文件上传：upload.single('avatar') 中的avatar是前端传的文件字段名
router.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  // req.file 是上传的文件信息
  res.json({ code:200, msg:'上传成功', data: req.file });
});
// 多文件上传
router.post('/api/upload-files', upload.array('files', 5), (req, res) => {
  res.json({ code:200, msg:'上传成功', data: req.files });
});
✅ 高频常用（4 个，按需安装，解决特定需求）
1. compression - 接口响应数据压缩 【推荐装，提升接口速度】
✅ 作用
自动将接口返回的 JSON、HTML 等数据Gzip 压缩，压缩后数据体积会减小 60%-80%，大幅提升接口响应速度，尤其适合返回大量数据的接口（比如你的订单列表查询），一行代码接入，无侵入。
✅ 安装 + 用法
bash
运行
npm install compression --save
javascript
运行
const compression = require('compression');
app.use(compression()); // 全局注册，所有接口自动压缩
2. express-validator - 请求参数校验 【推荐装，后端数据校验核心】
✅ 作用
前端的参数校验不可信，后端必须做二次校验！这个中间件可以优雅的校验请求参数（必填项、手机号格式、邮箱格式、长度限制等），校验失败则直接返回错误信息，替代手写的大量 if 判断，让代码更简洁。
✅ 你的项目场景适配
比如创建用户时，校验手机号是否为 11 位、用户名是否为空，创建订单时校验金额是否大于 0，完美适配。
✅ 安装 + 用法
bash
运行
npm install express-validator --save
javascript
运行
const { body, validationResult } = require('express-validator');
// 1. 配置校验规则
router.post('/api/create-user', [
  body('username').notEmpty().withMessage('用户名不能为空'),
  body('phone').isMobilePhone('zh-CN').withMessage('手机号格式错误')
], (req, res) => {
  // 2. 捕获校验错误
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ code:400, msg: errors.array()[0].msg });
  }
  // 校验通过，执行业务逻辑
  res.json({ code:200, msg:'创建成功' });
});
3. cookie-parser - 解析 Cookie
✅ 作用
解析前端传来的 Cookie 数据，解析后挂载到 req.cookies 上，如果你项目中用 Cookie 做认证 / 存储少量数据，就需要安装。
✅ 安装 + 用法
bash
运行
npm install cookie-parser --save
javascript
运行
const cookieParser = require('cookie-parser');
app.use(cookieParser()); // 解析普通Cookie
// 带签名的Cookie解析
app.use(cookieParser('your-secret-key'));
4. express-session - 会话管理
✅ 作用
基于服务端的会话管理，适合传统的服务端渲染项目，如果你是前后端分离项目，优先用 JWT，这个中间件可以不用装。
四、✅ 第三类：自定义中间件（手写，项目必写，最灵活，核心业务适配）
自定义中间件是 Express 最强大的特性，指的是自己手写一个中间件函数，解决项目中「个性化的业务需求」，没有任何依赖，完全贴合自己的业务逻辑，你的 Express+Sequelize 项目一定会用到，也是面试高频考点，分 3 类常用场景，全部带完整代码示例。
✅ 自定义中间件的基础格式
javascript
运行
// 格式1：普通全局中间件
const customMiddleware = (req, res, next) => {
  // 业务逻辑处理
  console.log('自定义中间件执行了');
  next(); // 必须调用next()，否则请求会被挂起
};
app.use(customMiddleware); // 全局注册

// 格式2：路由级中间件（只对指定路由生效）
router.use('/user', (req, res, next) => {
  console.log('只对/user开头的接口生效');
  next();
});
✔️ 场景 1：全局响应格式统一中间件（⭐⭐⭐必写，你的项目刚需）
✅ 痛点
你的 Controller 里每个接口都要写 ctx.body = {code:200, msg:'xxx', data:{}}，重复代码多，格式不统一，前端解析麻烦。
✅ 作用
给 res 对象挂载一个统一的响应方法，所有接口直接调用，返回格式完全一致，前端解析无压力。
✅ 完整代码（写在 app.js 最顶部）
javascript
运行
// 自定义统一响应中间件
app.use((req, res, next) => {
  // 成功响应
  res.success = (data = {}, msg = '操作成功') => {
    res.json({ code: 200, msg, data });
  };
  // 失败响应
  res.fail = (msg = '操作失败', code = 500) => {
    res.json({ code, msg });
  };
  next();
});

// Controller中使用（极简，无重复代码）
async getUserWithOrders(ctx) {
  const { userId } = ctx.params;
  const result = await userOrderService.getUserWithOrders(userId);
  ctx.success(result, '查询成功'); // 成功调用
  // ctx.fail('用户不存在', 400); // 失败调用
}
✔️ 场景 2：数据库异常捕获中间件（⭐⭐⭐必写，你的 Sequelize 项目刚需）
✅ 痛点
你的 Service 层操作数据库时，如果出现 SQL 错误、Sequelize 异常，会直接抛出错误导致服务崩溃，前端看到 500 错误，不知道具体原因。
✅ 作用
全局捕获所有数据库异常和业务异常，统一返回错误信息，服务不会崩溃，方便排查问题。
✅ 完整代码
javascript
运行
// 写在所有路由之后，app.js最后面
app.use(async (err, req, res, next) => {
  console.error('服务器异常：', err); // 打印错误日志，方便排查
  // Sequelize数据库异常
  if (err.name === 'SequelizeError') {
    return res.fail('数据库操作失败，请联系管理员', 500);
  }
  // 业务自定义异常
  if (err.message) {
    return res.fail(err.message, 400);
  }
  // 未知异常
  res.fail('服务器内部错误，请稍后重试', 500);
});
✔️ 场景 3：接口访问频率限制中间件（防刷接口）
✅ 作用
限制同一个 IP 在指定时间内的接口请求次数，防止恶意刷接口，保护服务器安全，比如限制「1 分钟内最多请求 60 次」。
✅ 完整代码
javascript
运行
const visitLimit = new Map(); // 存储IP和请求次数
app.use((req, res, next) => {
  const ip = req.ip; // 获取请求IP
  const now = Date.now();
  const limitTime = 60 * 1000; // 1分钟
  const limitCount = 60; // 最多60次
  if (visitLimit.has(ip)) {
    const { count, time } = visitLimit.get(ip);
    if (now - time < limitTime && count >= limitCount) {
      return res.fail('请求过于频繁，请稍后重试', 429);
    } else if (now - time < limitTime) {
      visitLimit.set(ip, { count: count + 1, time });
    } else {
      visitLimit.set(ip, { count: 1, time: now });
    }
  } else {
    visitLimit.set(ip, { count: 1, time: now });
  }
  next();
});
五、✅ 第四类：错误处理中间件（Express 内置，必写）
这是 Express 提供的专属错误处理中间件，和普通中间件的区别是：它有 4 个参数 (err, req, res, next)，专门用来捕获项目中所有的同步 / 异步错误，所有项目必须写，放在 app.js 的最后一行。
✅ 完整用法（最终版，结合你的项目）
javascript
运行
// 错误处理中间件（4个参数缺一不可）
app.use((err, req, res, next) => {
  console.error('【全局错误捕获】', err.stack);
  const status = err.status || 500;
  const msg = err.message || '服务器内部错误';
  res.status(status).json({
    code: status,
    msg,
    // 开发环境返回错误堆栈，生产环境隐藏
    stack: process.env.NODE_ENV === 'development' ? err.stack : ''
  });
});
六、✅ 你的项目「app.js 最终完整版」（所有中间件按规范整合，无缝接入）
结合你之前的项目结构（数据库初始化 + Sequelize + 路由），我把所有必装、必写的中间件按「最佳执行顺序」整合完毕，你可以直接复制替换你的 app.js，这就是生产级 Express 项目的标准配置，无冗余、无遗漏：
javascript
运行
const express = require('express');
const app = express();
const router = require('./router/index');
const initDB = require('./db/init-db');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const { expressjwt: expressJWT } = require('express-jwt');
const port = 3000;

// ====================== 第一步：全局基础中间件（顺序从上到下） ======================
app.use(cors()); // 跨域
app.use(helmet()); // 安全防护
app.use(compression()); // 数据压缩
app.use(morgan('dev')); // 请求日志
app.use(express.json()); // 解析JSON请求体
app.use(express.urlencoded({ extended: true })); // 解析表单请求体
app.use(express.static(__dirname + '/public')); // 静态资源托管

// ====================== 第二步：自定义中间件 ======================
// 统一响应格式
app.use((req, res, next) => {
  res.success = (data = {}, msg = '操作成功') => res.json({ code:200, msg, data });
  res.fail = (msg = '操作失败', code = 500) => res.json({ code, msg });
  next();
});

// ====================== 第三步：JWT鉴权中间件 ======================
const secretKey = 'your-project-secret-key';
app.use(expressJWT({ secret: secretKey, algorithms: ['HS256'] }).unless({
  path: [/^\/api\/login/, /^\/api\/register/]
}));

// ====================== 第四步：数据库初始化 + 路由挂载 ======================
(async () => {
  await initDB(); // 初始化数据库
  app.use('/api', router); // 挂载业务路由

  // ====================== 第五步：错误处理中间件（最后一行） ======================
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.name === 'UnauthorizedError') return res.fail('token无效/过期', 401);
    res.fail(err.message || '服务器内部错误', err.status || 500);
  });

  // 启动服务
  app.listen(port, () => {
    console.log(`✅ Express服务启动成功，端口：${port}，生产级配置完成`);
  });
})();

七、✅ 中间件核心总结（必记，避免踩坑）
1. 中间件的执行顺序原则
全局中间件 → 路由级中间件 → 接口回调函数 → 错误处理中间件，按代码书写顺序执行，跨域、解析请求体的中间件一定要写在最前面。
2. 必装中间件清单（无争议，所有项目标配）
cors + morgan + helmet + express.json + express.urlencoded
3. 必写中间件清单
统一响应格式中间件 + 错误处理中间件
4. 按需安装清单
JWT 鉴权 (express-jwt) + 文件上传 (multer) + 参数校验 (express-validator) + 压缩 (compression)
最后
本次整理的所有中间件，都是 Express 开发中 99% 的项目都会用到的核心内容，完全贴合你的 Express+Sequelize+逻辑外键 生产级项目，所有代码都能直接复制使用，没有任何冗余内容。掌握这些中间件，你的项目会变得更健壮、更安全、更易维护，也是 Express 进阶的核心知识点。
希望这份内容能帮你彻底搞定 Express 中间件，开发顺利～ 🚀






聊聊新话题

