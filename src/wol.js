import Dgram from 'dgram';
import Net from 'net';
import EventEmitter from 'events';

class WakeOnLan extends EventEmitter {
    constructor(config) {
        super();
        this.mac = config.mac;
        this.broadcastAddress = config.broadcastAddress;
        this.debugLog = config.debugLog;
        this.udpType = Net.isIPv6(this.broadcastAddress) ? 'udp6' : 'udp4';
    }

    async wakeOnLan() {
        return new Promise((resolve, reject) => {
            try {
                // Parse MAC once
                const macBytes = this.mac.split(':').map(hex => parseInt(hex, 16));
                const magicPacket = Buffer.alloc(102);
                magicPacket.fill(0xFF, 0, 6);
                for (let i = 6; i < 102; i += 6) {
                    macBytes.forEach((byte, j) => magicPacket.writeUInt8(byte, i + j));
                }

                const socket = Dgram.createSocket(this.udpType)
                    .on('error', (error) => {
                        this.emit('error', error);
                        reject(error);
                    })
                    .on('close', () => {
                        if (this.debugLog) this.emit('debug', `WoL socket closed`);
                        resolve(true);
                    })
                    .on('listening', () => {
                        if (this.udpType === 'udp4') socket.setBroadcast(true);

                        const address = socket.address();
                        if (this.debugLog) this.emit('debug', `WoL listening: ${address.address}:${address.port}`);

                        const sendMagicPacket = (attempt) => {
                            if (attempt > 4) {
                                socket.close();
                                return;
                            }
                            socket.send(magicPacket, 0, magicPacket.length, 9, this.broadcastAddress, (error, bytes) => {
                                if (error) {
                                    this.emit('error', error);
                                    socket.close();
                                } else {
                                    if (this.debugLog) this.emit('debug', `Sent WoL to ${this.broadcastAddress}:9, ${bytes}B (try ${attempt})`);
                                    setTimeout(() => sendMagicPacket(attempt + 1), 100);
                                }
                            });
                        };

                        sendMagicPacket(1);
                    })
                    .bind({ port: 0, exclusive: true });
            } catch (error) {
                this.emit('error', error);
                reject(error);
            }
        });
    }
}

export default WakeOnLan;

