import React, { useState, useCallback } from 'react';
import { AgentModal } from './AgentModal';

export const AgentButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        style={{ marginLeft: 8 }}
        className="primaryBtn"
      >
        🤖 AI Агент
      </button>
      {open && <AgentModal onClose={() => setOpen(false)} />}
    </>
  );
};
