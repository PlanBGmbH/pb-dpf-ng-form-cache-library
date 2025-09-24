const fs = require('fs/promises');
const path = require('path');

const PACKAGE_PATH = path.join(__dirname, '..', 'dist', 'ng-form-cache', 'package.json');

async function runUpdate() {
	const data = await fs.readFile(PACKAGE_PATH);
	const packageInfo = JSON.parse(data);
	const index = process.argv.findIndex((a) => a === '--version');
	if (index < 0) {
		console.error('Missing argument --version on script call.');
		throw 'Missing argument --version on script call.';
	}
	const filteredArgs = process.argv.splice(index);

	packageInfo.version = filteredArgs[1];

	console.log('Updating package version to: ', packageInfo.version);

	await fs.writeFile(PACKAGE_PATH, JSON.stringify(packageInfo));
}

runUpdate().catch((e) => {
	console.error(e);
});
