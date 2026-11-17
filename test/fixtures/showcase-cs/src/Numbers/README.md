# Numbers

A showcase in the project's own folder, whose virtual file the project must not compile (K28):

```cs showcase=cs
#:project .
Console.WriteLine($"inside {Numbers.Format.Thousands(1000)}");
```
