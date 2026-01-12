/**
 * 用户模块路由配置（遵循RESTful规范 + OpenAPI 3.0 Swagger注释）
 * 核心优化点：
 * 1. 补充所有核心业务路由（忘记密码/重置密码/修改密码/修改信息/禁用/删除）
 * 2. 完善Swagger注释：定义JWT认证、完整参数/响应结构、权限说明
 * 3. 严格遵循RESTful：GET(查)/POST(增)/PUT(改)/DELETE(删)
 * 4. 精准配置中间件：区分公开/登录/管理员接口的权限
 * 5. 统一响应结构：所有接口返回 {code, message, data} 标准化格式
 * 6. 补充参数约束：路径/查询参数的类型、默认值、校验规则
 */
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth'); // JWT登录认证
const rbacMiddleware = require('../middleware/rbac'); // 角色权限控制

// ===================== Swagger 全局配置（JWT认证） =====================
/**
 * @swagger
 * components:
 *   securitySchemes:
 *     jwtAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: "登录后获取的Token，格式：Bearer {token}"
 *   schemas:
 *     ResponseSuccess:
 *       type: object
 *       properties:
 *         code:
 *           type: integer
 *           example: 200
 *         message:
 *           type: string
 *           example: 操作成功
 *         data:
 *           type: object
 *           description: 业务数据
 *     ResponseError:
 *       type: object
 *       properties:
 *         code:
 *           type: integer
 *           example: 400
 *         message:
 *           type: string
 *           example: 操作失败
 *         data:
 *           type: object
 *           nullable: true
 *     UserRegister:
 *       type: object
 *       required: [user_name, user_password, user_email]
 *       properties:
 *         user_name:
 *           type: string
 *           description: 用户名（唯一）
 *           example: test_user
 *         user_password:
 *           type: string
 *           description: 密码（长度≥6）
 *           example: 12345678
 *         user_fullname:
 *           type: string
 *           description: 真实姓名
 *           example: 测试用户
 *         user_email:
 *           type: string
 *           format: email
 *           description: 邮箱（唯一）
 *           example: test@cfc-app.com
 *         user_phone:
 *           type: string
 *           description: 手机号（选填）
 *           example: 13800138000
 *     UserLogin:
 *       type: object
 *       required: [user_name, user_password]
 *       properties:
 *         user_name:
 *           type: string
 *           description: 用户名/邮箱
 *           example: test_user
 *         user_password:
 *           type: string
 *           description: 密码
 *           example: 12345678
 *     UserLoginResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/ResponseSuccess'
 *         - properties:
 *             data:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT令牌
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: integer
 *                       example: 1
 *                     user_name:
 *                       type: string
 *                       example: test_user
 *                     user_email:
 *                       type: string
 *                       format: email
 *                       example: test****@cfc-app.com
 *                     user_phone:
 *                       type: string
 *                       example: 138****8000
 *     UserListQuery:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           description: 页码（默认1）
 *           example: 1
 *           default: 1
 *         pageSize:
 *           type: integer
 *           description: 每页条数（默认10）
 *           example: 10
 *           default: 10
 *         keyword:
 *           type: string
 *           description: 搜索关键词（用户名/姓名/邮箱）
 *           example: 测试
 *     UserListResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/ResponseSuccess'
 *         - properties:
 *             data:
 *               type: object
 *               properties:
 *                 list:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: integer
 *                         example: 1
 *                       user_name:
 *                         type: string
 *                         example: test_user
 *                       user_fullname:
 *                         type: string
 *                         example: 测试用户
 *                       user_email:
 *                         type: string
 *                         format: email
 *                         example: test****@cfc-app.com
 *                       user_status:
 *                         type: integer
 *                         description: 1-启用 0-禁用
 *                         example: 1
 *                 total:
 *                   type: integer
 *                   description: 总条数
 *                   example: 50
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 pageSize:
 *                   type: integer
 *                   example: 10
 */

// ===================== 公开接口（无需登录） =====================
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: 用户注册
 *     tags: [用户模块]
 *     security: [] # 无需JWT认证
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserRegister'
 *     responses:
 *       201:
 *         description: 注册成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       400:
 *         description: 注册失败（用户名/邮箱已存在、参数缺失/格式错误）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.post('/register', userController.register);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: 用户登录
 *     tags: [用户模块]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLogin'
 *     responses:
 *       200:
 *         description: 登录成功（返回Token）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserLoginResponse'
 *       400:
 *         description: 参数缺失
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       401:
 *         description: 用户名/密码错误、账号已禁用
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.post('/login', userController.login);

/**
 * @swagger
 * /api/users/forget-password:
 *   post:
 *     summary: 忘记密码（发送验证码到邮箱）
 *     tags: [用户模块]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_email]
 *             properties:
 *               user_email:
 *                 type: string
 *                 format: email
 *                 description: 注册邮箱
 *                 example: test@cfc-app.com
 *     responses:
 *       200:
 *         description: 验证码发送成功（无论邮箱是否注册，统一提示）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       400:
 *         description: 邮箱格式错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.post('/forget-password', userController.forgetPassword);

/**
 * @swagger
 * /api/users/reset-password:
 *   post:
 *     summary: 重置密码（验证验证码）
 *     tags: [用户模块]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_email, verifyCode, newPassword]
 *             properties:
 *               user_email:
 *                 type: string
 *                 format: email
 *                 example: test@cfc-app.com
 *               verifyCode:
 *                 type: string
 *                 description: 6位数字验证码
 *                 example: 886699
 *               newPassword:
 *                 type: string
 *                 description: 新密码（长度≥6）
 *                 example: 87654321
 *     responses:
 *       200:
 *         description: 密码重置成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       400:
 *         description: 参数错误/验证码过期/错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.post('/reset-password', userController.resetPassword);

// ===================== 需登录接口（个人操作） =====================
/**
 * @swagger
 * /api/users/change-password:
 *   post:
 *     summary: 修改密码（验证旧密码）
 *     tags: [用户模块]
 *     security:
 *       - jwtAuth: [] # 需要JWT认证
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 description: 旧密码
 *                 example: 12345678
 *               newPassword:
 *                 type: string
 *                 description: 新密码（长度≥6，不能与旧密码相同）
 *                 example: 87654321
 *     responses:
 *       200:
 *         description: 密码修改成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       400:
 *         description: 参数错误/旧密码错误/新密码与旧密码相同
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       401:
 *         description: 未登录/Token过期
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.post('/change-password', authMiddleware, userController.changePassword);

// ===================== 管理员接口（需登录+RBAC权限） =====================
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 获取用户列表（分页+筛选）
 *     tags: [用户模块]
 *     security:
 *       - jwtAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           $ref: '#/components/schemas/UserListQuery/properties/page'
 *       - in: query
 *         name: pageSize
 *         schema:
 *           $ref: '#/components/schemas/UserListQuery/properties/pageSize'
 *       - in: query
 *         name: keyword
 *         schema:
 *           $ref: '#/components/schemas/UserListQuery/properties/keyword'
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserListResponse'
 *       401:
 *         description: 未登录/Token过期
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       403:
 *         description: 无用户列表查看权限
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.get('/', authMiddleware, rbacMiddleware('user:list'), userController.getUserList);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: 根据ID获取用户详情
 *     tags: [用户模块]
 *     security:
 *       - jwtAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           description: 用户ID
 *           example: 1
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       401:
 *         description: 未登录/Token过期
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       403:
 *         description: 无用户详情查看权限
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.get('/:id', authMiddleware, rbacMiddleware('user:detail'), userController.getUserById);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: 修改用户基本信息（不含密码）
 *     tags: [用户模块]
 *     security:
 *       - jwtAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_fullname:
 *                 type: string
 *                 example: 测试用户_修改
 *               user_email:
 *                 type: string
 *                 format: email
 *                 example: test_update@cfc-app.com
 *               user_phone:
 *                 type: string
 *                 example: 13900139000
 *     responses:
 *       200:
 *         description: 修改成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       400:
 *         description: 参数错误（如邮箱格式）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       401:
 *         description: 未登录/Token过期
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       403:
 *         description: 无用户修改权限
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.put('/:id', authMiddleware, rbacMiddleware('user:update'), userController.updateUserInfo);

/**
 * @swagger
 * /api/users/{id}/status:
 *   put:
 *     summary: 禁用/启用用户
 *     tags: [用户模块]
 *     security:
 *       - jwtAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, operator]
 *             properties:
 *               status:
 *                 type: integer
 *                 description: 1-启用 0-禁用
 *                 example: 0
 *               operator:
 *                 type: string
 *                 description: 操作人（管理员账号）
 *                 example: admin
 *     responses:
 *       200:
 *         description: 操作成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       400:
 *         description: 参数错误（状态值非法/操作人缺失）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       401:
 *         description: 未登录/Token过期
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       403:
 *         description: 无用户状态修改权限
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.put('/:id/status', authMiddleware, rbacMiddleware('user:status'), userController.toggleUserStatus);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: 软删除用户
 *     tags: [用户模块]
 *     security:
 *       - jwtAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operator]
 *             properties:
 *               operator:
 *                 type: string
 *                 description: 操作人（管理员账号）
 *                 example: admin
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseSuccess'
 *       401:
 *         description: 未登录/Token过期
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       403:
 *         description: 无用户删除权限
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResponseError'
 */
router.delete('/:id', authMiddleware, rbacMiddleware('user:delete'), userController.deleteUser);

module.exports = router;
