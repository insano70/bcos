'use client';

import { useState } from 'react';
import Toast from '@/components/toast';

export default function Toasts03() {
  const [toast3WarningOpen, setToast3WarningOpen] = useState<boolean>(true);
  const [toast3ErrorOpen, setToast3ErrorOpen] = useState<boolean>(true);
  const [toast3SuccessOpen, setToast3SuccessOpen] = useState<boolean>(true);
  const [toast3InfoOpen, setToast3InfoOpen] = useState<boolean>(true);

  return (
    <div className="space-y-3">
      <Toast variant="outlined" type="warning" open={toast3WarningOpen} setOpen={setToast3WarningOpen}>
        A warning toast.
      </Toast>

      <Toast variant="outlined" type="success" open={toast3SuccessOpen} setOpen={setToast3SuccessOpen}>
        A successful toast.
      </Toast>

      <Toast variant="outlined" type="error" open={toast3ErrorOpen} setOpen={setToast3ErrorOpen}>
        A dangerous toast.
      </Toast>

      <Toast variant="outlined" open={toast3InfoOpen} setOpen={setToast3InfoOpen}>
        An informational toast.
      </Toast>
    </div>
  );
}
