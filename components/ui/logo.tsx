import Link from 'next/link';
import Image from 'next/image';

export default function Logo() {
  return (
    <Link className="block" href="/">
      <Image
        src="/images/bcos_logo_200.png"
        alt="BCOS Logo"
        width={64}
        height={64}
        priority
      />
    </Link>
  );
}
