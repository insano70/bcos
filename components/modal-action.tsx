import { Modal } from '@/components/ui/modal';

interface ModalActionProps {
  children: React.ReactNode;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}

/**
 * @deprecated Use Modal from @/components/ui/modal directly instead.
 * This component is maintained for backwards compatibility.
 */
export default function ModalAction({ children, isOpen, setIsOpen }: ModalActionProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      size="md"
      showCloseButton={true}
      contentClassName="p-6"
    >
      {children}
    </Modal>
  );
}
