// CodeForge — SQL Service (SQLite via WebAssembly)
// Wraps sql.js to provide in-browser SQLite database operations

export class SQLService {
  constructor() {
    this.SQL = null;           // sql.js module reference
    this.databases = {};       // { name: Database instance }
    this.activeDb = null;      // name of active database
    this.queryHistory = [];    // [{ query, timestamp, rowCount, error, executionTime }]
    this.loaded = false;
    this.loading = false;
  }

  // ===== Load sql.js WASM from CDN =====
  async loadSqlJs() {
    if (this.loaded) return;
    if (this.loading) {
      // Wait for existing load to complete
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (this.loaded) { clearInterval(check); resolve(); }
          if (!this.loading && !this.loaded) { clearInterval(check); reject(new Error('Load failed')); }
        }, 100);
      });
    }

    this.loading = true;

    return new Promise((resolve, reject) => {
      // Check if already loaded globally
      if (typeof initSqlJs !== 'undefined') {
        this._initFromGlobal().then(resolve).catch(reject);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
      script.onload = () => {
        this._initFromGlobal().then(resolve).catch(reject);
      };
      script.onerror = () => {
        this.loading = false;
        reject(new Error('Failed to load sql.js from CDN'));
      };
      document.head.appendChild(script);
    });
  }

  async _initFromGlobal() {
    try {
      this.SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
      });
      this.loaded = true;
      this.loading = false;
    } catch (e) {
      this.loading = false;
      throw e;
    }
  }

  // ===== Database Management =====
  createDatabase(name) {
    if (!this.SQL) throw new Error('SQL engine not loaded');
    if (this.databases[name]) {
      throw new Error(`Database "${name}" already exists`);
    }
    this.databases[name] = new this.SQL.Database();
    if (!this.activeDb) {
      this.activeDb = name;
    }
    return name;
  }

  openDatabaseFromFile(name, uint8Array) {
    if (!this.SQL) throw new Error('SQL engine not loaded');
    // Close existing with same name
    if (this.databases[name]) {
      this.databases[name].close();
    }
    this.databases[name] = new this.SQL.Database(uint8Array);
    this.activeDb = name;
    return name;
  }

  closeDatabase(name) {
    if (this.databases[name]) {
      this.databases[name].close();
      delete this.databases[name];
      // Remove from localStorage
      localStorage.removeItem(`codeforge_db_${name}`);
      // Switch active if needed
      if (this.activeDb === name) {
        const remaining = Object.keys(this.databases);
        this.activeDb = remaining.length > 0 ? remaining[0] : null;
      }
    }
  }

  getActiveDatabase() {
    return this.activeDb ? this.databases[this.activeDb] : null;
  }

  setActiveDatabase(name) {
    if (this.databases[name]) {
      this.activeDb = name;
    }
  }

  getDatabaseNames() {
    return Object.keys(this.databases);
  }

  // ===== Query Execution =====
  executeQuery(sql, dbName = null) {
    const db = dbName ? this.databases[dbName] : this.getActiveDatabase();
    if (!db) {
      return { columns: [], rows: [], rowCount: 0, executionTime: 0, error: 'No database selected' };
    }

    const startTime = performance.now();

    try {
      const results = db.exec(sql);
      const executionTime = Math.round(performance.now() - startTime);

      // db.exec returns an array of result sets (one per statement)
      // Return the last result set that has data, or a summary
      let columns = [];
      let rows = [];
      let rowCount = 0;

      if (results.length > 0) {
        const lastResult = results[results.length - 1];
        columns = lastResult.columns;
        rows = lastResult.values;
        rowCount = rows.length;
      } else {
        // Statement executed but returned no rows (INSERT, UPDATE, CREATE, etc.)
        // Get the number of affected rows
        try {
          const changes = db.exec('SELECT changes()');
          rowCount = changes.length > 0 ? changes[0].values[0][0] : 0;
        } catch (_) {
          rowCount = 0;
        }
      }

      // Add to history
      this._addToHistory(sql, rowCount, null, executionTime);

      return { columns, rows, rowCount, executionTime, error: null };
    } catch (e) {
      const executionTime = Math.round(performance.now() - startTime);
      this._addToHistory(sql, 0, e.message, executionTime);
      return { columns: [], rows: [], rowCount: 0, executionTime, error: e.message };
    }
  }

  // ===== Schema Introspection =====
  getSchema(dbName = null) {
    const db = dbName ? this.databases[dbName] : this.getActiveDatabase();
    if (!db) return [];

    try {
      // Get all tables
      const tables = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );

      if (tables.length === 0) return [];

      const schema = [];
      for (const row of tables[0].values) {
        const tableName = row[0];

        // Get columns for each table
        const colInfo = db.exec(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`);
        const columns = colInfo.length > 0
          ? colInfo[0].values.map(col => ({
              cid: col[0],
              name: col[1],
              type: col[2] || 'TEXT',
              notnull: col[3] === 1,
              defaultValue: col[4],
              pk: col[5] > 0,
            }))
          : [];

        schema.push({ table: tableName, columns });
      }

      return schema;
    } catch (e) {
      console.error('Schema introspection error:', e);
      return [];
    }
  }

  // ===== Export =====
  exportDatabase(dbName = null) {
    const db = dbName ? this.databases[dbName] : this.getActiveDatabase();
    if (!db) return null;
    return db.export(); // Returns Uint8Array
  }

  // ===== Query History =====
  _addToHistory(query, rowCount, error, executionTime) {
    this.queryHistory.unshift({
      query: query.trim(),
      timestamp: Date.now(),
      rowCount,
      error,
      executionTime,
    });

    // Trim history
    if (this.queryHistory.length > 100) {
      this.queryHistory = this.queryHistory.slice(0, 100);
    }
  }

  getQueryHistory() {
    return this.queryHistory;
  }

  clearQueryHistory() {
    this.queryHistory = [];
  }

  // ===== Persistence (localStorage) =====
  saveDatabaseToStorage(name) {
    const db = this.databases[name];
    if (!db) return false;

    try {
      const data = db.export();
      // Convert Uint8Array to base64
      const binary = String.fromCharCode.apply(null, data);
      const base64 = btoa(binary);
      localStorage.setItem(`codeforge_db_${name}`, base64);
      return true;
    } catch (e) {
      console.error(`Failed to save database "${name}":`, e);
      return false;
    }
  }

  loadDatabaseFromStorage(name) {
    if (!this.SQL) return false;

    try {
      const base64 = localStorage.getItem(`codeforge_db_${name}`);
      if (!base64) return false;

      // Convert base64 to Uint8Array
      const binary = atob(base64);
      const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        data[i] = binary.charCodeAt(i);
      }

      this.databases[name] = new this.SQL.Database(data);
      if (!this.activeDb) {
        this.activeDb = name;
      }
      return true;
    } catch (e) {
      console.error(`Failed to load database "${name}":`, e);
      return false;
    }
  }

  getSavedDatabaseNames() {
    const names = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('codeforge_db_')) {
        names.push(key.replace('codeforge_db_', ''));
      }
    }
    return names;
  }

  deleteSavedDatabase(name) {
    localStorage.removeItem(`codeforge_db_${name}`);
    if (this.databases[name]) {
      this.databases[name].close();
      delete this.databases[name];
    }
    if (this.activeDb === name) {
      const remaining = Object.keys(this.databases);
      this.activeDb = remaining.length > 0 ? remaining[0] : null;
    }
  }
}
