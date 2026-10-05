// Execute completed tool items immediately, while streamed speech can still play.
// Only schedule the next model response after the current one ends.
export class RealtimeTools {
  private seen = new Set<string>();
  private cancelled = new Set<string>();
  private active: string | null = null;
  private execute: (
    id: string,
    name: string,
    args: Record<string, unknown>,
  ) => Record<string, unknown>;
  private send: (event: unknown) => void;
  constructor(execute: RealtimeTools['execute'], send: RealtimeTools['send']) {
    this.execute = execute;
    this.send = send;
  }
  interrupt() {
    if (this.active) this.cancelled.add(this.active);
  }
  private run(responseId: string, call: any) {
    if (
      this.cancelled.has(responseId) ||
      this.seen.has(call.call_id) ||
      call.type !== 'function_call' ||
      call.status !== 'completed'
    )
      return;
    this.seen.add(call.call_id);
    let result: Record<string, unknown>;
    try {
      result = this.execute(
        call.call_id,
        call.name,
        JSON.parse(call.arguments),
      );
    } catch {
      result = { ok: false, error: 'invalid_tool_arguments' };
    }
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      },
    });
  }
  handle(e: any): boolean {
    if (e.type === 'response.created') this.active = e.response.id;
    if (e.type === 'response.output_item.done') this.run(e.response_id, e.item);
    if (e.type !== 'response.done') return false;
    if (this.active === e.response.id) this.active = null;
    if (e.response.status !== 'completed' || this.cancelled.has(e.response.id))
      return false;
    const calls = (e.response.output || []).filter(
      (c: any) => c.type === 'function_call' && c.status === 'completed',
    );
    for (const c of calls) this.run(e.response.id, c);
    if (calls.length) this.send({ type: 'response.create' });
    return calls.length > 0;
  }
}
