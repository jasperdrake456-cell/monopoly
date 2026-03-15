import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ClaudePage.css';

export default function ClaudePage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  async function sendMessage() {
    if (!input.trim() || streaming) return;

    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    // Add empty assistant message for streaming into
    setMessages(prev => [...prev, { role: 'assistant', content: '', pending: true }]);

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + parsed.text, pending: false };
                return updated;
              });
            }
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Error: ' + err.message, error: true };
        return updated;
      });
    }

    setStreaming(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="cl-page">
      <header className="cl-header">
        <button className="cl-back" onClick={() => navigate('/')}>← Back</button>
        <div className="cl-title">
          <span className="cl-title-icon">✦</span>
          Gemini AI
        </div>
        <button
          className="cl-clear"
          onClick={() => setMessages([])}
          style={{ visibility: messages.length > 0 ? 'visible' : 'hidden' }}
        >
          Clear
        </button>
      </header>

      <div className="cl-messages">
        {messages.length === 0 && (
          <div className="cl-empty">
            <div className="cl-empty-icon">✦</div>
            <h2>Gemini AI</h2>
            <p>Powered by Gemini. Ask me anything.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`cl-row cl-row--${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="cl-avatar">✦</div>
            )}
            <div className={`cl-bubble cl-bubble--${msg.role}${msg.error ? ' cl-bubble--error' : ''}`}>
              {msg.pending && msg.content === '' ? (
                <span className="cl-typing">
                  <span /><span /><span />
                </span>
              ) : (
                <div className="cl-text">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="cl-input-wrap">
        <div className="cl-input-box">
          <textarea
            ref={textareaRef}
            className="cl-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Gemini… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={streaming}
          />
          <button
            className="cl-send"
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
        <p className="cl-hint">Gemini can make mistakes. Verify important info.</p>
      </div>
    </div>
  );
}
