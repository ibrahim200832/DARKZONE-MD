// Group invite flow: on first private contact, the bot proactively asks
// whether the user wants to join the WhatsApp group; the invite link is
// only sent after an explicit "yes". Once someone is in the group, every
// other feature in this repo (anti-link, anti-spam, auto-reply, and the
// bot's own commands) already applies there automatically - nothing extra
// is needed for that part.
//
// The yes/no gating is deliberately handled with plain pattern matching
// instead of asking the free-text AI to decide: sending a real invite link
// is a concrete, consequential action, and a text-completion API isn't a
// reliable or safe place to make that call (it could misread a reply, or
// be talked into it by whatever the user types). lib/aichat.js still
// provides the natural conversational feel for everything else.
const config = require('../config');
const { getMessageText } = require('./text');

const YES_PATTERN = /\b(ja|jep|jup|klar|gerne|sicher|na klar|auf jeden fall|yes|yep|ok|okay)\b/i;
const NO_PATTERN = /\b(nein|nicht interessiert|kein interesse|no|nope|später|vielleicht später)\b/i;
const JOIN_KEYWORDS = /\b(gruppe|beitreten|einladung|invite|gruppenlink)\b/i;

// senderJid -> 'asked' | 'consented' | 'declined'
const state = new Map();

async function sendInviteLink(sock, jid, msg) {
    const link = config.GROUP_INVITE_LINK;
    if (!link) {
        await sock.sendMessage(
            jid,
            { text: 'Der Gruppen-Link wurde vom Bot-Betreiber noch nicht eingerichtet (GROUP_INVITE_LINK in config.env).' },
            { quoted: msg },
        );
        return;
    }
    await sock.sendMessage(jid, { text: `Super! Hier ist der Einladungslink zur Gruppe: ${link}` }, { quoted: msg });
}

async function handleGroupInvite(sock, msg) {
    if (config.GROUP_INVITE_FLOW !== 'true') return false;
    if (!msg.message || msg.key.fromMe) return false;

    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us')) return false; // private chats only

    const text = getMessageText(msg).trim();
    if (!text) return false;

    // An explicit request works at any time, regardless of prior state -
    // including re-asking after having declined earlier.
    if (JOIN_KEYWORDS.test(text)) {
        state.set(jid, 'consented');
        await sendInviteLink(sock, jid, msg);
        return true;
    }

    const current = state.get(jid);

    if (!current) {
        // First-ever private message: ask, instead of answering with the AI.
        state.set(jid, 'asked');
        await sock.sendMessage(
            jid,
            { text: 'Hey! Möchtest du der WhatsApp-Gruppe beitreten? Dort hast du Zugriff auf alle Bot-Funktionen. Antworte einfach mit "ja" oder "nein".' },
            { quoted: msg },
        );
        return true;
    }

    if (current === 'asked') {
        if (YES_PATTERN.test(text)) {
            state.set(jid, 'consented');
            await sendInviteLink(sock, jid, msg);
            return true;
        }
        if (NO_PATTERN.test(text)) {
            state.set(jid, 'declined');
            await sock.sendMessage(
                jid,
                { text: 'Alles klar, kein Problem! Sag einfach Bescheid, falls du es dir anders überlegst.' },
                { quoted: msg },
            );
            return true;
        }
        // Ambiguous reply: leave the question open (don't advance state) and
        // let the normal auto-reply/AI chat handle this turn instead.
        return false;
    }

    // Already consented or declined: stop intercepting.
    return false;
}

module.exports = { handleGroupInvite };
