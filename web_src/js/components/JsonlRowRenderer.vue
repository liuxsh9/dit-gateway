<template>
  <article class="datahub-sft-row-card">
    <header class="datahub-sft-row-header">
      <div>
        <div class="datahub-sft-row-title">Row {{ rowNumber.toLocaleString() }}</div>
        <div class="datahub-sft-row-meta">
          <span v-if="row.version">ML {{ row.version }}</span>
          <span v-if="metaSummary">{{ metaSummary }}</span>
          <span v-if="rowHash">#{{ rowHash.slice(0, 8) }}</span>
        </div>
      </div>
      <div class="datahub-sft-row-counts">
        <span v-if="schemaWarnings.length" class="ui tiny yellow label">{{ schemaWarnings.length }} warnings</span>
        <span class="ui tiny label">{{ messages.length }} messages</span>
        <span v-if="tools.length" class="ui tiny label">{{ tools.length }} tools</span>
      </div>
    </header>

    <div v-if="schemaWarnings.length" class="ui tiny warning message datahub-sft-warning">
      <div class="header">ML2 shape warnings</div>
      <ul>
        <li v-for="warning in schemaWarnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <div class="datahub-sft-timeline">
      <section
        v-for="(message, index) in messages"
        :key="index"
        class="datahub-sft-message"
        :class="`datahub-sft-role-${roleClass(message.role)}`"
      >
        <div class="datahub-sft-message-rail">
          <span class="datahub-sft-role-badge">{{ message.role || 'message' }}</span>
        </div>
        <div class="datahub-sft-message-body">
          <div v-if="message.name || message.weight !== undefined || message.tool_call_id" class="datahub-sft-message-meta">
            <span v-if="message.name">name: {{ message.name }}</span>
            <span v-if="message.weight !== undefined">weight: {{ message.weight }}</span>
            <span v-if="message.tool_call_id">tool_call_id: {{ message.tool_call_id }}</span>
          </div>

          <div
            v-if="renderContent(message.content)"
            class="datahub-sft-content"
            :class="{'datahub-sft-content-collapsed': isLongContent(message.content) && !isContentExpanded(index)}"
          >
            {{ renderContent(message.content) }}
          </div>
          <button
            v-if="isLongContent(message.content)"
            type="button"
            class="ui mini basic button datahub-sft-toggle"
            @click="toggleContent(index)"
          >
            {{ isContentExpanded(index) ? 'Collapse content' : 'Show full content' }}
          </button>
          <div v-else class="datahub-sft-empty-content">empty content</div>

          <details v-if="renderContent(message.reasoning_content)" class="datahub-sft-details">
            <summary>reasoning_content</summary>
            <pre>{{ renderContent(message.reasoning_content) }}</pre>
          </details>

          <details v-if="Array.isArray(message.tool_calls) && message.tool_calls.length" class="datahub-sft-details">
            <summary>tool_calls: {{ summarizeToolCalls(message.tool_calls) }}</summary>
            <div v-for="(toolCall, toolIndex) in message.tool_calls" :key="toolIndex" class="datahub-sft-tool-call">
              <div>
                <strong>{{ toolCall.function?.name || toolCall.name || 'tool' }}</strong>
                <span v-if="toolCall.id"> · {{ toolCall.id }}</span>
              </div>
              <pre>{{ formatJson(toolCall.function?.arguments ?? toolCall.arguments ?? toolCall) }}</pre>
            </div>
          </details>

          <details v-if="messageExtraKeys(message).length" class="datahub-sft-details">
            <summary>extra fields</summary>
            <pre>{{ formatJson(pickKeys(message, messageExtraKeys(message))) }}</pre>
          </details>
        </div>
      </section>
    </div>

    <details v-if="tools.length" class="datahub-sft-row-details">
      <summary>tools: {{ summarizeTools(tools) }}</summary>
      <pre>{{ formatJson(tools) }}</pre>
    </details>

    <details v-if="row.meta_info" class="datahub-sft-row-details">
      <summary>meta_info</summary>
      <pre>{{ formatJson(row.meta_info) }}</pre>
    </details>

    <details v-if="rowExtraKeys.length" class="datahub-sft-row-details">
      <summary>row fields: {{ rowExtraKeys.join(', ') }}</summary>
      <pre>{{ formatJson(pickKeys(row, rowExtraKeys)) }}</pre>
    </details>
  </article>
</template>

<script>
const MESSAGE_KEYS = new Set([
  'role',
  'name',
  'content',
  'reasoning_content',
  'tool_calls',
  'tool_call_id',
  'weight',
]);

const ROW_KEYS = new Set([
  'messages',
  'tools',
  'version',
  'meta_info',
]);

export default {
  props: {
    row: {
      type: Object,
      required: true,
    },
    rowNumber: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      expandedContent: new Set(),
    };
  },
  computed: {
    messages() {
      return Array.isArray(this.row.messages) ? this.row.messages : [];
    },
    tools() {
      return Array.isArray(this.row.tools) ? this.row.tools : [];
    },
    rowHash() {
      return this.row.__datahubRowHash || '';
    },
    metaSummary() {
      const meta = this.row.meta_info;
      if (!meta || typeof meta !== 'object') return '';
      const parts = [];
      for (const key of ['teacher', 'language', 'category', 'rounds']) {
        if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') {
          parts.push(`${key}: ${meta[key]}`);
        }
      }
      return parts.join(' · ');
    },
    rowExtraKeys() {
      return Object.keys(this.row).filter((key) => !ROW_KEYS.has(key) && !key.startsWith('__'));
    },
    schemaWarnings() {
      const warnings = [];
      if (!Array.isArray(this.row.messages)) warnings.push('messages must be an array');
      if (!this.row.version) warnings.push('version is missing');

      const meta = this.row.meta_info;
      const requiredMetaKeys = [
        'teacher',
        'query_source',
        'response_generate_time',
        'response_update_time',
        'owner',
        'language',
        'category',
        'rounds',
      ];
      if (!meta || typeof meta !== 'object') {
        warnings.push('meta_info is missing');
      } else {
        for (const key of requiredMetaKeys) {
          if (meta[key] === undefined || meta[key] === null || meta[key] === '') {
            warnings.push(`meta_info.${key} is missing`);
          }
        }
      }

      const toolCallIds = new Set();
      this.messages.forEach((message, index) => {
        const position = index + 1;
        if (!message?.role) warnings.push(`message ${position} is missing role`);
        if (message?.role === 'assistant' && !Object.prototype.hasOwnProperty.call(message, 'content')) {
          warnings.push(`assistant message ${position} is missing content`);
        } else if (['developer', 'system', 'user', 'tool'].includes(message?.role) && !Object.prototype.hasOwnProperty.call(message, 'content')) {
          warnings.push(`${message.role} message ${position} is missing content`);
        }
        if (Array.isArray(message?.tool_calls)) {
          for (const call of message.tool_calls) {
            if (call?.id) toolCallIds.add(call.id);
          }
        }
      });
      this.messages.forEach((message, index) => {
        if (message?.role === 'tool' && message.tool_call_id && !toolCallIds.has(message.tool_call_id)) {
          warnings.push(`tool message ${index + 1} references unknown tool_call_id ${message.tool_call_id}`);
        }
      });
      return warnings.slice(0, 8);
    },
  },
  methods: {
    roleClass(role) {
      return ['developer', 'system', 'user', 'assistant', 'tool'].includes(role) ? role : 'unknown';
    },
    renderContent(value) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) {
        return value.map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
          return this.formatJson(part);
        }).join('\n');
      }
      return this.formatJson(value);
    },
    summarizeToolCalls(toolCalls) {
      return toolCalls.map((toolCall) => toolCall.function?.name || toolCall.name || toolCall.id || 'tool').join(', ');
    },
    summarizeTools(tools) {
      return tools.map((tool) => tool.function?.name || tool.name || tool.type || 'tool').join(', ');
    },
    messageExtraKeys(message) {
      return Object.keys(message || {}).filter((key) => !MESSAGE_KEYS.has(key));
    },
    pickKeys(source, keys) {
      return keys.reduce((picked, key) => {
        picked[key] = source[key];
        return picked;
      }, {});
    },
    formatJson(value) {
      if (typeof value === 'string') {
        try {
          return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
          return value;
        }
      }
      return JSON.stringify(value, null, 2);
    },
    isLongContent(value) {
      const content = this.renderContent(value);
      return content.split('\n').length > 5 || content.length > 900;
    },
    isContentExpanded(index) {
      return this.expandedContent.has(index);
    },
    toggleContent(index) {
      const next = new Set(this.expandedContent);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      this.expandedContent = next;
    },
  },
};
</script>

<style scoped>
.datahub-sft-row-card {
  border: 1px solid var(--color-secondary);
  border-radius: 8px;
  background: var(--color-box-body);
  box-shadow: 0 1px 2px var(--color-shadow);
}

.datahub-sft-row-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-secondary);
  background: var(--color-box-header);
}

.datahub-sft-row-title {
  font-weight: 600;
}

.datahub-sft-row-meta,
.datahub-sft-message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--color-text-light-2);
  font-size: 12px;
}

.datahub-sft-row-counts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.datahub-sft-timeline {
  padding: 12px 16px 6px;
}

.datahub-sft-warning {
  margin: 12px 16px 0;
}

.datahub-sft-warning ul {
  margin: 4px 0 0;
  padding-left: 18px;
}

.datahub-sft-message {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-secondary-alpha-40);
}

.datahub-sft-message:last-child {
  border-bottom: 0;
}

.datahub-sft-message-rail {
  display: flex;
  justify-content: flex-end;
}

.datahub-sft-role-badge {
  align-self: flex-start;
  min-width: 74px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-secondary);
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  text-transform: lowercase;
}

.datahub-sft-role-system .datahub-sft-role-badge,
.datahub-sft-role-developer .datahub-sft-role-badge {
  background: var(--color-secondary-alpha-40);
}

.datahub-sft-role-user .datahub-sft-role-badge {
  color: var(--color-blue-dark-2, var(--color-primary));
  background: var(--color-blue-light-5, var(--color-primary-light-6));
  border-color: var(--color-blue-light-2, var(--color-primary-light-3));
}

.datahub-sft-role-assistant .datahub-sft-role-badge {
  color: var(--color-green-dark-2, var(--color-green));
  background: var(--color-green-light-5, var(--color-green-light));
  border-color: var(--color-green-light-2, var(--color-green-light));
}

.datahub-sft-role-tool .datahub-sft-role-badge {
  color: var(--color-orange-dark-2, var(--color-orange));
  background: var(--color-orange-light-5, var(--color-orange-light));
  border-color: var(--color-orange-light-2, var(--color-orange-light));
}

.datahub-sft-message-body {
  min-width: 0;
}

.datahub-sft-content,
.datahub-sft-empty-content {
  margin-top: 4px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.datahub-sft-empty-content {
  color: var(--color-text-light-3);
  font-style: italic;
}

.datahub-sft-content-collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

.datahub-sft-toggle {
  margin-top: 6px;
}

.datahub-sft-details,
.datahub-sft-row-details {
  margin-top: 8px;
}

.datahub-sft-details summary,
.datahub-sft-row-details summary {
  cursor: pointer;
  color: var(--color-text-light-1);
  font-size: 12px;
}

.datahub-sft-details pre,
.datahub-sft-row-details pre {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-code-bg);
  overflow: auto;
  white-space: pre-wrap;
}

.datahub-sft-tool-call {
  margin-top: 8px;
}

.datahub-sft-row-details {
  margin: 0;
  padding: 0 16px 12px;
}

@media (max-width: 767px) {
  .datahub-sft-row-header {
    flex-direction: column;
  }

  .datahub-sft-message {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .datahub-sft-message-rail {
    justify-content: flex-start;
  }
}
</style>
