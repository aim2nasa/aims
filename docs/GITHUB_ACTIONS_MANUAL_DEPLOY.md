# GitHub Actions 수동 배포 방법

## 1. GitHub Actions 페이지 접속

https://github.com/aim2nasa/aims/actions

## 2. 워크플로우 선택

왼쪽 사이드바에서 **"Deploy AIMS Frontend"** 클릭

## 3. 배포 실행

1. **Run workflow** 버튼 클릭 (우측 상단)
2. Branch: `main` 확인
3. **Run workflow** 버튼 클릭

## 4. 진행 상황 확인

실행 중인 워크플로우 클릭하면 실시간 로그 확인 가능

---

## 배포 흐름

```
Run workflow 클릭
    ↓
GitHub runner에서 빌드 (npm ci → npm run build)
    ↓
rsync로 dist/ 폴더를 tars 서버에 전송
    ↓
배포 완료
```
