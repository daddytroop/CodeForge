// AI Service - handles API calls to OpenAI, Claude, Gemini, Perplexity

export class AIService {
  constructor() {
    this.providers = {
      openai: {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        keyPrefix: 'sk-',
      },
      claude: {
        name: 'Claude',
        endpoint: 'https://api.anthropic.com/v1/messages',
        keyPrefix: 'sk-ant-',
      },
      gemini: {
        name: 'Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
        keyPrefix: '',
      },
      perplexity: {
        name: 'Perplexity',
        endpoint: 'https://api.perplexity.ai/chat/completions',
        keyPrefix: 'pplx-',
      },
    };
    this.abortController = null;
  }

  getApiKey(provider) {
    return localStorage.getItem(`codeforge_key_${provider}`) || '';
  }

  setApiKey(provider, key) {
    if (key) {
      localStorage.setItem(`codeforge_key_${provider}`, key);
    } else {
      localStorage.removeItem(`codeforge_key_${provider}`);
    }
  }

  getModel(provider) {
    return localStorage.getItem(`codeforge_model_${provider}`) || this.getDefaultModel(provider);
  }

  setModel(provider, model) {
    localStorage.setItem(`codeforge_model_${provider}`, model);
  }

  getDefaultModel(provider) {
    const defaults = {
      openai: 'gpt-4o',
      claude: 'claude-sonnet-4-20250514',
      gemini: 'gemini-2.0-flash',
      perplexity: 'sonar-pro',
    };
    return defaults[provider] || '';
  }

  getAvailableProviders() {
    return Object.keys(this.providers).filter(p => this.getApiKey(p));
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async sendMessage(provider, messages, options = {}) {
    const apiKey = this.getApiKey(provider);
    if (!apiKey) {
      throw new Error(`No API key configured for ${this.providers[provider]?.name || provider}. Go to Settings (Ctrl+,) to add your key.`);
    }

    const model = options.model || this.getModel(provider);
    this.abortController = new AbortController();

    switch (provider) {
      case 'openai':
        return this.callOpenAI(apiKey, model, messages, options);
      case 'claude':
        return this.callClaude(apiKey, model, messages, options);
      case 'gemini':
        return this.callGemini(apiKey, model, messages, options);
      case 'perplexity':
        return this.callPerplexity(apiKey, model, messages, options);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async callOpenAI(apiKey, model, messages, options) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: this.formatMessagesOpenAI(messages),
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async callClaude(apiKey, model, messages, options) {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const body = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      messages: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async callGemini(apiKey, model, messages, options) {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const contents = chatMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  async callPerplexity(apiKey, model, messages, options) {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: this.formatMessagesOpenAI(messages),
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  formatMessagesOpenAI(messages) {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  // ===== Enhanced Context Building =====

  /**
   * Build a rich system prompt that tells the AI about its editing capabilities.
   */
  buildSystemPrompt(context = {}) {
    let prompt = `You are an expert AI coding assistant embedded in CodeForge, a code editor. You can SEE the user's code, understand it, and help them edit it.

## Your Capabilities
- You can read the full contents of the user's current file (provided with line numbers)
- You can see which files are open and switch context
- You can see what text the user has selected
- You can see the cursor position

## How to Suggest Edits
When the user asks you to edit, fix, improve, or change code, respond with TWO things:

1. A brief explanation of what you're changing and why
2. The complete modified code in a single fenced code block with the language tag

IMPORTANT edit format rules:
- When editing a SELECTION: return ONLY the replacement for the selected lines, inside a code block tagged with the language. The user can click "Apply" to replace their selection.
- When editing the FULL FILE: return the complete file contents in a code block. The user can click "Apply" to replace the entire file.
- When making TARGETED changes: use this special format to show exactly what to find and replace:

\`\`\`EDIT
<<<FIND
(exact lines to find in the file)
>>>REPLACE
(replacement lines)
\`\`\`

You can include multiple FIND/REPLACE blocks in one EDIT block for multiple changes.

## Response Guidelines
- Be concise — explain briefly, show code
- Always use fenced code blocks with the correct language identifier
- When showing code, include enough context (surrounding lines) so the user knows where it goes
- Reference line numbers when discussing specific parts of the code (e.g., "on line 42...")
- If the file is too large, focus on the relevant section`;

    if (context.filename) {
      prompt += `\n\n## Current Editor State`;
      prompt += `\n- Active file: \`${context.filename}\``;
    }
    if (context.language) {
      prompt += `\n- Language: ${context.language}`;
    }
    if (context.cursorLine) {
      prompt += `\n- Cursor: line ${context.cursorLine}, column ${context.cursorCol}`;
    }
    if (context.selectionRange) {
      prompt += `\n- Selection: lines ${context.selectionRange.fromLine}–${context.selectionRange.toLine}`;
    }
    if (context.totalLines) {
      prompt += `\n- File length: ${context.totalLines} lines`;
    }
    if (context.openFiles && context.openFiles.length > 0) {
      prompt += `\n- Open files: ${context.openFiles.join(', ')}`;
    }

    return prompt;
  }

  /**
   * Build the user message that includes the full code context.
   * The code is always sent with line numbers for precise reference.
   */
  buildContextMessage(userMessage, context = {}) {
    const parts = [];

    // Always include the current file with line numbers
    if (context.code != null && context.filename) {
      const numberedCode = addLineNumbers(context.code);
      parts.push(`## Current File: \`${context.filename}\` (${context.language || 'plaintext'})\n\`\`\`${context.language || ''}\n${numberedCode}\n\`\`\``);
    }

    // If there's a selection, highlight it
    if (context.selectedCode && context.selectionRange) {
      parts.push(`## Selected Code (lines ${context.selectionRange.fromLine}–${context.selectionRange.toLine}):\n\`\`\`${context.language || ''}\n${context.selectedCode}\n\`\`\``);
    }

    // The user's actual message
    parts.push(`## User Request:\n${userMessage}`);

    return parts.join('\n\n');
  }
}

/**
 * Add line numbers to code string: "  1 | code here"
 */
function addLineNumbers(code) {
  const lines = code.split('\n');
  const pad = String(lines.length).length;
  return lines.map((line, i) => {
    const num = String(i + 1).padStart(pad, ' ');
    return `${num} | ${line}`;
  }).join('\n');
}

/**
 * Parse EDIT blocks from AI response.
 * Returns array of { find: string, replace: string } objects.
 */
export function parseEditBlocks(text) {
  const edits = [];

  // Match ```EDIT ... ``` blocks
  const editBlockRegex = /```EDIT\n([\s\S]*?)```/g;
  let match;

  while ((match = editBlockRegex.exec(text)) !== null) {
    const block = match[1];
    // Parse <<<FIND ... >>>REPLACE ... pairs
    const pairRegex = /<<<FIND\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)(?=<<<FIND|$)/g;
    let pairMatch;

    while ((pairMatch = pairRegex.exec(block)) !== null) {
      const find = pairMatch[1].replace(/\n$/, '');
      const replace = pairMatch[2].replace(/\n$/, '');
      edits.push({ find, replace });
    }
  }

  return edits;
}

/**
 * Extract regular code blocks from AI response.
 * Returns array of { language: string, code: string }.
 */
export function parseCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1].toUpperCase() === 'EDIT') continue; // skip EDIT blocks
    blocks.push({ language: match[1] || '', code: match[2].trim() });
  }
  return blocks;
}

/**
 * Apply find/replace edits to source code.
 * Returns { newCode, appliedCount }.
 */
export function applyEdits(sourceCode, edits) {
  let code = sourceCode;
  let appliedCount = 0;

  for (const edit of edits) {
    // Try exact match first
    if (code.includes(edit.find)) {
      code = code.replace(edit.find, edit.replace);
      appliedCount++;
    } else {
      // Try trimmed/whitespace-flexible match
      const findTrimmed = edit.find.trim();
      const lines = code.split('\n');
      let startIdx = -1;
      let endIdx = -1;
      const findLines = findTrimmed.split('\n').map(l => l.trim());

      for (let i = 0; i <= lines.length - findLines.length; i++) {
        let matched = true;
        for (let j = 0; j < findLines.length; j++) {
          if (lines[i + j].trim() !== findLines[j]) {
            matched = false;
            break;
          }
        }
        if (matched) {
          startIdx = i;
          endIdx = i + findLines.length;
          break;
        }
      }

      if (startIdx !== -1) {
        // Preserve indentation of the first matched line
        const indent = lines[startIdx].match(/^(\s*)/)[1];
        const replaceLines = edit.replace.split('\n').map((l, idx) => {
          if (idx === 0) return indent + l.trimStart();
          return indent + l.trimStart();
        });
        lines.splice(startIdx, endIdx - startIdx, ...replaceLines);
        code = lines.join('\n');
        appliedCount++;
      }
    }
  }

  return { newCode: code, appliedCount };
}
