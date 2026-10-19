; 自定义 NSIS 脚本：安装/卸载向导文案 + 欢迎页 + 开始菜单「卸载」快捷方式。
; 本文件包含于公共脚本头部（先于 MUI2 页面声明），MUI_DEFAULT 不会覆盖这里的定义。
;
; 注意：MUI2 的卸载欢迎页/完成页复用的定义名与安装页相同
; （MUI_WELCOMEPAGE_TITLE / MUI_FINISHPAGE_TITLE），需按 BUILD_UNINSTALLER 区分。

; ── 欢迎页 / 完成页文案（仿 WorkBuddy 的现代向导风格，配品牌侧栏图）──
!ifdef BUILD_UNINSTALLER
  !define MUI_WELCOMEPAGE_TITLE "卸载 DeepSeek Harness"
  !define MUI_WELCOMEPAGE_TEXT "本向导将从您的电脑中卸载 DeepSeek Harness。$\r$\n$\r$\n卸载不会删除您的个人配置与历史会话（~/.dsh）。点击“卸载”继续。"
  !define MUI_FINISHPAGE_TITLE "DeepSeek Harness 已卸载"
  !define MUI_FINISHPAGE_TEXT "DeepSeek Harness 已从您的电脑中移除。感谢您的使用。"
!else
  !define MUI_WELCOMEPAGE_TITLE "欢迎使用 DeepSeek Harness"
  !define MUI_WELCOMEPAGE_TEXT "本向导将引导您完成 DeepSeek Harness 的安装。$\r$\n$\r$\n建议在继续前关闭其它正在运行的应用程序。点击“下一步”继续。"
  !define MUI_FINISHPAGE_TITLE "DeepSeek Harness 安装完成"
  !define MUI_FINISHPAGE_TEXT "DeepSeek Harness 已成功安装到您的电脑。$\r$\n$\r$\n点击“完成”即可从桌面或开始菜单启动应用。"
!endif

; electron-builder 默认不生成欢迎页（首屏直接是“安装选项”），这里补上带品牌侧栏的欢迎页。
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── 开始菜单添加显式的「卸载」快捷方式 ──
!macro customInstall
  CreateShortCut "$SMPROGRAMS\卸载 DeepSeek Harness.lnk" "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\卸载 DeepSeek Harness.lnk"
!macroend
