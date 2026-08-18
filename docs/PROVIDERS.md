# 🔌 كتالوج مزودي الـ AI APIs — Chat Bot Dev

> نتيجة بحث فعلي (آخر تحديث: 2026-08-18) من: awesome-free-llm-apis ★6.7k، awesome-freellm-apis ★1.9k (442+ نموذجاً/31 مزوداً)، Apidog، DMXAPI، AIMLAPI.
> القاعدة: **أي مزود "OpenAI-compatible" يُضاف للمنصة في دقائق بدون كود** — هذا هو أساس قسم إدارة الـ APIs.

---

## 1. تصنيف المزودين

| الفئة | التعريف | الاستخدام في المنصة |
|---|---|---|
| 🟢 Free Permanent | طبقات مجانية دائمة | العمود الفقري الافتراضي (وضع الاقتصاد) |
| 🟡 Free Credits | أرصدة تجريبية متجددة | تجربة نماذج مميزة مؤقتاً |
| 🔵 Paid Aggregators | مجمّعات مدفوعة مخفّضة (OpenAI-compatible) | التصعيد عند الحاجة لجودة أعلى |
| ⚪ Direct Official | المزود الرسمي مباشرة | تحكم كامل وحدود رسمية |

---

## 2. جدول المزودين الرئيسيين (Base URLs دقيقة)

| المزود | Base URL | التوافق | مجاني؟ | ملاحظات |
|---|---|---|---|---|
| **OpenRouter** | `https://openrouter.ai/api/v1` | OpenAI | ✅ نماذج `:free` كثيرة | مجمّع ضخم، يوفّر ترتيب نماذج + حدود يومية للمجاني |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | Native (Adapter) | ✅ حصص سخية | عائلة Gemma 3 (1B–27B) مجانية عبر AI Studio |
| **Groq** | `https://api.groq.com/openai/v1` | OpenAI | ✅ | أسرع استدلال، يوفّر `x-ratelimit-*` headers |
| **DeepSeek** | `https://api.deepseek.com/v1` | OpenAI | 🟡 رصيد | أسعار منخفضة جداً |
| **Mistral AI** | `https://api.mistral.ai/v1` | OpenAI | 🟡 رصيد تجريبي | La Plateforme |
| **Cohere** | `https://api.cohere.com/v2` | OpenAI | 🟡 تجريبي | |
| **Cerebras** | `https://api.cerebras.ai/v1` | OpenAI | ✅ يومي | سرعة عالية، سياق 8K للمجاني |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | OpenAI | ✅ | نماذج حديثة (Nemotron 3, GLM-5.x) |
| **Cloudflare Workers AI** | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run` | خاص (Adapter) | ✅ | سقف يومي مجاني |
| **GitHub Models** | `https://models.github.ai/inference` | OpenAI | ✅ | بحدود |
| **Together AI** | `https://api.together.xyz/v1` | OpenAI | 🟡 رصيد | مستوى مجاني محدود |
| **Hugging Face** | `https://router.huggingface.co/v1` | OpenAI | ✅/🟡 | |
| **SambaNova** | `https://api.sambanova.ai/v1` | OpenAI | ✅/🟡 | سرعة عالية |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | OpenAI | ✅/🟡 | نماذج صينية قوية (Qwen/GLM) |
| **Z AI (Zhipu)** | `https://open.bigmodel.cn/api/paas/v4` | OpenAI | ✅ | GLM family |
| **xAI (Grok)** | `https://api.x.ai/v1` | OpenAI | 🟡 | |
| **OVHcloud AI Endpoints** | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | OpenAI | ✅ | |
| **Ollama Cloud** | `https://api.ollama.com` | OpenAI | 🟡 | |
| **ModelScope** | `https://api-inference.modelscope.cn/v1` | OpenAI | ✅ | |
| **Nebius** | `https://api.studio.nebius.com/v1` | OpenAI | 🟡 رصيد | |
| **Chutes** | `https://api.chutes.ai/v1` | OpenAI | ✅ | نماذج مجتمعية |
| **GLHF** | `https://glhf.chat/api/openai/v1` | OpenAI | ✅ | |
| **AI21** | `https://api.ai21.com/studio/v1` | OpenAI | 🟡 | |
| **LLM7.io** | `https://api.llm7.io/v1` | OpenAI | ✅ | |
| **Kilo Code** | `https://api.kilo.ai/api/gateway` | OpenAI | ✅ | |
| **Agnes AI** | `https://apihub.agnes-ai.com/v1` | OpenAI | 🟡 | |
| **Alibaba Model Studio** | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | OpenAI | ✅ | Qwen |
| **DMXAPI** 🔵 | (تُعرض عند التسجيل — OpenAI-compatible) | OpenAI | — مدفوع بخصم يصل 40% | 300+ نموذج، فوترة متزامنة مع الرسمي، دعم 7×24 — [dmxapi.com](https://dmxapi.com/en.html) |
| **AIMLAPI** 🔵 | (OpenAI-compatible) | OpenAI | 🟡 طبقة مجانية | 200+ نموذج عبر مفتاح واحد — [aimlapi.com](https://aimlapi.com) |
| **codedesign.ai** ⚪ | أداة تصميم AI | — | — | مرجع لتجربة التصميم فقط |

---

## 3. التكوين الافتراضي المقترح (Default Pools)

### طبقة العمل اليومي (Cheapest-First / مجانية)
```
tier-1: OpenRouter :free → NVIDIA NIM → Groq → Gemini(Gemma 3)
tier-2: SiliconFlow → Cloudflare Workers AI → GitHub Models
```
### طبقة الجودة (عند حاجة أعلى — Paid)
```
tier-3: DMXAPI (claude-4.x / gpt-4.x بخصم) → AIMLAPI → DeepSeek official
```

### سياسة "الوضع الاقتصادي" (FR-057)
- الافتراضي لكل عميل `free` tier: التوجيه محصور في tier-1.
- قياس جودة آلي (طول الرد، عدم الاعتذار، تقييم 👍) → إذا تدهورت جودة tier-1 لأي بوت لأكثر من 30 دقيقة، يُصعَّد مؤقتاً لـ tier-3 مع تنبيه.
- مراجعة أسبوعية: هل نُقل عميل لـ paid بشكل دائم؟ (قرار مالي).

---

## 4. أهم النماذج المجانية الرائجة حالياً (حسب الاستخدام الأسبوعي الفعلي)

| النموذج | المزود | السياق |
|---|---|---|
| z-ai/glm-5.2 | NVIDIA NIM | 1M |
| NVIDIA Nemotron 3 Ultra 550B (free) | OpenRouter | 1M |
| Poolside Laguna M.1 (free) | OpenRouter | 262K |
| NVIDIA Nemotron 3 Super 120B (free) | OpenRouter | 262K |
| Cohere North Mini Code (free) | OpenRouter | 256K |
| Poolside Laguna XS/S 2.1 | OpenRouter / NVIDIA | 262K |

> المصدر: freellm.net (مراقبة يومية عبر API). تُضاف هذه القائمة كـ "تغذية تلقائية مقترحة" في شاشة المزودين.

---

## 5. قواعد تشغيل كتالوج المزودين

1. **لا مفتاح في الكود:** كل المفاتيح من شاشة الإدارة، مشفرة AES-256-GCM.
2. **أي مزود OpenAI-compatible = صف بيانات فقط** (اسم + Base URL + مفتاح + حدود) بدون كود.
3. **Gemini وCloudflare فقط** يحتاجان Adapter خاصاً (في v1).
4. **متابعة أسبوعية** لقوائم المجتمع (الروابط في PRD) لالتقاط مزودين/نماذج جدد أو إيقافات.
5. **حدود مرصودة** لكل مزود في جدول `provider_limits` (RPM/TPM/يومي) وتُحدَّث تلقائياً من ترويسات `x-ratelimit-*` عند توفرها.
6. **اختبار قبول** قبل تفعيل أي مزود في سلاسل الإنتاج: رسالة تجريبية + قياس TTFT + تحقق تنسيق البث.
