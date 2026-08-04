@echo off
REM Wrapper: run push-all with stdin=nul so Cocos/electron build subprocesses
REM do not choke on "Input redirection is not supported" under headless shells.
REM The < nul lives INSIDE this .bat (pure cmd context) so it is never parsed by sh.
call "%~dp0push-all.bat" < nul
