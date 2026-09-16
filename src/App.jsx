import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
    const [messages, setMessages] = useState([]);
    const [inputVal, setInputVal] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Hazır');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [isGuideMode, setIsGuideMode] = useState(false);
    const chatAreaRef = useRef(null);
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages, isProcessing, activeQuestion]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'tr-TR';
            recognition.interimResults = false;

            recognition.onstart = () => {
                setIsRecording(true);
                setStatus('Dinliyor');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInputVal(transcript);
                handleSend(transcript);
            };

            recognition.onerror = (event) => {
                console.error('Ses tanıma hatası:', event.error);
                setIsRecording(false);
                setStatus('Hazır');
            };

            recognition.onend = () => {
                setIsRecording(false);
                if (status === 'Dinliyor') setStatus('Hazır');
            };

            recognitionRef.current = recognition;
        }

        if (window.api) {
            window.api.onAnswer((value) => {
                setIsProcessing(false);
                setStatus('Hazır');
                setMessages(prev => [
                    ...prev, 
                    { 
                        role: 'ai', 
                        text: value, 
                        isHtml: true,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                ]);
            });

            window.api.onError((value) => {
                setIsProcessing(false);
                setStatus('Hata');
                setMessages(prev => [
                    ...prev, 
                    { 
                        role: 'system', 
                        text: `Sistem Uyarısı: ${value}`,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                ]);
            });

            window.api.onQuestion((value) => {
                setIsProcessing(false);
                setStatus('Hazır');
                setActiveQuestion(value);
            });

            window.api.onStatus((value) => {
                setStatus(value);
                if (value === 'İşlem durduruldu.') {
                    setIsProcessing(false);
                }
            });
        }
    }, []);

    const handleSend = (textOverride = null) => {
        const text = textOverride !== null ? textOverride : inputVal.trim();
        if (!text) return;

        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [...prev, { role: 'user', text, time: currentTime }]);
        setInputVal('');
        setIsProcessing(true);
        setStatus('İşleniyor');

        if (window.api) {
            window.api.askQuestion(text, isGuideMode);
        } else {
            setIsProcessing(false);
            setMessages(prev => [
                ...prev, 
                { 
                    role: 'system', 
                    text: 'Masaüstü entegrasyonu bulunamadı. Web önizleme modundasınız.',
                    time: currentTime
                }
            ]);
        }
    };

    const handleStop = () => {
        if (window.api) {
            window.api.stopAction();
            setStatus('Durduruluyor');
        }
    };

    const toggleMic = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            try {
                recognitionRef.current?.start();
            } catch (e) {
                console.error("Ses girişi başlatılamadı:", e);
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatMessage = (text) => {
        const formatted = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
        return { __html: formatted };
    };

    const submitQuestion = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        let selectedValue = formData.get('q_choice');
        
        if (selectedValue === 'other') {
            selectedValue = formData.get('q_custom');
            if (!selectedValue?.trim()) {
                alert("Lütfen diğer seçeneği için açıklama girin.");
                return;
            }
        } else if (!selectedValue) {
            alert("Lütfen bir seçenek belirleyin.");
            return;
        }

        setActiveQuestion(null);
        handleSend("Seçim: " + selectedValue);
    };

    const getStatusIndicatorClass = () => {
        if (!window.api) return 'status-dot offline';
        if (isRecording) return 'status-dot recording';
        if (isProcessing) return 'status-dot processing';
        if (status === 'Hata') return 'status-dot error';
        return 'status-dot online';
    };

    return (
        <div className="container">
            {/* Header / Titlebar */}
            <header className="header">
                <div className="brand-block">
                    <div className="brand-logo-frame">
                        <img src="/app-icon.png" alt="AIKO" className="brand-logo-img" />
                    </div>
                    <div className="brand-identity">
                        <div className="brand-title-row">
                            <span className="brand-name">Aiko</span>
                            <span className="brand-badge">Asistan</span>
                        </div>
                    </div>
                </div>

                <div className="header-controls">
                    <label className={`guide-toggle ${isGuideMode ? 'active' : ''}`} title="Adımlı Rehber Modu">
                        <input 
                            type="checkbox" 
                            checked={isGuideMode} 
                            onChange={(e) => setIsGuideMode(e.target.checked)} 
                        />
                        <span className="guide-indicator"></span>
                        <span className="guide-label">Rehber Modu</span>
                    </label>

                    <div className="status-pill">
                        <span className={getStatusIndicatorClass()}></span>
                        <span className="status-text">{status}</span>
                    </div>
                </div>
            </header>
            
            {/* Main Chat Stream */}
            <main className="chat-area" ref={chatAreaRef}>
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message-wrapper ${msg.role}`}>
                        {msg.role === 'system' ? (
                            <div className="system-pill">
                                <span className="system-tag">Sistem</span>
                                <span className="system-content">{msg.text}</span>
                                {msg.time && <span className="message-time">{msg.time}</span>}
                            </div>
                        ) : (
                            <div className={`message-card ${msg.role}`}>
                                <div className="card-header">
                                    <span className="author-name">
                                        {msg.role === 'ai' ? 'Aiko' : 'Kullanıcı'}
                                    </span>
                                    {msg.time && <span className="message-time">{msg.time}</span>}
                                </div>
                                <div className="card-body">
                                    {msg.isHtml ? (
                                        <div dangerouslySetInnerHTML={formatMessage(msg.text)} />
                                    ) : (
                                        <div>{msg.text}</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                
                {/* Processing State */}
                {isProcessing && (
                    <div className="message-wrapper ai">
                        <div className="message-card ai processing-card">
                            <div className="card-header">
                                <span className="author-name">AIKO</span>
                                <span className="processing-tag">Analiz ediliyor</span>
                            </div>
                            <div className="processing-indicator">
                                <div className="scanner-line"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Interactive Question Card */}
                {activeQuestion && (
                    <div className="message-wrapper ai">
                        <form className="message-card ai question-card" onSubmit={submitQuestion}>
                            <div className="card-header">
                                <span className="author-name">AIKO</span>
                                <span className="badge-action">Kullanıcı Kararı Gerekli</span>
                            </div>
                            <div className="question-prompt">{activeQuestion.question}</div>
                            <div className="choices-grid">
                                {activeQuestion.options.map((opt, i) => (
                                    <label key={i} className="choice-item">
                                        <input type="radio" name="q_choice" value={opt} />
                                        <span className="radio-mark"></span>
                                        <span className="choice-text">{opt}</span>
                                    </label>
                                ))}
                                <label className="choice-item other-choice">
                                    <input 
                                        type="radio" 
                                        name="q_choice" 
                                        value="other" 
                                        onChange={(e) => {
                                            const customInput = document.getElementById('q_custom_input');
                                            if (customInput) {
                                                customInput.disabled = !e.target.checked;
                                                if (e.target.checked) customInput.focus();
                                            }
                                        }}
                                    />
                                    <span className="radio-mark"></span>
                                    <span className="choice-text">Diğer (Belirtin)</span>
                                </label>
                                <input 
                                    type="text" 
                                    name="q_custom"
                                    id="q_custom_input" 
                                    className="custom-choice-input" 
                                    placeholder="Belirtmek istediğiniz seçeneği yazın..." 
                                    disabled 
                                    autoComplete="off" 
                                />
                            </div>
                            <button type="submit" className="confirm-btn">
                                Seçimi Onayla
                            </button>
                        </form>
                    </div>
                )}
            </main>

            {/* Precision Command Dock */}
            <footer className="input-dock">
                <div className="dock-container">
                    {!isProcessing && (
                        <button 
                            type="button"
                            className={`dock-btn mic-btn ${isRecording ? 'recording' : ''}`} 
                            onClick={toggleMic}
                            title="Sesli Komut Girişi"
                        >
                            <span className="material-icons-round">mic</span>
                        </button>
                    )}
                    
                    <input 
                        type="text" 
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isRecording ? "Ses dinleniyor..." : "Komut girin veya ekran hakkında soru sorun..."} 
                        disabled={isProcessing}
                        autoComplete="off"
                        className="command-input"
                    />
                    
                    <div className="dock-actions">
                        {isProcessing ? (
                            <button 
                                type="button" 
                                className="dock-btn stop-btn" 
                                onClick={handleStop} 
                                title="İşlemi Durdur"
                            >
                                <span className="material-icons-round">stop</span>
                            </button>
                        ) : (
                            <>
                                {isGuideMode && (
                                    <button 
                                        type="button" 
                                        className="dock-btn next-btn" 
                                        onClick={() => handleSend("Sonraki adım nedir? Lütfen ekrana bakarak söyle.")} 
                                        title="Sonraki Adımı İste"
                                    >
                                        <span className="material-icons-round">skip_next</span>
                                    </button>
                                )}
                                <button 
                                    type="button" 
                                    className="dock-btn submit-btn" 
                                    onClick={() => handleSend(null)} 
                                    title="Komutu Yürüt"
                                    disabled={!inputVal.trim()}
                                >
                                    <span className="material-icons-round">arrow_upward</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default App;
