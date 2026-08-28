'use strict';

class MegaApi {
	constructor() {
		this.name = 'megaApi';
		this.displayName = 'MEGA Account';
		this.documentationUrl = 'https://mega.js.org/';
		this.properties = [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'name@example.com',
				description: 'The email address of the MEGA account',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description: 'The password of the MEGA account',
			},
			{
				displayName: 'Two-Factor Secret',
				name: 'totpSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'Optional. The base32 TOTP secret shown when you enabled 2FA on this MEGA account (e.g. JBSWY3DPEHPK3PXP). Leave empty if the account has no 2FA. A fresh 6-digit code is generated automatically on every execution, so it never expires.',
			},
		];
	}
}

module.exports = { MegaApi };
