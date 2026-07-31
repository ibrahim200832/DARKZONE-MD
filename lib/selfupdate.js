// Self-update command: "!update" (or "<PREFIX>update") checks the bot's own
// installed git commit against the latest one on GitHub, shows a changelog
// of what's new, then pulls and restarts the process to apply it. Anyone
// who can message the bot can trigger the actual install, not just the
// owner - that's a deliberate choice made explicitly by the bot operator,
// since a self-restarting bot is a meaningful trust decision.
//
// A background watcher (see startUpdateWatcher) can also proactively DM the
// owner when a new commit appears, without installing it automatically.
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const config = require('../config');
const { getMessageText } = require('./text');

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.join(__dirname, '..');

const defaultGit = {
    async getLocalCommit() {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT });
        return stdout.trim();
    },
    async pull() {
        await execFileAsync('git', ['pull', '--ff-only'], { cwd: REPO_ROOT });
    },
};

let updating = false;
let lastNotifiedSha = null;

async function fetchLatestCommit(httpClient, owner, repo, branch) {
    const res = await httpClient.get(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, {
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 10000,
    });
    return { sha: res.data.sha, message: res.data.commit.message.split('\n')[0] };
}

async function fetchChangelog(httpClient, owner, repo, base, head) {
    if (base === head) return [];
    const res = await httpClient.get(`https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`, {
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 10000,
    });
    return (res.data.commits || []).map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0] }));
}

function formatChangelog(commits) {
    if (commits.length === 0) return '';
    const lines = commits.slice(-10).map((c) => `- ${c.sha.slice(0, 7)} ${c.message}`);
    return `\n\nChangelog:\n${lines.join('\n')}`;
}

function readOpts(opts) {
    return {
        git: opts.git || defaultGit,
        httpClient: opts.httpClient || axios,
        owner: opts.repoOwner || config.UPDATE_REPO_OWNER,
        repo: opts.repoName || config.UPDATE_REPO_NAME,
        branch: opts.branch || config.UPDATE_BRANCH,
        exit: opts.exit || ((code) => process.exit(code)),
        restartDelayMs: opts.restartDelayMs ?? 1500,
    };
}

async function handleUpdateCommand(sock, msg, opts = {}) {
    if (config.UPDATE_CHECK_ENABLED !== 'true') return false;
    if (!msg.message || msg.key.fromMe) return false;

    const text = getMessageText(msg).trim().toLowerCase();
    const prefix = (config.PREFIX || '.').toLowerCase();
    if (text !== '!update' && text !== `${prefix}update`) return false;

    const jid = msg.key.remoteJid;
    const { git, httpClient, owner, repo, branch, exit, restartDelayMs } = readOpts(opts);

    if (updating) {
        await sock.sendMessage(jid, { text: '⏳ Es wird gerade schon ein Update installiert, bitte kurz warten.' }, { quoted: msg });
        return true;
    }

    let localSha;
    let latest;
    try {
        localSha = await git.getLocalCommit();
        latest = await fetchLatestCommit(httpClient, owner, repo, branch);
    } catch {
        await sock.sendMessage(
            jid,
            { text: '⚠️ Ich konnte nicht prüfen, ob ein Update verfügbar ist. Versuch es gleich nochmal.' },
            { quoted: msg },
        );
        return true;
    }

    if (localSha === latest.sha) {
        await sock.sendMessage(
            jid,
            { text: `✅ Der Bot ist bereits auf dem neuesten Stand (${localSha.slice(0, 7)}).` },
            { quoted: msg },
        );
        return true;
    }

    const changelog = await fetchChangelog(httpClient, owner, repo, localSha, latest.sha).catch(() => []);

    await sock.sendMessage(
        jid,
        {
            text:
                `🔄 Update verfügbar!\nAktuell: ${localSha.slice(0, 7)}\nNeu: ${latest.sha.slice(0, 7)} (${branch})` +
                formatChangelog(changelog) +
                '\n\nStatus: Noch nicht heruntergeladen. Installiere jetzt...',
        },
        { quoted: msg },
    );

    updating = true;
    try {
        await git.pull();
        await sock.sendMessage(jid, {
            text: `✅ Update erfolgreich installiert (${latest.sha.slice(0, 7)}). Der Bot startet jetzt neu...`,
        });
        setTimeout(() => exit(0), restartDelayMs).unref();
    } catch (err) {
        updating = false;
        await sock.sendMessage(jid, {
            text: `⚠️ Das Update konnte nicht installiert werden: ${String(err.message || err).slice(0, 200)}. Bitte manuell prüfen.`,
        });
    }

    return true;
}

async function checkForUpdateAndNotify(sock, opts = {}) {
    const { git, httpClient, owner, repo, branch } = readOpts(opts);
    const ownerNumber = opts.ownerNumber || config.OWNER_NUMBER;

    try {
        const localSha = await git.getLocalCommit();
        const latest = await fetchLatestCommit(httpClient, owner, repo, branch);
        if (latest.sha === localSha || latest.sha === lastNotifiedSha) return false;

        const changelog = await fetchChangelog(httpClient, owner, repo, localSha, latest.sha).catch(() => []);
        lastNotifiedSha = latest.sha;

        await sock.sendMessage(`${ownerNumber}@s.whatsapp.net`, {
            text:
                `🔔 Ein neues Update ist verfügbar: ${latest.sha.slice(0, 7)} (${branch})` +
                formatChangelog(changelog) +
                '\n\nSchreib "!update" im Chat, um es zu installieren.',
        });
        return true;
    } catch {
        return false; // best-effort background check
    }
}

/// Starts the periodic background check. Returns the interval handle (or
/// null if the feature is disabled) so callers can clearInterval() it.
function startUpdateWatcher(sock, opts = {}) {
    if (config.UPDATE_CHECK_ENABLED !== 'true') return null;
    const intervalMs = (parseInt(config.UPDATE_NOTIFY_INTERVAL_MINUTES, 10) || 60) * 60 * 1000;
    const handle = setInterval(() => {
        checkForUpdateAndNotify(sock, opts).catch(() => {});
    }, intervalMs);
    handle.unref();
    return handle;
}

/// Test-only: resets the module's in-memory state (whether an update is
/// currently installing, and which commit was last notified about) so
/// tests don't leak state into each other via this shared module.
function _resetStateForTests() {
    updating = false;
    lastNotifiedSha = null;
}

module.exports = { handleUpdateCommand, checkForUpdateAndNotify, startUpdateWatcher, _resetStateForTests };
