// Electron Main Process for CodeForge
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const { spawn } = require('child_process');

let mainWindow;
const terminals = new Map(); // id → child process

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'CodeForge',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#272822',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: true,
    autoHideMenuBar: true,
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Build application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu-action', 'new-file') },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => openFileDialog() },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow?.webContents.send('menu-action', 'open-folder') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu-action', 'save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => saveFileDialog() },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu-action', 'settings') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find & Replace', accelerator: 'CmdOrCtrl+H', click: () => mainWindow?.webContents.send('menu-action', 'find') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu-action', 'toggle-sidebar') },
        { label: 'Toggle AI Panel', accelerator: 'CmdOrCtrl+L', click: () => mainWindow?.webContents.send('menu-action', 'toggle-ai') },
        { label: 'Toggle SQL Panel', accelerator: 'CmdOrCtrl+Shift+Q', click: () => mainWindow?.webContents.send('menu-action', 'toggle-sql') },
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+J', click: () => mainWindow?.webContents.send('menu-action', 'toggle-terminal') },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow?.webContents.send('menu-action', 'command-palette') },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About CodeForge', click: () => mainWindow?.webContents.send('menu-action', 'about') },
        { label: 'Keyboard Shortcuts', click: () => mainWindow?.webContents.send('menu-action', 'settings') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFileDialog() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Code Files', extensions: ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'java', 'kt', 'swift', 'php', 'html', 'htm', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml', 'md', 'txt', 'sql', 'sh', 'bash', 'ps1', 'vue', 'svelte', 'toml', 'ini', 'cfg', 'env', 'csv', 'log'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const name = path.basename(filePath);
        mainWindow.webContents.send('open-file', { name, content, path: filePath });
      } catch (err) {
        console.error('Failed to read file:', err);
      }
    }
  }
}

async function saveFileDialog() {
  if (!mainWindow) return;
  mainWindow.webContents.send('menu-action', 'save-as');
}

// Handle save-as from renderer
ipcMain.handle('save-file-dialog', async (event, { filename, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Cancelled' };
});

// Handle save to known path
ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Handle open database file dialog
ipcMain.handle('open-db-dialog', async (event) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const data = fs.readFileSync(filePath);
      return { data: Array.from(data), name: path.basename(filePath), path: filePath };
    } catch (err) {
      return { error: err.message };
    }
  }
  return null;
});

// Handle save database file dialog
ipcMain.handle('save-db-dialog', async (event, { filename, data }) => {
  if (!mainWindow) return { success: false };
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [
      { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, Buffer.from(data));
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Cancelled' };
});

// ===== Terminal IPC Handlers =====

// Check if terminal is available (always true in Electron with child_process)
ipcMain.handle('terminal-check', () => {
  return { available: true };
});

// Create a new terminal process using child_process.spawn
ipcMain.handle('terminal-create', (event, { cols, rows, cwd, shell }) => {
  let shellPath;
  let shellArgs = [];

  if (shell && shell !== 'default') {
    const shellMap = {
      'powershell': { cmd: process.platform === 'win32' ? 'powershell.exe' : 'pwsh', args: ['-NoLogo'] },
      'cmd': { cmd: 'cmd.exe', args: [] },
      'bash': { cmd: process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash', args: [] },
    };
    const entry = shellMap[shell] || { cmd: shell, args: [] };
    shellPath = entry.cmd;
    shellArgs = entry.args;
  } else {
    if (process.platform === 'win32') {
      shellPath = 'powershell.exe';
      shellArgs = ['-NoLogo'];
    } else {
      shellPath = process.env.SHELL || '/bin/bash';
    }
  }

  try {
    const childProc = spawn(shellPath, shellArgs, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const id = 'term_' + Date.now();
    terminals.set(id, childProc);

    childProc.stdout.on('data', (data) => {
      mainWindow?.webContents.send('terminal-data', { id, data: data.toString() });
    });

    childProc.stderr.on('data', (data) => {
      mainWindow?.webContents.send('terminal-data', { id, data: data.toString() });
    });

    childProc.on('exit', (exitCode) => {
      mainWindow?.webContents.send('terminal-exit', { id, exitCode });
      terminals.delete(id);
    });

    childProc.on('error', (err) => {
      mainWindow?.webContents.send('terminal-data', { id, data: `\r\nError: ${err.message}\r\n` });
      mainWindow?.webContents.send('terminal-exit', { id, exitCode: 1 });
      terminals.delete(id);
    });

    return { id };
  } catch (err) {
    return { error: err.message };
  }
});

// Write data to terminal
ipcMain.handle('terminal-write', (event, { id, data }) => {
  const proc = terminals.get(id);
  if (proc && proc.stdin && !proc.stdin.destroyed) {
    proc.stdin.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Resize terminal (no-op for child_process — only node-pty supports this)
ipcMain.handle('terminal-resize', (event, { id, cols, rows }) => {
  // child_process doesn't support resize — but this is okay for basic terminal usage
  return { success: true };
});

// Kill terminal
ipcMain.handle('terminal-kill', (event, { id }) => {
  const proc = terminals.get(id);
  if (proc) {
    try {
      if (process.platform === 'win32') {
        // On Windows, kill the process tree
        spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (_) {}
    terminals.delete(id);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// ===== Project Folder IPC Handlers =====

// Open folder dialog
ipcMain.handle('open-folder-dialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Read directory recursively
ipcMain.handle('read-directory', async (event, { dirPath, depth = 3 }) => {
  // Patterns to skip
  const SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', '__pycache__', '.next', '.nuxt',
    'dist', 'build', 'out', '.cache', '.idea', '.vscode', 'coverage',
    'vendor', '.DS_Store', 'Thumbs.db', '.env.local',
  ]);

  function readDirRecursive(dir, currentDepth) {
    const entries = [];
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.') && item.name !== '.gitignore' && item.name !== '.env') {
          continue; // Skip hidden files/dirs (except useful dotfiles)
        }
        if (SKIP_DIRS.has(item.name)) continue;

        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          const children = currentDepth < depth ? readDirRecursive(fullPath, currentDepth + 1) : [];
          entries.push({
            name: item.name,
            path: fullPath,
            type: 'directory',
            children,
          });
        } else {
          entries.push({
            name: item.name,
            path: fullPath,
            type: 'file',
          });
        }
      }
    } catch (err) {
      console.error('Failed to read directory:', dir, err.message);
    }

    // Sort: directories first, then files, alphabetical
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return entries;
  }

  return {
    name: path.basename(dirPath),
    path: dirPath,
    type: 'directory',
    children: readDirRecursive(dirPath, 0),
  };
});

// Read a single file from disk
ipcMain.handle('read-file-content', async (event, { filePath }) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, name: path.basename(filePath), path: filePath };
  } catch (err) {
    return { error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up all terminal processes
  for (const [id, proc] of terminals) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (_) {}
  }
  terminals.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
