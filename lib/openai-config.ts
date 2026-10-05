import { functionDeclarations, instructions } from './assistant.ts';
import { languageInstruction, type VoiceSettings } from './voice-settings.ts';
function schema(value: any): any {
  if (Array.isArray(value)) return value.map(schema);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === 'type' && typeof v === 'string' ? v.toLowerCase() : schema(v),
      ]),
    );
  return value;
}
export function openAIConfig(settings: VoiceSettings) {
  return {
    type: 'realtime',
    model: settings.model,
    instructions: instructions + '\n' + languageInstruction(settings.language),
    output_modalities: ['audio'],
    max_output_tokens: 1200,
    reasoning: { effort: 'low' },
    audio: {
      input: {
        transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: settings.language,
        },
        noise_reduction: { type: 'near_field' },
        turn_detection:
          settings.inputMode !== 'auto'
            ? null
            : {
                type: 'server_vad',
                threshold: 0.7,
                prefix_padding_ms: 300,
                silence_duration_ms: 650,
                create_response: true,
                interrupt_response: false,
              },
      },
      output: { voice: settings.voice },
    },
    tools: functionDeclarations.map((f) => ({
      type: 'function',
      name: f.name,
      description: f.description,
      parameters: schema(f.parameters),
    })),
    tool_choice: 'auto',
  };
}
