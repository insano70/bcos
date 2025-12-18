import { Modal } from '@/components/ui/modal';

interface ModalBasicProps {
  children: React.ReactNode;
  title: string;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}

/**
 * @deprecated Use Modal from @/components/ui/modal directly instead.
 * This component is maintained for backwards compatibility.
 */
export default function ModalBasic({ children, title, isOpen, setIsOpen }: ModalBasicProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title={title}
      size="md"
    >
      {children}
    </Modal>
  );
}
