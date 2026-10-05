export type TranscriptMessage = {
  role: 'user' | 'assistant';
  text: string;
  streamId?: string;
};
// Input and output transcription events can interleave. Append by utterance ID,
// not by the last speaker shown in the chat.
export function appendTranscript<T extends TranscriptMessage>(
  messages: T[],
  role: TranscriptMessage['role'],
  text: string,
  streamId: string,
): (T | TranscriptMessage)[] {
  if (!text) return messages;
  const index = messages.findIndex(
    (m) => m.streamId === streamId && m.role === role,
  );
  if (index < 0) return [...messages, { role, text, streamId }];
  return messages.map((m, i) =>
    i === index ? { ...m, text: m.text + text } : m,
  );
}
