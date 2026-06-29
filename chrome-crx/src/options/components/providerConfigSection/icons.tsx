import { createLucideIcon, type LucideIcon } from 'lucide-react';
import { AudioLines, FileText, Image, Type, Video } from 'lucide-react';
import { type ProviderKind } from '@/utils/providerStore';

const PlusIcon = createLucideIcon('plus', [
  ['path', { d: 'M5 12h14', key: '1ays0h' }],
  ['path', { d: 'M12 5v14', key: 's699le' }]
]);

const TrashIcon = createLucideIcon('trash', [
  ['path', { d: 'M3 6h18', key: 'd0wm0j' }],
  ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', key: '4alrt4' }],
  ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', key: 'v07s9e' }]
]);

const PencilIcon = createLucideIcon('pencil', [
  [
    'path',
    {
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z',
      key: 'ymcmye'
    }
  ],
  ['path', { d: 'm15 5 4 4', key: '1s1alb' }]
]);

const CheckCircleIcon = createLucideIcon('circle-check', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'e4b067' }],
  ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }]
]);

const AlertCircleIcon = createLucideIcon('circle-alert', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'e4b067' }],
  ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
  ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }]
]);

const SpinnerIcon = createLucideIcon('loader', [
  ['path', { d: 'M12 2v4', key: '4jgjns' }],
  ['path', { d: 'm16.2 7.8 2.9-2.9', key: 'r700ao' }],
  ['path', { d: 'M18 12h4', key: 'wj9ykh' }],
  ['path', { d: 'm16.2 16.2 2.9 2.9', key: '1bxg5t' }],
  ['path', { d: 'M12 18v4', key: 'jadmvz' }],
  ['path', { d: 'm4.9 19.1 2.9-2.9', key: 'bwix9q' }],
  ['path', { d: 'M2 12h4', key: 'j09sii' }],
  ['path', { d: 'm4.9 4.9 2.9 2.9', key: 'giyufr' }]
]);

const PROVIDER_KIND_COLOR: Record<ProviderKind, string> = {
  anthropic: 'bg-[#d97757] text-white',
  openai: 'bg-emerald-600 text-white',
  gemini: 'bg-blue-600 text-white',
  'openai-compatible': 'bg-emerald-600 text-white'
};

const INPUT_MODALITY_ICON: Record<string, LucideIcon> = {
  text: Type,
  image: Image,
  video: Video,
  audio: AudioLines,
  file: FileText
};

export interface InputModalityItem {
  key: string;
  label: string;
  title: string;
  icon: LucideIcon;
}

export {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  SpinnerIcon,
  PROVIDER_KIND_COLOR,
  INPUT_MODALITY_ICON
};
