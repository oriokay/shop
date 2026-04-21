// ══════════════════════════════════════════════════════════════
//  لباس التقوى — Google Apps Script Backend
//  Paste this code in: script.google.com → New Project
//  Then: Deploy → New Deployment → Web App → Anyone can access
// ══════════════════════════════════════════════════════════════

// 🔧 CONFIGURE: paste your Google Sheets ID here
// (find it in the URL: docs.google.com/spreadsheets/d/SHEET_ID/edit)
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

const STOCK_SHEET   = 'Stock';     // Sheet tab name for products
const ORDERS_SHEET  = 'Commandes'; // Sheet tab name for orders

// ── GET requests (fetch products) ──────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    if (action === 'getProducts') {
      result = getProducts();
    } else {
      result = { error: 'Unknown action' };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── POST requests (submit order) ───────────────────────────────
function doPost(e) {
  const action = e.parameter.action;
  let result;
  try {
    if (action === 'submitOrder') {
      result = submitOrder(e.parameter);
    } else {
      result = { error: 'Unknown action' };
    }
  } catch(err) {
    result = { error: err.message, success: false };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── CORS wrapper (for browser fetch) ───────────────────────────
function setCORSHeaders(output) {
  return output; // Apps Script handles CORS automatically
}

// ══════════════════════════════════════════════════════════════
//  GET PRODUCTS from Stock sheet
// ══════════════════════════════════════════════════════════════
function getProducts() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(STOCK_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0]; // first row = column names

  // Expected columns in Stock sheet:
  // id | name | name_fr | name_en | category | price | stock | img
  const products = rows.slice(1)
    .filter(row => row[0] !== '') // skip empty rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(row[i] || ''));
      return obj;
    });

  return { products };
}

// ══════════════════════════════════════════════════════════════
//  SUBMIT ORDER → save to Commandes sheet + lower stock
// ══════════════════════════════════════════════════════════════
function submitOrder(params) {
  const { productId, fullName, email, phone, qty } = params;
  const quantity = parseInt(qty) || 1;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── 1. Find the product in Stock sheet ──
  const stockSheet = ss.getSheetByName(STOCK_SHEET);
  const stockData  = stockSheet.getDataRange().getValues();
  const headers    = stockData[0];
  const idCol      = headers.indexOf('id');
  const stockCol   = headers.indexOf('stock');
  const nameCol    = headers.indexOf('name');
  const priceCol   = headers.indexOf('price');

  let productRow = -1;
  let currentStock = 0;
  let productName = '';
  let productPrice = '';

  for (let i = 1; i < stockData.length; i++) {
    if (String(stockData[i][idCol]) === String(productId)) {
      productRow   = i + 1; // Sheets rows are 1-indexed
      currentStock = parseInt(stockData[i][stockCol]) || 0;
      productName  = stockData[i][nameCol];
      productPrice = stockData[i][priceCol];
      break;
    }
  }

  if (productRow === -1) throw new Error('Product not found');
  if (currentStock < quantity) throw new Error('Insufficient stock');

  // ── 2. Lower stock ──
  stockSheet.getRange(productRow, stockCol + 1).setValue(currentStock - quantity);

  // ── 3. Record order in Commandes sheet ──
  const ordersSheet = ss.getSheetByName(ORDERS_SHEET);
  const orderId = 'CMD-' + Date.now();
  const now     = new Date().toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' });

  ordersSheet.appendRow([
    orderId,       // A: Order ID
    now,           // B: Date & time
    fullName,      // C: Customer full name
    email,         // D: Gmail
    phone,         // E: Phone number
    productId,     // F: Product ID
    productName,   // G: Product name
    productPrice,  // H: Unit price
    quantity,      // I: Quantity
    parseInt(productPrice) * quantity, // J: Total
    'En attente'   // K: Status (En attente / Confirmée / Annulée)
  ]);

  return { success: true, orderId };
}

// ══════════════════════════════════════════════════════════════
//  SETUP FUNCTION — run this ONCE to create both sheets
//  Go to: Run → setupSheets
// ══════════════════════════════════════════════════════════════
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Create Stock sheet if it doesn't exist
  let stockSheet = ss.getSheetByName(STOCK_SHEET);
  if (!stockSheet) {
    stockSheet = ss.insertSheet(STOCK_SHEET);
  }
  stockSheet.clearContents();
  stockSheet.getRange(1, 1, 1, 8).setValues([[
    'id', 'name', 'name_fr', 'name_en', 'category', 'price', 'stock', 'img'
  ]]);
  // Example product rows:
  stockSheet.getRange(2, 1, 3, 8).setValues([
    ['1', 'عباءة فاخرة',       'Abaya Luxe',      'Luxury Abaya',      'عباءات',  4500, 10, ''],
    ['2', 'جلباب كلاسيك',      'Djellaba Classique','Classic Djellaba', 'جلابيب',  3200, 5,  ''],
    ['3', 'قميص إسلامي أبيض',  'Qamis Blanc',     'White Qamis',       'قمصان',   2100, 8,  ''],
  ]);

  // Style header row
  stockSheet.getRange(1, 1, 1, 8)
    .setBackground('#1a3a2a').setFontColor('#c9a84c').setFontWeight('bold');

  // Create Orders sheet if it doesn't exist
  let ordersSheet = ss.getSheetByName(ORDERS_SHEET);
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet(ORDERS_SHEET);
  }
  ordersSheet.clearContents();
  ordersSheet.getRange(1, 1, 1, 11).setValues([[
    'رقم الطلب', 'التاريخ', 'الاسم الكامل', 'البريد الإلكتروني',
    'الهاتف', 'رقم المنتج', 'اسم المنتج', 'السعر', 'الكمية', 'المجموع', 'الحالة'
  ]]);
  ordersSheet.getRange(1, 1, 1, 11)
    .setBackground('#1a3a2a').setFontColor('#c9a84c').setFontWeight('bold');

  SpreadsheetApp.getActive().toast('✅ Sheets created successfully!', 'Setup Complete', 5);
}
