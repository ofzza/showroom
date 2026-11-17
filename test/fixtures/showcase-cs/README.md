# C#

Showcases recorded by the `cs` showcase adapter, which pass.

A code block referencing the host's project, and its environment:

```cs showcase=cs
#:project src/Numbers/Numbers.csproj
Console.WriteLine($"thousands {Numbers.Format.Thousands(1234567)}");
Console.WriteLine($"cwd {Path.GetFileName(Environment.CurrentDirectory)}");
Console.WriteLine($"virtual {File.Exists("README.showcase-1.cs")}");
Console.WriteLine($"args {args.Length}");
```

A named one, with a warning:

```cs showcase=cs file=hello.cs
int unused = 1;
Console.WriteLine("hello");
```

A [linked one](./docs/linked.cs 'showcase=cs').
