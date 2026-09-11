const chatArea = document.getElementById('chat-area');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const stopBtn = document.getElementById('stop-btn');
const statusText = document.getElementById('status-text');
const pulseRing = document.querySelector('.pulse-ring');

let ws;
let isRecording = false;

// Initialize Speech Recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'tr-TR';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add('recording');
        pulseRing.classList.add('recording');
        statusText.innerText = "Dinliyor...";
        textInput.placeholder = "Dinliyorum...";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        textInput.value = transcript;
        sendPrompt(transcript);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopRecording();
        statusText.innerText = "Bağlı";
    };

    recognition.onend = () => {
        stopRecording();
    };
} else {
    micBtn.style.display = 'none';
    console.warn('Speech Recognition API not supported in this browser.');
}

function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');
    pulseRing.classList.remove('recording');
    textInput.placeholder = "Yazın veya konuşun...";
    statusText.innerText = "Bağlı";
}

// WebSocket Connection
function connectWebSocket() {
    ws = new WebSocket(`ws://${window.location.host}`);

    ws.onopen = () => {
        statusText.innerText = "Bağlı";
        pulseRing.classList.remove('offline');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'answer') {
            removeLoadingIndicator();
            statusText.innerText = "Bağlı";
            setInputState(false);
            appendMessage(data.text, 'ai');
            // speakText(data.text); // Kullanıcı isteği üzerine sesli okuma kapatıldı
        } else if (data.type === 'error') {
            removeLoadingIndicator();
            statusText.innerText = "Bağlı";
            setInputState(false);
            appendMessage("Hata: " + data.message, 'system');
        } else if (data.type === 'question') {
            removeLoadingIndicator();
            statusText.innerText = "Bağlı";
            setInputState(false);
            appendQuestionForm(data.question, data.options);
        } else if (data.type === 'status') {
            statusText.innerText = data.text;
            if (data.text === 'İşlem durduruldu.') {
                removeLoadingIndicator();
                setInputState(false);
            }
        }
    };

    ws.onclose = () => {
        statusText.innerText = "Bağlantı kesildi. Yeniden deneniyor...";
        pulseRing.classList.add('offline');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    }
}

connectWebSocket();

// Speech Synthesis
function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop current speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';
        
        // Optional: Select a specific voice if available
        const voices = window.speechSynthesis.getVoices();
        const trVoice = voices.find(v => v.lang.includes('tr'));
        if (trVoice) {
            utterance.voice = trVoice;
        }
        
        window.speechSynthesis.speak(utterance);
    }
}

// UI Interactions
function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    
    // Basic text escaping
    const escapedText = document.createElement('div');
    escapedText.innerText = text;
    
    // Replace markdown images
    msgDiv.innerHTML = escapedText.innerHTML.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">');
    
    chatArea.appendChild(msgDiv);
    
    // Wait for images to load before scrolling
    const imgs = msgDiv.querySelectorAll('img');
    imgs.forEach(img => {
        img.onload = () => chatArea.scrollTop = chatArea.scrollHeight;
    });
    
    chatArea.scrollTop = chatArea.scrollHeight;
}

function showLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = `message loading`;
    loadingDiv.id = 'loading-indicator';
    loadingDiv.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
    chatArea.appendChild(loadingDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function removeLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function appendQuestionForm(questionText, options) {
    const formDiv = document.createElement('div');
    formDiv.className = 'message ai question-form';
    
    // Create random ID prefix for radio buttons
    const prefix = 'q_' + Math.random().toString(36).substr(2, 9);
    
    let html = `<div class="question-text">${questionText}</div>`;
    html += `<div class="radio-group">`;
    
    options.forEach((opt, index) => {
        const id = `${prefix}_${index}`;
        html += `
            <label class="radio-option" for="${id}">
                <input type="radio" name="${prefix}" id="${id}" value="${opt}">
                ${opt}
            </label>
        `;
    });
    
    // Add "Diğer" (Other) option
    const otherId = `${prefix}_other`;
    html += `
            <label class="radio-option" for="${otherId}">
                <input type="radio" name="${prefix}" id="${otherId}" value="other">
                Diğer (Belirtin)
            </label>
            <input type="text" class="custom-input" id="${prefix}_custom" placeholder="Kendi tercihinizi yazın..." disabled autocomplete="off">
    `;
    
    html += `</div>`;
    html += `<button class="submit-choice-btn" id="${prefix}_submit">Gönder</button>`;
    
    formDiv.innerHTML = html;
    chatArea.appendChild(formDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Add event listeners
    const customInput = formDiv.querySelector(`#${prefix}_custom`);
    const radios = formDiv.querySelectorAll(`input[name="${prefix}"]`);
    const submitBtn = formDiv.querySelector(`#${prefix}_submit`);
    
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'other') {
                customInput.disabled = false;
                customInput.focus();
            } else {
                customInput.disabled = true;
            }
        });
    });
    
    submitBtn.addEventListener('click', () => {
        let selectedValue = null;
        radios.forEach(r => { if (r.checked) selectedValue = r.value; });
        
        if (!selectedValue) {
            alert("Lütfen bir seçenek işaretleyin.");
            return;
        }
        
        if (selectedValue === 'other') {
            selectedValue = customInput.value.trim();
            if (!selectedValue) {
                alert("Lütfen diğer alanını doldurun.");
                return;
            }
        }
        
        // Disable form to prevent resubmit
        radios.forEach(r => r.disabled = true);
        customInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.innerText = "Gönderildi";
        
        sendPrompt("Seçimim: " + selectedValue);
    });
}

function sendPrompt(text = null) {
    const prompt = text || textInput.value.trim();
    if (!prompt) return;

    appendMessage(prompt, 'user');
    textInput.value = '';
    
    showLoadingIndicator();
    setInputState(true);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'ask_question',
            prompt: prompt
        }));
    } else {
        removeLoadingIndicator();
        setInputState(false);
        appendMessage("Sunucuya bağlı değilsiniz.", 'system');
    }
}

function setInputState(isProcessing) {
    if (isProcessing) {
        sendBtn.style.display = 'none';
        micBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        stopBtn.innerHTML = '<span class="material-icons-round">stop</span>';
        stopBtn.disabled = false;
        textInput.disabled = true;
    } else {
        sendBtn.style.display = 'flex';
        micBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        textInput.disabled = false;
        textInput.focus();
    }
}

// Event Listeners
stopBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
        stopBtn.innerHTML = '<span class="material-icons-round">hourglass_empty</span>';
        stopBtn.disabled = true;
        statusText.innerText = "Durduruluyor...";
    }
});
sendBtn.addEventListener('click', () => sendPrompt());

textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPrompt();
    }
});

micBtn.addEventListener('click', () => {
    if (isRecording) {
        recognition.stop();
        stopRecording();
    } else {
        if (recognition) {
            try {
                recognition.start();
            } catch (e) {
                console.error("Zaten dinliyor", e);
            }
        }
    }
});

// Initial greeting TTS load (sometimes browser needs a user gesture to speak, so we wait for interaction)
window.speechSynthesis.onvoiceschanged = () => {
    // voices loaded
};
