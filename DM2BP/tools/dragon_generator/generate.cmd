@echo off
setlocal
node "%~dp0..\..\..\dragon_generator\generate.js" %*
exit /b %errorlevel%@echo off
