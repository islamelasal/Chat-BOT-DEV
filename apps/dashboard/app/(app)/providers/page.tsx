import { apiServer } from '@/lib/api';
import { Badge, Card, CardHeader } from '@/components/ui';
import ProviderCard from './provider-card';

export default async function ProvidersPage() {
  const providers = await apiServer<any[]>('/providers');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">مزودو الـ AI (قسم إدارة الـ APIs)</h1>
        <p className="mt-1 text-xs text-slate-500">
          أي مزود متوافق مع OpenAI يُضاف كبيانات فقط بدون كود — المفاتيح مشفرة AES-256-GCM ولا تغادر الخادم أبداً
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </div>

      <Card>
        <CardHeader title="كتالوج سريع للمزودين" subtitle="Base URLs دقيقة — من بحث حي في قوائم المجتمع (أغسطس 2026)" />
        <div className="grid gap-2 p-4 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['OpenRouter', 'https://openrouter.ai/api/v1', true],
            ['Groq', 'https://api.groq.com/openai/v1', true],
            ['Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', true],
            ['DeepSeek', 'https://api.deepseek.com/v1', false],
            ['NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', true],
            ['Mistral', 'https://api.mistral.ai/v1', false],
            ['Cerebras', 'https://api.cerebras.ai/v1', true],
            ['SiliconFlow', 'https://api.siliconflow.cn/v1', true],
            ['DMXAPI (مدفوع)', 'OpenAI-compatible', false],
            ['AIMLAPI', 'OpenAI-compatible', false],
            ['GitHub Models', 'https://models.github.ai/inference', true],
            ['Cloudflare Workers AI', 'accounts/{id}/ai/run', true],
          ].map(([name, url, free]) => (
            <div key={name as string} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="font-bold text-slate-700">{name}</span>
              <span className="flex items-center gap-2">
                <Badge tone={free ? 'green' : 'blue'}>{free ? 'مجاني' : 'مدفوع'}</Badge>
                <span className="text-slate-400" dir="ltr">{url}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
