@echo off
setlocal
node "%~dp0generate.js" %*
exit /b %errorlevel%
