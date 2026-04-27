import { PLATFORM_COLORS } from '@/types';

interface Props { platform: string; label?: string; size?: 'xs' | 'sm' }

export default function PlatformBadge({ platform, label, size = 'xs' }: Props) {
  const colors = PLATFORM_COLORS[platform] ?? PLATFORM_COLORS['unknown'];
  const text = label ?? platform.charAt(0).toUpperCase() + platform.slice(1);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${colors.badge} ${size === 'xs' ? 'text-[10px]' : 'text-xs'}`}>
      {text}
    </span>
  );
}
