@echo off
REM Delete Vercel credentials (PowerShell equivalent: Remove-Item -Recurse -Force "$env:USERPROFILE\.vercel")
rmdir /S /Q "%USERPROFILE%\.vercel"

REM Log in to Vercel (will send verification email)
vercel login

REM Link project (run only once; selects existing project)
vercel link

REM Deploy to production
vercel --prod
