@echo off
REM Wrapper: run deploy-wechat with stdin=nul so Cocos/electron build subprocesses
REM do not choke on the "Input redirection is not supported" error under headless shells.
REM Same invocation pattern push-all.bat uses (which is proven to complete fully).
call "%~dp0deploy-wechat.bat" __tee__ < nul
