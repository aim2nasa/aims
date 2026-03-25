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
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });
}

/**
 * JWT 토큰 검증 미들웨어
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const testUserId = req.headers['x-user-id'];

  // 테스트 환경: x-user-id 헤더만으로 인증 허용 (JWT 없이)
  // NODE_ENV=test 또는 ALLOW_TEST_AUTH=true일 때만 활성화
  if (!authHeader && testUserId && (process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_AUTH === 'true')) {
    console.log(`[TEST AUTH] x-user-id 인증: ${testUserId}`);
    req.user = { id: testUserId, name: 'Test User', role: 'user' };
    return next();
  }

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

    // JWT 토큰이 유일한 사용자 ID 소스 (x-user-id 오버라이드 제거됨)
    // 이유: dev에서 localStorage에 이전 세션의 stale userId가 남아있으면
    // JWT 사용자와 다른 ownerId로 데이터가 저장되는 심각한 버그 발생

    next();
  });
}

/**
 * JWT 토큰 검증 미들웨어 (쿼리 파라미터 지원)
 * 파일 다운로드 등 <img src="...">나 <a href="...">로 접근하는 경우
 * Authorization 헤더 대신 ?token=xxx 쿼리 파라미터로 인증 가능
 */
function authenticateJWTWithQuery(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  // Authorization 헤더 또는 쿼리 파라미터에서 토큰 추출
  let token = null;
  if (authHeader) {
    token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

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

/**
 * API Key 인증 미들웨어
 * n8n 웹훅 등 서버간 통신용
 */
function authenticateAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'No API key provided'
    });
  }

  if (apiKey !== (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) && apiKey !== process.env.N8N_API_KEY) {
    return res.status(403).json({
      success: false,
      message: 'Invalid API key'
    });
  }

  // API Key 인증 성공 시 시스템 사용자로 설정
  // n8n이 보내는 요청의 userId는 body에서 받음
  // GET 요청 시 req.body가 undefined일 수 있으므로 optional chaining 사용
  req.user = {
    id: req.body?.userId || req.query.userId || req.headers['x-user-id'],
    role: 'system',
    authMethod: 'apiKey'
  };

  next();
}

/**
 * JWT 또는 API Key 인증 미들웨어
 * JWT 토큰이나 API Key 중 하나만 있으면 인증 성공
 */
function authenticateJWTorAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  const testUserId = req.headers['x-user-id'];

  // 테스트 환경: x-user-id 헤더만으로 인증 허용 (JWT 없이)
  // NODE_ENV=test 또는 ALLOW_TEST_AUTH=true일 때만 활성화
  if (!authHeader && !apiKey && testUserId && (process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_AUTH === 'true')) {
    console.log(`[TEST AUTH] x-user-id 인증: ${testUserId}`);
    req.user = { id: testUserId, name: 'Test User', role: 'user' };
    return next();
  }

  // API Key 우선 확인
  if (apiKey) {
    if (apiKey === (process.env.INTERNAL_WEBHOOK_API_KEY || process.env.N8N_WEBHOOK_API_KEY) || apiKey === process.env.N8N_API_KEY) {
      // userId를 body, query, 또는 x-user-id 헤더에서 가져옴
      // GET 요청 시 req.body가 undefined일 수 있으므로 optional chaining 사용
      const userId = req.body?.userId || req.query.userId || req.headers['x-user-id'];
      req.user = {
        id: userId,
        role: 'system',
        authMethod: 'apiKey'
      };
      return next();
    } else {
      return res.status(403).json({
        success: false,
        message: 'Invalid API key'
      });
    }
  }

  // API Key 없으면 JWT 확인
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'No authentication provided (JWT or API Key required)'
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

    req.user = {
      ...decoded,
      authMethod: 'jwt'
    };

    // JWT 토큰이 유일한 사용자 ID 소스 (x-user-id 오버라이드 제거됨)

    next();
  });
}

module.exports = {
  generateToken,
  authenticateJWT,
  authenticateJWTWithQuery,
  optionalAuthJWT,
  requireRole,
  authenticateAPIKey,
  authenticateJWTorAPIKey
};
