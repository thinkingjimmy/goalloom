; [INPUT]: The current user's default Goalloom workspace path and the NSIS release version.
; [OUTPUT]: Windows 1.12.3 setup exits with code 17 when a workspace already exists.
; [POS]: Installer initialization, before electron-builder can uninstall an existing application.
; [PROTOCOL]: Update this header when making changes, then check README.md.

!ifndef BUILD_UNINSTALLER
  !if "${VERSION}" == "1.12.3"
    !macro preInit
      SetShellVarContext current
      IfFileExists "$APPDATA\Goalloom\workspace.sqlite" 0 goalloom_clean_install
      MessageBox MB_OK|MB_ICONSTOP "此版本仅供首次安装。检测到现有 Goalloom 工作区，请继续使用当前版本。" /SD IDOK
      SetErrorLevel 17
      Quit
      goalloom_clean_install:
    !macroend
  !endif
!endif
