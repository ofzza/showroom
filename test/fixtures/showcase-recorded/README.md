# Recorded

Showcases recorded by the `node-run` custom showcase adapter, which pass.

Its environment, and the host copy:

```mjs showcase=node-run
import { existsSync } from 'node:fs';
console.log('hello');
console.log(`cwd ${process.cwd()}`);
console.log(`tmp ${process.env.TMPDIR}`);
console.log(`data ${process.env.XDG_DATA_HOME}`);
console.log(`own ${process.env.NODE_RUN_OWN}`);
console.log(`secret ${process.env.SHOWROOM_TEST_SECRET ?? 'none'}`);
console.log(`home ${process.env.HOME === undefined ? 'unset' : 'set'}`);
console.log(`ignored ${existsSync('ignored/secret.txt')}`);
console.log(`virtual ${existsSync('README.showcase-1.mjs')}`);
```

Its standard input, closed:

```mjs showcase=node-run
process.stdin.on('data', () => console.log('read something')).on('end', () => console.log('stdin closed'));
```

A [linked one](./scripts/linked.mjs 'showcase=node-run'), and a child outliving it:

```mjs showcase=node-run
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
child.unref();
console.log(`child ${child.pid}`);
```

More lines than are kept, and a long one:

```mjs showcase=node-run
for (let line = 1; line <= 300; line++) console.log(`line ${line}`);
console.log('x'.repeat(20000));
```

More output than is kept:

```mjs showcase=node-run
process.stdout.write(`${'y'.repeat(2 * 1024 * 1024)}\n`);
console.log('after');
```
