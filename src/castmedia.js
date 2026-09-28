import tls from 'tls';
import EventEmitter from 'events';

// Title, progress and cover of the media played by an app (YouTube, HBO Max...), read from the Chromecast
// built into the TV, the same way as the Home Assistant Google Cast integration. The webOS API has no such data.
// Cast protocol v2: TLS on port 8009, length prefixed protobuf CastMessage frames with JSON payloads
const Namespace = {
    connection: 'urn:x-cast:com.google.cast.tp.connection',
    heartbeat: 'urn:x-cast:com.google.cast.tp.heartbeat',
    receiver: 'urn:x-cast:com.google.cast.receiver',
    media: 'urn:x-cast:com.google.cast.media'
};
const SenderId = 'sender-lgwebos';
const ReceiverId = 'receiver-0';
const HeartbeatInterval = 5000;
const ReconnectDelays = [5000, 10000, 30000, 60000];
const PlayerStates = { PLAYING: 'playing', PAUSED: 'paused', BUFFERING: 'buffering' };

// CastMessage: 1 protocol_version, 2 source_id, 3 destination_id, 4 namespace, 5 payload_type, 6 payload_utf8
const varint = (value) => {
    const bytes = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }
    bytes.push(value);
    return Buffer.from(bytes);
};
const field = (number, text) => {
    const data = Buffer.from(text, 'utf8');
    return Buffer.concat([varint((number << 3) | 2), varint(data.length), data]);
};
export const encodeMessage = (source, destination, namespace, payload) => {
    const body = Buffer.concat([
        Buffer.from([0x08, 0x00]),
        field(2, source),
        field(3, destination),
        field(4, namespace),
        Buffer.from([0x28, 0x00]),
        field(6, JSON.stringify(payload))
    ]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    return Buffer.concat([length, body]);
};
export const decodeMessage = (body) => {
    const message = {};
    let offset = 0;
    const readVarint = () => {
        let value = 0;
        let shift = 0;
        let byte;
        do {
            byte = body[offset++];
            value += (byte & 0x7f) * 2 ** shift;
            shift += 7;
        } while (byte & 0x80 && offset < body.length);
        return value;
    };
    const names = { 2: 'source', 3: 'destination', 4: 'namespace', 6: 'payload' };
    while (offset < body.length) {
        const tag = readVarint();
        const wire = tag & 0x07;
        const number = tag >>> 3;
        if (wire === 0) {
            readVarint();
        } else if (wire === 2) {
            const length = readVarint();
            const data = body.subarray(offset, offset + length);
            offset += length;
            if (names[number]) message[names[number]] = data.toString('utf8');
        } else {
            break;
        }
    }
    return message;
};

class CastMedia extends EventEmitter {
    constructor(host, port = 8009) {
        super();
        this.host = host;
        this.port = port;
        this.enabled = false;
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.requestId = 0;
        this.transportId = null;
        this.media = null;
        this.mediaInfo = null;
        this.attempt = 0;
    }

    start() {
        if (this.enabled) return;
        this.enabled = true;
        this.connect();
    }

    stop() {
        this.enabled = false;
        clearTimeout(this.reconnectTimer);
        this.close();
    }

    connect() {
        if (!this.enabled || this.socket) return;

        // The Chromecast of the TV uses a device certificate that is not signed by a public CA, like in Home Assistant
        const socket = tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false, timeout: 10000 });
        this.socket = socket;
        socket.on('secureConnect', () => {
            this.attempt = 0;
            this.send(ReceiverId, Namespace.connection, { type: 'CONNECT' });
            this.send(ReceiverId, Namespace.receiver, { type: 'GET_STATUS', requestId: ++this.requestId });
            this.heartbeat = setInterval(() => this.send(ReceiverId, Namespace.heartbeat, { type: 'PING' }), HeartbeatInterval);
            this.emit('debug', 'Cast connected');
        });
        socket.on('data', (data) => this.receive(data));
        socket.on('timeout', () => socket.destroy(new Error('Cast connection timeout')));
        socket.on('error', (error) => this.emit('debug', `Cast connection error: ${error.message}`));
        socket.on('close', () => {
            if (this.socket !== socket) return;
            this.close();
            if (!this.enabled) return;
            const delay = ReconnectDelays[Math.min(this.attempt++, ReconnectDelays.length - 1)];
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
        });
    }

    close() {
        clearInterval(this.heartbeat);
        const socket = this.socket;
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.transportId = null;
        socket?.destroy();
        this.update(null);
    }

    send(destination, namespace, payload) {
        if (!this.socket || this.socket.destroyed) return;
        this.socket.write(encodeMessage(SenderId, destination, namespace, payload));
    }

    receive(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
        while (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32BE(0);
            if (this.buffer.length < 4 + length) return;
            const body = this.buffer.subarray(4, 4 + length);
            this.buffer = this.buffer.subarray(4 + length);
            try {
                const message = decodeMessage(body);
                this.handle(message, JSON.parse(message.payload ?? '{}'));
            } catch (error) {
                this.emit('debug', `Cast message error: ${error.message}`);
            }
        }
    }

    handle(message, payload) {
        switch (message.namespace) {
            case Namespace.heartbeat:
                if (payload.type === 'PING') this.send(message.source, Namespace.heartbeat, { type: 'PONG' });
                break;
            case Namespace.connection:
                // The app closed its session
                if (payload.type === 'CLOSE' && message.source === this.transportId) {
                    this.transportId = null;
                    this.update(null);
                }
                break;
            case Namespace.receiver: {
                if (payload.type !== 'RECEIVER_STATUS') break;
                this.emit('debug', `Cast receiver status: ${JSON.stringify(payload.status?.applications ?? [])}`);
                const app = (payload.status?.applications ?? []).find(a => (a.namespaces ?? []).some(n => n.name === Namespace.media));
                const transportId = app?.transportId ?? null;
                if (transportId === this.transportId) break;
                this.transportId = transportId;
                this.mediaInfo = null;
                if (!transportId) {
                    this.update(null);
                    break;
                }
                this.send(transportId, Namespace.connection, { type: 'CONNECT' });
                this.send(transportId, Namespace.media, { type: 'GET_STATUS', requestId: ++this.requestId });
                break;
            }
            case Namespace.media: {
                if (payload.type !== 'MEDIA_STATUS') break;
                this.emit('debug', `Cast media status: ${JSON.stringify(payload.status ?? [])}`);
                const status = payload.status?.[0];
                const state = PlayerStates[status?.playerState];
                if (!status || !state) {
                    this.update(null);
                    break;
                }
                // The media is sent when it changes, later statuses carry only the play state and time
                if (status.media) this.mediaInfo = status.media;
                const info = this.mediaInfo ?? {};
                const metadata = info.metadata ?? {};
                const duration = Number(info.duration);
                const position = Number(status.currentTime);
                this.update({
                    title: metadata.title ?? '',
                    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
                    position: Number.isFinite(position) && position >= 0 ? position : null,
                    positionAt: Date.now() / 1000,
                    state,
                    cover: (metadata.images ?? []).map(image => image?.url).find(url => /^https?:\/\//.test(String(url))) ?? null
                });
                break;
            }
        }
    }

    update(media) {
        if (JSON.stringify(media) === JSON.stringify(this.media)) return;
        this.media = media;
        this.emit('media', media);
    }
}

export default CastMedia;
