/**
 * .NET stack adapter: covers C#, F# and VB host repositories, reading the project file the configuration names (and the nearest
 * `Directory.Build.props`) statically, as XML, with no .NET SDK
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import sax from 'sax';
import type { ProjectInformation } from '../../../host/index.js';
import type { StackAdapter } from '../index.js';

// #region Constants

/**
 * Extensions of the project files the `dotnet` stack adapter reads, lower case
 */
const _PROJECT_EXTENSIONS: readonly string[] = ['.csproj', '.fsproj', '.vbproj'];

/**
 * Name of the MSBuild file whose properties every project below its folder imports first
 */
const _DIRECTORY_BUILD_PROPS = 'Directory.Build.props';

/**
 * Reserved MSBuild property holding the project file's name without its extension, lower case (property names are case-insensitive)
 */
const _PROJECT_NAME_PROPERTY = 'msbuildprojectname';

/**
 * A property reference, `$(Name)`
 */
const _PROPERTY_REFERENCE = /\$\(([A-Za-z_][A-Za-z0-9_.-]*)\)/g;

// #endregion

// #region Stack adapter

/**
 * Represents the .NET stack adapter
 */
export class DotNetStackAdapter implements StackAdapter {
  public readonly name = 'dotnet';
  public readonly sourceRoot = 'src';
  public readonly ignore: readonly string[] = ['.git', '.vs', 'bin', 'obj', 'artifacts', 'TestResults'];
  public readonly code: readonly string[] = ['*.cs', '*.csx', '*.fs', '*.fsi', '*.fsx', '*.vb', '*.razor', '*.cshtml'];
  public readonly documentation: readonly string[] = [];

  /**
   * Reads the project information from the project file the configuration names, after the nearest `Directory.Build.props`: only properties of
   * `<PropertyGroup>`s with no `Condition` on either, with their `$(Name)` references resolved
   * @param root Path of the host repository's root
   * @param project Path of the project file (`.csproj`, `.fsproj` or `.vbproj`), relative to the root; required
   * @returns Project information; throws an error explaining why it can't be read
   */
  public async readProject(root: string, project?: string): Promise<Partial<ProjectInformation>> {
    // Check the project file's path
    if (project === undefined) {
      throw new Error(`The dotnet stack adapter needs "project": "path" in showroom.json: the path of a ${_listExtensions()}`);
    }
    const extension = extname(project);
    if (!_PROJECT_EXTENSIONS.includes(extension.toLowerCase())) {
      throw new Error(`"project": "path" must be the path of a ${_listExtensions()}, not ${project}`);
    }
    const projectPath = resolve(root, project);
    const projectName = basename(projectPath, extension);

    // Read the project file, then the nearest Directory.Build.props, before collecting their properties in MSBuild's order
    const projectText = await _readText(projectPath, `${project} not found in ${root}`);
    const propsPath = await _findDirectoryBuildProps(root, dirname(projectPath));
    const properties = new Map<string, string>([[_PROJECT_NAME_PROPERTY, projectName]]);
    if (propsPath) {
      const propsName = _toPosix(relative(resolve(root), propsPath));
      _collectProperties(await _readText(propsPath, `${propsName} can't be read`), propsName, properties);
    }
    _collectProperties(projectText, project, properties);

    // Collect the project information
    const get = (name: string): string | undefined => properties.get(name.toLowerCase());
    const information: ProjectInformation = { name: get('PackageId') ?? get('AssemblyName') ?? projectName };
    const prefix = get('VersionPrefix');
    const suffix = get('VersionSuffix');
    const version = get('Version') ?? (prefix && suffix ? `${prefix}-${suffix}` : prefix);
    if (version) information.version = version;
    const fields: [keyof ProjectInformation, string][] = [
      ['description', 'Description'],
      ['license', 'PackageLicenseExpression'],
      ['author', 'Authors'],
      ['homepage', 'PackageProjectUrl'],
      ['repository', 'RepositoryUrl'],
    ];
    for (const [field, property] of fields) {
      const value = get(property);
      if (value) information[field] = value;
    }
    return information;
  }
}

// #endregion

// #region Reading MSBuild files

/**
 * Reads a text file, without a leading byte order mark
 * @param path Path of the file
 * @param message Error message if it can't be read
 * @returns The file's text
 */
async function _readText(path: string, message: string): Promise<string> {
  try {
    return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  } catch (err) {
    throw new Error(message, { cause: err });
  }
}

/**
 * Finds the `Directory.Build.props` MSBuild imports for a project: the first one in its folder or a parent folder, never above the root
 * @param root Path of the host repository's root
 * @param folder Path of the project file's folder
 * @returns Path of the `Directory.Build.props`, or undefined if there is none
 */
async function _findDirectoryBuildProps(root: string, folder: string): Promise<string | undefined> {
  const top = resolve(root);
  let current = resolve(folder);
  for (;;) {
    const path = relative(top, current);
    if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return undefined;
    const candidate = join(current, _DIRECTORY_BUILD_PROPS);
    if (await _isFile(candidate)) return candidate;
    if (current === top) return undefined;
    current = dirname(current);
  }
}

/**
 * Collects the properties of an MSBuild file's unconditional `<PropertyGroup>`s, in document order, into the properties collected so far: each
 * value's `$(Name)` references are resolved against those, a value still holding a reference is dropped, and an empty one unsets its property
 * @param text The MSBuild file's XML
 * @param name Name of the file, for error messages
 * @param properties Properties collected so far, by lower case name; updated
 */
function _collectProperties(text: string, name: string, properties: Map<string, string>): void {
  const parser = sax.parser(true, { trim: false, normalize: false });
  const elements: { name: string; conditioned: boolean }[] = [];
  let value = '';
  let rooted = false;
  parser.onopentag = (tag) => {
    rooted = true;
    const conditioned = Object.keys(tag.attributes).some((attribute) => attribute.toLowerCase() === 'condition');
    elements.push({ name: tag.name, conditioned });
    if (elements.length === 1 && tag.name !== 'Project') throw new Error(`its root element is <${tag.name}>, not <Project>`);
    if (elements.length === 3) value = '';
  };
  parser.ontext = (text) => {
    if (elements.length === 3) value += text;
  };
  parser.oncdata = parser.ontext;
  parser.onclosetag = () => {
    if (elements.length === 3 && elements[1].name === 'PropertyGroup' && !elements[1].conditioned && !elements[2].conditioned) {
      _setProperty(properties, elements[2].name, value.trim());
    }
    elements.pop();
  };
  try {
    parser.write(text).close();
    // sax ends a document without an error at a root element left open, or with none at all
    if (elements.length) throw new Error(`unclosed element <${elements[elements.length - 1].name}>`);
    if (!rooted) throw new Error('no <Project> root element');
  } catch (err) {
    throw new Error(`${name} is not a valid MSBuild file: ${(err as Error).message.replace(/\s*\n\s*/g, ', ')}`, { cause: err });
  }
}

/**
 * Sets a property, its value's references resolved; drops it if one can't be, and unsets it if the value is empty. The reserved
 * `MSBuildProjectName` is never overwritten, as MSBuild refuses to
 * @param properties Properties collected so far, by lower case name; updated
 * @param name Name of the property
 * @param value Its value, as written
 */
function _setProperty(properties: Map<string, string>, name: string, value: string): void {
  const key = name.toLowerCase();
  if (key === _PROJECT_NAME_PROPERTY) return;
  const resolved = value.replace(_PROPERTY_REFERENCE, (reference, referenced: string) => properties.get(referenced.toLowerCase()) ?? reference);
  if (resolved.includes('$(')) return;
  if (resolved) properties.set(key, resolved);
  else properties.delete(key);
}

// #endregion

// #region Helpers

/**
 * Lists the project file extensions, for error messages
 * @returns The extensions, e.g. `.csproj, .fsproj or .vbproj`
 */
function _listExtensions(): string {
  return `${_PROJECT_EXTENSIONS.slice(0, -1).join(', ')} or ${_PROJECT_EXTENSIONS[_PROJECT_EXTENSIONS.length - 1]}`;
}

/**
 * Checks if a path is a file
 * @param path Path to check
 * @returns True if it is a file
 */
async function _isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Converts a path to forward slashes
 * @param path Path to convert
 * @returns The path, with forward slashes
 */
function _toPosix(path: string): string {
  return path.split('\\').join('/');
}

// #endregion
