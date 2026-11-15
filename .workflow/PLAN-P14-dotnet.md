# _`P14`_ The .NET stack adapter

implemented 2026-11-15 (option chosen: "Approve and commit (Rec.)"); approved 2026-11-15 (option chosen: "Approve (Rec.)"), without a zero-context review

## Goals

_`S11`_ (SPEC.md): the built-in `dotnet` stack adapter (_`D486`_), reading the project information from the project file named by `showroom.json`'s new `project` key (_`D487`_), statically, as XML (_`D488`_), with its code patterns (_`D489`_) and defaults (_`D490`_).

No child segments.

## Decisions

- _`D491`_ (`live`; option chosen: "sax (Rec.)", re-asked after the agent's correction that `fast-xml-parser` 5.12.1 has 5 runtime dependencies and is about 1.3 MB unpacked): **XML is parsed with `sax`**, a new production dependency (1.6.1: about 62 KB, no dependencies, BlueOak-1.0.0), in strict mode. Its types come from `@types/sax`, a new devDependency, as `sax` is only used internally and never appears in an exported type. Rejected: `fast-xml-parser` (its weight, for every consumer), and a hand-written reader (comments, CDATA, entities and attribute quoting to get right ourselves).
- _`D492`_ (`live`): **`StackAdapter.readProject(root, project?)`** gets an optional second parameter: the configured `project` path, relative to the root. The interface stays backward compatible. The `typescript` stack adapter reads `project ?? 'package.json'`, and its error messages name the file it read. `Configuration` gains `project?: string` (a non-empty string, like `sourceRoot`). `check()` resolves it against the root first, and reports a path outside the host repository as an error at `showroom.json`, as it does for `sourceRoot`, without calling the stack adapter.
- _`D493`_ (`live`): **What the `dotnet` stack adapter reads** (_`D488`_):
  - Without `project`, it throws: "The dotnet stack adapter needs "project" in showroom.json: the path of a .csproj, .fsproj or .vbproj". A different extension is an error naming the three.
  - It looks for `Directory.Build.props` by its exact name, in the project file's folder and then each parent folder up to the root (never above it), and reads the first one it finds.
  - It collects the direct children of `<Project>`'s `<PropertyGroup>`s, skipping any group or property with a `Condition` attribute. Values are trimmed, an empty value unsets the property, and a later value overrides an earlier one, in document order: the `Directory.Build.props` first, then the project file.
  - `$(Name)` is resolved when its property is set (MSBuild's order of evaluation), against the properties set so far and the reserved `MSBuildProjectName` (the project file's name without its extension). Property names are matched case-insensitively, as MSBuild matches them. A value still holding `$(` after this is dropped, so property functions (`$([System.…])`) and unknown properties both drop their value.
  - A file that isn't well-formed XML throws an error naming the file and `sax`'s message (its line and column).
- _`D494`_ (`live`): **Fixtures**: a `dotnet` fixture with a root `Directory.Build.props` and a solution of a C# and an F# project. Its `obj/` and `bin/` folders hold one committed file each, as this repository's `.gitignore` ignores neither. The error cases are written into scratch folders (`createScratchFolder()`), as each is a single small file.

## Steps

1. **Dependencies**: `npm install sax` and `npm install --save-dev @types/sax`, both local installs.
2. **The configuration and the interface**:
   - `src/configuration/`: the `project` key and its check;
   - `src/adapters/stack/`: `readProject(root, project?)`, and `dotnet` in the registry;
   - `src/adapters/stack/typescript/`: honouring `project`;
   - `src/cli/check/`: resolving `project`, and passing it on.
3. **The `dotnet` stack adapter**: `src/adapters/stack/dotnet/index.ts`, the `DotNetStackAdapter` class (_`D486`_, _`D489`_, _`D490`_, _`D493`_), re-exported through `src/adapters/stack/index.ts`.
4. **Fixtures and tests**:
   - `test/fixtures/dotnet/` (_`D494`_): `showroom.json` `{ "stack": "dotnet", "project": "src/Numbers/Numbers.csproj" }`; `Numbers.slnx`; a root `Directory.Build.props` (`Authors`, `VersionPrefix`, `RepositoryUrl`, a conditioned `VersionSuffix`); `src/Numbers/Numbers.csproj` (`PackageId` as `$(MSBuildProjectName).Core`, `Description`, `PackageLicenseExpression`, `PackageProjectUrl` built from `$(RepositoryUrl)`, a property inside a conditioned group); `src/Numbers/Format.cs`, `src/Numbers/Views/Counter.razor`, `src/Numbers.FSharp/Numbers.FSharp.fsproj` with `Library.fs`; `src/Numbers/obj/project.assets.json` and `src/Numbers/bin/Numbers.dll.txt`; `README.md` at the root and in `src/Numbers/`.
   - `src/adapters/stack/dotnet/index.test.ts`:
     - the fixture's project information and its patterns;
     - in scratch folders: no `project`; a wrong extension; a missing file; invalid XML, in the project and in the props; a nearer `Directory.Build.props` shadowing the root one; none above the root; `AssemblyName` and the file name as fallbacks; `Version` over `VersionPrefix`; an unresolved reference and a property function dropped; case-insensitive names.
   - `src/adapters/stack/typescript/index.test.ts`: a `project` naming another JSON file.
   - `src/adapters/stack/index.test.ts`: `dotnet` among the names.
   - `src/configuration/index.test.ts`: `project` accepted, and an empty or non-string `project` rejected.
   - `src/cli/check/index.test.ts`: `check()` on the fixture (project information, code file index without `bin`/`obj`, both READMEs), and a `project` outside the root.
   - `src/cli/build/index.e2e.test.ts`: a `build()` of a copy of the fixture.
   - `src/index.test.ts`: `DotNetStackAdapter` in the export list.
5. **Documentation**:
   - `README.md`:
     - the `project` row in the configuration table;
     - the Stack adapters table's `dotnet` row, and a paragraph on what it reads (the properties, `Directory.Build.props`, what's skipped, _`K20`_'s limits);
     - line 53, which says `typescript` is the only stack adapter;
     - `DotNetStackAdapter` in the Usage exports.

     Any new code sample is checked with `tsc`.

   - `AGENTS.md`:
     - Layout: `adapters/stack/dotnet/`;
     - Exports: `DotNetStackAdapter`, and `readProject`'s parameter;
     - Testing: the `dotnet` fixture;
     - Gotchas: "Anything in `dependencies` is installed for every consumer" stays as it is, as `sax` is small and has no dependencies.
   - `CONTRIBUTE.md`:
     - the project structure;
     - the architecture paragraph (the stack adapter reads the configured `project` file);
     - the Glossary's "Project information" entry: read by the stack adapter from `package.json` or the configured project file.
6. **Verification**:
   - `npm run ci` is green.
   - `npm start -- check --root test/fixtures/dotnet` prints the expected project information.
   - The user's check: a copy of `../dotnetschema` in `./.workflow/.temp/dotnet-check/` (its git-ignored and build folders left out), given a `showroom.json` with `{ "stack": "dotnet", "project": "src/DotNetSchema/DotNetSchema.csproj" }`, then `check`, then `serve`. Its home page should show DotNetSchema `0.1.0-alpha.4`, its description, MIT, ofzza, and the GitHub URLs. `../dotnetschema` itself is never edited.
   - The dogfood `serve` of this repository is started before the checkpoint.

## Open points

- None yet.
