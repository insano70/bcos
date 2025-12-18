import { Modal } from '@/components/ui/modal';

interface ModalBlankProps {
  children: React.ReactNode;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}

/**
 * @deprecated Use Modal from @/components/ui/modal directly instead.
 * This component is maintained for backwards compatibility.
 */
export default function ModalBlank({ children, isOpen, setIsOpen }: ModalBlankProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      size="md"
      showCloseButton={false}
    >
      {children}
    </Modal>
  );
}
