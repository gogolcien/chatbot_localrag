@echo off
setlocal

set BIN=tailwindcss.exe

if not exist "%BIN%" (
    echo Descargando el binario de Tailwind CSS ^(una sola vez^)...
    curl -sL -o "%BIN%" "https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe"
)

"%BIN%" -i ./css/tailwind-input.css -o ./css/tailwind.css --minify %*

echo Listo -^> css/tailwind.css actualizado.
