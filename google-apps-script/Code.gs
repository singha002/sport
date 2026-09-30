/**
 * ============================================================================
 * ระบบยืม-คืนอุปกรณ์กีฬาโรงเรียน (School Sports Equipment Loan System)
 * Google Apps Script Web App Backend for Google Sheets
 * ============================================================================
 * 
 * วิธีการติดตั้ง (Quick 1-Minute Setup):
 * 1. สร้าง Google Sheets ใหม่ขึ้นมา 1 ไฟล์ (เช่น ตั้งชื่อว่า "ระบบยืม-คืนอุปกรณ์กีฬา")
 * 2. ไปที่เมนู Extensions (ส่วนขยาย) > Apps Script
 * 3. ลบโค้ดเดิมออกทั้งหมด แล้วนำโค้ดในไฟล์นี้ไปวางทับ
 * 4. กดปุ่ม "Deploy (การทำให้ใช้งานได้)" > "New deployment (การทำให้ใช้งานได้ใหม่)"
 * 5. เลือกประเภทเป็น "Web app (เว็บแอป)"
 *    - Description: ระบบยืม-คืนอุปกรณ์กีฬา
 *    - Execute as: Me (ฉัน)
 *    - Who has access: Anyone (ทุกคน) *** สำคัญมาก เพื่อให้เว็บแอปเรียก API ได้
 * 6. กดปุ่ม "Deploy" แล้วคัดลอก "Web app URL" (ขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)
 * 7. นำ URL ที่ได้ไปกรอกในหน้า "⚙️ ตั้งค่าระบบ" ในแดชบอร์ดครูของเว็บแอปพลิเคชัน
 */

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    initSheetsIfNotExist();
    
    var params = {};
    if (e && e.parameter && e.parameter.data) {
      try {
        params = JSON.parse(e.parameter.data);
      } catch (err) {
        params = e.parameter || {};
      }
    } else if (method === 'POST' && e && e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (err) {
        params = e.parameter || {};
      }
    } else if (e && e.parameter) {
      params = e.parameter;
    }

    var action = params.action || 'getAllData';
    var responseData = {};

    switch (action) {
      case 'ping':
        responseData = { 
          status: 'success', 
          message: 'Google Sheets API Ready', 
          timestamp: new Date().toISOString(),
          spreadsheetTitle: getSpreadsheet().getName()
        };
        break;

      case 'getAllData':
        responseData = {
          status: 'success',
          equipments: getSheetData('Equipments'),
          loans: getSheetData('Loans'),
          students: getSheetData('Students', true), // Safe students list (omit password in public get)
          settings: getSettingsMap()
        };
        break;

      case 'registerStudent':
        responseData = registerStudent(params);
        break;

      case 'loginStudent':
        responseData = loginStudent(params);
        break;

      case 'borrowEquipment':
        responseData = borrowEquipment(params);
        break;

      case 'returnEquipment':
        responseData = returnEquipment(params);
        break;

      case 'saveEquipment':
        responseData = saveEquipment(params);
        break;

      case 'deleteEquipment':
        responseData = deleteEquipment(params);
        break;

      case 'saveSettings':
        responseData = saveSettings(params);
        break;

      case 'syncAll':
        responseData = syncAllData(params);
        break;

      case 'resetAll':
        responseData = resetAllData();
        break;

      default:
        responseData = { status: 'error', message: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------------------------------
// Sheet Initialization & Data Helpers
// ----------------------------------------------------------------------------

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function initSheetsIfNotExist() {
  var ss = getSpreadsheet();
  
  // 1. Equipments Sheet
  var eqSheet = ss.getSheetByName('Equipments');
  if (!eqSheet) {
    eqSheet = ss.insertSheet('Equipments');
    eqSheet.appendRow(['id', 'name', 'icon', 'totalQuantity', 'createdAt']);
    eqSheet.setFrozenRows(1);
    
    // Seed default equipments
    var defaultEquips = [
      ['eq_1', 'ลูกฟุตบอล', '⚽', 15, new Date().toISOString()],
      ['eq_2', 'ลูกบาสเกตบอล', '🏀', 12, new Date().toISOString()],
      ['eq_3', 'ลูกวอลเลย์บอล', '🏐', 10, new Date().toISOString()],
      ['eq_4', 'ไม้แบดมินตัน', '🏸', 16, new Date().toISOString()],
      ['eq_5', 'ไม้ปิงปอง', '🏓', 14, new Date().toISOString()],
      ['eq_6', 'ลูกฟุตซอล', '⚽', 8, new Date().toISOString()],
      ['eq_7', 'ลูกเปตอง (ชุด)', '⚪', 6, new Date().toISOString()],
      ['eq_8', 'ลูกตะกร้อ', '🧺', 10, new Date().toISOString()]
    ];
    for (var i = 0; i < defaultEquips.length; i++) {
      eqSheet.appendRow(defaultEquips[i]);
    }
  }

  // 2. Loans Sheet
  var loanSheet = ss.getSheetByName('Loans');
  if (!loanSheet) {
    loanSheet = ss.insertSheet('Loans');
    loanSheet.appendRow([
      'id', 'equipmentId', 'equipmentName', 'equipmentIcon',
      'studentId', 'borrowerClass', 'quantity',
      'borrowDate', 'dueDate', 'returned', 'returnDate', 'stationCode'
    ]);
    loanSheet.setFrozenRows(1);
  }

  // 3. Students Sheet
  var stdSheet = ss.getSheetByName('Students');
  if (!stdSheet) {
    stdSheet = ss.insertSheet('Students');
    stdSheet.appendRow(['studentId', 'studentClass', 'password', 'registeredAt']);
    stdSheet.setFrozenRows(1);
  }

  // 4. Settings Sheet
  var setSheet = ss.getSheetByName('Settings');
  if (!setSheet) {
    setSheet = ss.insertSheet('Settings');
    setSheet.appendRow(['key', 'value']);
    setSheet.setFrozenRows(1);
    
    var defaultSettings = [
      ['schoolName', 'โรงเรียนของเรา'],
      ['schoolSubtitle', 'ฝ่ายส่งเสริมกีฬาและสุขภาพนักเรียน'],
      ['teacherName', 'คุณครูผู้ดูแลระบบ'],
      ['adminUsername', 'admin'],
      ['adminPassword', '1234'],
      ['returnStationCode', 'SP-8899']
    ];
    for (var j = 0; j < defaultSettings.length; j++) {
      setSheet.appendRow(defaultSettings[j]);
    }
  }
}

function getSheetData(sheetName, safeStudents) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0];
  var results = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      var header = headers[h];
      if (safeStudents && header === 'password') {
        // do not expose student password in public data
        continue;
      }
      var val = row[h];
      if (header === 'returned') {
        obj[header] = (val === true || String(val).toLowerCase() === 'true');
      } else if (header === 'totalQuantity' || header === 'quantity') {
        obj[header] = parseInt(val, 10) || 0;
      } else {
        obj[header] = (val !== undefined && val !== null) ? String(val) : '';
      }
    }
    if (obj.id || obj.studentId) {
      results.push(obj);
    }
  }

  return results;
}

function getSettingsMap() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return {};

  var values = sheet.getDataRange().getValues();
  var settings = {};

  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0]).trim();
    var val = values[i][1];
    if (key) {
      settings[key] = String(val);
    }
  }

  return settings;
}

// ----------------------------------------------------------------------------
// Business Logic Handlers
// ----------------------------------------------------------------------------

function registerStudent(params) {
  var studentId = String(params.studentId || '').trim();
  var studentClass = String(params.studentClass || '').trim();
  var password = String(params.password || '').trim();

  if (!studentId || !studentClass || !password) {
    return { status: 'error', message: 'กรุณากรอกรหัสนักเรียน ชั้นเรียน และรหัสผ่านให้ครบถ้วน' };
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Students');
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === studentId) {
      return { status: 'error', message: 'รหัสนักเรียน ' + studentId + ' นี้ลงทะเบียนในระบบแล้ว' };
    }
  }

  sheet.appendRow([studentId, studentClass, password, new Date().toISOString()]);
  return {
    status: 'success',
    message: 'ลงทะเบียนนักเรียนสำเร็จ',
    student: { studentId: studentId, studentClass: studentClass }
  };
}

function loginStudent(params) {
  var studentId = String(params.studentId || '').trim();
  var password = String(params.password || '').trim();

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Students');
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === studentId) {
      var storedPass = String(values[i][2]).trim();
      if (storedPass === password) {
        return {
          status: 'success',
          message: 'เข้าสู่ระบบสำเร็จ',
          student: {
            studentId: studentId,
            studentClass: String(values[i][1]).trim()
          }
        };
      } else {
        return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' };
      }
    }
  }

  return { status: 'error', message: 'ไม่พบรหัสนักเรียนนี้ในระบบ กรุณาสมัครสมาชิกก่อนเข้าใช้งาน' };
}

function borrowEquipment(params) {
  var equipmentId = String(params.equipmentId || '').trim();
  var studentId = String(params.studentId || '').trim();
  var borrowerClass = String(params.borrowerClass || '').trim();
  var quantity = parseInt(params.quantity, 10) || 1;
  var dueDate = String(params.dueDate || '').trim();
  var borrowDate = String(params.borrowDate || new Date().toISOString().split('T')[0]).trim();

  if (!equipmentId || !studentId || !borrowerClass || quantity < 1 || !dueDate) {
    return { status: 'error', message: 'ข้อมูลการยืมไม่ครบถ้วน' };
  }

  var ss = getSpreadsheet();
  var eqSheet = ss.getSheetByName('Equipments');
  var eqValues = eqSheet.getDataRange().getValues();
  var targetEquip = null;

  for (var i = 1; i < eqValues.length; i++) {
    if (String(eqValues[i][0]) === equipmentId) {
      targetEquip = {
        id: eqValues[i][0],
        name: eqValues[i][1],
        icon: eqValues[i][2],
        totalQuantity: parseInt(eqValues[i][3], 10)
      };
      break;
    }
  }

  if (!targetEquip) {
    return { status: 'error', message: 'ไม่พบอุปกรณ์ที่ระบุ' };
  }

  var loanSheet = ss.getSheetByName('Loans');
  var loanId = 'loan_' + new Date().getTime();

  loanSheet.appendRow([
    loanId,
    targetEquip.id,
    targetEquip.name,
    targetEquip.icon,
    studentId,
    borrowerClass,
    quantity,
    borrowDate,
    dueDate,
    false, // returned
    '',    // returnDate
    ''     // stationCode
  ]);

  return {
    status: 'success',
    message: 'บันทึกการยืมสำเร็จ',
    loanId: loanId
  };
}

function returnEquipment(params) {
  var loanId = String(params.loanId || '').trim();
  var stationCode = String(params.stationCode || '').trim();
  var returnDate = String(params.returnDate || new Date().toISOString().split('T')[0]).trim();

  var ss = getSpreadsheet();
  var settings = getSettingsMap();
  var requiredStation = String(settings.returnStationCode || 'SP-8899').trim();

  if (stationCode && stationCode !== requiredStation) {
    return { status: 'error', message: 'รหัสจุดคืน/QR Code ไม่ถูกต้อง' };
  }

  var loanSheet = ss.getSheetByName('Loans');
  var values = loanSheet.getDataRange().getValues();
  var foundRow = -1;
  var loanItem = null;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === loanId) {
      foundRow = i + 1; // 1-indexed for Sheet
      loanItem = values[i];
      break;
    }
  }

  if (foundRow === -1) {
    return { status: 'error', message: 'ไม่พบรายการยืมนี้' };
  }

  // Update row: returned = true (column 10), returnDate (column 11), stationCode (column 12)
  loanSheet.getRange(foundRow, 10).setValue(true);
  loanSheet.getRange(foundRow, 11).setValue(returnDate);
  loanSheet.getRange(foundRow, 12).setValue(stationCode || requiredStation);

  return {
    status: 'success',
    message: 'บันทึกการคืนเรียบร้อยแล้ว'
  };
}

function saveEquipment(params) {
  var id = String(params.id || '').trim();
  var name = String(params.name || '').trim();
  var icon = String(params.icon || '⚽').trim();
  var totalQuantity = parseInt(params.totalQuantity, 10) || 1;

  if (!name || totalQuantity < 1) {
    return { status: 'error', message: 'ชื่ออุปกรณ์และจำนวนไม่ถูกต้อง' };
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Equipments');
  var values = sheet.getDataRange().getValues();

  if (id) {
    // Edit existing
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === id) {
        sheet.getRange(i + 1, 2).setValue(name);
        sheet.getRange(i + 1, 3).setValue(icon);
        sheet.getRange(i + 1, 4).setValue(totalQuantity);
        return { status: 'success', message: 'แก้ไขอุปกรณ์สำเร็จ' };
      }
    }
  }

  // Create new
  var newId = 'eq_' + new Date().getTime();
  sheet.appendRow([newId, name, icon, totalQuantity, new Date().toISOString()]);
  return { status: 'success', message: 'เพิ่มอุปกรณ์ใหม่สำเร็จ', id: newId };
}

function deleteEquipment(params) {
  var id = String(params.id || '').trim();
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Equipments');
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return { status: 'success', message: 'ลบอุปกรณ์เรียบร้อยแล้ว' };
    }
  }

  return { status: 'error', message: 'ไม่พบอุปกรณ์ที่ต้องการลบ' };
}

function saveSettings(params) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  var values = sheet.getDataRange().getValues();
  var existingKeys = {};

  for (var i = 1; i < values.length; i++) {
    existingKeys[String(values[i][0]).trim()] = i + 1;
  }

  for (var key in params) {
    if (key === 'action') continue;
    var rowIdx = existingKeys[key];
    if (rowIdx) {
      sheet.getRange(rowIdx, 2).setValue(String(params[key]));
    } else {
      sheet.appendRow([key, String(params[key])]);
    }
  }

  return { status: 'success', message: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว' };
}

function syncAllData(params) {
  var ss = getSpreadsheet();
  
  // 1. Equipments
  if (Array.isArray(params.equipments) && params.equipments.length > 0) {
    var eqSheet = ss.getSheetByName('Equipments');
    if (!eqSheet) {
      eqSheet = ss.insertSheet('Equipments');
      eqSheet.appendRow(['id', 'name', 'icon', 'totalQuantity', 'createdAt']);
      eqSheet.setFrozenRows(1);
    } else {
      eqSheet.clear();
      eqSheet.appendRow(['id', 'name', 'icon', 'totalQuantity', 'createdAt']);
      eqSheet.setFrozenRows(1);
    }
    for (var i = 0; i < params.equipments.length; i++) {
      var eq = params.equipments[i];
      eqSheet.appendRow([eq.id, eq.name, eq.icon || '⚽', parseInt(eq.totalQuantity, 10) || 1, eq.createdAt || new Date().toISOString()]);
    }
  }

  // 2. Loans
  if (Array.isArray(params.loans)) {
    var loanSheet = ss.getSheetByName('Loans');
    if (!loanSheet) {
      loanSheet = ss.insertSheet('Loans');
      loanSheet.appendRow([
        'id', 'equipmentId', 'equipmentName', 'equipmentIcon',
        'studentId', 'borrowerClass', 'quantity',
        'borrowDate', 'dueDate', 'returned', 'returnDate', 'stationCode'
      ]);
      loanSheet.setFrozenRows(1);
    } else {
      loanSheet.clear();
      loanSheet.appendRow([
        'id', 'equipmentId', 'equipmentName', 'equipmentIcon',
        'studentId', 'borrowerClass', 'quantity',
        'borrowDate', 'dueDate', 'returned', 'returnDate', 'stationCode'
      ]);
      loanSheet.setFrozenRows(1);
    }
    for (var j = 0; j < params.loans.length; j++) {
      var l = params.loans[j];
      loanSheet.appendRow([
        l.id, l.equipmentId, l.equipmentName, l.equipmentIcon || '',
        l.studentId, l.borrowerClass, parseInt(l.quantity, 10) || 1,
        l.borrowDate, l.dueDate, l.returned === true, l.returnDate || '', l.stationCode || ''
      ]);
    }
  }

  // 3. Students
  if (Array.isArray(params.students) && params.students.length > 0) {
    var stdSheet = ss.getSheetByName('Students');
    if (!stdSheet) {
      stdSheet = ss.insertSheet('Students');
      stdSheet.appendRow(['studentId', 'studentClass', 'password', 'registeredAt']);
      stdSheet.setFrozenRows(1);
    } else {
      stdSheet.clear();
      stdSheet.appendRow(['studentId', 'studentClass', 'password', 'registeredAt']);
      stdSheet.setFrozenRows(1);
    }
    for (var k = 0; k < params.students.length; k++) {
      var s = params.students[k];
      stdSheet.appendRow([s.studentId, s.studentClass, s.password || '1234', s.registeredAt || new Date().toISOString()]);
    }
  }

  // 4. Settings
  if (params.settings && typeof params.settings === 'object') {
    var setSheet = ss.getSheetByName('Settings');
    if (!setSheet) {
      setSheet = ss.insertSheet('Settings');
      setSheet.appendRow(['key', 'value']);
      setSheet.setFrozenRows(1);
    } else {
      setSheet.clear();
      setSheet.appendRow(['key', 'value']);
      setSheet.setFrozenRows(1);
    }
    for (var key in params.settings) {
      setSheet.appendRow([key, String(params.settings[key])]);
    }
  }

  return { status: 'success', message: 'อัปโหลดและซิงค์ข้อมูลทั้งหมดขึ้น Google Sheets เรียบร้อยแล้ว' };
}

function resetAllData() {
  var ss = getSpreadsheet();
  var sheets = ['Equipments', 'Loans', 'Students', 'Settings'];
  for (var i = 0; i < sheets.length; i++) {
    var sh = ss.getSheetByName(sheets[i]);
    if (sh) ss.deleteSheet(sh);
  }
  initSheetsIfNotExist();
  return { status: 'success', message: 'รีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว' };
}

