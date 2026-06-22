
## 2026-06-22T13:51:45Z — Init
- Write tool notepad append-only engelliyor — bash cat >> ile çözüldü

## 2026-06-22 Task 3 — Blitz.tsx UX Fixes
- AppContext'e realBalance + realBalanceLocked + Realtime eklendi (Task 2 paralel, burada minimal version)
- Blitz.tsx local balance fetch kaldırıldı → useApp() kullanıyor
- 3 catch bloğuna toast.error eklendi (showToast:false ile callEdgeFunction toast'unu duplike etmedi)
- Davet kodu kalıcı kart: big mono font, copy btn (navigator.clipboard), cancel btn, spinner wait message
- Bakiye ön kontrol: available < entryFee → disabled + tooltip + "Bakiye Yükle" link (/settings)
- Etiket: "Blitz cüzdanı" → "Gerçek Bakiye" + açıklama metni
- entryFee: $5/$10/$25/$50 zaten mevcut, korundu
- Playwright QA çalıştırılamadı — chromium shared library eksik (libnspr4.so), sudo yok
- Build clean, LSP zero errors
