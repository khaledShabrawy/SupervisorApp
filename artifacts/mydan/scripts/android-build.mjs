import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const android = path.join(app, 'android');
const require = createRequire(import.meta.url);
const command = process.argv[2];
const commands = ['doctor', 'prepare', 'debug', 'release', 'bundle'];
function run(binary, args, cwd = app) {
  const result = spawnSync(binary, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw new Error(`Cannot run ${path.basename(binary)}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${path.basename(binary)} exited with ${result.status ?? 'a signal'}`);
}
function packageCli(name, binaryName) {
  const manifest = require.resolve(`${name}/package.json`);
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  const binary = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[binaryName];
  if (!binary) throw new Error(`Missing ${binaryName}; run pnpm install --frozen-lockfile.`);
  return path.resolve(path.dirname(manifest), binary);
}
function sdkPath() {
  if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const properties = path.join(android, 'local.properties');
  if (!existsSync(properties)) return null;
  const match = readFileSync(properties, 'utf8').match(/^sdk\.dir\s*=\s*(.+)$/m);
  return match?.[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\') ?? null;
}
function doctor() {
  const errors = [];
  const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac') : 'javac';
  const compiler = spawnSync(javac, ['-version'], { encoding: 'utf8' });
  const version = `${compiler.stdout ?? ''} ${compiler.stderr ?? ''}`.match(/javac\s+(\d+)/);
  if (compiler.error || compiler.status !== 0 || !version || Number(version[1]) !== 21) errors.push('Install a full JDK 21 (java and javac), and set JAVA_HOME. A JRE alone is insufficient.');
  const sdk = sdkPath();
  if (!sdk) errors.push('Set ANDROID_HOME or ANDROID_SDK_ROOT to an Android SDK, or configure android/local.properties.');
  else {
    if (!existsSync(path.join(sdk, 'platforms', 'android-35', 'android.jar'))) errors.push('Install Android SDK Platform 35.');
    if (!existsSync(path.join(sdk, 'build-tools', '34.0.0'))) errors.push('Install Android SDK Build-Tools 34.0.0.');
  }
  for (const file of ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar']) if (!existsSync(path.join(android, file))) errors.push(`Missing Android wrapper file: ${file}`);
  if (errors.length) throw new Error(`Android build prerequisites are incomplete:\n- ${errors.join('\n- ')}\nSee docs/mydan-android-launch-plan.md. No APK was built.`);
  console.log('Android prerequisites found: JDK 21, Platform 35 and Build-Tools 34.0.0.');
}
function sanitizeAssets() {
  const publicDir = path.join(android, 'app/src/main/assets/public');
  const skip = new Set(['_headers', '_redirects', 'landing.html', 'sitemap.xml', 'robots.txt', 'sw.js', 'sw.mjs', 'registerSW.js']);
  let removed = 0;
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(apk|aab)$/i.test(entry.name) || skip.has(entry.name) || /^workbox-.*\.js$/.test(entry.name)) { rmSync(file); removed++; }
      else if (/\.(jks|keystore)$/i.test(entry.name) || /^\.env/.test(entry.name)) throw new Error('Unexpected credential material in generated Android public assets. Review the public source folder.');
    }
  }
  walk(publicDir);
  console.log(`Prepared Android assets; removed ${removed} web-only/binary files from generated copies.`);
}
function prepare() {
  run(process.execPath, [packageCli('vite', 'vite'), 'build', '--mode', 'android']);
  run(process.execPath, [packageCli('@capacitor/cli', 'cap'), 'sync', 'android']);
  sanitizeAssets();
}
try {
  if (!commands.includes(command) || process.argv.length !== 3) throw new Error(`Usage: android-build.mjs ${commands.join('|')}`);
  if (command === 'doctor') doctor();
  else if (command === 'prepare') prepare();
  else {
    doctor();
    if (command !== 'debug' && !existsSync(path.join(android, 'keystore.properties'))) throw new Error('Release signing is not configured. Use the existing owner-controlled signing key and android/keystore.properties. Do not generate a replacement key for an installed app.');
    prepare();
    const task = command === 'debug' ? 'assembleDebug' : command === 'release' ? 'assembleRelease' : 'bundleRelease';
    if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat', task, '--no-daemon'], android);
    else run('sh', ['./gradlew', task, '--no-daemon'], android);
    const output = command === 'bundle' ? 'app/build/outputs/bundle/release/app-release.aab' : `app/build/outputs/apk/${command}/app-${command}.apk`;
    if (!existsSync(path.join(android, output))) throw new Error('Gradle finished without the expected output file. No APK/AAB success was confirmed.');
    console.log(`Built locally: ${path.join(android, output)}`);
  }
} catch (error) {
  console.error(`[MYDAN ANDROID] ${error instanceof Error ? error.message : 'Build failed'}`);
  process.exitCode = 1;
}
