# AIMS Frontend 배포

## 방법 1: 스크립트 자동 배포 (권장)

```bash
ssh tars.giize.com
cd ~/aims/frontend/aims-uix3
./deploy_aims_frontend.sh
```

**자동 처리:**
- git pull (최신 코드)
- npm install (package.json 변경시)
- npm run build (프로덕션 빌드)
- nginx 설정 업데이트

## 방법 2: 수동 빌드 및 배포

```bash
ssh tars.giize.com
cd ~/aims/frontend/aims-uix3

# 1. 최신 코드 가져오기
git pull

# 2. 의존성 설치 (package.json 변경시만)
npm install

# 3. 프로덕션 빌드
npm run build
```

## 배포 확인

브라우저: **Ctrl+Shift+R** (하드 리프레시 필수)
- https://aims.giize.com
- Console 에러 확인

## 문제 해결

**변경사항 안 보임**: Ctrl+Shift+R

**빌드 에러**:
```bash
rm -rf node_modules && npm install
```

**롤백**:
```bash
git log --oneline -5
git reset --hard <commit-hash>
npm run build
```
