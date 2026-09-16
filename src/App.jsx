import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const createNewSession = () => ({
    id: 'session_' + Date.now(),
    title: 'Yeni sohbet',
    messages: [],
    createdAt: Date.now()
});

function App() {
    // Sohbet Oturumları (Kullanıcının gerçek sohbetleri saklanır)
    const [sessions, setSessions] = useState(() => {
        try {
            const saved = localStorage.getItem('aiko_chat_sessions');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.error("LocalStorage okuma hatası:", e);
        }
        return [createNewSession()];
    });

    const [currentSessionId, setCurrentSessionId] = useState(() => {
        try {
            const last = localStorage.getItem('aiko_current_session_id');
            if (last) return last;
        } catch (e) {}
        return sessions[0]?.id || 'session_' + Date.now();
    });

    // Aktif oturum ve mesajları
    const activeSession = sessions.find(s => s.id === currentSessionId) || sessions[0] || createNewSession();
    const messages = activeSession.messages || [];

    const [inputVal, setInputVal] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('Hazır');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [isGuideMode, setIsGuideMode] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const chatAreaRef = useRef(null);
    const recognitionRef = useRef(null);
    const inputRef = useRef(null);

    // Oturumları kaydet
    useEffect(() => {
        try {
            localStorage.setItem('aiko_chat_sessions', JSON.stringify(sessions));
            localStorage.setItem('aiko_current_session_id', currentSessionId);
        } catch (e) {
            console.error("LocalStorage kaydetme hatası:", e);
        }
    }, [sessions, currentSessionId]);

    // Mesaj ekleme
    const updateActiveSessionMessages = (updater) => {
        setSessions(prevSessions => {
            return prevSessions.map(sess => {
                if (sess.id === currentSessionId) {
                    const newMessages = typeof updater === 'function' ? updater(sess.messages) : updater;
                    let title = sess.title;
                    if ((sess.title === 'Yeni sohbet' || !sess.title) && newMessages.length > 0) {
                        const firstUserMsg = newMessages.find(m => m.role === 'user');
                        if (firstUserMsg) {
                            title = firstUserMsg.text.slice(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
                        }
                    }
                    return { ...sess, messages: newMessages, title, updatedAt: Date.now() };
                }
                return sess;
            });
        });
    };

    const handleSelectSession = (id) => {
        setCurrentSessionId(id);
        setActiveQuestion(null);
    };

    const handleNewChat = () => {
        const newSess = createNewSession();
        setSessions(prev => [newSess, ...prev]);
        setCurrentSessionId(newSess.id);
        setActiveQuestion(null);
        setInputVal('');
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleDeleteSession = (e, id) => {
        e.stopPropagation();
        setSessions(prev => {
            const filtered = prev.filter(s => s.id !== id);
            if (filtered.length === 0) {
                const fresh = createNewSession();
                setCurrentSessionId(fresh.id);
                return [fresh];
            }
            if (currentSessionId === id) {
                setCurrentSessionId(filtered[0].id);
            }
            return filtered;
        });
    };

    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages, isProcessing, activeQuestion]);

    // Sesli Komut ve Electron Dinleyicileri
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
                updateActiveSessionMessages(prev => [
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
                updateActiveSessionMessages(prev => [
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
    }, [currentSessionId]);

    const handleSend = (textOverride = null) => {
        const text = textOverride !== null ? textOverride : inputVal.trim();
        if (!text) return;

        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        updateActiveSessionMessages(prev => [...prev, { role: 'user', text, time: currentTime }]);
        setInputVal('');
        setIsProcessing(true);
        setStatus('İşleniyor');

        if (window.api) {
            window.api.askQuestion(text, isGuideMode);
        } else {
            setIsProcessing(false);
            updateActiveSessionMessages(prev => [
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

    const filteredSessions = sessions.filter(s => 
        !searchTerm || (s.title && s.title.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Ortadaki Chat Giriş Kutusu (Fotoğraftaki tasarıma sahip, bizde olan bileşenler)
    const renderChatInputBox = () => (
        <div className="cpt-input-bar">
            {/* Orta: Metin Girişi */}
            <input 
                ref={inputRef}
                type="text"
                className="cpt-text-input"
                placeholder={isRecording ? "Ses dinleniyor..." : "İstediğin bir şeyi sor"}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                autoComplete="off"
            />

            {/* Sağ Aksiyonlar: Mikrofon & Mavi Dairesel Gönder Butonu */}
            <div className="cpt-right-actions">
                {/* Mikrofon (Sesli Giriş) */}
                <button 
                    type="button" 
                    className={`cpt-icon-btn mic-btn ${isRecording ? 'recording' : ''}`}
                    onClick={toggleMic}
                    title="Sesli Komut"
                >
                    <span className="material-icons-round">mic</span>
                </button>

                {/* Mavi Daire Gönder / Durdur Butonu */}
                {isProcessing ? (
                    <button 
                        type="button" 
                        className="cpt-primary-circle-btn stop-mode"
                        onClick={handleStop}
                        title="İşlemi Durdur"
                    >
                        <span className="material-icons-round">stop</span>
                    </button>
                ) : (
                    <button 
                        type="button" 
                        className={`cpt-primary-circle-btn ${!inputVal.trim() && !isRecording ? 'disabled' : ''}`}
                        onClick={() => handleSend(null)}
                        disabled={!inputVal.trim() && !isRecording}
                        title="Gönder"
                    >
                        <span className="material-icons-round">arrow_upward</span>
                    </button>
                )}
            </div>
        </div>
    );

    // AIKO'nun gerçek kabiliyetlerine uygun hızlı başlangıç seçenekleri
    const renderQuickActions = () => (
        <div className="cpt-quick-actions">
            <button 
                className="quick-action-btn"
                onClick={() => handleSend("Ekranda ne görüyorsun? Detaylı açıkla.")}
            >
                <span className="material-icons-round">visibility</span>
                <span>Ekrandaki içeriği analiz et</span>
            </button>

            <button 
                className="quick-action-btn"
                onClick={() => handleSend("Şu an açık olan penceredeki işlemi yapmam için bana adım adım rehberlik et.")}
            >
                <span className="material-icons-round">explore</span>
                <span>Adım adım işlem rehberliği al</span>
            </button>
        </div>
    );

    return (
        <div className="app-layout">
            {/* Sol Kenar Çubuğu (Collapsible Sidebar) */}
            <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-inner">
                    {/* Üst Kısım: AIKO Markası & Kenar Çubuğunu Kapatma Butonu */}
                    <div className="sidebar-header">
                        <div className="sidebar-brand">
                            <button 
                                className="icon-btn hamburger-btn" 
                                onClick={() => setIsSidebarOpen(false)}
                                title="Kenar Çubuğunu Kapat"
                                aria-label="Kenar Çubuğunu Kapat"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="3" y1="6" x2="21" y2="6"></line>
                                    <line x1="3" y1="12" x2="21" y2="12"></line>
                                    <line x1="3" y1="18" x2="21" y2="18"></line>
                                </svg>
                            </button>
                            <span className="brand-text">AIKO</span>
                        </div>
                        <div className="sidebar-top-icons">
                            <button 
                                className="icon-btn" 
                                onClick={() => setIsSearchOpen(!isSearchOpen)}
                                title="Sohbetlerde Ara"
                            >
                                <span className="material-icons-round">search</span>
                            </button>
                        </div>
                    </div>

                    {/* Arama Alanı */}
                    {isSearchOpen && (
                        <div className="sidebar-search-bar">
                            <input 
                                type="text"
                                placeholder="Sohbet ara..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                            {searchTerm && (
                                <button className="clear-search" onClick={() => setSearchTerm('')}>
                                    <span className="material-icons-round">close</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Yeni Sohbet Butonu */}
                    <button className="new-chat-btn" onClick={handleNewChat}>
                        <span className="material-icons-round">edit_note</span>
                        <span>Yeni sohbet</span>
                    </button>

                    {/* Rehber Modu (Sol Menüde, aktif/pasif çalışan anahtar) */}
                    <div className="sidebar-guide-toggle-box">
                        <label className="guide-switch-label">
                            <div className="guide-switch-info">
                                <span className="material-icons-round guide-icon">explore</span>
                                <span>Rehber Modu</span>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={isGuideMode} 
                                onChange={(e) => setIsGuideMode(e.target.checked)} 
                            />
                            <span className="switch-slider"></span>
                        </label>
                    </div>

                    {/* Sohbet Geçmişi: Yakın Zamandakiler */}
                    <div className="sidebar-history">
                        <div className="history-section-title">Yakın zamandakiler</div>
                        <div className="history-list">
                            {filteredSessions.map((sess) => (
                                <div 
                                    key={sess.id} 
                                    className={`history-item ${sess.id === currentSessionId ? 'active' : ''}`}
                                    onClick={() => handleSelectSession(sess.id)}
                                >
                                    <span className="history-item-title">{sess.title || 'Yeni sohbet'}</span>
                                    <button 
                                        className="history-item-del"
                                        onClick={(e) => handleDeleteSession(e, sess.id)}
                                        title="Sohbeti Sil"
                                    >
                                        <span className="material-icons-round">delete_outline</span>
                                    </button>
                                </div>
                            ))}
                            {filteredSessions.length === 0 && (
                                <div className="history-empty">Henüz sohbet geçmişi yok</div>
                            )}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Ana İçerik Alanı */}
            <div className="main-content">
                {/* Sol Menü Kapalıyken Sol Üstte Sabit Duran 3 Çizgili Menü Butonu */}
                {!isSidebarOpen && (
                    <button 
                        className="icon-btn fixed-sidebar-toggle-btn" 
                        onClick={() => setIsSidebarOpen(true)}
                        title="Kenar Çubuğunu Aç"
                        aria-label="Kenar Çubuğunu Aç"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                )}

                {/* Üst Minimalist Bar (Tam Ortalanmış) */}
                <header className="top-bar">
                    <div className="top-bar-center">
                        <div className="mode-pill-selector">
                            <span className="pill-tab active">Sohbet</span>
                        </div>
                    </div>
                </header>

                {/* Mesaj Yokken: Sayfanın Ortasında Sade ChatGPT Tarzı Chat Kutusu */}
                {messages.length === 0 ? (
                    <div className="hero-centered-content">
                        <div className="hero-box">
                            {renderChatInputBox()}
                            {renderQuickActions()}
                        </div>
                    </div>
                ) : (
                    /* Mesaj Varken: Mesaj Akışı ve Alttaki Chat Kutusu */
                    <>
                        <main className="chat-viewport" ref={chatAreaRef}>
                            <div className="chat-container">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`chat-message ${msg.role}`}>
                                        <div className="message-bubble-wrapper">
                                            {msg.role === 'ai' && (
                                                <div className="message-avatar aiko-avatar">
                                                    <span className="material-icons-round">smart_toy</span>
                                                </div>
                                            )}
                                            <div className="message-content">
                                                {msg.role === 'system' ? (
                                                    <div className="system-notice">
                                                        <span className="material-icons-round">info</span>
                                                        <span>{msg.text}</span>
                                                    </div>
                                                ) : msg.isHtml ? (
                                                    <div dangerouslySetInnerHTML={formatMessage(msg.text)} />
                                                ) : (
                                                    <div>{msg.text}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* İşlem Sürüyor */}
                                {isProcessing && (
                                    <div className="chat-message ai processing">
                                        <div className="message-bubble-wrapper">
                                            <div className="message-avatar aiko-avatar">
                                                <span className="material-icons-round">smart_toy</span>
                                            </div>
                                            <div className="message-content processing-box">
                                                <div className="thinking-dots">
                                                    <span></span>
                                                    <span></span>
                                                    <span></span>
                                                </div>
                                                <span className="thinking-text">Yanıt üretiliyor...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Soru / Seçim Kartı */}
                                {activeQuestion && (
                                    <div className="chat-message ai">
                                        <div className="message-bubble-wrapper">
                                            <div className="message-avatar aiko-avatar">
                                                <span className="material-icons-round">help_outline</span>
                                            </div>
                                            <div className="message-content">
                                                <form className="question-interactive-card" onSubmit={submitQuestion}>
                                                    <div className="q-card-header">
                                                        <span className="q-title">Kullanıcı Kararı Gerekli</span>
                                                    </div>
                                                    <div className="q-body-text">{activeQuestion.question}</div>
                                                    <div className="q-options-list">
                                                        {activeQuestion.options.map((opt, i) => (
                                                            <label key={i} className="q-option-item">
                                                                <input type="radio" name="q_choice" value={opt} />
                                                                <span className="q-custom-radio"></span>
                                                                <span className="q-option-text">{opt}</span>
                                                            </label>
                                                        ))}
                                                        <label className="q-option-item other-opt">
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
                                                            <span className="q-custom-radio"></span>
                                                            <span className="q-option-text">Diğer (Belirtin)</span>
                                                        </label>
                                                        <input 
                                                            type="text" 
                                                            name="q_custom"
                                                            id="q_custom_input" 
                                                            className="q-other-field" 
                                                            placeholder="Belirtmek istediğiniz seçeneği yazın..." 
                                                            disabled 
                                                            autoComplete="off" 
                                                        />
                                                    </div>
                                                    <button type="submit" className="q-submit-btn">
                                                        Seçimi Onayla
                                                    </button>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </main>

                        {/* Alttaki Giriş Alanı */}
                        <div className="input-outer-wrapper">
                            <div className="input-inner-container">
                                {renderChatInputBox()}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default App;
