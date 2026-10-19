@echo off
rem ============================================================
rem  组装 DSH 运行时：server/runtime/{node.exe, node_modules/@deepseek-ai/dsh}
rem  构建前必跑。从本机全局环境复制，仓库不提交运行时二进制。
rem  要求：node.exe >= 22.19（推荐 24.x）；全局已装 @deepseek-ai/dsh
rem ============================================================
setlocal enabledelayedexpansion
set "RUNTIME_DIR=%~dp0..\server\runtime"

echo [1/2] 复制 node.exe（从 PATH 查找）...
set "NODE_SRC="
for /f "delims=" %%i in ('where node.exe 2^>nul') do (
  set "NODE_SRC=%%i"
  goto :got_node
)
:got_node
if not defined NODE_SRC (
  echo [错误] PATH 上找不到 node.exe，请先安装 Node.js 22.19+ 或 24.x
  exit /b 1
)
for /f "delims=" %%v in ('"%NODE_SRC%" --version') do set "NODE_VER=%%v"
echo   找到 %NODE_VER%: %NODE_SRC%
copy /Y "%NODE_SRC%" "%RUNTIME_DIR%\node.exe" >nul
if errorlevel 1 ( echo [错误] node.exe 复制失败 & exit /b 1 )
echo   已就位: %RUNTIME_DIR%\node.exe

echo [2/2] 复制 dsh 内核（从全局 npm 前缀）...
set "DSH_SRC=%APPDATA%\npm\node_modules\@deepseek-ai\dsh"
if not exist "%DSH_SRC%\package.json" (
  echo [错误] 未找到全局 dsh：%DSH_SRC%
  echo        先执行: npm install -g @deepseek-ai/dsh
  exit /b 1
)
for /f "tokens=2 delims=:," %%a in ('findstr /C:"\"version\"" "%DSH_SRC%\package.json"') do set "DSH_VER=%%~a"
echo   找到 dsh %DSH_VER%: %DSH_SRC%
robocopy "%DSH_SRC%" "%RUNTIME_DIR%\node_modules\@deepseek-ai\dsh" /E /SL /NFL /NDL /NJH /NJS >nul
if errorlevel 8 ( echo [错误] robocopy 失败 & exit /b 1 )
echo   已就位: %RUNTIME_DIR%\node_modules\@deepseek-ai\dsh

echo.
echo [完成] 运行时组装完毕，可执行 npm run dist 构建
endlocal
