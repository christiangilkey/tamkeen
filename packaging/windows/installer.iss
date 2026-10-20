; Inno Setup script for Tamkeen (first released as "Arabic Podcast Studio").
; The AppId, install folder and executable name are unchanged from that first name, so this
; installer upgrades an existing installation in place.
;   iscc /DAppVersion=0.1.0 packaging\windows\installer.iss
; Installs per-user (no admin prompt) into %LOCALAPPDATA%\Programs. User data lives in
; %APPDATA%\ArabicPodcastStudio and is never touched by install, upgrade or uninstall.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Tamkeen"
#define OldAppName "Arabic Podcast Studio"
#define AppExe "ArabicPodcastStudio.exe"

[Setup]
AppId={{6B0E3C1A-5D4F-4A9B-9E1F-2C7A8D3B4E51}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Tamkeen contributors
DefaultDirName={localappdata}\Programs\ArabicPodcastStudio
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Use the new Start-menu folder name even when upgrading an install made under the old name.
UsePreviousGroup=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=Tamkeen-{#AppVersion}-Windows-Setup
SetupIconFile=..\icons\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\..\LICENSE
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\dist\ArabicPodcastStudio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Shortcuts left by versions that used the old name.
[InstallDelete]
Type: files; Name: "{autoprograms}\{#OldAppName}\{#OldAppName}.lnk"
Type: files; Name: "{autodesktop}\{#OldAppName}.lnk"
Type: dirifempty; Name: "{autoprograms}\{#OldAppName}"

[Icons]
; AppUserModelID: the same ID the app gives itself (app/notify.py APP_ID), so Windows shows its chat
; notifications as Tamkeen's and groups its taskbar button with this shortcut.
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; AppUserModelID: "io.github.christiangilkey.Tamkeen"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon; AppUserModelID: "io.github.christiangilkey.Tamkeen"

; tamkeen:// links (tamkeen://watch?v=<YouTube id>, used by Onyx Calendar) open in Tamkeen: Windows
; starts the exe with the link as its argument (see app/applink.py). For this user only, so no admin
; prompt; removed on uninstall.
[Registry]
Root: HKCU; Subkey: "Software\Classes\tamkeen"; ValueType: string; ValueName: ""; ValueData: "URL:Tamkeen"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\tamkeen"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\tamkeen\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExe}"",0"
Root: HKCU; Subkey: "Software\Classes\tamkeen\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExe}"" ""%1"""

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
