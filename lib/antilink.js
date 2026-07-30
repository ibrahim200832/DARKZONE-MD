// Anti-link: deletes messages containing links posted in groups, and removes
// the sender if the bot has admin rights there. Group admins are exempt.
const config = require('../config');
const { getMessageText, containsLink } = require('./text');

function normalizeJid(jid) {
    return jid?.split(':')[0] + '@s.whatsapp.net';
}

async function handleAntiLink(sock, msg, opts = {}) {
    if (config.ANTI_LINK !== 'true') return false;
    if (!msg.message || msg.key.fromMe) return false;

    const jid = msg.key.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) return false;

    const text = getMessageText(msg);
    if (!containsLink(text)) return false;

    const sender = msg.key.participant || msg.key.remoteJid;
    const ownerNumber = opts.ownerNumber || config.OWNER_NUMBER;
    if (ownerNumber && sender.startsWith(ownerNumber)) return false;

    let metadata;
    try {
        metadata = await sock.groupMetadata(jid);
    } catch {
        return false;
    }

    const senderIsAdmin = !!metadata.participants.find((p) => p.id === sender)?.admin;
    if (senderIsAdmin) return false;

    const botId = normalizeJid(sock.user?.id);
    const botIsAdmin = !!metadata.participants.find((p) => p.id === botId)?.admin;

    if (botIsAdmin) {
        try {
            await sock.sendMessage(jid, { delete: msg.key });
        } catch {
            // message may already be gone; ignore
        }
        try {
            await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        } catch {
            // bot may lack permission in edge cases; still warn below
        }
        await sock.sendMessage(jid, {
            text: `🔗 Link detected and removed. @${sender.split('@')[0]} was removed for sending a link.`,
            mentions: [sender],
        });
    } else {
        await sock.sendMessage(
            jid,
            {
                text: `⚠️ @${sender.split('@')[0]}, links are not allowed in this group.`,
                mentions: [sender],
            },
            { quoted: msg },
        );
    }

    return true;
}

module.exports = { handleAntiLink };
