; AIMS AutoClicker - Inno Setup Installer Script
; 관리자 권한 없이 AppData\Local에 설치
;
; 빌드: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss

#define MyAppName "AIMS AutoClicker"
#define MyAppPublisher "AIMS"
#define MyAppExeName "AutoClicker.exe"
#define MyAppURL "https://aims.giize.com"

; VERSION 파일에서 버전 읽기
#define VersionFile FileOpen(SourcePath + "\..\VERSION")
#define MyAppVersion Trim(FileRead(VersionFile))
#expr FileClose(VersionFile)

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-AIMS00AC0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\AIMS\AutoClicker
DefaultGroupName={#MyAppName}
; 관리자 권한 불필요 (AppData\Local 설치)
PrivilegesRequired=lowest
; 출력 인스톨러 파일명
OutputDir=..\dist
OutputBaseFilename=AIMS_AutoClicker_Setup_{#MyAppVersion}
; 압축 설정
Compression=lzma2/ultra64
SolidCompression=yes
; UI
WizardStyle=modern
; 언인스톨러
UninstallDisplayName={#MyAppName}
; 사일런트 업데이트 지원
AllowNoIcons=yes
; 기존 설치 위에 덮어쓰기 허용 (업데이트용)
UsePreviousAppDir=yes
; 인스톨러 실행 중 AC 종료
CloseApplications=force
CloseApplicationsFilter=AutoClicker.exe

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; === PyInstaller 빌드 결과 (AutoClicker.exe + _internal/) ===
Source: "..\dist\AutoClicker\AutoClicker.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\AutoClicker\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs

; === SikuliX 스크립트 (Python 부분이 아닌 외부 리소스) ===
Source: "..\MetlifeCustomerList.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\verify_customer_integrated_view.py"; DestDir: "{app}"; Flags: ignoreversion

; === SikuliX 이미지 ===
Source: "..\img\*"; DestDir: "{app}\img"; Flags: ignoreversion recursesubdirs createallsubdirs

; === OCR 스크립트 (개발 폴백용, 패키징 모드에서는 --run-ocr 사용) ===
Source: "..\ocr\upstage_ocr_api.py"; DestDir: "{app}\ocr"; Flags: ignoreversion
Source: "..\ocr\parse_customerlist_final.py"; DestDir: "{app}\ocr"; Flags: ignoreversion

; === 런타임: SikuliX JAR ===
Source: "runtime\sikulix\sikulixide-2.0.5.jar"; DestDir: "{app}\runtime\sikulix"; Flags: ignoreversion

; === 런타임: Portable JRE (빌드 시 build/runtime/jre/에 준비) ===
Source: "runtime\jre\*"; DestDir: "{app}\runtime\jre"; Flags: ignoreversion recursesubdirs createallsubdirs

; === 버전 파일 ===
Source: "..\VERSION"; DestDir: "{app}"; Flags: ignoreversion

; === updater.bat (Phase 2 자동 업데이트용, 미리 포함) ===
Source: "updater.bat"; DestDir: "{app}"; Flags: ignoreversion

; === output 디렉토리 (빈 폴더 생성) ===
; Inno Setup은 빈 폴더를 직접 만들 수 없으므로 [Dirs]에서 처리

[Dirs]
Name: "{app}\output"

[Registry]
; aims-ac:// URI Scheme 등록 (HKCU - 관리자 권한 불필요)
Root: HKCU; Subkey: "Software\Classes\aims-ac"; ValueType: string; ValueName: ""; \
    ValueData: "URL:AIMS AutoClicker Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\aims-ac"; ValueType: string; ValueName: "URL Protocol"; \
    ValueData: ""
Root: HKCU; Subkey: "Software\Classes\aims-ac\DefaultIcon"; ValueType: string; ValueName: ""; \
    ValueData: "{app}\{#MyAppExeName},1"
Root: HKCU; Subkey: "Software\Classes\aims-ac\shell\open\command"; ValueType: string; ValueName: ""; \
    ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
; 설치 완료 후 AutoClicker 실행 (사일런트 모드에서도 실행)
; --post-update 인자로 세션 파일(_restart_auth.json)에서 인증 복원
Filename: "{app}\{#MyAppExeName}"; Parameters: "--post-update"; \
    Description: "AIMS AutoClicker 실행"; Flags: nowait postinstall

[UninstallDelete]
; 언인스톨 시 런타임 생성 파일도 정리
Type: filesandordirs; Name: "{app}\output"
Type: files; Name: "{app}\debug_trace.log"
Type: files; Name: "{app}\live_raw_stdout.log"
Type: files; Name: "{app}\live_raw_hex.log"
Type: files; Name: "{app}\.pause_signal"

[Code]
// 설치 전 기존 AC 프로세스가 실행 중이면 종료
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // taskkill은 실패해도 무시 (프로세스가 없을 수 있음)
  Exec('taskkill', '/F /IM AutoClicker.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;
