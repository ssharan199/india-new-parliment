@echo off
REM Serve this folder over http (ES modules won't load from file://) and open it.
setlocal
REM 8000 is a popular default and is often already taken by another project —
REM if the page that opens isn't this one, something else owns the port.
set PORT=8181

where python >nul 2>nul && goto :python
where npx    >nul 2>nul && goto :npx
echo Need either Python or Node installed to serve this folder.
echo Alternatively, open the folder with any static web server and browse to it.
pause
exit /b 1

:python
echo Serving on http://localhost:%PORT%/  (Ctrl+C to stop)
start "" http://localhost:%PORT%/
python -m http.server %PORT%
exit /b

:npx
echo Serving on http://localhost:%PORT%/  (Ctrl+C to stop)
start "" http://localhost:%PORT%/
npx --yes serve -l %PORT% .
exit /b
