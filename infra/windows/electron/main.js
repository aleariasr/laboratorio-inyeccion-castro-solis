'use strict';

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const backend = require('./lib/backend');

const APP_URL = 'http://127.0.0.1/';

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'LICS',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Ventana normal: se puede mover, minimizar, cerrar. No es kiosco: esta
    // computadora también se usa para Word y Excel.
  });

  win.loadFile(path.join(__dirname, 'renderer', 'loading.html'));

  win.on('closed', () => {
    if (win === mainWindow) {
      mainWindow = null;
    }
  });

  // Bug conocido de Electron en Windows: la ventana puede recuperar el foco
  // del sistema operativo (tras alt-tab, un dialogo nativo, minimizar y
  // restaurar, etc.) sin que el contenido web recupere el foco con ella.
  // Visualmente se ve enfocada, pero los clics no le llegan a los inputs
  // hasta que algo fuerza el foco de vuelta al webContents -- por eso abrir
  // y cerrar un dialogo nativo (como "Ver estado") "arregla" el sintoma.
  // Forzamos ese refoco nosotros mismos cada vez que la ventana gana foco,
  // en vez de depender de que el usuario abra un dialogo para notarlo.
  win.on('focus', () => {
    win.webContents.focus();
  });

  // El fix de arriba (win.on('focus', ...)) NO alcanza: es un bug confirmado
  // de Electron/Chromium en Windows (electron/electron#20464), cerrado por
  // los mantenedores como "not planned" -- no lo van a arreglar upstream.
  // El desenfoque puede aparecer SIN que la ventana pase por un ciclo real
  // de blur/focus a nivel de sistema operativo (por ejemplo, tras ciertos
  // reflows internos de Chromium), así que un handler que solo escucha
  // 'focus' se lo pierde. Como mitigación adicional -- no una solución
  // garantizada -- revisamos periódicamente si la ventana está enfocada a
  // nivel de SO pero el webContents no, y forzamos el refoco en ese caso.
  // Importante: la condición exige win.isFocused() primero, para no robarle
  // nunca el foco del sistema operativo a otra aplicación (Word, Excel,
  // etc.) cuando LICS está en segundo plano -- esta app no corre en modo
  // kiosco y tiene que convivir con el resto del escritorio.
  const focusWatchdog = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(focusWatchdog);
      return;
    }
    if (win.isFocused() && !win.webContents.isFocused()) {
      win.webContents.focus();
    }
  }, 1500);

  win.on('closed', () => {
    clearInterval(focusWatchdog);
  });

  return win;
}

function setStatus(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lics:status', text);
  }
}

async function startupSequence() {
  try {
    setStatus('Verificando WSL2...');
    await backend.ensureDistroRunning();

    setStatus('Iniciando servicios de LICS (puede tardar un momento)...');
    await backend.startServices((line) => setStatus(line));

    setStatus('Esperando a que el sistema responda...');
    await backend.waitHealthy();

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(APP_URL);
    }
  } catch (err) {
    console.error(err);
    setStatus(
      'No se pudo iniciar LICS.\n\n' +
        String(err.message || err) +
        '\n\nContacte a soporte técnico. Puede reintentar desde el menú LICS > Reintentar.'
    );
  }
}

function withBusyMenuAction(actionLabel, action) {
  return async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    setStatus(`${actionLabel}...`);
    try {
      await action((line) => setStatus(line));
      setStatus('Listo.');
      await mainWindow.loadURL(APP_URL);
    } catch (err) {
      dialog.showErrorBox('LICS', `${actionLabel} falló:\n\n${err.message || err}`);
    }
  };
}

function buildMenu() {
  const template = [
    {
      label: 'LICS',
      submenu: [
        {
          label: 'Reintentar / recargar',
          click: () => {
            if (mainWindow) {
              mainWindow.loadFile(path.join(__dirname, 'renderer', 'loading.html'));
              startupSequence();
            }
          },
        },
        {
          label: 'Ver estado',
          click: async () => {
            const lines = [];
            try {
              await backend.getStatus((line) => lines.push(line));
              dialog.showMessageBox(mainWindow, {
                title: 'Estado de LICS',
                message: lines.join('\n') || 'Sin datos.',
              });
            } catch (err) {
              dialog.showErrorBox('LICS', `No se pudo consultar el estado:\n\n${err.message || err}`);
            }
          },
        },
        {
          label: 'Hacer backup ahora',
          click: withBusyMenuAction('Creando backup', backend.backupNow),
        },
        {
          label: 'Reiniciar servicios',
          click: withBusyMenuAction('Reiniciando servicios', backend.restartServices),
        },
        { type: 'separator' },
        {
          label: 'Actualizar aplicación (Django/Next)…',
          click: async () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;

            const { response } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              buttons: ['Cancelar', 'Actualizar'],
              defaultId: 0,
              cancelId: 0,
              title: 'Actualizar LICS',
              message: 'Esto actualiza el backend (Django) y el frontend (Next) a una versión nueva.',
              detail: [
                'Requisito: ya copiaste la carpeta de release nueva ' +
                  '(lics-<versión>-linux-amd64, con app\\ e images\\ adentro) ' +
                  'a C:\\lics-dev\\ en esta máquina.',
                '',
                'Qué va a pasar: valida el paquete, hace un respaldo obligatorio antes de tocar nada, ' +
                  'detiene los servicios, carga las imágenes nuevas, corre migraciones y vuelve a ' +
                  'levantar todo. Puede tardar varios minutos.',
                '',
                'Guarda una copia completa de la versión anterior por si algo sale mal, pero no hay ' +
                  'rollback automático: si falla a mitad de camino, hay que revisar manualmente ' +
                  '(ver infra/windows/README.md, sección "Actualizar la aplicación").',
              ].join('\n'),
            });

            if (response !== 1) return;

            await withBusyMenuAction('Actualizando aplicación', backend.updateApplication)();
          },
        },
        { type: 'separator' },
        {
          label: 'Salir',
          click: () => app.quit(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  buildMenu();
  startupSequence();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      startupSequence();
    }
  });
});

app.on('window-all-closed', () => {
  // Cerrar la ventana NO detiene los servicios: Docker y PostgreSQL siguen
  // corriendo dentro de WSL2, igual que Windows sigue prendido si cerrás
  // Word. Los respaldos automáticos (systemd timer dentro de WSL2) no
  // dependen de que esta app esté abierta.
  app.quit();
});
