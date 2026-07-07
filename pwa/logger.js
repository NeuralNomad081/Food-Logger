/*
 * Client logger with scopes, levels and an in-memory ring buffer.
 *
 * Debug output is off by default; enable with either:
 *   - ?debug=1 in the URL (persists for the session)
 *   - localStorage.setItem('foodlog:debug', '1')
 * Warnings and errors always print.
 *
 * On a phone (no devtools) grab recent logs from the console of a connected
 * browser, or anywhere via `window.__foodlogDump()` — returns the last 300
 * log lines as text.
 */

const BUFFER_MAX = 300;
const buffer = [];

if (new URLSearchParams(location.search).get('debug') === '1') {
  sessionStorage.setItem('foodlog:debug', '1');
}

function debugEnabled() {
  return localStorage.getItem('foodlog:debug') === '1'
    || sessionStorage.getItem('foodlog:debug') === '1';
}

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function record(level, scope, args) {
  const line = `${stamp()} [${level}] [${scope}] ` + args.map(a => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
    return String(a);
  }).join(' ');
  buffer.push(line);
  if (buffer.length > BUFFER_MAX) buffer.shift();
}

export function createLogger(scope) {
  return {
    debug(...args) {
      record('debug', scope, args);
      if (debugEnabled()) console.debug(`[${scope}]`, ...args);
    },
    info(...args) {
      record('info', scope, args);
      if (debugEnabled()) console.info(`[${scope}]`, ...args);
    },
    warn(...args) {
      record('warn', scope, args);
      console.warn(`[${scope}]`, ...args);
    },
    error(...args) {
      record('error', scope, args);
      console.error(`[${scope}]`, ...args);
    },
    // Wrap an async operation: logs start/duration/failure.
    async time(name, fn) {
      const t0 = performance.now();
      this.debug(`${name}…`);
      try {
        const result = await fn();
        this.debug(`${name} ok in ${Math.round(performance.now() - t0)}ms`);
        return result;
      } catch (err) {
        this.error(`${name} failed after ${Math.round(performance.now() - t0)}ms:`, err);
        throw err;
      }
    },
  };
}

// Last-resort visibility for uncaught failures.
const globalLog = createLogger('global');
window.addEventListener('error', e => {
  globalLog.error('uncaught:', e.message, `${e.filename}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', e => {
  globalLog.error('unhandled rejection:', e.reason instanceof Error ? e.reason : String(e.reason));
});

window.__foodlogDump = () => buffer.join('\n');
