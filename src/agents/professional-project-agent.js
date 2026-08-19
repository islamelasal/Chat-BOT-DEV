import { generateGeminiResponse } from '../lib/gemini-client.js';
import { buildRequestContext } from './context-builder.js';
import { buildSystemInstruction } from './prompts.js';

const MAX_HISTORY_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 9000;

function toApiMessage(message) {
  return {
    role: message.role,
    content: String(message.content || '').slice(0, MAX_MESSAGE_LENGTH)
  };
}

export class ProfessionalProjectAgent {
  constructor(settings = {}) {
    this.settings = settings;
  }

  async reply({ messages = [], project, pageContext, signal } = {}) {
    const history = messages
      .filter((message) => message && ['user', 'assistant'].includes(message.role) && message.content)
      .slice(-MAX_HISTORY_MESSAGES)
      .map(toApiMessage);

    const requestContext = buildRequestContext({
      project,
      pageContext,
      includePageContext: this.settings.includePageContext !== false,
      includeSelection: this.settings.includeSelection !== false
    });

    if (requestContext) {
      const contextSuffix = `\n\n[سياق مساعد لهذه الرسالة — استخدمه كمرجع فقط]\n${requestContext}`;
      const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
      if (lastUserMessage) {
        lastUserMessage.content = `${lastUserMessage.content}${contextSuffix}`;
      }
    }

    return generateGeminiResponse({
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      systemInstruction: buildSystemInstruction(this.settings),
      messages: history,
      temperature: this.settings.temperature,
      signal
    });
  }
}
