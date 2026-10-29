import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);
  const show = useCallback((msg) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2200);
  }, []);
  return { message, show };
}

export function Toast({ state }) {
  if (!state.message) return null;
  return (
    <div className="toast" role="status">
      {state.message}
    </div>
  );
}
