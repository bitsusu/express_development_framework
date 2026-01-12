const { sequelize } = require('./config/db');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

async function createAdminUser() {
  try {
    console.log('🔍 查询admin用户...');

    const adminUser = await User.findOne({
      where: { user_name: 'admin' }
    });

    if (adminUser) {
      console.log('✅ admin用户已存在');
      console.log('   用户ID:', adminUser.user_id);
      console.log('   用户状态:', adminUser.user_status);
      console.log('   邮箱:', adminUser.user_email);

      if (adminUser.user_status === '0') {
        console.log('⚠️  admin用户已被禁用，正在启用...');
        await adminUser.update({ user_status: '1' });
        console.log('✅ admin用户已启用');
      }
    } else {
      console.log('❌ admin用户不存在，正在创建...');

      const hashedPassword = await bcrypt.hash('admin123', 10);

      const newUser = await User.create({
        user_name: 'admin',
        user_password: hashedPassword,
        user_fullname: '系统管理员',
        user_email: 'admin@cfc-app.com',
        user_phone: '13800138000',
        user_status: '1',
        role_id: 1
      });

      console.log('✅ admin用户创建成功');
      console.log('   用户ID:', newUser.user_id);
      console.log('   用户状态:', newUser.user_status);
    }
  } catch (error) {
    console.error('❌ 创建/查询admin用户失败:', error.message);
  }
}

async function testLogin() {
  try {
    console.log('\n🔐 测试admin登录...');

    const response = await fetch('http://localhost:3000/api/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_name: 'admin',
        user_password: 'admin123'
      })
    });

    const data = await response.json();

    if (data.code === 200) {
      console.log('✅ 登录成功');
      console.log('   Token:', data.data.token.substring(0, 20) + '...');
      return data.data.token;
    } else {
      console.log('❌ 登录失败:', data.message);
      return null;
    }
  } catch (error) {
    console.error('❌ 登录测试异常:', error.message);
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('🚀 开始admin用户测试');
  console.log('========================================');

  await createAdminUser();

  const token = await testLogin();
  if (!token) {
    console.log('\n❌ 登录测试失败，终止');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('✅ admin用户测试完成');
  console.log('   用户名: admin');
  console.log('   密码: admin123');
  console.log('   Token:', token.substring(0, 20) + '...');
  console.log('========================================\n');
}

main();
