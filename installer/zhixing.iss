#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #define OutputDir ".\release"
#endif
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

#define MyAppName "知行 AI 教学诊断"
#define MyAppPublisher "知行教学诊断"

[Setup]
AppId={{A4B5271B-C037-4D5F-8D45-5B0C9E612A8B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\ZhixingAI
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=ZhixingAI-Windows-Setup-{#MyAppVersion}
UninstallDisplayName={#MyAppName}
CloseApplications=force
RestartApplications=no

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\app\.env.example"; DestDir: "{app}\app"; DestName: ".env"; Flags: onlyifdoesntexist uninsneveruninstall

[Dirs]
Name: "{app}\app\data"; Permissions: users-full
Name: "{app}\app\uploads"; Permissions: users-full

[Icons]
Name: "{autodesktop}\知行 AI 教学诊断"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Start-Zhixing.ps1"""; WorkingDir: "{app}\app"; IconFilename: "{sys}\shell32.dll"; IconIndex: 220
Name: "{group}\启动知行 AI 教学诊断"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Start-Zhixing.ps1"""; WorkingDir: "{app}\app"
Name: "{group}\配置 AI 服务"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Configure-Zhixing.ps1"""; WorkingDir: "{app}\app"
Name: "{group}\停止本地服务"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Stop-Zhixing.ps1"""; WorkingDir: "{app}"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Configure-Firewall.ps1"" -NodePath ""{app}\runtime\node.exe"" -Port 4173"; Description: "允许学生手机通过局域网访问"; Flags: waituntilterminated postinstall skipifsilent
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Start-Zhixing.ps1"""; Description: "启动知行 AI 教学诊断"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Stop-Zhixing.ps1"""; Flags: runhidden waituntilterminated skipifdoesntexist
