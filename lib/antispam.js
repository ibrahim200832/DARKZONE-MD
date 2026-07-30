// Anti-spam: flags senders in groups who flood messages too fast (more than
// SPAM_MAX_MESSAGES within SPAM_INTERVAL_SECONDS). First offense gets a
// warning; if it keeps happening while still warned, the sender is removed
// (only if the bot is a group admin). Group admins and the bot owner are
// exempt, mirroring lib/antilink.js. Activity is tracked in memory only and
// resets whenever the process restarts.
const config = require('../config');

const MAX_MESSAGES = parseInt(config.SPAM_MAX_MESSAGES, 10) || 5;
const INTERVAL_MS = (parseInt(config.SPAM_INTERVAL_SECONDS, 10) || 10) * 1000;

// groupJid -> senderJid -> { timestamps: number[], warned: boolean }
const activity = new Map();

function normalizeJid(jid) {
    return jid?.split(':')[0] + '@s.whatsapp.net';
}

function recordMessage(jid, sender) {
    let groupMap = activity.get(jid);
    if (!groupMap) {
        groupMap = new Map();
        activity.set(jid, groupMap);
    }
    let entry = groupMap.get(sender);
    if (!entry) {
        entry = { timestamps: [], warned: false };
        groupMap.set(sender, entry);
    }
    const now = Date.now();
    entry.timestamps.push(now);
    entry.timestamps = entry.timestamps.filter((t) => now - t <= INTERVAL_MS);
    return entry;
}

async function handleAntiSpam(sock, msg, opts = {}) {
    if (config.ANTI_SPAM !== 'true') return false;
    if (!msg.message || msg.key.fromMe) return false;

    const jid = msg.key.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) return false;

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

    const entry = recordMessage(jid, sender);
    if (entry.timestamps.length <= MAX_MESSAGES) return false;

    if (!entry.warned) {
        entry.warned = true;
        await sock.sendMessage(
            jid,
            {
                text: `⚠️ @${sender.split('@')[0]}, bitte nicht spammen (max. ${MAX_MESSAGES} Nachrichten pro ${INTERVAL_MS / 1000}s).`,
                mentions: [sender],
            },
            { quoted: msg },
        );
        return true;
    }

    const botId = normalizeJid(sock.user?.id);
    const botIsAdmin = !!metadata.participants.find((p) => p.id === botId)?.admin;
    if (!botIsAdmin) return false; // already warned once; nothing more we can do without admin rights

    try {
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');
    } catch {
        // sender may already be gone; still reset state below
    }
    await sock.sendMessage(jid, {
        text: `🚫 @${sender.split('@')[0]} wurde wegen Spammens aus der Gruppe entfernt.`,
        mentions: [sender],
    });
    entry.timestamps = [];
    entry.warned = false;
    return true;
}

module.exports = { handleAntiSpam };
