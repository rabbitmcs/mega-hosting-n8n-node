'use strict';

const crypto = require('crypto');
const { Storage } = require('megajs');

const USER_AGENT = 'n8n-nodes-mega-multi/1.0.0';

/* ------------------------------------------------------------------ *
 *  TOTP (RFC 6238) - so credentials can hold a 2FA secret rather than
 *  a 6-digit code that expires 30 seconds later.
 * ------------------------------------------------------------------ */

function base32Decode(input) {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	const clean = String(input).toUpperCase().replace(/[^A-Z2-7]/g, '');
	let bits = 0;
	let value = 0;
	const out = [];
	for (const char of clean) {
		const idx = alphabet.indexOf(char);
		if (idx === -1) continue;
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

function generateTotp(secret, digits = 6, step = 30) {
	const key = base32Decode(secret);
	if (key.length === 0) {
		throw new Error('The two-factor secret is not valid base32');
	}
	const counter = Math.floor(Date.now() / 1000 / step);
	const buf = Buffer.alloc(8);
	buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
	buf.writeUInt32BE(counter >>> 0, 4);
	const hmac = crypto.createHmac('sha1', key).update(buf).digest();
	const offset = hmac[hmac.length - 1] & 0x0f;
	const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
	return String(code).padStart(digits, '0');
}

/* ------------------------------------------------------------------ *
 *  Login
 * ------------------------------------------------------------------ */

/**
 * Logs into MEGA with the given credential object and returns a ready
 * Storage instance. Each call is an independent session, which is what
 * makes many accounts in one workflow possible.
 */
async function megaLogin(credentials) {
	const options = {
		email: credentials.email,
		password: credentials.password,
		userAgent: USER_AGENT,
		keepalive: false,
		autoload: true,
	};

	if (credentials.totpSecret && String(credentials.totpSecret).trim() !== '') {
		options.secondFactorCode = generateTotp(String(credentials.totpSecret).trim());
	}

	try {
		return await new Storage(options).ready;
	} catch (error) {
		const message = (error && error.message) || String(error);
		if (/ENOENT|EACCES/.test(message)) throw error;
		throw new Error(`MEGA login failed for ${credentials.email}: ${message}`);
	}
}

async function megaClose(storage) {
	if (!storage) return;
	try {
		await new Promise((resolve) => {
			try {
				storage.close(() => resolve());
			} catch (e) {
				resolve();
			}
			setTimeout(resolve, 5000);
		});
	} catch (e) {
		/* closing is best effort */
	}
}

/* ------------------------------------------------------------------ *
 *  Path helpers
 * ------------------------------------------------------------------ */

function splitPath(path) {
	return String(path || '')
		.replace(/\\/g, '/')
		.split('/')
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.filter((s, i) => !(i === 0 && (s === 'Root' || s === 'Cloud Drive')));
}

/**
 * Walks a slash-separated path down from the account root and returns the
 * folder node. Creates missing segments when `create` is true.
 */
async function resolveFolder(storage, path, create = false) {
	let node = storage.root;
	for (const segment of splitPath(path)) {
		const children = node.children || [];
		let next = children.find((c) => c.directory && c.name === segment);
		if (!next) {
			if (!create) {
				throw new Error(`Folder not found in MEGA: "${segment}" (while resolving "${path}")`);
			}
			next = await node.mkdir(segment);
		}
		node = next;
	}
	return node;
}

/**
 * Resolves a full file path (e.g. /invoices/2026/jan.pdf) to a file node.
 */
async function resolveFile(storage, path) {
	const parts = splitPath(path);
	if (parts.length === 0) {
		throw new Error('A file path is required');
	}
	const fileName = parts.pop();
	const folder = await resolveFolder(storage, parts.join('/'), false);
	const match = (folder.children || []).find((c) => !c.directory && c.name === fileName);
	if (!match) {
		throw new Error(`File not found in MEGA: "${fileName}" (in "/${parts.join('/')}")`);
	}
	return match;
}

/** Full path of a node, from the account root. */
function nodePath(node) {
	const segments = [];
	let current = node;
	while (current && current.parent) {
		segments.unshift(current.name);
		current = current.parent;
	}
	return '/' + segments.join('/');
}

function nodeToJson(node) {
	return {
		nodeId: node.nodeId,
		name: node.name,
		path: nodePath(node),
		isFolder: Boolean(node.directory),
		size: node.directory ? undefined : node.size,
		createdAt: node.timestamp ? new Date(node.timestamp * 1000).toISOString() : undefined,
	};
}

/** Promisified delete - megajs uses a callback here, not a promise. */
function deleteNode(node, permanent) {
	return new Promise((resolve, reject) => {
		node.delete(Boolean(permanent), (err) => (err ? reject(err) : resolve()));
	});
}

/** Promisified public link. */
function linkNode(node, noKey) {
	return new Promise((resolve, reject) => {
		node.link({ noKey: Boolean(noKey) }, (err, url) => (err ? reject(err) : resolve(url)));
	});
}

/** Recursively collect descendants of a folder. */
function collectChildren(folder, recursive, acc = []) {
	for (const child of folder.children || []) {
		acc.push(child);
		if (recursive && child.directory) collectChildren(child, true, acc);
	}
	return acc;
}

module.exports = {
	generateTotp,
	megaLogin,
	megaClose,
	splitPath,
	resolveFolder,
	resolveFile,
	nodePath,
	nodeToJson,
	deleteNode,
	linkNode,
	collectChildren,
};
