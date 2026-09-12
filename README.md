# AIKO: Autonomous AI Assistant with UI Control

AIKO is an advanced autonomous AI assistant capable of interacting directly with your computer. It can take screenshots, understand your screen's user interface, control the mouse (click, double-click, drag), use the keyboard to type, generate images, and even automatically paste them into your applications.

**🚀 NEW:** AIKO has been upgraded to a native desktop application powered by **React, Vite, and Electron**, replacing the old Chrome-based web interface!

## 🌟 Features

- **Native Desktop Experience**: Built with Electron and a beautiful glassmorphism React UI for better performance and OS integration.
- **Computer Vision & Mouse/Keyboard Control**: AIKO sees your screen using screenshots and can autonomously navigate applications (like Discord, Chrome, etc.) by moving the mouse and typing on the keyboard.
- **Image Generation & Auto-Paste**: AIKO can generate images from prompts (via Pollinations.ai) and automatically paste them (Ctrl+V) directly into the chat or input field you specify on your screen.
- **Email Automation**: Built-in support for sending emails autonomously via n8n webhooks.
- **Multi-step Autonomous Execution**: Capable of executing complex, multi-layered tasks. After every click or action, AIKO can request a new screenshot to analyze the updated screen and continue the task until completion.
- **Step-by-Step Guide Mode**: A dedicated mode where AIKO doesn't take control of your mouse/keyboard. Instead, it guides you step-by-step through complex tasks (like software tutorials) by pointing out where to click and what to do, waiting for you to complete each step before moving on.
- **Safety Filter Override**: Configured to bypass restrictive safety filters for complete creative freedom in roleplay and tasks.

## 🚀 Setup & Installation

1. Clone this repository.
2. Run `npm install` to install all necessary dependencies (including Electron and Vite).
3. Copy `.env.example` to `.env` and configure your API keys and endpoints.

### 💡 How to use with Antigravity Tools (Free API Method)

Instead of paying for expensive API keys, you can use the **[antigravity-tools](https://github.com/)** application from GitHub. This tool acts as a bridge, allowing you to use your Antigravity account's quota as a standard API on your localhost.

1. Download and run the `antigravity-tools` local server.
2. Once the local server is running, note the localhost URL it provides (e.g., `http://localhost:8045`).
3. Update your `.env` file to use this local server:
   ```env
   API_BASE_URL=http://localhost:8045
   MODEL_NAME=gemini-3.1-pro
   ```
4. You can find the `GEMINI_API_KEY` in the "API Proxy" tab of the Antigravity-tools application.

## 💻 Running the Assistant

Simply double-click the **`start.bat`** file, or run the following command in your terminal:
```bash
npm run dev
```
This will start the Vite development server and launch the native AIKO Electron application.

---
---

# AIKO: Bilgisayar Kontrollü Otonom Yapay Zeka Asistanı (Türkçe)

AIKO, bilgisayarınızla doğrudan etkileşime girebilen, ekran görüntüleri alıp analiz edebilen, farenizi (tıklama, çift tıklama, sürükleme) ve klavyenizi (yazı yazma, enter) kontrol edebilen gelişmiş bir otonom yapay zeka asistanıdır.

**🚀 YENİ:** AIKO artık eski Chrome tabanlı web arayüzü yerine, **React, Vite ve Electron** ile güçlendirilmiş tam donanımlı bir yerel masaüstü uygulamasıdır!

## 🌟 Özellikler

- **Yerel Masaüstü Deneyimi**: Electron ve modern cam (glassmorphism) tasarımlı React arayüzü sayesinde daha yüksek performans ve derin işletim sistemi entegrasyonu.
- **Ekran Görüşü ve Bilgisayar Kontrolü**: AIKO ekranınızın fotoğrafını çeker, arayüzü (UI) anlar ve farenizi/klavyenizi kontrol ederek Discord, tarayıcılar gibi herhangi bir uygulamayı sizin yerinize kullanabilir.
- **Görsel Üretimi ve Otomatik Yapıştırma**: Yapay zeka sizin için (Pollinations.ai aracılığıyla) görseller oluşturabilir ve bu görselleri ekrandaki hedef uygulamaya (Ctrl+V) otomatik olarak yapıştırıp gönderebilir.
- **E-Posta Otomasyonu**: n8n webhook'ları üzerinden otonom olarak e-posta gönderme yeteneğine sahiptir.
- **Çok Adımlı Görevler (Multi-step)**: Katmanlı ve uzun süreli görevleri kendi başına yapabilir. Her tıklamadan veya yazı yazdıktan sonra ekranın yeni halini analiz edip görevi bitirene kadar arka arkaya aksiyonlar almaya devam eder.
- **Adımlı Rehber Modu (Guide Mode)**: Bu mod açıldığında AIKO farenizi veya klavyenizi kontrol etmez. Bunun yerine, karmaşık programlarda (örn: Unreal Engine) size adım adım ne yapmanız gerektiğini söyler, ekranda tıklamanız gereken yerleri işaretler ve siz bir adımı bitirmeden diğerine geçmez.
- **Özgür Roleplay (Filtresiz)**: Güvenlik sınırlarına takılmadan tamamen özgür ve kısıtlamasız bir şekilde çalışacak şekilde yapılandırılmıştır.

## 🚀 Kurulum

1. Projeyi bilgisayarınıza klonlayın.
2. Bağımlılıkları (Electron ve Vite dahil) yüklemek için terminalde `npm install` komutunu çalıştırın.
3. `.env.example` dosyasının adını `.env` olarak değiştirin ve gerekli ayarları yapın.

### 💡 Antigravity Tools ile Kullanım (Ücretsiz API Alternatifi)

Pahalı API anahtarları satın almak yerine, GitHub'da bulunan **antigravity-tools** uygulamasını kullanabilirsiniz. Bu araç, Antigravity hesabınızın kotasını sanki bir API'ymiş gibi kendi bilgisayarınızda (localhost) kullanmanızı sağlar.

1. `antigravity-tools` uygulamasını indirin ve yerel sunucusunu başlatın.
2. Araç çalıştıktan sonra size verdiği localhost adresini (örneğin: `http://localhost:8045`) kopyalayın.
3. `.env` dosyanızı şu şekilde güncelleyin:
   ```env
   API_BASE_URL=http://localhost:8045
   MODEL_NAME=gemini-3.1-pro
   ```
4. `GEMINI_API_KEY` değerini Antigravity-tools uygulamasında "API Proxy" sekmesinde api key olarak bulabilirsiniz.

## 💻 Çalıştırma

Sadece **`start.bat`** dosyasına çift tıklayın veya terminalinizde şu komutu çalıştırın:
```bash
npm run dev
```
Bu işlem Vite geliştirme sunucusunu başlatacak ve AIKO Electron masaüstü uygulamasını otomatik olarak açacaktır.
