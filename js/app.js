// CodeForge — Main Application
import { AIService, parseEditBlocks, parseCodeBlocks, applyEdits } from './ai-service.js';
import { SQLService } from './sql-service.js';

// ===== CodeMirror 6 Dynamic Import =====
// We load CM6 from CDN via importmap-style dynamic imports
const CM_CDN = 'https://esm.sh';

let cmModules = {};

async function loadCodeMirror() {
  const [
    { EditorView, basicSetup },
    { EditorState },
    { keymap },
    { indentWithTab },
    { javascript },
    { html },
    { css },
    { json },
    { markdown },
    { python },
    { xml },
    { sql },
    { rust },
    { cpp },
    { java },
    { php },
    { oneDark },
    cmLang,
    cmSearch,
    cmAutocomplete,
    cmLint,
  ] = await Promise.all([
    import(`${CM_CDN}/codemirror`),
    import(`${CM_CDN}/@codemirror/state`),
    import(`${CM_CDN}/@codemirror/view`),
    import(`${CM_CDN}/@codemirror/commands`),
    import(`${CM_CDN}/@codemirror/lang-javascript`),
    import(`${CM_CDN}/@codemirror/lang-html`),
    import(`${CM_CDN}/@codemirror/lang-css`),
    import(`${CM_CDN}/@codemirror/lang-json`),
    import(`${CM_CDN}/@codemirror/lang-markdown`),
    import(`${CM_CDN}/@codemirror/lang-python`),
    import(`${CM_CDN}/@codemirror/lang-xml`),
    import(`${CM_CDN}/@codemirror/lang-sql`),
    import(`${CM_CDN}/@codemirror/lang-rust`),
    import(`${CM_CDN}/@codemirror/lang-cpp`),
    import(`${CM_CDN}/@codemirror/lang-java`),
    import(`${CM_CDN}/@codemirror/lang-php`),
    import(`${CM_CDN}/@codemirror/theme-one-dark`),
    import(`${CM_CDN}/@codemirror/language`),
    import(`${CM_CDN}/@codemirror/search`),
    import(`${CM_CDN}/@codemirror/autocomplete`),
    import(`${CM_CDN}/@codemirror/lint`),
  ]);

  cmModules = {
    EditorView, basicSetup, EditorState, keymap, indentWithTab,
    javascript, html, css, json, markdown, python, xml, sql, rust, cpp, java, php,
    oneDark, cmLang, cmSearch, cmAutocomplete, cmLint,
  };

  return cmModules;
}

// ===== Language Support =====
const LANGUAGES = {
  javascript: { name: 'JavaScript', ext: ['.js', '.mjs', '.cjs'], icon: '📄' },
  jsx: { name: 'JSX', ext: ['.jsx'], icon: '⚛️' },
  typescript: { name: 'TypeScript', ext: ['.ts', '.mts', '.cts'], icon: '📘' },
  tsx: { name: 'TSX', ext: ['.tsx'], icon: '⚛️' },
  html: { name: 'HTML', ext: ['.html', '.htm'], icon: '🌐' },
  css: { name: 'CSS', ext: ['.css'], icon: '🎨' },
  scss: { name: 'SCSS', ext: ['.scss', '.sass'], icon: '🎨' },
  less: { name: 'Less', ext: ['.less'], icon: '🎨' },
  json: { name: 'JSON', ext: ['.json'], icon: '📋' },
  markdown: { name: 'Markdown', ext: ['.md', '.mdx'], icon: '📝' },
  python: { name: 'Python', ext: ['.py', '.pyw'], icon: '🐍' },
  xml: { name: 'XML', ext: ['.xml', '.svg'], icon: '📄' },
  sql: { name: 'SQL', ext: ['.sql'], icon: '🗃️' },
  rust: { name: 'Rust', ext: ['.rs'], icon: '🦀' },
  cpp: { name: 'C/C++', ext: ['.c', '.cpp', '.h', '.hpp', '.cc'], icon: '⚙️' },
  java: { name: 'Java', ext: ['.java'], icon: '☕' },
  php: { name: 'PHP', ext: ['.php'], icon: '🐘' },
  go: { name: 'Go', ext: ['.go'], icon: '🐹' },
  ruby: { name: 'Ruby', ext: ['.rb'], icon: '💎' },
  swift: { name: 'Swift', ext: ['.swift'], icon: '🍎' },
  kotlin: { name: 'Kotlin', ext: ['.kt', '.kts'], icon: '🟣' },
  yaml: { name: 'YAML', ext: ['.yaml', '.yml'], icon: '📋' },
  toml: { name: 'TOML', ext: ['.toml'], icon: '📋' },
  shell: { name: 'Shell', ext: ['.sh', '.bash', '.zsh'], icon: '🖥️' },
  powershell: { name: 'PowerShell', ext: ['.ps1'], icon: '🖥️' },
  dockerfile: { name: 'Dockerfile', ext: ['.dockerfile'], icon: '🐳' },
  plaintext: { name: 'Plain Text', ext: ['.txt', '.log', '.env', '.gitignore', '.cfg', '.ini', '.csv'], icon: '📄' },
  vue: { name: 'Vue', ext: ['.vue'], icon: '💚' },
  svelte: { name: 'Svelte', ext: ['.svelte'], icon: '🔶' },
};

function detectLanguage(filename) {
  if (!filename) return 'javascript';
  const ext = '.' + filename.split('.').pop().toLowerCase();
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  for (const [lang, info] of Object.entries(LANGUAGES)) {
    if (info.ext.includes(ext)) return lang;
  }
  return 'plaintext';
}

function getLanguageExtension(lang) {
  if (!cmModules.javascript) return [];
  const langMap = {
    javascript: () => cmModules.javascript({ jsx: false, typescript: false }),
    jsx: () => cmModules.javascript({ jsx: true }),
    typescript: () => cmModules.javascript({ jsx: false, typescript: true }),
    tsx: () => cmModules.javascript({ jsx: true, typescript: true }),
    html: () => cmModules.html(),
    css: () => cmModules.css(),
    scss: () => cmModules.css(),
    less: () => cmModules.css(),
    json: () => cmModules.json(),
    markdown: () => cmModules.markdown(),
    python: () => cmModules.python(),
    xml: () => cmModules.xml(),
    sql: () => cmModules.sql(),
    rust: () => cmModules.rust(),
    cpp: () => cmModules.cpp(),
    java: () => cmModules.java(),
    php: () => cmModules.php(),
    vue: () => cmModules.html(),
    svelte: () => cmModules.html(),
  };
  const factory = langMap[lang];
  return factory ? [factory()] : [];
}

// ===== App State =====
const state = {
  files: [],         // { id, name, content, language, modified, editorState }
  activeFileId: null,
  editorView: null,
  aiService: new AIService(),
  aiMessages: [],
  aiProvider: '',
  selectedCode: '',
  settings: {
    fontSize: 14,
    tabSize: 2,
    wordWrap: false,
    minimap: true,
    lineNumbers: true,
    autoSave: true,
    theme: 'monokai',
  },
  nextFileId: 1,
  sqlService: new SQLService(),
  sqlSettings: {
    autoload: true,
    maxResults: 1000,
    historyLimit: 50,
  },
  // Terminal state
  terminals: [],       // { id, xterm, container }
  activeTerminalId: null,
  terminalReady: false,
  xtermLoaded: false,
  terminalSettings: {
    shell: 'default',
    fontSize: 13,
    cursorStyle: 'block',
  },
  // Folder state
  folderPath: null,
  folderTree: null,
  expandedFolders: new Set(),
};

// ===== DOM References =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 200ms ease forwards';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// ===== Status Bar =====
function updateStatusBar() {
  const file = getActiveFile();
  if (file) {
    const langInfo = LANGUAGES[file.language] || { name: file.language };
    $('#status-language').textContent = langInfo.name;
    $('#titlebar-filename').textContent = `${file.name}${file.modified ? ' ●' : ''} — CodeForge`;
  } else {
    $('#status-language').textContent = '';
    $('#titlebar-filename').textContent = 'CodeForge';
  }
}

function updateCursorPosition(view) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const col = pos - line.from + 1;
  $('#status-cursor').textContent = `Ln ${line.number}, Col ${col}`;
}

// ===== File Management =====
function getActiveFile() {
  return state.files.find(f => f.id === state.activeFileId);
}

function createFile(name = '', content = '') {
  if (!name) {
    name = `untitled-${state.nextFileId}.js`;
  }
  const language = detectLanguage(name);
  const file = {
    id: state.nextFileId++,
    name,
    content,
    language,
    modified: false,
    editorState: null,
  };
  state.files.push(file);
  renderFileTree();
  renderTabs();
  activateFile(file.id);
  return file;
}

function openFileFromDisk() {
  $('#file-input').click();
}

function handleFileInput(e) {
  const files = e.target.files;
  if (!files.length) return;
  Array.from(files).forEach(f => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      createFile(f.name, ev.target.result);
    };
    reader.readAsText(f);
  });
  e.target.value = '';
}

function closeFile(id) {
  const idx = state.files.findIndex(f => f.id === id);
  if (idx === -1) return;

  const file = state.files[idx];
  if (file.modified) {
    if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return;
  }

  state.files.splice(idx, 1);

  if (state.activeFileId === id) {
    if (state.files.length > 0) {
      const newIdx = Math.min(idx, state.files.length - 1);
      activateFile(state.files[newIdx].id);
    } else {
      state.activeFileId = null;
      showWelcomeScreen();
    }
  }

  renderFileTree();
  renderTabs();
  updateStatusBar();
}

function activateFile(id) {
  const file = state.files.find(f => f.id === id);
  if (!file) return;

  // Save current editor state
  const currentFile = getActiveFile();
  if (currentFile && state.editorView) {
    currentFile.editorState = state.editorView.state;
  }

  state.activeFileId = id;

  // Hide welcome screen, show editor host
  const welcome = $('#welcome-screen');
  if (welcome) welcome.classList.add('hidden');
  const cmHost = $('#cm-host');
  if (cmHost) cmHost.classList.add('active');

  // Create or restore editor
  if (file.editorState) {
    if (state.editorView) {
      state.editorView.setState(file.editorState);
    } else {
      createEditor(file);
    }
  } else {
    if (state.editorView) {
      state.editorView.dispatch({
        changes: {
          from: 0,
          to: state.editorView.state.doc.length,
          insert: file.content,
        },
      });
      // Reconfigure language
      reconfigureEditor(file);
    } else {
      createEditor(file);
    }
  }

  renderFileTree();
  renderTabs();
  updateStatusBar();
  refreshPreview();
  state.editorView?.focus();
}

function showWelcomeScreen() {
  if (state.editorView) {
    state.editorView.destroy();
    state.editorView = null;
  }
  const welcome = $('#welcome-screen');
  if (welcome) welcome.classList.remove('hidden');
  const cmHost = $('#cm-host');
  if (cmHost) cmHost.classList.remove('active');
  $('#minimap').classList.add('hidden');
}

async function saveActiveFile() {
  const file = getActiveFile();
  if (!file) return;

  if (state.editorView) {
    file.content = state.editorView.state.doc.toString();
  }

  // If file has a disk path and we're in Electron, save to disk
  if (file.diskPath && window.electronAPI) {
    try {
      const result = await window.electronAPI.saveFile(file.diskPath, file.content);
      if (result.success) {
        file.modified = false;
        renderTabs();
        renderFileTree();
        updateStatusBar();
        showToast(`Saved ${file.name}`, 'success');
        return;
      } else {
        showToast(`Failed to save: ${result.error}`, 'error');
        return;
      }
    } catch (err) {
      showToast(`Save error: ${err.message}`, 'error');
      return;
    }
  }

  // Otherwise save to localStorage
  file.modified = false;
  saveFilesToStorage();
  renderTabs();
  renderFileTree();
  updateStatusBar();
  showToast(`Saved ${file.name}`, 'success');
}

function downloadActiveFile() {
  const file = getActiveFile();
  if (!file) return;

  if (state.editorView) {
    file.content = state.editorView.state.doc.toString();
  }

  const blob = new Blob([file.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${file.name}`, 'success');
}

// ===== Persistence =====
function saveFilesToStorage() {
  if (state.editorView && getActiveFile()) {
    getActiveFile().content = state.editorView.state.doc.toString();
  }

  const data = state.files.map(f => ({
    id: f.id,
    name: f.name,
    content: f.content,
    language: f.language,
  }));
  localStorage.setItem('codeforge_files', JSON.stringify(data));
  localStorage.setItem('codeforge_active', state.activeFileId);
  localStorage.setItem('codeforge_nextId', state.nextFileId);
}

function loadFilesFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem('codeforge_files') || '[]');
    const activeId = parseInt(localStorage.getItem('codeforge_active'), 10);
    const nextId = parseInt(localStorage.getItem('codeforge_nextId'), 10);

    if (nextId) state.nextFileId = nextId;

    data.forEach(f => {
      state.files.push({
        id: f.id,
        name: f.name,
        content: f.content,
        language: f.language || detectLanguage(f.name),
        modified: false,
        editorState: null,
      });
    });

    if (state.files.length > 0) {
      renderFileTree();
      renderTabs();
      const target = state.files.find(f => f.id === activeId) || state.files[0];
      activateFile(target.id);
    }
  } catch (e) {
    console.error('Failed to load saved files:', e);
  }
}

// Auto-save timer
setInterval(() => {
  if (state.settings.autoSave) {
    saveFilesToStorage();
  }
}, 5000);

// ===== Editor Setup =====
function createEditor(file) {
  const container = $('#cm-host');

  // Remove existing editor (but keep welcome screen)
  if (state.editorView) {
    state.editorView.destroy();
    state.editorView = null;
  }

  const { EditorView, basicSetup, EditorState, keymap, indentWithTab, oneDark } = cmModules;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const activeFile = getActiveFile();
      if (activeFile) {
        activeFile.modified = true;
        renderTabs();
        renderFileTree();
        updateStatusBar();
        updateMinimap();
        schedulePreviewRefresh();
      }
    }
    if (update.selectionSet) {
      updateCursorPosition(update.view);
      // Track selection for AI context
      const sel = update.state.selection.main;
      if (sel.from !== sel.to) {
        state.selectedCode = update.state.sliceDoc(sel.from, sel.to);
      } else {
        state.selectedCode = '';
      }
    }
  });

  const extensions = [
    basicSetup,
    keymap.of([indentWithTab]),
    oneDark,
    updateListener,
    EditorView.theme({
      '&': { fontSize: state.settings.fontSize + 'px' },
      '.cm-content': { fontFamily: 'var(--font-mono)' },
      '.cm-gutters': { fontFamily: 'var(--font-mono)', fontSize: (state.settings.fontSize - 2) + 'px' },
    }),
    ...getLanguageExtension(file.language),
  ];

  if (state.settings.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  const editorState = file.editorState || EditorState.create({
    doc: file.content,
    extensions,
  });

  state.editorView = new EditorView({
    state: editorState.doc ? editorState : EditorState.create({ doc: file.content, extensions }),
    parent: container,
  });

  updateCursorPosition(state.editorView);

  if (state.settings.minimap) {
    $('#minimap').classList.remove('hidden');
    updateMinimap();
  }
}

function reconfigureEditor(file) {
  if (!state.editorView) return;
  const { EditorView, basicSetup, EditorState, keymap, indentWithTab, oneDark } = cmModules;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const activeFile = getActiveFile();
      if (activeFile) {
        activeFile.modified = true;
        renderTabs();
        renderFileTree();
        updateStatusBar();
        updateMinimap();
      }
    }
    if (update.selectionSet) {
      updateCursorPosition(update.view);
      const sel = update.state.selection.main;
      state.selectedCode = sel.from !== sel.to ? update.state.sliceDoc(sel.from, sel.to) : '';
    }
  });

  const extensions = [
    basicSetup,
    keymap.of([indentWithTab]),
    oneDark,
    updateListener,
    EditorView.theme({
      '&': { fontSize: state.settings.fontSize + 'px' },
      '.cm-content': { fontFamily: 'var(--font-mono)' },
      '.cm-gutters': { fontFamily: 'var(--font-mono)', fontSize: (state.settings.fontSize - 2) + 'px' },
    }),
    ...getLanguageExtension(file.language),
  ];

  if (state.settings.wordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  state.editorView.setState(EditorState.create({
    doc: state.editorView.state.doc,
    extensions,
  }));
}

// ===== Minimap =====
function updateMinimap() {
  if (!state.settings.minimap || !state.editorView) return;
  const minimap = $('#minimap');
  if (minimap.classList.contains('hidden')) return;

  let canvas = minimap.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 60;
    minimap.appendChild(canvas);
  }

  const doc = state.editorView.state.doc;
  const lineCount = doc.lines;
  const height = Math.max(minimap.clientHeight, lineCount * 2);
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim();
  ctx.fillRect(0, 0, 60, height);

  // Draw minimap lines
  const colors = ['#a6e22e44', '#66d9ef44', '#f9267244', '#e6db7444', '#ae81ff44', '#f8f8f222'];
  for (let i = 1; i <= Math.min(lineCount, 2000); i++) {
    const line = doc.line(i);
    const text = line.text;
    const y = (i - 1) * 2;
    const len = Math.min(text.length, 60);
    if (len > 0) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(2 + (text.length - text.trimStart().length) * 0.5, y, len * 0.8, 1.5);
    }
  }
}

// ===== Render Functions =====
function renderFileTree() {
  const tree = $('#file-tree');

  // If folder is open, show open files as a secondary list
  if (state.folderPath) {
    // Show open files section
    if (state.files.length === 0) {
      tree.innerHTML = '';
      tree.style.display = 'none';
      return;
    }
    tree.style.display = '';
    tree.innerHTML = `<div class="open-files-header">OPEN EDITORS</div>` + state.files.map(f => {
      const icon = LANGUAGES[f.language]?.icon || '📄';
      const active = f.id === state.activeFileId ? 'active' : '';
      const modified = f.modified ? 'modified' : '';
      return `<div class="file-item ${active} ${modified}" data-id="${f.id}">
        <span class="file-icon">${icon}</span>
        <span class="file-name">${f.name}</span>
        <button class="file-close" data-id="${f.id}">&times;</button>
      </div>`;
    }).join('');
  } else {
    tree.style.display = '';
    if (state.files.length === 0) {
      tree.innerHTML = `<div class="file-tree-empty">
        <p>No files open</p>
        <p class="hint">Ctrl+N to create a new file</p>
        <p class="hint">Ctrl+O to open a file</p>
      </div>`;
      return;
    }

    tree.innerHTML = state.files.map(f => {
      const icon = LANGUAGES[f.language]?.icon || '📄';
      const active = f.id === state.activeFileId ? 'active' : '';
      const modified = f.modified ? 'modified' : '';
      return `<div class="file-item ${active} ${modified}" data-id="${f.id}">
        <span class="file-icon">${icon}</span>
        <span class="file-name">${f.name}</span>
        <button class="file-close" data-id="${f.id}">&times;</button>
      </div>`;
    }).join('');
  }

  // Event listeners
  tree.querySelectorAll('.file-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('file-close')) {
        closeFile(parseInt(e.target.dataset.id, 10));
      } else {
        activateFile(parseInt(el.dataset.id, 10));
      }
    });
  });
}

function renderTabs() {
  const container = $('#tabs-container');
  if (state.files.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = state.files.map(f => {
    const icon = LANGUAGES[f.language]?.icon || '📄';
    const active = f.id === state.activeFileId ? 'active' : '';
    const modified = f.modified ? 'modified' : '';
    return `<div class="tab ${active} ${modified}" data-id="${f.id}">
      <span class="tab-icon">${icon}</span>
      <span class="tab-name">${f.name}</span>
      <button class="tab-close" data-id="${f.id}">&times;</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeFile(parseInt(e.target.dataset.id, 10));
      } else {
        activateFile(parseInt(el.dataset.id, 10));
      }
    });
  });
}

// ===== Command Palette =====
const COMMANDS = [
  { name: 'New File', shortcut: 'Ctrl+N', action: () => showNewFileDialog() },
  { name: 'Open File', shortcut: 'Ctrl+O', action: () => openFileFromDisk() },
  { name: 'Save File', shortcut: 'Ctrl+S', action: () => saveActiveFile() },
  { name: 'Download File', shortcut: '', action: () => downloadActiveFile() },
  { name: 'Close File', shortcut: 'Ctrl+W', action: () => { if (state.activeFileId) closeFile(state.activeFileId); } },
  { name: 'Toggle AI Panel', shortcut: 'Ctrl+L', action: () => toggleAIPanel() },
  { name: 'Toggle Preview', shortcut: 'Ctrl+P', action: () => togglePreview() },
  { name: 'Refresh Preview', shortcut: '', action: () => refreshPreview() },
  { name: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => toggleSidebar() },
  { name: 'Settings', shortcut: 'Ctrl+,', action: () => openSettings() },
  { name: 'Change Language', shortcut: '', action: () => openLanguageSelector() },
  { name: 'AI: Explain Code', shortcut: '', action: () => aiAction('explain') },
  { name: 'AI: Improve Code', shortcut: '', action: () => aiAction('improve') },
  { name: 'AI: Fix Bugs', shortcut: '', action: () => aiAction('fix') },
  { name: 'AI: Add Comments', shortcut: '', action: () => aiAction('comment') },
  { name: 'AI: Edit Selection', shortcut: 'Ctrl+K', action: () => aiEditSelection() },
  { name: 'Next Tab', shortcut: 'Ctrl+Tab', action: () => switchTab(1) },
  { name: 'Previous Tab', shortcut: 'Ctrl+Shift+Tab', action: () => switchTab(-1) },
  { name: 'Find & Replace', shortcut: 'Ctrl+H', action: () => { if (state.editorView) cmModules.cmSearch?.openSearchPanel(state.editorView); } },
  { name: 'Toggle SQL Panel', shortcut: 'Ctrl+Shift+Q', action: () => toggleSQLPanel() },
  { name: 'Execute SQL', shortcut: 'Ctrl+Shift+Enter', action: () => executeSQL() },
  { name: 'New Database', shortcut: '', action: () => createNewDatabase() },
  { name: 'Open Database File', shortcut: '', action: () => openDatabaseFile() },
  { name: 'Export Database', shortcut: '', action: () => exportDatabase() },
  { name: 'Toggle Terminal', shortcut: 'Ctrl+J', action: () => toggleTerminalPanel() },
  { name: 'New Terminal', shortcut: '', action: () => createTerminal() },
  { name: 'Close Terminal', shortcut: '', action: () => closeActiveTerminal() },
  { name: 'Open Folder', shortcut: '', action: () => openFolder() },
  { name: 'Close Folder', shortcut: '', action: () => closeFolder() },
  { name: 'Refresh Explorer', shortcut: '', action: () => refreshFolderTree() },
];

function openCommandPalette() {
  const modal = $('#command-palette');
  modal.classList.remove('hidden');
  const input = $('#palette-input');
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

function closeCommandPalette() {
  $('#command-palette').classList.add('hidden');
}

function renderPaletteResults(query) {
  const results = $('#palette-results');
  const filtered = COMMANDS.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );
  results.innerHTML = filtered.map((c, i) =>
    `<div class="palette-item${i === 0 ? ' selected' : ''}" data-index="${i}">
      <span>${c.name}</span>
      ${c.shortcut ? `<span class="palette-shortcut">${c.shortcut}</span>` : ''}
    </div>`
  ).join('');

  results.querySelectorAll('.palette-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      filtered[i].action();
      closeCommandPalette();
    });
  });
}

// ===== Language Selector =====
function openLanguageSelector() {
  const modal = $('#language-modal');
  modal.classList.remove('hidden');
  const input = $('#language-input');
  input.value = '';
  input.focus();
  renderLanguageResults('');
}

function closeLanguageSelector() {
  $('#language-modal').classList.add('hidden');
}

function renderLanguageResults(query) {
  const results = $('#language-results');
  const filtered = Object.entries(LANGUAGES).filter(([key, info]) =>
    info.name.toLowerCase().includes(query.toLowerCase()) ||
    key.toLowerCase().includes(query.toLowerCase())
  );
  results.innerHTML = filtered.map(([key, info], i) =>
    `<div class="palette-item${i === 0 ? ' selected' : ''}" data-lang="${key}">
      <span>${info.icon} ${info.name}</span>
      <span class="palette-shortcut">${info.ext.join(', ')}</span>
    </div>`
  ).join('');

  results.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('click', () => {
      const lang = el.dataset.lang;
      const file = getActiveFile();
      if (file) {
        file.language = lang;
        if (state.editorView) reconfigureEditor(file);
        updateStatusBar();
      }
      closeLanguageSelector();
    });
  });
}

// ===== New File Dialog =====
function showNewFileDialog() {
  const modal = $('#new-file-modal');
  modal.classList.remove('hidden');
  const input = $('#new-file-name');
  input.value = `untitled-${state.nextFileId}.js`;
  input.focus();
  input.select();
}

function closeNewFileDialog() {
  $('#new-file-modal').classList.add('hidden');
}

// ===== Settings =====
function openSettings() {
  const modal = $('#settings-modal');
  modal.classList.remove('hidden');

  // Load saved keys
  ['openai', 'claude', 'gemini', 'perplexity'].forEach(provider => {
    const input = $(`#key-${provider}`);
    if (input) input.value = state.aiService.getApiKey(provider);
    const modelSelect = $(`#model-${provider}`);
    if (modelSelect) modelSelect.value = state.aiService.getModel(provider);
  });

  // Load editor settings
  $('#setting-font-size').value = state.settings.fontSize;
  $('#setting-tab-size').value = state.settings.tabSize;
  $('#setting-word-wrap').checked = state.settings.wordWrap;
  $('#setting-minimap').checked = state.settings.minimap;
  $('#setting-line-numbers').checked = state.settings.lineNumbers;
  $('#setting-auto-save').checked = state.settings.autoSave;

  // Active theme
  $$('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === state.settings.theme);
  });

  // Database settings
  $('#setting-db-autoload').checked = state.sqlSettings.autoload;
  $('#setting-db-max-results').value = state.sqlSettings.maxResults;
  $('#setting-db-history-limit').value = state.sqlSettings.historyLimit;

  // Saved databases list
  const savedDbList = $('#saved-databases-list');
  const savedDbs = state.sqlService.getSavedDatabaseNames();
  if (savedDbs.length > 0) {
    savedDbList.innerHTML = savedDbs.map(name =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);">
        <span style="font-size:13px;">🗃️ ${escapeHtml(name)}</span>
        <button class="btn btn-danger" style="padding:2px 8px;font-size:11px;" data-delete-db="${escapeHtml(name)}">Delete</button>
      </div>`
    ).join('');
    // Wire up delete buttons
    savedDbList.querySelectorAll('[data-delete-db]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dbName = btn.dataset.deleteDb;
        if (confirm(`Delete saved database "${dbName}"? This cannot be undone.`)) {
          state.sqlService.deleteSavedDatabase(dbName);
          updateDatabaseSelect();
          refreshSchema();
          openSettings(); // Re-render settings
          showToast(`Database "${dbName}" deleted`, 'info');
        }
      });
    });
  } else {
    savedDbList.innerHTML = '<p class="settings-desc">No saved databases</p>';
  }
}

function closeSettings() {
  $('#settings-modal').classList.add('hidden');
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('codeforge_settings') || '{}');
    Object.assign(state.settings, saved);
    applyTheme(state.settings.theme);
  } catch (e) {
    console.error('Failed to load settings:', e);
  }

  // Load SQL settings
  try {
    const sqlSaved = JSON.parse(localStorage.getItem('codeforge_sql_settings') || '{}');
    Object.assign(state.sqlSettings, sqlSaved);
  } catch (e) {
    console.error('Failed to load SQL settings:', e);
  }

  // Load Terminal settings
  try {
    const termSaved = JSON.parse(localStorage.getItem('codeforge_terminal_settings') || '{}');
    Object.assign(state.terminalSettings, termSaved);
  } catch (e) {
    console.error('Failed to load terminal settings:', e);
  }
}

function saveSettings() {
  localStorage.setItem('codeforge_settings', JSON.stringify(state.settings));
}

function applyTheme(theme) {
  state.settings.theme = theme;
  if (theme === 'monokai') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
  saveSettings();
}

// ===== Sidebar Toggle =====
function toggleSidebar() {
  $('#sidebar').classList.toggle('collapsed');
}

// ===== Tab Switching =====
function switchTab(direction) {
  if (state.files.length <= 1) return;
  const idx = state.files.findIndex(f => f.id === state.activeFileId);
  let newIdx = idx + direction;
  if (newIdx >= state.files.length) newIdx = 0;
  if (newIdx < 0) newIdx = state.files.length - 1;
  activateFile(state.files[newIdx].id);
}

// ===== AI Panel =====
function toggleAIPanel() {
  const panel = $('#ai-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    $('#ai-chat-input').focus();
    // Auto-select provider if only one is available
    if (!state.aiProvider) {
      const available = state.aiService.getAvailableProviders();
      if (available.length > 0) {
        state.aiProvider = available[0];
        $('#ai-provider-select').value = state.aiProvider;
      }
    }
  }
}

function addAIMessage(role, content) {
  state.aiMessages.push({ role, content });
  renderAIMessages();
}

function renderAIMessages() {
  const container = $('#ai-chat-messages');
  if (state.aiMessages.length === 0) {
    container.innerHTML = `<div class="ai-welcome">
      <div class="ai-welcome-icon">🤖</div>
      <h3>AI Assistant</h3>
      <p>Ask questions about your code, request edits, or get help debugging.</p>
      <p class="ai-welcome-hint">Configure your API key in Settings (Ctrl+,)</p>
    </div>`;
    return;
  }

  container.innerHTML = state.aiMessages.map(msg => {
    const label = msg.role === 'user' ? 'You' : 'AI';
    const formattedContent = formatAIMessage(msg.content);
    return `<div class="ai-message ${msg.role}">
      <div class="ai-message-label">${label}</div>
      <div class="ai-message-body">${formattedContent}</div>
    </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function formatAIMessage(text) {
  // Handle EDIT blocks specially — show them with a visual diff style
  text = text.replace(/```EDIT\n([\s\S]*?)```/g, (match, editContent) => {
    const escaped = escapeHtml(editContent.trim());
    const rawEscaped = escapeHtml(editContent);
    return `<pre class="edit-block" data-edit-block="true" data-raw-edit="${rawEscaped.replace(/"/g, '&quot;')}"><div class="code-block-header"><span class="code-block-lang">EDIT</span><button class="code-copy-btn" onclick="window.__copyCode(this)">Copy</button><button class="code-apply-btn" onclick="window.__applyCode(this)">Apply Edits</button></div>${formatEditBlock(editContent)}</pre>`;
  });

  // Convert regular code blocks
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = escapeHtml(code.trim());
    return `<pre><div class="code-block-header"><span class="code-block-lang">${lang || 'code'}</span><button class="code-copy-btn" onclick="window.__copyCode(this)">Copy</button><button class="code-apply-btn" onclick="window.__applyCode(this)">Apply</button></div>${escaped}</pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Line breaks -> paragraphs
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');

  if (!text.startsWith('<pre') && !text.startsWith('<p')) {
    text = `<p>${text}</p>`;
  }

  return text;
}

function formatEditBlock(editContent) {
  // Color-code FIND (red) and REPLACE (green) sections
  return editContent
    .split('\n')
    .map(line => {
      if (line.startsWith('<<<FIND')) return `<span class="edit-marker find-marker"><<<FIND</span>`;
      if (line.startsWith('>>>REPLACE')) return `<span class="edit-marker replace-marker">>>>REPLACE</span>`;
      return escapeHtml(line);
    })
    .join('\n');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Editor Context Helpers =====
function getEditorContext() {
  const file = getActiveFile();
  const view = state.editorView;
  const context = {
    filename: file?.name || null,
    language: file?.language || null,
    code: null,
    selectedCode: null,
    selectionRange: null,
    cursorLine: 1,
    cursorCol: 1,
    totalLines: 0,
    openFiles: state.files.map(f => f.name),
  };

  if (view && file) {
    context.code = view.state.doc.toString();
    context.totalLines = view.state.doc.lines;

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    context.cursorLine = line.number;
    context.cursorCol = pos - line.from + 1;

    const sel = view.state.selection.main;
    if (sel.from !== sel.to) {
      context.selectedCode = view.state.sliceDoc(sel.from, sel.to);
      const fromLine = view.state.doc.lineAt(sel.from);
      const toLine = view.state.doc.lineAt(sel.to);
      context.selectionRange = {
        fromLine: fromLine.number,
        toLine: toLine.number,
        from: sel.from,
        to: sel.to,
      };
    }
  }

  return context;
}

// Global functions for code block buttons
window.__copyCode = function(btn) {
  const pre = btn.closest('pre');
  const code = pre.textContent.replace(/^.*Copy.*Apply.*$/m, '').trim();
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
};

window.__applyCode = function(btn) {
  const pre = btn.closest('pre');
  const isEditBlock = pre.dataset.editBlock === 'true';
  const code = pre.textContent.replace(/^.*Copy.*Apply.*$/m, '').trim();

  if (!state.editorView) return;
  const view = state.editorView;

  if (isEditBlock) {
    // Parse and apply FIND/REPLACE edits
    const rawBlock = pre.dataset.rawEdit || '';
    const edits = [];
    const pairRegex = /<<<FIND\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)(?=<<<FIND|$)/g;
    let m;
    while ((m = pairRegex.exec(rawBlock)) !== null) {
      edits.push({ find: m[1].replace(/\n$/, ''), replace: m[2].replace(/\n$/, '') });
    }

    if (edits.length > 0) {
      const currentCode = view.state.doc.toString();
      const { newCode, appliedCount } = applyEdits(currentCode, edits);
      if (appliedCount > 0) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newCode },
        });
        showToast(`Applied ${appliedCount} edit(s) to editor`, 'success');
      } else {
        showToast('Could not match edits — code may have changed', 'error');
      }
    }
  } else {
    // Regular code block: apply based on selection or replace entire file
    const sel = view.state.selection.main;
    if (sel.from !== sel.to) {
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: code },
      });
      showToast('Code replaced selection', 'success');
    } else {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
      });
      showToast('Code applied to file', 'success');
    }
  }
};

async function sendAIMessage(userMessage) {
  if (!userMessage.trim()) return;

  const provider = state.aiProvider || $('#ai-provider-select').value;
  if (!provider) {
    showToast('Please select an AI provider', 'error');
    return;
  }
  state.aiProvider = provider;

  // Gather full editor context
  const ctx = getEditorContext();

  // Build system prompt with full awareness
  const systemPrompt = state.aiService.buildSystemPrompt(ctx);

  // Build the context-rich user message
  const fullMessage = state.aiService.buildContextMessage(userMessage, ctx);

  // Store the display version (without the huge code dump)
  addAIMessage('user', userMessage);

  // Show loading
  const container = $('#ai-chat-messages');
  const loading = document.createElement('div');
  loading.className = 'ai-loading';
  loading.innerHTML = '<div class="ai-loading-dots"><span></span><span></span><span></span></div> Thinking...';
  container.appendChild(loading);
  container.scrollTop = container.scrollHeight;

  // Disable input
  $('#ai-send-btn').disabled = true;
  $('#ai-chat-input').disabled = true;

  try {
    // Build messages: system + history (with last user msg swapped to full context version)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...state.aiMessages.map(m => ({ role: m.role, content: m.content })),
    ];
    // Replace the last user message with the context-enriched version
    messages[messages.length - 1] = { role: 'user', content: fullMessage };

    const response = await state.aiService.sendMessage(provider, messages);
    loading.remove();

    // Check for EDIT blocks and auto-apply if found
    const editBlocks = parseEditBlocks(response);
    if (editBlocks.length > 0 && state.editorView) {
      const currentCode = state.editorView.state.doc.toString();
      const { newCode, appliedCount } = applyEdits(currentCode, editBlocks);
      if (appliedCount > 0) {
        state.editorView.dispatch({
          changes: { from: 0, to: state.editorView.state.doc.length, insert: newCode },
        });
        showToast(`AI applied ${appliedCount} edit(s) to your code`, 'success');
      }
    }

    addAIMessage('assistant', response);
  } catch (error) {
    loading.remove();
    if (error.name === 'AbortError') return;
    const errDiv = document.createElement('div');
    errDiv.className = 'ai-error';
    errDiv.textContent = error.message;
    container.appendChild(errDiv);
    container.scrollTop = container.scrollHeight;
  } finally {
    $('#ai-send-btn').disabled = false;
    $('#ai-chat-input').disabled = false;
    $('#ai-chat-input').focus();
  }
}

function aiAction(action) {
  if (!state.selectedCode && !getActiveFile()) {
    showToast('Select some code first, or open a file', 'info');
    return;
  }

  // Open AI panel if hidden
  const panel = $('#ai-panel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
  }

  const prompts = {
    explain: 'Explain what this code does, step by step.',
    improve: 'Suggest improvements for this code. Focus on readability, performance, and best practices.',
    fix: 'Find and fix any bugs in this code. Explain what was wrong.',
    comment: 'Add clear, concise comments to this code.',
  };

  sendAIMessage(prompts[action]);
}

function aiEditSelection() {
  if (!state.selectedCode) {
    showToast('Select some code first', 'info');
    return;
  }

  // Show AI panel and focus input with context
  const panel = $('#ai-panel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
  }

  // Show context bar
  const contextBar = $('#ai-context-bar');
  const contextText = $('#ai-context-text');
  contextBar.style.display = 'flex';
  const lines = state.selectedCode.split('\n');
  contextText.textContent = `${lines.length} line${lines.length > 1 ? 's' : ''} selected`;

  $('#ai-chat-input').placeholder = 'How should I edit this code?';
  $('#ai-chat-input').focus();
}

// ===== Live Preview Panel =====
let previewDebounceTimer = null;

function togglePreview() {
  const panel = $('#preview-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    refreshPreview();
  }
}

function refreshPreview() {
  const panel = $('#preview-panel');
  if (panel.classList.contains('hidden')) return;

  const file = getActiveFile();
  if (!file || !state.editorView) {
    showPreviewEmpty(true);
    return;
  }

  const code = state.editorView.state.doc.toString();
  if (!code.trim()) {
    showPreviewEmpty(true);
    return;
  }

  const mode = $('#preview-mode-select').value;
  const detectedMode = mode === 'auto' ? detectPreviewMode(file) : mode;

  if (!detectedMode) {
    showPreviewEmpty(true);
    return;
  }

  showPreviewEmpty(false);
  const iframe = $('#preview-iframe');
  const urlText = $('#preview-url-text');
  urlText.textContent = `preview://${file.name}`;

  let html;
  switch (detectedMode) {
    case 'html':
      html = code;
      break;
    case 'markdown':
      html = renderMarkdownToHTML(code, file.name);
      break;
    case 'css':
      html = wrapCSSPreview(code, file.name);
      break;
    case 'javascript':
    case 'jsx':
    case 'typescript':
    case 'tsx':
      html = wrapJSPreview(code, file.name);
      break;
    default:
      html = wrapGenericPreview(code, file.name);
  }

  // Write to iframe using srcdoc for sandboxed rendering
  iframe.srcdoc = html;
}

function detectPreviewMode(file) {
  const lang = file.language;
  const ext = file.name.split('.').pop().toLowerCase();

  if (['html', 'vue', 'svelte'].includes(lang) || ['html', 'htm'].includes(ext)) return 'html';
  if (['markdown'].includes(lang) || ['md', 'mdx'].includes(ext)) return 'markdown';
  if (['css', 'scss', 'less'].includes(lang)) return 'css';
  if (['javascript', 'jsx', 'typescript', 'tsx'].includes(lang)) return 'javascript';
  return null; // no preview for this type
}

function showPreviewEmpty(show) {
  const empty = $('#preview-empty');
  const iframe = $('#preview-iframe');
  if (show) {
    empty.classList.remove('hidden');
    iframe.srcdoc = '';
  } else {
    empty.classList.add('hidden');
  }
}

function renderMarkdownToHTML(md, filename) {
  // Simple markdown → HTML converter (handles the basics)
  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
      `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`)
    // Headings
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold / Italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    // Unordered lists
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Wrap <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>(\s*<br>)*)+/gs, (match) => {
    return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 800px; margin: 0 auto; padding: 24px; color: #e0e0e0; background: #1e1e1e; line-height: 1.7; }
  h1,h2,h3,h4,h5,h6 { color: #fff; margin-top: 1.5em; border-bottom: 1px solid #333; padding-bottom: 4px; }
  a { color: #58a6ff; }
  code { background: #2d2d2d; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre { background: #2d2d2d; padding: 14px; border-radius: 6px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
  blockquote { border-left: 3px solid #444; margin: 0; padding: 4px 16px; color: #aaa; }
  img { border-radius: 6px; }
  hr { border: none; border-top: 1px solid #333; margin: 24px 0; }
  ul, ol { padding-left: 24px; }
</style></head><body><p>${html}</p></body></html>`;
}

function wrapCSSPreview(css, filename) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>CSS Preview: ${escapeHtml(filename)}</title>
<style>${css}</style>
<style>body { font-family: sans-serif; padding: 20px; background: #fff; color: #333; }
.demo-box { padding: 20px; margin: 10px; border: 1px solid #ddd; border-radius: 8px; }
</style></head><body>
<h1>CSS Preview</h1>
<div class="demo-box"><h2>Heading</h2><p>Paragraph with <a href="#">a link</a> and <strong>bold text</strong>.</p>
<button>Button</button> <input type="text" placeholder="Input">
</div>
<div class="demo-box"><ul><li>List item 1</li><li>List item 2</li><li>List item 3</li></ul></div>
</body></html>`;
}

function wrapJSPreview(js, filename) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>JS Preview: ${escapeHtml(filename)}</title>
<style>
  body { font-family: monospace; padding: 16px; background: #1e1e1e; color: #d4d4d4; font-size: 13px; }
  .console-log { padding: 4px 8px; border-bottom: 1px solid #333; white-space: pre-wrap; }
  .console-error { color: #f48771; background: rgba(244,135,113,0.1); }
  .console-warn { color: #cca700; }
  #output { border: 1px solid #333; border-radius: 4px; overflow: hidden; }
  h3 { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
</style></head><body>
<h3>Console Output</h3>
<div id="output"></div>
<script>
(function() {
  const output = document.getElementById('output');
  function addLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'console-log ' + (cls || '');
    div.textContent = typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
    output.appendChild(div);
  }
  const origLog = console.log, origError = console.error, origWarn = console.warn;
  console.log = function(...args) { args.forEach(a => addLine(a)); origLog.apply(console, args); };
  console.error = function(...args) { args.forEach(a => addLine(a, 'console-error')); origError.apply(console, args); };
  console.warn = function(...args) { args.forEach(a => addLine(a, 'console-warn')); origWarn.apply(console, args); };
  try {
${js}
  } catch(e) { addLine('Error: ' + e.message, 'console-error'); }
})();
<\/script></body></html>`;
}

function wrapGenericPreview(code, filename) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title>
<style>body { font-family: monospace; padding: 16px; background: #1e1e1e; color: #d4d4d4; white-space: pre-wrap; font-size: 13px; line-height: 1.5; }</style>
</head><body>${escapeHtml(code)}</body></html>`;
}

function schedulePreviewRefresh() {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => refreshPreview(), 500);
}

// ===== SQL Panel =====
let sqlHistoryOpen = false;

function toggleSQLPanel() {
  const panel = $('#sql-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    initSQLPanel();
  }
}

async function initSQLPanel() {
  if (!state.sqlService.loaded) {
    $('#sql-status').textContent = 'Loading SQL engine...';
    try {
      await state.sqlService.loadSqlJs();
      $('#sql-status').textContent = 'Ready';
      showToast('SQL engine loaded', 'success');
    } catch (e) {
      $('#sql-status').textContent = 'Failed to load';
      showToast('Failed to load SQL engine. Check internet connection.', 'error');
      return;
    }
  }

  // Load saved databases
  const saved = state.sqlService.getSavedDatabaseNames();
  if (saved.length > 0 && state.sqlSettings.autoload) {
    for (const name of saved) {
      if (!state.sqlService.databases[name]) {
        state.sqlService.loadDatabaseFromStorage(name);
      }
    }
  }

  // If no database exists, create a default one
  if (state.sqlService.getDatabaseNames().length === 0) {
    state.sqlService.createDatabase('default');
  }

  updateDatabaseSelect();
  refreshSchema();
}

function updateDatabaseSelect() {
  const select = $('#sql-db-select');
  const names = state.sqlService.getDatabaseNames();
  const active = state.sqlService.activeDb;
  select.innerHTML = names.length === 0
    ? '<option value="">No Database</option>'
    : names.map(n => `<option value="${n}" ${n === active ? 'selected' : ''}>${n}</option>`).join('');
}

function executeSQL() {
  // Get SQL from editor: use selection if available, otherwise full file
  let sql = '';
  if (state.editorView) {
    const sel = state.editorView.state.selection.main;
    if (sel.from !== sel.to) {
      sql = state.editorView.state.sliceDoc(sel.from, sel.to);
    } else {
      sql = state.editorView.state.doc.toString();
    }
  }

  if (!sql.trim()) {
    showToast('No SQL to execute', 'info');
    return;
  }

  // Open SQL panel if hidden
  const panel = $('#sql-panel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    initSQLPanel().then(() => runQuery(sql));
    return;
  }

  // Make sure engine is loaded
  if (!state.sqlService.loaded) {
    initSQLPanel().then(() => runQuery(sql));
    return;
  }

  runQuery(sql);
}

function runQuery(sql) {
  const db = state.sqlService.getActiveDatabase();
  if (!db) {
    showToast('No database open. Create or open one first.', 'error');
    return;
  }

  $('#sql-status').textContent = 'Running...';
  const result = state.sqlService.executeQuery(sql);

  if (result.error) {
    $('#sql-error').textContent = result.error;
    $('#sql-status').textContent = 'Error';
    $('#sql-row-count').textContent = '';
    $('#sql-exec-time').textContent = result.executionTime + 'ms';
    return;
  }

  // Clear error
  $('#sql-error').textContent = '';

  // Update status
  $('#sql-status').textContent = 'Success';
  $('#sql-row-count').textContent = `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''}`;
  $('#sql-exec-time').textContent = `${result.executionTime}ms`;

  // Render results
  renderSQLResults(result);

  // Refresh schema (in case of DDL statements)
  refreshSchema();

  // Auto-save database
  if (state.sqlService.activeDb) {
    state.sqlService.saveDatabaseToStorage(state.sqlService.activeDb);
  }

  // Flash success
  const footer = $('#sql-footer');
  footer.classList.remove('sql-success-flash');
  void footer.offsetWidth; // force reflow
  footer.classList.add('sql-success-flash');
}

function renderSQLResults(result) {
  const empty = $('#sql-results-empty');
  const wrap = $('#sql-results-table-wrap');
  const thead = $('#sql-results-thead');
  const tbody = $('#sql-results-tbody');

  if (!result.columns || result.columns.length === 0) {
    // Statement executed but no rows returned (INSERT, UPDATE, CREATE, etc.)
    empty.querySelector('p').textContent = `Query executed successfully${result.rowCount > 0 ? ` (${result.rowCount} rows affected)` : ''}`;
    empty.style.display = '';
    wrap.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  wrap.style.display = '';

  // Render headers
  thead.innerHTML = `<tr>${result.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;

  // Render rows (respect maxResults limit)
  const maxRows = state.sqlSettings.maxResults;
  const rows = result.rows.slice(0, maxRows);
  tbody.innerHTML = rows.map(row =>
    `<tr>${row.map(cell => {
      if (cell === null) return `<td><span class="sql-null">NULL</span></td>`;
      if (typeof cell === 'number') return `<td class="sql-number">${cell}</td>`;
      return `<td title="${escapeHtml(String(cell))}">${escapeHtml(String(cell))}</td>`;
    }).join('')}</tr>`
  ).join('');

  if (result.rows.length > maxRows) {
    tbody.innerHTML += `<tr><td colspan="${result.columns.length}" style="text-align:center;color:var(--warning);padding:8px;">
      Showing ${maxRows} of ${result.rows.length} rows. Adjust limit in Settings &gt; Database.
    </td></tr>`;
  }
}

function refreshSchema() {
  const tree = $('#sql-schema-tree');
  if (!state.sqlService.loaded) {
    tree.innerHTML = '<div class="sql-schema-empty">Engine not loaded</div>';
    return;
  }

  const schema = state.sqlService.getSchema();

  if (!schema || schema.length === 0) {
    tree.innerHTML = '<div class="sql-schema-empty">No tables</div>';
    return;
  }

  tree.innerHTML = schema.map(table => {
    const columns = table.columns.map(col => {
      const pkBadge = col.pk ? ' <span class="sql-column-pk">PK</span>' : '';
      return `<div class="sql-column-item">${escapeHtml(col.name)} <span class="sql-column-type">${col.type}</span>${pkBadge}</div>`;
    }).join('');

    return `<div class="sql-table-group">
      <div class="sql-table-item" data-table="${escapeHtml(table.table)}">
        <span>📋</span> ${escapeHtml(table.table)}
      </div>
      <div class="sql-table-columns">${columns}</div>
    </div>`;
  }).join('');

  // Click on table name to toggle columns + insert SELECT
  tree.querySelectorAll('.sql-table-item').forEach(el => {
    el.addEventListener('click', () => {
      const group = el.closest('.sql-table-group');
      group.classList.toggle('expanded');
    });

    el.addEventListener('dblclick', () => {
      const tableName = el.dataset.table;
      if (state.editorView) {
        const query = `SELECT * FROM ${tableName} LIMIT 100;`;
        const pos = state.editorView.state.selection.main.head;
        state.editorView.dispatch({
          changes: { from: pos, to: pos, insert: query },
        });
        state.editorView.focus();
      }
    });
  });
}

function createNewDatabase() {
  const name = prompt('Database name:', `db_${Date.now()}`);
  if (!name || !name.trim()) return;

  // Ensure engine is loaded
  if (!state.sqlService.loaded) {
    initSQLPanel().then(() => {
      try {
        state.sqlService.createDatabase(name.trim());
        updateDatabaseSelect();
        refreshSchema();
        showToast(`Created database: ${name.trim()}`, 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
    return;
  }

  try {
    state.sqlService.createDatabase(name.trim());
    updateDatabaseSelect();
    refreshSchema();
    showToast(`Created database: ${name.trim()}`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openDatabaseFile() {
  // If running in Electron, use native dialog
  if (window.electronAPI?.openDbDialog) {
    window.electronAPI.openDbDialog().then(result => {
      if (result && result.data) {
        const data = new Uint8Array(result.data);
        const name = result.name.replace(/\.(db|sqlite|sqlite3)$/, '');
        if (!state.sqlService.loaded) {
          initSQLPanel().then(() => {
            state.sqlService.openDatabaseFromFile(name, data);
            updateDatabaseSelect();
            refreshSchema();
            showToast(`Opened database: ${name}`, 'success');
          });
        } else {
          state.sqlService.openDatabaseFromFile(name, data);
          updateDatabaseSelect();
          refreshSchema();
          showToast(`Opened database: ${name}`, 'success');
        }
      }
    });
    return;
  }

  // Browser fallback
  $('#db-file-input').click();
}

function handleDatabaseFileInput(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const data = new Uint8Array(ev.target.result);
    const name = file.name.replace(/\.(db|sqlite|sqlite3)$/, '');
    if (!state.sqlService.loaded) {
      initSQLPanel().then(() => {
        state.sqlService.openDatabaseFromFile(name, data);
        updateDatabaseSelect();
        refreshSchema();
        showToast(`Opened database: ${name}`, 'success');
      });
    } else {
      state.sqlService.openDatabaseFromFile(name, data);
      updateDatabaseSelect();
      refreshSchema();
      showToast(`Opened database: ${name}`, 'success');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function exportDatabase() {
  if (!state.sqlService.loaded || !state.sqlService.getActiveDatabase()) {
    showToast('No database to export', 'error');
    return;
  }

  const data = state.sqlService.exportDatabase();
  if (!data) {
    showToast('Failed to export database', 'error');
    return;
  }

  // If running in Electron, use native save dialog
  if (window.electronAPI?.saveDbDialog) {
    const filename = `${state.sqlService.activeDb || 'database'}.db`;
    window.electronAPI.saveDbDialog(filename, Array.from(data)).then(result => {
      if (result && result.success) {
        showToast(`Database exported to ${result.path}`, 'success');
      }
    });
    return;
  }

  // Browser fallback — download via blob
  const blob = new Blob([data], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.sqlService.activeDb || 'database'}.db`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Database exported', 'success');
}

function showSQLHistory() {
  const dropdown = $('#sql-history-dropdown');
  sqlHistoryOpen = !sqlHistoryOpen;
  dropdown.classList.toggle('open', sqlHistoryOpen);

  if (!sqlHistoryOpen) return;

  const history = state.sqlService.getQueryHistory();
  if (history.length === 0) {
    dropdown.innerHTML = '<div class="sql-history-empty">No query history</div>';
    return;
  }

  dropdown.innerHTML = history.slice(0, state.sqlSettings.historyLimit).map((h, i) => {
    const time = new Date(h.timestamp).toLocaleTimeString();
    const truncQuery = h.query.length > 80 ? h.query.substring(0, 80) + '...' : h.query;
    const errorClass = h.error ? ' sql-history-error' : '';
    return `<div class="sql-history-item${errorClass}" data-index="${i}">
      <div class="sql-history-query">${escapeHtml(truncQuery)}</div>
      <div class="sql-history-meta">
        <span>${time}</span>
        <span>${h.rowCount} rows</span>
        <span>${h.executionTime}ms</span>
        ${h.error ? `<span style="color:var(--danger)">Error</span>` : ''}
      </div>
    </div>`;
  }).join('');

  // Click on history item to insert query into editor
  dropdown.querySelectorAll('.sql-history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index, 10);
      const query = history[idx]?.query;
      if (query && state.editorView) {
        const pos = state.editorView.state.selection.main.head;
        state.editorView.dispatch({
          changes: { from: pos, to: pos, insert: query },
        });
        state.editorView.focus();
      }
      sqlHistoryOpen = false;
      dropdown.classList.remove('open');
    });
  });
}

// Close history dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (sqlHistoryOpen && !e.target.closest('#btn-sql-history')) {
    sqlHistoryOpen = false;
    $('#sql-history-dropdown')?.classList.remove('open');
  }
});

// ===== Terminal Panel =====
let xtermModule = null;
let fitAddonModule = null;
let terminalCounter = 0;

function toggleTerminalPanel() {
  const panel = $('#terminal-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    initTerminal();
  }
}

async function initTerminal() {
  // Check if we're in Electron and have terminal support
  const isElectron = !!window.electronAPI;

  if (!isElectron) {
    $('#terminal-container').style.display = 'none';
    $('#terminal-fallback').classList.remove('hidden');
    return;
  }

  // Check if node-pty is available
  try {
    const check = await window.electronAPI.terminalCheck();
    if (!check.available) {
      $('#terminal-container').style.display = 'none';
      $('#terminal-fallback').classList.remove('hidden');
      $('#terminal-fallback').querySelector('p').textContent = 'Terminal requires node-pty. Run: npm install && npx electron-rebuild';
      return;
    }
  } catch (_) {}

  // Load xterm.js if not already loaded
  if (!state.xtermLoaded) {
    await loadXterm();
  }

  // Create first terminal if none exist
  if (state.terminals.length === 0) {
    await createTerminal();
  } else {
    // Fit existing terminal to panel
    const active = state.terminals.find(t => t.id === state.activeTerminalId);
    if (active && active.fitAddon) {
      setTimeout(() => active.fitAddon.fit(), 50);
    }
  }
}

async function loadXterm() {
  if (state.xtermLoaded) return;

  return new Promise((resolve, reject) => {
    // Load xterm.js CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.min.css';
    document.head.appendChild(link);

    // Load xterm.js
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5/lib/xterm.min.js';
    script.onload = () => {
      // Load fit addon
      const fitScript = document.createElement('script');
      fitScript.src = 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0/lib/addon-fit.min.js';
      fitScript.onload = () => {
        state.xtermLoaded = true;
        resolve();
      };
      fitScript.onerror = () => reject(new Error('Failed to load xterm fit addon'));
      document.head.appendChild(fitScript);
    };
    script.onerror = () => reject(new Error('Failed to load xterm.js'));
    document.head.appendChild(script);
  });
}

function getXtermTheme() {
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--bg-primary').trim() || '#272822';
  const fg = style.getPropertyValue('--text-primary').trim() || '#f8f8f2';
  const cursor = style.getPropertyValue('--accent').trim() || '#a6e22e';

  return {
    background: bg,
    foreground: fg,
    cursor: cursor,
    cursorAccent: bg,
    selectionBackground: 'rgba(255, 255, 255, 0.15)',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#e6db74',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#e6db74',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  };
}

async function createTerminal() {
  if (!state.xtermLoaded || !window.electronAPI) return;

  terminalCounter++;
  const termId = `terminal-${terminalCounter}`;

  // Create container div
  const container = document.createElement('div');
  container.className = 'terminal-instance';
  container.id = termId;
  $('#terminal-container').appendChild(container);

  // Create xterm instance
  const xterm = new window.Terminal({
    fontSize: state.terminalSettings.fontSize,
    fontFamily: 'var(--font-mono), "Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
    cursorStyle: state.terminalSettings.cursorStyle,
    cursorBlink: true,
    theme: getXtermTheme(),
    allowProposedApi: true,
  });

  const fitAddon = new window.FitAddon.FitAddon();
  xterm.loadAddon(fitAddon);

  xterm.open(container);

  // Fit to container
  setTimeout(() => fitAddon.fit(), 50);

  // Spawn pty process
  const cwd = state.folderPath || undefined;
  const result = await window.electronAPI.createTerminal({
    cols: xterm.cols,
    rows: xterm.rows,
    cwd,
    shell: state.terminalSettings.shell,
  });

  if (result.error) {
    showToast(`Failed to create terminal: ${result.error}`, 'error');
    container.remove();
    return;
  }

  const ptyId = result.id;

  // Wire data from pty to xterm
  const dataHandler = (data) => {
    if (data.id === ptyId) {
      xterm.write(data.data);
    }
  };

  const exitHandler = (data) => {
    if (data.id === ptyId) {
      xterm.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
      // Remove terminal from state
      closeTerminal(termId);
    }
  };

  window.electronAPI.onTerminalData(dataHandler);
  window.electronAPI.onTerminalExit(exitHandler);

  // Wire data from xterm to pty
  xterm.onData((data) => {
    window.electronAPI.writeTerminal(ptyId, data);
  });

  // Store terminal info
  const termInfo = {
    id: termId,
    ptyId,
    xterm,
    fitAddon,
    container,
    dataHandler,
    exitHandler,
    label: `Terminal ${terminalCounter}`,
  };

  state.terminals.push(termInfo);
  switchTerminal(termId);
  renderTerminalTabs();
}

function switchTerminal(termId) {
  state.activeTerminalId = termId;

  // Hide all terminal instances, show the active one
  state.terminals.forEach(t => {
    t.container.classList.toggle('active', t.id === termId);
  });

  // Focus and fit
  const active = state.terminals.find(t => t.id === termId);
  if (active) {
    setTimeout(() => {
      active.fitAddon.fit();
      active.xterm.focus();
    }, 50);
  }

  renderTerminalTabs();
}

function closeTerminal(termId) {
  const idx = state.terminals.findIndex(t => t.id === termId);
  if (idx === -1) return;

  const term = state.terminals[idx];

  // Kill pty process
  if (window.electronAPI && term.ptyId) {
    window.electronAPI.killTerminal(term.ptyId).catch(() => {});
  }

  // Dispose xterm
  term.xterm.dispose();
  term.container.remove();

  // Remove from state
  state.terminals.splice(idx, 1);

  // Switch to another terminal or close panel
  if (state.terminals.length > 0) {
    const newActive = state.terminals[Math.min(idx, state.terminals.length - 1)];
    switchTerminal(newActive.id);
  } else {
    state.activeTerminalId = null;
    renderTerminalTabs();
  }
}

function closeActiveTerminal() {
  if (state.activeTerminalId) {
    closeTerminal(state.activeTerminalId);
  }
}

function renderTerminalTabs() {
  const tabsEl = $('#terminal-tabs');
  if (!tabsEl) return;

  tabsEl.innerHTML = state.terminals.map(t => {
    const active = t.id === state.activeTerminalId ? 'active' : '';
    return `<div class="terminal-tab ${active}" data-id="${t.id}">
      <span>💻 ${t.label}</span>
      <span class="terminal-tab-close" data-id="${t.id}">&times;</span>
    </div>`;
  }).join('');

  tabsEl.querySelectorAll('.terminal-tab').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('terminal-tab-close')) {
        closeTerminal(e.target.dataset.id);
      } else {
        switchTerminal(el.dataset.id);
      }
    });
  });
}

function resizeActiveTerminal() {
  const active = state.terminals.find(t => t.id === state.activeTerminalId);
  if (active && active.fitAddon) {
    active.fitAddon.fit();
    // Sync pty dimensions
    if (window.electronAPI && active.ptyId) {
      window.electronAPI.resizeTerminal(active.ptyId, active.xterm.cols, active.xterm.rows).catch(() => {});
    }
  }
}

// ===== Project Folder =====
async function openFolder() {
  if (!window.electronAPI) {
    showToast('Open Folder requires the Electron desktop app', 'error');
    return;
  }

  const folderPath = await window.electronAPI.openFolderDialog();
  if (!folderPath) return;

  state.folderPath = folderPath;

  // Update sidebar title
  const pathParts = folderPath.replace(/\\/g, '/').split('/');
  const folderName = pathParts[pathParts.length - 1];
  $('#sidebar-title').textContent = folderName.toUpperCase();
  $('#btn-close-folder').classList.remove('hidden');

  // Load directory tree
  await loadFolderTree(folderPath);

  showToast(`Opened folder: ${folderName}`, 'success');
}

async function loadFolderTree(folderPath) {
  try {
    const tree = await window.electronAPI.readDirectory(folderPath, 5);
    state.folderTree = tree;
    renderFolderTreeUI();
  } catch (err) {
    showToast(`Failed to read folder: ${err.message}`, 'error');
  }
}

function renderFolderTreeUI() {
  const container = $('#folder-tree');
  if (!state.folderTree) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  function renderNode(node, depth = 0) {
    if (node.type === 'directory') {
      const expanded = state.expandedFolders.has(node.path);
      const icon = expanded ? '📂' : '📁';
      const chevron = expanded ? '▼' : '▶';
      let html = `<div class="folder-item ${expanded ? 'expanded' : ''}" data-path="${escapeAttr(node.path)}" data-type="directory" style="padding-left:${8 + depth * 16}px">
        <span class="folder-chevron">${chevron}</span>
        <span class="folder-icon">${icon}</span>
        <span class="folder-name">${escapeHtml(node.name)}</span>
      </div>`;
      if (expanded && node.children) {
        html += `<div class="folder-children">`;
        for (const child of node.children) {
          html += renderNode(child, depth + 1);
        }
        html += `</div>`;
      }
      return html;
    } else {
      const lang = detectLanguage(node.name);
      const icon = LANGUAGES[lang]?.icon || '📄';
      // Check if this file is currently open and active
      const openFile = state.files.find(f => f.diskPath === node.path);
      const active = openFile && openFile.id === state.activeFileId ? 'active' : '';
      return `<div class="folder-item folder-file ${active}" data-path="${escapeAttr(node.path)}" data-type="file" style="padding-left:${8 + depth * 16 + 20}px">
        <span class="file-icon">${icon}</span>
        <span class="folder-name">${escapeHtml(node.name)}</span>
      </div>`;
    }
  }

  let html = '';
  if (state.folderTree.children) {
    for (const child of state.folderTree.children) {
      html += renderNode(child, 0);
    }
  }

  container.innerHTML = html;

  // Bind click events
  container.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', () => {
      const itemPath = el.dataset.path;
      const type = el.dataset.type;

      if (type === 'directory') {
        // Toggle expand/collapse
        if (state.expandedFolders.has(itemPath)) {
          state.expandedFolders.delete(itemPath);
        } else {
          state.expandedFolders.add(itemPath);
        }
        renderFolderTreeUI();
      } else {
        // Open file from disk
        openFileFromFolder(itemPath);
      }
    });
  });

  // Also re-render the open editors section
  renderFileTree();
}

async function openFileFromFolder(filePath) {
  // Check if already open
  const existing = state.files.find(f => f.diskPath === filePath);
  if (existing) {
    activateFile(existing.id);
    return;
  }

  // Load from disk
  try {
    const result = await window.electronAPI.readFileContent(filePath);
    if (result.error) {
      showToast(`Failed to open file: ${result.error}`, 'error');
      return;
    }

    const file = createFile(result.name, result.content);
    file.diskPath = result.path;
    file.modified = false;
    renderTabs();
    renderFileTree();
    renderFolderTreeUI();
  } catch (err) {
    showToast(`Failed to open file: ${err.message}`, 'error');
  }
}

function closeFolder() {
  state.folderPath = null;
  state.folderTree = null;
  state.expandedFolders.clear();

  // Reset sidebar
  $('#sidebar-title').textContent = 'EXPLORER';
  $('#btn-close-folder').classList.add('hidden');
  $('#folder-tree').classList.add('hidden');
  $('#folder-tree').innerHTML = '';

  renderFileTree();
  showToast('Folder closed', 'info');
}

async function refreshFolderTree() {
  if (state.folderPath) {
    await loadFolderTree(state.folderPath);
    showToast('Explorer refreshed', 'info');
  }
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== Context Menu =====
function showContextMenu(x, y) {
  const menu = $('#context-menu');
  menu.classList.remove('hidden');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  // Adjust if offscreen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (x - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (y - rect.height) + 'px';
  }
}

function hideContextMenu() {
  $('#context-menu').classList.add('hidden');
}

// ===== Event Handlers =====
function setupEventHandlers() {
  // File input
  $('#file-input').addEventListener('change', handleFileInput);

  // New file button
  $('#btn-new-file').addEventListener('click', () => showNewFileDialog());

  // New file dialog
  $('#btn-create-file').addEventListener('click', () => {
    const name = $('#new-file-name').value.trim() || `untitled-${state.nextFileId}.js`;
    createFile(name);
    closeNewFileDialog();
  });
  $('#btn-cancel-file').addEventListener('click', closeNewFileDialog);
  $('#new-file-close').addEventListener('click', closeNewFileDialog);
  $('#new-file-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = e.target.value.trim() || `untitled-${state.nextFileId}.js`;
      createFile(name);
      closeNewFileDialog();
    }
    if (e.key === 'Escape') closeNewFileDialog();
  });

  // Settings
  $('#btn-settings').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', closeSettings);

  // Settings navigation
  $$('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      $$('.settings-nav-item').forEach(i => i.classList.remove('active'));
      $$('.settings-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      $(`#section-${item.dataset.section}`).classList.add('active');
    });
  });

  // API key toggle visibility
  $$('.key-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $(`#${btn.dataset.target}`);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Save API keys
  $('#btn-save-keys').addEventListener('click', () => {
    ['openai', 'claude', 'gemini', 'perplexity'].forEach(provider => {
      const key = $(`#key-${provider}`).value.trim();
      state.aiService.setApiKey(provider, key);
      const model = $(`#model-${provider}`).value;
      state.aiService.setModel(provider, model);
    });
    showToast('API keys saved', 'success');
    // Update provider dropdown
    const available = state.aiService.getAvailableProviders();
    if (available.length > 0 && !state.aiProvider) {
      state.aiProvider = available[0];
      $('#ai-provider-select').value = state.aiProvider;
    }
  });

  // Clear API keys
  $('#btn-clear-keys').addEventListener('click', () => {
    if (!confirm('Clear all API keys?')) return;
    ['openai', 'claude', 'gemini', 'perplexity'].forEach(provider => {
      state.aiService.setApiKey(provider, '');
      $(`#key-${provider}`).value = '';
    });
    showToast('All API keys cleared', 'info');
  });

  // Save editor settings
  $('#btn-save-editor-settings').addEventListener('click', () => {
    state.settings.fontSize = parseInt($('#setting-font-size').value, 10);
    state.settings.tabSize = parseInt($('#setting-tab-size').value, 10);
    state.settings.wordWrap = $('#setting-word-wrap').checked;
    state.settings.minimap = $('#setting-minimap').checked;
    state.settings.lineNumbers = $('#setting-line-numbers').checked;
    state.settings.autoSave = $('#setting-auto-save').checked;
    saveSettings();

    // Apply to editor
    const file = getActiveFile();
    if (file && state.editorView) {
      reconfigureEditor(file);
    }

    // Toggle minimap
    if (state.settings.minimap) {
      $('#minimap').classList.remove('hidden');
      updateMinimap();
    } else {
      $('#minimap').classList.add('hidden');
    }

    showToast('Editor settings saved', 'success');
  });

  // Theme selection
  $$('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      $$('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      applyTheme(card.dataset.theme);
      showToast(`Theme: ${card.querySelector('span').textContent}`, 'info');
    });
  });

  // AI Panel
  $('#btn-toggle-ai').addEventListener('click', toggleAIPanel);
  $('#btn-close-ai').addEventListener('click', () => $('#ai-panel').classList.add('hidden'));
  $('#btn-clear-chat').addEventListener('click', () => {
    state.aiMessages = [];
    renderAIMessages();
  });

  // AI Provider select
  $('#ai-provider-select').addEventListener('change', (e) => {
    state.aiProvider = e.target.value;
  });

  // AI Chat input
  const aiInput = $('#ai-chat-input');
  aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIMessage(aiInput.value);
      aiInput.value = '';
      aiInput.style.height = 'auto';
    }
  });

  // Auto-resize textarea
  aiInput.addEventListener('input', () => {
    aiInput.style.height = 'auto';
    aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
  });

  $('#ai-send-btn').addEventListener('click', () => {
    sendAIMessage(aiInput.value);
    aiInput.value = '';
    aiInput.style.height = 'auto';
  });

  // AI context clear
  $('#ai-context-clear').addEventListener('click', () => {
    $('#ai-context-bar').style.display = 'none';
    state.selectedCode = '';
    $('#ai-chat-input').placeholder = 'Ask AI anything... (Enter to send)';
  });

  // AI Panel resize
  let isResizing = false;
  const resizeHandle = $('#ai-panel-resize-handle');
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const panel = $('#ai-panel');
    const containerRect = $('#editor-wrapper').getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    const clamped = Math.max(280, Math.min(600, newWidth));
    panel.style.width = clamped + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // ===== Preview Panel Events =====
  $('#btn-toggle-preview').addEventListener('click', togglePreview);
  $('#btn-close-preview').addEventListener('click', () => $('#preview-panel').classList.add('hidden'));
  $('#btn-preview-refresh').addEventListener('click', refreshPreview);
  $('#btn-preview-external').addEventListener('click', () => {
    const iframe = $('#preview-iframe');
    if (iframe.srcdoc) {
      const blob = new Blob([iframe.srcdoc], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  });

  $('#preview-mode-select').addEventListener('change', refreshPreview);

  // Responsive device buttons
  $$('.preview-device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.preview-device-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const iframe = $('#preview-iframe');
      iframe.className = '';
      if (btn.dataset.device === 'tablet') iframe.classList.add('tablet-view');
      if (btn.dataset.device === 'mobile') iframe.classList.add('mobile-view');
    });
  });

  // Preview panel resize
  let isPreviewResizing = false;
  const previewResizeHandle = $('#preview-resize-handle');
  previewResizeHandle.addEventListener('mousedown', (e) => {
    isPreviewResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPreviewResizing) return;
    const panel = $('#preview-panel');
    const containerRect = $('#editor-wrapper').getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    const clamped = Math.max(280, Math.min(containerRect.width * 0.7, newWidth));
    panel.style.width = clamped + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isPreviewResizing) {
      isPreviewResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // ===== SQL Panel Events =====
  $('#btn-toggle-sql').addEventListener('click', toggleSQLPanel);
  $('#btn-close-sql').addEventListener('click', () => $('#sql-panel').classList.add('hidden'));
  $('#btn-sql-execute').addEventListener('click', executeSQL);
  $('#btn-sql-new-db').addEventListener('click', createNewDatabase);
  $('#btn-sql-open-db').addEventListener('click', openDatabaseFile);
  $('#btn-sql-save-db').addEventListener('click', exportDatabase);
  $('#btn-sql-history').addEventListener('click', (e) => { e.stopPropagation(); showSQLHistory(); });
  $('#btn-sql-refresh-schema').addEventListener('click', refreshSchema);
  $('#db-file-input').addEventListener('change', handleDatabaseFileInput);

  $('#sql-db-select').addEventListener('change', (e) => {
    state.sqlService.setActiveDatabase(e.target.value);
    refreshSchema();
  });

  // SQL Panel resize
  let isSQLResizing = false;
  const sqlResizeHandle = $('#sql-resize-handle');
  sqlResizeHandle.addEventListener('mousedown', (e) => {
    isSQLResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isSQLResizing) return;
    const panel = $('#sql-panel');
    const containerRect = $('#editor-wrapper').getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    const clamped = Math.max(320, Math.min(containerRect.width * 0.7, newWidth));
    panel.style.width = clamped + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isSQLResizing) {
      isSQLResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // SQL Settings
  $('#btn-save-db-settings')?.addEventListener('click', () => {
    state.sqlSettings.autoload = $('#setting-db-autoload').checked;
    state.sqlSettings.maxResults = parseInt($('#setting-db-max-results').value, 10) || 1000;
    state.sqlSettings.historyLimit = parseInt($('#setting-db-history-limit').value, 10) || 50;
    localStorage.setItem('codeforge_sql_settings', JSON.stringify(state.sqlSettings));
    showToast('Database settings saved', 'success');
  });

  // ===== Terminal Panel Events =====
  $('#btn-toggle-terminal').addEventListener('click', toggleTerminalPanel);
  $('#btn-new-terminal').addEventListener('click', createTerminal);
  $('#btn-close-terminal').addEventListener('click', closeActiveTerminal);

  // Terminal Panel resize (vertical)
  let isTermResizing = false;
  const termResizeHandle = $('#terminal-resize-handle');
  if (termResizeHandle) {
    termResizeHandle.addEventListener('mousedown', (e) => {
      isTermResizing = true;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isTermResizing) return;
      const panel = $('#terminal-panel');
      const editorArea = $('#editor-area');
      const areaRect = editorArea.getBoundingClientRect();
      const newHeight = areaRect.bottom - e.clientY;
      const clamped = Math.max(120, Math.min(areaRect.height * 0.7, newHeight));
      panel.style.height = clamped + 'px';
      resizeActiveTerminal();
    });

    document.addEventListener('mouseup', () => {
      if (isTermResizing) {
        isTermResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        resizeActiveTerminal();
      }
    });
  }

  // Terminal Settings
  $('#btn-save-terminal-settings')?.addEventListener('click', () => {
    state.terminalSettings.shell = $('#setting-terminal-shell').value;
    state.terminalSettings.fontSize = parseInt($('#setting-terminal-font-size').value, 10) || 13;
    state.terminalSettings.cursorStyle = $('#setting-terminal-cursor').value;
    localStorage.setItem('codeforge_terminal_settings', JSON.stringify(state.terminalSettings));
    // Apply to existing terminals
    state.terminals.forEach(t => {
      t.xterm.options.fontSize = state.terminalSettings.fontSize;
      t.xterm.options.cursorStyle = state.terminalSettings.cursorStyle;
      t.fitAddon.fit();
    });
    showToast('Terminal settings saved', 'success');
  });

  // ===== Folder Events =====
  $('#btn-open-folder').addEventListener('click', openFolder);
  $('#btn-close-folder').addEventListener('click', closeFolder);

  // Command palette
  $('#palette-input').addEventListener('input', (e) => {
    renderPaletteResults(e.target.value);
  });

  $('#palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCommandPalette();
    if (e.key === 'Enter') {
      const selected = $('#palette-results .palette-item.selected');
      if (selected) selected.click();
      closeCommandPalette();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = $$('#palette-results .palette-item');
      let idx = Array.from(items).findIndex(i => i.classList.contains('selected'));
      items.forEach(i => i.classList.remove('selected'));
      if (e.key === 'ArrowDown') idx = (idx + 1) % items.length;
      else idx = (idx - 1 + items.length) % items.length;
      items[idx]?.classList.add('selected');
      items[idx]?.scrollIntoView({ block: 'nearest' });
    }
  });

  // Language selector
  $('#language-input').addEventListener('input', (e) => {
    renderLanguageResults(e.target.value);
  });

  $('#language-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLanguageSelector();
    if (e.key === 'Enter') {
      const selected = $('#language-results .palette-item.selected');
      if (selected) selected.click();
      closeLanguageSelector();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = $$('#language-results .palette-item');
      let idx = Array.from(items).findIndex(i => i.classList.contains('selected'));
      items.forEach(i => i.classList.remove('selected'));
      if (e.key === 'ArrowDown') idx = (idx + 1) % items.length;
      else idx = (idx - 1 + items.length) % items.length;
      items[idx]?.classList.add('selected');
      items[idx]?.scrollIntoView({ block: 'nearest' });
    }
  });

  // Close modals on backdrop click
  $$('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      closeCommandPalette();
      closeLanguageSelector();
      closeSettings();
      closeNewFileDialog();
    });
  });

  // Status bar language click
  $('#status-language').addEventListener('click', openLanguageSelector);

  // Context menu
  $('#editor-container').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
      hideContextMenu();
    }
  });

  $$('.context-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      hideContextMenu();
      switch (action) {
        case 'ai-explain': aiAction('explain'); break;
        case 'ai-improve': aiAction('improve'); break;
        case 'ai-fix': aiAction('fix'); break;
        case 'ai-comment': aiAction('comment'); break;
        case 'sql-execute': executeSQL(); break;
        case 'copy': document.execCommand('copy'); break;
        case 'cut': document.execCommand('cut'); break;
        case 'paste': navigator.clipboard.readText().then(t => {
          if (state.editorView) {
            const sel = state.editorView.state.selection.main;
            state.editorView.dispatch({
              changes: { from: sel.from, to: sel.to, insert: t },
            });
          }
        }); break;
      }
    });
  });

  // Menu items
  $$('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const menu = item.dataset.menu;
      switch (menu) {
        case 'file':
          openCommandPalette();
          $('#palette-input').value = '';
          renderPaletteResults('');
          break;
        case 'edit':
          openCommandPalette();
          $('#palette-input').value = 'AI';
          renderPaletteResults('AI');
          break;
        case 'view':
          openCommandPalette();
          $('#palette-input').value = 'Toggle';
          renderPaletteResults('Toggle');
          break;
        case 'selection':
          openCommandPalette();
          $('#palette-input').value = '';
          renderPaletteResults('');
          break;
        case 'help':
          openSettings();
          // Navigate to about
          $$('.settings-nav-item').forEach(i => i.classList.remove('active'));
          $$('.settings-section').forEach(s => s.classList.remove('active'));
          document.querySelector('[data-section="about"]').classList.add('active');
          $('#section-about').classList.add('active');
          break;
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (ctrl && e.key === 'n') {
      e.preventDefault();
      showNewFileDialog();
      return;
    }

    if (ctrl && e.key === 'o') {
      e.preventDefault();
      openFileFromDisk();
      return;
    }

    if (ctrl && e.key === 's') {
      e.preventDefault();
      saveActiveFile();
      return;
    }

    if (ctrl && e.key === 'w') {
      e.preventDefault();
      if (state.activeFileId) closeFile(state.activeFileId);
      return;
    }

    if (ctrl && e.key === 'l') {
      e.preventDefault();
      toggleAIPanel();
      return;
    }

    if (ctrl && !e.shiftKey && e.key === 'p') {
      e.preventDefault();
      togglePreview();
      return;
    }

    if (ctrl && e.shiftKey && (e.key === 'Q' || e.key === 'q')) {
      e.preventDefault();
      toggleSQLPanel();
      return;
    }

    if (ctrl && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      executeSQL();
      return;
    }

    if (ctrl && !e.shiftKey && e.key === 'j') {
      e.preventDefault();
      toggleTerminalPanel();
      return;
    }

    if (ctrl && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    if (ctrl && e.key === ',') {
      e.preventDefault();
      openSettings();
      return;
    }

    if (ctrl && e.key === 'k') {
      e.preventDefault();
      aiEditSelection();
      return;
    }

    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      switchTab(e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === 'Escape') {
      closeCommandPalette();
      closeLanguageSelector();
      closeSettings();
      closeNewFileDialog();
      hideContextMenu();
    }
  });

  // Drag and drop files
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    Array.from(files).forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        createFile(f.name, ev.target.result);
      };
      reader.readAsText(f);
    });
  });

  // Window beforeunload
  window.addEventListener('beforeunload', () => {
    saveFilesToStorage();
  });
}

// ===== Initialize =====
async function init() {
  // Show loading status
  $('#status-message').textContent = 'Loading editor...';

  // Load settings
  loadSettings();

  // Setup event handlers
  setupEventHandlers();

  // Load CodeMirror
  try {
    await loadCodeMirror();
    $('#status-message').textContent = '';
  } catch (err) {
    console.error('Failed to load CodeMirror:', err);
    $('#status-message').textContent = 'Editor loading failed. Refresh to retry.';
    showToast('Failed to load editor engine. Check your internet connection.', 'error');
    return;
  }

  // Load saved files
  loadFilesFromStorage();

  // If no files, show welcome screen
  if (state.files.length === 0) {
    showWelcomeScreen();
  }

  // Set provider if keys exist
  const available = state.aiService.getAvailableProviders();
  if (available.length > 0) {
    state.aiProvider = available[0];
    $('#ai-provider-select').value = state.aiProvider;
  }

  // Electron integration: hook into native menus and file dialogs
  if (window.electronAPI) {
    window.electronAPI.onMenuAction((action) => {
      switch (action) {
        case 'new-file': showNewFileDialog(); break;
        case 'save': saveActiveFile(); break;
        case 'save-as': electronSaveAs(); break;
        case 'settings': openSettings(); break;
        case 'find': if (state.editorView) cmModules.cmSearch?.openSearchPanel(state.editorView); break;
        case 'toggle-sidebar': toggleSidebar(); break;
        case 'toggle-ai': toggleAIPanel(); break;
        case 'toggle-sql': toggleSQLPanel(); break;
        case 'toggle-terminal': toggleTerminalPanel(); break;
        case 'open-folder': openFolder(); break;
        case 'command-palette': openCommandPalette(); break;
        case 'about':
          openSettings();
          $$('.settings-nav-item').forEach(i => i.classList.remove('active'));
          $$('.settings-section').forEach(s => s.classList.remove('active'));
          document.querySelector('[data-section="about"]').classList.add('active');
          $('#section-about').classList.add('active');
          break;
      }
    });

    window.electronAPI.onOpenFile((fileData) => {
      const file = createFile(fileData.name, fileData.content);
      if (fileData.path) file.diskPath = fileData.path;
    });
  }
}

async function electronSaveAs() {
  if (!window.electronAPI) return;
  const file = getActiveFile();
  if (!file) return;
  if (state.editorView) file.content = state.editorView.state.doc.toString();
  const result = await window.electronAPI.saveFileDialog(file.name, file.content);
  if (result.success) {
    file.diskPath = result.path;
    file.modified = false;
    renderTabs();
    renderFileTree();
    updateStatusBar();
    showToast(`Saved to ${result.path}`, 'success');
  }
}

// Start
init();
