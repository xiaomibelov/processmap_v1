import React, { useState, useCallback } from 'react';
import { AgentModal } from './AgentModal';
import '../../features/process/processman/processman.css';

export const AgentButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const openAgent = useCallback(() => setOpen(true), []);
  
  return (
    <>
      <button 
        type="button"
        onClick={openAgent}
        className="primaryBtn agent-processman-button"
        aria-label="PROCESSMAN — открыть чат агента"
      >
        PROCESSMAN
      </button>
      {open && <AgentModal onClose={() => setOpen(false)} />}
    </>
  );
};
