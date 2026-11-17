# Failing

Showcases whose recording fails.

Standard error:

```mjs showcase=node-run
console.log('before');
console.error('oops');
```

A non-zero exit code:

```mjs showcase=node-run
process.exitCode = 3;
```

An uncaught exception:

```mjs showcase=node-run
throw new Error('boom');
```

The time limit:

```mjs showcase=node-run
console.log('waiting');
setInterval(() => {}, 1000);
```

A syntax error, which fails its build:

```mjs showcase=node-run
console.log('unclosed';
```
