"use strict";
const Dgram = require('dgram');
const Net = require('net');
const EventEmitter = require('events');

class WOL extends EventEmitter {
    constructor(config) {
        super();
        this.mac = config.mac;
        this.host = config.host || '255.255.255.255';
        this.debugLog = config.debugLog;

        const host = this.host.split('.');
        host[host.length - 1] = '255';
        this.ipAddress = host.join('.');
        this.udpType = Net.isIPv6(this.ipAddress) ? 'udp6' : 'udp4';
    }

    wakeOnLan(retries = 3, retryDelay = 100) {
        return new Promise((resolve, reject) => {
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
                    reject(error);
                })
                    .on('close', () => {
                        const debug1 = this.debugLog ? this.emit('debug', `WoL closed.`) : false;
                    })
                    .on('listening', () => {
                        socket.setBroadcast(true);
                        const address = socket.address();
                        const debug1 = this.debugLog ? this.emit('debug', `WoL start listening: ${address.address}:${address.port}.`) : false;

                        const sendMagicPacket = (attempt) => {
                            if (attempt > retries) {
                                socket.close();
                                resolve();
                            } else {
                                socket.send(magicPacket, 0, magicPacket.length, 9, this.ipAddress, (error, bytes) => {
                                    if (error) {
                                        reject(error);
                                    } else {
                                        const debug = this.debugLog ? this.emit('debug', `Send WoL to: ${this.ipAddress}:${9}, ${bytes}B.`) : false;
                                        setTimeout(() => sendMagicPacket(attempt + 1), retryDelay);
                                    }
                                });
                            }
                        };

                        sendMagicPacket(1); // Start the initial send attempt
                    })
                    .bind();
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = WOL;
