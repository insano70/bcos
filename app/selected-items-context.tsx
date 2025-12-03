'use client';

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

interface SelectedItemsContextProps {
  selectedItems: (string | number)[];
  setSelectedItems: Dispatch<SetStateAction<(string | number)[]>>;
}

const SelectedItemsContext = createContext<SelectedItemsContextProps | undefined>(undefined);

export const SelectedItemsProvider = ({ children }: { children: React.ReactNode }) => {
  const [selectedItems, setSelectedItems] = useState<(string | number)[]>([]);
  return (
    <SelectedItemsContext.Provider value={{ selectedItems, setSelectedItems }}>
      {children}
    </SelectedItemsContext.Provider>
  );
};

export const useSelectedItems = () => {
  const context = useContext(SelectedItemsContext);
  if (!context) {
    throw new Error('useSelectedItems must be used within a SelectedItemsProvider');
  }
  return context;
};
