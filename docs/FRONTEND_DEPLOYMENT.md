# AIMS Frontend 배포 가이드

AIMS UIX3 프론트엔드를 프로덕션(https://aims.giize.com)에 배포하는 방법입니다.

---

## 방법 1: 자동 배포 (권장)

### 1. 로컬에서 빌드

```bash
cd D:\aims\frontend\aims-uix3
npm run build
```

### 2. tars 서버에서 배포

```bash
ssh tars.giize.com
cd ~/aims/frontend/aims-uix3

# 배포 스크립트 실행
./deploy_aims_frontend.sh
```

**배포 스크립트가 하는 일:**
- `/tmp/aims-dist` → `/var/www/aims`로 복사
- 권한 설정 (`www-data:www-data`)
- nginx 재시작

### 3. 확인

```bash
# 브라우저
https://aims.giize.com 접속 후 Ctrl+Shift+R

# 서버
sudo systemctl status nginx
```

---

## 방법 2: 수동 배포

### 1. 로컬에서 빌드

```bash
cd D:\aims\frontend\aims-uix3
npm run build
```

### 2. tars 서버로 전송

```bash
scp -r dist/* tars.giize.com:/tmp/aims-dist/
```

### 3. tars 서버에서 배포

```bash
ssh tars.giize.com

# 파일 복사
sudo cp -r /tmp/aims-dist/* /var/www/aims/

# 권한 설정
sudo chown -R www-data:www-data /var/www/aims

# nginx 재시작
sudo systemctl reload nginx
```

### 4. 확인

```bash
https://aims.giize.com 접속 후 Ctrl+Shift+R
```

---

## 트러블슈팅

**브라우저 캐시 문제**
```bash
Ctrl+Shift+R (하드 리프레시)
```

**Permission Denied**
```bash
# 수동 배포 방법 2 사용 (sudo 필요)
```

**API 서버 미실행 (502 오류)**
```bash
cd ~/aims/backend/api/aims_api
./deploy_aims_api.sh
```

---

## 주요 경로

```
로컬:    D:\aims\frontend\aims-uix3\dist
임시:    /tmp/aims-dist/
프로덕션: /var/www/aims/
```

---

**최종 업데이트:** 2025-11-23
