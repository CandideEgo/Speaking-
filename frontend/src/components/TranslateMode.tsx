'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowRightLeft, Check, X } from 'lucide-react';

interface Subtitle {
  id: string;
  text_en: string;
  text_zh: string | null;
}

interface TranslateModeProps {
  subtitles: Subtitle[];
}

export default function TranslateMode({ subtitles }: TranslateModeProps) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [direction, setDirection] = useState<'en-zh' | 'zh-en'>('en-zh');

  const current = subtitles[index];
  if (!current || !current.text_zh) return <div className="p-4 text-center text-white/40">此视频没有中文翻译</div>;

  function check() {
    setChecked(true);
  }

  function next() {
    if (index < subtitles.length - 1) {
      setIndex(index + 1);
      setInput('');
      setChecked(false);
    }
  }

  function prev() {
    if (index > 0) {
      setIndex(index - 1);
      setInput('');
      setChecked(false);
    }
  }

  function toggleDirection() {
    setDirection(d => d === 'en-zh' ? 'zh-en' : 'en-zh');
    setInput('');
    setChecked(false);
  }

  const source = direction === 'en-zh' ? current.text_en : current.text_zh;
  const target = direction === 'en-zh' ? current.text_zh : current.text_en;

  const normalizedInput = input.trim().toLowerCase();
  const normalizedTarget = target.trim().toLowerCase();
  const isCorrect = normalizedInput === normalizedTarget;

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-white/40">{index + 1} / {subtitles.length}</span>
        <button
          onClick={toggleDirection}
          className="flex items-center gap-1 text-xs text-coral hover:text-coral-active"
        >
          <ArrowRightLeft size={14} />
          {direction === 'en-zh' ? '英→中' : '中→英'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center max-w-lg mb-6">
          <p className="text-xs text-white/40 mb-2">翻译以下内容：</p>
          <p className="text-lg leading-relaxed text-white font-medium">{source}</p>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={direction === 'en-zh' ? '输入中文翻译...' : '输入英文翻译...'}
          disabled={checked}
          className={cn(
            'w-full max-w-lg h-24 rounded-lg border bg-navy-soft px-4 py-3 text-white text-sm resize-none focus:outline-none transition-colors',
            checked
              ? isCorrect
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-red-500/50 bg-red-500/5'
              : 'border-white/10 focus:border-coral'
          )}
        />

        {checked && (
          <div className="mt-4 text-center max-w-lg">
            <p className="text-xs text-white/40 mb-1">参考翻译：</p>
            <p className="text-sm text-white/80">{target}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 mt-4">
        {!checked ? (
          <button onClick={check} disabled={!input.trim()} className="btn-primary !py-2 !px-6 text-xs disabled:opacity-30">
            检查
          </button>
        ) : (
          <>
            <div className={cn('flex items-center gap-1 text-sm', isCorrect ? 'text-green-400' : 'text-amber-400')}>
              {isCorrect ? <Check size={16} /> : <X size={16} />}
              {isCorrect ? '很好！' : '继续加油'}
            </div>
            <button onClick={next} className="btn-primary !py-2 !px-4 text-xs">
              下一句
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 mt-2">
        <button onClick={prev} disabled={index === 0} className="text-xs text-white/40 hover:text-white disabled:opacity-30">
          上一句
        </button>
        <button onClick={next} disabled={index === subtitles.length - 1} className="text-xs text-white/40 hover:text-white disabled:opacity-30">
          跳过
        </button>
      </div>
    </div>
  );
}
