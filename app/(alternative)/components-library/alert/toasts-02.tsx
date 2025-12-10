'use client';

import { useState } from 'react';
import Toast from '@/components/toast';

export default function Toasts02() {
  const [toast2WarningOpen, setToast2WarningOpen] = useState<boolean>(true);
  const [toast2ErrorOpen, setToast2ErrorOpen] = useState<boolean>(true);
  const [toast2SuccessOpen, setToast2SuccessOpen] = useState<boolean>(true);
  const [toast2InfoOpen, setToast2InfoOpen] = useState<boolean>(true);

  return (
    <div className="space-y-3">
      <Toast variant="light" type="warning" open={toast2WarningOpen} setOpen={setToast2WarningOpen}>
        A warning toast.
      </Toast>

      <Toast variant="light" type="success" open={toast2SuccessOpen} setOpen={setToast2SuccessOpen}>
        A successful toast.
      </Toast>

      <Toast variant="light" type="error" open={toast2ErrorOpen} setOpen={setToast2ErrorOpen}>
        A dangerous toast.
      </Toast>

      <Toast variant="light" open={toast2InfoOpen} setOpen={setToast2InfoOpen}>
        An informational toast.
      </Toast>
    </div>
  );
}
