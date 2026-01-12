-- ==============================================================================
-- 数据库初始化脚本 - 01_create_db.sql (MySQL8.0 专用，生产环境增强版，推荐)
-- MySQL8.0 注意事项：密码策略必须符合要求、缓存_sha2_password认证方式、赋权语法变更
-- 幂等性保障 + 建库 + 创建业务账号 + 精准赋权 + 编码规范
-- ==============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===================== 1. 创建业务数据库（核心，必加 IF NOT EXISTS）=====================
CREATE DATABASE IF NOT EXISTS `your_business_db`
DEFAULT CHARACTER SET = utf8mb4
DEFAULT COLLATE = utf8mb4_unicode_ci;

-- ===================== 2. 创建业务专用数据库账号（MySQL8.0 专用语法，无则创建）=====================
-- 账号说明：生产环境禁止用root，创建业务账号 your_business_user，仅能操作当前业务库
-- 密码：建议替换为你的生产环境复杂密码，MySQL8.0要求密码至少8位，包含大小写+数字+特殊字符
CREATE USER IF NOT EXISTS `your_business_user`@'%' IDENTIFIED BY 'Your@DbPwd_2026';

-- ===================== 3. 账号赋权【最小权限原则，企业级强制】=====================
-- 仅授予 当前业务库 的增删改查+建表+索引权限，不授予删库/删表等高风险权限
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP VIEW ON `your_business_db`.* TO `your_business_user`@'%';

-- 刷新权限，立即生效（MySQL8.0 必须执行）
FLUSH PRIVILEGES;

-- ===================== 4. 切换到业务库，供后续建表脚本执行 =====================
USE `your_business_db`;

SET FOREIGN_KEY_CHECKS = 1;

-- 执行成功提示
SELECT '✅ 1.数据库创建成功 2.业务账号创建成功 3.权限配置完成' AS init_db_result;
