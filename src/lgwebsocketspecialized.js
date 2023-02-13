'use strict';
class WebSocketSpecialized {
    constructor(connection) {
        this.connection = connection;
    };

    send(type, payload = {}) {
        const message = Object.keys(payload).reduce((acc, k) => {
            return (acc.concat([`${k}:${payload[k]}`]));
        }, [`type:${type}`]).join('\n') + '\n\n';

        this.connection.send(message);
    };

    close() {
        this.connection.close();
    };
};
module.exports = WebSocketSpecialized;