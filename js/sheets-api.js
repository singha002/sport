/**
 * ============================================================================
 * ระบบยืม-คืนอุปกรณ์กีฬาโรงเรียน (School Sports Equipment Loan System)
 * sheets-api.js - ตัวจัดการเชื่อมต่อ Google Sheets ผ่าน Google Apps Script Web App API
 * ============================================================================
 */

class GoogleSheetsService {
  constructor() {
    this.storageKey = 'sports_sheets_api_url';
    this.apiUrl = localStorage.getItem(this.storageKey) || '';
    this.isOnline = false;
    this.lastError = null;
  }

  getApiUrl() {
    return this.apiUrl;
  }

  setApiUrl(url) {
    this.apiUrl = (url || '').trim();
    if (this.apiUrl) {
      localStorage.setItem(this.storageKey, this.apiUrl);
    } else {
      localStorage.removeItem(this.storageKey);
    }
  }

  // ตรวจสอบความถูกต้องของรูปแบบ URL และให้คำแนะนำ
  validateUrl(url) {
    const rawUrl = (url || this.apiUrl || '').trim();
    if (!rawUrl) {
      return { valid: false, message: 'ยังไม่ได้ระบุ Web App URL ของ Google Apps Script' };
    }
    if (rawUrl.includes('docs.google.com/spreadsheets')) {
      return { 
        valid: false, 
        message: '❌ URL ที่ระบุคือลิงก์ Google Sheets โดยตรง! กรุณาไปที่ Extensions > Apps Script > Deploy เพื่อนำ Web App URL ที่ขึ้นต้นด้วย https://script.google.com/... มาใส่' 
      };
    }
    if (!rawUrl.startsWith('https://script.google.com/macros/s/')) {
      return { 
        valid: false, 
        message: '❌ URL ต้องขึ้นต้นด้วย https://script.google.com/macros/s/...' 
      };
    }
    if (rawUrl.endsWith('/dev')) {
      return { 
        valid: true, 
        warning: true, 
        message: '⚠️ URL ลงท้ายด้วย /dev ซึ่งต้องเข้าสู่ระบบ Google ตลอดเวลา แนะนำให้ใช้ลิงก์ที่ลงท้ายด้วย /exec' 
      };
    }
    return { valid: true, message: 'รูปแบบ URL ถูกต้อง' };
  }

  isConfigured() {
    return !!(this.apiUrl && this.apiUrl.startsWith('https://script.google.com'));
  }

  async testConnection(customUrl) {
    const targetUrl = customUrl ? customUrl.trim() : this.apiUrl;
    const validation = this.validateUrl(targetUrl);
    if (!validation.valid) {
      this.isOnline = false;
      this.lastError = validation.message;
      return { ok: false, message: validation.message };
    }

    try {
      const res = await this.callApiDirect(targetUrl, { action: 'ping' });
      if (res && res.status === 'success') {
        this.isOnline = true;
        this.lastError = null;
        return { 
          ok: true, 
          message: `เชื่อมต่อกับ Google Sheets สำเร็จ (${res.spreadsheetTitle || 'พร้อมใช้งาน'})`,
          data: res 
        };
      } else {
        throw new Error(res.message || 'การตอบกลับจาก Google Apps Script ไม่ถูกต้อง');
      }
    } catch (e) {
      this.isOnline = false;
      this.lastError = e.message;
      return { ok: false, message: e.message };
    }
  }

  // เรียก API ไปยัง Google Apps Script (รองรับทั้ง POST และ Fallback เป็น GET)
  async callApiDirect(targetUrl, payload) {
    const url = targetUrl.trim();
    let responseText = '';

    // 1. ลองส่งแบบ POST (Content-Type: text/plain เพื่อเลี่ยง preflight CORS)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      responseText = await response.text();
    } catch (postErr) {
      console.warn('POST to Apps Script failed, trying GET fallback...', postErr);
      
      // 2. Fallback: ส่งแบบ GET พร้อมใส่ payload ใน query parameter data
      try {
        const getUrl = url + (url.includes('?') ? '&' : '?') + 'data=' + encodeURIComponent(JSON.stringify(payload));
        const getResponse = await fetch(getUrl, {
          method: 'GET',
          redirect: 'follow'
        });
        responseText = await getResponse.text();
      } catch (getErr) {
        throw new Error('ไม่สามารถเชื่อมต่อ Google Apps Script ได้ (Network/CORS Error) กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต และตรวจสอบว่าได้เลือก Who has access: Anyone ในการ Deploy หรือไม่');
      }
    }

    // ตรวจสอบการตอบกลับกรณี Google สั่ง redirect ไปหน้า Login
    if (responseText.includes('accounts.google.com') || responseText.includes('ServiceLogin') || responseText.includes('<!DOCTYPE html>')) {
      throw new Error('❌ Google ปฏิเสธการเข้าถึง: สาเหตุเกิดจากในขั้นตอน Deploy ยังไม่ได้เลือก "Who has access: Anyone (ทุกคน)" กรุณาไปที่ Google Apps Script > Deploy > Manage deployments > แก้ไข Who has access เป็น Anyone แล้วกด Deploy ใหม่');
    }

    try {
      const data = JSON.parse(responseText);
      return data;
    } catch (parseErr) {
      console.error('Failed to parse JSON response from Apps Script:', responseText);
      throw new Error('ข้อมูลตอบกลับจาก Google Apps Script ไม่อยู่ในรูปแบบ JSON: ' + responseText.substring(0, 100));
    }
  }

  async callApi(payload) {
    if (!this.isConfigured()) {
      throw new Error('ยังไม่ได้กำหนด URL ของ Google Apps Script Web App ในการตั้งค่า');
    }
    return await this.callApiDirect(this.apiUrl, payload);
  }

  // --- Convenience API Methods ---

  async fetchAllData() {
    return await this.callApi({ action: 'getAllData' });
  }

  async syncAll(fullData) {
    return await this.callApi({
      action: 'syncAll',
      equipments: fullData.equipments || [],
      loans: fullData.loans || [],
      students: fullData.students || [],
      settings: fullData.settings || {}
    });
  }

  async registerStudent(studentId, studentClass, password) {
    return await this.callApi({
      action: 'registerStudent',
      studentId,
      studentClass,
      password
    });
  }

  async loginStudent(studentId, password) {
    return await this.callApi({
      action: 'loginStudent',
      studentId,
      password
    });
  }

  async borrowEquipment({ equipmentId, studentId, borrowerClass, quantity, dueDate, borrowDate }) {
    return await this.callApi({
      action: 'borrowEquipment',
      equipmentId,
      studentId,
      borrowerClass,
      quantity,
      dueDate,
      borrowDate
    });
  }

  async returnEquipment({ loanId, stationCode, returnDate }) {
    return await this.callApi({
      action: 'returnEquipment',
      loanId,
      stationCode,
      returnDate
    });
  }

  async saveEquipment({ id, name, icon, totalQuantity }) {
    return await this.callApi({
      action: 'saveEquipment',
      id,
      name,
      icon,
      totalQuantity
    });
  }

  async deleteEquipment(id) {
    return await this.callApi({
      action: 'deleteEquipment',
      id
    });
  }

  async saveSettings(settingsObj) {
    return await this.callApi({
      action: 'saveSettings',
      ...settingsObj
    });
  }

  async resetAll() {
    return await this.callApi({
      action: 'resetAll'
    });
  }
}

// สร้าง Global Instance
window.googleSheetsService = new GoogleSheetsService();
