const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    askQuestion: (prompt) => ipcRenderer.send('ask-question', prompt),
    stopAction: () => ipcRenderer.send('stop-action'),
    onAnswer: (callback) => { ipcRenderer.removeAllListeners('answer'); ipcRenderer.on('answer', (_event, value) => callback(value)); },
    onError: (callback) => { ipcRenderer.removeAllListeners('error'); ipcRenderer.on('error', (_event, value) => callback(value)); },
    onQuestion: (callback) => { ipcRenderer.removeAllListeners('question'); ipcRenderer.on('question', (_event, value) => callback(value)); },
    onStatus: (callback) => { ipcRenderer.removeAllListeners('status'); ipcRenderer.on('status', (_event, value) => callback(value)); }
});
