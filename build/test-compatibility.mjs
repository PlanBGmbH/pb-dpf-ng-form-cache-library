import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const majors = process.argv.slice(2);
if (!majors.length) majors.push('20.0', '20', '21', '22');
if (majors.some((major) => !['20.0', '20', '21', '22'].includes(major))) {
	throw new Error('Supported compatibility targets: 20.0, 20, 21, 22');
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd, capture = false) =>
	execFileSync(command, args, {
		cwd,
		stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
		encoding: 'utf8',
		env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
	});
const writeJson = (directory, file, value) => writeFileSync(join(directory, file), JSON.stringify(value, null, 2));
const workspace = mkdtempSync(join(tmpdir(), 'form-cache-compatibility-'));

try {
	const [packed] = JSON.parse(
		run(npm, ['pack', './dist/ng-form-cache', '--pack-destination', workspace, '--json'], root, true),
	);
	for (const major of majors) {
		const consumer = join(workspace, `angular-${major}`);
		cpSync(join(root, 'tests/compatibility'), consumer, { recursive: true });
		const angularVersion = major === '20.0' ? '~20.0.0' : `^${major}.0.0`;
		const dependencies = Object.fromEntries(
			['common', 'compiler', 'core', 'forms', 'platform-browser'].map((name) => [`@angular/${name}`, angularVersion]),
		);
		writeJson(consumer, 'package.json', {
			name: `form-cache-angular-${major}-consumer`,
			private: true,
			dependencies: {
				...dependencies,
				'@planbgmbh/ng-form-cache': `file:${join(workspace, packed.filename)}`,
				rxjs: major === '20.0' ? '^6.5.3' : '^7.8.0',
				tslib: '^2.3.0',
			},
			devDependencies: {
				esbuild: '^0.25.0',
				'@angular/build': angularVersion,
				'@angular/cli': angularVersion,
				'@angular/compiler-cli': angularVersion,
				typescript: major === '22' ? '~6.0.0' : major === '20.0' ? '~5.8.0' : '~5.9.0',
				'@types/jasmine': '~5.1.0',
				'jasmine-core': '~5.9.0',
				karma: '~6.4.0',
				'karma-chrome-launcher': '~3.2.0',
				'karma-jasmine': '~5.1.0',
				'karma-coverage': '~2.2.0',
				'karma-jasmine-html-reporter': '~2.1.0',
			},
		});
		console.log(`\nChecking Angular ${major} in ${consumer}`);
		run(npm, ['install', '--no-audit', '--no-fund'], consumer);
		console.log(
			`Resolved Angular ${JSON.parse(readFileSync(join(consumer, 'node_modules/@angular/core/package.json'))).version}`,
		);
		const cli = join(consumer, 'node_modules/@angular/cli/bin/ng.js');
		run(process.execPath, [cli, 'build'], consumer);
		// Bundle just like an SSR build: RxJS 6 does not support native Node ESM directory imports.
		run(
			process.execPath,
			[
				'--input-type=module',
				'--eval',
				"import { buildSync } from 'esbuild'; buildSync({ entryPoints: ['server-check.mjs'], bundle: true, platform: 'node', format: 'cjs', outfile: 'server-check.cjs' });",
			],
			consumer,
		);
		run(process.execPath, [join(consumer, 'server-check.cjs')], consumer);
		run(process.execPath, [cli, 'test', '--watch=false', '--browsers=ChromeHeadless'], consumer);
	}
	rmSync(workspace, { recursive: true, force: true });
} catch (error) {
	console.error(`Compatibility workspace retained for diagnosis: ${workspace}`);
	throw error;
}
