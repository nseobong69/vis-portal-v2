import { useState } from 'react';
import AIChatPanel from './AIChatPanel';

export default function AIChatButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[9997] w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl text-white"
        style={{ background: 'linear-gradient(135deg,#5D4037,#7C3AED)' }}
        title="AI Assistant"
      >
        🤖
      </button>
      {open && <AIChatPanel onClose={() => setOpen(false)} />}
    </>
  );
}
