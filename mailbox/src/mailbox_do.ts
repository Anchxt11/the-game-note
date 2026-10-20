import { PostChangesRequest, AckRequest, MailboxBatch, Env } from "./types";

export class MailboxDurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private sql: SqlStorage;
  private sseClients: Set<WritableStreamDefaultWriter<Uint8Array>> = new Set();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS batches (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id  TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        size       INTEGER NOT NULL,
        envelope   TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS devices (
        device_id  TEXT PRIMARY KEY,
        acked_seq  INTEGER NOT NULL DEFAULT 0,
        last_seen  INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      let response: Response;
      if (path === "/mailbox/health" && request.method === "GET") {
        response = this.handleHealth();
      } else if (path === "/mailbox/changes" && request.method === "POST") {
        response = await this.handlePostChanges(request);
      } else if (path === "/mailbox/changes" && request.method === "GET") {
        response = this.handleGetChanges(url);
      } else if (path === "/mailbox/ack" && request.method === "POST") {
        response = await this.handleAck(request);
      } else if (path === "/mailbox/events" && request.method === "GET") {
        return this.handleEvents(corsHeaders);
      } else {
        response = new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
      }

      // Append CORS headers to json response
      const newHeaders = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders)) {
        newHeaders.set(k, v);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  private handleHealth(): Response {
    const row = this.sql.exec("SELECT MAX(seq) as latest_seq FROM batches").toArray()[0];
    const latestSeq = Number(row?.latest_seq || 0);

    const devRow = this.sql.exec("SELECT COUNT(*) as count FROM devices").toArray()[0];
    const devicesCount = Number(devRow?.count || 0);

    return Response.json({
      status: "ok",
      latest_seq: latestSeq,
      devices_count: devicesCount,
    });
  }

  private async handlePostChanges(request: Request): Promise<Response> {
    const body = (await request.json()) as PostChangesRequest;
    if (!body || !body.device_id || !body.envelope) {
      return Response.json({ error: "Missing device_id or envelope" }, { status: 400 });
    }

    const { envelope, device_id } = body;
    if (!envelope.payload || !envelope.nonce || !envelope.sender_site_id) {
      return Response.json({ error: "Invalid envelope format" }, { status: 422 });
    }

    const envelopeJson = JSON.stringify(envelope);
    const size = envelopeJson.length;
    if (size > 5 * 1024 * 1024) {
      return Response.json({ error: "Payload exceeds 5 MiB ceiling" }, { status: 413 });
    }

    const now = Date.now();
    this.sql.exec(
      "INSERT INTO batches(device_id, created_at, size, envelope) VALUES (?, ?, ?, ?)",
      device_id,
      now,
      size,
      envelopeJson
    );

    const cursor = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0];
    const newSeq = Number(cursor.id);

    this.sql.exec(
      `INSERT INTO devices(device_id, acked_seq, last_seen)
       VALUES (?, 0, ?)
       ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen`,
      device_id,
      now
    );

    // Live broadcast to all connected devices in this group
    this.broadcastSeq(newSeq);

    return Response.json({ seq: newSeq });
  }

  private handleGetChanges(url: URL): Response {
    const after = Number(url.searchParams.get("after") || 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);

    const rows = this.sql
      .exec(
        "SELECT seq, device_id, created_at, size, envelope FROM batches WHERE seq > ? ORDER BY seq ASC LIMIT ?",
        after,
        limit + 1
      )
      .toArray();

    const hasMore = rows.length > limit;
    const fetchRows = hasMore ? rows.slice(0, limit) : rows;

    const batches: MailboxBatch[] = fetchRows.map((r: any) => ({
      seq: Number(r.seq),
      device_id: String(r.device_id),
      created_at: Number(r.created_at),
      size: Number(r.size),
      envelope: JSON.parse(r.envelope),
    }));

    const maxRow = this.sql.exec("SELECT MAX(seq) as latest_seq FROM batches").toArray()[0];
    const latestSeq = Number(maxRow?.latest_seq || 0);

    return Response.json({
      batches,
      latest_seq: latestSeq,
      has_more: hasMore,
    });
  }

  private async handleAck(request: Request): Promise<Response> {
    const body = (await request.json()) as AckRequest;
    if (!body || !body.device_id || typeof body.seq !== "number") {
      return Response.json({ error: "Invalid ack payload" }, { status: 400 });
    }

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO devices(device_id, acked_seq, last_seen)
       VALUES (?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         acked_seq = MAX(devices.acked_seq, excluded.acked_seq),
         last_seen = excluded.last_seen`,
      body.device_id,
      body.seq,
      now
    );

    // Retention cleanup: purge batches that ALL registered devices have already acked
    const devRows = this.sql.exec("SELECT acked_seq FROM devices").toArray();
    if (devRows.length >= 2) {
      const minAcked = Math.min(...devRows.map((d: any) => Number(d.acked_seq)));
      if (minAcked > 0) {
        // Keep at least the latest 50 batches for safety margin
        const maxRow = this.sql.exec("SELECT MAX(seq) as max_seq FROM batches").toArray()[0];
        const maxSeq = Number(maxRow?.max_seq || 0);
        const safePurgeLimit = Math.min(minAcked, maxSeq - 50);
        if (safePurgeLimit > 0) {
          this.sql.exec("DELETE FROM batches WHERE seq <= ?", safePurgeLimit);
        }
      }
    }

    return Response.json({ ok: true });
  }

  private heartbeatTimer: any = null;

  private ensureHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.sseClients.size === 0) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        return;
      }
      const pingMsg = new TextEncoder().encode(": ping\n\n");
      for (const writer of this.sseClients) {
        writer.write(pingMsg).catch(() => {
          this.sseClients.delete(writer);
        });
      }
    }, 15000);
  }

  private handleEvents(corsHeaders: Record<string, string>): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    this.sseClients.add(writer);

    this.ensureHeartbeat();

    // Send initial comment to establish SSE stream
    writer.write(new TextEncoder().encode(": connected\n\n")).catch(() => {
      this.sseClients.delete(writer);
    });

    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders,
    });

    return new Response(readable, { headers });
  }

  private broadcastSeq(seq: number) {
    const msg = new TextEncoder().encode(`data: {"seq": ${seq}}\n\n`);
    for (const writer of this.sseClients) {
      writer.write(msg).catch(() => {
        this.sseClients.delete(writer);
      });
    }
  }
}
