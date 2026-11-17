// A custom showcase adapter recording .mjs showcases: it checks each one's syntax with Node.js in the host copy (a build step), then runs it, from its
// documentation file's folder, under a short time limit (PLAN-P20 D770); it leaves "ignored/" out of the host copy
import { posix } from 'node:path';

export default () => ({
  recorded: true,
  defaultViews: ['source', 'console'],
  hostCopy: { exclude: ['ignored/'], git: false },
  // The host check is given the configured project and stack (PLAN-P20 D790 C20)
  check: (_root, showcases, { project, stack }) => ({ errors: [], warnings: [`${showcases.length} showcases, stack ${stack}, project ${project ?? 'none'}`] }),
  validate: (showcase) => (showcase.entry.endsWith('.mjs') ? { options: showcase.options, errors: [] } : { errors: ['node-run runs .mjs files'] }),
  build: async ({ showcase, hostCopy, virtualFiles }) => {
    const entry = posix.relative(posix.dirname(showcase.documentation), showcase.entry);
    const reads = [virtualFiles.some((file) => file.path === showcase.entry) ? showcase.documentation : showcase.entry];
    // A build step: its syntax checked; a failure is an error of the build itself, with no recording
    const syntax = await hostCopy.run('node', ['--check', entry], { phase: 'build' });
    if (syntax.recording.exitCode !== 0) return { reads, issues: [{ severity: 'error', message: syntax.stderr.split('\n').find((line) => line.startsWith('SyntaxError')) ?? 'syntax error' }] };
    const run = await hostCopy.run('node', [entry], { phase: 'run', timeLimit: 2000, env: { NODE_RUN_OWN: 'own' } });
    return { reads, checks: ['syntax'], recording: run.recording };
  },
});
