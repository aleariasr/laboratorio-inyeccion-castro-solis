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
