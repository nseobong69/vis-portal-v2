import { useEffect, useRef, useState } from 'react';
import { downloadAiReply } from '../../lib/aiFileGen';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: any; // string, or [{type:'image_url',...},{type:'text',...}] for vision
  displayText?: string;
  displayImg?: string | null;
  wantsFile?: string | null;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Ports _aiMarkdown() (index.html ~29818-29828) — escape first, then a
// small, deliberately limited set of markdown patterns.
function aiMarkdown(raw: string): string {
  let t = escapeHTML(raw);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/^(\d+)\.\s+(.+)$/gm, '<span style="display:block;padding-left:4px;margin:2px 0;"><strong>$1.</strong> $2</span>');
  return t;
}

// Ports _aiDetectFileFormat() (index.html ~29955-29963) — only the
// detection, not the docx/pdf/html generation itself (separate
// follow-up). Detecting it here still lets the "Download" button show
// up in the right place, ready to wire once that generator exists.
function detectFileFormat(msg: string): string | null {
  const m = msg.toLowerCase();
  if (/\b(docx|\.docx|word\s+doc(ument)?|word\s+file|as\s+word|in\s+word|to\s+word)\b/.test(m)) return 'docx';
  if (/\b(pdf|\.pdf|as\s+pdf|in\s+pdf|to\s+pdf|put\s+in\s+pdf|save\s+(as\s+)?pdf|convert\s+(to\s+)?pdf)\b/.test(m)) return 'pdf';
  if (/\b(html|\.html|web\s*page|html\s+file|as\s+html|in\s+html)\b/.test(m)) return 'html';
  return null;
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.displayText || String(msg.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable, no-op */ }
  }
  async function download() {
    if (!msg.wantsFile) return;
    setDownloading(true);
    try {
      await downloadAiReply(msg.displayText || String(msg.content), msg.wantsFile as 'docx' | 'pdf' | 'html');
    } catch (e: any) {
      alert(`Could not generate the ${msg.wantsFile.toUpperCase()} file: ${e.message || e}`);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className={`flex flex-col mb-4 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className="max-w-[88%] px-4 py-3 text-[15.5px] leading-relaxed whitespace-pre-wrap break-words shadow-sm"
        style={{
          background: isUser ? '#4A2C20' : '#fff',
          color: isUser ? '#fff' : '#1A1A2E',
          border: isUser ? 'none' : '1.5px solid #DDD0C4',
          borderRadius: isUser ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
        }}
      >
        {msg.displayImg && <img src={msg.displayImg} className="max-w-full max-h-48 rounded-lg mb-2 object-contain" />}
        {isUser ? (msg.displayText || '') : <span dangerouslySetInnerHTML={{ __html: aiMarkdown(msg.displayText || String(msg.content)) }} />}
      </div>
      {!isUser && (
        <div className="flex gap-2 flex-wrap mt-1.5">
          <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg border border-[#c8a882] text-[#8D6E63] flex items-center gap-1.5">
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          {msg.wantsFile && (
            <button
              onClick={download}
              disabled={downloading}
              className="text-xs px-3.5 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60"
              style={{ background: '#333' }}
            >
              {downloading ? '⏳ Generating…' : `⬇️ Download .${msg.wantsFile}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIChatPanel({ onClose }: { onClose: () => void }) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{ name: string; base64: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, thinking]);

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files can be attached here.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPendingImage({ name: file.name, base64: reader.result as string });
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function send() {
    const msg = input.trim();
    if (!msg && !pendingImage) return;
    setError('');
    setInput('');

    const wantsFile = detectFileFormat(msg);
    let userContent: any;
    let displayText = msg;
    let displayImg: string | null = null;

    if (pendingImage) {
      displayImg = pendingImage.base64;
      displayText = msg || '📎 ' + pendingImage.name;
      userContent = [
        { type: 'image_url', image_url: { url: pendingImage.base64 } },
        { type: 'text', text: msg || 'What is in this image?' },
      ];
    } else {
      userContent = msg;
    }

    const userMsg: ChatMessage = { role: 'user', content: userContent, displayText, displayImg };
    const nextHistory = [...history, userMsg];
    setHistory(nextHistory);
    setPendingImage(null);
    setThinking(true);

    const hasVision = nextHistory.some((m) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url'));

    try {
      const res = await fetch('/api/ai-chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory.map((m) => ({ role: m.role, content: m.content })), hasVision, wantsFile: !!wantsFile }),
      });
      const data = await res.json();
      setThinking(false);
      if (!res.ok) {
        setHistory((prev) => [...prev, { role: 'assistant', content: '⚠️ Sorry, something went wrong. Please try again.', displayText: '⚠️ Sorry, something went wrong. Please try again.' }]);
        return;
      }
      setHistory((prev) => [...prev, { role: 'assistant', content: data.reply, displayText: data.reply, wantsFile }]);
    } catch (e: any) {
      setThinking(false);
      setHistory((prev) => [...prev, { role: 'assistant', content: '⚠️ Sorry, something went wrong. Please try again.', displayText: '⚠️ Sorry, something went wrong. Please try again.' }]);
    }
  }

  function handleKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearChat() {
    setHistory([]);
    setPendingImage(null);
  }

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDD0C4]" style={{ background: 'linear-gradient(135deg,#5D4037,#7C3AED)' }}>
        <div className="text-white font-bold text-[15px]">🤖 VIS AI Assistant</div>
        <div className="flex items-center gap-2">
          <button onClick={clearChat} className="text-white/90 text-xs px-2.5 py-1.5 rounded-md bg-white/15">Clear</button>
          <button onClick={onClose} className="text-white text-lg w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">✕</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4" style={{ background: '#fdf8f3' }}>
        {history.length === 0 ? (
          <div className="text-center py-8 px-5">
            <div className="text-4xl mb-2.5">🤖</div>
            <div className="font-bold text-[15px] text-brand-brown-dark mb-1.5">VIS AI Assistant</div>
            <div className="text-xs text-brand-brown-light leading-relaxed">Ask me anything — lesson notes, letters,<br />exam questions, announcements, reports…</div>
          </div>
        ) : (
          history.map((m, i) => <ChatBubble key={i} msg={m} />)
        )}
        {thinking && (
          <div className="flex justify-start mb-4">
            <div className="px-4 py-3 rounded-[18px_18px_18px_5px] text-sm text-brand-brown-light bg-white border border-[#DDD0C4] shadow-sm">⏳ Thinking…</div>
          </div>
        )}
      </div>

      {error && <div className="px-4 py-2 text-sm text-danger-700 border-t border-brand-cream-dark">{error}</div>}

      {pendingImage && (
        <div className="px-4 py-2 border-t border-brand-cream-dark flex items-center gap-2 bg-brand-cream">
          <img src={pendingImage.base64} className="w-10 h-10 rounded object-cover" />
          <span className="text-xs text-brand-brown-light flex-1 truncate">{pendingImage.name}</span>
          <button onClick={() => setPendingImage(null)} className="text-xs text-danger-700 font-semibold">Remove</button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3.5 py-3 border-t border-[#c8a882]">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" id="ai-chat-file-input" />
        <label htmlFor="ai-chat-file-input" className="w-10 h-10 flex items-center justify-center rounded-full border border-[#c8a882] text-brand-brown-dark text-lg cursor-pointer shrink-0">📎</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeydown}
          rows={1}
          placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
          className="flex-1 rounded-xl border border-[#c8a882] px-3.5 py-2.5 text-[15.5px] resize-none outline-none max-h-28"
        />
        <button onClick={send} className="w-11 h-11 rounded-full text-white text-lg shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#5D4037,#7C3AED)' }}>➤</button>
      </div>
    </div>
  );
}
