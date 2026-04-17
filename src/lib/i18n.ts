export type Lang = "tr" | "en";

export const t = (lang: Lang) => translations[lang];

const translations = {
  tr: {
    // nav
    markets: "Piyasalar", portfolio: "Portföy", history: "İşlem Geçmişi", watchlist: "İzleme Listesi", settings: "Ayarlar",
    signin: "Giriş Yap", signup: "Üye Ol", signout: "Çıkış",
    // categories
    cat_all: "Tümü", cat_crypto: "Kripto", cat_stocks: "Hisse", cat_forex: "Forex", cat_commodities: "Emtia", cat_indices: "Endeks", cat_etf: "ETF",
    // trading
    chart: "Grafik", info: "Bilgi", buy: "Satın Al", sell: "Sat", quantity: "Miktar", price: "Fiyat",
    placing: "İşlem yapılıyor...", market_open: "Piyasa Açık", market_closed: "Piyasa Kapalı",
    // panel
    balance: "Demo Bakiye", available: "Kullanılabilir", pnl: "Kâr / Zarar", open_positions: "Açık Pozisyonlar", no_positions: "Açık pozisyon yok",
    close: "Kapat", analysis: "Analiz", news: "Haberler", chat: "Sohbet",
    ai_loading: "AI düşünüyor...", ask_anything: "Bir şey sor...",
    refresh: "Yenile", search_symbols: "Sembol ara...", change_24h: "24s",
    // auth
    email: "E-posta", password: "Şifre", display_name: "Görünen Ad", forgot_password: "Şifremi unuttum",
    welcome_back: "Tekrar hoş geldiniz", create_account: "Hesap oluşturun", reset_password: "Şifre sıfırla",
    new_password: "Yeni şifre", send_reset_link: "Sıfırlama bağlantısı gönder",
    have_account: "Hesabınız var mı?", no_account: "Hesabınız yok mu?",
    // settings
    profile: "Profil", language: "Dil", theme: "Tema", dark: "Koyu", light: "Açık",
    reset_demo: "Demo Bakiyesini Sıfırla", reset_demo_desc: "Bakiyenizi $100,000'a sıfırlar ve tüm pozisyonları kapatır.",
    broker: "Broker (yakında)", broker_desc: "Gerçek broker entegrasyonu (Alpaca) için API anahtarlarınızı buraya gireceksiniz.",
    save: "Kaydet",
    // toasts
    success: "Başarılı", error: "Hata",
    trade_success: "İşlem tamamlandı", insufficient: "Yetersiz bakiye",
    // hero
    hero_title: "Akıllı İşlem Paneli",
    hero_sub: "AI destekli analizler, gerçek zamanlı grafikler ve sıfır kurulum demo işlem ortamı.",
    get_started: "Başla",
  },
  en: {
    markets: "Markets", portfolio: "Portfolio", history: "History", watchlist: "Watchlist", settings: "Settings",
    signin: "Sign In", signup: "Sign Up", signout: "Sign Out",
    cat_all: "All", cat_crypto: "Crypto", cat_stocks: "Stocks", cat_forex: "Forex", cat_commodities: "Commodities", cat_indices: "Indices", cat_etf: "ETF",
    chart: "Chart", info: "Info", buy: "Buy", sell: "Sell", quantity: "Quantity", price: "Price",
    placing: "Placing order...", market_open: "Market Open", market_closed: "Market Closed",
    balance: "Demo Balance", available: "Available", pnl: "P&L", open_positions: "Open Positions", no_positions: "No open positions",
    close: "Close", analysis: "Analysis", news: "News", chat: "Chat",
    ai_loading: "AI thinking...", ask_anything: "Ask anything...",
    refresh: "Refresh", search_symbols: "Search symbols...", change_24h: "24h",
    email: "Email", password: "Password", display_name: "Display name", forgot_password: "Forgot password?",
    welcome_back: "Welcome back", create_account: "Create account", reset_password: "Reset password",
    new_password: "New password", send_reset_link: "Send reset link",
    have_account: "Have an account?", no_account: "No account?",
    profile: "Profile", language: "Language", theme: "Theme", dark: "Dark", light: "Light",
    reset_demo: "Reset Demo Balance", reset_demo_desc: "Resets your balance to $100,000 and closes all positions.",
    broker: "Broker (soon)", broker_desc: "API keys for real broker (Alpaca) integration go here.",
    save: "Save",
    success: "Success", error: "Error",
    trade_success: "Trade executed", insufficient: "Insufficient balance",
    hero_title: "Smart Trading Panel",
    hero_sub: "AI-powered insights, real-time charts and a zero-setup demo trading environment.",
    get_started: "Get started",
  },
};
