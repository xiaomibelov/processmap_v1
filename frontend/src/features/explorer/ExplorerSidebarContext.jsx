import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// Контекст для единой левой колонки explorer (uiux/sidebar-header-join-v1).
// ExplorerPane / ProjectPane регистрируют breadcrumb-блок (кнопка «назад» + путь).
// Отображается блок последнего зарегистрированного компонента; при unmount
// восстанавливается предыдущий блок из стека.

const ExplorerSidebarContext = createContext({
  header: null,
  register: () => {},
  unregister: () => {},
});

let idCounter = 0;

export function ExplorerSidebarProvider({ children }) {
  const [stack, setStack] = useState([]);
  const value = useMemo(() => ({
    header: stack.length ? stack[stack.length - 1].header : null,
    register: (id, header) => {
      setStack((prev) => {
        const idx = prev.findIndex((item) => item.id === id);
        if (idx === -1) return [...prev, { id, header }];
        const next = [...prev];
        next[idx] = { id, header };
        return next;
      });
    },
    unregister: (id) => {
      setStack((prev) => prev.filter((item) => item.id !== id));
    },
  }), [stack]);
  return <ExplorerSidebarContext.Provider value={value}>{children}</ExplorerSidebarContext.Provider>;
}

export function useExplorerSidebarHeader() {
  return useContext(ExplorerSidebarContext).header;
}

export function useSetExplorerSidebarHeader(header) {
  const { register, unregister } = useContext(ExplorerSidebarContext);
  const idRef = useRef("");
  if (!idRef.current) {
    idCounter += 1;
    idRef.current = `sbh-${idCounter}`;
  }
  useEffect(() => {
    const id = idRef.current;
    register(id, header);
    return () => unregister(id);
  }, [header, register, unregister]);
}
