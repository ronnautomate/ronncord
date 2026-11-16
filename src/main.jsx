
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const initialMessages = [
  { id: 1, user: 'Ronn', time: '14:32', text: 'Welcome to RONNCORD! 🚀' },
  { id: 2, user: 'Alex', time: '14:34', text: 'Finally, our own voice platform!' },
  { id: 3, user: 'Ronn', time: '14:35', text: 'Built for us, not everyone else.' }
];

function App() {
  const [channel, setChannel] = useState('general');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(initialMessages);

  function sendMessage(e) {
    e.preventDefault();
    if (!message.trim()) return;

    setMessages([
      ...messages,
      {
        id: Date.now(),
        user: 'You',
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        text: message.trim()
      }
    ]);
    setMessage('');
  }

  return (
    <div className="app">
      <aside className="server-rail">
        <div className="server-logo active">R</div>
        <div className="rail-divider" />
        <div className="server-logo">+</div>
        <div className="server-logo">⚙</div>
      </aside>

      <aside className="sidebar">
        <div className="workspace-title">
          <span>RONNCORD</span>
          <span>⌄</span>
        </div>

        <div className="sidebar-section">
          <p className="section-label">WORKSPACE</p>
          <div className="nav-item">⌂ <span>Home</span></div>
          <div className="nav-item">◉ <span>Friends</span></div>
          <div className="nav-item">✉ <span>Messages</span></div>
        </div>

        <div className="sidebar-section">
          <div className="section-heading">
            <p className="section-label">TEXT CHANNELS</p>
            <span>+</span>
          </div>

          {['general', 'introductions', 'gaming', 'memes'].map(name => (
            <div
              key={name}
              className={`channel ${channel === name ? 'selected' : ''}`}
              onClick={() => setChannel(name)}
            >
              <span>#</span> {name}
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="section-heading">
            <p className="section-label">VOICE CHANNELS</p>
            <span>+</span>
          </div>
          <div className="channel"><span>◖</span> General Voice</div>
          <div className="channel"><span>◖</span> Gaming Room</div>
        </div>

        <div className="user-panel">
          <div className="avatar">R</div>
          <div className="user-details">
            <strong>Ronn</strong>
            <small>Online</small>
          </div>
          <span>⚙</span>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div>
            <span className="hash">#</span>
            <strong>{channel}</strong>
          </div>
          <div className="header-actions">
            <span>⌕</span>
            <span>?</span>
          </div>
        </header>

        <section className="messages">
          <div className="welcome">
            <div className="welcome-icon">#</div>
            <h1>Welcome to #{channel}</h1>
            <p>This is the beginning of this channel.</p>
          </div>

          {messages.map(msg => (
            <div className="message" key={msg.id}>
              <div className="avatar message-avatar">
                {msg.user[0]}
              </div>
              <div>
                <div className="message-meta">
                  <strong>{msg.user}</strong>
                  <small>{msg.time}</small>
                </div>
                <p>{msg.text}</p>
              </div>
            </div>
          ))}
        </section>

        <form className="message-form" onSubmit={sendMessage}>
          <button type="button" className="add-button">+</button>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Message #${channel}`}
          />
          <button type="submit" className="send-button">➤</button>
        </form>
      </main>

      <aside className="members">
        <h3>ONLINE — 3</h3>
        {['Ronn', 'Alex', 'Sam'].map(name => (
          <div className="member" key={name}>
            <div className="avatar">{name[0]}</div>
            <span>{name}</span>
            <i />
          </div>
        ))}
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
