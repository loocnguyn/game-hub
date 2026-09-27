import Link from 'next/link';
import { Shell } from '@/components/TopBar';
import { Panel } from '@/components/ui';

export default function NotFound() {
  return (
    <Shell>
      <Panel className="mx-auto mt-16 max-w-md p-8 text-center">
        Không có trang này. <Link className="text-cyan-300 underline" href="/hub">Về sảnh</Link>
      </Panel>
    </Shell>
  );
}
