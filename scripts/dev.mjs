// `npm run dev` from the repository root: the backend and the web client
// together, in one terminal, each line prefixed with where it came from.
// Ctrl+C stops both; if either one exits, the other is stopped too.
import { spawn } from 'node:child_process';

const parts = [
  { name: 'backend', dir: 'backend', colour: 36 },
  { name: 'frontend', dir: 'frontend', colour: 35 },
];

const children = parts.map(({ name, dir, colour }) => {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: new URL(`../${dir}/`, import.meta.url),
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const label = `\x1b[${colour}m${name.padEnd(8)}\x1b[0m │ `;
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(label + line + '\n');
    });
  }
  child.on('exit', (code) => {
    process.stdout.write(`${label}exited (${code ?? 'signal'})\n`);
    stopAll();
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGINT');
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
