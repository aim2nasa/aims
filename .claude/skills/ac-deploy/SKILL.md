---
name: ac-deploy
description: AutoClicker 빌드+배포. /ac-deploy, AC 빌드, AC 배포, AC 서버 업로드 요청 시 사용
user_invocable: true
---

# AutoClicker 빌드 & 배포 스킬

AC 코드 수정 후 빌드 → 인스톨러 → 서버 업로드 → MongoDB 업데이트를 자동화합니다.

## 트리거

- `/ac-deploy` (사용자 호출)
- "AC 빌드", "AC 배포", "AC 서버 업로드"

## 실행 단계

### Phase 1: 사전 확인

```bash
# VERSION 파일 확인
cat d:/aims/tools/auto_clicker_v2/VERSION

# 변경사항 확인
cd /d/aims && git status tools/auto_clicker_v2/
```

변경사항이 없으면 사용자에게 알리고 중단합니다.

### Phase 2: 커밋 (변경사항이 있을 경우)

AC 관련 변경 파일을 커밋합니다. pre-commit 훅이 자동으로 VERSION을 범프합니다.

```bash
cd /d/aims && git add tools/auto_clicker_v2/ && git commit -m "커밋 메시지"
```

**주의**: pre-commit 훅이 VERSION을 자동 증가시킵니다. 커밋 후 VERSION을 다시 읽어야 합니다.

### Phase 3: PyInstaller 빌드

```bash
cd /d/aims/tools/auto_clicker_v2 && pyinstaller AutoClicker.spec --noconfirm
```

- 타임아웃: 5분
- 출력: `dist/AutoClicker/AutoClicker.exe`
- 성공 확인: "Build complete!" 메시지

### Phase 4: Inno Setup 인스톨러 빌드

```bash
"C:\Inno6\ISCC.exe" "D:\aims\tools\auto_clicker_v2\build\installer.iss"
```

- 타임아웃: 3분
- 출력: `dist/AIMS_AutoClicker_Setup_{VERSION}.exe`
- 성공 확인: "Successful compile" 메시지

### Phase 5: 서버 업로드

```bash
scp "D:\aims\tools\auto_clicker_v2\dist\AIMS_AutoClicker_Setup_{VERSION}.exe" \
    rossi@100.110.215.65:/home/rossi/aims/backend/api/aims_api/public/installers/
```

### Phase 6: MongoDB 버전 업데이트

**중요**: `_id: "ac_latest_version"` (문자열 _id) 문서를 업데이트합니다!
`key` 필드가 아닌 `_id` 필드로 조회해야 합니다.

```bash
ssh rossi@100.110.215.65 'docker exec aims-api node -e "
const {MongoClient}=require(\"mongodb\");
(async()=>{
  const c=new MongoClient(\"mongodb://tars:27017\");
  await c.connect();
  const r=await c.db(\"docupload\").collection(\"config\").updateOne(
    {_id:\"ac_latest_version\"},
    {\$set:{latest:\"{VERSION}\",installerUrl:\"/public/installers/AIMS_AutoClicker_Setup_{VERSION}.exe\",releaseNotes:\"{RELEASE_NOTES}\",updatedAt:new Date().toISOString()}}
  );
  console.log(\"Updated:\",JSON.stringify(r));
  await c.close();
})();
"'
```

### Phase 7: 검증

```bash
ssh rossi@100.110.215.65 'curl -s http://localhost:3010/api/ac/latest-version'
```

응답에서 `latest`가 새 VERSION과 일치하는지 확인합니다.

## 결과 보고

| 단계 | 결과 |
|------|------|
| 커밋 | ✅/⏭️ (스킵) |
| PyInstaller | ✅ `dist/AutoClicker/AutoClicker.exe` |
| Inno Setup | ✅ `AIMS_AutoClicker_Setup_{VERSION}.exe` ({SIZE} MB) |
| 서버 업로드 | ✅ |
| MongoDB | ✅ latest: {VERSION} |
| API 검증 | ✅ |

## 주의사항

- **Inno Setup 경로**: `C:\Inno6\ISCC.exe`
- **MongoDB _id 필드**: `_id: "ac_latest_version"` (문자열, ObjectId 아님)
- **MongoDB 호스트**: `mongodb://tars:27017` (Docker 내부)
- **installerUrl 경로**: `/public/installers/` 접두사 필수
- **pre-commit 훅**: AC 파일 커밋 시 VERSION 자동 증가 → 커밋 후 VERSION 재확인
