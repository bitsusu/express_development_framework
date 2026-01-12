// 函数式导出，移除内部 db 引入，规范语法
module.exports = (sequelize, DataTypes) => {
  const bcrypt = require('bcryptjs'); // 移到函数内，避免全局引入

  const User = sequelize.define('user', {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '用户ID'
    },
    user_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '用户名'
    },
    user_password: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '密码（加密）',
      set(value) {
        const salt = bcrypt.genSaltSync(10);
        this.setDataValue('user_password', bcrypt.hashSync(value, salt));
      }
    },
    user_fullname: {
      type: DataTypes.STRING(50),
      comment: '用户全名'
    },
    user_email: {
      type: DataTypes.STRING(100),
      unique: true,
      comment: '用户邮箱'
    },
    user_phone: {
      type: DataTypes.STRING(20),
      unique: true,
      comment: '用户手机号'
    },
    user_status: {
    type: DataTypes.ENUM('0', '1'), // 限制只能是 '0' 或 '1'（字符串形式，也可写数字 0/1）
    allowNull: false,
    defaultValue: '1', // 默认启用（1）
    comment: '用户状态：1-启用，0-禁用',
    // 可选：模型层额外验证（双重保障）
    validate: {
      isIn: [['0', '1']] // 确保值只能是 0 或 1
    }
  }
    // 移除手动定义的 create_time/update_time → 自动生成
  }, {
    tableName: 'user',
    timestamps: true,
    createdAt: 'create_time',
    updatedAt: 'update_time',
    // 禁止查询密码字段
    defaultScope: {
      attributes: { exclude: ['user_password'] }
    }
  });

  // 密码验证方法（保留）
  User.prototype.validatePassword = function(password) {
    return bcrypt.compareSync(password, this.getDataValue('user_password')); // 改用 getDataValue 更安全
  };

  return User;
};
