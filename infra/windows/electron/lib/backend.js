'use strict';

// Envoltorio delgado sobre wsl.exe. No reimplementa nada de la lógica de
// negocio: solo invoca, sin modificar, los scripts que ya existen en
// scripts/*.sh dentro de la distro "lics-wsl". Ninguna operación destructiva
// (restore.sh, rollback.sh, update.sh) se expone acá a propósito: esas
// siguen siendo procedimientos manuales por SSH con confirmación escrita.

const { spawn } = require('child_process');
const http = require('http');

const DISTRO = 'lics-wsl';
const APP_ROOT = '/opt/lics';
const HEALTH_URL = 'http://127.0.0.1/nginx-health';
const START_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

function runInDistro(command, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['-d', DISTRO, '--', 'bash', '-lc', command], {
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
  });
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
  waitHealthy,
};
