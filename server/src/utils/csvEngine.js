/**
 * SplitMate CSV Export Engine
 *
 * Handles formatting, escaping, formula injection mitigation (CWE-1236),
 * and generation of RFC 4180 compliant CSV files with UTF-8 BOM encoding.
 */

/**
 * Sanitizes an individual cell value for CSV formatting.
 *
 * Rules:
 * 1. Handles null, undefined, and non-string types safely.
 * 2. Numbers are returned directly without quote wrapping.
 * 3. Text fields starting with formula trigger characters (=, +, -, @, \t, \r)
 *    are prepended with a single quote (') to mitigate spreadsheet formula injection.
 * 4. RFC 4180 escaping: fields with commas, double quotes, or newlines are enclosed
 *    in double quotes with internal quotes escaped as double double-quotes ("").
 *
 * @param {any} value - Cell content
 * @param {boolean} [isNumeric=false] - If true, treats the value as a numeric column
 * @returns {string} Sanitized and escaped CSV cell string
 */
function sanitizeCsvCell(value, isNumeric = false) {
  if (value === null || value === undefined) {
    return "";
  }

  // Pure numeric columns (amount, count)
  if (isNumeric || typeof value === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0.00";
    return num.toFixed(2);
  }

  let str = String(value);

  // Spreadsheet formula injection mitigation (CWE-1236)
  // If text starts with =, +, -, @, \t, \r, prepend a single quote (')
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  // RFC 4180 escaping: quote if contains comma, quote, or newline
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts a Date or ISO date string into a clean YYYY-MM-DD string
 *
 * @param {Date|string|number} dateValue
 * @returns {string} YYYY-MM-DD
 */
function formatDate(dateValue) {
  if (!dateValue) return "";
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/**
 * Generates an Expenses CSV string from an array of expense records.
 *
 * Columns:
 * 1. Expense Description
 * 2. Amount
 * 3. Currency
 * 4. Category
 * 5. Date
 * 6. Payer
 * 7. Group Name
 *
 * @param {Array<object>} expenses - List of expense documents
 * @param {object} [options={}] - Optional metadata (e.g. fallback groupName)
 * @returns {string} RFC 4180 CSV string with UTF-8 BOM
 */
function generateExpensesCsv(expenses = [], options = {}) {
  const headers = [
    "Expense Description",
    "Amount",
    "Currency",
    "Category",
    "Date",
    "Payer",
    "Group Name"
  ];

  const rows = [headers.map((h) => sanitizeCsvCell(h)).join(",")];

  if (Array.isArray(expenses)) {
    for (const exp of expenses) {
      if (!exp) continue;

      // Calculate amount cleanly using integer paise if available
      let amountStr;
      if (typeof exp.amountPaise === "number" && exp.amountPaise >= 0) {
        amountStr = (exp.amountPaise / 100).toFixed(2);
      } else if (typeof exp.amount === "number") {
        amountStr = Number(exp.amount).toFixed(2);
      } else {
        amountStr = "0.00";
      }

      // Resolve payer name
      let payerName = "Unknown";
      if (exp.paidBy) {
        if (typeof exp.paidBy === "object") {
          payerName = exp.paidBy.name || exp.paidBy.email || "Unknown";
        } else if (typeof exp.paidBy === "string") {
          payerName = exp.paidBy;
        }
      }

      // Resolve group name
      let groupName = options.groupName || "Group";
      if (exp.group) {
        if (typeof exp.group === "object" && exp.group.name) {
          groupName = exp.group.name;
        } else if (typeof exp.groupName === "string" && exp.groupName) {
          groupName = exp.groupName;
        }
      }

      const description = exp.description || "Untitled Expense";
      const currency = exp.currency || options.currency || "INR";
      const category = exp.category || "General";
      const date = formatDate(exp.createdAt || exp.date);

      const row = [
        sanitizeCsvCell(description),
        amountStr, // Numeric cell: no formula injection check, raw decimal
        sanitizeCsvCell(currency),
        sanitizeCsvCell(category),
        sanitizeCsvCell(date),
        sanitizeCsvCell(payerName),
        sanitizeCsvCell(groupName)
      ];

      rows.push(row.join(","));
    }
  }

  // Prepend UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 text flawlessly
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

/**
 * Generates a Settlements CSV string from an array of settlement records.
 *
 * Columns:
 * 1. Settlement ID
 * 2. Group Name
 * 3. Payer
 * 4. Recipient
 * 5. Settlement Amount
 * 6. Currency
 * 7. Settlement Date
 * 8. Status
 * 9. Notes
 *
 * @param {Array<object>} settlements - List of settlement documents
 * @param {object} [options={}] - Optional metadata (e.g. fallback groupName)
 * @returns {string} RFC 4180 CSV string with UTF-8 BOM
 */
function generateSettlementsCsv(settlements = [], options = {}) {
  const headers = [
    "Settlement ID",
    "Group Name",
    "Payer",
    "Recipient",
    "Settlement Amount",
    "Currency",
    "Settlement Date",
    "Status",
    "Notes"
  ];

  const rows = [headers.map((h) => sanitizeCsvCell(h)).join(",")];

  if (Array.isArray(settlements)) {
    for (const st of settlements) {
      if (!st) continue;

      const settlementId = st._id ? String(st._id) : st.id ? String(st.id) : "";

      // Group Name
      let groupName = options.groupName || "Group";
      if (st.group) {
        if (typeof st.group === "object" && st.group.name) {
          groupName = st.group.name;
        } else if (typeof st.groupName === "string" && st.groupName) {
          groupName = st.groupName;
        }
      }

      // Payer
      let payerName = "Unknown";
      if (st.payer) {
        if (typeof st.payer === "object") {
          payerName = st.payer.name || st.payer.email || "Unknown";
        } else if (typeof st.payer === "string") {
          payerName = st.payer;
        }
      }

      // Recipient
      let recipientName = "Unknown";
      if (st.receiver) {
        if (typeof st.receiver === "object") {
          recipientName = st.receiver.name || st.receiver.email || "Unknown";
        } else if (typeof st.receiver === "string") {
          recipientName = st.receiver;
        }
      }

      // Amount
      let amountStr;
      if (typeof st.amountPaise === "number" && st.amountPaise >= 0) {
        amountStr = (st.amountPaise / 100).toFixed(2);
      } else if (typeof st.amount === "number") {
        amountStr = Number(st.amount).toFixed(2);
      } else {
        amountStr = "0.00";
      }

      const currency = st.currency || options.currency || "INR";
      const settlementDate = formatDate(st.settledAt || st.createdAt);
      const status = st.status || "completed";
      const notes = st.notes || "";

      const row = [
        sanitizeCsvCell(settlementId),
        sanitizeCsvCell(groupName),
        sanitizeCsvCell(payerName),
        sanitizeCsvCell(recipientName),
        amountStr, // Numeric cell: no formula injection check, raw decimal
        sanitizeCsvCell(currency),
        sanitizeCsvCell(settlementDate),
        sanitizeCsvCell(status),
        sanitizeCsvCell(notes)
      ];

      rows.push(row.join(","));
    }
  }

  // Prepend UTF-8 Byte Order Mark (BOM)
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

module.exports = {
  sanitizeCsvCell,
  formatDate,
  generateExpensesCsv,
  generateSettlementsCsv
};
