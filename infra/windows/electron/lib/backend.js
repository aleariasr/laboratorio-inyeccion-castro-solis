'use strict';

// Envoltorio delgado sobre wsl.exe. No reimplementa nada de la lógica de
// negocio: solo invoca, sin modificar, los scripts que ya existen en
// scripts/*.sh dentro de la distro "lics-wsl". restore.sh y rollback.sh
// siguen sin exponerse a propósito -- son procedimientos de recuperación
// peligrosos, distintos a una actualización normal, y siguen siendo
// manuales por WSL con confirmación escrita. update.sh sí se expone (ver
// updateApplication más abajo), porque es la única vía real para llevar
// cambios de Django/Next a una instalación que ya existe: reinstalar el
// .exe NO alcanza, install-wsl-distro.ps1 se salta la reimportación del
// .tar si la distro ya existe (para no perder datos), así que la imagen
// dorada nunca llega a una máquina que ya tiene LICS instalado. La
// confirmación con el usuario vive en main.js, antes de llamar a esta
// función.

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DISTRO = 'lics-wsl';
const APP_ROOT = '/opt/lics';
const HEALTH_URL = 'http://127.0.0.1/nginx-health';
const START_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

// En un build empaquetado, extraResources ("resources/windows" en
// package.json) queda bajo process.resourcesPath/windows. En desarrollo
// (electron .), process.resourcesPath apunta a los recursos propios de
// Electron, no a los nuestros -- ahí hay que leer directo de la carpeta del
// repo.
const RESOURCES_WINDOWS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'windows')
  : path.join(__dirname, '..', 'resources', 'windows');

function spawnInDistro(args, { onLine, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['-d', DISTRO, '--', ...args], {
      windowsHide: true,
    });

    let stderrTail = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (onLine) {
        text.split(/\r?\n/).filter(Boolean).forEach(onLine);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderrTail = (stderrTail + text).slice(-2000);
      if (onLine) {
        text.split(/\r?\n/).filter(Boolean).forEach(onLine);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`No se pudo invocar wsl.exe: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Falló dentro de WSL (código ${code}): ${stderrTail || 'sin detalle'}`));
      }
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

function runInDistro(command, onLine) {
  return spawnInDistro(['bash', '-lc', command], { onLine });
}

function runScriptFileInDistro(scriptFileName, onLine) {
  const scriptPath = path.join(RESOURCES_WINDOWS_DIR, scriptFileName);
  let scriptContent;

  try {
    scriptContent = fs.readFileSync(scriptPath, 'utf8');
  } catch (err) {
    return Promise.reject(new Error(`No se pudo leer ${scriptFileName}: ${err.message}`));
  }

  // Se manda por stdin a "bash -l -s" en vez de copiar el archivo dentro de
  // la distro primero: evita depender de que exista un directorio temporal
  // escribible y evita problemas de permisos/CRLF al cruzar la frontera
  // Windows -> WSL con un archivo intermedio. "-l" (login shell) para que
  // tenga el mismo PATH que el resto de las invocaciones de este archivo
  // ("bash -lc ..." en runInDistro), no el PATH mínimo de un shell no-login.
  return spawnInDistro(['bash', '-l', '-s'], { onLine, stdin: scriptContent });
}

async function ensureDistroRunning() {
  // Cualquier comando "wsl -d lics-wsl" arranca la distro si estaba apagada,
  // así que esto alcanza como comprobación mínima de que WSL2 responde.
  await runInDistro('true');
}

function startServices(onLine) {
  return runInDistro(`${APP_ROOT}/scripts/start.sh`, onLine);
}

function restartServices(onLine) {
  return runInDistro(`${APP_ROOT}/scripts/restart.sh`, onLine);
}

function stopServices(onLine) {
  return runInDistro(`${APP_ROOT}/scripts/stop.sh`, onLine);
}

function getStatus(onLine) {
  return runInDistro(`${APP_ROOT}/scripts/status.sh`, onLine);
}

function runHealthcheck(onLine) {
  return runInDistro(`${APP_ROOT}/scripts/healthcheck.sh`, onLine);
}

function backupNow(onLine) {
  return runInDistro(`${APP_ROOT}/scripts/backup.sh manual`, onLine);
}

function updateApplication(onLine) {
  // Actualiza Django + Next a la versión nueva dentro de una instalación
  // YA existente, sin tocar la imagen dorada ni el .exe. Requiere que el
  // release offline nuevo (mismo formato que build-offline-release.sh)
  // ya esté copiado a mano en C:\lics-dev\ en esta máquina Windows -- ver
  // el comentario largo en resources/windows/update-application.sh y la
  // sección "Actualizar la aplicación" de infra/windows/README.md.
  return runScriptFileInDistro('update-application.sh', onLine);
}

function waitHealthy(timeoutMs = START_TIMEOUT_MS) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(HEALTH_URL, { timeout: 5000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('LICS no respondió a tiempo en ' + HEALTH_URL));
        return;
      }
      setTimeout(attempt, POLL_INTERVAL_MS);
    };

    attempt();
  });
}

module.exports = {
  ensureDistroRunning,
  startServices,
  restartServices,
  stopServices,
  getStatus,
  runHealthcheck,
  backupNow,
  updateApplication,
  waitHealthy,
};
