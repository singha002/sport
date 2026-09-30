/**
 * ============================================================================
 * ระบบยืม-คืนอุปกรณ์กีฬาโรงเรียน (School Sports Equipment Loan System)
 * app.js - ตัวควบคุม UI, SPA Router, ระบบสมาชิกนักเรียน, และ QR Return Station
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-item');
  const viewPages = document.querySelectorAll('.view-page');
  const toastContainer = document.getElementById('toast-container');
  const dbStatusBadge = document.getElementById('db-status-badge');
  const headerUserWrap = document.getElementById('header-user-wrap');

  let html5QrScanner = null;
  let currentReturningLoanId = null;

  // --- ระบบแสดงผลข้อความแจ้งเตือน (Toast Notification) ---
  function showToast(message, type = 'success', duration = 3200) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '❌';
    if (type === 'info') icon = 'ℹ️';

    toast.innerHTML = `
      <span style="font-size: 1.25rem;">${icon}</span>
      <div style="flex: 1;">${message}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- อัปเดตสถานะฐานข้อมูล (Google Sheets vs LocalStorage) ---
  function updateDbStatusPillUI() {
    if (!dbStatusBadge) return;
    const isReady = window.sportsStorage && window.sportsStorage.isGoogleSheetsReady();
    if (isReady) {
      dbStatusBadge.className = 'db-status-pill cloud';
      dbStatusBadge.innerHTML = '🟢 Google Sheets ออนไลน์';
      dbStatusBadge.title = 'เชื่อมต่อฐานข้อมูล Google Sheets เรียบร้อยแล้ว';
    } else {
      dbStatusBadge.className = 'db-status-pill local';
      dbStatusBadge.innerHTML = '🟡 โหมดเครื่อง (LocalStorage)';
      dbStatusBadge.title = 'คลิกเพื่อตั้งค่าเชื่อมต่อ Google Sheets';
    }
  }

  dbStatusBadge?.addEventListener('click', () => {
    const teacherAuth = window.sportsStorage ? window.sportsStorage.getAuth() : null;
    if (teacherAuth) {
      if (typeof openSettingsModal === 'function') {
        openSettingsModal();
      }
    } else {
      showToast('⚙️ สามารถตั้งค่าเชื่อมต่อ Google Sheets ได้ในเมนูตั้งค่าของคุณครู', 'info');
    }
  });

  // --- อัปเดตแถบข้อมูลผู้ใช้งานด้านบน (Header User Profile Badge) ---
  function updateUserBadgeUI() {
    if (!headerUserWrap) return;

    const teacherAuth = window.sportsStorage ? window.sportsStorage.getAuth() : null;
    const studentAuth = window.sportsStorage ? window.sportsStorage.getStudentAuth() : null;

    if (teacherAuth) {
      headerUserWrap.innerHTML = `
        <div class="header-user-badge">
          <span class="badge-role">👨‍🏫 ครู</span>
          <strong title="${teacherAuth.name}">${teacherAuth.name}</strong>
          <button type="button" class="btn-header-logout" id="btn-header-logout" title="ออกจากระบบ">
            🚪 ออก
          </button>
        </div>
      `;
    } else if (studentAuth) {
      headerUserWrap.innerHTML = `
        <div class="header-user-badge">
          <span class="badge-role">🎒 นักเรียน</span>
          <strong title="รหัส ${studentAuth.studentId} (${studentAuth.studentClass})">${studentAuth.studentId} (${studentAuth.studentClass})</strong>
          <button type="button" class="btn-header-logout" id="btn-header-logout" title="ออกจากระบบ">
            🚪 ออก
          </button>
        </div>
      `;
    } else {
      headerUserWrap.innerHTML = `
        <a href="#login" class="btn btn-sm btn-outline" style="text-decoration: none; font-size: 0.85rem; padding: 0.35rem 0.75rem; white-space: nowrap;">
          🔑 เข้าสู่ระบบ
        </a>
      `;
    }

    // ผูก Event ปุ่ม Logout บน Topbar
    const btnHeaderLogout = document.getElementById('btn-header-logout');
    btnHeaderLogout?.addEventListener('click', () => {
      if (teacherAuth) {
        if (confirm('คุณต้องการออกจากระบบคุณครูหรือไม่?')) {
          window.sportsStorage.logout();
          showToast('ออกจากระบบคุณครูเรียบร้อยแล้ว', 'info');
          updateUserBadgeUI();
          if (window.location.hash === '#dashboard') {
            window.location.hash = '#borrow';
          }
        }
      } else if (studentAuth) {
        window.sportsStorage.logoutStudent();
        showToast('ออกจากระบบนักเรียนเรียบร้อยแล้ว', 'info');
        updateUserBadgeUI();
        const returnSearch = document.getElementById('return-search-input');
        if (returnSearch) returnSearch.value = '';
        renderReturnView();
      }
    });
  }

  // --- การจัดการการสลับหน้า (Router & Navigation) ---
  function navigateTo(targetHash) {
    window.location.hash = targetHash;
  }

  function handleRoute() {
    let hash = window.location.hash || '#borrow';

    // Route Guard: ตรวจสอบหน้า Dashboard ของครู
    if (hash === '#dashboard') {
      const auth = window.sportsStorage.getAuth();
      if (!auth) {
        showToast('กรุณาเข้าสู่ระบบสำหรับคุณครูก่อนเข้าสู่หน้าแดชบอร์ด', 'warning');
        window.location.hash = '#login';
        switchLoginTab('teacher');
        return;
      }
    }

    // ถ้าเข้าหน้า #login แต่คุณครูล็อกอินอยู่แล้ว ให้ไปหน้า #dashboard
    if (hash === '#login') {
      const auth = window.sportsStorage.getAuth();
      if (auth) {
        window.location.hash = '#dashboard';
        return;
      }
    }

    // ซ่อนทุกหน้า และแสดงเฉพาะหน้าที่เลือก
    viewPages.forEach(page => {
      if ('#' + page.id === hash) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });

    // อัปเดตสถานะ Active ของเมนูนำทาง
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === hash) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // เรียกฟังก์ชันเรนเดอร์ข้อมูลเฉพาะหน้า
    if (hash === '#borrow') {
      renderBorrowView();
    } else if (hash === '#return') {
      const studentAuth = window.sportsStorage.getStudentAuth();
      const returnSearch = document.getElementById('return-search-input');
      if (studentAuth && returnSearch && !returnSearch.value) {
        returnSearch.value = studentAuth.studentId;
      }
      renderReturnView();
    } else if (hash === '#dashboard') {
      renderDashboardView();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('hashchange', handleRoute);

  // ==========================================================================
  // VIEW 1: หน้ายืมอุปกรณ์ (Borrow View)
  // ==========================================================================
  const equipmentGrid = document.getElementById('equipment-grid');
  const searchEquipmentInput = document.getElementById('search-equipment-input');
  const borrowModal = document.getElementById('borrow-modal');
  const borrowForm = document.getElementById('borrow-form');

  let currentSelectedEquipment = null;

  function renderBorrowView() {
    if (!equipmentGrid) return;
    const query = (searchEquipmentInput?.value || '').trim().toLowerCase();
    const equipments = window.sportsStorage.getEquipmentsWithAvailability();

    const filtered = equipments.filter(eq => 
      eq.name.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      equipmentGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-state-icon">🔍</span>
          <p>ไม่พบอุปกรณ์กีฬาที่ตรงกับ "${query}"</p>
        </div>
      `;
      return;
    }

    equipmentGrid.innerHTML = filtered.map(eq => {
      const pct = Math.round((eq.availableQuantity / eq.totalQuantity) * 100);
      let progressClass = '';
      if (eq.availableQuantity === 0) progressClass = 'empty';
      else if (pct <= 25) progressClass = 'low';

      const isAvailable = eq.availableQuantity > 0;
      const statusBadge = isAvailable
        ? `<span class="badge badge-success">● พร้อมให้ยืม</span>`
        : `<span class="badge badge-danger">● ไม่พร้อมให้ยืม (หมด)</span>`;

      return `
        <div class="equipment-card">
          <div class="card-top">
            <div class="equipment-icon-bubble">${eq.icon}</div>
            ${statusBadge}
          </div>

          <h3>${eq.name}</h3>

          <div class="stock-indicator">
            <div class="stock-text">
              <span class="text-muted" style="font-size: 0.85rem;">คงเหลือให้ยืม:</span>
              <span>
                <strong class="stock-count-highlight">${eq.availableQuantity}</strong>
                <span class="text-muted" style="font-size: 0.85rem;">/ ${eq.totalQuantity} ชิ้น</span>
              </span>
            </div>
            <div class="stock-progress-bar">
              <div class="stock-progress-fill ${progressClass}" style="width: ${pct}%;"></div>
            </div>

            <button 
              type="button" 
              class="btn ${isAvailable ? 'btn-primary btn-borrow-trigger' : 'btn-outline disabled'} card-action" 
              data-id="${eq.id}"
              ${!isAvailable ? 'disabled' : ''}
            >
              ${isAvailable ? '⚡ ยืมอุปกรณ์นี้' : '❌ หมดชั่วคราว'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    equipmentGrid.querySelectorAll('.btn-borrow-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openBorrowModal(id);
      });
    });
  }

  searchEquipmentInput?.addEventListener('input', renderBorrowView);

  // Modal ยืมอุปกรณ์
  function openBorrowModal(equipmentId) {
    // 1. ตรวจสอบว่าเข้าสู่ระบบนักเรียนแล้วหรือไม่
    const studentAuth = window.sportsStorage.getStudentAuth();
    if (!studentAuth) {
      showToast('⚠️ กรุณาเข้าสู่ระบบนักเรียนก่อนทำการยืมอุปกรณ์กีฬา', 'warning');
      window.location.hash = '#login';
      switchLoginTab('student');
      return;
    }

    const equipments = window.sportsStorage.getEquipmentsWithAvailability();
    const target = equipments.find(e => e.id === equipmentId);

    if (!target || target.availableQuantity <= 0) {
      showToast('อุปกรณ์นี้ไม่พร้อมให้ยืมในขณะนี้', 'danger');
      return;
    }

    currentSelectedEquipment = target;

    document.getElementById('modal-equip-icon').textContent = target.icon;
    document.getElementById('modal-equip-name').textContent = target.name;
    document.getElementById('modal-equip-avail').textContent = `${target.availableQuantity} ชิ้น`;
    document.getElementById('modal-equip-id').value = target.id;

    const qtyInput = document.getElementById('borrow-quantity');
    qtyInput.value = '1';
    qtyInput.max = target.availableQuantity;
    qtyInput.min = '1';

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const dueInput = document.getElementById('borrow-due-date');
    dueInput.min = todayStr;
    dueInput.value = tomorrowStr;

    // เติมและล็อกรหัสนักเรียน/ห้องตามบัญชีที่ล็อกอินอยู่
    const studentIdInput = document.getElementById('borrow-student-id');
    const classInput = document.getElementById('borrow-class');

    studentIdInput.value = studentAuth.studentId;
    studentIdInput.readOnly = true;
    studentIdInput.style.backgroundColor = '#f3f4f6';

    classInput.value = studentAuth.studentClass;
    classInput.readOnly = true;
    classInput.style.backgroundColor = '#f3f4f6';

    qtyInput.focus();

    borrowModal.classList.add('show');
  }

  function closeBorrowModal() {
    borrowModal.classList.remove('show');
    currentSelectedEquipment = null;
  }

  document.querySelectorAll('[data-close-modal="borrow"]').forEach(btn => {
    btn.addEventListener('click', closeBorrowModal);
  });

  borrowForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentAuth = window.sportsStorage.getStudentAuth();
    if (!studentAuth) {
      showToast('⚠️ กรุณาเข้าสู่ระบบนักเรียนก่อนทำการยืมอุปกรณ์กีฬา', 'warning');
      closeBorrowModal();
      window.location.hash = '#login';
      switchLoginTab('student');
      return;
    }

    const equipmentId = document.getElementById('modal-equip-id').value;
    const studentId = studentAuth.studentId;
    const borrowerClass = studentAuth.studentClass;
    const quantity = parseInt(document.getElementById('borrow-quantity').value, 10);
    const dueDate = document.getElementById('borrow-due-date').value;

    if (isNaN(quantity) || quantity < 1) {
      showToast('จำนวนที่ยืมต้องอย่างน้อย 1 ชิ้น', 'warning');
      return;
    }
    if (currentSelectedEquipment && quantity > currentSelectedEquipment.availableQuantity) {
      showToast(`ยืมได้ไม่เกิน ${currentSelectedEquipment.availableQuantity} ชิ้น`, 'danger');
      return;
    }
    if (!dueDate) {
      showToast('กรุณาระบุวันที่ต้องคืน', 'warning');
      return;
    }

    try {
      await window.sportsStorage.borrowEquipment({
        equipmentId,
        studentId,
        borrowerClass,
        quantity,
        dueDate
      });

      closeBorrowModal();
      renderBorrowView();
      showToast(`🎉 ยืม ${currentSelectedEquipment.name} (${quantity} ชิ้น) สำเร็จเรียบร้อย!`);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // ==========================================================================
  // VIEW 2: หน้าคืนอุปกรณ์ (Self-Service Return Station View)
  // ==========================================================================
  const returnSearchInput = document.getElementById('return-search-input');
  const returnSearchResults = document.getElementById('return-search-results');
  const returnVerifyModal = document.getElementById('return-verify-modal');
  const btnVerifyTabScan = document.getElementById('btn-verify-tab-scan');
  const btnVerifyTabPin = document.getElementById('btn-verify-tab-pin');
  const verifyScanView = document.getElementById('verify-scan-view');
  const verifyPinView = document.getElementById('verify-pin-view');
  const verifyPinForm = document.getElementById('verify-pin-form');
  const manualStationCodeInput = document.getElementById('manual-station-code');

  function renderReturnView() {
    if (!returnSearchResults) return;
    const query = (returnSearchInput?.value || '').trim().toLowerCase();
    const loans = window.sportsStorage.getLoans();

    let activeLoans = loans.filter(l => !l.returned);

    if (query) {
      activeLoans = activeLoans.filter(l => 
        (l.studentId && l.studentId.toLowerCase().includes(query)) ||
        (l.borrowerClass && l.borrowerClass.toLowerCase().includes(query)) ||
        (l.equipmentName && l.equipmentName.toLowerCase().includes(query))
      );
    }

    if (activeLoans.length === 0) {
      if (query) {
        returnSearchResults.innerHTML = `
          <div class="empty-state">
            <span class="empty-state-icon">🔎</span>
            <h4>ไม่พบรายการยืมที่ยังไม่ได้คืน</h4>
            <p>ไม่พบรายการที่ตรงกับ "${query}" กรุณาตรวจสอบรหัสนักเรียนหรือห้องเรียนอีกครั้ง</p>
          </div>
        `;
      } else {
        returnSearchResults.innerHTML = `
          <div class="empty-state">
            <span class="empty-state-icon">📋</span>
            <h4>พิมพ์รหัสนักเรียนหรือชั้นเรียนในช่องค้นหาด้านบน</h4>
            <p>เพื่อค้นหารายการอุปกรณ์ของคุณ แล้วกดปุ่ม "คืนอุปกรณ์" เพื่อสแกน QR หน้าตู้</p>
          </div>
        `;
      }
      return;
    }

    returnSearchResults.innerHTML = `
      <div style="margin-bottom: 1rem; font-weight: 500; color: var(--text-muted);">
        พบรายการที่กำลังยืมอยู่ (${activeLoans.length} รายการ):
      </div>
      ${activeLoans.map(loan => {
        const isOverdue = window.sportsStorage.isOverdue(loan.dueDate, loan.returned);
        const statusBadge = isOverdue
          ? `<span class="badge badge-danger">⚠️ เกินกำหนดคืน (${loan.dueDate})</span>`
          : `<span class="badge badge-info">⏳ กำลังยืม (คืนภายใน ${loan.dueDate})</span>`;

        return `
          <div class="loan-card-item ${isOverdue ? 'is-overdue' : ''}">
            <div class="loan-info-left">
              <div class="loan-icon-box">${loan.equipmentIcon}</div>
              <div class="loan-details">
                <h4>${loan.equipmentName} <span style="font-size: 0.9rem; color: var(--primary);">x${loan.quantity} ชิ้น</span></h4>
                <div class="loan-meta">
                  <span>🆔 รหัส: <strong>${loan.studentId}</strong> (${loan.borrowerClass})</span>
                  <span>📅 ยืมเมื่อ: ${loan.borrowDate}</span>
                </div>
                <div style="margin-top: 0.4rem;">
                  ${statusBadge}
                </div>
              </div>
            </div>

            <div>
              <button type="button" class="btn btn-primary btn-return-trigger" data-loan-id="${loan.id}">
                🔄 คืนอุปกรณ์ (สแกน QR)
              </button>
            </div>
          </div>
        `;
      }).join('')}
    `;

    returnSearchResults.querySelectorAll('.btn-return-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const loanId = btn.getAttribute('data-loan-id');
        openReturnVerifyModal(loanId);
      });
    });
  }

  returnSearchInput?.addEventListener('input', renderReturnView);

  // --- Modal ตรวจสอบจุดคืน (QR Scanner & Station PIN) ---
  function openReturnVerifyModal(loanId) {
    const loans = window.sportsStorage.getLoans();
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    currentReturningLoanId = loanId;

    document.getElementById('verify-loan-icon').textContent = loan.equipmentIcon;
    document.getElementById('verify-loan-name').textContent = loan.equipmentName;
    document.getElementById('verify-loan-borrower').textContent = `${loan.studentId} (${loan.borrowerClass})`;
    document.getElementById('verify-loan-qty').textContent = loan.quantity;
    if (manualStationCodeInput) manualStationCodeInput.value = '';

    returnVerifyModal.classList.add('show');
    switchVerifyTab('scan');
  }

  let isScanningActive = false;

  function closeReturnVerifyModal() {
    try {
      stopQrScanner();
    } catch (e) {
      console.warn('Stop scanner exception on modal close:', e);
    }
    if (returnVerifyModal) {
      returnVerifyModal.classList.remove('show');
    }
    currentReturningLoanId = null;
  }

  document.querySelectorAll('[data-close-modal="return-verify"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeReturnVerifyModal();
    });
  });

  function switchVerifyTab(mode) {
    if (mode === 'scan') {
      btnVerifyTabScan?.classList.add('active');
      btnVerifyTabPin?.classList.remove('active');
      if (verifyScanView) verifyScanView.style.display = 'block';
      if (verifyPinView) verifyPinView.style.display = 'none';
      startQrScanner();
    } else {
      btnVerifyTabPin?.classList.add('active');
      btnVerifyTabScan?.classList.remove('active');
      if (verifyPinView) verifyPinView.style.display = 'block';
      if (verifyScanView) verifyScanView.style.display = 'none';
      stopQrScanner();
      manualStationCodeInput?.focus();
    }
  }

  btnVerifyTabScan?.addEventListener('click', () => switchVerifyTab('scan'));
  btnVerifyTabPin?.addEventListener('click', () => switchVerifyTab('pin'));

  // เริ่มกล้องสแกน QR Code
  function startQrScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      const qrReader = document.getElementById('qr-reader');
      if (qrReader) {
        qrReader.innerHTML = `
          <div style="color: white; padding: 1rem; text-align: center;">
            <p>📷 กำลังโหลดระบบกล้องสแกน QR Code...</p>
            <button type="button" class="btn btn-sm btn-outline" id="btn-fallback-to-pin-1" style="margin-top: 0.5rem; color: white;">
              ⌨️ ใช้การกรอกรหัสตู้แทน
            </button>
          </div>
        `;
        document.getElementById('btn-fallback-to-pin-1')?.addEventListener('click', () => switchVerifyTab('pin'));
      }
      return;
    }

    try {
      if (!html5QrScanner) {
        html5QrScanner = new Html5Qrcode('qr-reader');
      }

      if (isScanningActive) return;

      html5QrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleScannedStationCode(decodedText);
        },
        (errorMessage) => {
          // ignore scan frame errors
        }
      ).then(() => {
        isScanningActive = true;
      }).catch(err => {
        console.warn('Camera start error:', err);
        isScanningActive = false;
        const qrReader = document.getElementById('qr-reader');
        if (qrReader) {
          qrReader.innerHTML = `
            <div style="color: white; padding: 1rem; text-align: center;">
              <p>⚠️ ไม่สามารถเปิดกล้องได้ (หรือปฏิเสธสิทธิ์กล้อง)</p>
              <button type="button" class="btn btn-sm btn-primary" id="btn-fallback-to-pin-2" style="margin-top: 0.5rem;">
                ⌨️ กรอกรหัสประจำตู้แทน
              </button>
            </div>
          `;
          document.getElementById('btn-fallback-to-pin-2')?.addEventListener('click', () => switchVerifyTab('pin'));
        }
      });
    } catch (e) {
      console.error('QR Scanner init error:', e);
      isScanningActive = false;
    }
  }

  function stopQrScanner() {
    if (html5QrScanner) {
      try {
        if (isScanningActive) {
          isScanningActive = false;
          html5QrScanner.stop().then(() => {
            html5QrScanner.clear();
          }).catch(err => {
            console.warn('QR Scanner stop error:', err);
          });
        }
      } catch (err) {
        console.warn('QR Scanner stop sync error:', err);
      }
    }
  }

  // ประมวลผลรหัสจุดคืน
  async function handleScannedStationCode(code) {
    if (!currentReturningLoanId) return;
    const cleanCode = (code || '').trim();

    try {
      await window.sportsStorage.returnLoanWithVerification(currentReturningLoanId, cleanCode);
      stopQrScanner();
      closeReturnVerifyModal();
      showToast(`🎉 ยืนยันการคืนอุปกรณ์ ณ จุดคืน (${cleanCode}) เรียบร้อยแล้ว! ข้อมูลอัปเดตลง Google Sheets ทันที`);
      renderReturnView();
      renderBorrowView();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // ฟอร์มกรอกรหัสตู้แบบ Manual PIN
  verifyPinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = manualStationCodeInput?.value.trim();
    if (!code) {
      showToast('กรุณากรอกรหัสประจำตู้', 'warning');
      return;
    }
    await handleScannedStationCode(code);
  });

  // --- อัปเดตข้อมูลอัตลักษณ์โรงเรียน (Dynamic School Branding) ---
  function updateBrandingUI() {
    const settings = window.sportsStorage.getSettings();
    const brandTitle = document.getElementById('brand-title');
    const brandSubtitle = document.getElementById('brand-subtitle');
    const heroSubtitle = document.getElementById('hero-subtitle');
    const footerBrand = document.getElementById('footer-school-brand');
    const posterSchoolName = document.getElementById('poster-school-name');
    const posterStationCode = document.getElementById('poster-station-code');
    const posterQrImage = document.getElementById('poster-qr-image');

    if (brandTitle) brandTitle.textContent = 'ระบบยืม-คืนอุปกรณ์กีฬา';
    if (brandSubtitle) brandSubtitle.textContent = `${settings.schoolName} • ${settings.schoolSubtitle || 'ฝ่ายกีฬาและสุขภาพ'}`;
    if (heroSubtitle) heroSubtitle.textContent = `นักเรียน${settings.schoolName} สามารถเลือกยืมลูกฟุตบอล บาสเกตบอล แบดมินตัน และอุปกรณ์อื่นๆ ได้สะดวกรวดเร็ว ยืมเสร็จแล้วอย่านำมาส่งคืนที่จุดคืนนะครับ`;
    if (footerBrand) footerBrand.textContent = `ระบบยืม-คืนอุปกรณ์กีฬา • ${settings.schoolName}`;

    if (posterSchoolName) posterSchoolName.textContent = settings.schoolName;
    const stationCode = settings.returnStationCode || 'SP-8899';
    if (posterStationCode) posterStationCode.textContent = stationCode;
    if (posterQrImage) {
      posterQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(stationCode)}`;
    }
  }

  // ==========================================================================
  // VIEW 3: หน้า Login & Register (นักเรียน & คุณครู)
  // ==========================================================================
  const tabBtnStudent = document.getElementById('tab-btn-student');
  const tabBtnTeacher = document.getElementById('tab-btn-teacher');
  const studentAuthSection = document.getElementById('student-auth-section');
  const teacherLoginForm = document.getElementById('login-form');

  const btnSubLogin = document.getElementById('btn-sub-login');
  const btnSubRegister = document.getElementById('btn-sub-register');
  const studentLoginForm = document.getElementById('student-login-form');
  const studentRegisterForm = document.getElementById('student-register-form');

  const btnToggleStudentPassword = document.getElementById('btn-toggle-student-password');
  const btnTogglePassword = document.getElementById('btn-toggle-password');

  // สลับแท็บนักเรียน / ครู
  function switchLoginTab(role) {
    if (role === 'teacher') {
      tabBtnTeacher?.classList.add('active');
      tabBtnStudent?.classList.remove('active');
      if (teacherLoginForm) teacherLoginForm.style.display = 'block';
      if (studentAuthSection) studentAuthSection.style.display = 'none';
      document.getElementById('login-username')?.focus();
    } else {
      tabBtnStudent?.classList.add('active');
      tabBtnTeacher?.classList.remove('active');
      if (studentAuthSection) studentAuthSection.style.display = 'block';
      if (teacherLoginForm) teacherLoginForm.style.display = 'none';
      document.getElementById('student-login-id')?.focus();
    }
  }

  tabBtnStudent?.addEventListener('click', () => switchLoginTab('student'));
  tabBtnTeacher?.addEventListener('click', () => switchLoginTab('teacher'));

  // สลับแท็บ เข้าสู่ระบบ / สมัครสมาชิก สำหรับนักเรียน
  function switchStudentSubAuth(mode) {
    if (mode === 'register') {
      btnSubRegister?.classList.add('active');
      btnSubLogin?.classList.remove('active');
      if (studentRegisterForm) studentRegisterForm.style.display = 'block';
      if (studentLoginForm) studentLoginForm.style.display = 'none';
      document.getElementById('register-student-id')?.focus();
    } else {
      btnSubLogin?.classList.add('active');
      btnSubRegister?.classList.remove('active');
      if (studentLoginForm) studentLoginForm.style.display = 'block';
      if (studentRegisterForm) studentRegisterForm.style.display = 'none';
      document.getElementById('student-login-id')?.focus();
    }
  }

  btnSubLogin?.addEventListener('click', () => switchStudentSubAuth('login'));
  btnSubRegister?.addEventListener('click', () => switchStudentSubAuth('register'));

  // แสดง/ซ่อนรหัสผ่าน
  btnToggleStudentPassword?.addEventListener('click', () => {
    const input = document.getElementById('student-login-password');
    if (input.type === 'password') {
      input.type = 'text';
      btnToggleStudentPassword.textContent = '🙈';
    } else {
      input.type = 'password';
      btnToggleStudentPassword.textContent = '👁️';
    }
  });

  btnTogglePassword?.addEventListener('click', () => {
    const passwordInput = document.getElementById('login-password');
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      btnTogglePassword.textContent = '🙈';
    } else {
      passwordInput.type = 'password';
      btnTogglePassword.textContent = '👁️';
    }
  });

  // 1. ฟอร์มสมัครสมาชิกนักเรียน (Student Register)
  studentRegisterForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('register-student-id').value.trim();
    const studentClass = document.getElementById('register-student-class').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value.trim();

    if (!studentId || !studentClass || !password) {
      showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      showToast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน', 'warning');
      document.getElementById('register-confirm-password').focus();
      return;
    }

    try {
      await window.sportsStorage.registerStudent(studentId, studentClass, password);
      updateUserBadgeUI();
      showToast(`🎉 สมัครสมาชิกและเข้าสู่ระบบสำเร็จ! รหัส: ${studentId} (${studentClass})`);
      studentRegisterForm.reset();
      window.location.hash = '#borrow';
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // 2. ฟอร์มล็อกอินนักเรียน (Student Login)
  studentLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('student-login-id').value.trim();
    const password = document.getElementById('student-login-password').value.trim();

    if (!studentId || !password) {
      showToast('กรุณากรอกรหัสนักเรียนและรหัสผ่าน', 'warning');
      return;
    }

    try {
      const session = await window.sportsStorage.loginStudent(studentId, password);
      updateUserBadgeUI();
      showToast(`🎒 ยินดีต้อนรับนักเรียนรหัส ${session.studentId} (${session.studentClass})`);
      studentLoginForm.reset();
      window.location.hash = '#borrow';
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // 3. ฟอร์มล็อกอินคุณครู (Teacher Login)
  teacherLoginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value.trim();

    try {
      const session = window.sportsStorage.login(u, p);
      updateUserBadgeUI();
      showToast(`👋 ยินดีต้อนรับ ${session.name} เข้าสู่ระบบ`);
      teacherLoginForm.reset();
      window.location.hash = '#dashboard';
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // ==========================================================================
  // VIEW 4: หน้า Dashboard ครู (Admin Dashboard View)
  // ==========================================================================
  const btnLogout = document.getElementById('btn-logout');
  const btnResetDemo = document.getElementById('btn-reset-demo');
  const dashboardSearch = document.getElementById('dashboard-table-search');
  const dashboardFilterStatus = document.getElementById('dashboard-filter-status');
  const dashboardTableBody = document.getElementById('dashboard-table-body');
  const adminEquipmentContainer = document.getElementById('admin-equipment-container');

  // Modal จัดการอุปกรณ์
  const equipmentModal = document.getElementById('equipment-modal');
  const equipmentForm = document.getElementById('equipment-form');
  const btnAddEquipment = document.getElementById('btn-add-equipment');
  const emojiQuickList = document.querySelectorAll('.emoji-btn');
  const customIconInput = document.getElementById('equipment-icon-input');

  let editingEquipmentId = null;

  function renderDashboardView() {
    const auth = window.sportsStorage.getAuth();
    if (!auth) {
      window.location.hash = '#login';
      return;
    }

    const teacherNameEl = document.getElementById('dashboard-teacher-name');
    if (teacherNameEl) teacherNameEl.textContent = auth.name;

    const metrics = window.sportsStorage.getDashboardMetrics();
    document.getElementById('metric-total-items').textContent = metrics.totalItems;
    document.getElementById('metric-currently-borrowed').textContent = metrics.currentlyBorrowedCount;
    document.getElementById('metric-overdue').textContent = metrics.overdueLoansCount;

    renderDashboardTable();
    renderAdminEquipmentList();
  }

  function renderDashboardTable() {
    if (!dashboardTableBody) return;
    const loans = window.sportsStorage.getLoans();
    const query = (dashboardSearch?.value || '').trim().toLowerCase();
    const statusFilter = dashboardFilterStatus?.value || 'all';

    let filtered = loans.filter(l => {
      const matchQuery = 
        (l.studentId && l.studentId.toLowerCase().includes(query)) ||
        (l.borrowerClass && l.borrowerClass.toLowerCase().includes(query)) ||
        (l.equipmentName && l.equipmentName.toLowerCase().includes(query));

      if (!matchQuery) return false;

      const isOverdue = window.sportsStorage.isOverdue(l.dueDate, l.returned);
      if (statusFilter === 'borrowed') {
        return !l.returned && !isOverdue;
      } else if (statusFilter === 'overdue') {
        return !l.returned && isOverdue;
      } else if (statusFilter === 'returned') {
        return l.returned;
      }
      return true;
    });

    if (filtered.length === 0) {
      dashboardTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 2.5rem; color: var(--text-muted); text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📂</div>
            ไม่พบประวัติการยืม-คืนตามเงื่อนไขที่เลือก
          </td>
        </tr>
      `;
      return;
    }

    dashboardTableBody.innerHTML = filtered.map((loan, idx) => {
      const isOverdue = window.sportsStorage.isOverdue(loan.dueDate, loan.returned);

      let statusHtml = '';
      let rowClass = '';

      if (loan.returned) {
        statusHtml = `<span class="badge badge-success">✓ คืนแล้ว (${loan.returnDate || '-'}) [${loan.stationCode || 'จุดคืน'}]</span>`;
      } else if (isOverdue) {
        statusHtml = `<span class="badge badge-danger">⚠️ เกินกำหนดคืน</span>`;
        rowClass = 'overdue-row';
      } else {
        statusHtml = `<span class="badge badge-info">⏳ กำลังยืม</span>`;
      }

      const returnActionBtn = !loan.returned
        ? `<button type="button" class="btn btn-sm btn-outline btn-return-sub" data-loan-id="${loan.id}" title="กดรับคืนแทนนักเรียน">
             🔄 คืนแทน
           </button>`
        : `<span class="text-muted" style="font-size: 0.8rem;">-</span>`;

      return `
        <tr class="${rowClass}">
          <td style="font-weight: 500; color: var(--text-muted);">${idx + 1}</td>
          <td><strong>${loan.studentId}</strong></td>
          <td><span class="badge badge-muted">${loan.borrowerClass}</span></td>
          <td>${loan.equipmentIcon} ${loan.equipmentName}</td>
          <td><strong>${loan.quantity}</strong> ชิ้น</td>
          <td>${loan.borrowDate}</td>
          <td style="${isOverdue ? 'font-weight: 700; color: var(--status-overdue);' : ''}">${loan.dueDate}</td>
          <td>${statusHtml}</td>
          <td>${returnActionBtn}</td>
        </tr>
      `;
    }).join('');

    dashboardTableBody.querySelectorAll('.btn-return-sub').forEach(btn => {
      btn.addEventListener('click', async () => {
        const loanId = btn.getAttribute('data-loan-id');
        if (confirm('ยืนยันการรับคืนอุปกรณ์รายการนี้แทนนักเรียนใช่หรือไม่?')) {
          try {
            await window.sportsStorage.returnLoan(loanId);
            showToast('✅ รับคืนอุปกรณ์เรียบร้อยแล้ว');
            renderDashboardView();
          } catch (err) {
            showToast(err.message, 'danger');
          }
        }
      });
    });
  }

  dashboardSearch?.addEventListener('input', renderDashboardTable);
  dashboardFilterStatus?.addEventListener('change', renderDashboardTable);

  // การจัดการชนิดอุปกรณ์ (Equipment CRUD)
  function renderAdminEquipmentList() {
    if (!adminEquipmentContainer) return;
    const equipments = window.sportsStorage.getEquipmentsWithAvailability();

    adminEquipmentContainer.innerHTML = equipments.map(eq => {
      return `
        <div class="admin-equipment-item">
          <div class="admin-equip-left">
            <span class="icon">${eq.icon}</span>
            <div>
              <h5>${eq.name}</h5>
              <p>ทั้งหมด: <strong>${eq.totalQuantity}</strong> | ว่าง: <strong>${eq.availableQuantity}</strong> | ถูกยืม: <strong>${eq.borrowedCount}</strong></p>
            </div>
          </div>
          <div class="admin-equip-actions">
            <button type="button" class="btn btn-sm btn-outline btn-edit-equip" data-id="${eq.id}">✏️ แก้ไข</button>
            <button type="button" class="btn btn-sm btn-outline btn-danger btn-delete-equip" data-id="${eq.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    adminEquipmentContainer.querySelectorAll('.btn-edit-equip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditEquipmentModal(id);
      });
    });

    adminEquipmentContainer.querySelectorAll('.btn-delete-equip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        confirmDeleteEquipment(id);
      });
    });
  }

  emojiQuickList.forEach(btn => {
    btn.addEventListener('click', () => {
      emojiQuickList.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      customIconInput.value = btn.getAttribute('data-emoji');
    });
  });

  btnAddEquipment?.addEventListener('click', () => {
    editingEquipmentId = null;
    document.getElementById('equipment-modal-title').textContent = '➕ เพิ่มอุปกรณ์กีฬาใหม่';
    document.getElementById('equipment-name-input').value = '';
    document.getElementById('equipment-total-input').value = '10';
    customIconInput.value = '⚽';
    
    emojiQuickList.forEach(b => b.classList.remove('selected'));
    const firstEmoji = document.querySelector('.emoji-btn[data-emoji="⚽"]');
    if (firstEmoji) firstEmoji.classList.add('selected');

    equipmentModal.classList.add('show');
    document.getElementById('equipment-name-input').focus();
  });

  function openEditEquipmentModal(id) {
    const equipments = window.sportsStorage.getEquipments();
    const target = equipments.find(e => e.id === id);
    if (!target) return;

    editingEquipmentId = id;
    document.getElementById('equipment-modal-title').textContent = `✏️ แก้ไขอุปกรณ์: ${target.name}`;
    document.getElementById('equipment-name-input').value = target.name;
    document.getElementById('equipment-total-input').value = target.totalQuantity;
    customIconInput.value = target.icon;

    emojiQuickList.forEach(b => {
      if (b.getAttribute('data-emoji') === target.icon) {
        b.classList.add('selected');
      } else {
        b.classList.remove('selected');
      }
    });

    equipmentModal.classList.add('show');
  }

  function closeEquipmentModal() {
    equipmentModal.classList.remove('show');
    editingEquipmentId = null;
  }

  document.querySelectorAll('[data-close-modal="equipment"]').forEach(btn => {
    btn.addEventListener('click', closeEquipmentModal);
  });

  equipmentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('equipment-name-input').value.trim();
    const totalQuantity = parseInt(document.getElementById('equipment-total-input').value, 10);
    const icon = customIconInput.value.trim() || '⚽';

    if (!name) {
      showToast('กรุณาระบุชื่ออุปกรณ์', 'warning');
      return;
    }
    if (isNaN(totalQuantity) || totalQuantity < 1) {
      showToast('จำนวนต้องมากกว่า 0', 'warning');
      return;
    }

    try {
      if (editingEquipmentId) {
        await window.sportsStorage.updateEquipment(editingEquipmentId, { name, icon, totalQuantity });
        showToast(`✏️ แก้ไขอุปกรณ์ "${name}" สำเร็จ`);
      } else {
        await window.sportsStorage.addEquipment({ name, icon, totalQuantity });
        showToast(`➕ เพิ่มอุปกรณ์ "${name}" สำเร็จเรียบร้อย`);
      }
      closeEquipmentModal();
      renderDashboardView();
      renderBorrowView();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  async function confirmDeleteEquipment(id) {
    const equipments = window.sportsStorage.getEquipmentsWithAvailability();
    const target = equipments.find(e => e.id === id);
    if (!target) return;

    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${target.icon} ${target.name}" ออกจากระบบ?`)) {
      try {
        await window.sportsStorage.deleteEquipment(id);
        showToast(`🗑️ ลบอุปกรณ์ "${target.name}" เรียบร้อยแล้ว`);
        renderDashboardView();
        renderBorrowView();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    }
  }

  // --- Modal ป้าย QR Code จุดคืนอุปกรณ์ (Station Poster Modal) ---
  const stationPosterModal = document.getElementById('station-poster-modal');
  const btnOpenStationPoster = document.getElementById('btn-open-station-poster');
  const btnDoPrintPoster = document.getElementById('btn-do-print-poster');

  btnOpenStationPoster?.addEventListener('click', () => {
    updateBrandingUI();
    stationPosterModal.classList.add('show');
  });

  document.querySelectorAll('[data-close-modal="station-poster"]').forEach(btn => {
    btn.addEventListener('click', () => {
      stationPosterModal.classList.remove('show');
    });
  });

  btnDoPrintPoster?.addEventListener('click', () => {
    window.print();
  });

  // --- Modal การตั้งค่าระบบ (Settings Modal) ---
  const settingsModal = document.getElementById('settings-modal');
  const settingsForm = document.getElementById('settings-form');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnTestSheetsConn = document.getElementById('btn-test-sheets-conn');
  const btnPushAllSheets = document.getElementById('btn-push-all-sheets');
  const btnPullAllSheets = document.getElementById('btn-pull-all-sheets');
  const sheetsConnFeedback = document.getElementById('sheets-conn-feedback');
  const settingsSheetsBadge = document.getElementById('settings-sheets-status-badge');

  async function updateSettingsModalSheetsStatus() {
    if (!settingsSheetsBadge) return;
    const url = document.getElementById('setting-sheets-url')?.value.trim() || '';
    if (!url) {
      settingsSheetsBadge.innerHTML = '⚪ ยังไม่ได้เชื่อมต่อ';
      settingsSheetsBadge.style.color = 'var(--text-muted)';
      settingsSheetsBadge.style.borderColor = 'var(--border-color)';
      return;
    }

    if (window.googleSheetsService && window.googleSheetsService.isOnline) {
      settingsSheetsBadge.innerHTML = '🟢 ออนไลน์ พร้อมใช้งาน';
      settingsSheetsBadge.style.color = '#15803d';
      settingsSheetsBadge.style.borderColor = '#86efac';
    } else {
      settingsSheetsBadge.innerHTML = '🟡 มี URL รอการทดสอบ';
      settingsSheetsBadge.style.color = '#b45309';
      settingsSheetsBadge.style.borderColor = '#fde68a';
    }
  }

  function openSettingsModal() {
    const settings = window.sportsStorage.getSettings();
    document.getElementById('setting-school-name').value = settings.schoolName;
    document.getElementById('setting-school-sub').value = settings.schoolSubtitle || '';
    document.getElementById('setting-teacher-name').value = settings.teacherName;
    document.getElementById('setting-station-code').value = settings.returnStationCode || 'SP-8899';
    document.getElementById('setting-admin-username').value = settings.adminUsername;
    document.getElementById('setting-old-password').value = '';
    document.getElementById('setting-new-password').value = '';

    const sheetsUrlInput = document.getElementById('setting-sheets-url');
    if (sheetsUrlInput && window.googleSheetsService) {
      sheetsUrlInput.value = window.googleSheetsService.getApiUrl() || '';
    }

    if (sheetsConnFeedback) {
      sheetsConnFeedback.style.display = 'none';
      sheetsConnFeedback.innerHTML = '';
    }

    updateSettingsModalSheetsStatus();
    settingsModal.classList.add('show');
    document.getElementById('setting-school-name').focus();
  }

  function closeSettingsModal() {
    settingsModal.classList.remove('show');
  }

  btnOpenSettings?.addEventListener('click', openSettingsModal);
  document.querySelectorAll('[data-close-modal="settings"]').forEach(btn => {
    btn.addEventListener('click', closeSettingsModal);
  });

  // ปุ่มทดสอบการเชื่อมต่อ Google Sheets
  btnTestSheetsConn?.addEventListener('click', async () => {
    const urlInput = document.getElementById('setting-sheets-url');
    const url = urlInput ? urlInput.value.trim() : '';

    if (!url) {
      showToast('กรุณากรอก Web App URL ก่อนทดสอบ', 'warning');
      return;
    }

    btnTestSheetsConn.disabled = true;
    btnTestSheetsConn.innerHTML = '⏳ กำลังทดสอบ...';
    if (sheetsConnFeedback) {
      sheetsConnFeedback.style.display = 'block';
      sheetsConnFeedback.style.background = 'var(--bg-main)';
      sheetsConnFeedback.style.color = 'var(--text-main)';
      sheetsConnFeedback.innerHTML = '🔄 กำลังส่งคำขอ ping ไปยัง Google Apps Script...';
    }

    try {
      const result = await window.googleSheetsService.testConnection(url);
      if (result.ok) {
        sheetsConnFeedback.style.background = '#dcfce7';
        sheetsConnFeedback.style.color = '#15803d';
        sheetsConnFeedback.innerHTML = `✅ <strong>เชื่อมต่อสำเร็จ!</strong> ${result.message}`;
        settingsSheetsBadge.innerHTML = '🟢 ออนไลน์ พร้อมใช้งาน';
        settingsSheetsBadge.style.color = '#15803d';
        settingsSheetsBadge.style.borderColor = '#86efac';
        updateDbStatusPillUI();
        showToast('🟢 เชื่อมต่อ Google Sheets สำเร็จเรียบร้อย!');
      } else {
        sheetsConnFeedback.style.background = '#fee2e2';
        sheetsConnFeedback.style.color = '#b91c1c';
        sheetsConnFeedback.innerHTML = `❌ <strong>เชื่อมต่อไม่สำเร็จ:</strong> ${result.message}`;
        settingsSheetsBadge.innerHTML = '🔴 เชื่อมต่อไม่สำเร็จ';
        settingsSheetsBadge.style.color = '#b91c1c';
        settingsSheetsBadge.style.borderColor = '#fca5a5';
      }
    } catch (err) {
      sheetsConnFeedback.style.background = '#fee2e2';
      sheetsConnFeedback.style.color = '#b91c1c';
      sheetsConnFeedback.innerHTML = `❌ <strong>เกิดข้อผิดพลาด:</strong> ${err.message}`;
    } finally {
      btnTestSheetsConn.disabled = false;
      btnTestSheetsConn.innerHTML = '🔍 ทดสอบ';
    }
  });

  // ปุ่มนำข้อมูลในเครื่องทั้งหมดขึ้นชีต (Push All Data)
  btnPushAllSheets?.addEventListener('click', async () => {
    const url = document.getElementById('setting-sheets-url')?.value.trim();
    if (!url) {
      showToast('กรุณากรอกและบันทึก Web App URL ก่อนทำการอัปโหลดข้อมูล', 'warning');
      return;
    }
    if (!confirm('ต้องการนำข้อมูลอุปกรณ์, ประวัติการยืม-คืน, สมาชิก และการตั้งค่าในเครื่องขึ้นไปเขียนทับบน Google Sheets หรือไม่?')) {
      return;
    }

    btnPushAllSheets.disabled = true;
    btnPushAllSheets.innerHTML = '⏳ กำลังอัปโหลด...';
    showToast('📤 กำลังส่งข้อมูลขึ้น Google Sheets...', 'info');

    try {
      if (window.googleSheetsService) {
        window.googleSheetsService.setApiUrl(url);
      }
      const res = await window.sportsStorage.uploadAllToGoogleSheets();
      showToast(`🟢 ${res.message || 'นำข้อมูลขึ้น Google Sheets เรียบร้อยแล้ว!'}`);
      if (sheetsConnFeedback) {
        sheetsConnFeedback.style.display = 'block';
        sheetsConnFeedback.style.background = '#dcfce7';
        sheetsConnFeedback.style.color = '#15803d';
        sheetsConnFeedback.innerHTML = '✅ ข้อมูลในเครื่องถูกส่งไปสร้างและบันทึกลงใน Google Sheets เรียบร้อยแล้ว!';
      }
      updateDbStatusPillUI();
    } catch (err) {
      showToast(`❌ อัปโหลดไม่สำเร็จ: ${err.message}`, 'danger');
      if (sheetsConnFeedback) {
        sheetsConnFeedback.style.display = 'block';
        sheetsConnFeedback.style.background = '#fee2e2';
        sheetsConnFeedback.style.color = '#b91c1c';
        sheetsConnFeedback.innerHTML = `❌ อัปโหลดไม่สำเร็จ: ${err.message}`;
      }
    } finally {
      btnPushAllSheets.disabled = false;
      btnPushAllSheets.innerHTML = '📤 นำข้อมูลในเครื่องขึ้นชีต (Push)';
    }
  });

  // ปุ่มดึงข้อมูลจากชีตลงเครื่อง (Pull All Data)
  btnPullAllSheets?.addEventListener('click', async () => {
    const url = document.getElementById('setting-sheets-url')?.value.trim();
    if (!url) {
      showToast('กรุณากรอกและบันทึก Web App URL ก่อนทำการดึงข้อมูล', 'warning');
      return;
    }

    btnPullAllSheets.disabled = true;
    btnPullAllSheets.innerHTML = '⏳ กำลังดึงข้อมูล...';
    showToast('📥 กำลังดึงข้อมูลล่าสุดจาก Google Sheets...', 'info');

    try {
      if (window.googleSheetsService) {
        window.googleSheetsService.setApiUrl(url);
      }
      await window.sportsStorage.syncFromGoogleSheets();
      showToast('🟢 ดึงข้อมูลจาก Google Sheets ลงเครื่องสำเร็จ!');
      if (sheetsConnFeedback) {
        sheetsConnFeedback.style.display = 'block';
        sheetsConnFeedback.style.background = '#dcfce7';
        sheetsConnFeedback.style.color = '#15803d';
        sheetsConnFeedback.innerHTML = '✅ ข้อมูลล่าสุดจาก Google Sheets ถูกนำมาอัปเดตในเครื่องเรียบร้อยแล้ว!';
      }
      updateDbStatusPillUI();
    } catch (err) {
      showToast(`❌ ดึงข้อมูลไม่สำเร็จ: ${err.message}`, 'danger');
    } finally {
      btnPullAllSheets.disabled = false;
      btnPullAllSheets.innerHTML = '📥 ดึงข้อมูลจากชีตลงเครื่อง (Pull)';
    }
  });

  settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const schoolName = document.getElementById('setting-school-name').value.trim();
    const schoolSubtitle = document.getElementById('setting-school-sub').value.trim();
    const teacherName = document.getElementById('setting-teacher-name').value.trim();
    const returnStationCode = document.getElementById('setting-station-code').value.trim();
    const newUsername = document.getElementById('setting-admin-username').value.trim();
    const oldPassword = document.getElementById('setting-old-password').value.trim();
    const newPassword = document.getElementById('setting-new-password').value.trim();

    if (!oldPassword) {
      showToast('กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันการตั้งค่า', 'warning');
      return;
    }

    try {
      // 1. บันทึก URL Google Sheets
      const sheetsUrl = document.getElementById('setting-sheets-url')?.value.trim();
      if (window.googleSheetsService) {
        window.googleSheetsService.setApiUrl(sheetsUrl);
      }

      // 2. บันทึกการตั้งค่าระบบ
      await window.sportsStorage.changeAdminCredentials({
        oldPassword,
        newUsername,
        newPassword: newPassword || null,
        schoolName,
        schoolSubtitle,
        teacherName,
        returnStationCode
      });

      closeSettingsModal();
      updateBrandingUI();
      updateDbStatusPillUI();
      updateUserBadgeUI();
      renderDashboardView();
      showToast('💾 บันทึกการตั้งค่าระบบและฐานข้อมูลเรียบร้อยแล้ว!');

      // ถ้ามี Google Sheets ให้ทดสอบซิงค์
      if (window.googleSheetsService && window.googleSheetsService.isConfigured()) {
        showToast('🔄 กำลังเชื่อมโยงข้อมูลกับ Google Sheets...', 'info');
        window.sportsStorage.syncFromGoogleSheets()
          .then(() => showToast('🟢 เชื่อมต่อกับ Google Sheets สำเร็จเรียบร้อย'))
          .catch(e => console.warn('Background sync on save settings failed:', e));
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // --- Modal สำรองและกู้คืนข้อมูล ---
  const backupModal = document.getElementById('backup-modal');
  const btnOpenBackup = document.getElementById('btn-open-backup');
  const btnDoBackup = document.getElementById('btn-do-backup');
  const btnDoRestore = document.getElementById('btn-do-restore');
  const backupFileInput = document.getElementById('backup-file-input');

  btnOpenBackup?.addEventListener('click', () => {
    if (backupFileInput) backupFileInput.value = '';
    backupModal.classList.add('show');
  });

  document.querySelectorAll('[data-close-modal="backup"]').forEach(btn => {
    btn.addEventListener('click', () => backupModal.classList.remove('show'));
  });

  btnDoBackup?.addEventListener('click', () => {
    try {
      window.sportsStorage.exportBackupJSON();
      showToast('📦 ดาวน์โหลดไฟล์สำรองข้อมูล JSON เรียบร้อยแล้ว');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  btnDoRestore?.addEventListener('click', () => {
    const file = backupFileInput?.files[0];
    if (!file) {
      showToast('กรุณาเลือกไฟล์ .json ที่ต้องการกู้คืน', 'warning');
      return;
    }

    if (!confirm('⚠️ การกู้คืนจะแทนที่ข้อมูลปัจจุบันด้วยข้อมูลจากไฟล์สำรอง คุณแน่ใจหรือไม่?')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        window.sportsStorage.importBackupJSON(event.target.result);
        backupModal.classList.remove('show');
        updateBrandingUI();
        updateDbStatusPillUI();
        renderDashboardView();
        renderBorrowView();
        showToast('🎉 กู้คืนข้อมูลจากไฟล์สำรองสำเร็จเรียบร้อยแล้ว!');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    };
    reader.readAsText(file);
  });

  // ปุ่มแถบเครื่องมือ Dashboard
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    try {
      window.sportsStorage.exportLoansCSV();
      showToast('📥 ส่งออกไฟล์รายงาน CSV (Excel) สำเร็จแล้ว!');
    } catch (err) {
      showToast(err.message, 'warning');
    }
  });

  document.getElementById('btn-print-report')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-clear-returned')?.addEventListener('click', () => {
    if (confirm('คุณต้องการลบประวัติรายการอุปกรณ์ที่ "คืนแล้ว" ออกจากตารางเพื่อจัดระเบียบข้อมูลหรือไม่? (รายการที่กำลังยืมจะไม่ถูกลบ)')) {
      const removedCount = window.sportsStorage.clearReturnedLoans();
      if (removedCount > 0) {
        showToast(`🧹 ล้างประวัติที่คืนแล้วสำเร็จ (${removedCount} รายการ)`);
        renderDashboardView();
      } else {
        showToast('ไม่มีรายการที่คืนแล้วในระบบ', 'info');
      }
    }
  });

  // Logout ครู
  btnLogout?.addEventListener('click', () => {
    if (confirm('คุณต้องการออกจากระบบคุณครูหรือไม่?')) {
      window.sportsStorage.logout();
      showToast('ออกจากระบบคุณครูเรียบร้อยแล้ว');
      updateUserBadgeUI();
      window.location.hash = '#borrow';
    }
  });

  // Reset Demo Data
  btnResetDemo?.addEventListener('click', async () => {
    if (confirm('⚠️ ต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่? ข้อมูลการยืมและสมาชิกทั้งหมดจะถูกรีเซ็ต')) {
      await window.sportsStorage.resetAll();
      showToast('🔄 รีเซ็ตข้อมูลกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว');
      updateBrandingUI();
      updateDbStatusPillUI();
      updateUserBadgeUI();
      renderDashboardView();
      renderBorrowView();
    }
  });

  // ปิด modal เมื่อคลิกพื้นที่ว่างรอบนอก (Backdrop) หรือกด Escape
  [borrowModal, returnVerifyModal, stationPosterModal, equipmentModal, settingsModal, backupModal].forEach(modal => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal === returnVerifyModal) closeReturnVerifyModal();
        else modal.classList.remove('show');
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [borrowModal, returnVerifyModal, stationPosterModal, equipmentModal, settingsModal, backupModal].forEach(modal => {
        if (modal === returnVerifyModal) closeReturnVerifyModal();
        else modal?.classList.remove('show');
      });
    }
  });

  // --- สมัครรับการแจ้งเตือน Realtime ---
  if (window.sportsStorage && typeof window.sportsStorage.subscribe === 'function') {
    window.sportsStorage.subscribe(() => {
      updateDbStatusPillUI();
      updateBrandingUI();
      const hash = window.location.hash || '#borrow';
      if (hash === '#borrow') renderBorrowView();
      else if (hash === '#return') renderReturnView();
      else if (hash === '#dashboard') renderDashboardView();
    });
  }

  // --- Initial Launch ---
  updateBrandingUI();
  updateDbStatusPillUI();
  updateUserBadgeUI();
  handleRoute();
});
