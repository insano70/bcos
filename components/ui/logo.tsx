import Image from 'next/image';
import Link from 'next/link';

export default function Logo() {
  return (
    <Link className="block" href="/">
      <Image src="/images/bcos_logo_200.png" alt="BCOS Logo" width={64} height={64} priority />
    </Link>
  );
}
