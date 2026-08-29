'use strict';

const {
	megaLogin,
	megaClose,
	resolveFolder,
	resolveFile,
	nodePath,
	nodeToJson,
	deleteNode,
	linkNode,
	collectChildren,
	splitPath,
	openPublicLink,
	findInShare,
	downloadNode,
} = require('./GenericFunctions');

class Mega {
	constructor() {
		this.description = {
			displayName: 'MEGA',
			name: 'mega',
			icon: 'file:mega.svg',
			group: ['transform'],
			version: 1,
			subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
			description: 'Upload, download and manage files on MEGA cloud storage',
			defaults: { name: 'MEGA' },
			inputs: ['main'],
			outputs: ['main'],
			usableAsTool: true,
			credentials: [
				{
					name: 'megaApi',
					required: true,
					displayOptions: {
						show: { authentication: ['credentials'] },
						// Share links carry their own key, so no account is involved.
						hide: { resource: ['sharedLink'] },
					},
				},
			],
			properties: [
				/* ---------------- authentication ---------------- */
				{
					displayName: 'Authentication',
					name: 'authentication',
					type: 'options',
					options: [
						{
							name: 'Stored Credential',
							value: 'credentials',
							description: 'Use a MEGA Account credential configured in n8n',
						},
						{
							name: 'From Input Data',
							value: 'inputFields',
							description:
								'Take email and password from fields below, which can be expressions. Use this to loop over many MEGA accounts in one workflow.',
						},
					],
					default: 'credentials',
					displayOptions: { hide: { resource: ['sharedLink'] } },
				},
				{
					displayName: 'Email',
					name: 'email',
					type: 'string',
					default: '',
					required: true,
					placeholder: '={{ $json.email }}',
					displayOptions: {
						show: { authentication: ['inputFields'] },
						hide: { resource: ['sharedLink'] },
					},
				},
				{
					displayName: 'Password',
					name: 'password',
					type: 'string',
					typeOptions: { password: true },
					default: '',
					required: true,
					placeholder: '={{ $json.password }}',
					displayOptions: {
						show: { authentication: ['inputFields'] },
						hide: { resource: ['sharedLink'] },
					},
				},
				{
					displayName: 'Two-Factor Secret',
					name: 'totpSecret',
					type: 'string',
					typeOptions: { password: true },
					default: '',
					description: 'Optional base32 TOTP secret. Leave empty if the account has no 2FA.',
					displayOptions: {
						show: { authentication: ['inputFields'] },
						hide: { resource: ['sharedLink'] },
					},
				},

				/* ---------------- resource ---------------- */
				{
					displayName: 'Resource',
					name: 'resource',
					type: 'options',
					noDataExpression: true,
					options: [
						{ name: 'File', value: 'file' },
						{ name: 'Folder', value: 'folder' },
						{ name: 'Shared Link', value: 'sharedLink' },
						{ name: 'Account', value: 'account' },
					],
					default: 'file',
				},

				/* ---------------- shared link operations ---------------- */
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['sharedLink'] } },
					options: [
						{
							name: 'List',
							value: 'list',
							action: 'List a shared folder',
							description: 'List the files inside a folder someone shared with you',
						},
						{
							name: 'Download All',
							value: 'downloadAll',
							action: 'Download a shared folder',
							description:
								'Download every file in a shared folder, one output item per file',
						},
						{
							name: 'Download',
							value: 'download',
							action: 'Download from a shared link',
							description: 'Download a single shared file, or one file from inside a shared folder',
						},
					],
					default: 'list',
				},
				{
					displayName: 'Share Link',
					name: 'linkUrl',
					type: 'string',
					default: '',
					required: true,
					placeholder: 'https://mega.nz/folder/AbCdEfGh#TheDecryptionKey',
					displayOptions: { show: { resource: ['sharedLink'] } },
					description:
						'The full MEGA link including the key after the #. Folder and file links are both accepted, old #F! style links too. No credential is needed.',
				},
				{
					displayName: 'Path Inside Folder',
					name: 'sharedFilePath',
					type: 'string',
					default: '',
					placeholder: '/subfolder/report.pdf',
					displayOptions: { show: { resource: ['sharedLink'], operation: ['download'] } },
					description:
						'Only needed when the link points at a folder. Leave empty when the link points directly at a file.',
				},
				{
					displayName: 'Put Output File in Field',
					name: 'outputBinaryField',
					type: 'string',
					default: 'data',
					required: true,
					displayOptions: {
						show: { resource: ['sharedLink'], operation: ['download', 'downloadAll'] },
					},
				},
				{
					displayName: 'Options',
					name: 'shareOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: { resource: ['sharedLink'], operation: ['list', 'downloadAll'] },
					},
					options: [
						{
							displayName: 'Include Subfolders',
							name: 'recursive',
							type: 'boolean',
							default: true,
							description: 'Whether to descend into subfolders of the shared folder',
						},
						{
							displayName: 'Limit',
							name: 'limit',
							type: 'number',
							typeOptions: { minValue: 1 },
							default: 100,
							description: 'Max number of files to return',
						},
						{
							displayName: 'Name Filter',
							name: 'nameFilter',
							type: 'string',
							default: '',
							placeholder: '.pdf',
							description:
								'Only include files whose name contains this text, case insensitive. Leave empty for all files.',
						},
					],
				},

				/* ---------------- file operations ---------------- */
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['file'] } },
					options: [
						{ name: 'Upload', value: 'upload', action: 'Upload a file', description: 'Upload binary data to MEGA' },
						{ name: 'Download', value: 'download', action: 'Download a file', description: 'Download a file from MEGA as binary data' },
						{ name: 'Delete', value: 'delete', action: 'Delete a file', description: 'Move a file to the rubbish bin or erase it' },
						{ name: 'Get Share Link', value: 'getLink', action: 'Get a share link for a file', description: 'Create a public MEGA link' },
						{ name: 'List', value: 'list', action: 'List files', description: 'List the files inside a folder' },
						{ name: 'Search', value: 'search', action: 'Search files', description: 'Find files by name anywhere in the account' },
					],
					default: 'upload',
				},

				/* ---------------- folder operations ---------------- */
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['folder'] } },
					options: [
						{ name: 'Create', value: 'create', action: 'Create a folder', description: 'Create a folder, including any missing parents' },
						{ name: 'Delete', value: 'delete', action: 'Delete a folder', description: 'Move a folder to the rubbish bin or erase it' },
						{ name: 'List', value: 'list', action: 'List folder contents', description: 'List the items inside a folder' },
						{ name: 'Get Share Link', value: 'getLink', action: 'Get a share link for a folder' },
					],
					default: 'create',
				},

				/* ---------------- account operations ---------------- */
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: ['account'] } },
					options: [
						{
							name: 'Get Info',
							value: 'getInfo',
							action: 'Get account info',
							description: 'Return storage quota and usage. Handy for testing that a credential works.',
						},
					],
					default: 'getInfo',
				},

				/* ---------------- upload fields ---------------- */
				{
					displayName: 'Input Binary Field',
					name: 'binaryPropertyName',
					type: 'string',
					default: 'data',
					required: true,
					displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
					description: 'The name of the input field holding the file to upload',
				},
				{
					displayName: 'Destination Folder',
					name: 'folderPath',
					type: 'string',
					default: '/',
					placeholder: '/invoices/2026',
					required: true,
					displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
					description: 'Folder path in the MEGA account. Use / for the root of the Cloud Drive.',
				},
				{
					displayName: 'File Name',
					name: 'fileName',
					type: 'string',
					default: '',
					placeholder: 'Leave empty to use the binary file name',
					displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
				},
				{
					displayName: 'Options',
					name: 'uploadOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
					options: [
						{
							displayName: 'Create Missing Folders',
							name: 'createParents',
							type: 'boolean',
							default: true,
							description: 'Whether to create the destination folder if it does not exist yet',
						},
						{
							displayName: 'Return Share Link',
							name: 'returnLink',
							type: 'boolean',
							default: false,
							description: 'Whether to create a public link for the uploaded file and return it',
						},
						{
							displayName: 'Upload Connections',
							name: 'maxConnections',
							type: 'number',
							default: 4,
							description: 'Number of parallel connections used for the upload',
						},
					],
				},

				/* ---------------- file path fields ---------------- */
				{
					displayName: 'File Path',
					name: 'filePath',
					type: 'string',
					default: '',
					required: true,
					placeholder: '/invoices/2026/january.pdf',
					displayOptions: {
						show: { resource: ['file'], operation: ['download', 'delete', 'getLink'] },
					},
					description: 'Full path of the file inside the MEGA account',
				},
				{
					displayName: 'Put Output File in Field',
					name: 'outputBinaryField',
					type: 'string',
					default: 'data',
					required: true,
					displayOptions: { show: { resource: ['file'], operation: ['download'] } },
				},

				/* ---------------- folder path fields ---------------- */
				{
					displayName: 'Folder Path',
					name: 'folderPath',
					type: 'string',
					default: '/',
					required: true,
					placeholder: '/invoices/2026',
					displayOptions: {
						show: {
							resource: ['folder', 'file'],
							operation: ['create', 'delete', 'list', 'getLink'],
						},
					},
					description: 'Folder path inside the MEGA account. Use / for the root of the Cloud Drive.',
				},

				/* ---------------- search ---------------- */
				{
					displayName: 'Search Term',
					name: 'searchTerm',
					type: 'string',
					default: '',
					required: true,
					placeholder: 'invoice',
					displayOptions: { show: { resource: ['file'], operation: ['search'] } },
					description: 'Matches any file whose name contains this text (case-insensitive)',
				},

				/* ---------------- shared options ---------------- */
				{
					displayName: 'Options',
					name: 'listOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: { resource: ['file', 'folder'], operation: ['list', 'search'] },
					},
					options: [
						{
							displayName: 'Include Subfolders',
							name: 'recursive',
							type: 'boolean',
							default: false,
							description: 'Whether to descend into subfolders',
						},
						{
							displayName: 'Limit',
							name: 'limit',
							type: 'number',
							typeOptions: { minValue: 1 },
							default: 100,
							description: 'Max number of results to return',
						},
					],
				},
				{
					displayName: 'Options',
					name: 'deleteOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: { resource: ['file', 'folder'], operation: ['delete'] },
					},
					options: [
						{
							displayName: 'Delete Permanently',
							name: 'permanent',
							type: 'boolean',
							default: false,
							description:
								'Whether to erase the item immediately instead of moving it to the rubbish bin. This cannot be undone.',
						},
					],
				},
				{
					displayName: 'Options',
					name: 'linkOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: { resource: ['file', 'folder'], operation: ['getLink'] },
					},
					options: [
						{
							displayName: 'Omit Decryption Key',
							name: 'noKey',
							type: 'boolean',
							default: false,
							description:
								'Whether to return the link without the decryption key. The recipient then needs the key separately.',
						},
					],
				},
			],
		};
	}

	async execute() {
		const items = this.getInputData();
		const returnData = [];

		// One login per distinct account for the whole execution, not per item.
		const sessions = new Map();

		const getStorage = async (itemIndex) => {
			const authentication = this.getNodeParameter('authentication', itemIndex, 'credentials');
			let creds;
			if (authentication === 'inputFields') {
				creds = {
					email: this.getNodeParameter('email', itemIndex),
					password: this.getNodeParameter('password', itemIndex),
					totpSecret: this.getNodeParameter('totpSecret', itemIndex, ''),
				};
			} else {
				creds = await this.getCredentials('megaApi', itemIndex);
			}

			const key = String(creds.email || '').toLowerCase();
			if (!sessions.has(key)) {
				sessions.set(key, await megaLogin(creds));
			}
			return sessions.get(key);
		};

		try {
			for (let i = 0; i < items.length; i++) {
				const resource = this.getNodeParameter('resource', i);
				const operation = this.getNodeParameter('operation', i);

				try {
					let output;

					/* ------------------------- SHARED LINK ------------------------- *
					 * A public link carries its own decryption key, so this branch
					 * never logs in and never touches a credential.
					 * --------------------------------------------------------------- */
					if (resource === 'sharedLink') {
						const linkUrl = this.getNodeParameter('linkUrl', i);
						const opts = this.getNodeParameter('shareOptions', i, {});
						const root = await openPublicLink(linkUrl);

						if (operation === 'download') {
							const sharedFilePath = this.getNodeParameter('sharedFilePath', i, '');
							const outputBinaryField = this.getNodeParameter('outputBinaryField', i);
							const target = findInShare(root, sharedFilePath);
							if (target.directory) {
								throw new Error(
									`"${target.name}" is a folder, not a file. Set Path Inside Folder to a file, or use the Download All operation.`,
								);
							}
							const buffer = await downloadNode(target);
							returnData.push({
								json: { ...nodeToJson(target), sourceLink: linkUrl },
								binary: {
									[outputBinaryField]: await this.helpers.prepareBinaryData(
										buffer,
										target.name,
									),
								},
								pairedItem: { item: i },
							});
							continue;
						}

						// List and Download All work from the same file set.
						const limit = opts.limit || 100;
						const nameFilter = String(opts.nameFilter || '').toLowerCase();
						let files = root.directory
							? collectChildren(root, opts.recursive !== false).filter((n) => !n.directory)
							: [root];
						if (nameFilter !== '') {
							files = files.filter((f) =>
								String(f.name || '').toLowerCase().includes(nameFilter),
							);
						}
						files = files.slice(0, limit);

						if (operation === 'list') {
							for (const f of files) {
								returnData.push({
									json: { ...nodeToJson(f), sourceLink: linkUrl },
									pairedItem: { item: i },
								});
							}
							continue;
						}

						const outputBinaryField = this.getNodeParameter('outputBinaryField', i);
						for (const f of files) {
							const buffer = await downloadNode(f);
							returnData.push({
								json: { ...nodeToJson(f), sourceLink: linkUrl },
								binary: {
									[outputBinaryField]: await this.helpers.prepareBinaryData(buffer, f.name),
								},
								pairedItem: { item: i },
							});
						}
						continue;
					}

					const storage = await getStorage(i);

					/* ------------------------- FILE ------------------------- */
					if (resource === 'file' && operation === 'upload') {
						const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i);
						const folderPath = this.getNodeParameter('folderPath', i);
						const explicitName = this.getNodeParameter('fileName', i, '');
						const opts = this.getNodeParameter('uploadOptions', i, {});

						const binary = this.helpers.assertBinaryData(i, binaryPropertyName);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
						const name = explicitName || binary.fileName || 'file';

						const folder = await resolveFolder(
							storage,
							folderPath,
							opts.createParents !== false,
						);

						const uploaded = await folder.upload(
							{
								name,
								size: buffer.length,
								maxConnections: opts.maxConnections || 4,
							},
							buffer,
						).complete;

						output = nodeToJson(uploaded);
						if (opts.returnLink) {
							output.link = await linkNode(uploaded, false);
						}
					} else if (resource === 'file' && operation === 'download') {
						const filePath = this.getNodeParameter('filePath', i);
						const outputBinaryField = this.getNodeParameter('outputBinaryField', i);
						const file = await resolveFile(storage, filePath);
						const buffer = await file.downloadBuffer({});

						const binaryData = await this.helpers.prepareBinaryData(buffer, file.name);
						returnData.push({
							json: nodeToJson(file),
							binary: { [outputBinaryField]: binaryData },
							pairedItem: { item: i },
						});
						continue;
					} else if (resource === 'file' && operation === 'delete') {
						const filePath = this.getNodeParameter('filePath', i);
						const opts = this.getNodeParameter('deleteOptions', i, {});
						const file = await resolveFile(storage, filePath);
						const info = nodeToJson(file);
						await deleteNode(file, opts.permanent);
						output = { ...info, deleted: true, permanent: Boolean(opts.permanent) };
					} else if (resource === 'file' && operation === 'getLink') {
						const filePath = this.getNodeParameter('filePath', i);
						const opts = this.getNodeParameter('linkOptions', i, {});
						const file = await resolveFile(storage, filePath);
						output = { ...nodeToJson(file), link: await linkNode(file, opts.noKey) };
					} else if (resource === 'file' && operation === 'search') {
						const searchTerm = String(this.getNodeParameter('searchTerm', i)).toLowerCase();
						const opts = this.getNodeParameter('listOptions', i, {});
						const limit = opts.limit || 100;
						const matches = collectChildren(storage.root, true)
							.filter((n) => !n.directory && String(n.name || '').toLowerCase().includes(searchTerm))
							.slice(0, limit);
						for (const match of matches) {
							returnData.push({ json: nodeToJson(match), pairedItem: { item: i } });
						}
						continue;
					}

					/* ------------------------- LIST (file + folder) ------------------------- */
					else if (operation === 'list') {
						const folderPath = this.getNodeParameter('folderPath', i, '/');
						const opts = this.getNodeParameter('listOptions', i, {});
						const limit = opts.limit || 100;
						const folder = await resolveFolder(storage, folderPath, false);
						let children = collectChildren(folder, Boolean(opts.recursive));

						// The File resource lists files; the Folder resource lists everything.
						if (resource === 'file') children = children.filter((c) => !c.directory);

						for (const child of children.slice(0, limit)) {
							returnData.push({ json: nodeToJson(child), pairedItem: { item: i } });
						}
						continue;
					}

					/* ------------------------- FOLDER ------------------------- */
					else if (resource === 'folder' && operation === 'create') {
						const folderPath = this.getNodeParameter('folderPath', i);
						if (splitPath(folderPath).length === 0) {
							throw new Error('Cannot create the root folder - give a path such as /invoices/2026');
						}
						const folder = await resolveFolder(storage, folderPath, true);
						output = { ...nodeToJson(folder), created: true };
					} else if (resource === 'folder' && operation === 'delete') {
						const folderPath = this.getNodeParameter('folderPath', i);
						const opts = this.getNodeParameter('deleteOptions', i, {});
						if (splitPath(folderPath).length === 0) {
							throw new Error('Refusing to delete the root of the Cloud Drive');
						}
						const folder = await resolveFolder(storage, folderPath, false);
						const info = nodeToJson(folder);
						await deleteNode(folder, opts.permanent);
						output = { ...info, deleted: true, permanent: Boolean(opts.permanent) };
					} else if (resource === 'folder' && operation === 'getLink') {
						const folderPath = this.getNodeParameter('folderPath', i);
						const opts = this.getNodeParameter('linkOptions', i, {});
						const folder = await resolveFolder(storage, folderPath, false);
						output = { ...nodeToJson(folder), link: await linkNode(folder, opts.noKey) };
					}

					/* ------------------------- ACCOUNT ------------------------- */
					else if (resource === 'account' && operation === 'getInfo') {
						const info = await storage.getAccountInfo();
						output = {
							email: storage.email || storage.user,
							name: storage.name,
							spaceUsed: info.spaceUsed,
							spaceTotal: info.spaceTotal,
							spaceFreeBytes: Math.max(0, (info.spaceTotal || 0) - (info.spaceUsed || 0)),
							percentUsed: info.spaceTotal
								? Math.round((info.spaceUsed / info.spaceTotal) * 10000) / 100
								: null,
							downloadBandwidthUsed: info.downloadBandwidthUsed,
							downloadBandwidthTotal: info.downloadBandwidthTotal,
						};
					} else {
						throw new Error(`The operation "${operation}" is not supported for "${resource}"`);
					}

					returnData.push({ json: output, pairedItem: { item: i } });
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: { error: (error && error.message) || String(error) },
							pairedItem: { item: i },
						});
						continue;
					}
					throw error;
				}
			}
		} finally {
			for (const storage of sessions.values()) {
				await megaClose(storage);
			}
		}

		return [returnData];
	}
}

module.exports = { Mega };
