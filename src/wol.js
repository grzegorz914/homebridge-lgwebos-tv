import Dgram from 'dgram';
import Net from 'net';
import EventEmitter from 'events';

class WakeOnLan extends EventEmitter {
    constructor(config) {
        super();
        this.mac = config.mac;
        this.broadcastAddress = config.broadcastAddress || config.host || (Net.isIPv6(config.host) ? 'ff02::1' : '255.255.255.255');
        this.udpType = Net.isIPv6(this.broadcastAddress) ? 'udp6' : 'udp4';
        this.logDebug = config.logDebug || false;

        // Walidacja broadcastAddress
        if (Net.isIP(this.broadcastAddress) === 0) {
            throw new Error(`Invalid broadcast address: ${this.broadcastAddress}`);
        }
    }

    normalizeMac(mac) {
        const normalized = mac.replace(/[-]/g, ':').toLowerCase();
        const parts = normalized.split(':');
        if (parts.length !== 6 || parts.some(p => p.length !== 2 || isNaN(parseInt(p, 16)))) {
            throw new Error(`Invalid MAC address: ${mac}`);
        }
        return parts.map(hex => parseInt(hex, 16));
    }

    async wakeOnLan() {
        return new Promise((resolve, reject) => {
            try {
                const macBytes = this.normalizeMac(this.mac);
                const macBuffer = Buffer.from(macBytes);

                const magicPacket = Buffer.concat([
                    Buffer.alloc(6, 0xFF),
                    Buffer.alloc(16 * macBuffer.length, macBuffer)
                ]);

                const socket = Dgram.createSocket(this.udpType)
                    .on('error', (error) => {
                        this.emit('error', error);
                        reject(error);
                        socket.close();
                    })
                    .on('close', () => {
                        clearTimeout(timeout);
                        if (this.logDebug) this.emit('debug', `WoL socket closed`);
                        resolve(true);
                    })
                    .on('listening', () => {
                        if (this.udpType === 'udp4') socket.setBroadcast(true);

                        const address = socket.address();
                        if (this.logDebug) this.emit('debug', `WoL listening: ${address.address}:${address.port}`);

                        const sendMagicPacket = (attempt) => {
                            if (attempt > 4) {
                                socket.close();
                                return;
                            }
                            socket.send(magicPacket, 0, magicPacket.length, 9, this.broadcastAddress, (error, bytes) => {
                                if (error) {
                                    this.emit('error', error);
                                    reject(error);
                                    socket.close();
                                } else {
                                    if (this.logDebug) this.emit('debug', `Sent WoL to ${this.broadcastAddress}:9, ${bytes}B (try ${attempt})`);
                                    setTimeout(() => sendMagicPacket(attempt + 1), 100);
                                }
                            });
                        };

                        sendMagicPacket(1);
                    })
                    .bind({ port: 0, exclusive: true });

                const timeout = setTimeout(() => {
                    if (this.logDebug) this.emit('debug', `WoL timeout, closing socket`);
                    socket.close();
                }, 2000);
            } catch (error) {
                reject(error);
            }
        });
    }
}

export default WakeOnLan;




