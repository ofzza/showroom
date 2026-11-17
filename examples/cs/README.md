# `chrono`

> Made-up C# programs about time and numbers, and the `cs` showcase adapter's example: this is how a host repository could document C# with `showroom`, each showcase built and run as a .NET file-based app when the showroom is built, its output recorded. See [`README.md` › `cs` showcases](../../README.md#cs-showcases) for what a `cs` showcase can do.
>
> This example is part of this repository's own showroom: see its recordings in [the published showroom](https://ofzza.github.io/showroom/#/examples/cs/README.md), or preview it from a clone of this repository with the .NET SDK 10 installed, `npm ci`, then `npm start -- serve`, at its root. Read anywhere else (e.g. on GitHub), each showcase is only its code block or its link.

Each showcase here is a program of its own, with no project around it: a file-based app, one `.cs` file with top-level statements, its settings in `#:` directives at its top. A host repository's showcases would more often use its own code, with a `#:project` directive naming its project (see [`README.md` › `cs` showcases](../../README.md#cs-showcases)).

## A countdown

A linked showcase, shown as a block: [`countdown.cs`](./countdown.cs) counts down to the new year from a fixed moment. A `cs` showcase shows its code and its recorded output by default; its `#:property InvariantGlobalization=true` directive sets an MSBuild property of its own build, as a project file would.

[A countdown to the new year](./countdown.cs 'showcase=cs block include=markdown')

## Durations

A code block showcase: its code is its own virtual file, `README.showcase-2.cs`, built in the host copy beside this file.

```cs showcase=cs include=markdown
var sprint = TimeSpan.FromDays(14);
var meeting = TimeSpan.FromMinutes(90);

Console.WriteLine($"A sprint: {sprint.TotalHours} hours");
Console.WriteLine($"A meeting: {meeting:h\\:mm}");
Console.WriteLine($"Meetings in a sprint, back to back: {sprint / meeting:0.##}");
```

## Rounding

Rounding a midpoint, in each of .NET's ways, with a record and a `switch` expression; `CultureInfo.InvariantCulture` keeps the numbers' format the same on every machine.

```cs showcase=cs include=markdown
using System.Globalization;

foreach (var value in new[] { 2.5m, -2.5m, 3.5m })
{
    var rounded = new Rounded(value, Math.Round(value), Math.Round(value, MidpointRounding.AwayFromZero), Math.Floor(value));
    Console.WriteLine(rounded.Describe());
}

record Rounded(decimal Value, decimal ToEven, decimal AwayFromZero, decimal Floor)
{
    public string Describe() =>
        string.Create(CultureInfo.InvariantCulture, $"{Value}: to even {ToEven}, away from zero {AwayFromZero}, floor {Floor} ({Kind})");

    private string Kind => ToEven switch
    {
        > 0 => "positive",
        < 0 => "negative",
        _ => "zero",
    };
}
```
