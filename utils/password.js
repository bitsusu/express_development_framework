const bcrypt = require('bcryptjs');

// 加密密码
function encryptPassword(password) {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

// 验证密码
function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { encryptPassword, verifyPassword };
