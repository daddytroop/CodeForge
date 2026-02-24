// Preload script — exposes safe Electron APIs to the renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for menu actions from the main process
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => callback(action));
  },

  // Listen for file open from native dialog
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (event, fileData) => callback(fileData));
  },

  // Save file to disk via native dialog
  saveFileDialog: (filename, content) => {
    return ipcRenderer.invoke('save-file-dialog', { filename, content });
  },

  // Save file to a known path
  saveFile: (filePath, content) => {
    return ipcRenderer.invoke('save-file', { filePath, content });
  },

  // Open database file via native dialog
  openDbDialog: () => {
    return ipcRenderer.invoke('open-db-dialog');
  },

  // Save database file via native dialog
  saveDbDialog: (filename, data) => {
    return ipcRenderer.invoke('save-db-dialog', { filename, data });
  },

  // ===== Terminal APIs =====
  terminalCheck: () => {
    return ipcRenderer.invoke('terminal-check');
  },
  createTerminal: (opts) => {
    return ipcRenderer.invoke('terminal-create', opts);
  },
  writeTerminal: (id, data) => {
    return ipcRenderer.invoke('terminal-write', { id, data });
  },
  resizeTerminal: (id, cols, rows) => {
    return ipcRenderer.invoke('terminal-resize', { id, cols, rows });
  },
  killTerminal: (id) => {
    return ipcRenderer.invoke('terminal-kill', { id });
  },
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal-data', (event, data) => callback(data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal-exit', (event, data) => callback(data));
  },

  // ===== Folder APIs =====
  openFolderDialog: () => {
    return ipcRenderer.invoke('open-folder-dialog');
  },
  readDirectory: (dirPath, depth) => {
    return ipcRenderer.invoke('read-directory', { dirPath, depth });
  },
  readFileContent: (filePath) => {
    return ipcRenderer.invoke('read-file-content', { filePath });
  },

  // Check if running in Electron
  isElectron: true,
});
