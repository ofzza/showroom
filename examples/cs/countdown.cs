// Counts down to the new year from a fixed moment, so that its recording is the same on every build
#:property InvariantGlobalization=true

var now = new DateTime(2026, 12, 31, 23, 59, 57);
var newYear = new DateTime(now.Year + 1, 1, 1);

Console.WriteLine($"It is {now:yyyy-MM-dd HH:mm:ss}");
for (var left = newYear - now; left > TimeSpan.Zero; left -= TimeSpan.FromSeconds(1))
{
    Console.WriteLine($"{left.TotalSeconds}...");
}
Console.WriteLine($"Happy {newYear.Year}!");
