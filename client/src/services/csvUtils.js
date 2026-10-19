/**
 * SplitMate CSV Utilities
 *
 * Provides helper functions for client-side CSV downloads, safe cell sanitization
 * against formula injection (CWE-1236), RFC 4180 escaping, and monetary paise conversion.
 */

/**
 * Triggers a browser file download from a Blob or text content.
 *
 * @param {Blob|string} blob - File content to download
 * @param {string} [defaultFilename="export.csv"] - Target filename
 */
export function downloadCsvBlob(blob, defaultFilename = "export.csv") {
  if (!blob) {
    throw new Error("No data received for download");
  }

  const blobObj =
    blob instanceof Blob
      ? blob
      : new Blob([blob], { type: "text/csv;charset=utf-8;" });

  const doc =
    typeof document !== "undefined"
      ? document
      : typeof window !== "undefined"
      ? window.document
      : null;
  const win = typeof window !== "undefined" ? window : null;

  if (!doc || !win || !win.URL) {
    return;
  }

  const url = win.URL.createObjectURL(blobObj);
  const link = doc.createElement("a");
  link.href = url;
  link.setAttribute("download", defaultFilename);
  link.style.display = "none";

  doc.body.appendChild(link);
  link.click();
  doc.body.removeChild(link);

  setTimeout(() => {
    try {
      win.URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup error if window is already closed
    }
  }, 100);
}

/**
 * Generates standard SplitMate export filename: splitmate-[type]-YYYY-MM-DD.csv
 *
 * @param {'expenses'|'settlements'} type
 * @param {Date|string} [date=new Date()]
 * @returns {string} Filename
 */
export function getStandardExportFilename(type, date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const mm = String((isNaN(d.getTime()) ? new Date() : d).getMonth() + 1).padStart(2, "0");
  const dd = String((isNaN(d.getTime()) ? new Date() : d).getDate()).padStart(2, "0");
  return `splitmate-${type}-${yyyy}-${mm}-${dd}.csv`;
}

/**
 * Formats integer paise into a standard decimal rupees string without floating point artifacts.
 *
 * @param {number|string} paise
 * @returns {string} e.g. "1250.00"
 */
export function formatPaiseToRupees(paise) {
  const p = Number(paise);
  if (!Number.isFinite(p) || p < 0) return "0.00";
  return (p / 100).toFixed(2);
}

/**
 * Sanitizes an individual CSV cell value according to RFC 4180 and formula injection defenses.
 * Text starting with =, +, -, @, \t, or \r is prefixed with a single quote (').
 *
 * @param {any} value - Cell value
 * @param {boolean} [isNumeric=false] - Whether the cell is numeric
 * @returns {string} Sanitized string
 */
export function sanitizeCsvField(value, isNumeric = false) {
  if (value === null || value === undefined) {
    return "";
  }

  if (isNumeric || typeof value === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0.00";
    return num.toFixed(2);
  }

  let str = String(value);

  // Mitigation for spreadsheet formula injection (CWE-1236)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  // RFC 4180 quoting
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
