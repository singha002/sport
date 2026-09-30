/**
 * ============================================================================
 * ระบบยืม-คืนอุปกรณ์กีฬาโรงเรียน (School Sports Equipment Loan System)
 * storage.js - ฐานข้อมูลไฮบริด Google Sheets + LocalStorage & ระบบยืนยันตัวตน
 * ============================================================================
 */

class SportsStorage {
  constructor() {
    this.KEYS = {
      EQUIPMENTS: 'sports_equipments',
      LOANS: 'sports_loans',
      STUDENTS: 'sports_students',
      SETTINGS: 'sports_settings',
      AUTH: 'sports_teacher_auth',
      STUDENT_AUTH: 'sports_student_auth'
    };

    this.subscribers = [];
    this.isCloudSyncing = false;
    this.init();
  }

  // --- การสมัครรับการแจ้งเตือน Realtime (Observer Pattern) ---
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.subscribers.push(callback);
    }
  }

  notifyChange() {
    this.subscribers.forEach(cb => {
      try { cb(); } catch (e) { console.error('Observer error:', e); }
    });
  }

  // --- เริ่มต้นและซิงค์ข้อมูลเริ่มต้น ---
  async init() {
    // 1. ตรวจสอบข้อมูล LocalStorage พื้นฐาน ถ้าไม่มีให้ใส่ค่าเริ่มต้น
    if (!localStorage.getItem(this.KEYS.EQUIPMENTS)) {
      localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(this.getDefaultEquipments()));
    }
    if (!localStorage.getItem(this.KEYS.LOANS)) {
      localStorage.setItem(this.KEYS.LOANS, JSON.stringify(this.getDefaultLoans()));
    }
    if (!localStorage.getItem(this.KEYS.STUDENTS)) {
      localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(this.getDefaultStudents()));
    }
    if (!localStorage.getItem(this.KEYS.SETTINGS)) {
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(this.getDefaultSettings()));
    }

    // 2. ถ้ามีการเชื่อมต่อ Google Sheets ให้ทำการดึงข้อมูลล่าสุด (Sync)
    if (window.googleSheetsService && window.googleSheetsService.isConfigured()) {
      await this.syncFromGoogleSheets();
    }
  }

  isGoogleSheetsReady() {
    return window.googleSheetsService ? window.googleSheetsService.isConfigured() : false;
  }

  // --- ดึงข้อมูลทั้งหมดจาก Google Sheets มาอัปเดตลงเครื่อง ---
  async syncFromGoogleSheets() {
    if (!this.isGoogleSheetsReady() || this.isCloudSyncing) return false;
    this.isCloudSyncing = true;

    try {
      const data = await window.googleSheetsService.fetchAllData();
      if (data && data.status === 'success') {
        if (Array.isArray(data.equipments) && data.equipments.length > 0) {
          localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(data.equipments));
        }
        if (Array.isArray(data.loans)) {
          localStorage.setItem(this.KEYS.LOANS, JSON.stringify(data.loans));
        }
        if (Array.isArray(data.students) && data.students.length > 0) {
          // เก็บเฉพาะข้อมูลนักเรียนที่ซิงค์มา
          const currentStudents = this.getStudents();
          const mergedStudents = [...currentStudents];
          data.students.forEach(s => {
            const idx = mergedStudents.findIndex(item => item.studentId === s.studentId);
            if (idx === -1) {
              mergedStudents.push(s);
            }
          });
          localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(mergedStudents));
        }
        if (data.settings && typeof data.settings === 'object') {
          const currentSettings = this.getSettings();
          const mergedSettings = { ...currentSettings, ...data.settings };
          localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(mergedSettings));
        }
        this.notifyChange();
        return { success: true, message: 'ซิงค์ข้อมูลจาก Google Sheets สำเร็จ' };
      } else {
        throw new Error(data ? data.message : 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้');
      }
    } catch (err) {
      console.warn('Sync from Google Sheets skipped/failed:', err);
      throw err;
    } finally {
      this.isCloudSyncing = false;
    }
  }

  // --- อัปโหลดข้อมูลทั้งหมดใน LocalStorage ขึ้นไปเก็บยัง Google Sheets ---
  async uploadAllToGoogleSheets() {
    if (!this.isGoogleSheetsReady()) {
      throw new Error('ยังไม่ได้กำหนด URL ของ Google Apps Script');
    }

    const payload = {
      equipments: this.getEquipments(),
      loans: this.getLoans(),
      students: this.getStudents(),
      settings: this.getSettings()
    };

    const result = await window.googleSheetsService.syncAll(payload);
    if (result && result.status === 'success') {
      return result;
    } else {
      throw new Error(result ? result.message : 'อัปโหลดข้อมูลไม่สำเร็จ');
    }
  }

  // ==========================================================================
  // ข้อมูลเริ่มต้น (Default Mock Data)
  // ==========================================================================
  getDefaultEquipments() {
    return [
      { id: 'eq_1', name: 'ลูกฟุตบอล', icon: '⚽', totalQuantity: 15 },
      { id: 'eq_2', name: 'ลูกบาสเกตบอล', icon: '🏀', totalQuantity: 12 },
      { id: 'eq_3', name: 'ลูกวอลเลย์บอล', icon: '🏐', totalQuantity: 10 },
      { id: 'eq_4', name: 'ไม้แบดมินตัน', icon: '🏸', totalQuantity: 16 },
      { id: 'eq_5', name: 'ไม้ปิงปอง', icon: '🏓', totalQuantity: 14 },
      { id: 'eq_6', name: 'ลูกฟุตซอล', icon: '⚽', totalQuantity: 8 },
      { id: 'eq_7', name: 'ลูกเปตอง (ชุด)', icon: '⚪', totalQuantity: 6 },
      { id: 'eq_8', name: 'ลูกตะกร้อ', icon: '🧺', totalQuantity: 10 }
    ];
  }

  getDefaultLoans() {
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    const d1 = new Date(today); d1.setDate(today.getDate() - 3);
    const due1 = new Date(today); due1.setDate(today.getDate() - 1);

    const d2 = new Date(today); d2.setDate(today.getDate() - 1);
    const due2 = new Date(today); due2.setDate(today.getDate() + 1);

    return [
      {
        id: 'loan_1',
        equipmentId: 'eq_1',
        equipmentName: 'ลูกฟุตบอล',
        equipmentIcon: '⚽',
        studentId: '10234',
        borrowerClass: 'ม.3/1',
        quantity: 2,
        borrowDate: formatDate(d1),
        dueDate: formatDate(due1),
        returned: false,
        returnDate: null,
        stationCode: ''
      },
      {
        id: 'loan_2',
        equipmentId: 'eq_2',
        equipmentName: 'ลูกบาสเกตบอล',
        equipmentIcon: '🏀',
        studentId: '10567',
        borrowerClass: 'ม.2/2',
        quantity: 1,
        borrowDate: formatDate(d2),
        dueDate: formatDate(due2),
        returned: false,
        returnDate: null,
        stationCode: ''
      }
    ];
  }

  getDefaultStudents() {
    return [
      { studentId: '10234', studentClass: 'ม.3/1', password: '1234', registeredAt: new Date().toISOString() },
      { studentId: '10567', studentClass: 'ม.2/2', password: '1234', registeredAt: new Date().toISOString() }
    ];
  }

  getDefaultSettings() {
    return {
      schoolName: 'โรงเรียนของเรา',
      schoolSubtitle: 'ฝ่ายส่งเสริมกีฬาและสุขภาพนักเรียน',
      teacherName: 'คุณครูผู้ดูแลระบบ',
      adminUsername: 'admin',
      adminPassword: '1234',
      returnStationCode: 'SP-8899'
    };
  }

  // ==========================================================================
  // ระบบยืนยันตัวตน (Authentication: Student & Teacher)
  // ==========================================================================

  // --- 1. สมัครสมาชิกนักเรียน (Student Registration) ---
  async registerStudent(studentId, studentClass, password) {
    const sId = (studentId || '').trim();
    const sClass = (studentClass || '').trim();
    const pwd = (password || '').trim();

    if (!sId || !sClass || !pwd) {
      throw new Error('กรุณากรอกรหัสนักเรียน ชั้นเรียน และรหัสผ่านให้ครบถ้วน');
    }

    // บันทึกลง Google Sheets ถ้าเปิดใช้งาน
    if (this.isGoogleSheetsReady()) {
      try {
        const res = await window.googleSheetsService.registerStudent(sId, sClass, pwd);
        if (res.status === 'error') {
          throw new Error(res.message);
        }
      } catch (err) {
        if (!err.message.includes('fetch')) throw err;
      }
    }

    // ตรวจสอบและบันทึกลง LocalStorage
    const students = this.getStudents();
    const existing = students.find(s => s.studentId === sId);
    if (existing) {
      throw new Error(`รหัสนักเรียน ${sId} นี้มีการลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบ`);
    }

    const newStudent = {
      studentId: sId,
      studentClass: sClass,
      password: pwd,
      registeredAt: new Date().toISOString()
    };
    students.push(newStudent);
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(students));

    // เข้าสู่ระบบให้อัตโนมัติหลังสมัครสำเร็จ
    const session = {
      studentId: sId,
      studentClass: sClass,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(this.KEYS.STUDENT_AUTH, JSON.stringify(session));
    this.notifyChange();
    return session;
  }

  getStudents() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.STUDENTS)) || this.getDefaultStudents();
    } catch (e) {
      return this.getDefaultStudents();
    }
  }

  // --- 2. เข้าสู่ระบบนักเรียน (Student Login with Password) ---
  async loginStudent(studentId, password) {
    const sId = (studentId || '').trim();
    const pwd = (password || '').trim();

    if (!sId || !pwd) {
      throw new Error('กรุณากรอกรหัสนักเรียนและรหัสผ่าน');
    }

    // ตรวจสอบกับ Google Sheets ถ้าออนไลน์
    if (this.isGoogleSheetsReady()) {
      try {
        const res = await window.googleSheetsService.loginStudent(sId, pwd);
        if (res.status === 'success' && res.student) {
          const session = {
            studentId: res.student.studentId,
            studentClass: res.student.studentClass,
            loginTime: new Date().toISOString()
          };
          localStorage.setItem(this.KEYS.STUDENT_AUTH, JSON.stringify(session));
          this.notifyChange();
          return session;
        } else if (res.status === 'error') {
          throw new Error(res.message);
        }
      } catch (err) {
        if (!err.message.includes('fetch')) throw err;
      }
    }

    // ตรวจสอบกับ LocalStorage
    const students = this.getStudents();
    const target = students.find(s => s.studentId === sId);

    if (!target) {
      throw new Error(`ไม่พบรหัสนักเรียน ${sId} ในระบบ กรุณากด "สมัครสมาชิกใหม่" ก่อนเข้าใช้งาน`);
    }
    if (target.password !== pwd) {
      throw new Error('รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    }

    const session = {
      studentId: target.studentId,
      studentClass: target.studentClass,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(this.KEYS.STUDENT_AUTH, JSON.stringify(session));
    this.notifyChange();
    return session;
  }

  logoutStudent() {
    localStorage.removeItem(this.KEYS.STUDENT_AUTH);
    this.notifyChange();
  }

  getStudentAuth() {
    try {
      const data = localStorage.getItem(this.KEYS.STUDENT_AUTH);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  // --- 3. เข้าสู่ระบบคุณครู (Teacher Authentication) ---
  login(username, password) {
    const settings = this.getSettings();
    const u = (username || '').trim();
    const p = (password || '').trim();

    if (u === settings.adminUsername && p === settings.adminPassword) {
      const session = {
        role: 'teacher',
        username: u,
        name: settings.teacherName,
        loginTime: new Date().toISOString()
      };
      localStorage.setItem(this.KEYS.AUTH, JSON.stringify(session));
      this.notifyChange();
      return session;
    }
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านคุณครูไม่ถูกต้อง');
  }

  logout() {
    localStorage.removeItem(this.KEYS.AUTH);
    this.notifyChange();
  }

  getAuth() {
    try {
      const data = localStorage.getItem(this.KEYS.AUTH);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  // ==========================================================================
  // ระบบยืมและคืนอุปกรณ์ (Loans & Availability)
  // ==========================================================================

  getEquipments() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.EQUIPMENTS)) || this.getDefaultEquipments();
    } catch (e) {
      return this.getDefaultEquipments();
    }
  }

  getLoans() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.LOANS)) || this.getDefaultLoans();
    } catch (e) {
      return this.getDefaultLoans();
    }
  }

  getEquipmentsWithAvailability() {
    const equipments = this.getEquipments();
    const loans = this.getLoans();

    return equipments.map(eq => {
      const borrowedCount = loans
        .filter(l => l.equipmentId === eq.id && !l.returned)
        .reduce((sum, l) => sum + (parseInt(l.quantity, 10) || 0), 0);

      const availableQuantity = Math.max(0, eq.totalQuantity - borrowedCount);

      return {
        ...eq,
        borrowedCount,
        availableQuantity
      };
    });
  }

  // --- ยืมอุปกรณ์ ---
  async borrowEquipment({ equipmentId, studentId, borrowerClass, quantity, dueDate }) {
    const equipments = this.getEquipmentsWithAvailability();
    const target = equipments.find(e => e.id === equipmentId);

    if (!target) throw new Error('ไม่พบอุปกรณ์ที่ระบุ');
    if (quantity < 1) throw new Error('จำนวนที่ยืมต้องอย่างน้อย 1 ชิ้น');
    if (quantity > target.availableQuantity) {
      throw new Error(`อุปกรณ์ไม่เพียงพอ คงเหลือให้ยืม ${target.availableQuantity} ชิ้น`);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newLoan = {
      id: 'loan_' + new Date().getTime(),
      equipmentId: target.id,
      equipmentName: target.name,
      equipmentIcon: target.icon,
      studentId: studentId.trim(),
      borrowerClass: borrowerClass.trim(),
      quantity: parseInt(quantity, 10),
      borrowDate: todayStr,
      dueDate: dueDate,
      returned: false,
      returnDate: null,
      stationCode: ''
    };

    // บันทึกลง Google Sheets
    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.borrowEquipment({
        equipmentId: target.id,
        studentId: newLoan.studentId,
        borrowerClass: newLoan.borrowerClass,
        quantity: newLoan.quantity,
        dueDate: newLoan.dueDate,
        borrowDate: newLoan.borrowDate
      }).catch(err => console.warn('Google Sheets borrow background sync error:', err));
    }

    // บันทึกลง LocalStorage
    const loans = this.getLoans();
    loans.unshift(newLoan);
    localStorage.setItem(this.KEYS.LOANS, JSON.stringify(loans));

    this.notifyChange();
    return newLoan;
  }

  // --- คืนอุปกรณ์ด้วยการยืนยันรหัสจุดคืน (Return Station Verification) ---
  async returnLoanWithVerification(loanId, stationCode) {
    const loans = this.getLoans();
    const loan = loans.find(l => l.id === loanId);
    if (!loan) throw new Error('ไม่พบรายการยืมนี้');
    if (loan.returned) throw new Error('รายการนี้ถูกบันทึกคืนไปเรียบร้อยแล้ว');

    // ตรวจสอบรหัสจุดคืน
    const validStation = this.getReturnStationCode();
    const inputCode = (stationCode || '').trim();

    if (inputCode && inputCode !== validStation) {
      throw new Error(`❌ รหัสจุดคืน "${inputCode}" ไม่ถูกต้อง กรุณาสแกน QR Code ที่ตู้เก็บอุปกรณ์`);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    loan.returned = true;
    loan.returnDate = todayStr;
    loan.stationCode = inputCode || validStation;

    // ส่งข้อมูลไป Google Sheets
    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.returnEquipment({
        loanId,
        stationCode: loan.stationCode,
        returnDate: todayStr
      }).catch(err => console.warn('Google Sheets return background sync error:', err));
    }

    localStorage.setItem(this.KEYS.LOANS, JSON.stringify(loans));
    this.notifyChange();
    return loan;
  }

  // Wrapper สำหรับครูกดคืนแทน
  async returnLoan(loanId) {
    return await this.returnLoanWithVerification(loanId, this.getReturnStationCode());
  }

  // --- ตรวจสอบกำหนดส่งคืน ---
  isOverdue(dueDateStr, returned) {
    if (returned || !dueDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    return today > due;
  }

  // ==========================================================================
  // การจัดการชนิดอุปกรณ์ (Equipment CRUD)
  // ==========================================================================

  async addEquipment({ name, icon, totalQuantity }) {
    const equipments = this.getEquipments();
    const newEquip = {
      id: 'eq_' + new Date().getTime(),
      name: name.trim(),
      icon: icon || '⚽',
      totalQuantity: parseInt(totalQuantity, 10) || 1
    };

    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.saveEquipment(newEquip).catch(console.warn);
    }

    equipments.push(newEquip);
    localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(equipments));
    this.notifyChange();
    return newEquip;
  }

  async updateEquipment(id, { name, icon, totalQuantity }) {
    const equipments = this.getEquipments();
    const idx = equipments.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('ไม่พบอุปกรณ์ที่ต้องการแก้ไข');

    equipments[idx].name = name.trim();
    equipments[idx].icon = icon || equipments[idx].icon;
    equipments[idx].totalQuantity = parseInt(totalQuantity, 10) || equipments[idx].totalQuantity;

    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.saveEquipment(equipments[idx]).catch(console.warn);
    }

    localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(equipments));
    this.notifyChange();
    return equipments[idx];
  }

  async deleteEquipment(id) {
    const loans = this.getLoans();
    const isBorrowed = loans.some(l => l.equipmentId === id && !l.returned);
    if (isBorrowed) {
      throw new Error('ไม่สามารถลบอุปกรณ์นี้ได้ เนื่องจากมีนักเรียนกำลังยืมอยู่');
    }

    let equipments = this.getEquipments();
    equipments = equipments.filter(e => e.id !== id);

    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.deleteEquipment(id).catch(console.warn);
    }

    localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(equipments));
    this.notifyChange();
    return true;
  }

  // ==========================================================================
  // การตั้งค่าระบบและ Dashboard Metrics
  // ==========================================================================

  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)) || this.getDefaultSettings();
    } catch (e) {
      return this.getDefaultSettings();
    }
  }

  getReturnStationCode() {
    const settings = this.getSettings();
    return settings.returnStationCode || 'SP-8899';
  }

  async changeAdminCredentials({ oldPassword, newUsername, newPassword, schoolName, schoolSubtitle, teacherName, returnStationCode }) {
    const settings = this.getSettings();

    if (oldPassword !== settings.adminPassword) {
      throw new Error('รหัสผ่านเดิมของคุณครูไม่ถูกต้อง');
    }

    if (schoolName) settings.schoolName = schoolName.trim();
    if (schoolSubtitle !== undefined) settings.schoolSubtitle = schoolSubtitle.trim();
    if (teacherName) settings.teacherName = teacherName.trim();
    if (newUsername) settings.adminUsername = newUsername.trim();
    if (newPassword) settings.adminPassword = newPassword.trim();
    if (returnStationCode) settings.returnStationCode = returnStationCode.trim();

    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.saveSettings(settings).catch(console.warn);
    }

    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));

    const auth = this.getAuth();
    if (auth) {
      auth.name = settings.teacherName;
      auth.username = settings.adminUsername;
      localStorage.setItem(this.KEYS.AUTH, JSON.stringify(auth));
    }

    this.notifyChange();
    return settings;
  }

  getDashboardMetrics() {
    const equipments = this.getEquipments();
    const loans = this.getLoans();

    const totalItems = equipments.reduce((sum, e) => sum + e.totalQuantity, 0);
    const currentlyBorrowedCount = loans
      .filter(l => !l.returned)
      .reduce((sum, l) => sum + (parseInt(l.quantity, 10) || 0), 0);

    const overdueLoansCount = loans.filter(l => this.isOverdue(l.dueDate, l.returned)).length;

    return {
      totalEquipmentTypes: equipments.length,
      totalItems,
      currentlyBorrowedCount,
      overdueLoansCount
    };
  }

  clearReturnedLoans() {
    const loans = this.getLoans();
    const remainingLoans = loans.filter(l => !l.returned);
    const removedCount = loans.length - remainingLoans.length;

    localStorage.setItem(this.KEYS.LOANS, JSON.stringify(remainingLoans));
    this.notifyChange();
    return removedCount;
  }

  // ==========================================================================
  // ส่งออก CSV / สำรองข้อมูล JSON / รีเซ็ตระบบ
  // ==========================================================================

  exportLoansCSV() {
    const loans = this.getLoans();
    if (loans.length === 0) {
      throw new Error('ไม่มีข้อมูลประวัติการยืม-คืน สำหรับการส่งออก');
    }

    const headers = [
      'ลำดับ',
      'รหัสนักเรียน',
      'ชั้นเรียน/ห้อง',
      'อุปกรณ์กีฬา',
      'จำนวน',
      'วันที่ยืม',
      'กำหนดคืน',
      'สถานะ',
      'วันที่คืนจริง',
      'รหัสจุดคืน'
    ];

    const rows = loans.map((l, index) => {
      let statusText = 'กำลังยืม';
      if (l.returned) {
        statusText = 'คืนแล้ว';
      } else if (this.isOverdue(l.dueDate, l.returned)) {
        statusText = 'เกินกำหนดคืน';
      }

      return [
        index + 1,
        `"${l.studentId || ''}"`,
        `"${l.borrowerClass || ''}"`,
        `"${l.equipmentName || ''}"`,
        l.quantity,
        `"${l.borrowDate || ''}"`,
        `"${l.dueDate || ''}"`,
        `"${statusText}"`,
        `"${l.returnDate || '-'}"`,
        `"${l.stationCode || '-'}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `รายงานประวัติการยืมคืน_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  exportBackupJSON() {
    const data = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      equipments: this.getEquipments(),
      loans: this.getLoans(),
      students: this.getStudents(),
      settings: this.getSettings()
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `สำรองฐานข้อมูล_${todayStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  importBackupJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.equipments || !data.loans) {
        throw new Error('โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง');
      }

      localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(data.equipments));
      localStorage.setItem(this.KEYS.LOANS, JSON.stringify(data.loans));
      if (data.students) {
        localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(data.students));
      }
      if (data.settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(data.settings));
      }

      this.notifyChange();
      return true;
    } catch (err) {
      throw new Error(`การกู้คืนล้มเหลว: ${err.message}`);
    }
  }

  async resetAll() {
    localStorage.setItem(this.KEYS.EQUIPMENTS, JSON.stringify(this.getDefaultEquipments()));
    localStorage.setItem(this.KEYS.LOANS, JSON.stringify(this.getDefaultLoans()));
    localStorage.setItem(this.KEYS.STUDENTS, JSON.stringify(this.getDefaultStudents()));
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(this.getDefaultSettings()));

    if (this.isGoogleSheetsReady()) {
      window.googleSheetsService.resetAll().catch(console.warn);
    }

    this.notifyChange();
    return true;
  }
}

// สร้าง Global Instance
window.sportsStorage = new SportsStorage();
