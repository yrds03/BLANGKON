// ====================================================================
// CORE API BRIDGE
// ====================================================================

async function requestAPI(action, payload = {}) {
    try {
        const response = await fetch(API_URL, {
            method: "POST", mode: "cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: action, payload: payload })
        });
        let result = await response.json();
        if (result && result.msg && result.msg.includes('Sesi tidak valid')) {
            showInlineNotif('error', 'Sesi Anda kadaluarsa. Silakan login ulang.');
            setTimeout(prosesLogout, 2000);
        }
        return result;
    } catch(err) {
        console.error("API Error: ", err); return { status: false, msg: err.message };
    }
}

// ====================================================================
// FUNGSI REQUEST DENGAN TOKEN OTOMATIS
// ====================================================================
async function requestAPIWithAuth(action, payload = {}) {
    if (action === 'prosesLogin') {
        return await requestAPI(action, payload);
    }
    let token = state.token || '';
    let user = state.user || '';
    if (!token) {
        let sesi = localStorage.getItem('sanstech_session');
        if (sesi) {
            try {
                let parsed = JSON.parse(sesi);
                token = parsed.token || '';
                user = parsed.user || '';
            } catch(e) {}
        }
    }
    if (!token || !user) {
        showInlineNotif('error', 'Sesi tidak valid. Silakan login ulang.');
        return { status: false, msg: 'Sesi tidak valid' };
    }
    payload.token = token;
    payload.user = user;
    return await requestAPI(action, payload);
}

// ====================================================================
// STATE GLOBAL
// ====================================================================
let state = { 
    user: "", 
    role: "", 
    cabang: "Pusat", 
    token: "",
    activeMenu: "dashboard", 
    data: { 
        produk: [], 
        pelanggan: [], 
        supplier: [], 
        penjualan: [], 
        penjualan_detail: [], 
        pembelian: [],
        pembelian_detail: [],
        stok: [], 
        keuangan: [], 
        akun: [] 
    }, 
    keranjangPOS: [], 
    keranjangPO: [], 
    metodeBayar: "Tunai", 
    isSO: false, 
    posTemp: {},
    syncInterval: null
};
let chartDash = null; let chartLaporan = null; let lastInvoice = ""; let lastTotal = 0; let kameraContext = 'pos'; let isSyncing = false; 

const formatRp = (angka) => {
    let num = Number(angka) || 0;
    return "Rp " + num.toLocaleString('id-ID', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
    });
};
function formatInputRibuan(input) { let val = input.value.replace(/[^0-9]/g, ''); input.value = val ? parseInt(val, 10).toLocaleString('id-ID') : ''; }
const parseAngka = (val) => parseFloat(String(val).replace(/[^0-9]/g, '')) || 0;

function pastikanDataAman(rawData) {
    let aman = rawData || {};
    ['produk','pelanggan','supplier','penjualan','penjualan_detail','pembelian','pembelian_detail','stok','keuangan','akun'].forEach(k => { 
        if(!aman[k] || !Array.isArray(aman[k])) aman[k] = []; 
    });
    return aman;
}

// ====================================================================
// PWA UPDATE CHECK & AUTO CACHE CLEAR
// ====================================================================
let updateNotified = false; // Peredam agar popup tidak muncul berkali-kali
function cekUpdatePWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (!updateNotified) {
                                updateNotified = true;
                                let mod = document.getElementById('modal-update-pwa');
                                if(mod) {
                                    mod.classList.replace('hidden', 'flex');
                                    setTimeout(() => {
                                        mod.classList.remove('opacity-0');
                                        mod.querySelector('.transform').classList.remove('scale-95');
                                    }, 50);
                                }
                            }
                        }
                    });
                });
            })
            .catch(err => console.log('SW registration failed: ', err));
    }
}

function applyUpdate() {
    let btn = document.getElementById('btn-eksekusi-update');
    if(btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xl"></i> MEMPERBARUI SISTEM...';
        btn.disabled = true;
    }
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                
                registration.waiting.addEventListener('statechange', () => {
                    if (registration.waiting.state === 'activated') {
                        caches.keys().then(function(names) {
                            for (let name of names) caches.delete(name);
                        });
                        setTimeout(() => window.location.reload(true), 500);
                    }
                });
            } else {
                caches.keys().then(function(names) {
                    for (let name of names) caches.delete(name);
                });
                setTimeout(() => window.location.reload(true), 500);
            }
        });
    } else {
        window.location.reload(true);
    }
}

navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
});

window.onload = function() {
    state.data = pastikanDataAman({});
    muatPengaturanLokal();
    cekUpdatePWA();
    let sesi = localStorage.getItem('sanstech_session');
    if(sesi) {
        try {
            let parsed = JSON.parse(sesi); 
            state.user = parsed.user; 
            state.role = parsed.role; 
            state.cabang = parsed.cabang || "Pusat";
            state.token = parsed.token || '';
            let lastMenu = localStorage.getItem('sanstech_active_menu'); 
            if(lastMenu) state.activeMenu = lastMenu;
            bukaAppScreen(); 
        } catch(e) { document.getElementById('login-screen').classList.replace('hidden', 'flex'); }
    } else { document.getElementById('login-screen').classList.replace('hidden', 'flex'); }
};

function showInlineNotif(tipe, pesan) {
    let el = document.getElementById('inline-global-notif'); let icon = document.getElementById('ign-icon');
    el.className = `mx-6 mt-4 p-3 rounded-xl text-sm font-bold flex items-center justify-between shadow-sm animate-bounce ${tipe === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : (tipe === 'info' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-red-50 text-red-600 border border-red-200')}`;
    icon.className = tipe === 'success' ? "fa-solid fa-circle-check" : (tipe === 'info' ? "fa-solid fa-circle-info" : "fa-solid fa-triangle-exclamation");
    document.getElementById('ign-text').innerText = pesan; 
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('animate-bounce'); }, 4000);
}

function bukaModalConfirm(judul, pesan, tipeIcon, callbackYa) {
    document.getElementById('modal-title').innerText = judul; document.getElementById('modal-desc').innerText = pesan;
    let icon = document.getElementById('modal-icon'); 
    icon.innerHTML = tipeIcon === 'hapus' ? '<i class="fa-solid fa-trash-can"></i>' : (tipeIcon==='logout' ? '<i class="fa-solid fa-power-off"></i>' : (tipeIcon==='po' ? '<i class="fa-solid fa-file-invoice"></i>' : '<i class="fa-solid fa-rotate-left"></i>'));
    icon.className = `text-4xl mb-4 ${tipeIcon === 'hapus' || tipeIcon === 'logout' ? 'text-red-500' : (tipeIcon === 'po' ? 'text-emerald-500' : 'text-orange-500')}`;
    let btnConfirm = document.getElementById('modal-btn-confirm'); 
    btnConfirm.className = `w-1/2 px-5 py-2.5 rounded-xl font-bold text-white shadow-md transition ${tipeIcon === 'hapus' || tipeIcon === 'logout' ? 'bg-red-600 hover:bg-red-700' : (tipeIcon === 'po' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600')}`;
    btnConfirm.onclick = function() { callbackYa(); tutupModal(); }; 
    document.getElementById('custom-modal').classList.replace('hidden','flex');
}
function tutupModal() { document.getElementById('custom-modal').classList.replace('flex','hidden'); }

// ====================================================================
// PWA & BLUETOOTH
// ====================================================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('btn-install-app').classList.remove('hidden'); });
document.getElementById('btn-install-app').addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') document.getElementById('btn-install-app').classList.add('hidden'); deferredPrompt = null; } });

let btDevice = null; let btCharacteristic = null;
async function connectBluetoothNative() {
    if (!navigator.bluetooth) return showInlineNotif('error', 'Browser HP ini tidak mendukung Web Bluetooth API.');
    try {
        btDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'] });
        btDevice.addEventListener('gattserverdisconnected', function() { btCharacteristic = null; let btn = document.getElementById('btn-bt-connect'); if(btn) { btn.classList.replace('bg-emerald-500', 'bg-red-500'); btn.classList.replace('hover:bg-emerald-600', 'hover:bg-red-600'); } document.getElementById('bt-status-text').innerText = "BT TERPUTUS"; showInlineNotif('error', 'Bluetooth terputus!'); });
        const server = await btDevice.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb').catch(() => null) || await server.getPrimaryService('e7810a71-73ae-499d-8c15-faa9aef0c3f2');
        btCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb').catch(() => null) || await service.getCharacteristics().then(chars => chars[0]);
        let btn = document.getElementById('btn-bt-connect'); if(btn) { btn.classList.replace('bg-indigo-500', 'bg-emerald-500'); btn.classList.replace('bg-red-500', 'bg-emerald-500'); btn.classList.replace('hover:bg-indigo-600', 'hover:bg-emerald-600'); }
        document.getElementById('bt-status-text').innerText = "BT KONEK"; showInlineNotif('success', 'Printer terhubung: ' + btDevice.name);
    } catch(e) { showInlineNotif('error', 'Gagal terkoneksi: ' + e.message); }
}
async function cetakStrukBluetooth(teksNota, retry = 2) {
    if(!btCharacteristic) return false;
    let encoder = new TextEncoder(); 
    let data = encoder.encode(teksNota); 
    try {
        for(let i=0; i<data.length; i+=20) { 
            await btCharacteristic.writeValue(data.slice(i, i+20)); 
        }
        return true;
    } catch(e) {
        if (retry > 0) {
            await new Promise(r => setTimeout(r, 500));
            return cetakStrukBluetooth(teksNota, retry - 1);
        }
        return false;
    }
}

// ====================================================================
// KAMERA & DATA MASTER
// ====================================================================
function tambahMasterLokal(namaModul, idList) { 
    document.getElementById('modal-input-title').innerText = "Tambah " + namaModul; 
    document.getElementById('input-master-value').value = ""; 
    document.getElementById('input-master-target').value = idList; 
    document.getElementById('input-master-name').value = namaModul; 
    document.getElementById('modal-input-master').classList.replace('hidden','flex'); 
    setTimeout(() => document.getElementById('input-master-value').focus(), 100); 
}
async function simpanMasterLokal() { 
    let val = document.getElementById('input-master-value').value.trim(); 
    let idList = document.getElementById('input-master-target').value; 
    let namaModul = document.getElementById('input-master-name').value; 
    if(!val) return showInlineNotif('error', 'Input data tidak boleh kosong!'); 
    let savedArr = JSON.parse(localStorage.getItem('sanstech_' + idList) || "[]"); 
    if(!savedArr.includes(val)) { 
        savedArr.push(val); 
        let strData = JSON.stringify(savedArr);
        localStorage.setItem('sanstech_' + idList, strData); 
        showInlineNotif('info', 'Menyinkronkan ke Cloud Master...');
        let payload = {}; payload['sanstech_' + idList] = strData;
        let res = await requestAPIWithAuth('simpanPengaturan', payload); 
        if(res && res.status) {
            showInlineNotif('success', `${namaModul} '${val}' sukses dicatat di Cloud!`); 
            if(state.activeMenu === 'datamaster') renderModulAktif();
        } else { showInlineNotif('error', 'Gagal sinkron ke Cloud server!'); }
    } else { showInlineNotif('error', 'Data sudah ada dalam daftar!'); } 
    document.getElementById('modal-input-master').classList.replace('flex','hidden'); 
}
async function hapusMasterLokal(idList, itemValue, namaModul) {
    let savedArr = JSON.parse(localStorage.getItem('sanstech_' + idList) || "[]");
    let idx = savedArr.indexOf(itemValue);
    
    if(idx > -1) { 
        bukaModalConfirm("Hapus " + namaModul, `Yakin menghapus '${itemValue}'? Data yang terhapus akan hilang dari semua cabang.`, 'hapus', async function() {
            let deletedVal = savedArr.splice(idx, 1)[0];
            let strData = JSON.stringify(savedArr);
            localStorage.setItem('sanstech_' + idList, strData);
            showInlineNotif('info', 'Menghapus dari Cloud Master...');
            let payload = {}; payload['sanstech_' + idList] = strData;
            let res = await requestAPIWithAuth('simpanPengaturan', payload);
            if(res && res.status) {
                showInlineNotif('success', `Data '${deletedVal}' berhasil dihapus permanen!`);
                if(state.activeMenu === 'datamaster') renderModulAktif();
            } else { showInlineNotif('error', 'Gagal menghapus dari Cloud!'); }
        });
    }
}
function bukaKamera(context) { kameraContext = context; document.getElementById('kamera-input').click(); }
function prosesFotoBarcode(event) { let file = event.target.files[0]; if (!file) return; showInlineNotif('info', 'Membaca barcode...'); const html5QrCode = new Html5Qrcode("reader"); html5QrCode.scanFile(file, true).then(decodedText => { if (kameraContext === 'pos') { let prd = state.data.produk.find(p => String(p.Barcode) === decodedText || String(p.ID_Produk) === decodedText); if(prd) { eksekusiTambahKeranjang(prd); } else { showInlineNotif('error', 'Barcode tidak terdaftar!'); } } else if (kameraContext === 'produk') { document.getElementById('prd-bc').value = decodedText; showInlineNotif('success', 'Barcode disalin!'); } else if (kameraContext === 'lacak') { document.getElementById('input-lacak-imei').value = decodedText; lacakImeiBarang(); } else if (kameraContext === 'tf') { document.getElementById('tf-produk').value = decodedText; } event.target.value = ''; }).catch(err => { showInlineNotif('error', 'Gagal membaca Barcode!'); event.target.value = ''; }); }

// ====================================================================
// FUNGSI UTAMA (LOGIN, SYNC, NAV)
// ====================================================================
async function eksekusiLogin() {
    let u = document.getElementById('in-user').value; let p = document.getElementById('in-pass').value; let errMsg = document.getElementById('login-error-msg');
    if(!u || !p) { errMsg.innerText = "Username dan Password wajib diisi!"; errMsg.classList.remove('hidden'); return; }
    
    let loader = document.getElementById('login-loader'); loader.classList.replace('hidden','flex'); errMsg.classList.add('hidden');
    let res = await requestAPI('prosesLogin', {user: u, pass: p});
    loader.classList.replace('flex','hidden');
    
    if(res && res.status) { 
        localStorage.setItem('sanstech_session', JSON.stringify({
            user: res.user, 
            role: res.role, 
            cabang: res.cabang,
            token: res.token
        })); 
        state.user = res.user; 
        state.role = res.role; 
        state.cabang = res.cabang || "Pusat"; 
        state.token = res.token;
        if(res.data) { state.data = pastikanDataAman(res.data); } 
        bukaAppScreen(); 
        syncDataLiveBackground();
        showInlineNotif('info', 'Menyinkronkan data terbaru dari Cloud...');
    } else { 
        errMsg.innerText = res ? res.msg : "Terjadi kesalahan Server API."; errMsg.classList.remove('hidden'); 
    }
}
async function syncDataLiveBackground() { 
    if (isSyncing) return; 
    isSyncing = true;
    
    let loader = document.getElementById('global-loader');
    if (loader) loader.classList.replace('hidden', 'flex');
    
    let el = document.getElementById('sync-status'); 
    if(el) el.innerHTML = '<i class="fa-solid fa-rotate fa-spin text-blue-500"></i> Syncing...'; 
    
    try {
        let resSetting = await requestAPIWithAuth('tarikPengaturan', {});
        if(resSetting && resSetting.status && resSetting.data) {
            for(let key in resSetting.data) { localStorage.setItem(key, resSetting.data[key]); }
            muatPengaturanLokal();
        }

        let res = await requestAPIWithAuth('tarikDataLiveSystem', {role: state.role, cabang: state.cabang, _t: new Date().getTime()});
        let cekData = res.data ? res.data : res;
        if(res && !res.msg && (cekData.produk || cekData.penjualan || cekData.pelanggan || cekData.stok)) { 
            let cleanData = pastikanDataAman(cekData); 
            
            let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
            let myCab = String(state.cabang).toUpperCase().trim();
            if (roleNorm !== 'SUPERADMIN') {
                let sFilter = (arr) => arr.filter(item => String(item.Cabang || 'Pusat').toUpperCase().trim() === myCab);
                cleanData.produk = sFilter(cleanData.produk);
                cleanData.penjualan = sFilter(cleanData.penjualan);
                cleanData.penjualan_detail = sFilter(cleanData.penjualan_detail);
                cleanData.stok = sFilter(cleanData.stok);
                cleanData.keuangan = sFilter(cleanData.keuangan);
            }
            
            state.data = cleanData;
            if(el) el.innerHTML = '<i class="fa-solid fa-cloud text-emerald-500"></i> Otomatis'; 
            
            // ANTI-LAG SYSTEM: Jangan re-render UI kalau user sedang sibuk buka form / opname
            switch(state.activeMenu) {
                case 'dashboard': document.getElementById('main-content-area').innerHTML = viewDashboard(); renderChartDasbor(); break;
                case 'pos': if(document.getElementById('modal-cari-pos') && !document.getElementById('modal-cari-pos').classList.contains('hidden')) { renderListCariPOS(); } break;
                case 'penjualan': filterRiwayat(); renderTabelSO(); break;
                case 'produk': 
                    let formPrd = document.getElementById('form-wrap-produk');
                    if(!formPrd || formPrd.classList.contains('hidden')) { filterProdukUI(); }
                    break;
                case 'pelanggan': filterPelangganUI(); break;
                case 'supplier': filterSupplierUI(); break;
                case 'pembelian': renderRiwayatPO(); break;
                case 'laporan': renderChartLaporan(); break;
                case 'keuangan': filterKeuanganUI(); break;
                case 'stok':
                    let isOpname = document.getElementById('stok-opname') && !document.getElementById('stok-opname').classList.contains('hidden');
                    let isTransfer = document.getElementById('stok-transfer') && !document.getElementById('stok-transfer').classList.contains('hidden');
                    let isLacak = document.getElementById('stok-lacak') && !document.getElementById('stok-lacak').classList.contains('hidden');
                    if (!isOpname && !isTransfer && !isLacak) { filterStokUI(); }
                    break;
            }
            
        } else { 
            if(el) el.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-500"></i> Gagal Sync'; 
            if(res && res.msg && !res.msg.includes('Sesi tidak valid')) showInlineNotif('error', res.msg);
        }
    } finally {
        isSyncing = false; 
        if (loader) loader.classList.replace('flex', 'hidden');
    }
}

function prosesLogout() { 
    if (state.syncInterval) {
        clearInterval(state.syncInterval);
        state.syncInterval = null;
    }
    localStorage.removeItem('sanstech_session'); 
    localStorage.removeItem('sanstech_active_menu'); 
    state.data = pastikanDataAman({}); 
    state.token = '';
    document.getElementById('app-screen').classList.replace('flex', 'hidden'); 
    document.getElementById('login-screen').classList.replace('hidden', 'flex'); 
    document.getElementById('in-user').value = ""; 
    document.getElementById('in-pass').value = ""; 
}

function navigasi(menuId) { 
    state.activeMenu = menuId; localStorage.setItem('sanstech_active_menu', menuId); 
    const menuTitles = { dashboard: "Dashboard", pos: "Sistem Kasir", penjualan: "Penjualan / SO", produk: "Produk Master", stok: "Kelola Stok", pelanggan: "Pelanggan", supplier: "Supplier", pembelian: "Pembelian (PO)", laporan: "Laporan & Analisis", keuangan: "Keuangan", datamaster: "Data Master", pengaturan: "Pengaturan", akun: "Profil Akun" };
    document.getElementById('ui-title').innerText = menuTitles[menuId] || "Aplikasi"; document.getElementById('inline-global-notif').classList.add('hidden'); document.querySelectorAll('.menu-sidebar').forEach(el => el.classList.remove('active')); 
    let actEl = document.querySelector(`#desktop-nav .menu-sidebar[onclick*="navigasi('${menuId}')"]`); if(actEl) actEl.classList.add('active'); 
    let actElMob = document.querySelector(`#mobile-menu-container .menu-sidebar[onclick*="navigasi('${menuId}')"]`); if(actElMob) actElMob.classList.add('active'); 
    renderModulAktif(); 
}

function renderModulAktif() {
    let area = document.getElementById('main-content-area'); area.innerHTML = ""; 
    try {
        switch(state.activeMenu) { 
            case 'dashboard': area.innerHTML = viewDashboard(); renderChartDasbor(); break; 
            case 'pos': area.innerHTML = viewPOS(); renderKeranjangPOS(); setPilihanPelanggan(); break; 
            case 'penjualan': area.innerHTML = viewPenjualan(); filterPenjualanUI(); break; 
            case 'produk': area.innerHTML = viewProduk(); filterProdukUI(); break; 
            case 'stok': area.innerHTML = viewStok(); filterStokUI(); break; 
            case 'pelanggan': area.innerHTML = viewPelanggan(); filterPelangganUI(); break; 
            case 'supplier': area.innerHTML = viewSupplier(); filterSupplierUI(); break; 
            case 'pembelian': area.innerHTML = viewPembelian(); renderKeranjangPO(); break; 
            case 'laporan': area.innerHTML = viewLaporan(); renderChartLaporan(); break; 
            case 'keuangan': area.innerHTML = viewKeuangan(); filterKeuanganUI(); break; 
            case 'datamaster': area.innerHTML = viewDataMaster(); break; 
            case 'pengaturan': area.innerHTML = viewPengaturan(); muatPengaturanLokal(); break; 
            case 'akun': area.innerHTML = viewAkun(); break; 
        }
        
        let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
        let myAkun = state.data.akun ? state.data.akun.find(a => String(a.Username).trim() === state.user) : null;
        let akses = (myAkun && myAkun.Akses_Menu) ? String(myAkun.Akses_Menu).split(',') : null;
        
        document.querySelectorAll('#main-content-area .admin-only').forEach(el => { 
            el.style.display = (roleNorm === 'KASIR') ? 'none' : ''; 
        });

        document.querySelectorAll('.menu-sidebar').forEach(el => {
            let mMatch = el.getAttribute('onclick').match(/navigasi\('([^']+)'\)/);
            if (mMatch) {
                let mId = mMatch[1];
                if (roleNorm === 'SUPERADMIN') {
                    el.style.display = 'flex';
                } else if (akses && akses.length > 0) {
                    el.style.display = akses.includes(mId) ? 'flex' : 'none';
                } else {
                    if (roleNorm === 'KASIR' && el.classList.contains('admin-only')) {
                        el.style.display = 'none';
                    } else {
                        el.style.display = 'flex';
                    }
                }
            }
        });

        document.querySelectorAll('.md\\:hidden.fixed.bottom-0 > div').forEach(el => {
            let mMatch = el.getAttribute('onclick').match(/navigasi\('([^']+)'\)/);
            if (mMatch) {
                let mId = mMatch[1];
                if (roleNorm === 'SUPERADMIN') {
                    el.style.display = '';
                } else if (akses && akses.length > 0) {
                    el.style.display = akses.includes(mId) ? '' : 'none';
                } else {
                    if (roleNorm === 'KASIR' && el.classList.contains('admin-only')) {
                        el.style.display = 'none';
                    } else {
                        el.style.display = '';
                    }
                }
            }
        });

    } catch(err) { 
        console.error("Render View Error:", err); 
        area.innerHTML = `<div class="p-10 text-center"><i class="fa-solid fa-triangle-exclamation text-5xl text-red-500 mb-4"></i><p class="font-bold text-slate-600">Gagal memuat tampilan.</p><p class="text-xs text-slate-400 mt-2">${err.message}</p></div>`; 
    }
}

function bukaAppScreen() { 
    document.getElementById('login-screen').classList.replace('flex', 'hidden'); 
    document.getElementById('app-screen').classList.replace('hidden', 'flex'); 
    document.getElementById('ui-user').innerText = state.user; 
    document.getElementById('ui-role').innerText = state.role + " (" + state.cabang + ")"; 
    navigasi(state.activeMenu); 
    syncDataLiveBackground(); 
}

function toggleMobileMenu() {
    let mSidebar = document.getElementById('mobile-sidebar');
    if(mSidebar.classList.contains('hidden')) { mSidebar.classList.remove('hidden'); mSidebar.style.display = 'flex'; document.getElementById('mobile-menu-container').innerHTML = document.getElementById('desktop-nav').innerHTML; let items = document.getElementById('mobile-menu-container').querySelectorAll('.menu-sidebar'); items.forEach(item => { let originalClick = item.getAttribute('onclick'); if(originalClick && !originalClick.includes('toggleMobileMenu')) { item.setAttribute('onclick', `toggleMobileMenu(); ${originalClick}`); } }); } else { mSidebar.classList.add('hidden'); mSidebar.style.display = 'none'; }
}

// ====================================================================
// VIEW & FUNGSI: DASHBOARD
// ====================================================================
function viewDashboard() { 
    let totalPlg = state.data.pelanggan ? state.data.pelanggan.length : 0; 
    let dNow = new Date(); 
    let tglIni = dNow.getFullYear() + "-" + String(dNow.getMonth() + 1).padStart(2, '0') + "-" + String(dNow.getDate()).padStart(2, '0'); 
    
    let jualHariIni = 0; let labaHariIni = 0; let itemTerjual = 0; let validInv = [];

    if(state.data.penjualan) { 
        state.data.penjualan.forEach(j => { 
            let wkt = String(j.Waktu).substring(0,10); 
            if(wkt === tglIni && j.Status !== 'RETUR' && j.Status !== 'SO/PESANAN') { 
                jualHariIni += parseFloat(j.Total_Akhir||0); 
                labaHariIni += (parseFloat(j.Total_Akhir||0) * 0.15); 
                validInv.push(j.ID_Invoice);
            } 
        }); 
    } 
    
    if(state.data.penjualan_detail && validInv.length > 0) {
        state.data.penjualan_detail.forEach(d => {
            if(validInv.includes(d.ID_Invoice)) { itemTerjual += parseFloat(d.Qty || 0); }
        });
    }

    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-cart-shopping"></i></div>
            <div class="overflow-hidden"><p class="text-[10px] font-bold text-slate-400">OMSET HARI INI</p><p class="font-black text-lg md:text-xl truncate">${formatRp(jualHariIni)}</p></div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-box-open"></i></div>
            <div class="overflow-hidden"><p class="text-[10px] font-bold text-slate-400">BARANG TERJUAL</p><p class="font-black text-lg md:text-xl truncate">${itemTerjual} Item</p></div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 admin-only">
            <div class="w-12 h-12 rounded-full bg-cyan-50 text-cyan-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-users"></i></div>
            <div class="overflow-hidden"><p class="text-[10px] font-bold text-slate-400">PELANGGAN AKTIF</p><p class="font-black text-lg md:text-xl truncate">${totalPlg} Org</p></div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 admin-only">
            <div class="w-12 h-12 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-chart-line"></i></div>
            <div class="overflow-hidden"><p class="text-[10px] font-bold text-slate-400">ESTIMASI LABA</p><p class="font-black text-lg md:text-xl text-purple-600 truncate">${formatRp(labaHariIni)}</p></div>
        </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 admin-only">
        <div class="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h3 class="font-black text-slate-700 mb-4">Grafik Tren Penjualan 7 Hari</h3>
            <div class="relative w-full h-64"><canvas id="dashChart"></canvas></div>
        </div>
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col">
            <h3 class="font-black text-slate-700 mb-4">Akses Cepat</h3>
            <div class="grid grid-cols-2 gap-3 flex-1">
                <div onclick="navigasi('pos')" class="bg-blue-600 text-white rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-700 transition shadow text-center">
                    <i class="fa-solid fa-calculator text-2xl mb-2"></i><span class="text-xs font-bold mt-2">Buka Kasir</span>
                </div>
                <div onclick="navigasi('produk')" class="bg-orange-500 text-white rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-orange-600 transition shadow text-center">
                    <i class="fa-solid fa-plus text-2xl mb-2"></i><span class="text-xs font-bold mt-2">Input Barang</span>
                </div>
            </div>
        </div>
    </div>`; 
}
function renderChartDasbor() { let canvas = document.getElementById('dashChart'); if(!canvas) return; if(chartDash !== null) chartDash.destroy(); let ctx = canvas.getContext('2d'); let labels = []; let dataOmset = []; for(let i=6; i>=0; i--) { let d = new Date(); d.setDate(d.getDate() - i); let dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0'); let labelStr = d.getDate() + '/' + (d.getMonth()+1); let omsetHariIni = 0; if(state.data.penjualan) { state.data.penjualan.forEach(j => { let wktJual = String(j.Waktu).substring(0, 10); if(wktJual === dateStr && j.Status !== 'RETUR' && j.Status !== 'SO/PESANAN') omsetHariIni += parseFloat(j.Total_Akhir || 0); }); } labels.push(labelStr); dataOmset.push(omsetHariIni); } chartDash = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Omset', data: dataOmset, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } }); }

// ====================================================================
// VIEW & FUNGSI: POS KASIR
// ====================================================================
function viewPOS() { 
    let savedMetode = JSON.parse(localStorage.getItem('sanstech_list-metode') || '["Tunai", "QRIS", "Transfer", "Kredit"]');
    
    // Pastikan 3 metode utama selalu ada
    if(!savedMetode.includes("Tunai")) savedMetode.unshift("Tunai"); 
    if(!savedMetode.includes("QRIS")) savedMetode.push("QRIS"); 
    if(!savedMetode.includes("Transfer")) savedMetode.push("Transfer"); 
    
    let btnMetodeHtml = "";
    let optMetode1Html = "";
    let optMetode2Html = "";
    
    savedMetode.forEach(m => {
        let safeId = m.replace(/[^a-zA-Z0-9]/g, '_'); 
        let activeClass = (state.metodeBayar === m) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100 text-slate-500";
        
        // Tombol metode bayar tunggal (semua metode muncul)
        btnMetodeHtml += `<button onclick="pilihMetodePOS('${m}')" id="btn-m-${safeId}" class="btn-metode-pos py-2.5 rounded-lg border-2 ${activeClass} font-bold text-xs transition uppercase">${m}</button>`;
        
        // FILTER DROPDOWN: Pisahkan Tunai/Transfer/QRIS ke Dropdown 1, sisanya (Leasing) ke Dropdown 2
        let mUp = m.toUpperCase();
        if(mUp === 'TUNAI' || mUp === 'TRANSFER' || mUp === 'QRIS') {
            optMetode1Html += `<option value="${m}">${m}</option>`;
        } else {
            optMetode2Html += `<option value="${m}">${m}</option>`;
        }
    });

    // Jika belum ada data leasing sama sekali di Master
    if(optMetode2Html === "") {
        optMetode2Html = `<option value="">-- Tambah Leasing di Data Master --</option>`;
    }

    state.isSplitPayment = false; // Reset Split State

    return `
    <div class="flex flex-col lg:flex-row gap-4 h-full"> 
        <div class="w-full lg:w-2/3 flex flex-col gap-4"> 
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-2"> 
                <div class="relative flex-1"><i class="fa-solid fa-barcode absolute left-4 top-3.5 text-slate-400"></i><input type="text" id="pos-barcode" onkeypress="handleBarcodePOS(event)" class="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 p-3 pl-11 rounded-xl outline-none font-bold text-sm" placeholder="Scan Barcode / ID..." autocomplete="off"></div> 
                <button onclick="bukaKamera('pos')" class="bg-blue-600 text-white w-12 h-12 rounded-xl shadow hover:bg-blue-700 transition flex items-center justify-center"><i class="fa-solid fa-camera text-xl"></i></button> 
                <button onclick="cariManualPOS()" class="bg-orange-500 text-white px-5 rounded-xl font-bold shadow-md hover:bg-orange-600 transition"><i class="fa-solid fa-magnifying-glass"></i> Cari</button> 
            </div> 
            <div id="pos-error" class="hidden text-xs font-bold text-red-500 bg-red-50 p-2 rounded-lg text-center border border-red-100"></div> 
            <div class="bg-white flex-1 rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden min-h-[300px]"> 
                <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 class="font-black text-slate-800 text-sm">Item Keranjang</h3><span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md font-bold"><span id="pos-jml-item">0</span> Item</span></div> 
                <div id="pos-cart-list" class="flex-1 overflow-y-auto p-2 space-y-2"></div> 
            </div> 
        </div> 
        <div class="w-full lg:w-1/3 flex flex-col gap-4"> 
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative"> 
                <p class="text-[10px] font-bold text-slate-400 mb-1">PILIH PELANGGAN</p> 
                
                <div class="relative mb-6">
                    <div id="pos-plg-overlay" class="hidden fixed inset-0 z-30" onclick="togglePlgDropdown()"></div>
                    <input type="hidden" id="pos-pelanggan" value="UMUM">
                    <div class="w-full border border-slate-200 p-3 rounded-xl bg-slate-50 font-bold text-sm flex justify-between items-center cursor-pointer hover:border-blue-400 transition relative z-40" onclick="togglePlgDropdown()">
                        <span id="pos-plg-label" class="truncate text-slate-700">Pelanggan UMUM</span>
                        <i class="fa-solid fa-chevron-down text-slate-400 text-xs"></i>
                    </div>
                    <div id="pos-plg-dropdown" class="hidden absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 flex-col overflow-hidden max-h-60">
                        <div class="p-2 border-b border-slate-100 sticky top-0 bg-white">
                            <div class="relative">
                                <i class="fa-solid fa-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
                                <input type="text" id="pos-plg-search" onkeyup="filterListPelanggan()" class="w-full bg-slate-50 border border-slate-200 p-2 pl-8 rounded-lg text-xs font-bold outline-none focus:border-blue-500" placeholder="Ketik cari nama..." autocomplete="off">
                            </div>
                        </div>
                        <div id="pos-plg-list" class="overflow-y-auto flex-1 p-1 space-y-1"></div>
                    </div>
                </div>
                
                <div class="bg-slate-900 text-white p-5 rounded-xl text-center mb-6 shadow-inner">
                    <div class="flex justify-between text-xs text-slate-400 font-bold mb-1 border-b border-slate-700 pb-2 items-center"><span>Subtotal:</span><span id="pos-subtotal-rp">Rp 0</span></div>
                    <div class="flex justify-between items-center text-xs text-orange-400 font-bold mb-1 border-b border-slate-700 pb-2 pt-1"><span>Diskon (Rp):</span><input type="text" inputmode="numeric" id="pos-input-diskon" value="0" onkeyup="formatInputRibuan(this); renderKeranjangPOS()" onchange="formatInputRibuan(this); renderKeranjangPOS()" class="w-28 bg-slate-800 border border-slate-600 focus:border-orange-500 text-right p-1.5 rounded outline-none text-orange-400 font-black"></div>
                    <div class="flex justify-between text-xs text-red-400 font-bold mb-2 pt-1 items-center"><span>Pajak PPN:</span><span id="pos-pajak-rp">+ Rp 0</span></div>
                    <p class="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest mt-2">Total Tagihan</p>
                    <p class="font-black text-3xl md:text-4xl tracking-tight text-emerald-400" id="pos-total-rp">Rp 0</p>
                </div> 

                <label class="flex items-center gap-2 mb-3 cursor-pointer bg-orange-50 border border-orange-100 p-3 rounded-xl"><input type="checkbox" id="pos-is-so" onchange="toggleDP(this.checked)" class="w-4 h-4 rounded text-orange-600"><span class="text-xs font-bold text-orange-700">Tandai sbg Pre-Order (PO)</span></label> 
                <div id="area-dp" class="hidden mb-6 bg-orange-100 p-4 rounded-xl border border-orange-200">
                    <div class="flex justify-between items-center text-xs text-orange-800 font-bold mb-2"><span>Uang Muka / DP (Rp):</span><input type="text" inputmode="numeric" id="pos-input-dp" value="0" onkeyup="formatInputRibuan(this); renderKeranjangPOS()" onchange="formatInputRibuan(this); renderKeranjangPOS()" class="w-28 bg-white border border-orange-300 focus:border-orange-500 text-right p-1.5 rounded outline-none font-black text-orange-600"></div>
                    <div class="flex justify-between items-center text-xs text-red-600 font-black pt-2 border-t border-orange-200"><span>Sisa Tagihan:</span><span id="pos-sisa-rp">Rp 0</span></div>
                </div>

                <p class="text-[10px] font-bold text-slate-400 mb-2 uppercase">Metode Pembayaran</p> 
                <div id="area-metode-single" class="grid grid-cols-2 gap-2 mb-3">
                    ${btnMetodeHtml}
                </div> 

                <!-- TAMBAHAN: SPLIT PAYMENT LEASING/GABUNGAN -->
                <label class="flex items-center gap-2 mb-4 cursor-pointer p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-sm">
                    <input type="checkbox" id="pos-is-split" onchange="toggleSplitPayment(this.checked)" class="w-4 h-4 rounded text-blue-600">
                    <span class="text-xs font-black text-slate-700">Split Payment / Leasing (2 Metode)</span>
                </label>

                <div id="area-split-payment" class="hidden mb-4 p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-3 shadow-inner">
                    <p class="text-[10px] font-black text-blue-800 uppercase tracking-widest border-b border-blue-200 pb-1">Pembayaran 1 (Tunai / TF / QRIS)</p>
                    <div class="flex gap-2 items-center">
                        <select id="split-m1" class="w-1/2 border border-blue-300 p-2.5 rounded-lg font-bold text-xs outline-none bg-white focus:border-blue-500">${optMetode1Html}</select>
                        <input type="text" inputmode="numeric" id="split-n1" onkeyup="formatInputRibuan(this); hitungSplitPOS()" placeholder="Rp Nominal 1" class="w-1/2 border border-blue-300 p-2.5 rounded-lg font-black text-xs text-right outline-none bg-white focus:border-blue-500">
                    </div>
                    <p class="text-[10px] font-black text-blue-800 uppercase tracking-widest border-b border-blue-200 pb-1 mt-2">Pembayaran 2 (Khusus Leasing)</p>
                    <div class="flex gap-2 items-center">
                        <select id="split-m2" class="w-1/2 border border-blue-300 p-2.5 rounded-lg font-bold text-xs outline-none bg-white focus:border-blue-500">${optMetode2Html}</select>
                        <input type="text" inputmode="numeric" id="split-n2" onkeyup="formatInputRibuan(this); hitungSplitPOS()" placeholder="Rp Nominal 2" class="w-1/2 border border-blue-300 p-2.5 rounded-lg font-black text-xs text-right outline-none bg-white focus:border-blue-500">
                    </div>
                    <p id="split-err" class="hidden text-[10px] text-red-500 font-bold bg-red-100 p-1.5 rounded mt-2 text-center border border-red-200"></p>
                    <p id="split-info" class="hidden text-[10px] text-emerald-600 font-bold bg-emerald-100 p-1.5 rounded mt-2 text-center border border-emerald-200"></p>
                </div>

                <button id="btn-show-qris" onclick="tampilkanQrisBayar()" class="hidden w-full border-2 border-emerald-500 text-emerald-600 font-bold py-2.5 rounded-xl mb-3 hover:bg-emerald-50 transition"><i class="fa-solid fa-qrcode mr-2"></i> Tampilkan QRIS</button> 
                
                <div id="area-bayar" class="mt-auto"><button onclick="prosesCheckoutPOS()" id="btn-checkout" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg transition text-base"><i class="fa-solid fa-check-circle mr-2"></i> BAYAR SEKARANG</button></div> 
                <div id="area-setelah-bayar" class="hidden mt-auto flex-col gap-2">
                    <button onclick="cetakUlangStruk()" class="w-full bg-blue-500 text-white font-black py-3 rounded-xl shadow-md transition hover:bg-blue-600"><i class="fa-solid fa-print mr-2"></i> Cetak Struk</button>
                    <button onclick="salinTeksStruk()" class="w-full bg-indigo-50 text-indigo-700 font-black py-3 rounded-xl shadow-md transition hover:bg-indigo-100"><i class="fa-solid fa-copy text-lg mr-2"></i> Salin Struk</button>
                    <button onclick="bukaModalWA()" class="w-full bg-emerald-500 text-white font-black py-3 rounded-xl shadow-md transition hover:bg-emerald-600"><i class="fa-brands fa-whatsapp text-lg mr-2"></i> Kirim WhatsApp</button>
                    <button onclick="resetKasir()" class="w-full bg-slate-200 text-slate-700 font-black py-3 rounded-xl mt-3 shadow transition hover:bg-slate-300"><i class="fa-solid fa-rotate-right mr-2"></i> Transaksi Baru</button>
                </div> 
            </div> 
        </div> 
    </div> 
    <div id="modal-cari-pos" class="fixed inset-0 bg-black/60 z-50 hidden items-center justify-center p-4"><div class="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden shadow-2xl"><div class="p-4 border-b flex justify-between items-center"><h3 class="font-black text-lg">Pilih Produk</h3><button onclick="document.getElementById('modal-cari-pos').classList.add('hidden')" class="text-red-500"><i class="fa-solid fa-xmark text-xl"></i></button></div><div class="p-4"><input type="text" id="pos-cari-input" onkeyup="renderListCariPOS()" class="w-full border p-3 rounded-xl font-bold bg-slate-50 outline-none focus:border-blue-500" placeholder="Ketik nama produk..."></div><div id="pos-hasil-cari" class="flex-1 overflow-y-auto p-2 space-y-2"></div></div></div> `; 
}

function toggleSplitPayment(isChecked) {
    state.isSplitPayment = isChecked;
    if(isChecked) {
        document.getElementById('area-metode-single').classList.add('hidden');
        document.getElementById('area-split-payment').classList.remove('hidden');
        document.getElementById('btn-show-qris').classList.add('hidden'); 
        hitungSplitPOS();
    } else {
        document.getElementById('area-metode-single').classList.remove('hidden');
        document.getElementById('area-split-payment').classList.add('hidden');
        pilihMetodePOS(state.metodeBayar); 
    }
}

function hitungSplitPOS() {
    if(!state.isSplitPayment) return;
    let totalAsli = state.isSO ? state.posTemp.dp : state.posTemp.total_akhir; 
    let val1 = parseAngka(document.getElementById('split-n1').value);
    let val2 = parseAngka(document.getElementById('split-n2').value);
    
    let err = document.getElementById('split-err');
    let info = document.getElementById('split-info');
    
    let totalSplit = val1 + val2;

    if (totalSplit < totalAsli && totalSplit > 0) {
        err.innerText = "Nominal Split KURANG dari Tagihan (" + formatRp(totalAsli) + ")";
        err.classList.remove('hidden');
        info.classList.add('hidden');
    } else if (totalSplit > totalAsli) {
        let margin = totalSplit - totalAsli;
        info.innerHTML = `<i class="fa-solid fa-circle-info"></i> Terdapat penambahan DP (Uang Muka): <br><b>+ ${formatRp(margin)}</b>`;
        info.classList.remove('hidden');
        err.classList.add('hidden');
    } else {
        err.classList.add('hidden');
        info.classList.add('hidden');
    }
}

// LOGIKA BARU UNTUK CUSTOM DROPDOWN PELANGGAN KASIR
function setPilihanPelanggan() { 
    if(!document.getElementById('pos-plg-list')) return; 
    window.tempDataPelanggan = state.data.pelanggan || [];
    renderListPelangganPOS(window.tempDataPelanggan);
}

function renderListPelangganPOS(data) {
    let html = `<div onclick="pilihPelangganPOS('UMUM', 'Pelanggan UMUM')" class="p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition flex justify-between items-center"><span class="font-bold text-sm text-slate-800">Pelanggan UMUM</span><span class="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">UMUM</span></div>`; 
    if(data && data.length > 0) { 
        data.forEach(p => { 
            let nama = p.Nama_Pelanggan;
            let id = p.ID_Pelanggan;
            html += `<div onclick="pilihPelangganPOS('${id}', '${nama}')" class="p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition flex justify-between items-center group">
                <span class="font-bold text-sm text-slate-700 truncate pr-2 group-hover:text-blue-700">${nama}</span>
                <span class="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 group-hover:text-blue-600 group-hover:border-blue-200 shrink-0">${id}</span>
            </div>`; 
        }); 
    } 
    document.getElementById('pos-plg-list').innerHTML = html; 
}

function togglePlgDropdown() {
    let drop = document.getElementById('pos-plg-dropdown');
    let overlay = document.getElementById('pos-plg-overlay');
    let search = document.getElementById('pos-plg-search');
    if(drop.classList.contains('hidden')) {
        drop.classList.replace('hidden', 'flex');
        overlay.classList.remove('hidden');
        search.value = "";
        renderListPelangganPOS(window.tempDataPelanggan);
        setTimeout(() => search.focus(), 100);
    } else {
        drop.classList.replace('flex', 'hidden');
        overlay.classList.add('hidden');
    }
}

function filterListPelanggan() {
    let val = document.getElementById('pos-plg-search').value.toLowerCase().trim();
    if(!val) {
        renderListPelangganPOS(window.tempDataPelanggan);
        return;
    }
    let fData = window.tempDataPelanggan.filter(p => 
        String(p.Nama_Pelanggan).toLowerCase().includes(val) || 
        String(p.ID_Pelanggan).toLowerCase().includes(val)
    );
    renderListPelangganPOS(fData);
}

function pilihPelangganPOS(id, nama) {
    document.getElementById('pos-pelanggan').value = id;
    document.getElementById('pos-plg-label').innerText = nama;
    togglePlgDropdown();
}

function pilihMetodePOS(m) { 
    state.metodeBayar = m; 
    document.querySelectorAll('.btn-metode-pos').forEach(b => {
        b.className = "btn-metode-pos py-2.5 rounded-lg border-2 border-slate-100 text-slate-500 font-bold text-xs transition uppercase";
    });
    let safeId = m.replace(/[^a-zA-Z0-9]/g, '_');
    let sel = document.getElementById('btn-m-' + safeId); 
    if(sel) sel.className = "btn-metode-pos py-2.5 rounded-lg border-2 border-blue-600 bg-blue-50 text-blue-700 font-bold text-xs transition uppercase"; 
    
    if (m.toUpperCase().includes('QRIS') && !state.isSplitPayment) { 
        document.getElementById('btn-show-qris').classList.remove('hidden'); 
    } else { 
        document.getElementById('btn-show-qris').classList.add('hidden'); 
    } 
}

function toggleDP(isChecked) {
    state.isSO = isChecked;
    if(isChecked) {
        document.getElementById('area-dp').classList.remove('hidden');
    } else {
        document.getElementById('area-dp').classList.add('hidden');
        if(document.getElementById('pos-input-dp')) document.getElementById('pos-input-dp').value = "0";
    }
    renderKeranjangPOS();
}

function handleBarcodePOS(e) { 
    if(e.key === "Enter") { 
        let val = document.getElementById('pos-barcode').value.trim(); 
        if(!val) return; 
        let prdList = state.data.produk.filter(p => String(p.Barcode) === val || String(p.ID_Produk) === val); 
        let prd = null;
        if(prdList.length > 0) prd = prdList.find(p => parseFloat(p.Stok_Saat_Ini) > 0) || prdList[0];
        let errEl = document.getElementById('pos-error'); 
        if(prd) { 
            errEl.classList.add('hidden'); 
            eksekusiTambahKeranjang(prd); 
        } else { 
            errEl.innerText = "Barcode tidak ditemukan atau Stok Kosong!"; 
            errEl.classList.remove('hidden'); 
        } 
        document.getElementById('pos-barcode').value = ""; 
    } 
}
function cariManualPOS() { document.getElementById('modal-cari-pos').classList.remove('hidden'); renderListCariPOS(); }
function renderListCariPOS() { 
    let val = document.getElementById('pos-cari-input').value.toLowerCase(); 
    let html = ""; 
    state.data.produk.forEach(p => { 
        let nm = String(p.Nama_Produk || "").toLowerCase();
        let id = String(p.ID_Produk || "").toLowerCase();
        let bc = String(p.Barcode || "").toLowerCase();
        if(nm.includes(val) || id.includes(val) || bc.includes(val)) { 
            let disabled = (!state.isSO && parseFloat(p.Stok_Saat_Ini) <= 0) ? "opacity-50 pointer-events-none" : ""; 
            let stokTeks = (parseFloat(p.Stok_Saat_Ini) <= 0) ? '<span class="text-red-500">Habis</span>' : p.Stok_Saat_Ini; 
            let badgeCabang = String(state.role).toUpperCase().includes('SUPERADMIN') ? `<span class="text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded ml-1">${p.Cabang||'Pusat'}</span>` : '';
            
            let infoImei = p.Barcode && p.Barcode !== '-' ? `<span class="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded mr-1 inline-block mt-1 font-mono"><i class="fa-solid fa-barcode text-slate-400 mr-1"></i>${p.Barcode}</span>` : '';
            let infoWarna = p.Warna && p.Warna !== '-' ? `<span class="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded mr-1 inline-block mt-1"><i class="fa-solid fa-palette text-slate-400 mr-1"></i>${p.Warna}</span>` : '';

            html += `<div onclick="eksekusiTambahKeranjangDariManual('${p.ID_Produk}')" class="p-3 border rounded-xl flex justify-between items-center cursor-pointer hover:bg-blue-50 transition ${disabled}">
                <div class="flex-1 pr-2">
                    <p class="font-bold text-sm text-slate-800 leading-tight">${p.Nama_Produk} ${badgeCabang}</p>
                    <div>${infoImei}${infoWarna}</div>
                    <p class="text-[10px] font-bold text-slate-500 mt-1.5">Stok: ${stokTeks}</p>
                </div>
                <div class="font-black text-blue-600 whitespace-nowrap">${formatRp(p.Harga_Jual)}</div>
            </div>`; 
        } 
    }); 
    document.getElementById('pos-hasil-cari').innerHTML = html; 
}

function eksekusiTambahKeranjangDariManual(id) { let prd = state.data.produk.find(p => String(p.ID_Produk) === id); if(prd) eksekusiTambahKeranjang(prd); document.getElementById('modal-cari-pos').classList.add('hidden'); }

function eksekusiTambahKeranjang(prd) { 
    let idx = state.keranjangPOS.findIndex(x => String(x.id_produk) === String(prd.ID_Produk)); 
    if(idx > -1) { 
        if(!state.isSO && state.keranjangPOS[idx].qty >= parseFloat(prd.Stok_Saat_Ini)) { document.getElementById('pos-error').innerText = `Stok tersisa ${prd.Stok_Saat_Ini}!`; document.getElementById('pos-error').classList.remove('hidden'); return; } 
        state.keranjangPOS[idx].qty += 1; state.keranjangPOS[idx].total = state.keranjangPOS[idx].qty * state.keranjangPOS[idx].harga; 
    } else { 
        if(!state.isSO && parseFloat(prd.Stok_Saat_Ini) <= 0) { document.getElementById('pos-error').innerText = `Gagal! Stok ${prd.Nama_Produk} kosong / sudah terjual! Centang PO dulu.`; document.getElementById('pos-error').classList.remove('hidden'); return; } 
        
        state.keranjangPOS.push({ 
            id_produk: prd.ID_Produk, 
            nama: prd.Nama_Produk, 
            harga: parseFloat(prd.Harga_Jual), 
            qty: 1, 
            total: parseFloat(prd.Harga_Jual),
            barcode: prd.Barcode,
            warna: prd.Warna
        }); 
    } 
    document.getElementById('pos-error').classList.add('hidden'); renderKeranjangPOS(); 
}

function ubahQtyPOS(idx, aksi) { if(aksi==='+') { let prd = state.data.produk.find(x => String(x.ID_Produk) === String(state.keranjangPOS[idx].id_produk)); if(!state.isSO && state.keranjangPOS[idx].qty >= parseFloat(prd.Stok_Saat_Ini)) return; state.keranjangPOS[idx].qty++; } else { state.keranjangPOS[idx].qty--; if(state.keranjangPOS[idx].qty <= 0) state.keranjangPOS.splice(idx, 1); } if(state.keranjangPOS[idx]) { state.keranjangPOS[idx].total = state.keranjangPOS[idx].qty * state.keranjangPOS[idx].harga; } renderKeranjangPOS(); }

function renderKeranjangPOS() { 
  let list = document.getElementById('pos-cart-list'); let subtotal = 0; let jml = 0; let html = ""; 
  if(state.keranjangPOS.length === 0) { list.innerHTML = `<div class="text-center py-10 text-slate-300"><i class="fa-solid fa-cart-shopping text-5xl mb-3"></i><p class="font-bold text-sm">Keranjang Kosong</p></div>`; } 
  else { 
    state.keranjangPOS.forEach((k, i) => { 
        subtotal += k.total; jml += k.qty; 
        
        let detailK = "";
        if(k.barcode && k.barcode !== '-') detailK += ` | ${k.barcode}`;
        if(k.warna && k.warna !== '-') detailK += ` | ${k.warna}`;
        let textDetail = detailK !== "" ? `<p class="text-[9px] font-mono text-slate-400 mt-0.5 truncate w-32 md:w-48">${detailK.substring(3)}</p>` : "";
        
        html += `<div class="bg-white border rounded-xl p-3 flex justify-between items-center shadow-sm mb-2">
            <div class="flex-1">
                <p class="font-bold text-sm text-slate-700 truncate w-32 md:w-48">${k.nama}</p>
                ${textDetail}
                <p class="text-[10px] font-bold text-slate-500 mt-1">${formatRp(k.harga)}</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                    <button onclick="ubahQtyPOS(${i}, '-')" class="px-2 py-1 text-slate-500 hover:bg-slate-200 transition"><i class="fa-solid fa-minus text-[10px]"></i></button>
                    <span class="text-xs font-black w-6 text-center">${k.qty}</span>
                    <button onclick="ubahQtyPOS(${i}, '+')" class="px-2 py-1 text-slate-500 hover:bg-slate-200 transition"><i class="fa-solid fa-plus text-[10px]"></i></button>
                </div>
                <p class="font-black text-sm text-blue-600 w-20 text-right">${formatRp(k.total)}</p>
            </div>
        </div>`; 
    }); 
    list.innerHTML = html; 
  } 
  
  let elDiskon = document.getElementById('pos-input-diskon');
  let diskonNominal = elDiskon ? parseAngka(elDiskon.value) : 0;
  if(diskonNominal > subtotal) { diskonNominal = subtotal; if(elDiskon) elDiskon.value = diskonNominal.toLocaleString('id-ID'); } 
  
  let subtotalSetelahDiskon = subtotal - diskonNominal;
  let pajakPersen = parseFloat(localStorage.getItem('sanstech_pajak') || 0); 
  let pajakNominal = subtotalSetelahDiskon * (pajakPersen / 100); 
  let grandTotal = subtotalSetelahDiskon + pajakNominal;
  
  let elDP = document.getElementById('pos-input-dp');
  let dpNominal = (state.isSO && elDP) ? parseAngka(elDP.value) : 0;
  if(dpNominal > grandTotal) { dpNominal = grandTotal; if(elDP) elDP.value = dpNominal.toLocaleString('id-ID'); }
  let sisaTagihan = state.isSO ? (grandTotal - dpNominal) : 0;
  if(document.getElementById('pos-sisa-rp')) document.getElementById('pos-sisa-rp').innerText = formatRp(sisaTagihan);

  document.getElementById('pos-subtotal-rp').innerText = formatRp(subtotal); 
  document.getElementById('pos-pajak-rp').innerText = "+ " + formatRp(pajakNominal); 
  document.getElementById('pos-total-rp').innerText = formatRp(grandTotal); 
  document.getElementById('pos-jml-item').innerText = jml; 
  
  state.posTemp = { subtotal: subtotal, diskon: diskonNominal, pajak: pajakNominal, total_akhir: grandTotal, dp: dpNominal, sisa: sisaTagihan };
  
  hitungSplitPOS(); 
}

function tampilkanQrisBayar() { let tot = state.isSO ? state.posTemp.dp : state.posTemp.total_akhir; document.getElementById('qris-total-bayar').innerText = formatRp(tot); let qrisSaved = localStorage.getItem('sanstech_qris_image'); if(qrisSaved) { document.getElementById('qris-tampil-bayar').src = qrisSaved; document.getElementById('qris-tampil-bayar').classList.remove('hidden'); document.getElementById('qris-belum-diatur').classList.add('hidden'); } else { document.getElementById('qris-tampil-bayar').classList.add('hidden'); document.getElementById('qris-belum-diatur').classList.remove('hidden'); } document.getElementById('modal-qris-bayar').style.display='flex'; }

function resetKasir() { 
    if(document.getElementById('pos-input-diskon')) document.getElementById('pos-input-diskon').value = "0";
    if(document.getElementById('pos-input-dp')) document.getElementById('pos-input-dp').value = "0";
    pilihMetodePOS("Tunai"); 
    if(document.getElementById('pos-is-so')) { document.getElementById('pos-is-so').checked = false; toggleDP(false); } 
    if(document.getElementById('pos-is-split')) { document.getElementById('pos-is-split').checked = false; toggleSplitPayment(false); document.getElementById('split-n1').value = ""; document.getElementById('split-n2').value = ""; }
    
    state.keranjangPOS = []; 
    renderKeranjangPOS(); 
    
    if(document.getElementById('pos-pelanggan')) document.getElementById('pos-pelanggan').value = "UMUM";
    if(document.getElementById('pos-plg-label')) document.getElementById('pos-plg-label').innerText = "Pelanggan UMUM";

    document.getElementById('area-setelah-bayar').classList.replace('flex','hidden'); 
    document.getElementById('area-bayar').classList.remove('hidden'); 
    document.getElementById('pos-barcode').focus(); 
}
function cetakUlangStruk() { if(lastInvoice) jalankanCetakStruk(lastInvoice, state.posTemp.total_akhir); }
function bukaModalWA() { document.getElementById('input-wa-pelanggan').value = ""; document.getElementById('modal-wa').classList.replace('hidden','flex'); }

function eksekusiKirimWA() { 
    let hp = document.getElementById('input-wa-pelanggan').value.trim(); 
    if(!hp) return showInlineNotif('error', 'Nomor WA wajib diisi!'); 
    if(hp.startsWith('0')) hp = '62' + hp.substring(1); 
    let defaultTemplate = "*[NAMA_TOKO]*\n--------------------\n*INVOICE:* [INVOICE]\n*TOTAL TAGIHAN:* [TOTAL]\n*METODE:* [METODE]\n--------------------\nTerima kasih!"; 
    let template = localStorage.getItem('sanstech_wa_template') || defaultTemplate; 
    let namaToko = localStorage.getItem('sanstech_nama_toko') || "BLANGKON ERP"; 
    if(state.cabang && String(state.cabang).toUpperCase() !== 'PUSAT') {
        if(namaToko.toUpperCase().includes('PUSAT')) { namaToko = namaToko.replace(/PUSAT/i, state.cabang.toUpperCase()); } 
        else { namaToko = namaToko + " " + state.cabang.toUpperCase(); }
    }
    let mtd = window.lastPrintedMetode || "Tunai";
    let teks = template.replace('[NAMA_TOKO]', namaToko).replace('[INVOICE]', lastInvoice).replace('[TOTAL]', formatRp(lastTotal)).replace('[METODE]', mtd); 
    window.open(`https://wa.me/${hp}?text=${encodeURIComponent(teks)}`, '_blank'); 
    document.getElementById('modal-wa').classList.replace('flex','hidden'); 
}

function salinTeksStruk() { 
    let namaToko = localStorage.getItem('sanstech_nama_toko') || "BLANGKON ERP"; 
    if(state.cabang && String(state.cabang).toUpperCase() !== 'PUSAT') {
        if(namaToko.toUpperCase().includes('PUSAT')) { namaToko = namaToko.replace(/PUSAT/i, state.cabang.toUpperCase()); } 
        else { namaToko = namaToko + " " + state.cabang.toUpperCase(); }
    }
    let mtd = window.lastPrintedMetode || "Tunai";
    let teks = `*${namaToko}*\n--------------------\n*INV:* ${lastInvoice}\n*TOTAL:* ${formatRp(lastTotal)}\n*METODE:* ${mtd}\n--------------------\nTerima kasih!`; 
    navigator.clipboard.writeText(teks).then(() => { showInlineNotif('success', 'Teks Struk Berhasil Disalin!'); }).catch(err => { showInlineNotif('error', 'Gagal Salin Teks!'); }); 
}

async function prosesCheckoutPOS() { 
    if(state.keranjangPOS.length === 0) return showInlineNotif('error', 'Keranjang kosong!'); 
    let plgId = document.getElementById('pos-pelanggan').value; 
    let totalNominal = state.posTemp.total_akhir; 
    
    let finalMetode = state.metodeBayar;
    let marginLeasing = 0;

    if(state.isSplitPayment) {
        let totalAsli = state.isSO ? state.posTemp.dp : state.posTemp.total_akhir;
        let v1 = parseAngka(document.getElementById('split-n1').value);
        let v2 = parseAngka(document.getElementById('split-n2').value);
        let m1 = document.getElementById('split-m1').value;
        let m2 = document.getElementById('split-m2').value;
        
        if(!m1 || !m2) return showInlineNotif('error', 'Pilih 2 metode bayar untuk Split Payment!');
        let totalSplit = v1 + v2;
        
        if(totalSplit < totalAsli) return showInlineNotif('error', 'Nominal Split KURANG dari tagihan!');
        if(v1 <= 0 || v2 <= 0) return showInlineNotif('error', 'Kedua nominal split harus diisi!');
        
        finalMetode = `${m1} (${formatRp(v1)}) & ${m2} (${formatRp(v2)})`;
        
        if(!state.isSO) {
            marginLeasing = totalSplit - totalAsli;
            totalNominal = totalSplit; // e.g. 2,200,000
            state.posTemp.admin_leasing = marginLeasing;
        } else {
            state.posTemp.dp = totalSplit;
            marginLeasing = totalSplit - totalAsli;
            state.posTemp.admin_leasing = marginLeasing;
        }
    } else {
        state.posTemp.admin_leasing = 0;
    }

    let btn = document.getElementById('btn-checkout'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> MEMPROSES...'; btn.disabled = true; 
    
    let payload = { keranjang: state.keranjangPOS, subtotal: state.posTemp.subtotal, diskon: state.posTemp.diskon, pajak: state.posTemp.pajak, total_akhir: totalNominal, metode: finalMetode, id_pelanggan: plgId, kasir: state.user, is_so: state.isSO, dp: state.posTemp.dp, sisa: state.posTemp.sisa, cabang: state.cabang }; 
    
    let res = await requestAPIWithAuth('prosesTransaksiPOS', payload);
    if(res.status) { 
        showInlineNotif('success', `Berhasil! Nota: ${res.invoice}`); lastInvoice = res.invoice; lastTotal = totalNominal; 
        
        window.lastPrintedItems = JSON.parse(JSON.stringify(state.keranjangPOS));
        window.lastPrintedTemp = JSON.parse(JSON.stringify(state.posTemp));
        window.lastPrintedMetode = finalMetode;
        window.lastPrintedSO = state.isSO;

        let now = new Date(); let localTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().substring(0, 19).replace('T', ' '); 
        
        state.data.penjualan.push({ ID_Invoice: res.invoice, Waktu: localTime, ID_Pelanggan: plgId || "UMUM", Subtotal: state.posTemp.subtotal, Diskon: state.posTemp.diskon, Pajak: state.posTemp.pajak, Total_Akhir: totalNominal, Metode_Pembayaran: finalMetode, Status: state.isSO ? 'SO/PESANAN' : 'LUNAS', Kasir: state.user, Cabang: state.cabang, DP: state.posTemp.dp, Sisa_Tagihan: state.posTemp.sisa }); 
        state.keranjangPOS.forEach(k => {
            state.data.penjualan_detail.push({
                ID_Detail: "DET" + Math.floor(Math.random() * 100000), ID_Invoice: res.invoice, ID_Produk: k.id_produk,
                Harga_Satuan: k.harga, Qty: k.qty, Total_Harga: k.total, Cabang: state.cabang
            });
        });
        if(!state.isSO) { state.keranjangPOS.forEach(k => { let idx = state.data.produk.findIndex(p => p.ID_Produk === k.id_produk); if(idx > -1) state.data.produk[idx].Stok_Saat_Ini = parseFloat(state.data.produk[idx].Stok_Saat_Ini) - k.qty; }); } 
        
        // Kosongkan keranjang di background biar tidak didouble-click
        state.keranjangPOS = []; 
        renderKeranjangPOS();

        document.getElementById('area-bayar').classList.add('hidden'); document.getElementById('area-setelah-bayar').classList.replace('hidden','flex'); 
        btn.innerHTML = '<i class="fa-solid fa-check-circle mr-2"></i> BAYAR SEKARANG'; btn.disabled = false; 
        syncDataLiveBackground(); jalankanCetakStruk(res.invoice, totalNominal); 
    } else { showInlineNotif('error', res.msg); btn.innerHTML = '<i class="fa-solid fa-check-circle mr-2"></i> BAYAR SEKARANG'; btn.disabled = false; } 
}

async function jalankanCetakStruk(invoice, totAkhir) { 
  let itemsPrint = window.lastPrintedItems || [];
  let tempPrint = window.lastPrintedTemp || {};
  let metodePrint = window.lastPrintedMetode || "Tunai";
  let soPrint = window.lastPrintedSO || false;

  let subtotalPrint = tempPrint.subtotal || 0; 
  let diskonPrint = tempPrint.diskon || 0;
  let pajakPrint = tempPrint.pajak || 0;
  
  let namaToko = localStorage.getItem('sanstech_nama_toko') || "BLANGKON ERP"; 
  if(state.cabang && String(state.cabang).toUpperCase() !== 'PUSAT') {
      if(namaToko.toUpperCase().includes('PUSAT')) { namaToko = namaToko.replace(/PUSAT/i, state.cabang.toUpperCase()); } 
      else { namaToko = namaToko + " " + state.cabang.toUpperCase(); }
  }
  let headerToko = localStorage.getItem('sanstech_struk_header') || ""; 
  let footerToko = localStorage.getItem('sanstech_struk_footer') || "Terima Kasih"; 
  
  let namaPelangganPrint = document.getElementById('pos-plg-label') ? document.getElementById('pos-plg-label').innerText : "UMUM";

  if (btCharacteristic) {
      let teks = `\n${namaToko}\n`;
      if (headerToko) teks += `${headerToko}\n`;
      teks += `--------------------------------\nINV: ${invoice}\nTgl: ${new Date().toLocaleString('id-ID')}\n--------------------------------\n`;
      itemsPrint.forEach(i => { teks += `${i.nama}\n${i.qty}x ${i.harga} = ${i.total}\n`; });
      teks += `--------------------------------\nSubtotal: ${formatRp(subtotalPrint)}\n`;
      if(diskonPrint > 0) teks += `Diskon: -${formatRp(diskonPrint)}\n`;
      if(pajakPrint > 0) teks += `Pajak PPN: +${formatRp(pajakPrint)}\n`;
      
      // DIUBAH MENJADI DP (UANG MUKA) UNTUK STRUK BLUETOOTH
      if(tempPrint.admin_leasing > 0) teks += `DP (Uang Muka): +${formatRp(tempPrint.admin_leasing)}\n`;
      
      teks += `TOTAL: ${formatRp(totAkhir)}\nBayar: ${metodePrint}\n`;
      if(soPrint) { teks += `DP Masuk: ${formatRp(tempPrint.dp)}\nSISA HUTANG: ${formatRp(tempPrint.sisa)}\n`; }
      teks += `--------------------------------\n${footerToko}\n\n\n\n`;
      let hasil = await cetakStrukBluetooth(teks);
      if(hasil) showInlineNotif('success', 'Struk Tercetak via Bluetooth!');
      return; 
  }
  let iframe = document.getElementById('print-iframe'); 
  let doc = iframe.contentWindow.document; 
  let title = soPrint ? "NOTA PRE-ORDER (PO)" : "Struk Pembayaran"; 
  let alamatToko = localStorage.getItem('sanstech_alamat_toko') || "Sistem ERP Distributor"; 
  let html = `<html><head><style>@page{margin:0;} body{font-family:monospace; color:black; font-size:11px; width:58mm; padding:2mm; margin:0;} .garis{border-bottom: 1px dashed black; margin: 4px 0;}</style></head><body>`; 
  html += `<div style="text-align:center;"><b style="font-size:14px;">${namaToko}</b><br>${alamatToko}`; if(headerToko) html += `<br>${headerToko}`; html += `<br><br><b>${title}</b><br><div class="garis"></div></div>`;
  html += `<div>No: ${invoice}<br>Tgl: ${new Date().toLocaleString('id-ID')}<br>Ksr: ${state.user}<br>Plg: ${namaPelangganPrint}<br></div>`;
  html += `<div class="garis"></div><table style="width:100%; border-collapse:collapse;">`; 
  itemsPrint.forEach(i => { html += `<tr><td colspan="3" style="padding-top:2px;"><b>${i.nama}</b></td></tr><tr><td>${i.qty}x</td><td>${i.harga.toLocaleString('id-ID')}</td><td style="text-align:right;">${i.total.toLocaleString('id-ID')}</td></tr>`; }); 
  html += `</table><div class="garis"></div><div style="text-align:right;">Subtotal: ${formatRp(subtotalPrint)}<br>`;
  if(diskonPrint > 0) html += `Diskon: -${formatRp(diskonPrint)}<br>`;
  if(pajakPrint > 0) html += `Pajak PPN: +${formatRp(pajakPrint)}<br>`;
  
  // DIUBAH MENJADI DP (UANG MUKA) UNTUK CETAK KERTAS PRINTER
  if(tempPrint.admin_leasing > 0) html += `DP (Uang Muka): +${formatRp(tempPrint.admin_leasing)}<br>`;
  
  html += `<b>TOTAL: ${formatRp(totAkhir)}</b><br>Bayar: ${metodePrint}<br>`;
  if(soPrint) { html += `DP Masuk: ${formatRp(tempPrint.dp)}<br><b>SISA TAGIHAN: ${formatRp(tempPrint.sisa)}</b><br>`; }
  html += `</div><div class="garis"></div><div style="text-align:center; margin-top:10px;">${footerToko}</div></body></html>`; 
  doc.open(); doc.write(html); doc.close(); 
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 500); 
}
// ====================================================================
// VIEW & FUNGSI: PENJUALAN / SO
// ====================================================================
function viewPenjualan() { return ` 
<div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative"> 
    <div class="flex justify-between items-center mb-6">
        <h3 class="font-black text-lg text-slate-800">Manajemen Penjualan</h3> 
        <button onclick="exportDataCSV('penjualan')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs flex items-center"><i class="fa-solid fa-file-excel mr-2"></i> Export Data</button>
    </div>
    <div class="flex gap-4 border-b-2 border-slate-200 mb-6 font-bold text-sm overflow-x-auto"><div class="tab-custom active" id="tab-pj-riwayat" onclick="gantiTabPenjualan('riwayat')">Riwayat Transaksi</div><div class="tab-custom" id="tab-pj-so" onclick="gantiTabPenjualan('so')">Pre-Order Pelanggan (SO)</div></div> 
    
    <div id="konten-pj-riwayat" class="flex-1 flex flex-col">
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5 flex flex-wrap gap-4 items-end">
            <div><label class="text-[10px] font-bold text-slate-500 uppercase">Dari Tanggal</label><br><input type="date" id="filter-start" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500"></div>
            <div><label class="text-[10px] font-bold text-slate-500 uppercase">Sampai Tanggal</label><br><input type="date" id="filter-end" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500"></div>
            <button onclick="filterRiwayat()" class="bg-blue-600 hover:bg-blue-700 transition text-white px-5 py-2.5 rounded-lg font-bold shadow-md"><i class="fa-solid fa-filter mr-2"></i>Filter</button>
            
            <!-- TAMBAHAN: KOLOM CARI CEPAT INVOICE/PELANGGAN -->
            <div class="flex-1 min-w-[200px]"><label class="text-[10px] font-bold text-slate-500 uppercase">Cari Cepat (Abaikan Tanggal)</label><br><input type="text" id="filter-search-pj" onkeyup="filterRiwayat()" placeholder="Ketik No. INV atau Nama Pelanggan..." class="w-full border border-slate-300 p-2 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500 shadow-sm"></div>
        </div>
        <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table class="w-full text-left min-w-[800px]"><thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 shadow-sm z-10"><tr><th class="p-4 pl-6">Invoice</th><th class="p-4">Waktu & Customer</th><th class="p-4">Metode / Kasir</th><th class="p-4">Total Akhir</th><th class="p-4">Status</th><th class="p-4 pr-6 text-center">Aksi</th></tr></thead><tbody id="tabel-riwayat-body" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody></table>
        </div>
    </div> 
    
    <div id="konten-pj-so" class="hidden flex-1 flex flex-col"><div class="bg-orange-50 text-orange-800 p-4 rounded-xl mb-5 text-xs font-bold border border-orange-200">Menampilkan seluruh transaksi Kasir yang ditandai sebagai <b>Pre-Order Pelanggan (SO)</b>. Stok fisik belum dipotong.</div><div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white"><table class="w-full text-left min-w-[900px]"><thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 shadow-sm z-10"><tr><th class="p-4 pl-6">Invoice SO</th><th class="p-4">Waktu & Customer</th><th class="p-4">Detail Pembayaran</th><th class="p-4">Status</th><th class="p-4 pr-6 text-center">Aksi</th></tr></thead><tbody id="tabel-so-body" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody></table></div></div> 
    
    <!-- MODAL PELUNASAN SO -->
    <div id="modal-lunas-so" class="fixed inset-0 bg-black/60 z-[105] hidden items-center justify-center p-5">
       <div class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col text-center">
         <div class="text-4xl mb-4 text-emerald-500"><i class="fa-solid fa-hand-holding-dollar"></i></div>
         <h3 class="font-black text-xl mb-2 text-slate-800">Pelunasan Pre-Order</h3>
         <p class="text-sm text-slate-500 mb-2">Invoice: <span id="lunas-inv" class="font-bold text-blue-600"></span></p>
         <div class="bg-red-50 p-4 rounded-xl mb-4">
             <p class="text-[10px] font-bold text-red-500 uppercase">Sisa Tagihan Konsumen</p>
             <p class="text-2xl font-black text-red-600" id="lunas-sisa-rp">Rp 0</p>
         </div>
         <p class="text-[10px] font-bold text-slate-400 mb-2 uppercase">Metode Pembayaran Sisa</p>
         <select id="lunas-metode" class="w-full border border-slate-200 p-3 rounded-xl mb-6 bg-slate-50 font-bold text-sm outline-none focus:border-emerald-500"></select>
         <input type="hidden" id="lunas-sisa-val">
         <div class="flex gap-2">
            <button onclick="document.getElementById('modal-lunas-so').classList.replace('flex','hidden')" class="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Batal</button>
            <button onclick="eksekusiSelesaiSO()" id="btn-submit-lunas" class="w-1/2 py-2.5 rounded-xl font-bold bg-emerald-500 text-white shadow-md hover:bg-emerald-600 transition">Lunas & Ambil</button>
         </div>
       </div>
    </div>
</div> `; }

function gantiTabPenjualan(tab) { document.getElementById('konten-pj-riwayat').classList.add('hidden'); document.getElementById('konten-pj-so').classList.add('hidden'); document.getElementById('tab-pj-riwayat').className = "tab-custom"; document.getElementById('tab-pj-so').className = "tab-custom"; document.getElementById(`konten-pj-${tab}`).classList.remove('hidden'); document.getElementById(`tab-pj-${tab}`).className = "tab-custom active"; if(tab === 'so') renderTabelSO(); }

function filterPenjualanUI() { let d = new Date(); if(document.getElementById('filter-start')) document.getElementById('filter-start').value = d.toISOString().split('T')[0]; if(document.getElementById('filter-end')) document.getElementById('filter-end').value = d.toISOString().split('T')[0]; renderRiwayatTabel(state.data.penjualan); }

function filterRiwayat() { 
    let start = new Date(document.getElementById('filter-start').value); 
    start.setHours(0,0,0); 
    let end = new Date(document.getElementById('filter-end').value); 
    end.setHours(23, 59, 59); 
    
    let searchVal = "";
    let searchEl = document.getElementById('filter-search-pj');
    if(searchEl) searchVal = searchEl.value.toLowerCase().trim();

    let fData = state.data.penjualan.filter(t => { 
        if(searchVal) {
            // Jika diketik sesuatu, abaikan tanggal biar semua sejarah ke-search
            return String(t.ID_Invoice).toLowerCase().includes(searchVal) || String(t.ID_Pelanggan).toLowerCase().includes(searchVal);
        } else {
            // Jika kolom search kosong, pakai filter tanggal seperti biasa
            let parts = String(t.Waktu).split(' ')[0].split('-'); 
            let d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T12:00:00`); 
            return d >= start && d <= end; 
        }
    }); 
    renderRiwayatTabel(fData); 
}
function renderRiwayatTabel(data) { let html = ""; if(!data || data.length === 0) { html = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">Tidak ada transaksi.</td></tr>`; } else { data.slice().reverse().forEach(t => { if(t.Status === 'SO/PESANAN' || t.Status === 'PESANAN') return; let color = t.Status === 'RETUR' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'; html += `<tr class="hover:bg-slate-50 transition"><td class="p-4 pl-6"><p onclick="lihatDetailInvoice('${t.ID_Invoice}')" class="text-xs text-blue-600 font-black cursor-pointer hover:underline" title="Klik lihat detail">#${t.ID_Invoice}</p></td><td class="p-4"><p class="text-[10px] text-slate-400 font-bold">${String(t.Waktu).substring(0,16)}</p><p class="text-sm text-slate-700">${t.ID_Pelanggan}</p></td><td class="p-4"><p class="text-slate-800">${t.Metode_Pembayaran}</p><p class="text-[10px] text-slate-400">By: ${t.Kasir}</p></td><td class="p-4 text-emerald-600 font-black">${formatRp(t.Total_Akhir)}</td><td class="p-4"><span class="${color} px-2 py-1 rounded text-[10px] font-bold uppercase">${t.Status}</span></td><td class="p-4 pr-6 text-center"><button onclick="tanyaRetur('${t.ID_Invoice}')" class="bg-slate-100 hover:bg-orange-500 hover:text-white transition text-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold" title="Retur"><i class="fa-solid fa-rotate-left"></i></button></td></tr>`; }); } let el = document.getElementById('tabel-riwayat-body'); if(el) el.innerHTML = html; }
function lihatDetailInvoice(inv) { 
    let trx = state.data.penjualan.find(t => t.ID_Invoice === inv);
    let det = state.data.penjualan_detail ? state.data.penjualan_detail.filter(d => d.ID_Invoice === inv) : []; 
    let html = `<div class="mb-4 text-xs flex justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div><p class="text-slate-500 font-bold">Pelanggan:</p><p class="font-black text-blue-600">${trx ? trx.ID_Pelanggan : '-'}</p></div>
        <div class="text-right"><p class="text-slate-500 font-bold">Kasir:</p><p class="font-black uppercase">${trx ? trx.Kasir : '-'}</p></div>
    </div>`;
    html += `<table class="w-full text-left text-sm mb-4"><tr class="border-b text-slate-500 text-xs uppercase"><th class="py-2">Item Produk</th><th>Qty</th><th class="text-right">Total Harga</th></tr>`; 
    if(det.length === 0) { 
        html += `<tr><td colspan="3" class="py-4 text-center text-slate-400 font-bold">Data kosong / sinkronisasi...</td></tr>`; 
    } else { 
        det.forEach(d => { 
            let prd = state.data.produk.find(p => p.ID_Produk === d.ID_Produk); 
            let nm = prd ? prd.Nama_Produk : d.ID_Produk; 
            html += `<tr class="border-b"><td class="py-2 font-bold text-slate-700">${nm}</td><td class="font-black text-center">${d.Qty}</td><td class="text-right font-bold text-blue-600">${formatRp(d.Total_Harga)}</td></tr>`; 
        }); 
    } 
    html += `</table>`; 
    if(trx) {
        let sub = parseFloat(trx.Subtotal || trx.Total_Akhir);
        let diskon = parseFloat(trx.Diskon || 0);
        let pajak = parseFloat(trx.Pajak || 0);
        let tot = parseFloat(trx.Total_Akhir);
        let hitungDP = tot - (sub - diskon + pajak); // Deteksi jika ada kelebihan uang DP

        html += `<div class="bg-slate-100 p-3 rounded-lg mb-4 text-xs font-bold text-slate-600 text-right space-y-1">
            <div class="flex justify-between"><span>Subtotal:</span><span>${formatRp(sub)}</span></div>`;
        if(diskon > 0) html += `<div class="flex justify-between text-orange-500"><span>Diskon:</span><span>-${formatRp(diskon)}</span></div>`;
        if(pajak > 0) html += `<div class="flex justify-between text-red-500"><span>Pajak PPN:</span><span>+${formatRp(pajak)}</span></div>`;
        
        // MUNCULKAN DP LEASING JIKA ADA
        if(hitungDP > 0) html += `<div class="flex justify-between text-blue-600"><span>DP (Uang Muka):</span><span>+${formatRp(hitungDP)}</span></div>`;
        
        html += `</div>`;
        html += `<div class="flex justify-between items-center bg-slate-900 text-white p-3 rounded-lg mb-4">
            <span class="text-xs font-bold uppercase tracking-wider">Total Akhir</span>
            <span class="font-black text-emerald-400 text-xl">${formatRp(tot)}</span>
        </div>`;
    }
    html += `<button onclick="cetakInvoiceRiwayat('${inv}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl shadow-md transition flex items-center justify-center gap-2"><i class="fa-solid fa-print"></i> Cetak / Download PDF</button>`;
    document.getElementById('detail-inv-title').innerText = "INVOICE #" + inv; 
    document.getElementById('detail-inv-body').innerHTML = html; 
    document.getElementById('modal-detail-inv').classList.replace('hidden','flex'); 
}

function cetakInvoiceRiwayat(inv) {
    let trx = state.data.penjualan.find(t => t.ID_Invoice === inv);
    if(!trx) return showInlineNotif('error', 'Data tidak ditemukan!');
    let det = state.data.penjualan_detail ? state.data.penjualan_detail.filter(d => d.ID_Invoice === inv) : [];
    let subtotalPrint = parseFloat(trx.Subtotal || trx.Total_Akhir); 
    let diskonPrint = parseFloat(trx.Diskon || 0);
    let pajakPrint = parseFloat(trx.Pajak || 0);
    let totAkhir = parseFloat(trx.Total_Akhir);
    let dpPrint = parseFloat(trx.DP || 0);
    let sisaPrint = parseFloat(trx.Sisa_Tagihan || 0);
    
    // Deteksi jika ada kelebihan uang DP Leasing di riwayat
    let hitungDPLeasing = totAkhir - (subtotalPrint - diskonPrint + pajakPrint);
    
    let namaToko = localStorage.getItem('sanstech_nama_toko') || "BLANGKON ERP"; 
    let trxCabang = trx.Cabang || state.cabang; 
    if(trxCabang && String(trxCabang).toUpperCase() !== 'PUSAT') {
        if(namaToko.toUpperCase().includes('PUSAT')) { namaToko = namaToko.replace(/PUSAT/i, trxCabang.toUpperCase()); } 
        else { namaToko = namaToko + " " + trxCabang.toUpperCase(); }
    }
    let headerToko = localStorage.getItem('sanstech_struk_header') || ""; 
    let footerToko = localStorage.getItem('sanstech_struk_footer') || "Terima Kasih"; 
    if (btCharacteristic) {
        let teks = `\n${namaToko}\n`;
        if (headerToko) teks += `${headerToko}\n`;
        teks += `--------------------------------\nINV: ${inv}\nTgl: ${String(trx.Waktu).substring(0,16)}\n--------------------------------\n`;
        det.forEach(d => { 
            let prd = state.data.produk.find(p => p.ID_Produk === d.ID_Produk); 
            let nm = prd ? prd.Nama_Produk : d.ID_Produk;
            teks += `${nm}\n${d.Qty}x ${parseFloat(d.Harga_Satuan||0)} = ${parseFloat(d.Total_Harga||0)}\n`; 
        });
        teks += `--------------------------------\nSubtotal: ${formatRp(subtotalPrint)}\n`;
        if(diskonPrint > 0) teks += `Diskon: -${formatRp(diskonPrint)}\n`;
        if(pajakPrint > 0) teks += `Pajak PPN: +${formatRp(pajakPrint)}\n`;
        
        // MUNCULKAN DP LEASING JIKA ADA (BLUETOOTH)
        if(hitungDPLeasing > 0) teks += `DP (Uang Muka): +${formatRp(hitungDPLeasing)}\n`;
        
        teks += `TOTAL: ${formatRp(totAkhir)}\nBayar: ${trx.Metode_Pembayaran}\n`;
        if(String(trx.Status).includes('SO')) { teks += `DP Masuk: ${formatRp(dpPrint)}\nSISA HUTANG: ${formatRp(sisaPrint)}\n`; }
        teks += `--------------------------------\n${footerToko}\n\n\n\n`;
        cetakStrukBluetooth(teks).then(hasil => { if(hasil) showInlineNotif('success', 'Struk Tercetak via Bluetooth!'); });
        return; 
    }
    let iframe = document.getElementById('print-iframe'); 
    let doc = iframe.contentWindow.document; 
    let title = String(trx.Status).includes('SO') ? "NOTA PESANAN (SO)" : "INVOICE PEMBAYARAN"; 
    let alamatToko = localStorage.getItem('sanstech_alamat_toko') || "Sistem ERP Distributor"; 
    let html = `<html><head><style>@page{margin:0;} body{font-family:monospace; color:black; font-size:11px; width:58mm; padding:2mm; margin:0;} .garis{border-bottom: 1px dashed black; margin: 4px 0;}</style></head><body>`; 
    html += `<div style="text-align:center;"><b style="font-size:14px;">${namaToko}</b><br>${alamatToko}`; if(headerToko) html += `<br>${headerToko}`; html += `<br><br><b>${title}</b><br><div class="garis"></div></div>`;
    html += `<div>No: ${inv}<br>Tgl: ${String(trx.Waktu).substring(0,16)}<br>Ksr: ${trx.Kasir}<br>Plg: ${trx.ID_Pelanggan}<br></div>`;
    html += `<div class="garis"></div><table style="width:100%; border-collapse:collapse;">`; 
    det.forEach(d => { 
        let prd = state.data.produk.find(p => p.ID_Produk === d.ID_Produk); 
        let nm = prd ? prd.Nama_Produk : d.ID_Produk;
        let harga = parseFloat(d.Harga_Satuan || 0);
        let totalRow = parseFloat(d.Total_Harga || 0);
        html += `<tr><td colspan="3" style="padding-top:2px;"><b>${nm}</b></td></tr><tr><td>${d.Qty}x</td><td>${harga.toLocaleString('id-ID')}</td><td style="text-align:right;">${totalRow.toLocaleString('id-ID')}</td></tr>`; 
    }); 
    html += `</table><div class="garis"></div><div style="text-align:right;">Subtotal: ${formatRp(subtotalPrint)}<br>`;
    if(diskonPrint > 0) html += `Diskon: -${formatRp(diskonPrint)}<br>`;
    if(pajakPrint > 0) html += `Pajak PPN: +${formatRp(pajakPrint)}<br>`;
    
    // MUNCULKAN DP LEASING JIKA ADA (PRINT A4 / PDF)
    if(hitungDPLeasing > 0) html += `DP (Uang Muka): +${formatRp(hitungDPLeasing)}<br>`;
    
    html += `<b>TOTAL: ${formatRp(totAkhir)}</b><br>Metode: ${trx.Metode_Pembayaran}<br>`;
    if(String(trx.Status).includes('SO')) { html += `DP Masuk: ${formatRp(dpPrint)}<br><b>SISA TAGIHAN: ${formatRp(sisaPrint)}</b><br>`; }
    html += `</div><div class="garis"></div><div style="text-align:center; margin-top:10px;">${footerToko}</div></body></html>`; 
    doc.open(); doc.write(html); doc.close(); 
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 500); 
}
function tanyaRetur(inv) { bukaModalConfirm("Retur Transaksi", `Yakin meretur invoice ${inv}?`, "retur", function() { eksekusiRetur(inv); }); }
async function eksekusiRetur(inv) { showInlineNotif("info", "Memproses retur..."); let res = await requestAPIWithAuth('prosesReturPenjualan', {inv: inv, user: state.user}); if(res.status) { showInlineNotif("success", res.msg); syncDataLiveBackground(); } else { showInlineNotif("error", res.msg); } }
function renderTabelSO() { 
    let html = ""; 
    let soData = state.data.penjualan ? state.data.penjualan.filter(t => t.Status === 'SO/PESANAN' || t.Status === 'PESANAN') : []; 
    if(soData.length === 0) { 
        html = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-bold">Belum ada pesanan</td></tr>`; 
    } else { 
        soData.slice().reverse().forEach(t => { 
            let dpVal = parseFloat(t.DP) || 0;
            let sisaVal = parseFloat(t.Sisa_Tagihan) || 0;
            
            html += `<tr class="hover:bg-slate-50 transition">
                <td class="p-4 pl-6 text-slate-800 font-black">#${t.ID_Invoice}</td>
                <td class="p-4"><p class="text-[10px] text-slate-400 font-bold">${String(t.Waktu).substring(0,16)}</p><p class="text-sm text-blue-600">${t.ID_Pelanggan}</p></td>
                <td class="p-4">
                    <p class="text-emerald-600 font-black">${formatRp(t.Total_Akhir)}</p>
                    <p class="text-[10px] font-bold text-orange-500 mt-1">DP: ${formatRp(dpVal)} | Sisa: <span class="text-red-500">${formatRp(sisaVal)}</span></p>
                </td>
                <td class="p-4"><span class="bg-yellow-100 text-yellow-600 px-2 py-1 rounded text-[10px] font-bold uppercase">BELUM DIAMBIL</span></td>
                <td class="p-4 pr-6 text-center">
                    <button onclick="bukaModalPelunasanSO('${t.ID_Invoice}', ${sisaVal})" class="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow border border-emerald-600"><i class="fa-solid fa-check mr-1"></i> Selesaikan</button>
                </td>
            </tr>`; 
        }); 
    } 
    let el = document.getElementById('tabel-so-body'); 
    if(el) el.innerHTML = html; 
}
function bukaModalPelunasanSO(inv, sisa) {
    document.getElementById('lunas-inv').innerText = inv;
    document.getElementById('lunas-sisa-rp').innerText = formatRp(sisa);
    document.getElementById('lunas-sisa-val').value = sisa;
    
    let savedMetode = JSON.parse(localStorage.getItem('sanstech_list-metode') || '["Tunai", "QRIS", "Transfer", "Kredit"]');
    let opsiMetode = ""; savedMetode.forEach(m => opsiMetode += `<option value="${m}">${m}</option>`);
    document.getElementById('lunas-metode').innerHTML = opsiMetode;

    document.getElementById('modal-lunas-so').classList.replace('hidden', 'flex');
}
async function eksekusiSelesaiSO() {
    let inv = document.getElementById('lunas-inv').innerText;
    let sisa = parseFloat(document.getElementById('lunas-sisa-val').value) || 0;
    let metode = document.getElementById('lunas-metode').value;
    
    let btn = document.getElementById('btn-submit-lunas');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Proses...';
    btn.disabled = true;

    showInlineNotif('info', 'Memproses pelunasan & pengambilan barang...');
    let res = await requestAPIWithAuth('selesaikanSOPenjualan', { inv: inv, sisa_bayar: sisa, metode: metode, kasir: state.user, cabang: state.cabang });
    
    if(res.status) {
        showInlineNotif('success', res.msg);
        document.getElementById('modal-lunas-so').classList.replace('flex', 'hidden');
        syncDataLiveBackground();
        setTimeout(() => { gantiTabPenjualan('riwayat'); }, 1500);
    } else {
        showInlineNotif('error', res.msg);
    }
    
    btn.innerHTML = 'Lunas & Ambil';
    btn.disabled = false;
}

// ====================================================================
// VIEW & FUNGSI: MASTER PRODUK
// ====================================================================
function viewProduk() { 
  let savedCabang = JSON.parse(localStorage.getItem('sanstech_list-gudang') || '["Pusat"]'); 
  if(!savedCabang.includes("Pusat")) savedCabang.unshift("Pusat");
  let opsiCabangHtml = ""; savedCabang.forEach(cab => opsiCabangHtml += `<option value="${cab}">${cab}</option>`); 
  
  let listKat = JSON.parse(localStorage.getItem('sanstech_list-kat') || '["Umum"]');
  let opsiKatHtml = ""; listKat.forEach(k => opsiKatHtml += `<option value="${k}">${k}</option>`);
  
  let opsiSupplierHtml = `<option value="-">-- Tanpa Supplier --</option>`;
  if(state.data.supplier) { 
      state.data.supplier.forEach(s => { 
          opsiSupplierHtml += `<option value="${s.Nama_Supplier}">${s.Nama_Supplier}</option>`; 
      }); 
  }

  let filterCabangHtml = '';
  let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
  if(roleNorm !== 'KASIR') {
      filterCabangHtml = `<select id="filter-cabang-produk" onchange="filterProdukUI()" class="border border-slate-200 p-2.5 rounded-lg text-xs font-bold outline-none focus:border-blue-500 bg-white ml-3 shadow-sm"><option value="SEMUA">Semua Cabang</option>`;
      savedCabang.forEach(c => { filterCabangHtml += `<option value="${c}">${c}</option>`; });
      filterCabangHtml += `</select>`;
  } else { filterCabangHtml = `<input type="hidden" id="filter-cabang-produk" value="${state.cabang}">`; }
  
  return `
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full"> 
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h3 class="font-black text-lg text-slate-800 flex items-center">Master Produk ${filterCabangHtml}</h3>
          
          <!-- SEARCH BAR PRODUK -->
          <div class="relative w-full md:w-64">
             <i class="fa-solid fa-search absolute left-3 top-3 text-slate-400"></i>
             <input type="text" id="prd-search" onkeyup="filterProdukUI()" class="w-full border border-slate-200 p-2 pl-9 rounded-lg text-sm font-bold outline-none focus:border-blue-500 bg-white shadow-sm" placeholder="Cari Nama / IMEI...">
          </div>

          <div class="flex items-center gap-2">
              <button onclick="triggerImportProduk()" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white font-bold p-2.5 rounded-xl shadow-sm transition admin-only" title="Import CSV (Bulk Upload)"><i class="fa-solid fa-file-import"></i></button>
              <button onclick="exportDataCSV('produk')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white font-bold p-2.5 rounded-xl shadow-sm transition" title="Export Excel"><i class="fa-solid fa-file-excel"></i></button>
              <button onclick="bukaFormProduk(false)" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition text-sm flex items-center admin-only"><i class="fa-solid fa-plus mr-2"></i> Produk Baru</button>
          </div>
      </div> 
      <div id="form-wrap-produk" class="hidden bg-slate-50 p-5 rounded-2xl border border-blue-100 mb-6 relative shadow-sm">
          <h4 id="prd-title" class="font-black text-blue-700 mb-4 pb-2 border-b border-blue-200">Tambah Produk</h4>
          <div id="prd-inline-notif" class="hidden"></div>
          <input type="hidden" id="prd-action"><input type="hidden" id="prd-id">
          <div class="grid grid-cols-1 md:grid-cols-6 gap-4 mb-5">
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Barcode / IMEI</label><div class="flex gap-2"><input type="text" id="prd-bc" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"><button onclick="bukaKamera('produk')" class="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700 transition"><i class="fa-solid fa-camera"></i></button></div></div>
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Nama Produk</label><input type="text" id="prd-nm" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"></div>
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Supplier Asal</label><select id="prd-sup" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white">${opsiSupplierHtml}</select></div>
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Kategori</label><select id="prd-kat" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white">${opsiKatHtml}</select></div>
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Warna (Opsional)</label><input type="text" id="prd-warna" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white" placeholder="Contoh: Hitam"></div>
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Satuan</label><input type="text" id="prd-sat" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"></div>
              <div class="admin-only md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Harga Beli (Modal)</label><input type="text" inputmode="numeric" onkeyup="formatInputRibuan(this)" id="prd-beli" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"></div>
              <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Harga Jual</label><input type="text" inputmode="numeric" onkeyup="formatInputRibuan(this)" id="prd-jual" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"></div>
              <div class="admin-only md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Stok Awal</label><input type="number" id="prd-stok" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"></div>
              <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Stok Min</label><input type="number" id="prd-minstok" value="0" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white"></div>
              <div class="md:col-span-6 bg-blue-50 p-3 rounded-xl border border-blue-200 shadow-inner admin-only">
                  <label class="text-[10px] font-black text-blue-700 uppercase tracking-widest"><i class="fa-solid fa-store mr-1"></i> Simpan Ke Cabang</label>
                  <select id="prd-cabang" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold outline-none focus:border-blue-500 bg-white mt-1 shadow-sm">${opsiCabangHtml}</select>
              </div>
          </div>
          <div class="flex gap-2">
              <button onclick="simpanFormProduk()" id="btn-submit-prd" class="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow hover:bg-blue-700 transition">Simpan Data</button>
              <button onclick="document.getElementById('form-wrap-produk').classList.add('hidden'); filterProdukUI();" class="bg-slate-200 text-slate-600 font-bold px-6 py-2.5 rounded-lg text-sm hover:bg-slate-300 transition">Batal</button>
          </div>
      </div> 
      <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-left min-w-[900px]">
              <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 shadow-sm z-10">
                  <tr><th class="p-4 pl-6">ID & Barcode</th><th class="p-4">Nama, Kategori & Lokasi</th><th class="p-4 admin-only">Modal / Jual</th><th class="p-4">Stok & Min</th><th class="p-4 pr-6 text-center admin-only">Aksi</th></tr>
              </thead>
              <tbody id="tabel-produk-ui" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody>
          </table>
      </div> 
  </div>`; 
}
function filterProdukUI() { 
    let filterEl = document.getElementById('filter-cabang-produk');
    let searchEl = document.getElementById('prd-search');
    
    let filterCabang = filterEl ? filterEl.value : 'SEMUA';
    let searchVal = searchEl ? searchEl.value.toLowerCase().trim() : '';
    
    let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
    let myCab = String(state.cabang).toUpperCase().trim();
    let fCab = String(filterCabang).toUpperCase().trim();
    let html = ""; 

    if(!state.data.produk || state.data.produk.length === 0) { 
        html = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">Data Kosong.</td></tr>`; 
    } else { 
        let filteredProd = state.data.produk.filter(p => {
            let rawCabang = p.Cabang || 'Pusat';
            let pCabang = String(rawCabang).toUpperCase().trim();
            if (roleNorm !== 'SUPERADMIN' && pCabang !== myCab) return false;
            if (roleNorm === 'SUPERADMIN' && fCab !== 'SEMUA' && pCabang !== fCab) return false;
            
            // Pencarian text
            if(searchVal) {
                let nm = String(p.Nama_Produk||"").toLowerCase();
                let bc = String(p.Barcode||"").toLowerCase();
                if(!nm.includes(searchVal) && !bc.includes(searchVal)) return false;
            }
            return true;
        });

        if(filteredProd.length === 0) {
            html = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">Produk tidak ditemukan.</td></tr>`;
        } else {
            filteredProd.forEach(p => { 
                let rawCabang = p.Cabang || 'Pusat';
                let isHabis = parseFloat(p.Stok_Saat_Ini) <= 0; 
                let isWarning = parseFloat(p.Stok_Saat_Ini) <= parseFloat(p.Stok_Minimum || 0) && !isHabis;
                let stClass = isHabis ? "text-red-500 bg-red-50 px-2 py-1 rounded border border-red-200" : (isWarning ? "text-orange-500 bg-orange-50 px-2 py-1 rounded border border-orange-200" : "text-emerald-600 font-black"); 
                let warnaHtml = p.Warna ? `<span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200"><i class="fa-solid fa-palette mr-1 text-slate-400"></i>${p.Warna}</span>` : '';
                let supHtml = p.Supplier && p.Supplier !== '-' ? `<span class="text-[10px] bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded font-bold border border-yellow-200"><i class="fa-solid fa-truck-fast mr-1"></i>${p.Supplier}</span>` : '';
                
                html += `<tr class="hover:bg-slate-50 transition">
                    <td class="p-4 pl-6"><p class="text-xs font-bold text-blue-600">${p.ID_Produk}</p><p class="text-[10px] font-mono text-slate-400">${p.Barcode||'-'}</p></td>
                    <td class="p-4"><p class="font-bold text-slate-800">${p.Nama_Produk}</p><div class="mt-1 flex flex-wrap gap-1"><span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200"><i class="fa-solid fa-tag mr-1 text-slate-400"></i>${p.Kategori}</span> ${warnaHtml} ${supHtml} <span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold border border-blue-100 uppercase"><i class="fa-solid fa-location-dot mr-1"></i>${rawCabang}</span></div></td>
                    <td class="p-4 admin-only"><p class="text-[10px] text-slate-400 font-bold">B: ${formatRp(p.Harga_Beli)}</p><p class="text-sm text-slate-800 font-black mt-0.5">J: ${formatRp(p.Harga_Jual)}</p></td>
                    <td class="p-4"><span class="${stClass}">${p.Stok_Saat_Ini} <span class="text-[10px] font-bold text-slate-400 uppercase">${p.Satuan}</span></span><p class="text-[10px] text-slate-400 mt-1 font-bold">Min Stok: ${p.Stok_Minimum || 0}</p></td>
                    <td class="p-4 pr-6 flex gap-2 justify-center items-center h-full admin-only mt-2">
                        <button onclick="bukaFormProduk(true, '${p.ID_Produk}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition shadow-sm border border-blue-100" title="Edit"><i class="fa-solid fa-pen text-[10px]"></i></button>
                        <button onclick="konfirmasiHapusProduk('${p.ID_Produk}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition shadow-sm border border-red-100" title="Hapus"><i class="fa-solid fa-trash text-[10px]"></i></button>
                    </td>
                </tr>`; 
            }); 
        }
    } 
    let el = document.getElementById('tabel-produk-ui'); 
    if(el) { el.innerHTML = html; document.querySelectorAll('.admin-only').forEach(e => { e.style.display = (String(state.role).toUpperCase().replace(/\s+/g, '') === 'KASIR') ? 'none' : ''; }); }
}
function bukaFormProduk(isEdit, idProduk) { 
    try {
        let wrap = document.getElementById('form-wrap-produk'); 
        wrap.classList.remove('hidden'); 
        document.getElementById('prd-inline-notif').classList.add('hidden'); 

        // --- TAMBAHAN: FITUR AUTO-SCROLL KE ATAS ---
        setTimeout(() => {
            wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        let savedCabang = JSON.parse(localStorage.getItem('sanstech_list-gudang') || '["Pusat"]'); 
        if(!savedCabang.includes("Pusat")) savedCabang.unshift("Pusat");
        let opsiCabangHtml = ""; savedCabang.forEach(cab => opsiCabangHtml += `<option value="${cab}">${cab}</option>`);
        if(document.getElementById('prd-cabang')) document.getElementById('prd-cabang').innerHTML = opsiCabangHtml;
        
        let listKat = JSON.parse(localStorage.getItem('sanstech_list-kat') || '["Umum"]');
        let opsiKatHtml = ""; listKat.forEach(k => opsiKatHtml += `<option value="${k}">${k}</option>`);
        if(document.getElementById('prd-kat')) document.getElementById('prd-kat').innerHTML = opsiKatHtml;
        
        let opsiSupplierHtml = `<option value="-">-- Tanpa Supplier --</option>`;
        if(state.data.supplier) { 
            state.data.supplier.forEach(s => { 
                opsiSupplierHtml += `<option value="${s.Nama_Supplier}">${s.Nama_Supplier}</option>`; 
            }); 
        }
        if(document.getElementById('prd-sup')) document.getElementById('prd-sup').innerHTML = opsiSupplierHtml;

        if(!isEdit) { 
            document.getElementById('prd-title').innerText = "Tambah Produk Baru"; document.getElementById('prd-action').value = "CREATE"; 
            ['prd-id','prd-bc','prd-nm','prd-warna','prd-beli','prd-jual','prd-stok','prd-sat'].forEach(id => { let el = document.getElementById(id); if(el) el.value = ""; }); 
            document.getElementById('prd-minstok').value = "0"; 
            document.getElementById('prd-stok').readOnly = false; 
            if(document.getElementById('prd-cabang')) document.getElementById('prd-cabang').value = state.cabang || "Pusat"; 
            if(document.getElementById('prd-sup')) document.getElementById('prd-sup').value = "-";
            setTimeout(() => { document.getElementById('prd-bc').focus(); }, 300);
        } else { 
            document.getElementById('prd-title').innerText = "Edit Data Produk"; document.getElementById('prd-action').value = "UPDATE"; 
            let p = state.data.produk.find(x => String(x.ID_Produk) === String(idProduk));
            if(!p) { showInlineNotif('error', 'Data tidak ditemukan!'); return; }
            document.getElementById('prd-id').value = p.ID_Produk || ""; document.getElementById('prd-bc').value = p.Barcode || ""; 
            document.getElementById('prd-nm').value = p.Nama_Produk || ""; 
            if(!listKat.includes(p.Kategori)) document.getElementById('prd-kat').innerHTML += `<option value="${p.Kategori}">${p.Kategori}</option>`;
            document.getElementById('prd-kat').value = p.Kategori || ""; 
            document.getElementById('prd-warna').value = p.Warna || "";
            document.getElementById('prd-beli').value = p.Harga_Beli ? parseInt(p.Harga_Beli).toLocaleString('id-ID') : ""; document.getElementById('prd-jual').value = p.Harga_Jual ? parseInt(p.Harga_Jual).toLocaleString('id-ID') : ""; 
            document.getElementById('prd-minstok').value = p.Stok_Minimum || "0"; 
            document.getElementById('prd-stok').value = p.Stok_Saat_Ini || ""; document.getElementById('prd-sat').value = p.Satuan || ""; 
            document.getElementById('prd-stok').readOnly = true; 
            
            if(document.getElementById('prd-sup')) {
                let sVal = p.Supplier || "-";
                document.getElementById('prd-sup').value = sVal;
            }

            if(document.getElementById('prd-cabang')) {
                let cbVal = p.Cabang || "Pusat";
                if(!savedCabang.includes(cbVal)) document.getElementById('prd-cabang').innerHTML += `<option value="${cbVal}">${cbVal}</option>`;
                document.getElementById('prd-cabang').value = cbVal; 
            }
            setTimeout(() => { document.getElementById('prd-jual').focus(); }, 300);
        } 
    } catch(e) { console.error("Error Form: ", e); showInlineNotif('error', 'Error Sistem Buka Form: ' + e.message); }
}
async function simpanFormProduk() { 
    try {
        let act = document.getElementById('prd-action').value; 
        let cbg = document.getElementById('prd-cabang') ? document.getElementById('prd-cabang').value : state.cabang; 
        let barcodeVal = document.getElementById('prd-bc').value.trim(); 
        let idPrd = document.getElementById('prd-id').value;
        let supVal = document.getElementById('prd-sup') ? document.getElementById('prd-sup').value : "-";

        // VALIDASI DOUBLE IMEI KETAT (Abaikan Spasi & Huruf Besar Kecil)
        if (barcodeVal !== "") {
            let bCari = barcodeVal.toUpperCase().replace(/\s+/g, '');
            let cekDuplikat = state.data.produk.find(p => String(p.Barcode || "").toUpperCase().replace(/\s+/g, '') === bCari);
            
            if (cekDuplikat && (act === 'CREATE' || (act === 'UPDATE' && cekDuplikat.ID_Produk !== idPrd))) {
                let statusStok = parseFloat(cekDuplikat.Stok_Saat_Ini) <= 0 ? "(Sudah Terjual/Habis)" : "(Masih Ada di Gudang: " + (cekDuplikat.Cabang || 'Pusat') + ")";
                let e = document.getElementById('prd-inline-notif'); 
                e.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-lg mb-1 block"></i> GAGAL! IMEI/Barcode <b>${barcodeVal}</b> sudah terdaftar di sistem pada produk:<br><b>${cekDuplikat.Nama_Produk}</b> ${statusStok}.`; 
                e.className = "text-xs font-bold p-4 rounded-xl mb-4 bg-red-50 text-red-600 border border-red-200 block text-center"; e.classList.remove('hidden'); return; 
            }
        }
        
        let obj = { 
            Barcode: barcodeVal, 
            Nama_Produk: document.getElementById('prd-nm').value, 
            Supplier: supVal,
            Kategori: document.getElementById('prd-kat').value, 
            Warna: document.getElementById('prd-warna').value, 
            Harga_Beli: parseAngka(document.getElementById('prd-beli').value), 
            Harga_Jual: parseAngka(document.getElementById('prd-jual').value), 
            Diskon: 0, 
            Stok_Saat_Ini: document.getElementById('prd-stok').value, 
            Stok_Minimum: document.getElementById('prd-minstok').value, 
            Satuan: document.getElementById('prd-sat').value, 
            Cabang: cbg 
        }; 

        if(!obj.Nama_Produk || !obj.Harga_Jual) { let e=document.getElementById('prd-inline-notif'); e.innerText="Nama Produk dan Harga Jual Wajib Diisi!"; e.className="text-xs font-bold p-3 rounded-lg mb-4 bg-red-50 text-red-500 border border-red-100 block"; e.classList.remove('hidden'); return; } 
        let btn = document.getElementById('btn-submit-prd'); btn.innerText = "Memproses..."; btn.disabled = true; 
        
        let res = await requestAPIWithAuth('crudDataMaster', {modul: 'Produk', action: act, key: 'ID_Produk', id: idPrd, obj: obj});
        
        if(res.status) { 
            document.getElementById('form-wrap-produk').classList.add('hidden'); 
            syncDataLiveBackground(); showInlineNotif('success', 'Data Master Produk berhasil disimpan!');
        } else { 
            let e=document.getElementById('prd-inline-notif'); e.innerText=res.msg; e.className="text-xs font-bold p-3 rounded-lg mb-4 bg-red-50 text-red-500 border border-red-100 block"; e.classList.remove('hidden'); 
        } 
        btn.innerText = "Simpan Data"; btn.disabled = false; 
    } catch(e) { console.error(e); }
}
let deleteIdTemp = "";
function konfirmasiHapusProduk(id) {
    deleteIdTemp = id;
    bukaModalConfirm("Hapus Produk", `Yakin ingin menghapus permanen produk ${id}? Data ini tidak bisa dikembalikan.`, "hapus", eksekusiHapusProduk);
}
async function eksekusiHapusProduk() {
    showInlineNotif('info', 'Menghapus produk dari sistem...');
    let res = await requestAPIWithAuth('crudDataMaster', {modul: 'Produk', action: 'DELETE', key: 'ID_Produk', id: deleteIdTemp, obj: {}});
    if(res.status) {
        showInlineNotif('success', 'Produk berhasil dihapus permanen!');
        syncDataLiveBackground();
    } else {
        showInlineNotif('error', res.msg);
    }
}

function triggerImportProduk() {
    let fileInput = document.getElementById('input-import-csv');
    if(!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'input-import-csv';
        fileInput.accept = '.csv';
        fileInput.style.display = 'none';
        fileInput.onchange = prosesImportCSVProduk;
        document.body.appendChild(fileInput);
    }
    fileInput.click();
}

async function prosesImportCSVProduk(event) {
    let file = event.target.files[0];
    if(!file) return;

    let reader = new FileReader();
    reader.onload = async function(e) {
        let text = e.target.result;
        let rows = text.split('\n').map(row => row.trim()).filter(row => row);
        if(rows.length < 2) {
            showInlineNotif('error', 'File CSV kosong atau format salah!');
            return;
        }

        let loader = document.getElementById('global-loader');
        if (loader) {
            loader.querySelector('p').innerText = "MENGIMPORT DATA...";
            loader.querySelectorAll('p')[1].innerText = "Memproses baris 1 dari " + (rows.length - 1);
            loader.classList.replace('hidden', 'flex');
        }

        let successCount = 0;
        let failCount = 0;

        for(let i = 1; i < rows.length; i++) {
            let cols = rows[i].split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            cols = cols.map(c => c.replace(/^"|"$/g, '').trim());

            if(cols.length < 11) continue; 

            let barcodeVal = cols[1] || "";
            let namaVal = cols[2] || "";

            if (!namaVal) continue; 

            if (barcodeVal !== "") {
                let cekDuplikat = state.data.produk.find(p => String(p.Barcode) === barcodeVal);
                if (cekDuplikat) {
                    failCount++;
                    continue; 
                }
            }

            let obj = {
                Barcode: barcodeVal,
                Nama_Produk: namaVal,
                Supplier: cols[3] || "-",
                Kategori: cols[4] || "Umum",
                Warna: cols[5] || "",
                Satuan: cols[6] || "Pcs",
                Harga_Beli: parseAngka(cols[7] || "0"),
                Harga_Jual: parseAngka(cols[8] || "0"),
                Diskon: 0,
                Stok_Saat_Ini: parseFloat(cols[9]) || 0,
                Stok_Minimum: parseFloat(cols[10]) || 0,
                Cabang: cols[11] || state.cabang
            };

            let res = await requestAPIWithAuth('crudDataMaster', {modul: 'Produk', action: 'CREATE', key: 'ID_Produk', id: '', obj: obj});
            if(res.status) {
                state.data.produk.push(obj); 
                successCount++;
            } else {
                failCount++;
            }

            if (loader) {
                loader.querySelectorAll('p')[1].innerText = `Memproses baris ${i} dari ${rows.length - 1} ...`;
            }
        }

        if (loader) {
            loader.querySelector('p').innerText = "SINKRONISASI...";
            loader.querySelectorAll('p')[1].innerText = "Menyimpan & Menarik Data Terbaru";
            loader.classList.replace('flex', 'hidden');
        }

        event.target.value = ''; 
        showInlineNotif(failCount === 0 ? 'success' : 'info', `Import CSV Selesai! Berhasil: ${successCount}, Ditolak/Duplikat: ${failCount}`);
        syncDataLiveBackground(); 
    };
    reader.readAsText(file);
}

// ====================================================================
// VIEW & FUNGSI: KELOLA STOK
// ====================================================================
function viewStok() { 
    let savedCabang = JSON.parse(localStorage.getItem('sanstech_list-gudang') || '["Pusat"]'); 
    if(!savedCabang.includes("Pusat")) savedCabang.unshift("Pusat");
    let opsiCabangTFHtml = `<option value="">-- Pilih Cabang Tujuan --</option>`; 
    savedCabang.forEach(cab => opsiCabangTFHtml += `<option value="${cab}">${cab}</option>`); 
    
    // Kategori untuk dropdown filter
    let listKat = JSON.parse(localStorage.getItem('sanstech_list-kat') || '["Umum"]');
    let opsiKat = `<option value="SEMUA">Semua Kategori</option>`; 
    listKat.forEach(k => opsiKat += `<option value="${k.toUpperCase()}">${k}</option>`);
    
    let filterCabangHtml = '';
    let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
    
    if(roleNorm === 'SUPERADMIN') {
        filterCabangHtml = `<select id="stok-filter-cabang" onchange="filterStokUI()" class="border border-slate-200 p-2 rounded-lg text-xs font-bold outline-none focus:border-blue-500 bg-white min-w-[150px]"><option value="SEMUA">Semua Cabang</option>`;
        savedCabang.forEach(c => { filterCabangHtml += `<option value="${c}">${c}</option>`; });
        filterCabangHtml += `</select>`;
    } else {
        filterCabangHtml = `<input type="text" id="stok-filter-cabang" value="${state.cabang}" class="border border-slate-200 p-2 rounded-lg text-xs font-bold bg-slate-100 cursor-not-allowed w-40 text-center uppercase" readonly>`;
    }
    
    return `
    <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full"> 
        <div class="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 border-b border-slate-200 pb-4">
            <div class="flex items-center gap-3">
               <h3 class="font-black text-lg text-slate-800">Kelola Stok & Mutasi</h3>
               <button onclick="exportDataCSV('stok_pantau')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition" title="Export Sisa Stok"><i class="fa-solid fa-file-excel mr-1"></i> Sisa Stok</button>
               <button onclick="exportDataCSV('stok_mutasi')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition" title="Export Riwayat Mutasi"><i class="fa-solid fa-file-excel mr-1"></i> Mutasi</button>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-500 uppercase"><i class="fa-solid fa-filter mr-1"></i> Cabang:</span>
                ${filterCabangHtml}
            </div>
        </div> 
        <div class="flex gap-4 border-b border-slate-200 mb-4 font-bold text-sm overflow-x-auto">
            <div class="tab-custom active" onclick="switchStokTab('pantau', this)">Pemantauan Stok</div>
            <div class="tab-custom" onclick="switchStokTab('mutasi', this)">Riwayat Mutasi</div>
            <div class="tab-custom text-orange-500" onclick="switchStokTab('opname', this)"><i class="fa-solid fa-clipboard-check mr-1"></i> Stok Opname</div>
            <div class="tab-custom text-blue-500" onclick="switchStokTab('lacak', this)"><i class="fa-solid fa-magnifying-glass mr-1"></i> Lacak IMEI</div>
            <div class="tab-custom text-indigo-500" onclick="switchStokTab('transfer', this)"><i class="fa-solid fa-truck-fast mr-1"></i> Transfer Cabang</div>
        </div> 
        <div id="stok-pantau" class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table class="w-full text-left min-w-[700px]"><thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-10"><tr><th class="p-4 pl-6">ID Produk</th><th class="p-4">Nama Produk & Lokasi</th><th class="p-4">Total Sisa Stok</th></tr></thead><tbody id="tabel-pantau-body" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody></table>
        </div> 
        <div id="stok-mutasi" class="hidden flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table class="w-full text-left min-w-[700px]"><thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-10"><tr><th class="p-4 pl-6">Waktu & Cabang</th><th class="p-4">ID Produk</th><th class="p-4">Pergerakan</th><th class="p-4">Keterangan</th></tr></thead><tbody id="tabel-mutasi-body" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody></table>
        </div> 
        <div id="stok-opname" class="hidden flex-1 flex flex-col">
            <div class="bg-orange-50 text-orange-800 p-4 rounded-xl mb-4 text-xs border border-orange-200 flex flex-col gap-3">
                <div class="flex flex-wrap justify-between items-center gap-3">
                    <p class="font-bold hidden md:block">Filter Kertas Kerja Opname:</p>
                    
                    <div class="flex gap-2 flex-1 md:flex-none">
                       <select id="opname-filter-kat" onchange="filterStokUI()" class="border border-orange-300 p-2 rounded-lg text-xs font-bold outline-none text-orange-800 bg-white shadow-sm">${opsiKat}</select>
                       <input type="text" id="opname-search" onkeyup="filterStokUI()" class="border border-orange-300 p-2 rounded-lg text-xs font-bold outline-none w-full md:w-48 bg-white shadow-sm" placeholder="Cari Nama Produk...">
                    </div>

                    <div class="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                        <button onclick="cetakFormOpname()" class="flex-1 md:flex-none bg-slate-800 text-white font-bold px-4 py-2 rounded-lg shadow hover:bg-slate-900 transition"><i class="fa-solid fa-print mr-1"></i> Cetak A4</button>
                        <button onclick="simpanOpnameMassal()" class="flex-1 md:flex-none bg-orange-600 text-white font-bold px-5 py-2 rounded-lg shadow hover:bg-orange-700 transition">Selesaikan Opname</button>
                    </div>
                </div>
                <p class="text-[10px] font-bold text-orange-600 bg-white p-2 rounded border border-orange-100"><i class="fa-solid fa-lightbulb text-orange-500 mr-1"></i> <b>SISTEM AUTO-GROUPING:</b> Barang dengan <b>Nama yang Sama</b> akan digabung jadi 1 baris untuk memudahkan hitung Total QTY fisik.</p>
            </div> 
            <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white relative">
                <table class="w-full text-left min-w-[800px]">
                    <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr><th class="p-4 pl-6">ID / Jml Item</th><th class="p-4">Nama Produk & Lokasi</th><th class="p-4 text-center">Total Stok Sistem</th><th class="p-4 text-center">Total Fisik Aktual</th><th class="p-4 text-center">Selisih</th><th class="p-4 pr-6">Catatan</th></tr>
                    </thead>
                    <tbody id="tabel-opname-body" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody>
                    
                    <!-- TOTALAN QTY STOK OPNAME -->
                    <tfoot class="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                        <tr>
                            <td colspan="2" class="p-4 pl-6 text-right font-black text-slate-600 uppercase tracking-widest text-xs">Total QTY Keseluruhan:</td>
                            <td class="p-4 text-center font-black text-blue-600 text-lg" id="op-total-sys">0</td>
                            <td class="p-4 text-center font-black text-orange-600 text-lg" id="op-total-fsk">0</td>
                            <td class="p-4 text-center font-black text-lg" id="op-total-selisih">0</td>
                            <td class="p-4 pr-6"></td>
                        </tr>
                    </tfoot>
                </table>
            </div> 
        </div> 
        <!-- (BAGIAN LACAK & TRANSFER CABANG BIARKAN SEPERTI ASLINYA) -->
        <div id="stok-lacak" class="hidden flex-1"><div class="bg-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200 max-w-lg mx-auto mt-6"><h3 class="font-bold text-center mb-4 text-lg">Pelacakan Posisi IMEI / Barcode</h3><div class="flex gap-2 mb-4"><input type="text" id="input-lacak-imei" placeholder="Scan/Ketik Barcode IMEI HP..." class="w-full border border-slate-300 p-3.5 rounded-xl font-bold bg-white focus:border-blue-500 outline-none"><button onclick="bukaKamera('lacak')" class="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-xl shadow-md transition" title="Scan Kamera"><i class="fa-solid fa-camera text-xl"></i></button></div><button onclick="lacakImeiBarang()" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-blue-700 transition"><i class="fa-solid fa-search mr-2"></i>Lacak Posisi Sekarang</button></div><div id="hasil-lacak-imei" class="mt-6 hidden max-w-2xl mx-auto space-y-3"></div></div> 
        <div id="stok-transfer" class="hidden flex-1"><div class="bg-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200 max-w-2xl mx-auto mt-6"><h3 class="font-bold mb-4 text-lg border-b pb-2">Pindahkan Stok ke Cabang Lain</h3><div class="grid grid-cols-2 gap-4 mb-4"><div><label class="text-xs font-bold text-slate-500">Dari Gudang</label><input type="text" value="${state.cabang}" class="w-full border border-slate-200 p-3 rounded-xl bg-slate-100 font-bold text-slate-500" disabled></div><div><label class="text-xs font-bold text-slate-500">Tujuan Cabang</label><select id="tf-tujuan" class="w-full border border-slate-200 p-3 rounded-xl bg-white font-bold outline-none focus:border-blue-500">${opsiCabangTFHtml}</select></div></div><div class="flex gap-2 mb-4"><div class="relative flex-1"><i class="fa-solid fa-barcode absolute left-4 top-3.5 text-slate-400"></i><input type="text" id="tf-produk" placeholder="Scan Barcode / ID Produk..." class="w-full border border-slate-200 p-3 pl-11 rounded-xl font-bold bg-white outline-none focus:border-blue-500"></div><button onclick="bukaKamera('tf')" class="bg-blue-600 text-white w-12 rounded-xl shadow hover:bg-blue-700 transition"><i class="fa-solid fa-camera"></i></button></div><div class="flex gap-4"><input type="number" id="tf-qty" placeholder="Qty Dikirim" class="w-1/3 border border-slate-200 p-3 rounded-xl font-bold bg-white outline-none focus:border-blue-500"><button id="btn-tf" class="w-2/3 bg-slate-800 text-white font-bold py-3 rounded-xl shadow-md hover:bg-slate-900 transition" onclick="prosesTransferGudang()">Proses Pindah Gudang</button></div></div></div> 
    </div> `; 
}

function filterStokUI() { 
    let filterEl = document.getElementById('stok-filter-cabang');
    let filterCabang = filterEl ? filterEl.value : 'SEMUA';
    let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
    let myCab = String(state.cabang).toUpperCase().trim();
    let fCab = String(filterCabang).toUpperCase().trim();
    let hS = "", hM = "", hO = ""; 

    if(state.data.produk && state.data.produk.length > 0) { 
        // 1. Filter Cabang Global Dulu
        let filteredProd = state.data.produk.filter(p => {
            let pCabang = String(p.Cabang || 'Pusat').toUpperCase().trim();
            if (roleNorm !== 'SUPERADMIN') return pCabang === myCab;
            if (fCab !== 'SEMUA') return pCabang === fCab;
            return true;
        });

        // 2. PROSES GROUPING (Sihir Gabung Barang Berdasarkan Nama)
        let groupedObj = {};
        filteredProd.forEach(p => {
            let nameKey = String(p.Nama_Produk).trim().toUpperCase();
            if(!groupedObj[nameKey]) {
                groupedObj[nameKey] = {
                    Nama_Produk: p.Nama_Produk,
                    Kategori: p.Kategori,
                    Cabang: p.Cabang || 'Pusat',
                    Satuan: p.Satuan,
                    Stok_Saat_Ini: 0,
                    Stok_Minimum: 0,
                    Products: [] // Menyimpan rincian IMEI di dalamnya
                };
            }
            groupedObj[nameKey].Stok_Saat_Ini += parseFloat(p.Stok_Saat_Ini) || 0;
            groupedObj[nameKey].Stok_Minimum = Math.max(groupedObj[nameKey].Stok_Minimum, parseFloat(p.Stok_Minimum) || 0);
            groupedObj[nameKey].Products.push(p);
        });

        let groupedArr = Object.values(groupedObj);

        // 3. Urutkan Abjad A-Z & Kategori
        groupedArr.sort((a, b) => {
            let katA = String(a.Kategori || "LAINNYA").toUpperCase();
            let katB = String(b.Kategori || "LAINNYA").toUpperCase();
            if(katA < katB) return -1;
            if(katA > katB) return 1;
            return String(a.Nama_Produk || "").localeCompare(String(b.Nama_Produk || ""));
        });

        // Render untuk Tabel Pantau Stok Biasa
        let currentKatS = "";
        groupedArr.forEach((g) => { 
            let isHabis = parseFloat(g.Stok_Saat_Ini) <= 0; 
            let isWarning = parseFloat(g.Stok_Saat_Ini) <= parseFloat(g.Stok_Minimum || 0) && !isHabis;
            let stClass = isHabis ? "text-red-500 bg-red-50 px-2 py-1 rounded border border-red-200" : (isWarning ? "text-orange-500 bg-orange-50 px-2 py-1 rounded border border-orange-200" : "text-emerald-600 font-black"); 
            let warnIcon = isWarning ? `<i class="fa-solid fa-triangle-exclamation text-orange-500 ml-2" title="Stok Menipis!"></i>` : '';
            
            let kat = String(g.Kategori || "LAINNYA").toUpperCase();

            if (kat !== currentKatS) {
                hS += `<tr class="bg-slate-200/70 border-y border-slate-300"><td colspan="3" class="p-3 pl-6 text-xs font-black text-slate-700 uppercase tracking-widest"><i class="fa-solid fa-tags mr-2 text-blue-500"></i> KATEGORI: ${kat}</td></tr>`;
                currentKatS = kat;
            }
            
            // Ubah ID menjadi Label QTY jika lebih dari 1
            let idLabel = g.Products.length > 1 ? `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-black">${g.Products.length} UNIT/IMEI</span>` : `<span class="text-xs">${g.Products[0].ID_Produk}</span>`;

            hS += `<tr class="hover:bg-slate-50 transition"><td class="p-4 pl-6 text-slate-500">${idLabel}</td><td class="p-4 text-slate-800 font-bold">${g.Nama_Produk}<br><span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 uppercase mt-1 inline-block"><i class="fa-solid fa-store mr-1"></i>${g.Cabang}</span></td><td class="p-4"><span class="${stClass} text-lg">${g.Stok_Saat_Ini}</span> <span class="text-[10px] font-bold text-slate-400 uppercase">${g.Satuan||''}</span>${warnIcon}</td></tr>`; 
        }); 

        // 4. Render untuk STOK OPNAME (Punya filter Kategori & Search sendiri)
        let opK = document.getElementById('opname-filter-kat') ? document.getElementById('opname-filter-kat').value : 'SEMUA';
        let opS = document.getElementById('opname-search') ? document.getElementById('opname-search').value.toLowerCase().trim() : '';

        // Saring array yang SUDAH DIGRUP khusus untuk Opname
        let opnameGroups = groupedArr.filter(g => {
            let kat = String(g.Kategori || "LAINNYA").toUpperCase();
            let passOpKat = (opK === 'SEMUA' || kat === opK);
            let passOpSearch = (opS === '' || String(g.Nama_Produk).toLowerCase().includes(opS));
            return passOpKat && passOpSearch;
        });

        state.tempOpnameGroup = opnameGroups; // Simpan di memori untuk proses Simpan Massal & Print
        
        let currentKatO = "";
        if(opnameGroups.length === 0) {
             hO = `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">Data Opname kosong atau tidak ditemukan.</td></tr>`;
        } else {
            opnameGroups.forEach((g, idx) => {
                let kat = String(g.Kategori || "LAINNYA").toUpperCase();
                let brand = String(g.Nama_Produk || "TANPA NAMA").trim().split(' ')[0].toUpperCase();
                let groupOpname = `${kat} - Merek: ${brand}`;

                if (groupOpname !== currentKatO) {
                    hO += `<tr class="bg-orange-100 border-y border-orange-200"><td colspan="6" class="p-3 pl-6 text-xs font-black text-orange-800 uppercase tracking-widest"><i class="fa-solid fa-box-open mr-2"></i> ${kat} <span class="mx-2">|</span> MEREK: ${brand}</td></tr>`;
                    currentKatO = groupOpname;
                }
                
                let idLabel = g.Products.length > 1 ? `<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-black">${g.Products.length} UNIT/IMEI</span>` : `<span class="text-xs">${g.Products[0].ID_Produk}</span>`;

                hO += `<tr class="hover:bg-slate-50 transition"><td class="p-4 pl-6 text-slate-500">${idLabel}</td><td class="p-4 text-slate-800 font-bold truncate max-w-[200px]">${g.Nama_Produk}<br><span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 uppercase mt-1 inline-block"><i class="fa-solid fa-store mr-1"></i>${g.Cabang}</span></td><td class="p-4 text-center font-black text-blue-600 text-lg" id="op-sys-${idx}">${g.Stok_Saat_Ini}</td><td class="p-4 text-center"><input type="number" id="op-fisik-${idx}" value="${g.Stok_Saat_Ini}" onkeyup="hitungSelisih('${idx}')" onchange="hitungSelisih('${idx}')" class="w-24 border border-slate-300 p-2.5 rounded-xl font-black text-center outline-none focus:border-orange-500 bg-orange-50 text-orange-700 shadow-inner"></td><td class="p-4 text-center font-black text-slate-400 text-lg" id="op-selisih-${idx}">0</td><td class="p-4 pr-6"><input type="text" id="op-ket-${idx}" placeholder="Aman / Rusak" class="w-full border border-slate-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:border-orange-500 bg-slate-50"></td></tr>`; 
            });
        }
    } 
    
    // MUTASI STOK (Tetap muncul satu-satu sesuai riwayat pergerakan)
    if(state.data.stok && state.data.stok.length > 0) { 
        state.data.stok.slice().reverse().forEach(m => { 
            let rawCabang = m.Cabang || 'Pusat';
            let mCabang = String(rawCabang).toUpperCase().trim();
            if (roleNorm !== 'SUPERADMIN' && mCabang !== myCab) return;
            if (roleNorm === 'SUPERADMIN' && fCab !== 'SEMUA' && mCabang !== fCab) return;
            let col = String(m.Jenis_Pergerakan).toUpperCase().includes('MASUK') ? 'text-emerald-500' : 'text-red-500'; 
            hM += `<tr class="hover:bg-slate-50 transition"><td class="p-4 pl-6 text-xs text-slate-400 font-bold">${String(m.Waktu).substring(0, 16)}<br><span class="text-[10px] text-blue-500 uppercase"><i class="fa-solid fa-store mr-1"></i>${rawCabang}</span></td><td class="p-4 font-bold text-slate-800">${m.ID_Produk}</td><td class="p-4 font-black ${col}">${m.Jenis_Pergerakan} <span class="bg-slate-100 px-2 py-1 rounded text-slate-600 ml-2 border border-slate-200">${m.Jumlah}</span></td><td class="p-4 text-xs text-slate-500 font-bold">${m.Keterangan}</td></tr>`; 
        }); 
    } 
    
    let elS = document.getElementById('tabel-pantau-body'); if(elS) elS.innerHTML = hS || `<tr><td colspan="3" class="p-8 text-center text-slate-400 font-bold">Tidak ada data untuk cabang ini.</td></tr>`; 
    let elM = document.getElementById('tabel-mutasi-body'); if(elM) elM.innerHTML = hM || `<tr><td colspan="4" class="p-8 text-center text-slate-400 font-bold">Belum ada mutasi di cabang ini.</td></tr>`; 
    let elO = document.getElementById('tabel-opname-body'); if(elO) elO.innerHTML = hO || `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-bold">Pilih kategori atau tidak ada data yang cocok.</td></tr>`; 
    
    hitungTotalOpname(); // Kalkulasi grand total setiap filter diubah
}

function hitungSelisih(id) { 
    let sys = parseFloat(document.getElementById('op-sys-'+id).innerText) || 0; 
    let fsk = parseFloat(document.getElementById('op-fisik-'+id).value) || 0; 
    let selisih = fsk - sys; 
    let el = document.getElementById('op-selisih-'+id); 
    el.innerText = selisih > 0 ? '+'+selisih : selisih; 
    el.className = `p-4 text-center font-black text-lg ${selisih === 0 ? 'text-slate-400' : (selisih > 0 ? 'text-emerald-500' : 'text-red-500')}`; 
    hitungTotalOpname(); // Kalkulasi real-time saat ngetik
}

// FUNGSI BARU: MENGHITUNG TOTAL QTY
function hitungTotalOpname() {
    let tSys = 0; let tFsk = 0;
    document.querySelectorAll('[id^="op-sys-"]').forEach(el => tSys += (parseFloat(el.innerText) || 0));
    document.querySelectorAll('[id^="op-fisik-"]').forEach(el => tFsk += (parseFloat(el.value) || 0));
    let tSel = tFsk - tSys;
    
    let eSys = document.getElementById('op-total-sys');
    let eFsk = document.getElementById('op-total-fsk');
    let eSel = document.getElementById('op-total-selisih');
    
    if(eSys) eSys.innerText = tSys;
    if(eFsk) eFsk.innerText = tFsk;
    if(eSel) {
        eSel.innerText = tSel > 0 ? '+' + tSel : tSel;
        eSel.className = `p-4 text-center font-black text-lg ${tSel === 0 ? 'text-slate-400' : (tSel > 0 ? 'text-emerald-500' : 'text-red-500')}`;
    }
}

function switchStokTab(tab, el) { ['pantau','mutasi','lacak','opname', 'transfer'].forEach(t => document.getElementById('stok-'+t).classList.add('hidden')); el.parentElement.querySelectorAll('.tab-custom').forEach(e => e.classList.remove('active')); document.getElementById('stok-'+tab).classList.remove('hidden'); el.classList.add('active'); }

async function simpanOpnameMassal() { 
    let payloadItems = []; 
    if(state.tempOpnameGroup && state.tempOpnameGroup.length > 0) { 
        state.tempOpnameGroup.forEach((g, idx) => { 
            let fisikEl = document.getElementById('op-fisik-'+idx);
            if(fisikEl) { 
                let fskTotal = parseFloat(fisikEl.value) || 0; 
                let sysTotal = g.Stok_Saat_Ini; 
                let ketEl = document.getElementById('op-ket-'+idx);
                let ket = ketEl ? ketEl.value || "Pengecekan Harian" : "Pengecekan Harian"; 
                let selisihTotal = fskTotal - sysTotal; 
                
                if(selisihTotal !== 0 || ket !== "Pengecekan Harian") { 
                    // LOGIKA DISTRIBUSI: Membagi selisih total ke dalam masing-masing IMEI
                    let sisaFsk = fskTotal;
                    for (let i = 0; i < g.Products.length; i++) {
                        let p = g.Products[i];
                        let orig = parseFloat(p.Stok_Saat_Ini) || 0;
                        let alloc = 0;

                        if (selisihTotal < 0) {
                            alloc = Math.min(orig, sisaFsk); // Kurangi sampai sisaFsk habis
                            sisaFsk -= alloc;
                        } else {
                            alloc = orig;
                            if (i === 0) alloc += selisihTotal; // Tumpuk kelebihan ke IMEI pertama
                            sisaFsk -= alloc;
                        }

                        let diff = alloc - orig;
                        if (diff !== 0 || ket !== "Pengecekan Harian") {
                            payloadItems.push({ 
                                id: p.ID_Produk, 
                                fisik: alloc, 
                                selisih: diff, 
                                keterangan: ket, 
                                cabang: state.cabang 
                            }); 
                        }
                    }
                } 
            }
        }); 
    } 
    if(payloadItems.length === 0) return showInlineNotif('info', 'Tidak ada selisih stok (Balance semua).'); 
    showInlineNotif('info', 'Menyimpan hasil Opname...'); 
    let res = await requestAPIWithAuth('prosesStokOpname', { items: payloadItems });
    if(res.status) { showInlineNotif('success', res.msg); syncDataLiveBackground(); } else { showInlineNotif('error', res.msg); } 
}

function cetakFormOpname() {
    if (!state.tempOpnameGroup || state.tempOpnameGroup.length === 0) { 
        return showInlineNotif('error', 'Tidak ada data produk yang cocok untuk dicetak!'); 
    }

    let namaToko = localStorage.getItem('sanstech_nama_toko') || "BLANGKON ERP";
    let filterEl = document.getElementById('stok-filter-cabang');
    let filterCabang = filterEl ? filterEl.value.toUpperCase().trim() : 'SEMUA';
    let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
    let myCab = String(state.cabang).toUpperCase().trim();
    
    let opKatEl = document.getElementById('opname-filter-kat');
    let namaKategori = opKatEl ? opKatEl.options[opKatEl.selectedIndex].text : 'Semua';

    let targetCabangName = roleNorm !== 'SUPERADMIN' ? myCab : (filterCabang === 'SEMUA' ? 'Semua Cabang' : filterCabang);
    if(targetCabangName !== 'Semua Cabang' && targetCabangName !== 'PUSAT') { namaToko += " - " + targetCabangName; }

    let iframe = document.getElementById('print-iframe'); 
    let doc = iframe.contentWindow.document; 
    
    let html = `<html><head><title>Form Stok Opname</title><style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: black; font-size: 11px; padding: 0; margin: 0; }
        h2 { text-align: center; margin-bottom: 5px; text-transform: uppercase; font-size: 16px; }
        .info { margin-bottom: 15px; font-size: 12px; display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #000; padding: 6px; text-align: left; vertical-align: middle; }
        th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
        .group-header { background-color: #e2e8f0; font-weight: bold; text-align: left; font-size: 12px; }
        .ttd-container { display: table; width: 100%; margin-top: 30px; }
        .ttd-box { display: table-cell; width: 33%; text-align: center; font-size: 12px; }
        .line { border-bottom: 1px solid #000; display: inline-block; width: 150px; margin-top: 50px; }
    </style></head><body>`;
    
    html += `<h2>FORM KERTAS KERJA STOK OPNAME FISIK</h2>`;
    html += `<div class="info">
        <div><b>Toko/Cabang:</b> ${namaToko}<br><b>Filter Kategori:</b> ${namaKategori}</div>
        <div style="text-align:right;"><b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}<br><b>Dicetak Oleh:</b> ${state.user}</div>
    </div>`;
    
    html += `<table><thead><tr>
        <th width="5%">No</th>
        <th width="12%">Jml Unit/IMEI</th>
        <th width="38%">Nama Produk & Satuan</th>
        <th width="10%">Total Sistem</th>
        <th width="15%">Total Fisik Aktual</th>
        <th width="20%">Catatan Selisih</th>
    </tr></thead><tbody>`;
    
    let currentGroup = ""; let no = 1; let totalSysPrint = 0;
    
    // Looping data yang sudah digabungkan dari tempOpnameGroup
    state.tempOpnameGroup.forEach((g) => {
        let kat = String(g.Kategori || "LAINNYA").toUpperCase();
        let brand = String(g.Nama_Produk || "TANPA NAMA").trim().split(' ')[0].toUpperCase();
        let group = `KATEGORI: ${kat} | MEREK: ${brand}`;

        if(group !== currentGroup) {
            html += `<tr><td colspan="6" class="group-header">${group}</td></tr>`;
            currentGroup = group;
        }
        
        let idLabel = g.Products.length > 1 ? `<b>${g.Products.length} Unit</b>` : `<span style="font-size:9px;">${g.Products[0].ID_Produk}</span>`;

        html += `<tr>
            <td style="text-align:center;">${no++}</td>
            <td style="text-align:center;">${idLabel}</td>
            <td><b>${g.Nama_Produk}</b><br><span style="font-size:9px; color:#555;">Satuan: ${g.Satuan}</span></td>
            <td style="text-align:center; font-weight:bold; font-size:14px;">${g.Stok_Saat_Ini}</td>
            <td></td>
            <td></td>
        </tr>`;
        
        // HITUNG TOTAL UNTUK CETAK KERTAS
        totalSysPrint += parseFloat(g.Stok_Saat_Ini) || 0;
    });
    
    // TAMBAHKAN BARIS TOTAL DI KERTAS CETAK
    html += `<tr>
        <td colspan="3" style="text-align:right; font-weight:bold; padding:8px;">TOTAL KESELURUHAN (QTY):</td>
        <td style="text-align:center; font-weight:bold; font-size:14px;">${totalSysPrint}</td>
        <td></td><td></td>
    </tr>`;
    
    html += `</tbody></table>`;
    html += `<div class="ttd-container"><div class="ttd-box">Dihitung Oleh (Checker),<br><span class="line"></span><br>Staff Gudang</div><div class="ttd-box">Diinput Oleh (Admin),<br><span class="line"></span><br>${state.user}</div><div class="ttd-box">Mengetahui,<br><span class="line"></span><br>Kepala Toko / SPV</div></div></body></html>`;
    
    doc.open(); doc.write(html); doc.close(); 
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 800);
}

async function prosesTransferGudang() {
  let cbgTujuan = document.getElementById('tf-tujuan').value.trim(); let prdVal = document.getElementById('tf-produk').value.trim(); let qty = parseFloat(document.getElementById('tf-qty').value);
  if(!cbgTujuan || !prdVal || !qty || qty <= 0) return showInlineNotif('error', 'Cabang, Produk, dan Qty wajib diisi dengan benar!');
  if(cbgTujuan === state.cabang) return showInlineNotif('error', 'Tidak bisa transfer ke cabang yang sama!');
  let prd = state.data.produk.find(p => String(p.ID_Produk) === prdVal || String(p.Barcode) === prdVal);
  if(!prd) return showInlineNotif('error', 'Produk tidak ditemukan di Gudang Anda!');
  if(qty > parseFloat(prd.Stok_Saat_Ini)) return showInlineNotif('error', `Gagal! Stok gudang Anda tidak cukup. Sisa: ${prd.Stok_Saat_Ini}`);
  let payload = { id_produk: prd.ID_Produk, qty: qty, cabang_asal: state.cabang, cabang_tujuan: cbgTujuan };
  let btn = document.getElementById('btn-tf'); btn.innerHTML = "Memproses Transfer..."; btn.disabled = true;
  let res = await requestAPIWithAuth('prosesTransferCabang', payload);
  if(res.status) { showInlineNotif('success', `Berhasil! ${qty} unit dipindah ke ${cbgTujuan}`); document.getElementById('tf-produk').value = ""; document.getElementById('tf-qty').value = ""; syncDataLiveBackground(); } 
  else { showInlineNotif('error', res.msg); }
  btn.innerHTML = "Proses Pindah Gudang"; btn.disabled = false;
}

function lacakImeiBarang() { 
  let val = document.getElementById('input-lacak-imei').value.trim(); 
  if(!val) return showInlineNotif('error', "Masukkan Barcode / IMEI!"); 
  let prd = state.data.produk.find(x => String(x.Barcode) === val || String(x.ID_Produk) === val); 
  if(!prd) { document.getElementById('hasil-lacak-imei').innerHTML = `<p class="text-center text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Data IMEI tidak ditemukan di sistem!</p>`; document.getElementById('hasil-lacak-imei').classList.remove('hidden'); return; } 
  let history = state.data.stok ? state.data.stok.filter(x => String(x.ID_Produk) === String(prd.ID_Produk)) : []; 
  let html = ` <div class="text-center mb-4 border-b pb-4"> <h4 class="font-black text-slate-800 text-lg mb-2">Hasil Lacak:<br><span class="text-blue-600">${prd.Nama_Produk}</span></h4> <div class="inline-block bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl mt-1 shadow-sm text-left"> <p class="text-xs font-bold text-blue-700 mb-1"><i class="fa-solid fa-location-dot mr-2"></i>Posisi Saat Ini: <span class="font-black uppercase">${prd.Cabang || 'Pusat'}</span></p> <p class="text-xs font-bold text-blue-700"><i class="fa-solid fa-box mr-2"></i>Sisa Stok Aktual: <span class="font-black">${prd.Stok_Saat_Ini} ${prd.Satuan || ''}</span></p> </div> </div>`; 
  if(history.length === 0) { html += `<p class="text-center text-slate-500 font-bold bg-slate-50 p-4 rounded-xl">Belum ada riwayat pergerakan.</p>`; } else { history.slice().reverse().forEach(h => { let isOut = parseFloat(h.Jumlah) < 0; let icon = isOut ? '<i class="fa-solid fa-arrow-up-right-from-square text-red-500"></i>' : '<i class="fa-solid fa-arrow-down-to-bracket text-emerald-500"></i>'; html += ` <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 mb-3 hover:bg-slate-50 transition"> <div class="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shrink-0">${icon}</div> <div class="flex-1"> <p class="font-bold text-sm text-slate-800">${h.Keterangan}</p> <div class="flex items-center gap-2 mt-1.5 flex-wrap"> <span class="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded border border-slate-200 font-black uppercase"><i class="fa-solid fa-store mr-1 text-slate-400"></i> ${h.Cabang || 'Pusat'}</span> <p class="text-[10px] font-bold text-slate-400">${String(h.Waktu).substring(0,16)}</p> </div> </div> <div class="text-right font-black text-xl ${isOut?'text-red-500':'text-emerald-500'}">${h.Jumlah>0?'+'+h.Jumlah:h.Jumlah}</div> </div>`; }); } 
  document.getElementById('hasil-lacak-imei').innerHTML = html; document.getElementById('hasil-lacak-imei').classList.remove('hidden'); 
}

// ====================================================================
// VIEW & FUNGSI: DATA PELANGGAN
// ====================================================================
function viewPelanggan() { 
  return `
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h3 class="font-black text-lg text-slate-800">Database Pelanggan</h3>
      
      <!-- TAMBAHAN: SEARCH BAR PELANGGAN -->
      <div class="relative w-full md:w-64">
         <i class="fa-solid fa-search absolute left-3 top-3 text-slate-400"></i>
         <input type="text" id="plg-search-db" onkeyup="filterPelangganUI()" class="w-full border border-slate-200 p-2 pl-9 rounded-lg text-sm font-bold outline-none focus:border-cyan-500 bg-white shadow-sm" placeholder="Cari Nama / ID...">
      </div>

      <div class="flex items-center gap-2">
          <button onclick="exportDataCSV('pelanggan')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white font-bold p-2.5 rounded-xl shadow-sm transition" title="Export Excel"><i class="fa-solid fa-file-excel"></i></button>
          <button onclick="bukaFormRelasi('PELANGGAN')" class="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition text-sm flex items-center"><i class="fa-solid fa-plus mr-2"></i>Pelanggan Baru</button>
      </div>
    </div>
    
    <div id="form-wrap-plg" class="hidden bg-slate-50 p-5 rounded-2xl border border-cyan-100 mb-6 relative shadow-sm">
      <h4 class="font-black text-cyan-700 mb-4 pb-2 border-b border-cyan-200">Tambah Pelanggan Baru</h4>
      <div id="plg-inline-notif" class="hidden text-xs font-bold p-3 rounded-lg mb-4 border block"></div>
      
      <p class="text-xs font-bold text-slate-400 mb-2 uppercase border-b border-slate-200 pb-1">Data Utama</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Nama Lengkap *</label><input type="text" id="plg-nm" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></div>
        <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">No Handphone / WA *</label><input type="text" id="plg-hp" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></div>
        <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Grup Pelanggan</label>
            <select id="plg-grup" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500">
                <option value="UMUM">UMUM</option>
                <option value="RESELLER">RESELLER</option>
                <option value="GROSIR">GROSIR</option>
                <option value="VIP">VIP</option>
            </select>
        </div>
      </div>

      <p class="text-xs font-bold text-slate-400 mb-2 uppercase border-b border-slate-200 pb-1">Data Domisili / Alamat</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Provinsi</label><input type="text" id="plg-provinsi" placeholder="Cth: Jawa Tengah" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></div>
        <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Kota / Kabupaten</label><input type="text" id="plg-kota" placeholder="Cth: Semarang" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></div>
        <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Kecamatan</label><input type="text" id="plg-kecamatan" placeholder="Cth: Banyumanik" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></div>
        <div class="md:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Kelurahan</label><input type="text" id="plg-kelurahan" placeholder="Cth: Srondol Wetan" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></div>
        <div class="md:col-span-4"><label class="text-[10px] font-bold text-slate-500 uppercase">Jalan / Detail Alamat</label><textarea id="plg-jalan" rows="2" placeholder="Cth: Jl. Merdeka Raya No.45 RT 01 RW 02" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-cyan-500"></textarea></div>
      </div>

      <div class="flex gap-2">
        <button onclick="simpanRelasi('PELANGGAN')" id="btn-submit-plg" class="bg-cyan-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow hover:bg-cyan-700 transition">Simpan Data Pelanggan</button>
        <button onclick="document.getElementById('form-wrap-plg').classList.add('hidden')" class="bg-slate-200 text-slate-600 font-bold px-6 py-2.5 rounded-lg text-sm hover:bg-slate-300 transition">Batal</button>
      </div>
    </div>
    
    <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
      <table class="w-full text-left min-w-[800px]">
        <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-10 shadow-sm">
          <tr><th class="p-4 pl-6">ID & Nama</th><th class="p-4">Kontak & Lokasi</th><th class="p-4">Poin & Piutang</th><th class="p-4 pr-6 text-center">Aksi</th></tr>
        </thead>
        <tbody id="tabel-pelanggan-ui" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody>
      </table>
    </div>
  </div>

  <div id="modal-riwayat-plg" class="fixed inset-0 bg-black/60 z-[105] hidden items-center justify-center p-5">
     <div class="bg-white p-6 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
       <div class="flex justify-between items-center mb-4 border-b pb-2">
         <h3 class="font-black text-lg text-blue-700" id="riwayat-plg-title">Riwayat Pembelian</h3>
         <button onclick="document.getElementById('modal-riwayat-plg').classList.replace('flex','hidden')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-xmark text-xl"></i></button>
       </div>
       <div class="flex-1 overflow-y-auto mb-4 pr-2" id="riwayat-plg-body"></div>
     </div>
  </div>
  `; 
}

function filterPelangganUI() { 
    let searchEl = document.getElementById('plg-search-db');
    let searchVal = searchEl ? searchEl.value.toLowerCase().trim() : '';
    let html = ""; 
    
    if(state.data.pelanggan && state.data.pelanggan.length > 0) { 
        let filteredData = state.data.pelanggan.filter(p => {
            if(!searchVal) return true;
            return String(p.Nama_Pelanggan).toLowerCase().includes(searchVal) || 
                   String(p.ID_Pelanggan).toLowerCase().includes(searchVal) ||
                   String(p.No_HP).toLowerCase().includes(searchVal);
        });

        if(filteredData.length === 0) {
            html = `<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold">Pelanggan tidak ditemukan.</td></tr>`;
        } else {
            filteredData.forEach(p => { 
                let grupBadge = p.Grup_Pelanggan ? p.Grup_Pelanggan : 'UMUM';
                let grupClass = grupBadge === 'VIP' ? 'bg-purple-100 text-purple-600 border-purple-200' : (grupBadge === 'RESELLER' ? 'bg-blue-100 text-blue-600 border-blue-200' : (grupBadge === 'GROSIR' ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-slate-100 text-slate-600 border-slate-200'));
                
                html += `<tr class="hover:bg-slate-50 transition">
                    <td class="p-4 pl-6"><p class="font-bold text-slate-800">${p.Nama_Pelanggan}</p><div class="flex items-center gap-2 mt-1"><span class="text-[10px] font-mono text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded font-black border border-cyan-100">${p.ID_Pelanggan}</span><span class="text-[9px] px-1.5 py-0.5 rounded font-black border uppercase ${grupClass}">${grupBadge}</span></div></td>
                    <td class="p-4 text-sm text-slate-600"><i class="fa-solid fa-phone text-slate-400 text-[10px] mr-1"></i> ${p.No_HP||'-'}<br><span class="text-[10px] text-slate-400"><i class="fa-solid fa-map-location-dot mr-1"></i> ${p.Alamat||'-'}</span></td>
                    <td class="p-4"><p class="text-emerald-600 font-black"><i class="fa-solid fa-star text-yellow-400 mr-1"></i> ${p.Poin_Member||0} Poin</p><p class="text-xs text-red-500 font-bold mt-1">Piutang: ${formatRp(p.Piutang||0)}</p></td>
                    <td class="p-4 pr-6 text-center"><button onclick="lihatRiwayatPelanggan('${p.ID_Pelanggan}')" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition shadow-sm border border-blue-100"><i class="fa-solid fa-clock-rotate-left mr-1"></i> Riwayat</button></td>
                </tr>`; 
            }); 
        }
    } else {
        html = `<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold">Data Pelanggan Kosong</td></tr>`;
    }
    let el = document.getElementById('tabel-pelanggan-ui'); 
    if(el) el.innerHTML = html; 
}
function bukaFormRelasi(tipe) { 
    let pref = tipe === 'PELANGGAN' ? 'plg' : 'sup'; 
    document.getElementById('form-wrap-'+pref).classList.remove('hidden'); 
    document.getElementById(pref+'-inline-notif').classList.add('hidden'); 
    
    if(tipe === 'PELANGGAN') {
        ['plg-nm', 'plg-hp', 'plg-jalan', 'plg-kelurahan', 'plg-kecamatan', 'plg-kota', 'plg-provinsi'].forEach(id => {
            if(document.getElementById(id)) document.getElementById(id).value = "";
        });
        document.getElementById('plg-grup').value = "UMUM";
    } else {
        ['sup-nm', 'sup-hp', 'sup-al'].forEach(id => {
            if(document.getElementById(id)) document.getElementById(id).value = ""; 
        });
    }
}

async function simpanRelasi(tipe) { 
    let pref = tipe === 'PELANGGAN' ? 'plg' : 'sup'; 
    let nm = document.getElementById(pref+'-nm').value.trim(); 
    let hp = document.getElementById(pref+'-hp').value.trim(); 
    let notif = document.getElementById(pref+'-inline-notif'); 
    
    if(!nm || !hp) { 
        notif.innerText="Nama dan Nomor HP Wajib Diisi!"; 
        notif.className="text-xs font-bold p-3 rounded-lg mb-4 bg-red-50 text-red-500 border border-red-100 block"; 
        return; 
    } 
    
    let btn = document.getElementById('btn-submit-'+pref); 
    btn.innerText = "Memproses..."; btn.disabled = true; 
    
    let obj = {};
    if (tipe === 'PELANGGAN') {
        let jalan = document.getElementById('plg-jalan').value.trim();
        let kel = document.getElementById('plg-kelurahan').value.trim();
        let kec = document.getElementById('plg-kecamatan').value.trim();
        let kota = document.getElementById('plg-kota').value.trim();
        let prov = document.getElementById('plg-provinsi').value.trim();
        
        let arrAlamat = [jalan, kel, kec, kota, prov].filter(val => val !== "");
        let alamatLengkap = arrAlamat.length > 0 ? arrAlamat.join(', ') : "-";

        obj = {
            Nama_Pelanggan: nm, 
            No_HP: hp, 
            Grup_Pelanggan: document.getElementById('plg-grup').value, 
            Alamat: alamatLengkap, 
            Poin_Member: 0, 
            Piutang: 0
        }; 
    } else {
        obj = {
            Nama_Supplier: nm, 
            Kontak: hp, 
            Alamat: document.getElementById('sup-al').value.trim() || "-", 
            Hutang: 0
        };
    } 
    
    let res = await requestAPIWithAuth('crudDataMaster', {
        modul: tipe === 'PELANGGAN' ? 'Pelanggan' : 'Supplier', 
        action: 'CREATE', 
        key: tipe === 'PELANGGAN' ? 'ID_Pelanggan' : 'ID_Supplier', 
        id: '', 
        obj: obj
    });

    if(res.status) { 
        document.getElementById('form-wrap-'+pref).classList.add('hidden'); 
        syncDataLiveBackground(); 
        showInlineNotif('success', 'Data tersimpan!'); 
    } else { 
        notif.innerText=res.msg; 
        notif.className="text-xs font-bold p-3 rounded-lg mb-4 bg-red-50 text-red-500 border border-red-100 block"; 
    } 
    btn.innerText = "Simpan Data"; btn.disabled = false; 
}
function lihatRiwayatPelanggan(id) {
    let plg = state.data.pelanggan.find(p => p.ID_Pelanggan === id);
    let nama = plg ? plg.Nama_Pelanggan : id;
    document.getElementById('riwayat-plg-title').innerText = "Riwayat: " + nama;
    let riwayat = state.data.penjualan ? state.data.penjualan.filter(t => t.ID_Pelanggan === id) : [];
    let html = `<table class="w-full text-left text-sm"><tr class="border-b bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider"><th class="p-3">Waktu & Invoice</th><th class="p-3">Total / Metode</th><th class="p-3 text-center">Status</th></tr>`;
    if(riwayat.length === 0) {
        html += `<tr><td colspan="3" class="p-6 text-center text-slate-400 font-bold">Belum ada riwayat transaksi.</td></tr>`;
    } else {
        riwayat.slice().reverse().forEach(r => {
            let stClass = r.Status === 'LUNAS' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (r.Status === 'RETUR' ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200');
            html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                <td class="p-3 font-bold text-slate-700">
                    <span class="text-[10px] text-slate-400 font-normal">${String(r.Waktu).substring(0,16)}</span><br>
                    <a href="javascript:void(0)" onclick="lihatDetailInvoice('${r.ID_Invoice}')" class="text-blue-600 hover:underline text-xs" title="Klik lihat struk">${r.ID_Invoice}</a>
                </td>
                <td class="p-3">
                    <p class="font-black text-slate-800">${formatRp(r.Total_Akhir)}</p>
                    <p class="text-[10px] font-bold text-slate-500 uppercase">${r.Metode_Pembayaran}</p>
                </td>
                <td class="p-3 text-center"><span class="px-2 py-1 rounded text-[9px] font-black uppercase border ${stClass}">${r.Status}</span></td>
            </tr>`;
        });
    }
    html += `</table>`;
    document.getElementById('riwayat-plg-body').innerHTML = html;
    document.getElementById('modal-riwayat-plg').classList.replace('hidden', 'flex');
}

// ====================================================================
// VIEW & FUNGSI: DATABASE SUPPLIER
// ====================================================================
function viewSupplier() { 
  return `
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative">
    <div class="flex justify-between items-center mb-6">
      <h3 class="font-black text-lg text-slate-800">Database Supplier</h3>
      <div class="flex items-center gap-2">
          <button onclick="exportDataCSV('supplier')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white font-bold p-2.5 rounded-xl shadow-sm transition" title="Export Excel"><i class="fa-solid fa-file-excel"></i></button>
          <button onclick="bukaFormRelasi('SUPPLIER')" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition text-sm flex items-center"><i class="fa-solid fa-plus mr-2"></i>Supplier Baru</button>
      </div>
    </div>
    <div id="form-wrap-sup" class="hidden bg-slate-50 p-5 rounded-2xl border border-yellow-100 mb-6 relative shadow-sm">
      <h4 class="font-black text-yellow-700 mb-4 pb-2 border-b border-yellow-200">Tambah Supplier</h4>
      <div id="sup-inline-notif" class="hidden text-xs font-bold p-3 rounded-lg mb-4 border block"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div><label class="text-[10px] font-bold text-slate-500 uppercase">Nama Perusahaan/Supplier</label><input type="text" id="sup-nm" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-yellow-500"></div>
        <div><label class="text-[10px] font-bold text-slate-500 uppercase">Kontak PIC / Sales</label><input type="text" id="sup-hp" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-yellow-500"></div>
        <div class="md:col-span-2"><label class="text-[10px] font-bold text-slate-500 uppercase">Alamat Lengkap</label><input type="text" id="sup-al" class="w-full border border-slate-200 p-2.5 rounded-lg font-bold bg-white outline-none focus:border-yellow-500"></div>
      </div>
      <div class="flex gap-2">
        <button onclick="simpanRelasi('SUPPLIER')" id="btn-submit-sup" class="bg-yellow-500 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow hover:bg-yellow-600 transition">Simpan</button>
        <button onclick="document.getElementById('form-wrap-sup').classList.add('hidden')" class="bg-slate-200 text-slate-600 font-bold px-6 py-2.5 rounded-lg text-sm hover:bg-slate-300 transition">Batal</button>
      </div>
    </div>
    <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
      <table class="w-full text-left min-w-[800px]">
        <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-10 shadow-sm">
          <tr><th class="p-4 pl-6">ID & Nama Pemasok</th><th class="p-4">Kontak & Alamat</th><th class="p-4">Hutang Aktif</th><th class="p-4 pr-6 text-center">Aksi</th></tr>
        </thead>
        <tbody id="tabel-supplier-ui" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody>
      </table>
    </div>
  </div>
  <div id="modal-riwayat-sup" class="fixed inset-0 bg-black/60 z-[105] hidden items-center justify-center p-5">
     <div class="bg-white p-6 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
       <div class="flex justify-between items-center mb-4 border-b pb-2">
         <h3 class="font-black text-lg text-yellow-600" id="riwayat-sup-title">Performa Supplier</h3>
         <button onclick="document.getElementById('modal-riwayat-sup').classList.replace('flex','hidden')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-xmark text-xl"></i></button>
       </div>
       <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="bg-blue-50 border border-blue-100 p-3 rounded-xl text-center"><p class="text-[10px] font-bold text-blue-600 uppercase">Total PO / Order</p><p class="text-lg md:text-2xl font-black text-blue-800" id="rs-tot-po">0</p></div>
          <div class="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-center"><p class="text-[10px] font-bold text-emerald-600 uppercase">Total Nilai Pembelian</p><p class="text-lg md:text-xl font-black text-emerald-800 truncate" id="rs-tot-nilai">Rp 0</p></div>
          <div class="bg-red-50 border border-red-100 p-3 rounded-xl text-center shadow-inner"><p class="text-[10px] font-bold text-red-600 uppercase">Hutang (Belum Lunas)</p><p class="text-lg md:text-xl font-black text-red-800 truncate" id="rs-tot-hutang">Rp 0</p></div>
       </div>
       <p class="text-xs font-bold text-slate-400 uppercase mb-2">Riwayat Purchase Order (PO)</p>
       <div class="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
           <table class="w-full text-left text-sm">
               <thead class="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 shadow-sm">
                   <tr><th class="p-3 pl-4">Tanggal & No. PO</th><th class="p-3">Total Tagihan</th><th class="p-3 text-center">Status Pembayaran</th></tr>
               </thead>
               <tbody id="riwayat-sup-body" class="divide-y divide-slate-100"></tbody>
           </table>
       </div>
     </div>
  </div>
  `; 
}
function filterSupplierUI() { 
    let html = ""; 
    if(state.data.supplier) { 
        state.data.supplier.forEach(p => { 
            let riwayat = state.data.pembelian ? state.data.pembelian.filter(t => t.ID_Supplier === p.ID_Supplier) : [];
            let totalHutangReal = 0;
            riwayat.forEach(r => { if(r.Status_Bayar === 'HUTANG') totalHutangReal += parseFloat(r.Total_Tagihan || 0); });
            let hutangClass = totalHutangReal > 0 ? 'text-red-500 bg-red-50 border-red-200' : 'text-slate-400 bg-slate-50 border-slate-200';
            html += `<tr class="hover:bg-slate-50 transition">
                <td class="p-4 pl-6"><p class="font-bold text-slate-800">${p.Nama_Supplier}</p><p class="text-[10px] text-yellow-600 font-mono mt-1">${p.ID_Supplier}</p></td>
                <td class="p-4 text-sm text-slate-600"><i class="fa-solid fa-phone text-slate-400 text-[10px] mr-1"></i> ${p.Kontak||'-'}<br><span class="text-[10px] text-slate-400"><i class="fa-solid fa-building mr-1"></i> ${p.Alamat||'-'}</span></td>
                <td class="p-4"><span class="px-2 py-1 rounded text-xs font-black border ${hutangClass}">${formatRp(totalHutangReal)}</span></td>
                <td class="p-4 pr-6 text-center"><button onclick="lihatRiwayatSupplier('${p.ID_Supplier}')" class="bg-yellow-50 text-yellow-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-500 hover:text-white transition shadow-sm border border-yellow-100"><i class="fa-solid fa-chart-simple mr-1"></i> Cek Performa</button></td>
            </tr>`; 
        }); 
    } 
    let el = document.getElementById('tabel-supplier-ui'); 
    if(el) el.innerHTML = html || `<tr><td colspan="4" class="p-10 text-center text-slate-400 font-bold">Data Supplier Kosong</td></tr>`; 
}
function lihatRiwayatSupplier(id) {
    let sup = state.data.supplier.find(s => s.ID_Supplier === id);
    let nama = sup ? sup.Nama_Supplier : id;
    document.getElementById('riwayat-sup-title').innerHTML = `<i class="fa-solid fa-truck-fast mr-2"></i> ` + nama;
    let riwayat = state.data.pembelian ? state.data.pembelian.filter(t => t.ID_Supplier === id) : [];
    let totalPO = riwayat.length;
    let totalNilai = 0;
    let totalHutang = 0;
    let html = "";
    if(riwayat.length === 0) {
        html += `<tr><td colspan="3" class="p-6 text-center text-slate-400 font-bold">Belum ada riwayat Purchase Order (PO).</td></tr>`;
    } else {
        riwayat.slice().reverse().forEach(r => {
            let nominal = parseFloat(r.Total_Tagihan || 0);
            totalNilai += nominal;
            if(r.Status_Bayar === 'HUTANG') totalHutang += nominal;
            let stClass = r.Status_Bayar === 'LUNAS' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200';
            html += `<tr class="hover:bg-slate-50 transition">
                <td class="p-3 pl-4 font-bold text-slate-700">
                    <span class="text-[10px] text-slate-400 font-normal">${String(r.Waktu).substring(0,16)}</span><br>
                    <span class="text-blue-600 text-xs">${r.ID_PO}</span>
                </td>
                <td class="p-3 font-black text-slate-800">${formatRp(nominal)}</td>
                <td class="p-3 text-center"><span class="px-2 py-1 rounded text-[9px] font-black uppercase border ${stClass}">${r.Status_Bayar}</span></td>
            </tr>`;
        });
    }
    document.getElementById('rs-tot-po').innerText = totalPO;
    document.getElementById('rs-tot-nilai').innerText = formatRp(totalNilai);
    document.getElementById('rs-tot-hutang').innerText = formatRp(totalHutang);
    document.getElementById('riwayat-sup-body').innerHTML = html;
    document.getElementById('modal-riwayat-sup').classList.replace('hidden', 'flex');
}

// ====================================================================
// VIEW & FUNGSI: PEMBELIAN (PURCHASE ORDER) & HUTANG
// ====================================================================
function viewPembelian() { 
  let optSup = `<option value="">-- Pilih Supplier --</option>`; 
  if(state.data.supplier) { state.data.supplier.forEach(s => { optSup += `<option value="${s.ID_Supplier}">${s.Nama_Supplier}</option>`; }); } 
  return `
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative">
    <div class="flex justify-between items-center mb-6">
       <h3 class="font-black text-lg text-slate-800">Manajemen Pembelian (PO)</h3>
       <button onclick="exportDataCSV('pembelian')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs flex items-center"><i class="fa-solid fa-file-excel mr-2"></i> Export PO</button>
    </div>
    <div class="flex gap-4 border-b-2 border-slate-200 mb-6 font-bold text-sm overflow-x-auto">
        <div class="tab-custom active" id="tab-po-buat" onclick="gantiTabPO('buat')">Buat PO Baru</div>
        <div class="tab-custom" id="tab-po-riwayat" onclick="gantiTabPO('riwayat')">Riwayat & Hutang PO</div>
    </div>
    <div id="konten-po-buat" class="flex-1 flex flex-col min-h-0">
        <div id="po-inline-notif" class="hidden text-xs font-bold p-3 rounded-lg mb-4 border block"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
            <div class="flex flex-col gap-4">
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label class="text-xs font-bold text-slate-500 uppercase">Pilih Supplier</label>
                    <select id="po-sup" class="w-full border border-slate-200 p-3 rounded-xl mt-1 font-bold outline-none focus:border-blue-500">${optSup}</select>
                </div>
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 flex-1 overflow-auto flex flex-col">
                    <label class="text-xs font-bold text-slate-500 uppercase mb-2">Tambahkan Produk ke PO</label>
                    <div class="flex gap-2 mb-4">
                        <select id="po-prd-select" class="flex-1 border border-slate-200 p-2 rounded-lg text-sm font-bold outline-none focus:border-blue-500">
                            <option value="">-- Pilih Produk --</option>
                            ${state.data.produk ? state.data.produk.map(p => `<option value="${p.ID_Produk}">${p.Nama_Produk} (Modal: ${formatRp(p.Harga_Beli)})</option>`).join('') : ''}
                        </select>
                        <input type="number" id="po-prd-qty" placeholder="Qty" class="w-20 border border-slate-200 p-2 rounded-lg text-sm font-bold text-center outline-none focus:border-blue-500">
                        <button onclick="tambahItemPO()" class="bg-blue-600 hover:bg-blue-700 transition text-white px-3 rounded-lg"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div id="po-cart-ui" class="flex-1 bg-white border border-slate-200 rounded-lg p-2 overflow-y-auto space-y-2"></div>
                </div>
            </div>
            <div class="bg-slate-900 text-white p-6 rounded-2xl shadow-inner flex flex-col">
                <h4 class="text-slate-400 font-bold mb-4 border-b border-white/10 pb-2">Ringkasan Pembelian</h4>
                <div class="flex justify-between mb-2"><span class="text-sm">Total Item:</span><span id="po-sum-item" class="font-black">0</span></div>
                <div class="flex justify-between mb-6"><span class="text-sm">Estimasi Subtotal:</span><span id="po-sum-rp" class="font-black text-emerald-400 text-xl">Rp 0</span></div>
                <label class="text-xs font-bold text-slate-400 uppercase">Status Pembayaran</label>
                <select id="po-status" class="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl mt-1 mb-6 font-bold outline-none">
                    <option value="LUNAS">Bayar LUNAS (Potong Kas)</option>
                    <option value="HUTANG">HUTANG (Bayar Nanti)</option>
                </select>
                <div class="mt-auto">
                    <button onclick="bukaModalConfirm('Simpan PO', 'Yakin memproses Pembelian ini?', 'po', simpanDataPO)" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg transition text-base">SIMPAN & TERIMA BARANG</button>
                </div>
            </div>
        </div>
    </div>
    <div id="konten-po-riwayat" class="hidden flex-1 flex flex-col">
        <div class="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-xl mb-4 text-xs font-bold">
            <i class="fa-solid fa-circle-info mr-1"></i> Data tagihan HUTANG akan otomatis memotong Kas Keuangan saat ditekan tombol <b>Bayar Lunas</b>.
        </div>
        <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
            <table class="w-full text-left min-w-[900px]">
                <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 shadow-sm z-10">
                    <tr><th class="p-4 pl-6">No. PO & Waktu</th><th class="p-4">Supplier</th><th class="p-4">Total Tagihan</th><th class="p-4">Status</th><th class="p-4 pr-6 text-center">Aksi Manajemen</th></tr>
                </thead>
                <tbody id="tabel-riwayat-po-body" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody>
            </table>
        </div>
    </div>
  </div>
  `; 
}
function gantiTabPO(tab) { 
    document.getElementById('konten-po-buat').classList.add('hidden'); 
    document.getElementById('konten-po-riwayat').classList.add('hidden'); 
    document.getElementById('tab-po-buat').className = "tab-custom"; 
    document.getElementById('tab-po-riwayat').className = "tab-custom"; 
    document.getElementById(`konten-po-${tab}`).classList.remove('hidden'); 
    document.getElementById(`tab-po-${tab}`).className = "tab-custom active"; 
    if(tab === 'riwayat') renderRiwayatPO(); 
}
function renderRiwayatPO() {
    let html = ""; 
    if(!state.data.pembelian || state.data.pembelian.length === 0) { 
        html = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-bold">Belum ada riwayat pembelian (PO).</td></tr>`; 
    } else { 
        state.data.pembelian.slice().reverse().forEach(t => { 
            let sup = state.data.supplier.find(s => s.ID_Supplier === t.ID_Supplier);
            let namaSup = sup ? sup.Nama_Supplier : t.ID_Supplier;
            let stClass = t.Status_Bayar === 'LUNAS' ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : (t.Status_Bayar === 'RETUR' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-red-100 text-red-600 border-red-200'); 
            let actionBtns = `<button onclick="lihatDetailPO('${t.ID_PO}')" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition shadow-sm border border-blue-100 mr-2" title="Lihat Detail Barang"><i class="fa-solid fa-eye"></i> Detail</button>`;
            if(t.Status_Bayar === 'HUTANG') {
                actionBtns += `<button onclick="bukaModalConfirm('Bayar Hutang', 'Lunasi hutang PO ini? (Saldo Kas Anda akan terpotong).', 'po', function(){ eksekusiBayarHutangPO('${t.ID_PO}') })" class="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition shadow-sm border border-red-100 mr-2" title="Bayar Lunas"><i class="fa-solid fa-money-bill-wave"></i> Bayar Lunas</button>`;
            }
            if(t.Status_Bayar !== 'RETUR') {
                 actionBtns += `<button onclick="bukaModalConfirm('Retur Pembelian', 'Yakin meretur PO ini ke Supplier? Stok akan otomatis ditarik (dikurangi).', 'retur', function(){ eksekusiReturPO('${t.ID_PO}') })" class="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 hover:text-white transition shadow-sm border border-orange-100" title="Retur PO"><i class="fa-solid fa-rotate-left"></i> Retur</button>`;
            }
            html += `<tr class="hover:bg-slate-50 transition">
                <td class="p-4 pl-6"><p onclick="lihatDetailPO('${t.ID_PO}')" class="text-sm text-blue-600 font-black cursor-pointer hover:underline">#${t.ID_PO}</p><p class="text-[10px] text-slate-400 font-bold mt-1">${String(t.Waktu).substring(0,16)}</p></td>
                <td class="p-4"><p class="text-sm font-bold text-slate-800">${namaSup}</p><p class="text-[10px] text-slate-400">Oleh: ${t.Admin}</p></td>
                <td class="p-4 font-black text-slate-800">${formatRp(t.Total_Tagihan)}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-black uppercase border ${stClass}">${t.Status_Bayar}</span></td>
                <td class="p-4 pr-6 flex justify-center items-center h-full mt-2">${actionBtns}</td>
            </tr>`; 
        }); 
    } 
    document.getElementById('tabel-riwayat-po-body').innerHTML = html;
}
function lihatDetailPO(inv) { 
    let trx = state.data.pembelian.find(t => t.ID_PO === inv);
    let det = state.data.pembelian_detail ? state.data.pembelian_detail.filter(d => d.ID_PO === inv) : []; 
    let sup = state.data.supplier.find(s => s.ID_Supplier === (trx ? trx.ID_Supplier : ''));
    let html = `<div class="mb-4 text-xs flex justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div><p class="text-slate-500 font-bold">Supplier:</p><p class="font-black text-blue-600">${sup ? sup.Nama_Supplier : '-'}</p></div>
        <div class="text-right"><p class="text-slate-500 font-bold">Status:</p><p class="font-black uppercase">${trx ? trx.Status_Bayar : '-'}</p></div>
    </div>`;
    html += `<table class="w-full text-left text-sm mb-4"><tr class="border-b text-slate-500 text-xs uppercase"><th class="py-2">Item Produk</th><th class="text-center">Qty Masuk</th><th class="text-right">Harga Modal</th></tr>`; 
    if(det.length === 0) { 
        html += `<tr><td colspan="3" class="py-4 text-center text-slate-400 font-bold">Detail tidak ditemukan.</td></tr>`; 
    } else { 
        det.forEach(d => { 
            let prd = state.data.produk.find(p => p.ID_Produk === d.ID_Produk); 
            let nm = prd ? prd.Nama_Produk : d.ID_Produk; 
            html += `<tr class="border-b"><td class="py-2 font-bold text-slate-700">${nm}</td><td class="font-black text-center text-emerald-600">+${d.Qty}</td><td class="text-right font-bold text-slate-600">${formatRp(d.Total_Harga)}</td></tr>`; 
        }); 
    } 
    html += `</table>`; 
    if(trx) {
        html += `<div class="flex justify-between items-center bg-slate-900 text-white p-3 rounded-lg">
            <span class="text-xs font-bold uppercase tracking-wider">Total Tagihan</span>
            <span class="font-black text-emerald-400 text-xl">${formatRp(trx.Total_Tagihan)}</span>
        </div>`;
    }
    document.getElementById('detail-inv-title').innerText = "DETAIL BARANG PO #" + inv; 
    document.getElementById('detail-inv-body').innerHTML = html; 
    document.getElementById('modal-detail-inv').classList.replace('hidden','flex'); 
}
async function eksekusiBayarHutangPO(id) {
    showInlineNotif('info', 'Memproses pelunasan...');
    let res = await requestAPIWithAuth('bayarHutangPO', { id_po: id, admin: state.user });
    if(res.status) { showInlineNotif('success', res.msg); syncDataLiveBackground(); setTimeout(renderRiwayatPO, 1500); } 
    else { showInlineNotif('error', res.msg); }
}
async function eksekusiReturPO(id) {
    showInlineNotif('info', 'Memproses retur PO...');
    let res = await requestAPIWithAuth('prosesReturPembelian', { id_po: id, admin: state.user });
    if(res.status) { showInlineNotif('success', res.msg); syncDataLiveBackground(); setTimeout(renderRiwayatPO, 1500); } 
    else { showInlineNotif('error', res.msg); }
}
function tambahItemPO() {      let id = document.getElementById('po-prd-select').value;      let qty = parseFloat(document.getElementById('po-prd-qty').value);      if(!id || !qty || qty <= 0) return showInlineNotif('error', 'Pilih produk dan isi Qty!');      let prd = state.data.produk.find(p => p.ID_Produk === id);      if(prd) {          let hb = parseFloat(prd.Harga_Beli||0);          let idxAda = state.keranjangPO.findIndex(x => String(x.id_produk) === String(prd.ID_Produk));         if(idxAda > -1) {             state.keranjangPO[idxAda].qty += qty;             state.keranjangPO[idxAda].total = state.keranjangPO[idxAda].qty * state.keranjangPO[idxAda].harga_beli;         } else {             state.keranjangPO.push({ id_produk: prd.ID_Produk, nama: prd.Nama_Produk, qty: qty, harga_beli: hb, total: hb * qty });          }         document.getElementById('po-prd-qty').value = "";          renderKeranjangPO();      }  }
function hapusItemPO(idx) { state.keranjangPO.splice(idx, 1); renderKeranjangPO(); }
function renderKeranjangPO() { let html = "", sum = 0, jml = 0; if(state.keranjangPO.length === 0) { html = `<div class="text-center py-5 text-slate-300"><p class="text-xs font-bold">Belum ada item ditambahkan</p></div>`; } else { state.keranjangPO.forEach((k,i) => { sum+=k.total; jml+=k.qty; html += `<div class="p-2 border border-slate-100 rounded bg-slate-50 flex justify-between items-center"><div class="flex-1"><p class="text-xs font-bold text-slate-700">${k.nama}</p><p class="text-[10px] text-slate-400">${k.qty} x ${formatRp(k.harga_beli)}</p></div><div class="flex items-center gap-2"><p class="text-xs font-black text-blue-600">${formatRp(k.total)}</p><button onclick="hapusItemPO(${i})" class="text-red-500 px-2 hover:bg-red-100 rounded transition"><i class="fa-solid fa-xmark"></i></button></div></div>`; }); } let el = document.getElementById('po-cart-ui'); if(el) el.innerHTML = html; if(document.getElementById('po-sum-item')) { document.getElementById('po-sum-item').innerText = jml; document.getElementById('po-sum-rp').innerText = formatRp(sum); } }
async function simpanDataPO() { 
    let sup = document.getElementById('po-sup').value; let stat = document.getElementById('po-status').value; 
    if(!sup) return showInlineNotif('error', 'Supplier wajib dipilih!'); if(state.keranjangPO.length === 0) return showInlineNotif('error', 'List PO kosong!'); 
    let totalNominal = state.keranjangPO.reduce((sum, item) => sum + item.total, 0); 
    let payload = { id_supplier: sup, subtotal: totalNominal, total_tagihan: totalNominal, status_bayar: stat, admin: state.user, items: state.keranjangPO, cabang: state.cabang }; 
    showInlineNotif('info', 'Memproses Pembelian...'); 
    let res = await requestAPIWithAuth('prosesPembelianPO', payload);
    if(res.status) { showInlineNotif('success', res.msg); state.keranjangPO = []; renderKeranjangPO(); document.getElementById('po-sup').value = ""; syncDataLiveBackground(); } else showInlineNotif('error', res.msg); 
}

// ====================================================================
// VIEW & FUNGSI: LAPORAN BISNIS & ANALISIS FINANSIAL
// ====================================================================
function viewLaporan() { 
  return ` 
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full overflow-y-auto"> 
      <div class="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 border-b border-slate-200 pb-4">
          <h3 class="font-black text-xl text-slate-800"><i class="fa-solid fa-chart-pie text-blue-600 mr-2"></i> Pusat Analisis & Laporan Bisnis</h3>
      </div>
      <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
          <div class="flex flex-wrap gap-4 items-end mb-4">
             <div><label class="text-[10px] font-bold text-slate-500 uppercase">Dari Tanggal</label><br><input type="date" id="lap-start" onchange="renderChartLaporan()" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500 min-w-[160px]"></div>
             <div><label class="text-[10px] font-bold text-slate-500 uppercase">Sampai Tanggal</label><br><input type="date" id="lap-end" onchange="renderChartLaporan()" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500 min-w-[160px]"></div>
             <button onclick="renderChartLaporan()" class="bg-blue-600 hover:bg-blue-700 transition text-white px-6 py-2.5 rounded-lg font-black shadow-md"><i class="fa-solid fa-filter mr-2"></i> Terapkan Filter</button>
          </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"> 
        <div class="bg-white border-l-4 border-blue-500 p-5 rounded-xl shadow-sm"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Omset (Range)</p><p class="text-xl md:text-2xl font-black text-slate-800 truncate" id="lap-omset">Rp 0</p></div> 
        <div class="bg-white border-l-4 border-emerald-500 p-5 rounded-xl shadow-sm"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Laba Kotor (Range)</p><p class="text-xl md:text-2xl font-black text-emerald-600 truncate" id="lap-laba-kotor">Rp 0</p></div> 
        <div class="bg-white border-l-4 border-purple-500 p-5 rounded-xl shadow-sm"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Laba Bersih (Range)</p><p class="text-xl md:text-2xl font-black text-purple-600 truncate" id="lap-laba-bersih">Rp 0</p></div> 
        <div class="bg-slate-900 border-l-4 border-orange-500 p-5 rounded-xl shadow-md"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Saldo Kasir Aktual</p><p class="text-xl md:text-2xl font-black text-orange-400 truncate" id="lap-kas">Rp 0</p></div> 
      </div> 
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
          <h4 class="font-black text-slate-800 mb-4 border-b pb-3"><i class="fa-solid fa-tags text-cyan-500 mr-2"></i>Rincian Penjualan per Kategori (Lunas)</h4>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="lap-kategori"></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div class="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-800 mb-4 border-b pb-3"><i class="fa-solid fa-file-invoice-dollar text-emerald-500 mr-2"></i>Rincian Laba Rugi</h4>
              <div class="flex-1 space-y-3">
                  <div class="flex justify-between text-sm"><span class="text-slate-500 font-bold">Penjualan Kotor</span><span class="font-black text-slate-800" id="dtl-omset">Rp 0</span></div>
                  <div class="flex justify-between text-sm"><span class="text-slate-500 font-bold">Total HPP (Modal)</span><span class="font-black text-red-500" id="dtl-hpp">- Rp 0</span></div>
                  <div class="flex justify-between text-sm border-t border-dashed pt-3"><span class="text-blue-600 font-bold">Laba Kotor</span><span class="font-black text-blue-600" id="dtl-kotor">Rp 0</span></div>
                  <div class="flex justify-between text-sm mt-4"><span class="text-slate-500 font-bold">Pengeluaran Operasional</span><span class="font-black text-red-500" id="dtl-op">- Rp 0</span></div>
                  <div class="flex justify-between text-sm bg-purple-50 p-3 rounded-lg mt-3 border border-purple-100 shadow-inner"><span class="text-purple-700 font-black uppercase text-xs flex items-center">Laba Bersih</span><span class="font-black text-purple-700 text-lg" id="dtl-bersih">Rp 0</span></div>
              </div>
          </div>
          <div class="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-800 mb-4"><i class="fa-solid fa-chart-column text-blue-500 mr-2"></i>Grafik Penjualan & Modal</h4>
              <div class="relative w-full flex-1 min-h-[200px]"><canvas id="chartLaporanLaba"></canvas></div>
          </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h4 class="font-black text-slate-800 mb-4 border-b pb-3"><i class="fa-solid fa-building text-blue-500 mr-2"></i>Rekap Inventaris & SO Cabang</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-left min-w-[600px]">
                    <thead class="bg-slate-50 text-[10px] text-slate-500 font-black uppercase tracking-wider">
                        <tr><th class="p-3 rounded-tl-lg">Nama Cabang</th><th class="p-3 text-center text-blue-600">Sisa Unit Aktual</th><th class="p-3 text-center text-emerald-600">Unit Terjual (Lunas)</th><th class="p-3 text-center text-orange-600 rounded-tr-lg">Pending SO (Gantung)</th></tr>
                    </thead>
                    <tbody id="lap-rekap-cabang" class="divide-y divide-slate-100 text-sm font-bold text-slate-700">
                        <tr><td colspan="4" class="text-center p-4">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <h4 class="font-black text-slate-800 mb-4 border-b pb-3"><i class="fa-solid fa-medal text-orange-500 mr-2"></i>Top 5 Terlaris (Range)</h4>
            <div class="flex-1 overflow-y-auto space-y-2 pr-2" id="lap-terlaris"></div>
        </div>
      </div> 
      <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-10">
          <h4 class="font-black text-slate-800 mb-4"><i class="fa-solid fa-download text-emerald-500 mr-2"></i>Export Data Laporan (Download CSV)</h4> 
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4"> 
             <button onclick="exportDataCSV('penjualan')" class="bg-slate-50 text-slate-700 font-bold p-3 rounded-xl border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition flex items-center justify-center gap-2"><i class="fa-solid fa-file-excel text-emerald-600"></i> Detail Penjualan</button> 
             <button onclick="exportDataCSV('pembelian')" class="bg-slate-50 text-slate-700 font-bold p-3 rounded-xl border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition flex items-center justify-center gap-2"><i class="fa-solid fa-file-excel"></i> Pembelian PO</button> 
             <button onclick="exportDataCSV('stok')" class="bg-slate-50 text-slate-700 font-bold p-3 rounded-xl border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition flex items-center justify-center gap-2"><i class="fa-solid fa-file-excel"></i> Kartu Stok</button> 
             <button onclick="exportDataCSV('keuangan')" class="bg-slate-50 text-slate-700 font-bold p-3 rounded-xl border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition flex items-center justify-center gap-2"><i class="fa-solid fa-file-excel"></i> Arus Kas</button> 
          </div> 
      </div> 
  </div> `; 
}
function renderChartLaporan() { 
  let startDateVal = document.getElementById('lap-start').value; let endDateVal = document.getElementById('lap-end').value; 
  let formatYMD = (dateObj) => { let y = dateObj.getFullYear(); let m = String(dateObj.getMonth() + 1).padStart(2, '0'); let d = String(dateObj.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }; 
  let endD = new Date(); if (endDateVal) { let parts = endDateVal.split('-'); endD = new Date(parts[0], parts[1]-1, parts[2], 23, 59, 59); } else { endD.setHours(23, 59, 59, 999); } 
  let startD = new Date(); if (startDateVal) { let parts = startDateVal.split('-'); startD = new Date(parts[0], parts[1]-1, parts[2], 0, 0, 0); } else { startD.setDate(1); startD.setHours(0, 0, 0, 0); } 
  if(document.getElementById('lap-start')) document.getElementById('lap-start').value = formatYMD(startD); if(document.getElementById('lap-end')) document.getElementById('lap-end').value = formatYMD(endD); 
  let omsetRange = 0; let hppRange = 0; let pengeluaranRange = 0;
  let terlarisMap = {}; let chartMap = {}; 
  let kategoriMap = {};
  if(state.data.penjualan) { 
      let validInvLunas = state.data.penjualan.filter(j => { 
          let parts = String(j.Waktu).substring(0, 10).split('-'); let wkt = new Date(parts[0], parts[1]-1, parts[2], 12, 0, 0); 
          return wkt >= startD && wkt <= endD && j.Status === 'LUNAS'; 
      });
      let validIds = validInvLunas.map(j => j.ID_Invoice);
      validInvLunas.forEach(j => {
          let total = parseFloat(j.Total_Akhir || 0);
          omsetRange += total;
          let tgl = String(j.Waktu).substring(0,10);
          if(!chartMap[tgl]) chartMap[tgl] = {omset:0, hpp:0};
          chartMap[tgl].omset += total;
      });
      if(state.data.penjualan_detail) {
          state.data.penjualan_detail.forEach(d => {
              if(validIds.includes(d.ID_Invoice)) {
                  let prd = state.data.produk.find(p => p.ID_Produk === d.ID_Produk);
                  let hppItem = prd ? parseFloat(prd.Harga_Beli || 0) : 0;
                  let totalHppItem = hppItem * parseFloat(d.Qty || 0);
                  hppRange += totalHppItem;
                  let inv = validInvLunas.find(v => v.ID_Invoice === d.ID_Invoice);
                  if(inv) {
                      let tgl = String(inv.Waktu).substring(0,10);
                      if(chartMap[tgl]) chartMap[tgl].hpp += totalHppItem;
                  }
                  if(!terlarisMap[d.ID_Produk]) terlarisMap[d.ID_Produk] = 0; 
                  terlarisMap[d.ID_Produk] += parseFloat(d.Qty||0); 
                  let kat = prd ? (prd.Kategori || "Lainnya") : "Lainnya";
                  if(!kategoriMap[kat]) kategoriMap[kat] = { qty: 0, omset: 0 };
                  kategoriMap[kat].qty += parseFloat(d.Qty||0);
                  kategoriMap[kat].omset += parseFloat(d.Total_Harga || 0);
              }
          });
      }
  }
  let labels = []; let dataPenjualan = []; let dataModal = []; 
  let sortedDates = Object.keys(chartMap).sort();
  if(sortedDates.length > 60) sortedDates = sortedDates.slice(sortedDates.length - 60); 
  sortedDates.forEach(tgl => {
      let parts = tgl.split('-');
      labels.push(`${parts[2]}/${parts[1]}`);
      dataPenjualan.push(chartMap[tgl].omset);
      dataModal.push(chartMap[tgl].hpp);
  });
  let kasMasukTotal = 0; let kasKeluarTotal = 0;
  if(state.data.keuangan) { 
      state.data.keuangan.forEach(k => { 
          let nom = parseFloat(k.Nominal||0); 
          if(k.Jenis_Arus === 'PEMASUKAN') kasMasukTotal += nom; else kasKeluarTotal += nom; 
          let parts = String(k.Waktu).substring(0, 10).split('-'); 
          let wkt = new Date(parts[0], parts[1]-1, parts[2], 12, 0, 0); 
          if (wkt >= startD && wkt <= endD && k.Jenis_Arus === 'PENGELUARAN' && !String(k.Keterangan).includes('PO ') && !String(k.Keterangan).includes('Pembelian') && !String(k.Keterangan).includes('Retur')) {
              pengeluaranRange += nom;
          }
      }); 
  }
  let labaKotorRange = omsetRange - hppRange;
  let labaBersihRange = labaKotorRange - pengeluaranRange;
  if(document.getElementById('lap-omset')) document.getElementById('lap-omset').innerText = formatRp(omsetRange); 
  if(document.getElementById('lap-laba-kotor')) document.getElementById('lap-laba-kotor').innerText = formatRp(labaKotorRange); 
  if(document.getElementById('lap-laba-bersih')) document.getElementById('lap-laba-bersih').innerText = formatRp(labaBersihRange); 
  if(document.getElementById('lap-kas')) document.getElementById('lap-kas').innerText = formatRp(kasMasukTotal - kasKeluarTotal); 
  if(document.getElementById('dtl-omset')) document.getElementById('dtl-omset').innerText = formatRp(omsetRange); 
  if(document.getElementById('dtl-hpp')) document.getElementById('dtl-hpp').innerText = "- " + formatRp(hppRange); 
  if(document.getElementById('dtl-kotor')) document.getElementById('dtl-kotor').innerText = formatRp(labaKotorRange); 
  if(document.getElementById('dtl-op')) document.getElementById('dtl-op').innerText = "- " + formatRp(pengeluaranRange); 
  if(document.getElementById('dtl-bersih')) document.getElementById('dtl-bersih').innerText = formatRp(labaBersihRange); 
  let htmlKat = "";
  let sortedKat = Object.keys(kategoriMap).sort((a,b) => kategoriMap[b].omset - kategoriMap[a].omset);
  if(sortedKat.length === 0) {
      htmlKat = `<p class="col-span-full text-center text-slate-400 font-bold py-4">Belum ada data penjualan kategori.</p>`;
  } else {
      sortedKat.forEach(k => {
          let d = kategoriMap[k];
          htmlKat += `<div class="bg-cyan-50 border border-cyan-100 p-4 rounded-xl shadow-sm"><p class="text-[10px] font-black text-cyan-800 mb-1 uppercase tracking-widest">${k}</p><div class="flex flex-col gap-1"><p class="text-lg font-black text-cyan-700">${formatRp(d.omset)}</p><p class="text-[10px] text-cyan-600 font-bold"><i class="fa-solid fa-box mr-1"></i> ${d.qty} Terjual</p></div></div>`;
      });
  }
  if(document.getElementById('lap-kategori')) document.getElementById('lap-kategori').innerHTML = htmlKat;
  let rekapCabang = {};
  if(state.data.produk) {
      state.data.produk.forEach(p => {
          let cbg = p.Cabang || 'Pusat';
          if(!rekapCabang[cbg]) rekapCabang[cbg] = { stok: 0, terjual: 0, so: 0 };
          rekapCabang[cbg].stok += parseFloat(p.Stok_Saat_Ini || 0);
      });
  }
  if(state.data.penjualan && state.data.penjualan_detail) { 
      let validInv = state.data.penjualan.filter(j => { 
          let parts = String(j.Waktu).substring(0, 10).split('-'); let wkt = new Date(parts[0], parts[1]-1, parts[2], 12, 0, 0); 
          return wkt >= startD && wkt <= endD && j.Status !== 'RETUR'; 
      }); 
      validInv.forEach(j => {
          let cbg = j.Cabang || 'Pusat';
          if(!rekapCabang[cbg]) rekapCabang[cbg] = { stok: 0, terjual: 0, so: 0 };
          let totalUnit = 0;
          state.data.penjualan_detail.forEach(d => { if(d.ID_Invoice === j.ID_Invoice) totalUnit += parseFloat(d.Qty || 0); });
          if(j.Status === 'SO/PESANAN' || j.Status === 'PESANAN') rekapCabang[cbg].so += totalUnit;
          else if (j.Status === 'LUNAS') rekapCabang[cbg].terjual += totalUnit;
      });
  } 
  let htmlRekap = "";
  Object.keys(rekapCabang).forEach(k => {
      let d = rekapCabang[k];
      htmlRekap += `<tr class="hover:bg-slate-50 transition"><td class="p-3 font-black uppercase text-slate-800"><i class="fa-solid fa-store text-slate-400 mr-2"></i>${k}</td><td class="p-3 text-center text-blue-600 font-black text-lg">${d.stok} Unit</td><td class="p-3 text-center text-emerald-600 font-black text-lg">${d.terjual} Unit</td><td class="p-3 text-center text-orange-600 font-black text-lg">${d.so} Unit</td></tr>`;
  });
  if(htmlRekap === "") htmlRekap = `<tr><td colspan="4" class="text-center p-4 text-slate-400">Belum ada data cabang.</td></tr>`;
  if(document.getElementById('lap-rekap-cabang')) document.getElementById('lap-rekap-cabang').innerHTML = htmlRekap;
  let sortTerlaris = Object.keys(terlarisMap).map(k => ({id: k, qty: terlarisMap[k]})).sort((a,b) => b.qty - a.qty).slice(0, 5); let htmlTerlaris = ""; if(sortTerlaris.length === 0) { htmlTerlaris = `<p class="text-xs text-slate-500 text-center mt-8 font-bold">Belum ada data penjualan pada range ini.</p>`; } else { sortTerlaris.forEach((item, idx) => { let prd = state.data.produk.find(p => String(p.ID_Produk) === String(item.id)); let nama = prd ? prd.Nama_Produk : item.id; htmlTerlaris += `<div class="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm"><div class="flex items-center gap-3"><div class="w-7 h-7 rounded bg-orange-100 text-orange-600 font-black text-xs flex items-center justify-center">#${idx+1}</div><p class="text-xs font-bold text-slate-700 truncate w-32 md:w-48">${nama}</p></div><p class="text-xs font-black text-blue-600">${item.qty} Terjual</p></div>`; }); } if(document.getElementById('lap-terlaris')) document.getElementById('lap-terlaris').innerHTML = htmlTerlaris; 
  let canvas = document.getElementById('chartLaporanLaba'); if(!canvas) return; if(chartLaporan !== null) chartLaporan.destroy(); let ctx = canvas.getContext('2d'); chartLaporan = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Omset Kotor', data: dataPenjualan, backgroundColor: '#3b82f6', borderRadius: 4 }, { label: 'HPP (Modal)', data: dataModal, backgroundColor: '#f43f5e', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } }); 
}
function exportDataCSV(tipe) { 
    let csv = "\uFEFF"; 
    let fileName = ""; 
    
    const esc = (v) => {
        if (v === null || v === undefined) return '""';
        return '"' + String(v).replace(/"/g, '""') + '"';
    };

    if(tipe === 'penjualan') { 
        if(!state.data.penjualan || state.data.penjualan.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "Invoice;Waktu;Pelanggan;Kasir;Cabang;Status;Nama Produk;Kategori;Harga Satuan;Qty;Total Harga Item;Metode Bayar\n"; 
        state.data.penjualan.forEach(p => { 
            let dts = state.data.penjualan_detail ? state.data.penjualan_detail.filter(d => d.ID_Invoice === p.ID_Invoice) : [];
            if(dts.length === 0) {
                 csv += `${esc(p.ID_Invoice)};${esc(p.Waktu)};${esc(p.ID_Pelanggan)};${esc(p.Kasir)};${esc(p.Cabang||state.cabang)};${esc(p.Status)};${esc("-")};${esc("-")};${esc(0)};${esc(0)};${esc(p.Total_Akhir)};${esc(p.Metode_Pembayaran)}\n`;
            } else {
                 dts.forEach(d => {
                      let prd = state.data.produk.find(x => x.ID_Produk === d.ID_Produk);
                      let namaPrd = prd ? prd.Nama_Produk : d.ID_Produk; 
                      let katPrd = prd ? prd.Kategori : "Lainnya";
                      csv += `${esc(p.ID_Invoice)};${esc(p.Waktu)};${esc(p.ID_Pelanggan)};${esc(p.Kasir)};${esc(p.Cabang||state.cabang)};${esc(p.Status)};${esc(namaPrd)};${esc(katPrd)};${esc(d.Harga_Satuan||0)};${esc(d.Qty||0)};${esc(d.Total_Harga||0)};${esc(p.Metode_Pembayaran)}\n`;
                 });
            }
        }); 
        fileName = "Data_Penjualan.csv"; 
    } 
    else if(tipe === 'pembelian') { 
        if(!state.data.pembelian || state.data.pembelian.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "PO;Waktu;Supplier;Total Tagihan;Status Bayar;Admin\n"; 
        state.data.pembelian.forEach(p => { 
            let sup = state.data.supplier.find(s => s.ID_Supplier === p.ID_Supplier);
            let namaSup = sup ? sup.Nama_Supplier : p.ID_Supplier;
            csv += `${esc(p.ID_PO)};${esc(p.Waktu)};${esc(namaSup)};${esc(p.Total_Tagihan)};${esc(p.Status_Bayar)};${esc(p.Admin)}\n`; 
        }); 
        fileName = "Data_Pembelian.csv"; 
    } 
    else if(tipe === 'stok' || tipe === 'stok_mutasi') { 
        if(!state.data.stok || state.data.stok.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "ID Stok;Waktu;ID Produk;Nama Produk;Pergerakan;Jumlah;Keterangan;Cabang\n"; 
        state.data.stok.forEach(p => { 
            let prd = state.data.produk.find(x => x.ID_Produk === p.ID_Produk);
            let namaPrd = prd ? prd.Nama_Produk : "-"; 
            csv += `${esc(p.ID_Stok)};${esc(p.Waktu)};${esc(p.ID_Produk)};${esc(namaPrd)};${esc(p.Jenis_Pergerakan)};${esc(p.Jumlah)};${esc(p.Keterangan)};${esc(p.Cabang||state.cabang)}\n`; 
        }); 
        fileName = "Data_Mutasi_Stok.csv"; 
    } 
    else if(tipe === 'stok_pantau') { 
        if(!state.data.produk || state.data.produk.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "ID Produk;Barcode;Nama Produk;Kategori;Cabang;Stok Saat Ini;Satuan\n"; 
        state.data.produk.forEach(p => { 
            csv += `${esc(p.ID_Produk)};${esc(p.Barcode)};${esc(p.Nama_Produk)};${esc(p.Kategori)};${esc(p.Cabang||'Pusat')};${esc(p.Stok_Saat_Ini)};${esc(p.Satuan)}\n`; 
        }); 
        fileName = "Data_Sisa_Stok.csv"; 
    } 
    else if(tipe === 'keuangan') { 
        if(!state.data.keuangan || state.data.keuangan.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "Waktu;Ref/ID;Tipe;Nominal;Keterangan;Kasir;Cabang\n"; 
        state.data.keuangan.forEach(p => { 
            csv += `${esc(p.Waktu)};${esc(p.ID_Transaksi)};${esc(p.Jenis_Arus)};${esc(p.Nominal)};${esc(p.Keterangan)};${esc(p.Kasir)};${esc(p.Cabang||state.cabang)}\n`; 
        }); 
        fileName = "Data_ArusKas.csv"; 
    } 
    else if(tipe === 'produk') { 
        if(!state.data.produk || state.data.produk.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "ID Produk;Barcode;Nama Produk;Supplier;Kategori;Warna;Satuan;Harga Beli;Harga Jual;Stok;Min Stok;Cabang\n"; 
        state.data.produk.forEach(p => { 
            csv += `${esc(p.ID_Produk)};${esc(p.Barcode)};${esc(p.Nama_Produk)};${esc(p.Supplier||'-')};${esc(p.Kategori)};${esc(p.Warna)};${esc(p.Satuan)};${esc(p.Harga_Beli)};${esc(p.Harga_Jual)};${esc(p.Stok_Saat_Ini)};${esc(p.Stok_Minimum)};${esc(p.Cabang||'Pusat')}\n`; 
        }); 
        fileName = "Data_Master_Produk.csv"; 
    } 
    else if(tipe === 'pelanggan') { 
        if(!state.data.pelanggan || state.data.pelanggan.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "ID Pelanggan;Nama Pelanggan;No HP;Grup;Alamat;Poin;Piutang\n"; 
        state.data.pelanggan.forEach(p => { 
            csv += `${esc(p.ID_Pelanggan)};${esc(p.Nama_Pelanggan)};${esc(p.No_HP)};${esc(p.Grup_Pelanggan)};${esc(p.Alamat)};${esc(p.Poin_Member)};${esc(p.Piutang)}\n`; 
        }); 
        fileName = "Data_Pelanggan.csv"; 
    } 
    else if(tipe === 'supplier') { 
        if(!state.data.supplier || state.data.supplier.length === 0) return showInlineNotif('error', 'Data kosong!'); 
        csv += "ID Supplier;Nama Supplier;Kontak;Alamat;Hutang\n"; 
        state.data.supplier.forEach(p => { 
            let riwayat = state.data.pembelian ? state.data.pembelian.filter(t => t.ID_Supplier === p.ID_Supplier) : []; 
            let totalHutangReal = 0; 
            riwayat.forEach(r => { if(r.Status_Bayar === 'HUTANG') totalHutangReal += parseFloat(r.Total_Tagihan || 0); }); 
            csv += `${esc(p.ID_Supplier)};${esc(p.Nama_Supplier)};${esc(p.Kontak)};${esc(p.Alamat)};${esc(totalHutangReal)}\n`; 
        }); 
        fileName = "Data_Supplier.csv"; 
    } 
    
    let link = document.createElement("a"); 
    let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); 
    let url = URL.createObjectURL(blob); 
    link.setAttribute("href", url); 
    link.setAttribute("download", fileName); 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link); 
}

// ====================================================================
// VIEW & FUNGSI: KEUANGAN (ARUS KAS & REKONSILIASI)
// ====================================================================
function viewKeuangan() { 
  return ` 
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative">
    <div class="flex justify-between items-center mb-6">
      <h3 class="font-black text-lg text-slate-800"><i class="fa-solid fa-wallet text-blue-600 mr-2"></i> Arus Kas & Keuangan</h3>
      <button onclick="exportDataCSV('keuangan')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white font-bold px-4 py-2 rounded-xl shadow-sm transition text-xs flex items-center"><i class="fa-solid fa-file-excel mr-2"></i> Export Data</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl shadow-sm">
        <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Pemasukan (Filter)</p>
        <p class="text-2xl font-black text-emerald-700" id="k-masuk">Rp 0</p>
      </div>
      <div class="bg-red-50 border border-red-100 p-5 rounded-2xl shadow-sm">
        <p class="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">Total Pengeluaran (Filter)</p>
        <p class="text-2xl font-black text-red-700" id="k-keluar">Rp 0</p>
      </div>
      <div class="bg-blue-600 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
        <p class="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">Saldo Kas Bersih (Filter)</p>
        <p class="text-2xl font-black text-white" id="k-saldo">Rp 0</p>
      </div>
    </div>
    <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
        <div class="flex flex-wrap gap-4 items-end mb-2">
            <div><label class="text-[10px] font-bold text-slate-500 uppercase">Dari Tanggal</label><br><input type="date" id="keu-start" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500"></div>
            <div><label class="text-[10px] font-bold text-slate-500 uppercase">Sampai Tanggal</label><br><input type="date" id="keu-end" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500"></div>
            <div><label class="text-[10px] font-bold text-slate-500 uppercase">Jenis Arus</label><br><select id="keu-tipe" class="border border-slate-300 p-2.5 rounded-lg mt-1 font-bold outline-none bg-white focus:border-blue-500 min-w-[150px]"><option value="SEMUA">Semua Arus</option><option value="PEMASUKAN">Pemasukan Saja</option><option value="PENGELUARAN">Pengeluaran Saja</option></select></div>
            <button onclick="filterKeuanganUI()" class="bg-blue-600 hover:bg-blue-700 transition text-white px-6 py-2.5 rounded-lg font-black shadow-md"><i class="fa-solid fa-filter mr-2"></i>Filter Data</button>
        </div>
    </div>
    <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
      <h4 class="font-black text-slate-700 mb-3 text-xs uppercase"><i class="fa-solid fa-circle-plus mr-1 text-blue-600"></i> Catat Pengeluaran Operasional Baru</h4>
      <div class="flex flex-wrap gap-3 items-end">
        <div class="flex-1 min-w-[200px]"><label class="text-[10px] font-bold text-slate-400 uppercase">Keterangan / Keperluan</label><input type="text" id="ex-ket" placeholder="Cth: Bayar Listrik, ATK, Bensin..." class="w-full border border-slate-200 p-2.5 rounded-xl mt-1 font-bold outline-none focus:border-blue-500 bg-white"></div>
        <div class="w-40"><label class="text-[10px] font-bold text-slate-400 uppercase">Nominal (Rp)</label><input type="text" inputmode="numeric" onkeyup="formatInputRibuan(this)" id="ex-nom" placeholder="0" class="w-full border border-slate-200 p-2.5 rounded-xl mt-1 font-bold outline-none focus:border-blue-500 bg-white"></div>
        <button onclick="simpanPengeluaran()" id="btn-submit-ex" class="bg-red-500 hover:bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl shadow transition"><i class="fa-solid fa-minus mr-1"></i> Catat Pengeluaran</button>
      </div>
    </div>
    <div class="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
      <table class="w-full text-left min-w-[800px]">
        <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-10 shadow-sm">
          <tr><th class="p-4 pl-6">Tanggal & Waktu</th><th class="p-4">Ref / ID Transaksi</th><th class="p-4">Tipe Arus</th><th class="p-4">Keterangan</th><th class="p-4 pr-6 text-right">Nominal</th></tr>
        </thead>
        <tbody id="tabel-keuangan-ui" class="divide-y divide-slate-100 text-sm font-bold text-slate-700"></tbody>
      </table>
    </div>
  </div>
  `; 
}
function filterKeuanganUI() { 
    let d = new Date(); 
    let yyyy = d.getFullYear(); 
    let mm = String(d.getMonth() + 1).padStart(2, '0'); 
    let dd = String(d.getDate()).padStart(2, '0'); 
    let todayStr = `${yyyy}-${mm}-${dd}`; 
    let elStart = document.getElementById('keu-start'); 
    let elEnd = document.getElementById('keu-end'); 
    let elTipe = document.getElementById('keu-tipe'); 
    if(elStart && !elStart.value) elStart.value = `${yyyy}-${mm}-01`; 
    if(elEnd && !elEnd.value) elEnd.value = todayStr; 
    let startVal = elStart ? elStart.value : `${yyyy}-${mm}-01`; 
    let endVal = elEnd ? elEnd.value : todayStr; 
    let tipeVal = elTipe ? elTipe.value : 'SEMUA'; 
    let startD = new Date(startVal + "T00:00:00"); 
    let endD = new Date(endVal + "T23:59:59");
    let html = ""; let masuk = 0; let keluar = 0; 
    if(!state.data.keuangan || state.data.keuangan.length === 0) { 
        html = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">Belum ada riwayat transaksi keuangan.</td></tr>`; 
    } else { 
        let filteredData = state.data.keuangan.filter(t => {
            let rawDate = String(t.Waktu).substring(0, 10);
            let wkt;
            if(rawDate.includes('/')) {
               let p = rawDate.split('/');
               wkt = new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`);
            } else {
               wkt = new Date(rawDate + "T12:00:00");
            }
            let passDate = (wkt >= startD && wkt <= endD);
            let passTipe = (tipeVal === 'SEMUA' || t.Jenis_Arus === tipeVal);
            return passDate && passTipe;
        });
        if(filteredData.length === 0) {
             html = `<tr><td colspan="5" class="p-10 text-center text-slate-400 font-bold">Tidak ada data pada filter ini.</td></tr>`; 
        } else { 
            filteredData.slice().reverse().forEach(t => { 
                let isMasuk = t.Jenis_Arus === 'PEMASUKAN'; 
                let nom = parseFloat(t.Nominal)||0; 
                if(isMasuk) masuk += nom; else keluar += nom; 
                html += `<tr class="hover:bg-slate-50 transition">
                    <td class="p-4 pl-6 text-xs text-slate-400 font-bold">${String(t.Waktu).substring(0,16)}</td>
                    <td class="p-4 text-xs font-mono text-blue-600 font-bold cursor-pointer hover:underline" onclick="navigator.clipboard.writeText('${t.ID_Transaksi}'); showInlineNotif('info', 'ID Transaksi ${t.ID_Transaksi} disalin!')" title="Klik untuk Salin ID Transaksi">${t.ID_Transaksi}</td>
                    <td class="p-4"><span class="${isMasuk?'text-emerald-600 bg-emerald-50 border-emerald-200':'text-red-600 bg-red-50 border-red-200'} px-2 py-1 rounded text-[10px] font-black border uppercase">${t.Jenis_Arus}</span></td>
                    <td class="p-4 text-xs text-slate-700">${t.Keterangan} <span class="text-[10px] text-slate-400 block font-normal mt-0.5">Kasir: ${t.Kasir||'-'} (${t.Cabang||'Pusat'})</span></td>
                    <td class="p-4 pr-6 text-right font-black ${isMasuk?'text-emerald-600':'text-red-500'}">${isMasuk?'+':'-'} ${formatRp(nom)}</td>
                </tr>`; 
            }); 
        }
    } 
    let el = document.getElementById('tabel-keuangan-ui'); 
    if(el) el.innerHTML = html; 
    if(document.getElementById('k-masuk')) { 
        document.getElementById('k-masuk').innerText = formatRp(masuk); 
        document.getElementById('k-keluar').innerText = formatRp(keluar); 
        document.getElementById('k-saldo').innerText = formatRp(masuk - keluar); 
    } 
}
async function simpanPengeluaran() { 
    let ket = document.getElementById('ex-ket').value.trim(); 
    let nom = parseAngka(document.getElementById('ex-nom').value); 
    if(!ket || !nom || nom <= 0) { showInlineNotif('error','Isi Keterangan dan Nominal dengan benar!'); return; } 
    let btn = document.getElementById('btn-submit-ex'); btn.innerText = "Menyimpan..."; btn.disabled = true; 
    let res = await requestAPIWithAuth('catatPengeluaranOperasional', { keterangan: ket, nominal: nom, kasir: state.user, cabang: state.cabang }); 
    if(res.status) { 
        showInlineNotif('success', 'Pengeluaran berhasil dicatat!');
        document.getElementById('ex-ket').value=""; document.getElementById('ex-nom').value=""; 
        syncDataLiveBackground(); 
    } else { 
        showInlineNotif('error', res.msg); 
    } 
    btn.innerHTML = '<i class="fa-solid fa-minus mr-1"></i> Catat Pengeluaran'; btn.disabled = false; 
}

// ====================================================================
// VIEW & FUNGSI: PENGATURAN SISTEM, BACKUP & INTEGRASI API
// ====================================================================
function viewPengaturan() { 
  return ` 
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col"> 
      <div class="flex gap-4 border-b-2 border-slate-200 mb-6 font-bold text-sm overflow-x-auto pb-2">
          <div class="tab-custom active" onclick="switchPengaturanTab('profil', this)">Profil & Preferensi</div>
          <div class="tab-custom" onclick="switchPengaturanTab('printer', this)">Printer & Struk</div>
          <div class="tab-custom" onclick="switchPengaturanTab('qris', this)">Pajak & QRIS</div>
          <div class="tab-custom" onclick="switchPengaturanTab('backup', this)">Backup Database</div>
          <div class="tab-custom" onclick="switchPengaturanTab('api', this)">Integrasi API</div>
      </div> 
      <div id="pg-profil" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 class="font-black text-lg mb-4 text-slate-800"><i class="fa-solid fa-store mr-2 text-blue-500"></i>Profil Perusahaan</h3>
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Nama Toko / Bisnis</label>
              <input type="text" id="set-nama-toko" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-4 font-bold bg-white focus:border-blue-500 outline-none" placeholder="sanstech POS">
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Alamat Lengkap Toko</label>
              <textarea id="set-alamat-toko" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-4 font-bold bg-white focus:border-blue-500 outline-none" rows="2"></textarea>
              <button class="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow hover:bg-blue-700 transition" onclick="simpanPengaturanLokal()"><i class="fa-solid fa-floppy-disk mr-2"></i>Simpan Profil</button>
          </div>
      </div> 
      <div id="pg-printer" class="hidden grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 class="font-black text-lg mb-4 text-slate-800"><i class="fa-solid fa-receipt mr-2 text-orange-500"></i>Kustomisasi Struk</h3>
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Template Pesan WhatsApp</label>
              <textarea id="set-wa-template" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-3 font-bold bg-white focus:border-orange-500 outline-none" rows="4"></textarea>
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Header Struk</label>
              <input type="text" id="set-struk-header" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-3 font-bold bg-white focus:border-orange-500 outline-none">
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Footer Struk</label>
              <textarea id="set-struk-footer" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-4 font-bold bg-white focus:border-orange-500 outline-none" rows="2"></textarea>
              <button class="w-full bg-orange-500 text-white font-bold py-3 rounded-xl shadow hover:bg-orange-600 transition" onclick="simpanPengaturanLokal()"><i class="fa-solid fa-floppy-disk mr-2"></i>Simpan Format</button>
          </div>
          <div class="bg-indigo-50 p-6 rounded-2xl border border-indigo-200 shadow-sm">
              <h3 class="font-black text-lg mb-4 text-indigo-800"><i class="fa-solid fa-print mr-2 text-indigo-500"></i>Mode Printer Kasir</h3>
              <p class="text-sm text-indigo-700 mb-3 font-bold">Sistem ini menggunakan fitur cerdas (Auto-Detect) untuk memilih printer:</p>
              <div class="space-y-3">
                  <div class="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm">
                      <p class="font-black text-slate-700 text-sm"><i class="fa-brands fa-bluetooth text-blue-500 mr-2"></i>Printer Bluetooth (Thermal Mini)</p>
                      <p class="text-xs text-slate-500 mt-1">Gunakan tombol <span class="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] mx-1">Connect BT</span> di sudut kanan atas layar untuk menghubungkan sistem ke printer thermal sebelum transaksi.</p>
                  </div>
                  <div class="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm">
                      <p class="font-black text-slate-700 text-sm"><i class="fa-solid fa-desktop text-slate-500 mr-2"></i>Printer USB / Komputer Standar</p>
                      <p class="text-xs text-slate-500 mt-1">Jika tombol Bluetooth tidak dikoneksikan, sistem otomatis beralih ke Mode USB. Struk akan memunculkan dialog 'Print' standar bawaan Windows/Mac.</p>
                  </div>
              </div>
          </div>
      </div> 
      <div id="pg-qris" class="hidden grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 class="font-black text-lg mb-4 text-slate-800"><i class="fa-solid fa-percent mr-2 text-red-500"></i>Pengaturan Pajak PPN</h3>
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Besaran Pajak PPN (%)</label>
              <input type="number" id="set-pajak" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-4 font-bold bg-white focus:border-red-500 outline-none" placeholder="Cth: 11" value="0">
              <button class="w-full bg-red-500 text-white font-bold py-3 px-6 rounded-xl shadow hover:bg-red-600 transition" onclick="simpanPengaturanLokal()"><i class="fa-solid fa-floppy-disk mr-2"></i>Simpan Pajak</button>
          </div>
          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 class="font-black text-lg mb-4 text-slate-800"><i class="fa-solid fa-qrcode mr-2 text-emerald-500"></i>QRIS Statis</h3>
              <div onclick="document.getElementById('qris-file-input').click()" class="border-2 border-dashed border-emerald-300 rounded-2xl p-4 text-center mb-4 bg-emerald-50 cursor-pointer hover:bg-emerald-100 transition relative overflow-hidden group">
                  <img id="qris-img-preview" src="" class="hidden mx-auto max-h-24 object-contain relative z-10">
                  <div id="qris-placeholder" class="relative z-10">
                      <i class="fa-solid fa-qrcode text-3xl text-emerald-400 mb-2 group-hover:scale-110 transition"></i>
                      <p class="text-xs font-bold text-emerald-600">Pilih Gambar QRIS</p>
                  </div>
              </div>
          </div>
      </div> 
      <div id="pg-backup" class="hidden grid grid-cols-1 gap-6">
          <div class="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm text-center max-w-xl mx-auto w-full mt-6">
              <div class="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 shadow-inner"><i class="fa-solid fa-cloud-arrow-down"></i></div>
              <h3 class="font-black text-2xl mb-2 text-slate-800">Backup Seluruh Database</h3>
              <p class="text-sm text-slate-500 mb-6 font-medium">Download cadangan seluruh data sistem (Produk, Transaksi Penjualan, PO, Pelanggan, dan Keuangan) ke dalam format terenkripsi JSON. Simpan di tempat yang aman.</p>
              <button class="w-full bg-indigo-600 text-white font-black py-4 px-6 rounded-xl shadow-lg hover:bg-indigo-700 transition hover:scale-[1.02]" onclick="backupDataJSON()"><i class="fa-solid fa-download mr-2"></i> EKSPOR DATABASE (JSON)</button>
          </div>
      </div>
      <div id="pg-api" class="hidden grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 class="font-black text-lg mb-4 text-slate-800"><i class="fa-solid fa-network-wired mr-2 text-slate-600"></i>Konfigurasi API & Webhook</h3>
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">API Key Gateway (WA / SMS)</label>
              <input type="text" id="set-api-key" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-4 font-bold bg-white focus:border-slate-800 outline-none" placeholder="Masukkan API Key...">
              <label class="text-xs font-bold text-slate-500 uppercase tracking-widest">Webhook URL Endpoint</label>
              <input type="text" id="set-webhook" class="w-full border border-slate-300 p-3 rounded-xl mt-1 mb-6 font-bold bg-white focus:border-slate-800 outline-none" placeholder="https://domain.com/webhook">
              <button class="w-full bg-slate-800 text-white font-bold py-3 px-6 rounded-xl shadow hover:bg-slate-900 transition" onclick="simpanPengaturanLokal()"><i class="fa-solid fa-plug mr-2"></i>Simpan Integrasi</button>
          </div>
      </div>
  </div> `; 
}
function switchPengaturanTab(tab, el) { 
    ['profil','printer','qris','backup','api'].forEach(t => document.getElementById('pg-'+t).classList.add('hidden')); 
    el.parentElement.querySelectorAll('.tab-custom').forEach(e => e.classList.remove('active')); 
    document.getElementById('pg-'+tab).classList.remove('hidden'); 
    el.classList.add('active'); 
}
function muatPengaturanLokal() { 
    let nm = localStorage.getItem('sanstech_nama_toko'); if(nm && document.getElementById('set-nama-toko')) document.getElementById('set-nama-toko').value = nm; 
    let al = localStorage.getItem('sanstech_alamat_toko'); if(al && document.getElementById('set-alamat-toko')) document.getElementById('set-alamat-toko').value = al; 
    let sh = localStorage.getItem('sanstech_struk_header'); if(sh && document.getElementById('set-struk-header')) document.getElementById('set-struk-header').value = sh; 
    let sf = localStorage.getItem('sanstech_struk_footer'); if(sf && document.getElementById('set-struk-footer')) document.getElementById('set-struk-footer').value = sf; 
    let wa = localStorage.getItem('sanstech_wa_template'); if(wa && document.getElementById('set-wa-template')) document.getElementById('set-wa-template').value = wa; 
    let qris = localStorage.getItem('sanstech_qris_image'); if(qris && document.getElementById('qris-img-preview')) { document.getElementById('qris-img-preview').src = qris; document.getElementById('qris-img-preview').classList.remove('hidden'); document.getElementById('qris-placeholder').classList.add('hidden'); } 
    let pjk = localStorage.getItem('sanstech_pajak'); if(pjk && document.getElementById('set-pajak')) document.getElementById('set-pajak').value = pjk; 
    let apik = localStorage.getItem('sanstech_api_key'); if(apik && document.getElementById('set-api-key')) document.getElementById('set-api-key').value = apik; 
    let webh = localStorage.getItem('sanstech_webhook'); if(webh && document.getElementById('set-webhook')) document.getElementById('set-webhook').value = webh; 
    if(state.role !== 'KASIR') {
        let savedCabang = JSON.parse(localStorage.getItem('sanstech_list-gudang') || '["Pusat"]'); 
        if(!savedCabang.includes("Pusat")) savedCabang.unshift("Pusat");
        let opsiCabangHtml = `<option value="SEMUA">Semua Cabang</option>`; 
        savedCabang.forEach(c => { opsiCabangHtml += `<option value="${c}">${c}</option>`; });
        let filterStok = document.getElementById('stok-filter-cabang');
        if(filterStok) {
            let currentVal = filterStok.value;
            filterStok.innerHTML = opsiCabangHtml;
            filterStok.value = currentVal;
        }
        let filterProd = document.getElementById('filter-cabang-produk');
        if(filterProd) {
            let currentVal = filterProd.value;
            filterProd.innerHTML = opsiCabangHtml;
            filterProd.value = currentVal;
        }
    }
}
async function simpanPengaturanLokal() { 
    try {
        showInlineNotif('info', 'Menyimpan Pengaturan ke Cloud...');
        let payload = {};
        let idMap = {
            'set-nama-toko': 'sanstech_nama_toko',
            'set-alamat-toko': 'sanstech_alamat_toko',
            'set-struk-header': 'sanstech_struk_header',
            'set-struk-footer': 'sanstech_struk_footer',
            'set-wa-template': 'sanstech_wa_template',
            'set-pajak': 'sanstech_pajak',
            'set-api-key': 'sanstech_api_key',
            'set-webhook': 'sanstech_webhook'
        };
        for (let htmlId in idMap) {
            let el = document.getElementById(htmlId);
            if (el) {
                let dbKey = idMap[htmlId];
                localStorage.setItem(dbKey, el.value);
                payload[dbKey] = el.value;
            }
        }
        let res = await requestAPIWithAuth('simpanPengaturan', payload);
        if (res && res.status) {
            showInlineNotif('success', 'Pengaturan Berhasil Disimpan Permanen!'); 
        } else {
            showInlineNotif('error', 'Gagal simpan ke server: ' + (res.msg || 'Error API'));
        }
    } catch(err) {
        showInlineNotif('error', 'Error Sistem: ' + err.message);
    }
}  
function handleQRISUpload(event) { 
    let file = event.target.files[0]; if(!file) return; 
    let reader = new FileReader(); reader.onload = function(e) { 
        let img = new Image(); img.onload = function() { 
            let canvas = document.createElement('canvas'); let MAX_WIDTH = 400; let scaleSize = MAX_WIDTH / img.width; canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; 
            let ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); 
            let base64 = canvas.toDataURL("image/jpeg", 0.6); 
            document.getElementById('qris-img-preview').src = base64; document.getElementById('qris-img-preview').classList.remove('hidden'); 
            if(document.getElementById('qris-placeholder')) document.getElementById('qris-placeholder').classList.add('hidden'); 
            try { 
                localStorage.setItem('sanstech_qris_image', base64); 
                showInlineNotif('info', 'Mengunggah QRIS...');
                requestAPIWithAuth('simpanPengaturan', {'sanstech_qris_image': base64}).then(res => {
                    if(res.status) showInlineNotif('success','QRIS Tersimpan di Cloud!');
                });
            } catch(e) { showInlineNotif('error','Gagal simpan!'); } 
        }; img.src = e.target.result; 
    }; reader.readAsDataURL(file); 
}
function backupDataJSON() {
    showInlineNotif('info', 'Menyiapkan file Backup...');
    setTimeout(() => {
        try {
            let dataStr = JSON.stringify(state.data, null, 2);
            let blob = new Blob([dataStr], { type: "application/json" });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = `Backup_sanstech_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showInlineNotif('success', 'Backup Database berhasil diunduh!');
        } catch(err) {
            showInlineNotif('error', 'Gagal memproses Backup: ' + err.message);
        }
    }, 500);
}

// ====================================================================
// VIEW & FUNGSI: KONFIGURASI DATA MASTER
// ====================================================================
function viewDataMaster() { 
  let loadList = (idKey, defaultVal, title) => { 
      let rawData = localStorage.getItem('sanstech_' + idKey);
      let arr = [];
      try {
          arr = JSON.parse(rawData);
          if(!Array.isArray(arr)) arr = [];
      } catch(e) {
          arr = [];
      }
      if(arr.length === 0 || !arr.includes(defaultVal)) {
          arr.unshift(defaultVal); 
      }
      let liHtml = ''; 
      arr.forEach((item) => { 
          let isDefault = (item === defaultVal);
          let btnHapus = isDefault ? `<span class="text-[9px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded font-black border border-slate-200 uppercase">Sistem</span>` : `<button onclick="hapusMasterLokal('${idKey}', '${item}', '${title}')" class="text-red-400 hover:text-red-600 transition bg-red-50 w-6 h-6 rounded flex items-center justify-center border border-red-100" title="Hapus"><i class="fa-solid fa-trash text-[10px]"></i></button>`;
          liHtml += `<li class="flex justify-between items-center bg-white border border-slate-100 p-2.5 rounded-lg shadow-sm mb-1.5 hover:border-blue-200 transition"><span class="font-bold text-slate-700 text-xs">${item}</span>${btnHapus}</li>`; 
      }); 
      return liHtml; 
  }; 
  return `
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full relative overflow-y-auto">
      <h3 class="font-black text-xl text-slate-800 mb-6"><i class="fa-solid fa-database text-blue-600 mr-2"></i> Konfigurasi Data Master</h3>
      <div class="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl mb-6 text-xs font-bold flex items-center shadow-inner">
         <i class="fa-solid fa-cloud-arrow-up text-2xl mr-3 text-blue-500"></i>
         <p>Data master yang ditambah/dihapus di sini akan otomatis disinkronkan ke Cloud. Konfigurasi tidak akan hilang meskipun ganti HP.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-700 mb-4 border-b border-slate-200 pb-3 flex items-center justify-between">
                  <span><i class="fa-solid fa-tags text-blue-500 mr-2"></i>Kategori Produk</span>
                  <button onclick="tambahMasterLokal('Kategori', 'list-kat')" class="text-blue-600 hover:text-blue-800 transition transform hover:scale-110"><i class="fa-solid fa-circle-plus text-xl"></i></button>
              </h4>
              <ul class="flex-1 overflow-y-auto pr-1 max-h-40" id="ui-list-kat">${loadList('list-kat', 'Umum', 'Kategori')}</ul>
          </div>
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-700 mb-4 border-b border-slate-200 pb-3 flex items-center justify-between">
                  <span><i class="fa-solid fa-warehouse text-emerald-500 mr-2"></i>Gudang & Cabang</span>
                  <button onclick="tambahMasterLokal('Gudang Cabang', 'list-gudang')" class="text-emerald-600 hover:text-emerald-800 transition transform hover:scale-110"><i class="fa-solid fa-circle-plus text-xl"></i></button>
              </h4>
              <ul class="flex-1 overflow-y-auto pr-1 max-h-40" id="ui-list-gudang">${loadList('list-gudang', 'Pusat', 'Cabang')}</ul>
          </div>
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-700 mb-4 border-b border-slate-200 pb-3 flex items-center justify-between">
                  <span><i class="fa-solid fa-scale-balanced text-orange-500 mr-2"></i>Satuan (UoM)</span>
                  <button onclick="tambahMasterLokal('Satuan UoM', 'list-satuan')" class="text-orange-600 hover:text-orange-800 transition transform hover:scale-110"><i class="fa-solid fa-circle-plus text-xl"></i></button>
              </h4>
              <ul class="flex-1 overflow-y-auto pr-1 max-h-40" id="ui-list-satuan">${loadList('list-satuan', 'Pcs', 'Satuan')}</ul>
          </div>
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-700 mb-4 border-b border-slate-200 pb-3 flex items-center justify-between">
                  <span><i class="fa-solid fa-credit-card text-purple-500 mr-2"></i>Metode Bayar</span>
                  <button onclick="tambahMasterLokal('Metode Bayar', 'list-metode')" class="text-purple-600 hover:text-purple-800 transition transform hover:scale-110"><i class="fa-solid fa-circle-plus text-xl"></i></button>
              </h4>
              <ul class="flex-1 overflow-y-auto pr-1 max-h-40" id="ui-list-metode">${loadList('list-metode', 'Tunai', 'Metode Bayar')}</ul>
          </div>
          
          <!-- INI TAMBAHAN DATA MASTER UNTUK ROLE / JABATAN -->
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h4 class="font-black text-slate-700 mb-4 border-b border-slate-200 pb-3 flex items-center justify-between">
                  <span><i class="fa-solid fa-user-tag text-teal-500 mr-2"></i>Role / Jabatan</span>
                  <button onclick="tambahMasterLokal('Role Jabatan', 'list-role')" class="text-teal-600 hover:text-teal-800 transition transform hover:scale-110"><i class="fa-solid fa-circle-plus text-xl"></i></button>
              </h4>
              <ul class="flex-1 overflow-y-auto pr-1 max-h-40" id="ui-list-role">${loadList('list-role', 'KASIR', 'Role Jabatan')}</ul>
          </div>

      </div>
  </div>`; 
}

// ====================================================================
// VIEW & FUNGSI: PROFIL AKUN & MANAJEMEN KARYAWAN
// ====================================================================
function viewAkun() { 
  let savedCabang = JSON.parse(localStorage.getItem('sanstech_list-gudang') || '["Pusat"]'); 
  if(!savedCabang.includes("Pusat")) savedCabang.unshift("Pusat");
  let opsiCabang = ""; savedCabang.forEach(cab => opsiCabang += `<option value="${cab}">${cab}</option>`); 
  
  // PERBAIKAN: Ambil daftar Role / Jabatan dinamis dari Data Master
  let savedRole = JSON.parse(localStorage.getItem('sanstech_list-role') || '["KASIR", "ADMIN"]');
  if(!savedRole.includes("KASIR")) savedRole.unshift("KASIR");
  let opsiRole = ""; savedRole.forEach(r => opsiRole += `<option value="${r.toUpperCase()}">${r}</option>`);

  let roleNorm = String(state.role).toUpperCase().replace(/\s+/g, '');
  let badgeMyRole = roleNorm === 'SUPERADMIN' ? 'bg-purple-500' : 'bg-blue-500';
  let menuOptions = [
      {id: 'dashboard', label: 'Dashboard'}, {id: 'pos', label: 'POS Kasir'},
      {id: 'penjualan', label: 'Penjualan / SO'}, {id: 'produk', label: 'Produk Master'},
      {id: 'stok', label: 'Kelola Stok'}, {id: 'pelanggan', label: 'Pelanggan'},
      {id: 'supplier', label: 'Supplier'}, {id: 'pembelian', label: 'Pembelian (PO)'},
      {id: 'laporan', label: 'Laporan Bisnis'}, {id: 'keuangan', label: 'Keuangan'},
      {id: 'datamaster', label: 'Data Master'}, {id: 'pengaturan', label: 'Pengaturan'},
      {id: 'akun', label: 'Profil Akun'}
  ];
  let cbHtml = menuOptions.map(m => `<label class="flex items-center gap-1.5 cursor-pointer p-1"><input type="checkbox" class="cb-akses w-3.5 h-3.5 text-emerald-600" value="${m.id}" checked> <span class="text-[10px] text-slate-700 font-bold">${m.label}</span></label>`).join('');
  
  return `
  <div class="p-6 flex flex-col lg:flex-row gap-6 h-full overflow-y-auto">
      <div class="w-full lg:w-1/3 flex flex-col gap-6">
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center relative overflow-hidden">
              <div class="absolute top-0 w-full h-24 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
              <div class="w-24 h-24 bg-white rounded-full p-2 relative z-10 mt-6 shadow-md">
                  <div class="w-full h-full bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-4xl"><i class="fa-solid fa-user-shield"></i></div>
              </div>
              <h3 class="font-black text-2xl text-slate-800 mt-4 uppercase tracking-tight">${state.user}</h3>
              <p class="text-[10px] font-black text-white ${badgeMyRole} px-3 py-1 rounded-full uppercase tracking-widest mt-2 shadow-sm">${state.role}</p>
              <p class="text-xs font-bold text-slate-400 mt-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100"><i class="fa-solid fa-location-dot mr-1"></i> ${state.cabang || 'Pusat'}</p>
          </div>
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h4 class="font-black text-slate-800 mb-4 border-b border-slate-100 pb-3"><i class="fa-solid fa-lock text-orange-500 mr-2"></i> Ubah Kata Sandi</h4>
              <div class="space-y-3 mb-6">
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Password Lama</label><input type="password" id="pass-lama" class="w-full border border-slate-300 p-3 rounded-xl mt-1 font-bold outline-none focus:border-orange-500 bg-slate-50"></div>
                  <div><label class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Password Baru</label><input type="password" id="pass-baru" class="w-full border border-slate-300 p-3 rounded-xl mt-1 font-bold outline-none focus:border-orange-500 bg-slate-50"></div>
              </div>
              <button onclick="ubahPassProfile()" class="w-full bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-slate-900 transition flex items-center justify-center gap-2"><i class="fa-solid fa-key"></i> Simpan Password Baru</button>
          </div>
          <button onclick="bukaModalConfirm('Logout', 'Yakin ingin keluar?', 'logout', prosesLogout)" class="w-full bg-red-50 text-red-600 font-black py-4 rounded-2xl shadow-sm hover:bg-red-600 hover:text-white transition border border-red-200"><i class="fa-solid fa-power-off mr-2 text-lg"></i> KELUAR APLIKASI</button>
      </div>
      ${roleNorm !== 'KASIR' ? `
      <div class="w-full lg:w-2/3 flex flex-col gap-6">
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-1">
              <div class="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h3 class="font-black text-lg text-slate-800"><i class="fa-solid fa-users-gear text-emerald-500 mr-2"></i> Kelola Karyawan & Hak Akses</h3>
              </div>
              <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
                  <h4 class="text-xs font-black text-slate-600 uppercase mb-4">Tambah Akun Baru</h4>
                  <div id="akun-inline-notif" class="hidden text-xs font-bold p-3 rounded-lg mb-4 border block"></div>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                      <div class="lg:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">ID Karyawan</label><input type="text" id="ak-id" placeholder="Cth: ID-01" class="w-full border border-slate-300 p-2.5 rounded-lg mt-1 text-sm font-bold bg-white focus:border-emerald-500 outline-none"></div>
                      <div class="lg:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Username</label><input type="text" id="ak-user" class="w-full border border-slate-300 p-2.5 rounded-lg mt-1 text-sm font-bold bg-white focus:border-emerald-500 outline-none"></div>
                      <div class="lg:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Password</label><input type="password" id="ak-pass" class="w-full border border-slate-300 p-2.5 rounded-lg mt-1 text-sm font-bold bg-white focus:border-emerald-500 outline-none"></div>
                      
                      <!-- DROPDOWN ROLE BERUBAH JADI DINAMIS -->
                      <div class="lg:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Role / Jabatan</label><select id="ak-role" class="w-full border border-slate-300 p-2.5 rounded-lg mt-1 text-sm font-bold bg-white focus:border-emerald-500 outline-none">${opsiRole}</select></div>
                      
                      <div class="lg:col-span-1"><label class="text-[10px] font-bold text-slate-500 uppercase">Akses Cabang</label><select id="ak-cabang" class="w-full border border-slate-300 p-2.5 rounded-lg mt-1 text-sm font-bold bg-white focus:border-emerald-500 outline-none">${opsiCabang}</select></div>
                      <div class="lg:col-span-5 mt-2 bg-white p-3 rounded-lg border border-slate-200">
                          <label class="text-[10px] font-black text-emerald-600 uppercase mb-2 block border-b pb-1">Buka Akses Menu (Centang yang diizinkan)</label>
                          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">${cbHtml}</div>
                      </div>
                  </div>
                  <button onclick="simpanKaryawanBaru()" id="btn-submit-akun" class="bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow-md hover:bg-emerald-700 transition flex items-center mt-2"><i class="fa-solid fa-user-plus mr-2"></i> Tambah Akun</button>
              </div>
              <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table class="w-full text-left min-w-[600px]">
                      <thead class="bg-slate-100 text-[10px] text-slate-500 font-black uppercase tracking-wider">
                          <tr><th class="p-4 pl-6">ID Karyawan</th><th class="p-4">Username</th><th class="p-4">Role</th><th class="p-4">Cabang</th><th class="p-4 pr-6 text-center">Status</th></tr>
                      </thead>
                      <tbody class="text-sm font-bold text-slate-700 divide-y divide-slate-100">
                          ${state.data.akun && state.data.akun.length > 0 ? state.data.akun.map(a => {
                              let rC = String(a.Role).toUpperCase().replace(/\s+/g, '');
                              let badgeRole = rC === 'SUPERADMIN' ? 'bg-purple-100 text-purple-700 border-purple-200' : (rC === 'ADMIN' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200');
                              let statusColor = a.Status_Aktif === 'Aktif' ? 'text-emerald-500' : 'text-red-500';
                              return `<tr class="hover:bg-slate-50 transition">
                                  <td class="p-4 pl-6 text-slate-500 font-mono text-xs">${a.ID_Karyawan || '-'}</td>
                                  <td class="p-4 text-slate-800">${a.Username}</td>
                                  <td class="p-4"><span class="px-2 py-1 rounded text-[10px] border ${badgeRole} font-black uppercase">${a.Role}</span></td>
                                  <td class="p-4 text-xs text-blue-600">${a.Cabang || 'Pusat'}</td>
                                  <td class="p-4 pr-6 text-center font-black ${statusColor}"><i class="fa-solid fa-circle text-[8px] mr-1"></i>${a.Status_Aktif || 'Aktif'}</td>
                              </tr>`;
                          }).join('') : `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-bold">Belum ada data Karyawan</td></tr>`}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
      ` : ''}
  </div>
  `; 
}
async function ubahPassProfile() { 
    let l = document.getElementById('pass-lama').value; 
    let b = document.getElementById('pass-baru').value; 
    if(!l || !b) return showInlineNotif('error', 'Isi Password Lama dan Baru!'); 
    showInlineNotif('info', 'Menyimpan password baru...');
    let res = await requestAPIWithAuth('gantiPassword', {user: state.user, lama: l, baru: b}); 
    if(res.status) { 
        showInlineNotif('success', 'Password berhasil diubah!'); 
        document.getElementById('pass-lama').value = ""; 
        document.getElementById('pass-baru').value = ""; 
    } else { 
        showInlineNotif('error', res.msg || 'Password lama salah!'); 
    } 
}
async function simpanKaryawanBaru() { 
    let idK = document.getElementById('ak-id').value.trim(); 
    let usr = document.getElementById('ak-user').value.trim(); 
    let psw = document.getElementById('ak-pass').value; 
    let rle = document.getElementById('ak-role').value; 
    let cbg = document.getElementById('ak-cabang').value; 
    let notif = document.getElementById('akun-inline-notif');
    if(!usr || !psw) { 
        notif.innerText="Username & Password Wajib Diisi!"; 
        notif.className="text-xs font-bold p-3 rounded-lg mb-4 bg-red-50 text-red-500 border border-red-100 block"; 
        return; 
    } 
    let checkboxes = document.querySelectorAll('.cb-akses:checked');
    let aksesArr = [];
    checkboxes.forEach(cb => aksesArr.push(cb.value));
    let aksesStr = aksesArr.join(',');
    let btn = document.getElementById('btn-submit-akun');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Memproses...'; 
    btn.disabled = true;
    let res = await requestAPIWithAuth('simpanAkunBaru', { Username: usr, Password: psw, Role: rle, Status_Aktif: 'Aktif', ID_Karyawan: idK, Cabang: cbg, Akses_Menu: aksesStr }); 
    if(res.status) { 
        showInlineNotif('success', res.msg); 
        syncDataLiveBackground(); 
    } else { 
        notif.innerText = res.msg; 
        notif.className="text-xs font-bold p-3 rounded-lg mb-4 bg-red-50 text-red-500 border border-red-100 block"; 
    } 
    btn.innerHTML = '<i class="fa-solid fa-user-plus mr-2"></i> Tambah Akun'; 
    btn.disabled = false;
}

const originalRender = renderModulAktif; 
renderModulAktif = function() { 
    originalRender(); 
    if(state.activeMenu === 'produk') filterProdukUI(); 
    if(state.activeMenu === 'penjualan') filterPenjualanUI(); 
    if(state.activeMenu === 'stok') filterStokUI(); 
    if(state.activeMenu === 'pelanggan') filterPelangganUI(); 
    if(state.activeMenu === 'supplier') filterSupplierUI(); 
    if(state.activeMenu === 'keuangan') filterKeuanganUI(); 
    if(state.activeMenu === 'pembelian') renderKeranjangPO(); 
    if(state.activeMenu === 'laporan') renderChartLaporan(); 
    if(state.activeMenu === 'pengaturan') muatPengaturanLokal(); 
}
