# _`S16`_ The C# showcase adapter

approved 2026-11-17 (option chosen: "Approve and commit (Rec.)"), after its zero-context review; wording fixes 2026-11-17 (references to the draft's questions replaced by the decisions that settled them; _`D712`_'s "host check")

A built-in showcase adapter building and recording C# showcases (_`S15`_ (SPEC.md)) with .NET's file-based apps. Takes _`S11`_'s idea of "a showcase adapter running .NET code" (SPEC.md), as a recorded showcase rather than in the browser. From the discussion of 2026-11-17 (the user: "Since C# now allows running project-less codefiles, how hard would it be to try and build and run those examples and capure their output?"). Its choices were settled as _`D712`_–_`D718`_, and its zero-context review of 2026-11-17 as _`D737`_–_`D739`_.

## Decisions

- _`D691`_ (`live`, refined by _`D712`_, _`D713`_, _`D714`_, _`D716`_, _`D738`_; the user's question, quoted above): **A built-in C# showcase adapter** builds a C# showcase with the host's .NET SDK as a file-based app (.NET 10 and later: one `.cs` file built and run with no project, its references given by `#:` directives at its top: `#:package`, `#:project`, `#:sdk`, `#:property`), in the host copy (_`D686`_ (SPEC-S15-recorded-showcases.md)), reports the compiler's errors and warnings at their lines as its build's issues, and records the built showcase (_`D683`_ (SPEC-S15-recorded-showcases.md)). Compiling is its type check, so its status marks are `build` and `runtime` (as _`D507`_ (SPEC-S12-showcase-views.md) foresaw: the user: "I forgot that C# would build, you're right it would show `build ✓`").
- _`D692`_ (`live`, refined by _`D717`_; the user: "The spec would need updating, yes"): **The C# showcase adapter needs the .NET SDK** wherever `showroom` builds its showcases (the user's machine, the host's CI). _`D488`_ (SPEC.md) is unchanged: the `dotnet` stack adapter still reads MSBuild files statically, needing only Node, so a .NET host repository with no C# showcases needs no SDK.

### The draft's choices

- _`D712`_ (`live`; refines _`D691`_; Q16 (a), the user: "Agreed with all your points!"): **The C# showcase adapter stands on its own**: a marker names it in any host repository, whatever its stack adapter (C# examples in a TypeScript library's documentation work too), and it finds the host's .NET SDK itself, as the `ts`, `react` and `angular` showcase adapters find the host's tools; the `dotnet` stack adapter keeps reading project information statically. What links them is general: `ShowcaseBuildRequest` and the host check (`ShowcaseAdapter.check?()`) gain the configured `project` and the stack adapter's name, for every showcase adapter. Rejected: working only with `stack: dotnet`.
- _`D713`_ (`live`; refines _`D691`_; Q17 (a), the user: "Agreed with all your points!"): **The C# showcase adapter is named `cs`** (`showcase=cs`), by its entry point's extension, as `ts` is. Rejected: `csharp`, `dotnet` (file-based apps are C# only).
- _`D714`_ (`live`, changed by _`D739`_; refines _`D691`_; Q18 (a), the user: "Agreed with all your points!"): **A showcase references the host's project explicitly**, with its own `#:project <path>`, so what is shown is exactly what is built, and runs as is with `dotnet run` in the host repository. Rejected: adding a `#:project` to the configured `project` when a showcase has none (shorter, but not built as shown).
- _`D715`_ (`live`; changes _`D501`_ (SPEC-S12-showcase-views.md); Q19 (a), the user: "Agreed with all your points!"): **The `cs` showcase adapter's default views are `source,console`**, as the `ts` one's: its recorded output is what it shows. Rejected: `source`, as _`D501`_ foresaw.
- _`D716`_ (`live`; refines _`D691`_; Q20 (a), the user: "Agreed with all your points!"): **A `cs` showcase is one `.cs` file**; `include=` files are shown as tabs only, never compiled in; a showcase uses other code through `#:project` or `#:package`. Rejected: several files compiled together (no longer a file-based app).
- _`D717`_ (`live`, changed by _`D737`_; refines _`D692`_; Q21 (a), the user: "Agreed with all your points!"): **The `cs` showcase adapter's host check is an error** when `dotnet` isn't on the `PATH`, or when the SDK it selects in the host copy (honouring the host's `global.json`) is older than .NET 10, naming what it found. Rejected: a warning, with its showcases not built.
- _`D718`_ (`live`; changes _`D307`_ (SPEC.md); Q22, option chosen: "Required everywhere (Rec.)"): **This repository requires the .NET SDK 10** for the `cs` showcase adapter's `integration`, `e2e` and `serve` tests and its showcase adapter example (`examples/cs/`, checked by `ci:showroom`): CI installs it (`actions/setup-dotnet`, in `ci.yml` and `showroom.yml`), and contributors need it for `npm test` and `npm run ci`, as `CONTRIBUTE.md` and `AGENTS.md` say. The `cs` example is the one showcase adapter example depending on more than this repository's own npm dependencies. Rejected: required in CI only, with the tests needing it skipped locally when no SDK is found (a local `npm test` could then pass without testing C#).

### The zero-context review of 2026-11-17

- _`D737`_ (`live`; changes _`D717`_; review F4, option chosen: "Apply all (Rec.)"; the blocker of review 2026-11-17 (security #1, consistency #5)): **The `cs` showcase adapter's host check runs nothing from the host repository**: it runs only with trust (_`D722`_ (SPEC-S14-trust.md)), reads the host's `global.json` statically, and lists the installed SDKs with a `dotnet` resolved from the `PATH` (never from the host repository or the host copy), run in a folder of its own, outside both; a `global.json` naming SDK folders inside the host repository (`sdk.paths`) is noted, not run. The SDK that builds a showcase is selected by the build itself, in the host copy. Rejected: running `dotnet` in the host copy for the check (a `global.json` can select an SDK the host repository ships, and the check runs before anything is built).
- _`D738`_ (`live`; refines _`D691`_; review T5, the user: "Isn't this only an issue once the repo has been trusted? Can a tempered package be "injected" beforew that if we're already insisting even build needs to trust to run?", then option chosen: "User's global cache (Rec.)"): **A `cs` showcase restores its packages into the user's own NuGet cache** (`~/.nuget/packages`), as `dotnet run` in the host repository would: nothing is restored without trust, and trusted code could write there itself, so a folder of its own would be tidiness, not security. `README.md` says that a trusted host repository's packages land there. Rejected: a fresh folder per run; a cache of `showroom`'s own.
- _`D739`_ (`live`; changes _`D714`_; review F12, option chosen: "Apply all (Rec.)"): **Only a linked `cs` showcase runs as is with `dotnet run` in the host repository**: a code block's showcase is a virtual file, which exists only in the host copy.

## Review notes

- Moving _`D712`_ (the configured `project` and the stack adapter's name for every showcase adapter) to _`S15`_, with the other interface changes, was skipped (review 2026-11-17 #26, consistency): _`S16`_ is its first user; planning may implement it with _`S15`_.

## Open points

From the zero-context review of 2026-11-17:

- [x] _`O117`_ (resolved by _`D778`_ (PLAN-P20-recorded.md)) From review 2026-11-17 #11 (security), #13 (consistency), _`K27`_ (SPEC-pitfalls.md). Turning off what outlives a build: MSBuild's node reuse and server, the compiler and Razor servers (`-nodeReuse:false`, `MSBUILDDISABLENODEREUSE=1`, `DOTNET_CLI_USE_MSBUILD_SERVER=0`, `UseSharedCompilation=false`, `dotnet build-server`), and file-based apps' build output kept outside the host copy (where, how it grows, cleaning it; `TMPDIR` through the cleaned environment, so the tests stay inside this repository). For planning, with _`O110`_'s spike.
- [x] _`O118`_ (resolved by _`D781`_ (PLAN-P20-recorded.md)) From review 2026-11-17 #25 (consistency). Reserving `cs` in `PLANNED_SHOWCASE_ADAPTER_NAMES` (`src/adapters/showcase/registry/index.ts`) from the first release that ships _`S14`_ or _`S15`_, so a host's custom showcase adapter named `cs` gets a warning first; and which fence languages give `.cs` (`cs`, `csharp`, `c#`) for a named showcase (_`D532`_ (SPEC-S12-showcase-views.md)). For planning.

For the specification (the draft's choices):

- [x] _`O106`_ (resolved by _`D712`_, _`D714`_) From _`D691`_. Whether the C# showcase adapter depends on the `dotnet` stack adapter, and what a showcase adapter learns of the host's configured `project` (Q16, Q18).
- [x] _`O107`_ (resolved by _`D713`_, _`D715`_, _`D716`_) From _`D691`_. Its name, its default views, and its included files (Q17, Q19, Q20).
- [x] _`O108`_ (resolved by _`D717`_) From _`D692`_. Its host check: the SDK missing or older than .NET 10 (Q21).
- [x] _`O109`_ (resolved by _`D718`_) From _`D692`_, _`D304`_ (SPEC.md), _`D307`_ (SPEC.md). This repository's tests, CI and showcase adapter example needing the .NET SDK (Q22).

For planning:

- [x] _`O110`_ (resolved by the spike of 2026-11-17, its evidence under _`D778`_ (PLAN-P20-recorded.md)) From _`D691`_, _`K27`_ (SPEC-pitfalls.md). A spike: a C# showcase built and recorded in a host copy of `../dotnetschema` (or a fixture), with a `#:project` reference to the host's own project, a showcase in a folder under a `.csproj` (_`K28`_ (SPEC-pitfalls.md)), a compiler error and a run-time exception; the diagnostics' format, where `dotnet` keeps its build output, and the timings, cold and cached.
