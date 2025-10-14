import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
	title: 'NG Form Cache Library',
	tagline: 'Make storing form data easy',
	favicon: 'img/logo.png',

	// Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
	future: {
		v4: true, // Improve compatibility with the upcoming Docusaurus v4
		experimental_faster: {
			rspackBundler: true, // required flag
			rspackPersistentCache: true, // new flag
		},
	},

	// Set the production url of your site here
	url: 'https://planbgmbh.github.io',
	// Set the /<baseUrl>/ pathname under which your site is served
	// For GitHub pages deployment, it is often '/<projectName>/'
	baseUrl: '/pb-dpf-ng-form-cache-library/',

	// GitHub pages deployment config.
	// If you aren't using GitHub pages, you don't need these.
	organizationName: 'PlanBGmbH', // Usually your GitHub org/user name.
	projectName: 'pb-dpf-ng-form-cache-library', // Usually your repo name.

	onBrokenLinks: 'throw',

	// Even if you don't use internationalization, you can use this field to set
	// useful metadata like html lang. For example, if your site is Chinese, you
	// may want to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
	},

	markdown: {
		hooks: {
			onBrokenMarkdownLinks: 'warn',
		},
	},

	presets: [
		[
			'classic',
			{
				docs: {
					sidebarPath: './sidebars.ts',
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
					// editUrl: 'https://github.com/PlanBGmbH/pb-dpf-ng-form-cache-library/tree/main/packages/create-docusaurus/templates/shared/',
				},
				blog: {
					showReadingTime: true,
					feedOptions: {
						type: ['rss', 'atom'],
						xslt: true,
					},
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
					// editUrl: 'https://github.com/PlanBGmbH/pb-dpf-ng-form-cache-library/tree/main/packages/create-docusaurus/templates/shared/',
					// Useful options to enforce blogging best practices
					onInlineTags: 'warn',
					onInlineAuthors: 'warn',
					onUntruncatedBlogPosts: 'warn',
				},
				theme: {
					customCss: './src/css/custom.css',
				},
			} satisfies Preset.Options,
		],
	],

	themeConfig: {
		// Replace with your project's social card
		image: 'img/docusaurus-social-card.jpg',
		navbar: {
			title: 'Form Cache Library',
			logo: {
				alt: 'Logo NG Form Cache Library',
				src: 'img/logo.png',
			},
			items: [
				{
					type: 'docSidebar',
					sidebarId: 'tutorialSidebar',
					position: 'left',
					label: 'Documentation',
				},
				{
					href: 'https://github.com/PlanBGmbH/pb-dpf-ng-form-cache-library',
					label: 'GitHub',
					position: 'right',
				},
			],
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'Docs',
					items: [
						{
							label: 'Documentation',
							to: '/docs/category/getting-started',
						},
					],
				},
				{
					title: 'Further Links',
					items: [
						{
							label: 'PlanB. GmbH',
							href: 'https://planb.net',
						},
						{
							label: 'Aaron Czichon',
							href: 'https://aaronczichon.de',
						},
					],
				},
			],
			copyright: `Copyright © ${new Date().getFullYear()} PlanB. GmbH, Aaron Czichon.`,
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula,
		},
	} satisfies Preset.ThemeConfig,
};

export default config;
