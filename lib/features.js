// Wires the anti-link, anti-spam, group-invite, auto-reply and AI-chat
// handlers up to a Baileys socket's incoming-message stream. See
// example-connect.js for a runnable demo.
const { handleAntiLink } = require('./antilink');
const { handleAntiSpam } = require('./antispam');
const { handleGroupInvite } = require('./groupinvite');
const { handleAutoReply } = require('./autoreply');
const { handleAiChat } = require('./aichat');

function registerBotFeatures(sock, opts = {}) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            try {
                const linkRemoved = await handleAntiLink(sock, msg, opts);
                if (linkRemoved) continue;

                const spamHandled = await handleAntiSpam(sock, msg, opts);
                if (spamHandled) continue;

                const invited = await handleGroupInvite(sock, msg);
                if (invited) continue;

                const autoReplied = await handleAutoReply(sock, msg);
                if (autoReplied) continue;

                await handleAiChat(sock, msg, opts);
            } catch (err) {
                console.error('[bot-features] handler error:', err);
            }
        }
    });
}

module.exports = {
    registerBotFeatures,
    handleAntiLink,
    handleAntiSpam,
    handleGroupInvite,
    handleAutoReply,
    handleAiChat,
};
