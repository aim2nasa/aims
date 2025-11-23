/**
 * JWT 인증 미들웨어
 */

const jwt = require('jsonwebtoken');

/**
 * JWT 토큰 생성
 */
function generateToken(user) {
  // 설계안: JWT에는 _id, name, role만 포함 (소셜 ID 노출 금지)
  // user.id 또는 user._id 둘 다 지원
  const userId = user.id || user._id;
  const userIdString = userId && userId.toString ? userId.toString() : userId;

  const payload = {
    id: userIdString,
    name: user.name,
    role: user.role || 'user'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

/**
 * JWT 토큰 검증 미들웨어
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    req.user = decoded;
    next();
  });
}

/**
 * 선택적 JWT 인증 미들웨어
 */
function optionalAuthJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (!err) {
      req.user = decoded;
    }
    next();
  });
}

/**
 * 역할 기반 접근 제어
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
}

module.exports = {
  generateToken,
  authenticateJWT,
  optionalAuthJWT,
  requireRole
};
