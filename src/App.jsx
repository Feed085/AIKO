import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
    const [messages, setMessages] = useState([{ role: 'system', text: 'Aiko bağlandı. Ekranında olan biteni izliyor...', isHtml: true }]);
    const [inputVal, setInputVal] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Bağlı');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [isGuideMode, setIsGuideMode] = useState(false);
    const chatAreaRef = useRef(null);
    const recognitionRef = useRef(null);

    useEffect(() => {
        // Scroll to bottom whenever messages change
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages, isProcessing, activeQuestion]);

    useEffect(() => {
        // Setup speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'tr-TR';
            recognition.interimResults = false;

            recognition.onstart = () => {
                setIsRecording(true);
                setStatus('Dinliyor...');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInputVal(transcript);
                handleSend(transcript);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsRecording(false);
                setStatus('Bağlı');
            };

            recognition.onend = () => {
                setIsRecording(false);
                if (status === 'Dinliyor...') setStatus('Bağlı');
            };

            recognitionRef.current = recognition;
        }

        // Setup Electron IPC Listeners
        if (window.api) {
            window.api.onAnswer((value) => {
                setIsProcessing(false);
                setStatus('Bağlı');
                setMessages(prev => [...prev, { role: 'ai', text: value, isHtml: true }]);
            });

            window.api.onError((value) => {
                setIsProcessing(false);
                setStatus('Bağlı');
                setMessages(prev => [...prev, { role: 'system', text: `Hata: ${value}` }]);
            });

            window.api.onQuestion((value) => {
                setIsProcessing(false);
                setStatus('Bağlı');
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

        setMessages(prev => [...prev, { role: 'user', text }]);
        setInputVal('');
        setIsProcessing(true);
        setStatus('İşleniyor...');

        if (window.api) {
            window.api.askQuestion(text, isGuideMode);
        } else {
            setIsProcessing(false);
            setMessages(prev => [...prev, { role: 'system', text: 'Electron API bulunamadı (Tarayıcıda çalışıyorsanız normaldir).' }]);
        }
    };

    const handleStop = () => {
        if (window.api) {
            window.api.stopAction();
            setStatus('Durduruluyor...');
        }
    };

    const toggleMic = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            try {
                recognitionRef.current?.start();
            } catch (e) {
                console.error("Zaten dinliyor", e);
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    const formatMessage = (text) => {
        // Replace markdown images with HTML img tags
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
                alert("Lütfen diğer alanını doldurun.");
                return;
            }
        } else if (!selectedValue) {
            alert("Lütfen bir seçenek işaretleyin.");
            return;
        }

        setActiveQuestion(null);
        handleSend("Seçimim: " + selectedValue);
    };

    return (
        <div className="container">
            <div className="header">
                <div className="logo-area">
                    <div className={`pulse-ring ${isRecording ? 'recording' : ''} ${!window.api ? 'offline' : ''}`}></div>
                    <div className="logo">AIKO</div>
                </div>
                <div className="header-controls">
                    <label className="guide-mode-toggle" title="Adımlı Rehber Modu">
                        <input type="checkbox" checked={isGuideMode} onChange={(e) => setIsGuideMode(e.target.checked)} />
                        Rehber Modu
                    </label>
                    <div className="status" id="status-text">{status}</div>
                </div>
            </div>
            
            <div className="chat-area" ref={chatAreaRef}>
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                        {msg.isHtml ? (
                            <div dangerouslySetInnerHTML={formatMessage(msg.text)} />
                        ) : (
                            <div>{msg.text}</div>
                        )}
                    </div>
                ))}
                
                {isProcessing && (
                    <div className="message loading">
                        <div className="dot"></div>
                        <div className="dot"></div>
                        <div className="dot"></div>
                    </div>
                )}

                {activeQuestion && (
                    <form className="message ai question-form" onSubmit={submitQuestion}>
                        <div className="question-text">{activeQuestion.question}</div>
                        <div className="radio-group">
                            {activeQuestion.options.map((opt, i) => (
                                <label key={i} className="radio-option">
                                    <input type="radio" name="q_choice" value={opt} />
                                    {opt}
                                </label>
                            ))}
                            <label className="radio-option">
                                <input type="radio" name="q_choice" value="other" onChange={(e) => {
                                    const customInput = document.getElementById('q_custom_input');
                                    if(customInput) {
                                        customInput.disabled = !e.target.checked;
                                        if(e.target.checked) customInput.focus();
                                    }
                                }}/>
                                Diğer (Belirtin)
                            </label>
                            <input 
                                type="text" 
                                name="q_custom"
                                id="q_custom_input" 
                                className="custom-input" 
                                placeholder="Kendi tercihinizi yazın..." 
                                disabled 
                                autoComplete="off" 
                            />
                        </div>
                        <button type="submit" className="submit-choice-btn">Gönder</button>
                    </form>
                )}
            </div>

            <div className="input-area">
                {!isProcessing && (
                    <button 
                        className={`icon-btn ${isRecording ? 'recording' : ''}`} 
                        onClick={toggleMic}
                        title="Sesli Komut"
                    >
                        <span className="material-icons-round">mic</span>
                    </button>
                )}
                
                <input 
                    type="text" 
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isRecording ? "Dinliyorum..." : "Yazın veya konuşun..."} 
                    disabled={isProcessing}
                    autoComplete="off"
                />
                
                {isProcessing ? (
                    <button className="icon-btn danger" onClick={handleStop} title="Durdur">
                        <span className="material-icons-round">stop</span>
                    </button>
                ) : (
                    <>
                        {isGuideMode && (
                            <button className="icon-btn info" onClick={() => handleSend("Sonraki adım nedir? Lütfen ekrana bakarak söyle.")} title="Sonraki Adım">
                                <span className="material-icons-round">skip_next</span>
                            </button>
                        )}
                        <button className="icon-btn primary" onClick={() => handleSend(null)} title="Gönder ve Ekranı Analiz Et">
                            <span className="material-icons-round">send</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default App;
