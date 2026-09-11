import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import OpenAI from 'openai';
import screenshot from 'screenshot-desktop';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import sharp from 'sharp';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI API
const ai = new OpenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: process.env.API_BASE_URL + "/v1" 
});
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "";

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket.');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            let imgWidth = 1920;
            let imgHeight = 1080;
            
            if (data.type === 'ask_question') {
                const userPrompt = data.prompt;
                console.log('Received prompt:', userPrompt);

                // 1. Prepare initial text-only message
                const messages = [
                    ...(SYSTEM_PROMPT ? [{ role: 'system', content: SYSTEM_PROMPT }] : []),
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ];

                // Define available tools for the AI
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
                    }
                ];

                const delay = ms => new Promise(res => setTimeout(res, ms));

                async function processAgentLoop(currentMessages, ws, takeScreenshotFirst = false) {
                    let loopImgWidth = 1920;
                    let loopImgHeight = 1080;

                    if (takeScreenshotFirst) {
                        console.log('Taking screenshot for NEXT_STEP...');
                        ws.send(JSON.stringify({ type: 'status', text: 'Yeni ekrana bakıyor...' }));
                        
                        const imgBuffer = await screenshot({ format: 'png' });
                        const metadata = await sharp(imgBuffer).metadata();
                        loopImgWidth = metadata.width;
                        loopImgHeight = metadata.height;
                        const resizedBuffer = await sharp(imgBuffer).resize({ width: Math.round(loopImgWidth / 2) }).toBuffer();
                        const base64Image = resizedBuffer.toString('base64');

                        // Remove older screenshots from history to save tokens
                        currentMessages = currentMessages.filter(msg => !(Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url')));

                        currentMessages.push({
                            role: 'user',
                            content: [
                                { type: 'text', text: 'İşte yeni ekran görüntüsü. Kaldığın yerden işleme devam et.' },
                                { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                            ]
                        });
                    }

                    // 2. Call OpenAI API
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

                    let aiResponseText = response.choices[0].message.content || "";
                    const toolCalls = response.choices[0].message.tool_calls;
                    
                    // Process tool calls if AI decided to use any
                    if (toolCalls && toolCalls.length > 0) {
                        for (const toolCall of toolCalls) {
                            if (toolCall.function.name === 'send_email') {
                                try {
                                    const emailData = JSON.parse(toolCall.function.arguments);
                                    console.log('AI autonomously decided to send an email:', emailData);
                                    
                                    const n8nUrl = process.env.N8N_API_URL;
                                    if (n8nUrl) {
                                        fetch(n8nUrl, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(emailData)
                                    }).then(res => console.log("Email request sent to n8n. Status:", res.status))
                                          .catch(err => console.error("Failed to send email to n8n:", err));
                                    } else {
                                        console.error("N8N_API_URL is not set in .env");
                                    }
                                      
                                    if (!aiResponseText) aiResponseText = "Maili başarıyla gönderdim.";
                                } catch (e) {
                                    console.error('Failed to parse tool arguments:', e);
                                }
                            } else if (toolCall.function.name === 'generate_image') {
                                try {
                                    const imgData = JSON.parse(toolCall.function.arguments);
                                    console.log('AI autonomously decided to generate an image:', imgData);
                                    const encodedPrompt = encodeURIComponent(imgData.prompt);
                                    const imgUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&width=1024&height=1024`;
                                    
                                    if (aiResponseText) {
                                        aiResponseText += `\n\n![Oluşturulan Görsel](${imgUrl}) [NEXT_STEP]`;
                                    } else {
                                        aiResponseText = `İşte istediğin görsel:\n\n![Oluşturulan Görsel](${imgUrl}) [NEXT_STEP]`;
                                    }
                                } catch (e) {
                                    console.error('Failed to parse generate_image arguments:', e);
                                }
                            }
                        }
                    }

                    // 3. Check if AI wants to see the screen (only if we didn't just take one)
                    if (!takeScreenshotFirst && aiResponseText.includes('[SCREENSHOT_REQUEST]')) {
                        console.log('AI requested a screenshot. Taking screenshot...');
                        ws.send(JSON.stringify({ type: 'status', text: 'Ekrana bakıyor...' }));

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
                        
                        const toolCalls2 = response.choices[0].message.tool_calls;
                        if (toolCalls2 && toolCalls2.length > 0) {
                            for (const toolCall of toolCalls2) {
                                if (toolCall.function.name === 'send_email') {
                                    try {
                                        const emailData = JSON.parse(toolCall.function.arguments);
                                        const n8nUrl = process.env.N8N_API_URL;
                                        if (n8nUrl) {
                                            fetch(n8nUrl, {
                                                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailData)
                                            });
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
                                }
                            }
                        }
                    }

                    aiResponseText = aiResponseText.replace(/\[SCREENSHOT_REQUEST\]/g, '').trim();
                    
                    let hasNextStep = false;
                    if (aiResponseText.includes('[NEXT_STEP]')) {
                        hasNextStep = true;
                        aiResponseText = aiResponseText.replace(/\[NEXT_STEP\]/g, '').trim();
                        currentMessages.push({ role: 'assistant', content: aiResponseText });
                    }
                    
                    // Parse and execute normalized Point requests [POINT:x,y:label]
                    const pointMatch = aiResponseText.match(/\[POINT:(\d+),(\d+):(.*?)\]/);
                    if (pointMatch) {
                        const normX = parseInt(pointMatch[1], 10);
                        const normY = parseInt(pointMatch[2], 10);
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        console.log(`AI requested to point at normalized ${normX}, ${normY} -> Drawing at pixels ${pixelX}, ${pixelY}`);
                        exec(`DrawCircle.exe ${pixelX} ${pixelY}`, (error) => { if (error) console.error("Error drawing circle:", error); });
                        aiResponseText = aiResponseText.replace(/\[POINT:\d+,\d+:.*?\]/g, '').trim();
                    }

                    // Parse and execute normalized Click requests [CLICK:x,y]
                    const clickMatch = aiResponseText.match(/\[CLICK:(\d+),(\d+)\]/);
                    if (clickMatch) {
                        const normX = parseInt(clickMatch[1], 10);
                        const normY = parseInt(clickMatch[2], 10);
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        console.log(`AI requested to click at normalized ${normX}, ${normY} -> Clicking at pixels ${pixelX}, ${pixelY}`);
                        exec(`DrawClick.exe ${pixelX} ${pixelY}`, (err) => { if (err) console.error("Error drawing click:", err); });
                        exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => { if (error) console.error("Error clicking:", error); });
                        aiResponseText = aiResponseText.replace(/\[CLICK:\d+,\d+\]/g, '').trim();
                    }

                    // Parse and execute normalized Double Click requests [DOUBLE_CLICK:x,y]
                    const dblClickMatch = aiResponseText.match(/\[DOUBLE_CLICK:(\d+),(\d+)\]/);
                    if (dblClickMatch) {
                        const normX = parseInt(dblClickMatch[1], 10);
                        const normY = parseInt(dblClickMatch[2], 10);
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        console.log(`AI requested to double click at normalized ${normX}, ${normY} -> Double clicking at pixels ${pixelX}, ${pixelY}`);
                        exec(`DrawClick.exe ${pixelX} ${pixelY} double`, (err) => { if (err) console.error("Error drawing double click:", err); });
                        exec(`MouseClicker.exe doubleclick ${pixelX} ${pixelY}`, (error) => { if (error) console.error("Error double clicking:", error); });
                        aiResponseText = aiResponseText.replace(/\[DOUBLE_CLICK:\d+,\d+\]/g, '').trim();
                    }

                    // Parse and execute normalized Drag requests [DRAG:x1,y1,x2,y2]
                    const dragMatch = aiResponseText.match(/\[DRAG:(\d+),(\d+),(\d+),(\d+)\]/);
                    if (dragMatch) {
                        const normX1 = parseInt(dragMatch[1], 10);
                        const normY1 = parseInt(dragMatch[2], 10);
                        const normX2 = parseInt(dragMatch[3], 10);
                        const normY2 = parseInt(dragMatch[4], 10);
                        const pixelX1 = Math.round((normX1 / 1000) * loopImgWidth);
                        const pixelY1 = Math.round((normY1 / 1000) * loopImgHeight);
                        const pixelX2 = Math.round((normX2 / 1000) * loopImgWidth);
                        const pixelY2 = Math.round((normY2 / 1000) * loopImgHeight);
                        console.log(`AI requested to drag from normalized ${normX1}, ${normY1} to ${normX2}, ${normY2}`);
                        exec(`DrawClick.exe ${pixelX1} ${pixelY1}`, (err) => { if (err) console.error("Error drawing click:", err); });
                        exec(`MouseClicker.exe drag ${pixelX1} ${pixelY1} ${pixelX2} ${pixelY2}`, (error) => { if (error) console.error("Error dragging:", error); });
                        aiResponseText = aiResponseText.replace(/\[DRAG:\d+,\d+,\d+,\d+\]/g, '').trim();
                    }

                    // Parse and execute normalized Scroll Up requests [SCROLL_UP:x,y,amount]
                    const scrollUpMatch = aiResponseText.match(/\[SCROLL_UP:(\d+),(\d+),(\d+)\]/);
                    if (scrollUpMatch) {
                        const normX = parseInt(scrollUpMatch[1], 10);
                        const normY = parseInt(scrollUpMatch[2], 10);
                        const amount = parseInt(scrollUpMatch[3], 10);
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        console.log(`AI requested to scroll up at normalized ${normX}, ${normY} with amount ${amount}`);
                        exec(`MouseClicker.exe scrollup ${pixelX} ${pixelY} ${amount}`, (error) => { if (error) console.error("Error scrolling up:", error); });
                        aiResponseText = aiResponseText.replace(/\[SCROLL_UP:\d+,\d+,\d+\]/g, '').trim();
                    }

                    // Parse and execute normalized Scroll Down requests [SCROLL_DOWN:x,y,amount]
                    const scrollDownMatch = aiResponseText.match(/\[SCROLL_DOWN:(\d+),(\d+),(\d+)\]/);
                    if (scrollDownMatch) {
                        const normX = parseInt(scrollDownMatch[1], 10);
                        const normY = parseInt(scrollDownMatch[2], 10);
                        const amount = parseInt(scrollDownMatch[3], 10);
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        console.log(`AI requested to scroll down at normalized ${normX}, ${normY} with amount ${amount}`);
                        exec(`MouseClicker.exe scrolldown ${pixelX} ${pixelY} ${amount}`, (error) => { if (error) console.error("Error scrolling down:", error); });
                        aiResponseText = aiResponseText.replace(/\[SCROLL_DOWN:\d+,\d+,\d+\]/g, '').trim();
                    }

                    // Parse and execute normalized Type requests [TYPE:x,y:text]
                    const typeMatch = aiResponseText.match(/\[TYPE:(\d+),(\d+):(.*?)\]/);
                    if (typeMatch) {
                        const normX = parseInt(typeMatch[1], 10);
                        const normY = parseInt(typeMatch[2], 10);
                        const textToType = typeMatch[3];
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        const base64Text = Buffer.from(textToType, 'utf-8').toString('base64');
                        console.log(`AI requested to type at normalized ${normX}, ${normY} -> Clicking at ${pixelX}, ${pixelY} and typing: ${textToType}`);
                        exec(`DrawClick.exe ${pixelX} ${pixelY}`, (err) => { if (err) console.error("Error drawing click:", err); });
                        exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => {
                            if (error) console.error("Error clicking for type:", error);
                            exec(`KeyboardTyper.exe ${base64Text}`, (err2) => { if (err2) console.error("Error typing:", err2); });
                        });
                        aiResponseText = aiResponseText.replace(/\[TYPE:\d+,\d+:.*?\]/g, '').trim();
                    }

                    // Parse and execute normalized Type+Enter requests [TYPE_ENTER:x,y:text]
                    const typeEnterMatch = aiResponseText.match(/\[TYPE_ENTER:(\d+),(\d+):(.*?)\]/);
                    if (typeEnterMatch) {
                        const normX = parseInt(typeEnterMatch[1], 10);
                        const normY = parseInt(typeEnterMatch[2], 10);
                        const textToType = typeEnterMatch[3];
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        const base64Text = Buffer.from(textToType, 'utf-8').toString('base64');
                        console.log(`AI requested to type+enter at normalized ${normX}, ${normY} -> Clicking at ${pixelX}, ${pixelY} and typing: ${textToType}`);
                        exec(`DrawClick.exe ${pixelX} ${pixelY}`, (err) => { if (err) console.error("Error drawing click:", err); });
                        exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => {
                            if (error) console.error("Error clicking for type:", error);
                            exec(`KeyboardTyper.exe ${base64Text} enter`, (err2) => { if (err2) console.error("Error typing:", err2); });
                        });
                        aiResponseText = aiResponseText.replace(/\[TYPE_ENTER:\d+,\d+:.*?\]/g, '').trim();
                    }

                    // Parse and execute normalized Paste Image requests [PASTE_IMAGE:x,y:url]
                    const pasteImageMatch = aiResponseText.match(/\[PASTE_IMAGE:(\d+),(\d+):(.*?)\]/);
                    if (pasteImageMatch) {
                        const normX = parseInt(pasteImageMatch[1], 10);
                        const normY = parseInt(pasteImageMatch[2], 10);
                        const imageUrl = pasteImageMatch[3];
                        const pixelX = Math.round((normX / 1000) * loopImgWidth);
                        const pixelY = Math.round((normY / 1000) * loopImgHeight);
                        
                        console.log(`AI requested to paste image at normalized ${normX}, ${normY} -> Clicking at ${pixelX}, ${pixelY} and pasting: ${imageUrl}`);
                        ws.send(JSON.stringify({ type: 'status', text: 'Görsel indiriliyor ve yapıştırılıyor...' }));
                        
                        try {
                            const res = await fetch(imageUrl);
                            const arrayBuffer = await res.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const tempImgPath = path.join(__dirname, 'temp_paste.png');
                            fs.writeFileSync(tempImgPath, buffer);
                            
                            exec(`DrawClick.exe ${pixelX} ${pixelY}`, (err) => { if (err) console.error("Error drawing click:", err); });
                            exec(`MouseClicker.exe click ${pixelX} ${pixelY}`, (error) => {
                                if (error) console.error("Error clicking for paste image:", error);
                                exec(`PasteImage.exe "${tempImgPath}"`, (err2) => { if (err2) console.error("Error pasting image:", err2); });
                            });
                        } catch(e) {
                            console.error("Failed to download or paste image:", e);
                        }
                        
                        aiResponseText = aiResponseText.replace(/\[PASTE_IMAGE:\d+,\d+:.*?\]/g, '').trim();
                    }

                    console.log('AI Response:', aiResponseText);

                    // 3. Send response back to frontend
                    ws.send(JSON.stringify({
                        type: 'answer',
                        text: aiResponseText
                    }));

                    if (hasNextStep) {
                        ws.send(JSON.stringify({ type: 'status', text: 'İşlem devam ediyor (bekleniyor)...' }));
                        await delay(3500); // Wait 3.5 seconds for UI to settle
                        await processAgentLoop(currentMessages, ws, true);
                    }
                }

                await processAgentLoop(messages, ws, false);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Bir hata oluştu: ' + error.message
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
    });
});

server.listen(PORT, () => {
    console.log(`AIKO Server is running on http://localhost:${PORT}`);
});
