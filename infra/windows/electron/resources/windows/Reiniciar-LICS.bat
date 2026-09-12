@echo off
title LICS - Reiniciar servicios
setlocal

set DISTRO=lics-wsl
set TAREA_SESION=LICS - Mantener sesion WSL activa
set TAREA_BACKEND=LICS - Iniciar backend

cls
echo.
echo   ==================================================
echo    LICS - Reiniciar servicios
echo   ==================================================
echo.
echo   Use esto solo si LICS no abre, se queda en
echo   "Iniciando..." o avisa que no se puede comunicar
echo   con el sistema local.
echo.
echo   No borra ni modifica ningun dato.
echo   Puede tardar hasta 2 minutos.
echo.
echo   No cierre esta ventana hasta que diga TERMINADO.
echo.
pause

echo.
echo   [1 de 4] Reiniciando la sesion de WSL...
schtasks /End /TN "%TAREA_SESION%" >nul 2>&1
schtasks /Run /TN "%TAREA_SESION%" >nul 2>&1
if errorlevel 1 (
    echo            AVISO: la tarea no respondio. Se continua igual.
) else (
    echo            OK
)

echo.
echo   [2 de 4] Levantando los servicios de LICS...
schtasks /Run /TN "%TAREA_BACKEND%" >nul 2>&1
if errorlevel 1 (
    echo            AVISO: la tarea no respondio. Se continua igual.
) else (
    echo            OK
)

echo.
echo   [3 de 4] Esperando a que los servicios respondan...
set /a INTENTO=0

:esperar
set /a INTENTO+=1
wsl -d %DISTRO% -- /opt/lics/scripts/healthcheck.sh >nul 2>&1
if not errorlevel 1 goto listo
if %INTENTO% GEQ 12 goto con_problema
echo            intento %INTENTO% de 12, esperando...
timeout /t 10 /nobreak >nul
goto esperar

:listo
echo            OK

echo.
echo   [4 de 4] Estado final:
echo.
wsl -d %DISTRO% -- /opt/lics/scripts/healthcheck.sh

echo.
echo   ==================================================
echo    TERMINADO. Ya puede abrir LICS normalmente.
echo   ==================================================
echo.
pause
exit /b 0

:con_problema
echo.
echo   ==================================================
echo    Los servicios NO quedaron funcionando.
echo   ==================================================
echo.
echo   Detalle del ultimo intento:
echo.
wsl -d %DISTRO% -- /opt/lics/scripts/healthcheck.sh
echo.
echo   Que hacer ahora:
echo.
echo   1. Cierre esta ventana, haga clic derecho sobre el
echo      icono "Reiniciar LICS" y elija
echo      "Ejecutar como administrador". Pruebe otra vez.
echo.
echo   2. Si vuelve a fallar, saque una foto de esta
echo      ventana completa y enviesela a soporte tecnico.
echo      NO reinstale LICS.
echo.
pause
exit /b 1
