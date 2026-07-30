// Wires the anti-link and auto-reply handlers up to a Baileys socket's
// incoming-message stream. See example-connect.js for a runnable demo.
const { handleAntiLink } = require('./antilink');
const { handleAutoReply } = require('./autoreply');

function registerBotFeatures(sock, opts = {}) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            try {
                const linkRemoved = await handleAntiLink(sock, msg, opts);
                if (linkRemoved) continue;

                await handleAutoReply(sock, msg);
            } catch (err) {
                console.error('[bot-features] handler error:', err);
            }
        }
    });
}

module.exports = { registerBotFeatures, handleAntiLink, handleAutoReply };
