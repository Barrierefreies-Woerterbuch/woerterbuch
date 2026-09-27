#define MyAppName "Barrierefreies Wörterbuch"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Alessandro Fabiano"
#define MyAppExeName "Barrierefreies_Woerterbuch.exe"

[Setup]
AppId={{0E7BA1BF-4699-403A-B5FC-DB2020AC7598}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppCopyright=Copyright © 2026 Alessandro Fabiano
AppReadmeFile={app}\README_WINDOWS.txt
DefaultDirName={localappdata}\Programs\Barrierefreies Wörterbuch
DefaultGroupName=Barrierefreies Wörterbuch
DisableDirPage=auto
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
MinVersion=10.0.17763
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\Barrierefreies_Woerterbuch_Windows_1_0_0_Installer
OutputBaseFilename=Barrierefreies_Woerterbuch_Windows_1_0_0_Setup
SetupIconFile=..\app.ico
UninstallDisplayName={#MyAppName} {#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern dynamic
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
AppMutex=Local\BarrierefreiesWoerterbuch_AlessandroFabiano
VersionInfoVersion=1.0.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Installation von {#MyAppName}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion=1.0.0.0

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Verknüpfung auf dem &Desktop erstellen"; GroupDescription: "Zusätzliche Verknüpfungen:"; Flags: unchecked

[Files]
Source: "..\..\.build\windows-1.0.0\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Barrierefreies Wörterbuch"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Barrierefreies Wörterbuch deinstallieren"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Barrierefreies Wörterbuch"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Barrierefreies Wörterbuch starten"; Flags: nowait postinstall skipifsilent
