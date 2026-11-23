import { useState } from 'react';
import { Check, Copy, MessageSquareShare } from 'lucide-react';
import type { CommunityAlert } from '../types/vayu';

interface CommunityAlertTabProps {
  alert: CommunityAlert;
  cityName: string;
  usAqi: number;
}

export function CommunityAlertTab({ alert, cityName, usAqi }: CommunityAlertTabProps) {
  const [copied, setCopied] = useState(false);

  const lines = alert.lines.slice(0, 4);
  const fullCopyText = `${alert.subject}\n${lines.join('\n')}`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullCopyText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = fullCopyText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = fullCopyText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Community RWA &amp; WhatsApp Society Notice
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Ready-to-paste 4-line broadcast warning neighbors about today&apos;s AQI spike and open leaf/garbage burning.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            copied
              ? 'bg-emerald-700 text-white'
              : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Copied Alert</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Copy Alert</span>
            </>
          )}
        </button>
      </div>

      {/* Notice Metadata Line */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
        <span>Locality: {cityName}</span>
        <span aria-hidden="true">·</span>
        <span>Live US AQI: {usAqi}</span>
        <span aria-hidden="true">·</span>
        <span>Language: {alert.languageUsed}</span>
        <span aria-hidden="true">·</span>
        <span>4-Line Format</span>
      </div>

      {/* WhatsApp / Society Notice Surface */}
      <div className="rounded-xl bg-emerald-50/50 border border-emerald-200/80 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <MessageSquareShare className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{alert.subject}</span>
        </div>

        <div className="space-y-2.5 text-sm sm:text-[15px] text-slate-800 leading-relaxed">
          {lines.map((line, idx) => (
            <p key={idx} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="font-mono text-xs text-slate-400 mt-1 select-none shrink-0"
              >
                0{idx + 1}
              </span>
              <span>{line}</span>
            </p>
          ))}
        </div>
      </div>

      {/* RWA Coordination Footnote */}
      <div className="p-4 rounded-lg bg-slate-50 text-sm text-slate-700 leading-relaxed">
        <span className="font-semibold text-slate-900">Society Coordination Action: </span>
        {alert.callToAction}
      </div>
    </div>
  );
}
