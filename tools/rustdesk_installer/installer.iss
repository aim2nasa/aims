; AIMS 원격지원 (RustDesk) - Inno Setup Installer Script
; 관리자 권한 없이 AppData\Local에 설치
;
; 빌드: "C:\Inno6\ISCC.exe" installer.iss

#define MyAppName "AIMS 원격지원"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "AIMS"
#define MyAppURL "https://aims.giize.com"
#define MyAppExeName "rustdesk.exe"

[Setup]
AppId={{F7A3B2C1-D4E5-6789-ABCD-AIMS00RS0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\AIMS\RustDesk
DefaultGroupName={#MyAppName}
; 관리자 권한 불필요 (AppData\Local 설치)
PrivilegesRequired=lowest
; 출력 인스톨러 파일명
OutputDir=dist
OutputBaseFilename=AIMS_RustDesk_Setup
; 압축 설정
Compression=lzma2/ultra64
SolidCompression=yes
; UI
WizardStyle=modern
; 언인스톨러
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
; 기존 설치 위에 덮어쓰기 허용
UsePreviousAppDir=yes
AllowNoIcons=yes
; RustDesk가 실행 중이면 종료
CloseApplications=force
CloseApplicationsFilter=rustdesk.exe

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; RustDesk 공식 실행 파일 (포터블 인스톨러)
Source: "rustdesk.exe"; DestDir: "{app}"; DestName: "rustdesk.exe"; Flags: ignoreversion
; Relay 서버 설정 파일 → RustDesk config 디렉토리
Source: "RustDesk2.toml"; DestDir: "{userappdata}\RustDesk\config"; Flags: ignoreversion

[Registry]
; aims-rs:// URI Scheme 등록 (HKCU - 관리자 권한 불필요)
Root: HKCU; Subkey: "Software\Classes\aims-rs"; ValueType: string; ValueName: ""; \
    ValueData: "URL:AIMS Remote Support Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\aims-rs"; ValueType: string; ValueName: "URL Protocol"; \
    ValueData: ""
Root: HKCU; Subkey: "Software\Classes\aims-rs\DefaultIcon"; ValueType: string; ValueName: ""; \
    ValueData: "{app}\{#MyAppExeName},1"
Root: HKCU; Subkey: "Software\Classes\aims-rs\shell\open\command"; ValueType: string; ValueName: ""; \
    ValueData: """{app}\{#MyAppExeName}"""

[Run]
; 설치 완료 후 RustDesk 실행
Filename: "{app}\{#MyAppExeName}"; \
    Description: "AIMS 원격지원 실행"; Flags: nowait postinstall runasoriginaluser

[UninstallRun]
; 언인스톨 시 RustDesk 프로세스 종료
Filename: "taskkill"; Parameters: "/F /IM rustdesk.exe"; Flags: runhidden

[UninstallDelete]
; 언인스톨 시 생성된 파일 정리
Type: filesandordirs; Name: "{app}"

[Code]
// 설치 전 기존 RustDesk 프로세스가 실행 중이면 종료
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill', '/F /IM rustdesk.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;
