import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import screenshot from 'screenshot-desktop';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import sharp from 'sharp';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// AI Logic

const ai = new OpenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: process.env.API_BASE_URL + "/v1" 
});
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";
const GUIDE_MODE_PROMPT = process.env.GUIDE_MODE_PROMPT || `Sen kullanıcının kişisel asistanı AIKO'sun. Şu anda 'Adımlı Rehber' modundasın. 
Kullanıcıya her şeyi tek seferde değil, SADECE bir sonraki (tek) adımı söyle. Asla ikinci veya üçüncü adımı aynı mesajda yazma.
Kullanıcının ilk adımı tamamladığını teyit etmesini bekle.
Talimatların çok basit olmasın, detayı açıkla (Örn: Sadece 'Şuraya sağ tıkla' demek yerine 'Şuraya sağ tıkla ve açılan menüden arama çubuğunu bul. Oraya şunu yaz ve entera bas. Bulamazsan bana bildir.' gibi).
Fare ve klavye tıklama araçlarını kullanman **KESİNLİKLE YASAKTIR** ([CLICK], [TYPE], [DRAG] vs. kullanma). 
Sadece ekranda yer işaretlemesi yapabilirsin. İşaretleme için '[POINT:x,y:Metin]' formatını kullan.`;
let isStopped = false;

ipcMain.on('stop-action', () => {
    isStopped = true;
});

ipcMain.on('ask-question', async (event, userPrompt, isGuideMode) => {
    isStopped = false;
    console.log('Received prompt:', userPrompt, 'isGuideMode:', isGuideMode);

    let currentSystemPrompt = SYSTEM_PROMPT;
    if (isGuideMode) {
        currentSystemPrompt = SYSTEM_PROMPT + "\n\n" + GUIDE_MODE_PROMPT;
    }

    const messages = [
        ...(currentSystemPrompt ? [{ role: 'system', content: currentSystemPrompt }] : []),
        { role: 'user', content: userPrompt }
    ];

    const tools = [
        {
            type: "function",
            function: {
                name: "send_email",
                description: "Kullanıcı birine e-posta/mail göndermeni istediğinde bu fonksiyonu kullan. Bu, arka planda n8n üzerinden e-postayı iletir.",
                parameters: {
                    type: "object",
                    properties: {
                        to: { type: "string", description: "Alıcının e-posta adresi" },
                        subject: { type: "string", description: "E-postanın konusu" },
                        body: { type: "string", description: "E-postanın saf içeriği. İmza (n8n vs) ekleme." }
                    },
                    required: ["to", "subject", "body"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "generate_image",
                description: "Kullanıcı senden bir resim, görsel veya fotoğraf oluşturmanı istediğinde bu fonksiyonu kullan.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "Oluşturulacak görseli detaylı bir şekilde anlatan İngilizce prompt (betimleme)" }
                    },
                    required: ["prompt"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "ask_user_choice",
                description: "Eğer yapacağın işte birden fazla seçenek arasında kararsız kalırsan veya kullanıcıya sorman gereken bir tercih durumu oluşursa bu fonksiyonu çağır. Kullanıcıya bir soru ve seçenekler sunar.",
                parameters: {
                    type: "object",
                    properties: {
                        question: { type: "string", description: "Kullanıcıya sorulacak soru" },
                        options: { type: "array", items: { type: "string" }, description: "Seçeneklerin listesi (örn: ['Chrome', 'Edge'])" }
                    },
                    required: ["question", "options"]
                }
            }
        }
    ];

    const delay = ms => new Promise(res => setTimeout(res, ms));

    async function processAgentLoop(currentMessages, takeScreenshotFirst = false) {
        if (isStopped) {
            mainWindow.webContents.send('status', 'İşlem durduruldu.');
            return;
        }
        let loopImgWidth = 1920;
        let loopImgHeight = 1080;

        if (takeScreenshotFirst) {
            console.log('Taking screenshot for NEXT_STEP...');
            mainWindow.webContents.send('status', 'Yeni ekrana bakıyor...');
            
            const imgBuffer = await screenshot({ format: 'png' });
            const metadata = await sharp(imgBuffer).metadata();
            loopImgWidth = metadata.width;
            loopImgHeight = metadata.height;
            const resizedBuffer = await sharp(imgBuffer).resize({ width: Math.round(loopImgWidth / 2) }).toBuffer();
            const base64Image = resizedBuffer.toString('base64');

            currentMessages = currentMessages.filter(msg => !(Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')));

            currentMessages.push({
                role: 'user',
                content: [
                    { type: 'text', text: 'İşte yeni ekran görüntüsü. Kaldığın yerden işleme devam et.' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                ]
            });
        }

        let response = await ai.chat.completions.create({
            model: process.env.MODEL_NAME || 'gemini-3.1-pro',
            messages: currentMessages,
            temperature: 0.7,
            tools: tools,
            extra_body: {
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            }
        });

        if (isStopped) {
            mainWindow.webContents.send('status', 'İşlem durduruldu.');
            return;
        }

        let aiResponseText = response.choices[0].message.content || "";
        const toolCalls = response.choices[0].message.tool_calls;
        
        if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
                if (toolCall.function.name === 'send_email') {
                    try {
                        const emailData = JSON.parse(toolCall.function.arguments);
                        const n8nUrl = process.env.N8N_API_URL;
                        if (n8nUrl) {
                            fetch(n8nUrl, {
                                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailData)
                            }).catch(err => console.error("Failed to send email to n8n:", err));
                        }
                        if (!aiResponseText) aiResponseText = "Maili gönderdim.";
                    } catch (e) {}
                } else if (toolCall.function.name === 'generate_image') {
                    try {
                        const imgData = JSON.parse(toolCall.function.arguments);
                        const encodedPrompt = encodeURIComponent(imgData.prompt);
                        const imgUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&width=1024&height=1024`;
                        if (aiResponseText) aiResponseText += `\n\n![Oluşturulan Görsel](${imgUrl}) [NEXT_STEP]`;
                        else aiResponseText = `İşte istediğin görsel:\n\n![Oluşturulan Görsel](${imgUrl}) [NEXT_STEP]`;
                    } catch (e) {}
                } else if (toolCall.function.name === 'ask_user_choice') {
                    try {
                        const choiceData = JSON.parse(toolCall.function.arguments);
                        mainWindow.webContents.send('question', {
                            question: choiceData.question,
                            options: choiceData.options
                        });
                        aiResponseText = aiResponseText.replace(/\[NEXT_STEP\]/g, '').trim();
                    } catch (e) {}
                }
            }
        }

        if (!takeScreenshotFirst && aiResponseText.includes('[SCREENSHOT_REQUEST]')) {
            console.log('AI requested a screenshot. Taking screenshot...');
            mainWindow.webContents.send('status', 'Ekrana bakıyor...');

            const imgBuffer = await screenshot({ format: 'png' });
            const metadata = await sharp(imgBuffer).metadata();
            loopImgWidth = metadata.width;
            loopImgHeight = metadata.height;
            const resizedBuffer = await sharp(imgBuffer).resize({ width: Math.round(loopImgWidth / 2) }).toBuffer();
            const base64Image = resizedBuffer.toString('base64');
            
            currentMessages.push({ role: 'assistant', content: aiResponseText });
            currentMessages = currentMessages.filter(msg => !(Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')));
            currentMessages.push({
                role: 'user',
                content: [
                    { type: 'text', text: 'İşte ekran görüntüsü. Lütfen soruma buna göre cevap ver.' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                ]
            });

            response = await ai.chat.completions.create({
                model: process.env.MODEL_NAME || 'gemini-3.1-pro',
                messages: currentMessages,
                temperature: 0.7,
                tools: tools,
                extra_body: {
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                }
            });
            
            aiResponseText = response.choices[0].message.content || "";
            // tool calls handling again omitted for brevity in screenshot branch as in original code
        }

        aiResponseText = aiResponseText.replace(/\[SCREENSHOT_REQUEST\]/g, '').trim();
        
        let hasNextStep = false;
        if (aiResponseText.includes('[NEXT_STEP]')) {
            hasNextStep = true;
            aiResponseText = aiResponseText.replace(/\[NEXT_STEP\]/g, '').trim();
            currentMessages.push({ role: 'assistant', content: aiResponseText });
        }
        
        // Command Executions
        const pointMatch = aiResponseText.match(/\[POINT:(\d+),(\d+):(.*?)\]/);
        if (pointMatch) {
            const normX = parseInt(pointMatch[1], 10);
            const normY = parseInt(pointMatch[2], 10);
            const pixelX = Math.round((normX / 1000) * loopImgWidth);
            const pixelY = Math.round((normY / 1000) * loopImgHeight);
            exec(`DrawCircle.exe ${pixelX} ${pixelY}`, (error) => { if (error) console.error("Error drawing circle:", error); });
            aiResponseText = aiResponseText.replace(/\[POINT:\d+,\d+:.*?\]/g, '').trim();
        }

        const clickMatch = aiResponseText.match(/\[CLICK:(\d+),(\d+)\]/);
        if (clickMatch) {
            if (!isGuideMode) {
                const normX = parseInt(clickMatch[1], 10);
                const normY = parseInt(clickMatch[2], 10);
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                exec(`DrawClick.exe ${pixelX} ${pixelY}`, (err) => { if (err) console.error("Error drawing click:", err); });
                exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => { if (error) console.error("Error clicking:", error); });
            }
            aiResponseText = aiResponseText.replace(/\[CLICK:\d+,\d+\]/g, '').trim();
        }

        const dblClickMatch = aiResponseText.match(/\[DOUBLE_CLICK:(\d+),(\d+)\]/);
        if (dblClickMatch) {
            if (!isGuideMode) {
                const normX = parseInt(dblClickMatch[1], 10);
                const normY = parseInt(dblClickMatch[2], 10);
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                exec(`DrawClick.exe ${pixelX} ${pixelY} double`);
                exec(`MouseClicker.exe doubleclick ${pixelX} ${pixelY}`);
            }
            aiResponseText = aiResponseText.replace(/\[DOUBLE_CLICK:\d+,\d+\]/g, '').trim();
        }

        const rightClickMatch = aiResponseText.match(/\[RIGHT_CLICK:(\d+),(\d+)\]/);
        if (rightClickMatch) {
            if (!isGuideMode) {
                const normX = parseInt(rightClickMatch[1], 10);
                const normY = parseInt(rightClickMatch[2], 10);
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                exec(`DrawClick.exe ${pixelX} ${pixelY}`);
                exec(`MouseClicker.exe rightclick ${pixelX} ${pixelY}`);
            }
            aiResponseText = aiResponseText.replace(/\[RIGHT_CLICK:\d+,\d+\]/g, '').trim();
        }

        const dragMatch = aiResponseText.match(/\[DRAG:(\d+),(\d+),(\d+),(\d+)\]/);
        if (dragMatch) {
            if (!isGuideMode) {
                const normX1 = parseInt(dragMatch[1], 10);
                const normY1 = parseInt(dragMatch[2], 10);
                const normX2 = parseInt(dragMatch[3], 10);
                const normY2 = parseInt(dragMatch[4], 10);
                const pixelX1 = Math.round((normX1 / 1000) * loopImgWidth);
                const pixelY1 = Math.round((normY1 / 1000) * loopImgHeight);
                const pixelX2 = Math.round((normX2 / 1000) * loopImgWidth);
                const pixelY2 = Math.round((normY2 / 1000) * loopImgHeight);
                exec(`DrawClick.exe ${pixelX1} ${pixelY1}`);
                exec(`MouseClicker.exe drag ${pixelX1} ${pixelY1} ${pixelX2} ${pixelY2}`);
            }
            aiResponseText = aiResponseText.replace(/\[DRAG:\d+,\d+,\d+,\d+\]/g, '').trim();
        }

        const scrollUpMatch = aiResponseText.match(/\[SCROLL_UP:(\d+),(\d+),([\d\.]+)\]/);
        if (scrollUpMatch) {
            if (!isGuideMode) {
                const normX = parseInt(scrollUpMatch[1], 10);
                const normY = parseInt(scrollUpMatch[2], 10);
                const amount = parseFloat(scrollUpMatch[3]);
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                exec(`MouseClicker.exe scrollup ${pixelX} ${pixelY} ${amount}`);
            }
            aiResponseText = aiResponseText.replace(/\[SCROLL_UP:\d+,\d+,[\d\.]+\]/g, '').trim();
        }

        const scrollDownMatch = aiResponseText.match(/\[SCROLL_DOWN:(\d+),(\d+),([\d\.]+)\]/);
        if (scrollDownMatch) {
            if (!isGuideMode) {
                const normX = parseInt(scrollDownMatch[1], 10);
                const normY = parseInt(scrollDownMatch[2], 10);
                const amount = parseFloat(scrollDownMatch[3]);
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                exec(`MouseClicker.exe scrolldown ${pixelX} ${pixelY} ${amount}`);
            }
            aiResponseText = aiResponseText.replace(/\[SCROLL_DOWN:\d+,\d+,[\d\.]+\]/g, '').trim();
        }

        const typeMatch = aiResponseText.match(/\[TYPE:(\d+),(\d+):(.*?)\]/);
        if (typeMatch) {
            if (!isGuideMode) {
                const normX = parseInt(typeMatch[1], 10);
                const normY = parseInt(typeMatch[2], 10);
                const textToType = typeMatch[3];
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                const base64Text = Buffer.from(textToType, 'utf-8').toString('base64');
                exec(`DrawClick.exe ${pixelX} ${pixelY}`);
                exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => {
                    if (!error) exec(`KeyboardTyper.exe ${base64Text}`);
                });
            }
            aiResponseText = aiResponseText.replace(/\[TYPE:\d+,\d+:.*?\]/g, '').trim();
        }

        const typeEnterMatch = aiResponseText.match(/\[TYPE_ENTER:(\d+),(\d+):(.*?)\]/);
        if (typeEnterMatch) {
            if (!isGuideMode) {
                const normX = parseInt(typeEnterMatch[1], 10);
                const normY = parseInt(typeEnterMatch[2], 10);
                const textToType = typeEnterMatch[3];
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                const base64Text = Buffer.from(textToType, 'utf-8').toString('base64');
                exec(`DrawClick.exe ${pixelX} ${pixelY}`);
                exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => {
                    if (!error) exec(`KeyboardTyper.exe ${base64Text} enter`);
                });
            }
            aiResponseText = aiResponseText.replace(/\[TYPE_ENTER:\d+,\d+:.*?\]/g, '').trim();
        }

        const pasteImageMatch = aiResponseText.match(/\[PASTE_IMAGE:(\d+),(\d+):(.*?)\]/);
        if (pasteImageMatch) {
            if (!isGuideMode) {
                const normX = parseInt(pasteImageMatch[1], 10);
                const normY = parseInt(pasteImageMatch[2], 10);
                const imageUrl = pasteImageMatch[3];
                const pixelX = Math.round((normX / 1000) * loopImgWidth);
                const pixelY = Math.round((normY / 1000) * loopImgHeight);
                
                mainWindow.webContents.send('status', 'Görsel indiriliyor ve yapıştırılıyor...');
                
                try {
                    const res = await fetch(imageUrl);
                    const arrayBuffer = await res.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const tempImgPath = path.join(app.getPath('temp'), 'temp_paste.png');
                    fs.writeFileSync(tempImgPath, buffer);
                    
                    exec(`DrawClick.exe ${pixelX} ${pixelY}`);
                    exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => {
                        if (!error) exec(`PasteImage.exe "${tempImgPath}"`);
                    });
                } catch(e) {
                    console.error("Failed to download or paste image:", e);
                }
            }
            aiResponseText = aiResponseText.replace(/\[PASTE_IMAGE:\d+,\d+:.*?\]/g, '').trim();
        }

        mainWindow.webContents.send('answer', aiResponseText);

        if (hasNextStep) {
            if (isStopped) {
                mainWindow.webContents.send('status', 'İşlem durduruldu.');
                return;
            }
            mainWindow.webContents.send('status', 'İşlem devam ediyor (bekleniyor)...');
            await delay(3500);
            await processAgentLoop(currentMessages, true);
        }
    }

    try {
        await processAgentLoop(messages, isGuideMode);
    } catch (error) {
        console.error('Error processing message:', error);
        mainWindow.webContents.send('error', 'Bir hata oluştu: ' + error.message);
    }
});
