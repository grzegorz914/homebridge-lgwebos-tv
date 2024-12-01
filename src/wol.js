"use strict";
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
        try {
            // Create the magic packet
            const magicPacket = Buffer.alloc(102);
            magicPacket.fill(0xFF, 0, 6);
            for (let i = 6; i < 102; i += 6) {
                this.mac.split(':').map(hex => parseInt(hex, 16)).forEach((byte, j) => {
                    magicPacket.writeUInt8(byte, i + j);
                });
            }

            const socket = Dgram.createSocket(this.udpType);
            socket.on('error', (error) => {
                this.emit('error', error);
            })
                .on('close', () => {
                    const debug1 = this.debugLog ? this.emit('debug', `WoL closed.`) : false;
                })
                .on('listening', () => {
                    socket.setBroadcast(true);
                    const address = socket.address();
                    const debug1 = this.debugLog ? this.emit('debug', `WoL start listening: ${address.address}:${address.port}.`) : false;

                    const sendMagicPacket = (attempt) => {
                        if (attempt > 3) {
                            socket.close();
                            return true;
                        } else {
                            socket.send(magicPacket, 0, magicPacket.length, 9, this.broadcastAddress, (error, bytes) => {
                                if (error) {
                                    this.emit('error', error);
                                } else {
                                    const debug = this.debugLog ? this.emit('debug', `Send WoL to: ${this.broadcastAddress}:${9}, ${bytes}B.`) : false;
                                    setTimeout(() => sendMagicPacket(attempt + 1), 100);
                                }
                            });
                        }
                    };

                    sendMagicPacket(1); // Start the initial send attempt
                })
                .bind();
        } catch (error) {
            throw new Error(error);
        }
    }
}

export default WakeOnLan;
