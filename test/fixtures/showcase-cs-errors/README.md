# C# errors

Showcases recorded by the `cs` showcase adapter, which fail.

A compiler error:

```cs showcase=cs
Console.WriteLine("never");
int number = "text";
```

An unhandled exception:

```cs showcase=cs
Console.WriteLine("before");
throw new InvalidOperationException("boom");
```

Standard error output:

```cs showcase=cs
Console.Error.WriteLine("to standard error");
```

A non-zero exit code:

```cs showcase=cs
Console.WriteLine("exiting");
return 3;
```

An error in the host's project, whose warning isn't the showcase's:

```cs showcase=cs
#:project src/Broken
Console.WriteLine(Broken.Broken.Get());
```
