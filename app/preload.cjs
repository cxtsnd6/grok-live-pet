const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, listener) => {
  const handler = (_event, data) => listener(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('grokPet', {
  settings: (listener) => subscribe('pet:settings', listener),
  status: (listener) => subscribe('pet:status', listener),
  bounce: (listener) => subscribe('pet:bounce', listener),
  pointer: (type) => {
    if (['down', 'up', 'cancel', 'menu'].includes(type)) ipcRenderer.send('pet:pointer', type);
  },
});
