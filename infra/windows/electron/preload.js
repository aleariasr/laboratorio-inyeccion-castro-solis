'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Lo que la pantalla de carga (renderer/loading.html) puede escuchar y
// pedir. La app web (Next) no usa nada de esto.
contextBridge.exposeInMainWorld('lics', {
  // Paso actual ("Iniciando servicios...").
  onStatus: (callback) => {
    ipcRenderer.on('lics:status', (_event, text) => callback(text));
  },
  // Punto 7: cada línea de salida, para el historial en pantalla.
  onLog: (callback) => {
    ipcRenderer.on('lics:log', (_event, line) => callback(line));
  },
  // Qué acción corre y cuánto puede tardar: { title, hint }.
  onPhase: (callback) => {
    ipcRenderer.on('lics:phase', (_event, phase) => callback(phase));
  },
  // La acción falló: { title, reasons, exitCode, logPath }.
  onFailed: (callback) => {
    ipcRenderer.on('lics:failed', (_event, failure) => callback(failure));
  },
  // Botón "Reintentar" de la pantalla de error: vuelve a levantar LICS.
  retry: () => {
    ipcRenderer.send('lics:retry');
  },
});
