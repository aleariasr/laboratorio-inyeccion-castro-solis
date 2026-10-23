'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const backend = require('./lib/backend');

const APP_URL = 'http://127.0.0.1/';
const LOADING_PAGE = path.join(__dirname, 'renderer', 'loading.html');

// Ítems del menú que lanzan algo contra los servicios: mientras corre uno,
// los demás quedan deshabilitados (punto 7).
const ACTION_MENU_IDS = ['retry', 'status', 'backup', 'restart', 'update'];

// Registro de una acción del menú que se guarda si falla.
const MAX_ACTION_LOG_LINES = 5000;

let mainWindow = null;
let isBusy = false;

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
      // Visor de PDF de Chromium: "Imprimir" en los reportes abre el PDF en
      // una ventana nueva (que hereda estas preferencias) para imprimirlo
      // desde ahí. Sin esto Electron no lo muestra (puntos 2 + 27).
      plugins: true,
    },
    // Ventana normal: se puede mover, minimizar, cerrar. No es kiosco: esta
    // computadora también se usa para Word y Excel.
  });

  win.loadFile(LOADING_PAGE);

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

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setStatus(text) {
  send('lics:status', text);
}

// Cada línea de salida: pasa a ser el paso actual y entra al historial
// de la pantalla de carga.
function reportLine(line) {
  setStatus(line);
  send('lics:log', line);
}

function setBusy(busy) {
  isBusy = busy;

  const menu = Menu.getApplicationMenu();

  if (!menu) return;

  for (const id of ACTION_MENU_IDS) {
    const item = menu.getMenuItemById(id);

    if (item) {
      item.enabled = !busy;
    }
  }
}

async function startupSequence() {
  if (isBusy) return;

  setBusy(true);

  try {
    setStatus('Verificando WSL2...');
    await backend.ensureDistroRunning();

    setStatus('Iniciando servicios de LICS (puede tardar un momento)...');
    await backend.startServices(reportLine);

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
  } finally {
    setBusy(false);
  }
}

async function retryStartup() {
  if (isBusy || !mainWindow || mainWindow.isDestroyed()) return;

  // Se espera a que la pantalla de carga termine de cargar: si no, los
  // primeros mensajes llegan antes de que haya quién los muestre.
  await mainWindow.loadFile(LOADING_PAGE);
  startupSequence();
}

async function confirmAction({ title, message, detail, confirmLabel }) {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancelar', confirmLabel],
    defaultId: 0,
    cancelId: 0,
    title,
    message,
    detail,
  });

  return response === 1;
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Guarda la salida completa de una acción que falló, para soporte. Si no
// se puede escribir, la acción igual informa el error (sin ruta).
function saveActionLog(actionLabel, lines, err) {
  try {
    const directory = path.join(app.getPath('logs'), 'acciones');
    fs.mkdirSync(directory, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(directory, `${stamp}-${slugify(actionLabel)}.log`);

    const header = [
      `Acción: ${actionLabel}`,
      `Fecha: ${new Date().toLocaleString('es-CR')}`,
      `Código de salida: ${err.exitCode ?? 'no aplica'}`,
      `Error: ${err.message || err}`,
      '',
      '--- Salida completa ---',
    ];

    fs.writeFileSync(logPath, [...header, ...lines].join('\n'), 'utf8');

    return logPath;
  } catch (writeError) {
    console.error(writeError);
    return null;
  }
}

// "Qué falló": las líneas [ERROR] de los scripts si las hay; si no, el
// mensaje del error (por ejemplo, LICS no respondió a tiempo).
function failureReasons(err) {
  if (err.errorLines && err.errorLines.length > 0) {
    return err.errorLines;
  }

  return [String(err.message || err)];
}

function failureDetail(err, logPath) {
  const sections = [
    'Qué falló:',
    ...failureReasons(err).map((reason) => `• ${reason}`),
  ];

  if (err.exitCode !== undefined) {
    sections.push('', `Código de salida: ${err.exitCode}`);
  }

  if (err.outputTail && err.outputTail.length > 0) {
    sections.push('', 'Últimas líneas del proceso:', ...err.outputTail.slice(-8));
  }

  if (logPath) {
    sections.push('', `Registro completo: ${logPath}`);
  }

  return sections.join('\n');
}

// Acción del menú (punto 7): muestra la pantalla de progreso con el
// historial, una sola acción a la vez, y si falla dice qué falló, guarda
// el registro y deja la opción de reintentar.
async function runMenuAction({ label, hint, action }) {
  if (isBusy || !mainWindow || mainWindow.isDestroyed()) return;

  setBusy(true);

  const lines = [];
  const onLine = (line) => {
    lines.push(line);
    if (lines.length > MAX_ACTION_LOG_LINES) {
      lines.shift();
    }
    reportLine(line);
  };

  try {
    // Hasta que la pantalla de carga no termina de cargar, nadie escucha
    // los mensajes (la app web no los muestra).
    await mainWindow.loadFile(LOADING_PAGE);
    send('lics:phase', { title: label, hint });
    setStatus(`${label}...`);

    await action(onLine);

    setStatus('Esperando a que el sistema responda...');
    await backend.waitHealthy();

    setStatus('Listo.');
    await mainWindow.loadURL(APP_URL);
  } catch (err) {
    console.error(err);

    const logPath = saveActionLog(label, lines, err);

    send('lics:failed', {
      title: `${label}: no se completó`,
      reasons: failureReasons(err),
      exitCode: err.exitCode ?? null,
      logPath,
    });

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'LICS',
      buttons: logPath ? ['Cerrar', 'Abrir el registro'] : ['Cerrar'],
      defaultId: 0,
      cancelId: 0,
      message: `${label}: no se completó.`,
      detail: failureDetail(err, logPath),
    });

    if (response === 1 && logPath) {
      shell.openPath(logPath);
    }
  } finally {
    setBusy(false);
  }
}

function buildMenu() {
  const template = [
    {
      label: 'LICS',
      submenu: [
        {
          id: 'retry',
          label: 'Reintentar / recargar',
          click: () => {
            retryStartup();
          },
        },
        {
          id: 'status',
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
          id: 'backup',
          label: 'Hacer backup ahora…',
          click: async () => {
            if (isBusy || !mainWindow || mainWindow.isDestroyed()) return;

            const confirmed = await confirmAction({
              title: 'Hacer backup',
              message: 'Se crea un respaldo completo de la base de datos.',
              detail:
                'Mientras se crea, esta ventana muestra el progreso y la aplicación vuelve ' +
                'sola al terminar. Suele tardar uno o dos minutos. Lo que no se haya ' +
                'guardado en un formulario abierto se pierde.',
              confirmLabel: 'Hacer backup',
            });

            if (!confirmed) return;

            await runMenuAction({
              label: 'Creando backup',
              hint: 'Puede tardar unos minutos. La aplicación vuelve sola al terminar.',
              action: backend.backupNow,
            });
          },
        },
        {
          id: 'restart',
          label: 'Reiniciar servicios…',
          click: async () => {
            if (isBusy || !mainWindow || mainWindow.isDestroyed()) return;

            const confirmed = await confirmAction({
              title: 'Reiniciar servicios',
              message: 'Se detienen y se vuelven a iniciar los servicios de LICS.',
              detail:
                'Durante unos minutos LICS no está disponible. Lo que no se haya ' +
                'guardado en un formulario abierto se pierde.',
              confirmLabel: 'Reiniciar',
            });

            if (!confirmed) return;

            await runMenuAction({
              label: 'Reiniciando servicios',
              hint: 'Puede tardar unos minutos. La aplicación vuelve sola al terminar.',
              action: backend.restartServices,
            });
          },
        },
        { type: 'separator' },
        {
          id: 'update',
          label: 'Actualizar aplicación (Django/Next)…',
          click: async () => {
            if (isBusy || !mainWindow || mainWindow.isDestroyed()) return;

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

            await runMenuAction({
              label: 'Actualizando la aplicación',
              hint:
                'Esto puede tardar varios minutos. No cierre esta ventana ni apague la ' +
                'computadora hasta que termine.',
              action: backend.updateApplication,
            });
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

// Botón "Reintentar" de la pantalla de error (renderer/loading.html).
ipcMain.on('lics:retry', () => {
  retryStartup();
});

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
