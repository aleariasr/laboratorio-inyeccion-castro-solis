'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lics', {
  onStatus: (callback) => {
    ipcRenderer.on('lics:status', (_event, text) => callback(text));
  },
});
